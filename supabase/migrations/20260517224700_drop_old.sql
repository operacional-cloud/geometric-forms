drop table if exists public.form_events cascade;
drop table if exists public.leads cascade;
drop table if exists public.forms cascade;
drop table if exists public.tenants cascade;
drop function if exists public.current_tenant_id() cascade;
drop function if exists public.touch_updated_at() cascade;
