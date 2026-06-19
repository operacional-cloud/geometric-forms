-- Fake call: rastreia última chamada fake disparada pra esse contato + toggle por tenant.

alter table public.whatsapp_conversations
  add column if not exists last_fake_call_at timestamptz;

alter table public.whatsapp_prompts
  add column if not exists fake_call_enabled boolean not null default false;
