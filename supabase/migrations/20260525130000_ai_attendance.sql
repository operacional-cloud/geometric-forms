-- IA de Atendimento: flag is_group em whatsapp_conversations
-- pra UI separar conversas individuais de grupos.

alter table public.whatsapp_conversations
  add column if not exists is_group boolean not null default false;

create index if not exists idx_wa_conv_is_group
  on public.whatsapp_conversations(tenant_id, is_group, last_message_at desc);
