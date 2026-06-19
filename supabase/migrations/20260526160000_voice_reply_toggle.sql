-- Toggle por tenant pra ativar/desativar resposta em áudio da IA.
-- Quando OFF, IA SEMPRE responde texto (mesmo se lead mandou áudio).
-- Quando ON, IA responde áudio quando lead mandou áudio (comportamento atual).

alter table public.whatsapp_prompts
  add column if not exists voice_reply_enabled boolean not null default false;
