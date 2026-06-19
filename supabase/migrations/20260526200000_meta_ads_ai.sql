-- Módulo "Meta Ads IA" — chat com Claude que opera sobre a conta Meta Ads do tenant.

-- Key da Anthropic API por tenant (cliente cola a dele)
alter table public.tenants
  add column if not exists anthropic_api_key text;

-- Conversas (uma thread por tópico)
create table if not exists public.meta_ads_ai_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null default 'Nova conversa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_meta_ai_conv_tenant
  on public.meta_ads_ai_conversations(tenant_id, updated_at desc);

-- Mensagens (linha por turn: user, assistant, tool_use, tool_result)
create table if not exists public.meta_ads_ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.meta_ads_ai_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  -- Texto puro pra user/assistant; pra tool, fica null e detalhe vem em tool_calls/tool_result
  content text,
  -- Quando assistant usa tools: array de { id, name, input }
  tool_calls jsonb,
  -- Quando role=tool: id do tool_use ao qual está respondendo + resultado serializado
  tool_call_id text,
  tool_result jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_meta_ai_msg_conv
  on public.meta_ads_ai_messages(conversation_id, created_at);

-- RLS: cada tenant só vê o que é seu
alter table public.meta_ads_ai_conversations enable row level security;
alter table public.meta_ads_ai_messages enable row level security;

drop policy if exists "tenant_can_read_own_conv" on public.meta_ads_ai_conversations;
create policy "tenant_can_read_own_conv" on public.meta_ads_ai_conversations
  for select using (tenant_id = public.current_tenant_id() or public.is_admin());

drop policy if exists "tenant_can_read_own_msg" on public.meta_ads_ai_messages;
create policy "tenant_can_read_own_msg" on public.meta_ads_ai_messages
  for select using (
    exists (
      select 1 from public.meta_ads_ai_conversations c
      where c.id = conversation_id
        and (c.tenant_id = public.current_tenant_id() or public.is_admin())
    )
  );
