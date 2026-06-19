-- Metadados de grupos: nome do grupo + nome de cada remetente em mensagens de grupo.

alter table public.whatsapp_conversations
  add column if not exists group_subject text;

alter table public.whatsapp_messages
  add column if not exists sender_name text,
  add column if not exists sender_jid text;
