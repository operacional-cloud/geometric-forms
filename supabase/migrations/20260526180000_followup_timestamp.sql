-- Timestamp pra rastrear quando o lead entrou em "Follow-up".
-- UI usa pra detectar leads parados em follow-up > 7 dias e mover pra lista separada.

alter table public.leads
  add column if not exists followup_at timestamptz;

alter table public.prospecting_leads
  add column if not exists followup_at timestamptz;
