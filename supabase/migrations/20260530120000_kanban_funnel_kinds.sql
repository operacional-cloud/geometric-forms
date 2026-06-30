-- =============================================================================
-- KANBAN — funil completo (kinds de etapa) + colunas para o cliente preencher
-- =============================================================================
-- Problema: o check de kanban_columns.kind só aceitava
--   default/qualified/lost/won/custom
-- então "Reunião marcada" e "Em contato" eram criadas como 'custom' (métricas
-- não contavam) e NÃO existiam colunas para Reunião realizada / No show /
-- Proposta / Follow up. O código de métricas já bucketiza por esses kinds.
--
-- Este migration:
--   1) amplia o check do kind p/ todos os kinds usados no código;
--   2) atualiza ensure_default_kanban_columns p/ semear o funil completo;
--   3) backfill NÃO-destrutivo nos tenants existentes: corrige kinds e insere
--      as etapas que faltam, logo após "Reunião marcada", preservando a ordem
--      relativa das demais colunas.
-- =============================================================================

-- 1) check do kind com todos os kinds do funil ------------------------------
alter table public.kanban_columns drop constraint if exists kanban_columns_kind_check;
alter table public.kanban_columns
  add constraint kanban_columns_kind_check check (kind in (
    'default', 'qualified', 'em_contato', 'meeting_scheduled', 'meeting_held',
    'no_show', 'proposal', 'followup', 'won', 'lost', 'custom'
  ));

-- 2) seed do funil completo (novos tenants) ---------------------------------
create or replace function public.ensure_default_kanban_columns(p_tenant_id uuid)
returns void as $$
begin
  if exists (select 1 from public.kanban_columns where tenant_id = p_tenant_id) then
    return;
  end if;
  insert into public.kanban_columns (tenant_id, name, color, position, kind) values
    (p_tenant_id, 'Lead novo',          '#5EE2FF', 0, 'default'),
    (p_tenant_id, 'Em contato',         '#FFC857', 1, 'em_contato'),
    (p_tenant_id, 'Qualificado',        '#10F2A0', 2, 'qualified'),
    (p_tenant_id, 'Reunião marcada',    '#A66EFC', 3, 'meeting_scheduled'),
    (p_tenant_id, 'Reunião realizada',  '#18D2FF', 4, 'meeting_held'),
    (p_tenant_id, 'No show',            '#FF8B8B', 5, 'no_show'),
    (p_tenant_id, 'Proposta enviada',   '#FFC857', 6, 'proposal'),
    (p_tenant_id, 'Follow up',          '#A8B7BB', 7, 'followup'),
    (p_tenant_id, 'Venda fechada',      '#16855E', 8, 'won'),
    (p_tenant_id, 'Perdido',            '#FF6363', 9, 'lost');
end;
$$ language plpgsql security definer;

-- 3a) corrige kinds das colunas já existentes (só onde ainda está 'custom') --
update public.kanban_columns set kind = 'em_contato'
  where kind = 'custom' and lower(name) = 'em contato';
update public.kanban_columns set kind = 'meeting_scheduled'
  where kind = 'custom' and lower(name) = 'reunião marcada';

-- 3b) insere as etapas que faltam em cada tenant, logo após "Reunião marcada"
do $$
declare
  t        record;
  base_pos integer;
  stage    record;
begin
  for t in (select distinct tenant_id from public.kanban_columns) loop
    -- referência: posição da coluna meeting_scheduled; senão, a última
    select position into base_pos
      from public.kanban_columns
      where tenant_id = t.tenant_id and kind = 'meeting_scheduled'
      order by position limit 1;
    if base_pos is null then
      select coalesce(max(position), -1) into base_pos
        from public.kanban_columns where tenant_id = t.tenant_id;
    end if;

    for stage in (
      select * from (values
        ('meeting_held', 'Reunião realizada', '#18D2FF'),
        ('no_show',      'No show',           '#FF8B8B'),
        ('proposal',     'Proposta enviada',  '#FFC857'),
        ('followup',     'Follow up',         '#A8B7BB')
      ) as s(kind, name, color)
    ) loop
      if not exists (
        select 1 from public.kanban_columns
        where tenant_id = t.tenant_id and kind = stage.kind
      ) then
        base_pos := base_pos + 1;
        update public.kanban_columns set position = position + 1
          where tenant_id = t.tenant_id and position >= base_pos;
        insert into public.kanban_columns (tenant_id, name, color, position, kind)
          values (t.tenant_id, stage.name, stage.color, base_pos, stage.kind);
      end if;
    end loop;
  end loop;
end $$;
