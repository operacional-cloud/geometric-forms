-- Tags livres por lead (acumulam quando arrastado entre colunas do Kanban).
-- Cada tag é uma string. Default array vazio.

alter table public.leads
  add column if not exists tags text[] not null default '{}'::text[];

alter table public.prospecting_leads
  add column if not exists tags text[] not null default '{}'::text[];

-- Índice GIN pra queries por tag rápidas (ex: filtrar leads que tem certa tag)
create index if not exists idx_leads_tags_gin on public.leads using gin (tags);
create index if not exists idx_prosp_tags_gin on public.prospecting_leads using gin (tags);
