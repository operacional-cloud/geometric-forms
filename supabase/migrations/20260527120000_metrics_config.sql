-- Config de visibilidade de métricas por cliente (tenant).
--
-- Guarda quais blocos de métrica ficam ESCONDIDOS no painel do cliente.
-- Apenas o admin edita (via /admin/[id] → card "Métricas visíveis").
--
-- Shape:
--   { "hidden": ["leads", "roas", "sec_tags", ...] }
--
-- null / ausente  => todas as métricas visíveis (default retrocompatível).

alter table public.tenants
  add column if not exists metrics_config jsonb;

comment on column public.tenants.metrics_config is
  'Visibilidade de métricas do painel do cliente. { "hidden": string[] }. null = tudo visível.';
