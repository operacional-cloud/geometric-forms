-- =============================================================================
-- Módulo WhatsApp Integration (Evolution API + Gemini AI Qualifier)
-- =============================================================================
--
-- Visão geral:
--   - whatsapp_instances     → conexões WhatsApp (1 por número conectado)
--   - whatsapp_conversations → uma conversa por (instance, telefone do lead)
--   - whatsapp_messages      → histórico de mensagens (inbound + outbound)
--   - whatsapp_prompts       → prompt da IA configurado por tenant
--
-- =============================================================================

-- whatsapp_instances ---------------------------------------------------------
create table if not exists public.whatsapp_instances (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  name                 text not null,                            -- ex: "WhatsApp Pillar"
  evolution_instance   text not null unique,                     -- nome técnico no Evolution
  status               text not null default 'pending' check (status in (
    'pending', 'qr', 'connecting', 'connected', 'disconnected', 'failed'
  )),
  phone_number         text,                                     -- preenchido após conectar
  qr_code              text,                                     -- base64 png do QR (temporário)
  last_event_at        timestamptz default now(),
  connected_at         timestamptz,
  created_at           timestamptz default now()
);

comment on table public.whatsapp_instances is
  'Conexões com a Evolution API. Cada linha = 1 número de WhatsApp conectado via QR code.';

create index if not exists idx_wa_instances_tenant on public.whatsapp_instances(tenant_id, created_at desc);

-- whatsapp_conversations ----------------------------------------------------
create table if not exists public.whatsapp_conversations (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants(id) on delete cascade,
  instance_id              uuid not null references public.whatsapp_instances(id) on delete cascade,
  prospecting_lead_id      uuid references public.prospecting_leads(id) on delete set null,
  remote_jid               text not null,                        -- ex: 5511999999999@s.whatsapp.net
  display_name             text,
  status                   text not null default 'qualifying' check (status in (
    'qualifying', 'qualified', 'rejected', 'transferred', 'paused', 'human_takeover'
  )),
  qualification_summary    text,                                  -- resumo gerado pela IA quando qualifica
  qualified_at             timestamptz,
  transferred_at           timestamptz,
  ai_paused                boolean default false,                 -- admin pode pausar a IA pra assumir
  last_message_at          timestamptz default now(),
  last_message_preview     text,
  message_count            integer default 0,
  created_at               timestamptz default now(),
  unique (instance_id, remote_jid)
);

comment on table public.whatsapp_conversations is
  'Uma conversa por (instance, telefone). Vincula opcionalmente a um lead prospectado.';

create index if not exists idx_wa_conv_tenant_last     on public.whatsapp_conversations(tenant_id, last_message_at desc);
create index if not exists idx_wa_conv_status          on public.whatsapp_conversations(tenant_id, status);
create index if not exists idx_wa_conv_lead            on public.whatsapp_conversations(prospecting_lead_id);

-- whatsapp_messages ---------------------------------------------------------
create table if not exists public.whatsapp_messages (
  id                  uuid primary key default gen_random_uuid(),
  conversation_id     uuid not null references public.whatsapp_conversations(id) on delete cascade,
  direction           text not null check (direction in ('inbound', 'outbound')),
  source              text not null default 'ai' check (source in ('ai', 'human', 'system', 'user')),
  -- inbound sempre vem com source='user' (msg do lead)
  -- outbound vem com 'ai' (resposta automática), 'human' (admin tomou controle) ou 'system' (msg de transferência)
  content             text not null,
  evolution_message_id text,
  metadata            jsonb default '{}'::jsonb,
  created_at          timestamptz default now()
);

comment on table public.whatsapp_messages is
  'Histórico de mensagens. inbound = recebido do lead, outbound = enviado por nós (IA ou humano).';

create index if not exists idx_wa_msg_conv      on public.whatsapp_messages(conversation_id, created_at);

-- whatsapp_prompts (1 por tenant) -------------------------------------------
create table if not exists public.whatsapp_prompts (
  tenant_id                uuid primary key references public.tenants(id) on delete cascade,
  system_prompt            text not null default '',  -- personalidade da IA
  qualification_criteria   text not null default '',  -- critérios pra qualificar lead
  initial_message          text not null default '',  -- primeira msg enviada ao lead
  transfer_message         text not null default '',  -- msg enviada quando transfere pra humano
  ai_enabled               boolean default true,
  updated_at               timestamptz default now()
);

comment on table public.whatsapp_prompts is
  'Configuração da IA por tenant: personalidade, critérios, mensagens.';

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.whatsapp_instances     enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages      enable row level security;
alter table public.whatsapp_prompts       enable row level security;

-- whatsapp_instances --------------------------------------------------------
drop policy if exists "wa_instances_all" on public.whatsapp_instances;
create policy "wa_instances_all" on public.whatsapp_instances
  for all to authenticated
  using (public.is_admin() or tenant_id = public.current_tenant_id())
  with check (public.is_admin() or tenant_id = public.current_tenant_id());

-- whatsapp_conversations ----------------------------------------------------
drop policy if exists "wa_conv_all" on public.whatsapp_conversations;
create policy "wa_conv_all" on public.whatsapp_conversations
  for all to authenticated
  using (public.is_admin() or tenant_id = public.current_tenant_id())
  with check (public.is_admin() or tenant_id = public.current_tenant_id());

-- whatsapp_messages ---------------------------------------------------------
drop policy if exists "wa_msg_all" on public.whatsapp_messages;
create policy "wa_msg_all" on public.whatsapp_messages
  for all to authenticated
  using (
    public.is_admin() or conversation_id in (
      select id from public.whatsapp_conversations
      where tenant_id = public.current_tenant_id()
    )
  )
  with check (
    public.is_admin() or conversation_id in (
      select id from public.whatsapp_conversations
      where tenant_id = public.current_tenant_id()
    )
  );

-- whatsapp_prompts ----------------------------------------------------------
drop policy if exists "wa_prompts_all" on public.whatsapp_prompts;
create policy "wa_prompts_all" on public.whatsapp_prompts
  for all to authenticated
  using (public.is_admin() or tenant_id = public.current_tenant_id())
  with check (public.is_admin() or tenant_id = public.current_tenant_id());

-- =============================================================================
-- Trigger updated_at em whatsapp_prompts
-- =============================================================================
drop trigger if exists whatsapp_prompts_set_updated_at on public.whatsapp_prompts;
create trigger whatsapp_prompts_set_updated_at
  before update on public.whatsapp_prompts
  for each row execute function public.set_updated_at();
