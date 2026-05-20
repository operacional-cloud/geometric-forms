import { formSaveSchema, formUpdateSchema } from '../utils/validators.js';
import { AppError, NotFoundError, ConflictError, ForbiddenError } from '../utils/errors.js';

const PUBLIC_FORMS_BASE_URL = process.env.PUBLIC_FORMS_BASE_URL || 'http://localhost:3000';

// kebab-case slug a partir de um título qualquer
function slugifyTitle(title) {
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

async function ensureUniqueSlug(supabase, tenantId, baseSlug, ignoreId = null) {
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

// Resolve o tenant_id efetivo (admin pode passar via body; client é o do profile).
function effectiveTenantId(req, body) {
  if (req.profile.role === 'admin') {
    return body?.tenant_id || req.profile.tenant_id || null;
  }
  return req.profile.tenant_id;
}

/** POST /api/forms — cria formulário (admin ou client do tenant) */
export async function createForm(req, res, next) {
  try {
    const input = formSaveSchema.parse(req.body);
    const tenantId = effectiveTenantId(req, req.body);
    if (!tenantId) throw new ForbiddenError('tenant_id é obrigatório');

    const baseSlug = input.slug || slugifyTitle(input.title);
    const finalSlug = await ensureUniqueSlug(req.supabase, tenantId, baseSlug);

    const { data, error } = await req.supabase
      .from('forms')
      .insert({
        tenant_id: tenantId,
        slug: finalSlug,
        title: input.title,
        description: input.description || null,
        fields: input.fields,
        settings: input.settings || {},
        meta_pixel_id: input.meta_pixel_id || null,
        meta_access_token: input.meta_access_token || null,
        meta_dataset_id: input.meta_dataset_id || null,
        qualification_threshold: input.qualification_threshold ?? 0,
        is_active: input.is_active ?? true,
        cover_image_url: input.cover_image_url || null,
        whatsapp_link: input.whatsapp_link || null,
        success_button_label: input.success_button_label || null,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') throw new ConflictError(`Slug "${finalSlug}" já existe`);
      throw new AppError(error.message, { status: 500 });
    }

    const tenant = await req.supabase
      .from('tenants')
      .select('slug')
      .eq('id', tenantId)
      .maybeSingle();

    res.status(201).json({
      success: true,
      data: {
        form: data,
        public_url: `${PUBLIC_FORMS_BASE_URL}/f/${tenant.data?.slug}/${data.slug}`,
      },
    });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/forms/:id — atualiza formulário (com check de tenant) */
export async function updateForm(req, res, next) {
  try {
    const input = formUpdateSchema.parse(req.body);

    // Confere ownership via RLS — admin passa, client só vê do próprio tenant.
    const { data: existing, error: lookupErr } = await req.supabase
      .from('forms')
      .select('id, tenant_id, slug')
      .eq('id', req.params.id)
      .maybeSingle();
    if (lookupErr) throw new AppError(lookupErr.message, { status: 500 });
    if (!existing) throw new NotFoundError('Formulário não encontrado');

    const patch = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.fields !== undefined) patch.fields = input.fields;
    if (input.settings !== undefined) patch.settings = input.settings;
    if (input.meta_pixel_id !== undefined) patch.meta_pixel_id = input.meta_pixel_id;
    if (input.meta_access_token !== undefined) patch.meta_access_token = input.meta_access_token;
    if (input.meta_dataset_id !== undefined) patch.meta_dataset_id = input.meta_dataset_id;
    if (input.qualification_threshold !== undefined) patch.qualification_threshold = input.qualification_threshold;
    if (input.is_active !== undefined) patch.is_active = input.is_active;
    if (input.cover_image_url !== undefined) patch.cover_image_url = input.cover_image_url;
    if (input.whatsapp_link !== undefined) patch.whatsapp_link = input.whatsapp_link;
    if (input.success_button_label !== undefined) patch.success_button_label = input.success_button_label;

    if (input.slug !== undefined && input.slug !== existing.slug) {
      patch.slug = await ensureUniqueSlug(
        req.supabase,
        existing.tenant_id,
        input.slug,
        existing.id
      );
    }

    if (Object.keys(patch).length === 0) {
      throw new AppError('Nenhum campo para atualizar', { status: 400, code: 'no_changes' });
    }

    const { data, error } = await req.supabase
      .from('forms')
      .update(patch)
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') throw new ConflictError('Slug em conflito');
      throw new AppError(error.message, { status: 500 });
    }

    res.json({ success: true, data: { form: data } });
  } catch (err) {
    next(err);
  }
}

/** GET /api/forms — lista formulários do tenant (admin vê todos) */
export async function listForms(req, res, next) {
  try {
    const { data, error } = await req.supabase
      .from('forms')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new AppError(error.message, { status: 500 });
    res.json({ success: true, data: { forms: data } });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/forms/:id — apaga formulário (RLS limita ao tenant) */
export async function deleteForm(req, res, next) {
  try {
    const { data: existing, error: lookupErr } = await req.supabase
      .from('forms')
      .select('id, tenant_id, title')
      .eq('id', req.params.id)
      .maybeSingle();
    if (lookupErr) throw new AppError(lookupErr.message, { status: 500 });
    if (!existing) throw new NotFoundError('Formulário não encontrado');

    const { error } = await req.supabase
      .from('forms')
      .delete()
      .eq('id', existing.id);
    if (error) throw new AppError(error.message, { status: 500 });

    res.json({ success: true, data: { id: existing.id, title: existing.title } });
  } catch (err) {
    next(err);
  }
}

/** GET /api/leads — lista leads do tenant (admin vê todos) */
export async function listLeads(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const formId = req.query.form_id || null;
    const onlyQualified = req.query.qualified === 'true';

    let query = req.supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (formId) query = query.eq('form_id', formId);
    if (onlyQualified) query = query.eq('is_qualified', true);

    const { data, error } = await query;
    if (error) throw new AppError(error.message, { status: 500 });
    res.json({ success: true, data: { leads: data } });
  } catch (err) {
    next(err);
  }
}
