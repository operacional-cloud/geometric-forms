-- =============================================================================
-- Módulo Prospecção Ativa (Outbound) + Webhook por formulário
-- =============================================================================

-- forms.webhook_url --------------------------------------------------------
alter table public.forms
  add column if not exists webhook_url text;

comment on column public.forms.webhook_url is
  'URL chamada via POST a cada lead recebido nesse formulário (payload JSON com answers, score, qualified, etc).';

-- prospecting_leads --------------------------------------------------------
create table if not exists public.prospecting_leads (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  name            text,
  whatsapp_number text not null,
  keyword_used    text,
  status          text check (status in ('pending','sending','sent','failed')) default 'pending',
  source_url      text,
  metadata        jsonb default '{}'::jsonb,
  last_error      text,
  sent_at         timestamptz,
  created_at      timestamptz default now(),
  unique (tenant_id, whatsapp_number)
);

comment on table public.prospecting_leads is 'Leads capturados pelo módulo de prospecção ativa (scraping de WhatsApp público).';

create index if not exists idx_prospecting_leads_tenant_created on public.prospecting_leads(tenant_id, created_at desc);
create index if not exists idx_prospecting_leads_status        on public.prospecting_leads(tenant_id, status);
create index if not exists idx_prospecting_leads_keyword       on public.prospecting_leads(tenant_id, keyword_used);

-- prospecting_settings (uma linha por tenant) ------------------------------
create table if not exists public.prospecting_settings (
  tenant_id            uuid primary key references public.tenants(id) on delete cascade,
  max_leads_per_day    integer default 20,
  min_delay_minutes    integer default 3,
  max_delay_minutes    integer default 10,
  whatsapp_instances   jsonb default '[]'::jsonb,
  ai_script            text,
  updated_at           timestamptz default now()
);

comment on table public.prospecting_settings is
  'Configurações de disparo da prospecção: limites diários, delays, números no rodízio e script da IA.';

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.prospecting_leads     enable row level security;
alter table public.prospecting_settings  enable row level security;

-- prospecting_leads -------------------------------------------------------
drop policy if exists "prospecting_leads_select" on public.prospecting_leads;
create policy "prospecting_leads_select" on public.prospecting_leads
  for select to authenticated
  using (public.is_admin() or tenant_id = public.current_tenant_id());

drop policy if exists "prospecting_leads_insert" on public.prospecting_leads;
create policy "prospecting_leads_insert" on public.prospecting_leads
  for insert to authenticated
  with check (public.is_admin() or tenant_id = public.current_tenant_id());

drop policy if exists "prospecting_leads_update" on public.prospecting_leads;
create policy "prospecting_leads_update" on public.prospecting_leads
  for update to authenticated
  using (public.is_admin() or tenant_id = public.current_tenant_id())
  with check (public.is_admin() or tenant_id = public.current_tenant_id());

drop policy if exists "prospecting_leads_delete" on public.prospecting_leads;
create policy "prospecting_leads_delete" on public.prospecting_leads
  for delete to authenticated
  using (public.is_admin() or tenant_id = public.current_tenant_id());

-- prospecting_settings ----------------------------------------------------
drop policy if exists "prospecting_settings_all" on public.prospecting_settings;
create policy "prospecting_settings_all" on public.prospecting_settings
  for all to authenticated
  using (public.is_admin() or tenant_id = public.current_tenant_id())
  with check (public.is_admin() or tenant_id = public.current_tenant_id());

-- trigger updated_at
drop trigger if exists prospecting_settings_set_updated_at on public.prospecting_settings;
create trigger prospecting_settings_set_updated_at
  before update on public.prospecting_settings
  for each row execute function public.set_updated_at();
