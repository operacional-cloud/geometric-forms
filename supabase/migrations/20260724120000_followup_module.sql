-- =============================================================================
-- Módulo Follow-up IA (reengajamento automático de leads inativos)
-- =============================================================================
--
-- Visão geral:
--   - followup_sequences  → templates de sequência por tenant/nicho
--   - followup_queue      → fila de execução (qual lead, qual step, quando)
--   - followup_logs       → histórico de cada envio (entregou? respondeu?)
--
-- =============================================================================

-- followup_sequences ---------------------------------------------------------
create table if not exists public.followup_sequences (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  name                text not null,
  niche               text not null default '',
  is_active           boolean not null default true,
  inactivity_hours    integer not null default 24,
  send_window_start   time not null default '09:00',
  send_window_end     time not null default '18:00',
  steps               jsonb not null default '[]'::jsonb,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

comment on table public.followup_sequences is
  'Templates de sequência de follow-up. steps é um array JSON de [{day, type, template, media_url?}].';

create index if not exists idx_followup_seq_tenant on public.followup_sequences(tenant_id, is_active);

-- followup_queue -------------------------------------------------------------
create table if not exists public.followup_queue (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  conversation_id     uuid not null references public.whatsapp_conversations(id) on delete cascade,
  sequence_id         uuid not null references public.followup_sequences(id) on delete cascade,
  instance_id         uuid not null references public.whatsapp_instances(id) on delete cascade,
  current_step        integer not null default 0,
  status              text not null default 'active' check (status in (
    'active', 'paused', 'completed', 'responded', 'cancelled'
  )),
  next_action_at      timestamptz not null,
  started_at          timestamptz default now(),
  completed_at        timestamptz,
  created_at          timestamptz default now()
);

comment on table public.followup_queue is
  'Fila de execução de follow-up. Cada registro = 1 lead em uma sequência ativa.';

create index if not exists idx_followup_queue_next on public.followup_queue(status, next_action_at)
  where status = 'active';
create index if not exists idx_followup_queue_conv on public.followup_queue(conversation_id);
create index if not exists idx_followup_queue_tenant on public.followup_queue(tenant_id, status);

-- followup_logs --------------------------------------------------------------
create table if not exists public.followup_logs (
  id                  uuid primary key default gen_random_uuid(),
  queue_id            uuid not null references public.followup_queue(id) on delete cascade,
  step_index          integer not null,
  message_type        text not null check (message_type in ('text', 'audio', 'sticker', 'fake_call')),
  content_sent        text,
  sent_at             timestamptz default now(),
  delivered           boolean default false,
  responded_at        timestamptz,
  error               text
);

comment on table public.followup_logs is
  'Histórico de cada step executado. Rastreia entrega e resposta pra métricas.';

create index if not exists idx_followup_logs_queue on public.followup_logs(queue_id, step_index);

-- =============================================================================
-- Coluna followup_enabled na whatsapp_prompts (toggle on/off por tenant)
-- =============================================================================

alter table public.whatsapp_prompts
  add column if not exists followup_enabled boolean default false;

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.followup_sequences enable row level security;
alter table public.followup_queue     enable row level security;
alter table public.followup_logs      enable row level security;

-- followup_sequences ---------------------------------------------------------
drop policy if exists "followup_seq_all" on public.followup_sequences;
create policy "followup_seq_all" on public.followup_sequences
  for all to authenticated
  using (public.is_admin() or tenant_id = public.current_tenant_id())
  with check (public.is_admin() or tenant_id = public.current_tenant_id());

-- followup_queue -------------------------------------------------------------
drop policy if exists "followup_queue_all" on public.followup_queue;
create policy "followup_queue_all" on public.followup_queue
  for all to authenticated
  using (public.is_admin() or tenant_id = public.current_tenant_id())
  with check (public.is_admin() or tenant_id = public.current_tenant_id());

-- followup_logs --------------------------------------------------------------
drop policy if exists "followup_logs_all" on public.followup_logs;
create policy "followup_logs_all" on public.followup_logs
  for all to authenticated
  using (
    public.is_admin() or queue_id in (
      select id from public.followup_queue
      where tenant_id = public.current_tenant_id()
    )
  )
  with check (
    public.is_admin() or queue_id in (
      select id from public.followup_queue
      where tenant_id = public.current_tenant_id()
    )
  );

-- =============================================================================
-- Trigger updated_at em followup_sequences
-- =============================================================================
drop trigger if exists followup_sequences_set_updated_at on public.followup_sequences;
create trigger followup_sequences_set_updated_at
  before update on public.followup_sequences
  for each row execute function public.set_updated_at();
