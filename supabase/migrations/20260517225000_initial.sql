-- =============================================================================
-- GEOMETRIC FORMS — Schema completo (MVP)
-- =============================================================================
-- SaaS multi-tenant para qualificação de leads que substitui Lead Ads do Meta.
-- Cole este arquivo inteiro no SQL Editor do Supabase, ou aplique via Supabase
-- CLI (uma cópia idêntica vive em supabase/migrations/).
--
-- Roda de cima a baixo. Idempotente (DROP ... IF EXISTS antes de cada CREATE
-- de policy/trigger/function).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensões
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- =============================================================================
-- TABELAS
-- =============================================================================

-- tenants ---------------------------------------------------------------------
create table if not exists public.tenants (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text unique not null,
  logo_url        text,
  primary_color   text default '#000000',
  secondary_color text default '#FFFFFF',
  status          text check (status in ('active','inactive','trial')) default 'trial',
  plan            text default 'starter',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

comment on table  public.tenants is 'Empresas clientes do SaaS Geometric Forms (consórcios, pousadas, academias, etc).';
comment on column public.tenants.slug            is 'Identificador usado em URLs públicas: /f/{tenant.slug}/{form.slug}.';
comment on column public.tenants.primary_color   is 'Cor primária da marca, usada no white-label do formulário público.';
comment on column public.tenants.secondary_color is 'Cor secundária da marca.';
comment on column public.tenants.status          is 'Estado da assinatura: active=pagante, inactive=suspenso, trial=avaliação.';
comment on column public.tenants.plan            is 'Plano contratado (starter, growth, scale, etc).';

-- profiles --------------------------------------------------------------------
-- Estende auth.users com role e vínculo ao tenant.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text check (role in ('admin','client','viewer')) not null default 'client',
  tenant_id   uuid references public.tenants(id) on delete cascade,
  created_at  timestamptz default now()
);

comment on table  public.profiles is 'Perfil estendido de cada usuário (auth.users). Define role e a qual tenant pertence.';
comment on column public.profiles.role      is 'admin = equipe Geometric (acesso global) / client = dono do negócio / viewer = leitura.';
comment on column public.profiles.tenant_id is 'Vínculo com o tenant. NULL para admins globais.';

-- forms -----------------------------------------------------------------------
create table if not exists public.forms (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants(id) on delete cascade,
  slug                     text not null,
  title                    text not null,
  description              text,
  fields                   jsonb not null default '[]'::jsonb,
  settings                 jsonb default '{}'::jsonb,
  meta_pixel_id            text,
  meta_access_token        text,
  meta_dataset_id          text,
  qualification_threshold  integer default 0,
  is_active                boolean default true,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now(),
  unique (tenant_id, slug)
);

comment on table  public.forms is 'Formulários criados por cada cliente. URL pública: /f/{tenant.slug}/{form.slug}.';
comment on column public.forms.slug                    is 'Slug único dentro do tenant. Compõe a URL pública.';
comment on column public.forms.settings                is 'Configurações livres em jsonb: { thank_you_url, redirect_meta, notify_emails, ... }.';
comment on column public.forms.meta_pixel_id           is 'ID do Meta Pixel injetado na página pública (front-end).';
comment on column public.forms.meta_access_token       is 'System User token do Meta para Conversions API (CRIPTOGRAFAR em produção).';
comment on column public.forms.meta_dataset_id         is 'Dataset ID do CAPI. Em geral igual ao pixel_id mas pode divergir.';
comment on column public.forms.qualification_threshold is 'Score mínimo para considerar lead qualificado (gatilho de envio CAPI).';
comment on column public.forms.fields is
$$Schema dinâmico de campos. Array de objetos:
[
  {
    "id": "field_uuid_1",
    "type": "text|email|phone|number|radio|checkbox|select|textarea",
    "label": "Qual sua renda mensal?",
    "placeholder": "Ex: 5000",
    "required": true,
    "order": 1,
    "options": [
      { "label": "Até R$ 3 mil",      "value": "ate_3k",   "score": 1 },
      { "label": "R$ 3 mil a R$ 10k", "value": "3k_10k",   "score": 5 },
      { "label": "Acima de R$ 10 mil","value": "acima_10k","score": 10 }
    ],
    "validation": { "min": 0, "max": 999999, "regex": null }
  }
]
Pontuação só se aplica a tipos com options (radio/checkbox/select).$$;

-- leads -----------------------------------------------------------------------
create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  form_id         uuid not null references public.forms(id) on delete cascade,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  answers         jsonb not null,
  lead_score      integer default 0,
  is_qualified    boolean default false,
  status          text check (status in ('novo','ia_atendendo','reuniao_agendada','ganho','perdido')) default 'novo',
  meta_fbc        text,
  meta_fbp        text,
  meta_click_id   text,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  utm_term        text,
  ip_address      inet,
  user_agent      text,
  capi_sent       boolean default false,
  capi_sent_at    timestamptz,
  capi_event_id   text,
  created_at      timestamptz default now()
);

comment on table  public.leads is 'Submissões dos consumidores finais. Cada linha é um lead qualificado-ou-não vindo do tráfego pago.';
comment on column public.leads.answers       is 'Respostas: { [field_id]: value | value[] }.';
comment on column public.leads.lead_score    is 'Soma das pontuações das opções escolhidas em campos com options.';
comment on column public.leads.is_qualified  is 'Calculado: lead_score >= form.qualification_threshold.';
comment on column public.leads.status        is 'Funil de atendimento: novo → ia_atendendo → reuniao_agendada → ganho/perdido.';
comment on column public.leads.meta_fbc      is 'Cookie _fbc do Meta Pixel (atribuição cross-device).';
comment on column public.leads.meta_fbp      is 'Cookie _fbp do Meta Pixel.';
comment on column public.leads.meta_click_id is 'fbclid da URL — Facebook click identifier.';
comment on column public.leads.capi_sent     is 'Indica se evento Lead foi enviado à Meta Conversions API.';
comment on column public.leads.capi_event_id is 'event_id usado na deduplicação Pixel ↔ CAPI. Deve ser o MESMO disparado pelo Pixel.';

-- form_events -----------------------------------------------------------------
create table if not exists public.form_events (
  id          uuid primary key default gen_random_uuid(),
  form_id     uuid not null references public.forms(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  event_type  text check (event_type in ('view','start','field_complete','submit','qualified')),
  session_id  text,
  metadata    jsonb default '{}'::jsonb,
  created_at  timestamptz default now()
);

comment on table  public.form_events is 'Eventos de funil capturados na página pública. Permite calcular taxa de view→start→submit→qualified.';
comment on column public.form_events.event_type is 'view = página vista / start = começou a digitar / field_complete = campo completado / submit = enviou / qualified = score acima do threshold.';
comment on column public.form_events.session_id is 'Identificador de sessão gerado no cliente para correlacionar eventos do mesmo visitante.';

-- =============================================================================
-- ÍNDICES
-- =============================================================================
create index if not exists idx_leads_tenant_created   on public.leads(tenant_id, created_at desc);
create index if not exists idx_leads_form_status      on public.leads(form_id, status);
create index if not exists idx_leads_form_qualified   on public.leads(form_id, is_qualified) where is_qualified = true;
create index if not exists idx_leads_capi_event       on public.leads(capi_event_id) where capi_event_id is not null;
create index if not exists idx_forms_tenant_active    on public.forms(tenant_id, is_active);
create index if not exists idx_events_form_type       on public.form_events(form_id, event_type, created_at);
create index if not exists idx_events_session         on public.form_events(session_id) where session_id is not null;
create index if not exists idx_profiles_tenant        on public.profiles(tenant_id) where tenant_id is not null;
create index if not exists idx_profiles_role          on public.profiles(role);

-- =============================================================================
-- FUNÇÕES HELPER (usadas em RLS)
-- =============================================================================

-- is_admin() — retorna true se o usuário autenticado tem role='admin'
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

comment on function public.is_admin() is 'Retorna true se o usuário autenticado tem role=admin em public.profiles.';

-- current_tenant_id() — retorna o tenant_id do usuário autenticado (NULL p/ admin)
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

comment on function public.current_tenant_id() is 'Retorna o tenant_id do profile do usuário autenticado. NULL para admin global.';

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- set_updated_at — mantém updated_at sincronizado em UPDATEs
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists tenants_set_updated_at on public.tenants;
create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

drop trigger if exists forms_set_updated_at on public.forms;
create trigger forms_set_updated_at
  before update on public.forms
  for each row execute function public.set_updated_at();

-- handle_new_user — ao criar usuário em auth.users, cria automaticamente o profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, tenant_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'client'),
    nullif(new.raw_user_meta_data ->> 'tenant_id', '')::uuid
  )
  on conflict (id) do nothing;
  return new;
end$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

comment on function public.handle_new_user() is 'Cria automaticamente public.profiles ao registrar usuário em auth.users. Lê full_name/role/tenant_id de raw_user_meta_data.';

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
-- Modelo:
--   - service_role (backend): bypassa RLS, usado em rotas /api/public/* e em
--     operações administrativas privilegiadas.
--   - authenticated (admin/client/viewer): policies abaixo isolam por tenant.
--   - anon (sem login): só pode INSERT em leads e form_events com checagem de
--     form ativo. SELECT em tenants/forms públicos é feito pelo backend via
--     service_role; anon nunca lista por padrão.
-- =============================================================================

alter table public.tenants     enable row level security;
alter table public.profiles    enable row level security;
alter table public.forms       enable row level security;
alter table public.leads       enable row level security;
alter table public.form_events enable row level security;

-- ---- tenants ----------------------------------------------------------------
drop policy if exists "tenants_select_admin_or_member" on public.tenants;
create policy "tenants_select_admin_or_member" on public.tenants
  for select to authenticated
  using (public.is_admin() or id = public.current_tenant_id());

drop policy if exists "tenants_insert_admin" on public.tenants;
create policy "tenants_insert_admin" on public.tenants
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "tenants_update_admin" on public.tenants;
create policy "tenants_update_admin" on public.tenants
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "tenants_delete_admin" on public.tenants;
create policy "tenants_delete_admin" on public.tenants
  for delete to authenticated
  using (public.is_admin());

-- ---- profiles ---------------------------------------------------------------
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_self_or_admin" on public.profiles;
create policy "profiles_insert_self_or_admin" on public.profiles
  for insert to authenticated
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (
    -- usuário comum não pode escalar role nem mudar tenant — isso é trabalho de admin
    public.is_admin()
    or (
      id = auth.uid()
      and role = (select role from public.profiles where id = auth.uid())
      and tenant_id is not distinct from (select tenant_id from public.profiles where id = auth.uid())
    )
  );

-- ---- forms ------------------------------------------------------------------
drop policy if exists "forms_select_admin_or_tenant" on public.forms;
create policy "forms_select_admin_or_tenant" on public.forms
  for select to authenticated
  using (public.is_admin() or tenant_id = public.current_tenant_id());

drop policy if exists "forms_insert_admin_or_tenant" on public.forms;
create policy "forms_insert_admin_or_tenant" on public.forms
  for insert to authenticated
  with check (public.is_admin() or tenant_id = public.current_tenant_id());

drop policy if exists "forms_update_admin_or_tenant" on public.forms;
create policy "forms_update_admin_or_tenant" on public.forms
  for update to authenticated
  using (public.is_admin() or tenant_id = public.current_tenant_id())
  with check (public.is_admin() or tenant_id = public.current_tenant_id());

drop policy if exists "forms_delete_admin_or_tenant" on public.forms;
create policy "forms_delete_admin_or_tenant" on public.forms
  for delete to authenticated
  using (public.is_admin() or tenant_id = public.current_tenant_id());

-- ---- leads ------------------------------------------------------------------
drop policy if exists "leads_select_admin_or_tenant" on public.leads;
create policy "leads_select_admin_or_tenant" on public.leads
  for select to authenticated
  using (public.is_admin() or tenant_id = public.current_tenant_id());

drop policy if exists "leads_update_admin_or_tenant" on public.leads;
create policy "leads_update_admin_or_tenant" on public.leads
  for update to authenticated
  using (public.is_admin() or tenant_id = public.current_tenant_id())
  with check (public.is_admin() or tenant_id = public.current_tenant_id());

drop policy if exists "leads_delete_admin_or_tenant" on public.leads;
create policy "leads_delete_admin_or_tenant" on public.leads
  for delete to authenticated
  using (public.is_admin() or tenant_id = public.current_tenant_id());

-- INSERT público em leads — anon e authenticated, mas form precisa estar ativo.
-- (O backend usa service_role nas rotas públicas; esta policy é defesa em
-- profundidade caso alguém chame Supabase direto com anon key.)
drop policy if exists "leads_insert_public" on public.leads;
create policy "leads_insert_public" on public.leads
  for insert to anon, authenticated
  with check (
    exists (
      select 1 from public.forms f
      where f.id = leads.form_id
        and f.tenant_id = leads.tenant_id
        and f.is_active = true
    )
  );

-- ---- form_events ------------------------------------------------------------
drop policy if exists "events_select_admin_or_tenant" on public.form_events;
create policy "events_select_admin_or_tenant" on public.form_events
  for select to authenticated
  using (public.is_admin() or tenant_id = public.current_tenant_id());

drop policy if exists "events_insert_public" on public.form_events;
create policy "events_insert_public" on public.form_events
  for insert to anon, authenticated
  with check (
    exists (
      select 1 from public.forms f
      where f.id = form_events.form_id
        and f.tenant_id = form_events.tenant_id
    )
  );

-- =============================================================================
-- SEED INICIAL (comentado — rodar manualmente depois de criar o usuário admin)
-- =============================================================================
-- 1) Criar usuário em Authentication → Users (botão "Add user", com email/senha).
-- 2) Rodar:
--
-- update public.profiles
--    set role = 'admin', tenant_id = null
--  where email = 'admin@geometric.com';
--
-- Pronto: esse usuário agora bypassa as policies via is_admin().
-- =============================================================================
