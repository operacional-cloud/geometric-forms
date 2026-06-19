-- =============================================================================
-- Módulo Kanban + Métricas
-- =============================================================================
-- Colunas customizáveis por tenant + leads vinculados a colunas + valores de venda
-- =============================================================================

-- kanban_columns ------------------------------------------------------------
create table if not exists public.kanban_columns (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  color       text not null default '#10F2A0',
  position    integer not null default 0,
  kind        text not null default 'custom' check (kind in (
    'default', 'qualified', 'lost', 'won', 'custom'
  )),
  created_at  timestamptz default now()
);

comment on table public.kanban_columns is
  'Colunas customizáveis do kanban por tenant. kind=default recebe leads novos automaticamente.';

create index if not exists idx_kanban_columns_tenant on public.kanban_columns(tenant_id, position);

-- leads: novos campos + form_id nullable (pra suportar lead manual) ----------
alter table public.leads
  add column if not exists kanban_column_id uuid references public.kanban_columns(id) on delete set null,
  add column if not exists deal_value       numeric(12,2),
  add column if not exists notes            text,
  add column if not exists is_manual        boolean default false,
  add column if not exists manual_data      jsonb;

-- Permite leads sem form vinculado (entrada manual)
alter table public.leads alter column form_id drop not null;

create index if not exists idx_leads_kanban_col on public.leads(tenant_id, kanban_column_id);

-- prospecting_leads: mesmos campos pra unificar visualização ----------------
alter table public.prospecting_leads
  add column if not exists kanban_column_id uuid references public.kanban_columns(id) on delete set null,
  add column if not exists deal_value       numeric(12,2),
  add column if not exists notes            text;

create index if not exists idx_prosp_kanban_col on public.prospecting_leads(tenant_id, kanban_column_id);

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.kanban_columns enable row level security;

drop policy if exists "kanban_columns_all" on public.kanban_columns;
create policy "kanban_columns_all" on public.kanban_columns
  for all to authenticated
  using (public.is_admin() or tenant_id = public.current_tenant_id())
  with check (public.is_admin() or tenant_id = public.current_tenant_id());

-- =============================================================================
-- Helper: cria colunas default para um tenant
-- =============================================================================
create or replace function public.ensure_default_kanban_columns(p_tenant_id uuid)
returns void as $$
begin
  -- Se já tem alguma coluna pra esse tenant, não faz nada
  if exists (select 1 from public.kanban_columns where tenant_id = p_tenant_id) then
    return;
  end if;
  insert into public.kanban_columns (tenant_id, name, color, position, kind) values
    (p_tenant_id, 'Lead novo',         '#5EE2FF', 0, 'default'),
    (p_tenant_id, 'Em contato',        '#FFC857', 1, 'custom'),
    (p_tenant_id, 'Qualificado',       '#10F2A0', 2, 'qualified'),
    (p_tenant_id, 'Reunião marcada',   '#A66EFC', 3, 'custom'),
    (p_tenant_id, 'Venda fechada',     '#16855E', 4, 'won'),
    (p_tenant_id, 'Perdido',           '#FF6363', 5, 'lost');
end;
$$ language plpgsql security definer;
