-- =============================================================================
-- LEAD — atribuição de anúncio (plataforma + região)
-- =============================================================================
-- Campanha/Conjunto/Anúncio já vêm dos UTMs existentes (utm_campaign/utm_term/
-- utm_content) preenchidos pelos macros do Meta na URL do anúncio. Faltavam:
--   - ad_platform: plataforma/posicionamento (macro {{placement}}/{{site_source_name}})
--   - geo_*: país/estado/cidade, derivados dos headers de geo da Vercel no submit.
-- =============================================================================
alter table public.leads
  add column if not exists ad_platform text,
  add column if not exists geo_country text,
  add column if not exists geo_region  text,
  add column if not exists geo_city    text;

comment on column public.leads.ad_platform is 'Plataforma/posicionamento do anúncio (Meta {{placement}}/{{site_source_name}}), capturado da URL.';
comment on column public.leads.geo_region  is 'Estado/região do lead no submit (header x-vercel-ip-country-region).';
comment on column public.leads.geo_city    is 'Cidade do lead no submit (header x-vercel-ip-city).';
