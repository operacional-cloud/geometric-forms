-- =============================================================================
-- GEOMETRIC FORMS — FASE 1: Planos & limites (sem billing)
-- =============================================================================
-- Adiciona a camada de planos do SaaS:
--   - public.plans: catálogo de planos com limites CONFIGURÁVEIS no banco
--     (editáveis por UPDATE, sem deploy). NULL em um limite = ilimitado.
--   - tenants.plan_id: vínculo do tenant ao plano.
--   - tenants.status: estende pra incluir 'suspended'.
--   - seed de 4 planos placeholder: interno / free / starter / pro.
--   - tenants existentes caem em 'interno' (cortesia) — ninguém fica sem plano.
--
-- Idempotente. NÃO mexe em cobrança/Asaas/MCP (próxima fase).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Tabela de planos
-- -----------------------------------------------------------------------------
create table if not exists public.plans (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,
  name             text not null,
  -- Preço placeholder (em centavos) — billing é Fase 2. 0 = cortesia/grátis.
  price_cents      integer not null default 0,
  currency         text not null default 'BRL',
  -- Limites configuráveis. NULL = ILIMITADO.
  max_formularios  integer,
  max_leads_mes    integer,
  -- Flag de feature do MCP (a implementação do MCP em si é Fase 2+).
  mcp_habilitado   boolean not null default false,
  -- Features extras arbitrárias (ex.: { "whatsapp": true, "ai_attendance": false }).
  features         jsonb   not null default '{}'::jsonb,
  -- Catálogo: visível/ordenável na futura tela de planos.
  is_active        boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

comment on table  public.plans is 'Catálogo de planos do SaaS. Limites editáveis por UPDATE (sem deploy). NULL num limite = ilimitado.';
comment on column public.plans.max_formularios is 'Máx. de formulários que o tenant pode ter. NULL = ilimitado.';
comment on column public.plans.max_leads_mes   is 'Máx. de leads por mês corrente. NULL = ilimitado.';
comment on column public.plans.mcp_habilitado  is 'Se o plano libera o MCP (implementação do MCP é fase futura).';
comment on column public.plans.features        is 'Features extras arbitrárias em JSON, pra evoluir sem migration.';
comment on column public.plans.price_cents     is 'Preço placeholder em centavos. Billing é Fase 2 — ainda não cobra nada.';

-- updated_at automático (reusa a function public.set_updated_at do schema inicial)
drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2) Seed de 4 planos placeholder (ajuste os valores depois)
--    Idempotente: on conflict (slug) do nothing — não sobrescreve ajustes seus.
-- -----------------------------------------------------------------------------
insert into public.plans (slug, name, price_cents, max_formularios, max_leads_mes, mcp_habilitado, features, sort_order)
values
  -- interno: cortesia pros clientes da agência. Ilimitado, sem cobrança.
  ('interno',  'Interno (cortesia)', 0,      null, null, true,  '{"cortesia": true}'::jsonb, 0),
  -- free: porta de entrada, limites baixos.
  ('free',     'Free',               0,      1,    50,   false, '{}'::jsonb,                 1),
  -- starter: pago básico (preço placeholder).
  ('starter',  'Starter',            9700,   5,    1000, false, '{}'::jsonb,                 2),
  -- pro: pago avançado (preço placeholder), MCP liberado.
  ('pro',      'Pro',                29700,  50,   20000, true, '{}'::jsonb,                 3)
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- 3) Vínculo tenant -> plano  +  status estendido
-- -----------------------------------------------------------------------------
alter table public.tenants
  add column if not exists plan_id uuid references public.plans(id);

comment on column public.tenants.plan_id is 'Plano do tenant (FK -> plans). Fonte da verdade dos limites. A coluna legada tenants.plan (texto) é mantida só por compat.';

-- Estende o check de status pra aceitar 'suspended' (ativa / trial / suspensa / inactive-legado).
alter table public.tenants drop constraint if exists tenants_status_check;
alter table public.tenants
  add constraint tenants_status_check
  check (status in ('active','inactive','trial','suspended'));

-- -----------------------------------------------------------------------------
-- 4) Backfill: todo tenant existente cai no plano 'interno' (cortesia).
--    Ninguém fica sem plano. Não toca em quem já tiver plan_id.
-- -----------------------------------------------------------------------------
update public.tenants t
   set plan_id = p.id
  from public.plans p
 where p.slug = 'interno'
   and t.plan_id is null;

create index if not exists idx_tenants_plan_id on public.tenants(plan_id);

-- -----------------------------------------------------------------------------
-- 5) RLS — segue o mesmo padrão do schema inicial.
--    plans: catálogo legível por qualquer autenticado; escrita só admin.
--    service_role (backend/enforcement) bypassa RLS.
-- -----------------------------------------------------------------------------
alter table public.plans enable row level security;

drop policy if exists "plans_select_authenticated" on public.plans;
create policy "plans_select_authenticated" on public.plans
  for select to authenticated
  using (true);

drop policy if exists "plans_insert_admin" on public.plans;
create policy "plans_insert_admin" on public.plans
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "plans_update_admin" on public.plans;
create policy "plans_update_admin" on public.plans
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "plans_delete_admin" on public.plans;
create policy "plans_delete_admin" on public.plans
  for delete to authenticated
  using (public.is_admin());

-- =============================================================================
-- FIM — Fase 1 (planos & limites). Billing/Asaas/MCP/signup = Fase 2.
-- =============================================================================
