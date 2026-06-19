import { formSaveSchema, formUpdateSchema } from './validators';
import { AppError, NotFoundError, ConflictError, ForbiddenError } from './errors';
import { supabaseAdmin } from './supabase-admin';
import { assertWithinFormLimit } from './plans';
import type { AuthContext } from './auth';

function slugifyTitle(title: string): string {
  return String(title)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

async function ensureUniqueSlug(
  supabase: AuthContext['supabase'],
  tenantId: string,
  baseSlug: string,
  ignoreId: string | null = null,
): Promise<string> {
  let candidate = baseSlug;
  let n = 1;
  while (true) {
    let query = supabase.from('forms').select('id').eq('tenant_id', tenantId).eq('slug', candidate);
    if (ignoreId) query = query.neq('id', ignoreId);
    const { data, error } = await query.maybeSingle();
    if (error) throw new AppError(error.message, { status: 500 });
    if (!data) return candidate;
    n += 1;
    candidate = `${baseSlug}-${n}`;
    if (n > 50) throw new AppError('Não foi possível gerar slug único', { status: 500 });
  }
}

function effectiveTenantId(ctx: AuthContext, bodyTenantId?: string | null): string | null {
  if (ctx.profile.role === 'admin') {
    return bodyTenantId || ctx.profile.tenant_id || null;
  }
  return ctx.profile.tenant_id;
}

export async function createForm(ctx: AuthContext, input: unknown) {
  const parsed = formSaveSchema.parse(input);
  const tenantId = effectiveTenantId(ctx, parsed.tenant_id);
  if (!tenantId) throw new ForbiddenError('tenant_id é obrigatório');

  // Enforcement de plano: bloqueia se o tenant estourou max_formularios.
  await assertWithinFormLimit(tenantId);

  const baseSlug = parsed.slug || slugifyTitle(parsed.title);
  const finalSlug = await ensureUniqueSlug(ctx.supabase, tenantId, baseSlug);

  const { data, error } = await ctx.supabase
    .from('forms')
    .insert({
      tenant_id: tenantId,
      slug: finalSlug,
      title: parsed.title,
      description: parsed.description || null,
      fields: parsed.fields,
      settings: parsed.settings || {},
      meta_pixel_id: parsed.meta_pixel_id || null,
      meta_access_token: parsed.meta_access_token || null,
      meta_dataset_id: parsed.meta_dataset_id || null,
      qualification_threshold: parsed.qualification_threshold ?? 0,
      is_active: parsed.is_active ?? true,
      cover_image_url: parsed.cover_image_url || null,
      whatsapp_link: parsed.whatsapp_link || null,
      success_button_label: parsed.success_button_label || null,
      webhook_url: parsed.webhook_url || null,
    })
    .select('*')
    .single();

  if (error) {
    if ((error as any).code === '23505') throw new ConflictError(`Slug "${finalSlug}" já existe`);
    throw new AppError(error.message, { status: 500 });
  }

  const tenantQ = await ctx.supabase.from('tenants').select('slug').eq('id', tenantId).maybeSingle();
  const baseUrl = process.env.PUBLIC_FORMS_BASE_URL || '';
  return {
    form: data,
    public_url: `${baseUrl}/${tenantQ.data?.slug}/${data.slug}`,
  };
}

export async function updateForm(ctx: AuthContext, id: string, input: unknown) {
  const parsed = formUpdateSchema.parse(input);

  const { data: existing, error: lookupErr } = await ctx.supabase
    .from('forms')
    .select('id, tenant_id, slug')
    .eq('id', id)
    .maybeSingle();
  if (lookupErr) throw new AppError(lookupErr.message, { status: 500 });
  if (!existing) throw new NotFoundError('Formulário não encontrado');

  const patch: Record<string, any> = {};
  if (parsed.title !== undefined) patch.title = parsed.title;
  if (parsed.description !== undefined) patch.description = parsed.description;
  if (parsed.fields !== undefined) patch.fields = parsed.fields;
  if (parsed.settings !== undefined) patch.settings = parsed.settings;
  if (parsed.meta_pixel_id !== undefined) patch.meta_pixel_id = parsed.meta_pixel_id;
  if (parsed.meta_access_token !== undefined) patch.meta_access_token = parsed.meta_access_token;
  if (parsed.meta_dataset_id !== undefined) patch.meta_dataset_id = parsed.meta_dataset_id;
  if (parsed.qualification_threshold !== undefined) patch.qualification_threshold = parsed.qualification_threshold;
  if (parsed.is_active !== undefined) patch.is_active = parsed.is_active;
  if (parsed.cover_image_url !== undefined) patch.cover_image_url = parsed.cover_image_url;
  if (parsed.whatsapp_link !== undefined) patch.whatsapp_link = parsed.whatsapp_link;
  if (parsed.success_button_label !== undefined) patch.success_button_label = parsed.success_button_label;
  if (parsed.webhook_url !== undefined) patch.webhook_url = parsed.webhook_url;

  if (parsed.slug !== undefined && parsed.slug !== existing.slug) {
    patch.slug = await ensureUniqueSlug(ctx.supabase, existing.tenant_id, parsed.slug, existing.id);
  }
  if (Object.keys(patch).length === 0) {
    throw new AppError('Nenhum campo para atualizar', { status: 400, code: 'no_changes' });
  }

  const { data, error } = await ctx.supabase
    .from('forms')
    .update(patch)
    .eq('id', existing.id)
    .select('*')
    .single();
  if (error) {
    if ((error as any).code === '23505') throw new ConflictError('Slug em conflito');
    throw new AppError(error.message, { status: 500 });
  }
  return { form: data };
}

export async function deleteForm(ctx: AuthContext, id: string) {
  const { data: existing, error: lookupErr } = await ctx.supabase
    .from('forms')
    .select('id, tenant_id, title')
    .eq('id', id)
    .maybeSingle();
  if (lookupErr) throw new AppError(lookupErr.message, { status: 500 });
  if (!existing) throw new NotFoundError('Formulário não encontrado');

  const { error } = await ctx.supabase.from('forms').delete().eq('id', existing.id);
  if (error) throw new AppError(error.message, { status: 500 });
  return { id: existing.id, title: existing.title };
}

export async function listForms(ctx: AuthContext) {
  const { data, error } = await ctx.supabase
    .from('forms')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new AppError(error.message, { status: 500 });
  return { forms: data || [] };
}

export async function listLeads(
  ctx: AuthContext,
  opts: { limit?: number; formId?: string | null; onlyQualified?: boolean } = {},
) {
  const limit = Math.min(opts.limit || 100, 500);
  let query = ctx.supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (opts.formId) query = query.eq('form_id', opts.formId);
  if (opts.onlyQualified) query = query.eq('is_qualified', true);

  const { data, error } = await query;
  if (error) throw new AppError(error.message, { status: 500 });
  return { leads: data || [] };
}

export async function deleteFormLead(ctx: AuthContext, leadId: string): Promise<void> {
  const isAdmin = ctx.profile.role === 'admin';
  const tenantId = ctx.profile.tenant_id;

  if (!isAdmin && !tenantId) {
    throw new AppError('Apenas admin ou usuários com tenant podem excluir leads.', { status: 403 });
  }

  // Admin usa supabaseAdmin (sem RLS), sem precisar filtrar por tenant.
  // Membro de tenant usa supabaseAdmin com filtro explícito de tenant_id
  // (evita RLS bloquear silenciosamente em casos de cliente authenticated).
  let query = supabaseAdmin
    .from('leads')
    .delete({ count: 'exact' })
    .eq('id', leadId);
  if (!isAdmin) query = query.eq('tenant_id', tenantId!);

  const { error, count } = await query;
  if (error) throw new AppError(error.message, { status: 500 });
  if (!count) throw new AppError('Lead não encontrado.', { status: 404 });
}
