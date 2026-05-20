-- Tela de início + tela de sucesso por formulário + lead incompleto

alter table public.forms
  add column if not exists cover_image_url text,
  add column if not exists whatsapp_link text,
  add column if not exists success_button_label text default 'Quero agilizar';

alter table public.leads
  add column if not exists is_complete boolean default false;

-- Leads existentes ficam como completos (não tinha flag antes)
update public.leads set is_complete = true where is_complete is null or is_complete = false;

create index if not exists idx_leads_form_complete on public.leads(form_id, is_complete);

comment on column public.forms.cover_image_url     is 'URL da imagem de capa exibida na tela de início do formulário público.';
comment on column public.forms.whatsapp_link       is 'Link de destino do botão da tela de obrigado (ex: https://wa.me/55...).';
comment on column public.forms.success_button_label is 'Texto do botão da tela de obrigado.';
comment on column public.leads.is_complete         is 'true se o lead respondeu o form todo. false se preencheu só nome+telefone e abandonou.';
