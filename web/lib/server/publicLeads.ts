import { supabaseAdmin } from './supabase-admin';
import { leadSubmitSchema, eventTrackSchema } from './validators';
import { calculateScore } from './leadScoring';
import { AppError, NotFoundError, ValidationError } from './errors';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidPhone(v: string): boolean {
  const digits = String(v).replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 13;
}

function clientIpFrom(headers: Headers): string | null {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return headers.get('x-real-ip') || null;
}

function sanitizeAndValidateAnswers(
  answers: Record<string, any>,
  fields: any[],
  { isPartial = false }: { isPartial?: boolean } = {},
): Record<string, any> {
  const errors: any[] = [];
  const allowedIds = new Set(fields.map((f) => f.id));
  const clean: Record<string, any> = {};

  for (const [k, v] of Object.entries(answers || {})) {
    if (allowedIds.has(k)) clean[k] = v;
  }

  for (const field of fields) {
    const v = clean[field.id];
    const present = v !== undefined && v !== null && v !== '';

    const isSystemField = field.system === true || field.id === 'nome' || field.id === 'telefone';
    const enforceRequired = field.required && (!isPartial || isSystemField);

    if (enforceRequired && !present) {
      errors.push({ field: field.id, message: `Campo obrigatório "${field.label}"` });
      continue;
    }
    if (!present) continue;

    switch (field.type) {
      case 'email':
        if (typeof v !== 'string' || !EMAIL_RE.test(v)) errors.push({ field: field.id, message: 'Email inválido' });
        break;
      case 'phone':
        if (typeof v !== 'string' || !isValidPhone(v)) errors.push({ field: field.id, message: 'Telefone inválido' });
        break;
      case 'number': {
        const n = Number(v);
        if (Number.isNaN(n)) {
          errors.push({ field: field.id, message: 'Valor numérico inválido' });
        } else {
          if (field.validation?.min !== undefined && n < field.validation.min) {
            errors.push({ field: field.id, message: `Mínimo ${field.validation.min}` });
          }
          if (field.validation?.max !== undefined && n > field.validation.max) {
            errors.push({ field: field.id, message: `Máximo ${field.validation.max}` });
          }
        }
        break;
      }
      case 'checkbox':
        if (!Array.isArray(v) || v.length === 0) errors.push({ field: field.id, message: 'Selecione ao menos uma opção' });
        break;
      case 'radio':
      case 'select':
        if (typeof v !== 'string') {
          errors.push({ field: field.id, message: 'Selecione uma opção' });
        } else if (Array.isArray(field.options) && !field.options.some((o: any) => String(o.value) === String(v))) {
          errors.push({ field: field.id, message: 'Opção inválida' });
        }
        break;
      case 'text':
      case 'textarea':
        if (field.validation?.regex) {
          try {
            const re = new RegExp(field.validation.regex);
            if (typeof v !== 'string' || !re.test(v)) {
              errors.push({ field: field.id, message: 'Formato inválido' });
            }
          } catch {}
        }
        break;
    }
  }

  if (errors.length > 0) throw new ValidationError('Respostas inválidas', errors);
  return clean;
}

export async function getPublicForm(tenantSlug: string, formSlug: string) {
  const { data: tenant, error: tErr } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug, logo_url, primary_color, secondary_color, status')
    .eq('slug', tenantSlug)
    .maybeSingle();
  if (tErr) throw new AppError(tErr.message, { status: 500 });
  if (!tenant) throw new NotFoundError('Cliente não encontrado');
  if (tenant.status === 'inactive') {
    throw new AppError('Cliente inativo', { status: 403, code: 'tenant_inactive' });
  }

  const { data: form, error: fErr } = await supabaseAdmin
    .from('forms')
    .select('id, slug, title, description, fields, settings, meta_pixel_id, is_active, cover_image_url, whatsapp_link, success_button_label')
    .eq('tenant_id', tenant.id)
    .eq('slug', formSlug)
    .maybeSingle();
  if (fErr) throw new AppError(fErr.message, { status: 500 });
  if (!form || !form.is_active) throw new NotFoundError('Formulário não encontrado ou inativo');

  return {
    tenant,
    form: {
      id: form.id,
      slug: form.slug,
      title: form.title,
      description: form.description,
      fields: form.fields,
      settings: form.settings,
      meta_pixel_id: form.meta_pixel_id,
      cover_image_url: form.cover_image_url,
      whatsapp_link: form.whatsapp_link,
      success_button_label: form.success_button_label || 'Quero agilizar',
    },
  };
}

export async function submitPublicLead(input: unknown, requestHeaders: Headers) {
  const parsed = leadSubmitSchema.parse(input);
  const isPartial = parsed.is_partial === true;

  const { data: form, error: fErr } = await supabaseAdmin
    .from('forms')
    .select('id, tenant_id, fields, qualification_threshold, is_active, settings, meta_pixel_id, meta_access_token, meta_dataset_id, whatsapp_link, success_button_label')
    .eq('id', parsed.form_id)
    .maybeSingle();
  if (fErr) throw new AppError(fErr.message, { status: 500 });
  if (!form) throw new NotFoundError('Formulário não encontrado');
  if (!form.is_active) throw new AppError('Formulário inativo', { status: 403, code: 'form_inactive' });

  const cleanAnswers = sanitizeAndValidateAnswers(parsed.answers, (form.fields as any[]) || [], { isPartial });
  const lead_score = calculateScore(cleanAnswers, (form.fields as any[]) || []);
  const is_qualified = !isPartial && lead_score >= (form.qualification_threshold ?? 0);
  const tracking = parsed.tracking || {};

  // Procura existing pra fazer upsert por event_id
  const { data: existing, error: dupErr } = await supabaseAdmin
    .from('leads')
    .select('id, answers, is_complete')
    .eq('capi_event_id', parsed.event_id)
    .maybeSingle();
  if (dupErr) throw new AppError(dupErr.message, { status: 500 });

  let lead: any;
  if (existing) {
    const mergedAnswers = { ...(existing.answers || {}), ...cleanAnswers };
    const mergedScore = calculateScore(mergedAnswers, (form.fields as any[]) || []);
    const mergedQualified = !isPartial && mergedScore >= (form.qualification_threshold ?? 0);
    const { data, error } = await supabaseAdmin
      .from('leads')
      .update({
        answers: mergedAnswers,
        lead_score: mergedScore,
        is_qualified: mergedQualified,
        is_complete: existing.is_complete || !isPartial,
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw new AppError(`Falha ao atualizar lead: ${error.message}`, { status: 500 });
    lead = data;
  } else {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .insert({
        form_id: form.id,
        tenant_id: form.tenant_id,
        answers: cleanAnswers,
        lead_score,
        is_qualified,
        is_complete: !isPartial,
        status: 'novo',
        meta_fbc: tracking.fbc || null,
        meta_fbp: tracking.fbp || null,
        meta_click_id: tracking.fbclid || null,
        utm_source: tracking.utm_source || null,
        utm_medium: tracking.utm_medium || null,
        utm_campaign: tracking.utm_campaign || null,
        utm_content: tracking.utm_content || null,
        utm_term: tracking.utm_term || null,
        ip_address: clientIpFrom(requestHeaders),
        user_agent: tracking.user_agent || requestHeaders.get('user-agent') || null,
        capi_event_id: parsed.event_id,
      })
      .select('*')
      .single();
    if (error) throw new AppError(`Falha ao salvar lead: ${error.message}`, { status: 500 });
    lead = data;
  }

  if (!isPartial) {
    const eventRows: any[] = [{
      form_id: form.id, tenant_id: form.tenant_id,
      event_type: 'submit',
      session_id: tracking.session_id || null,
      metadata: { lead_id: lead.id, lead_score: lead.lead_score },
    }];
    if (lead.is_qualified) {
      eventRows.push({
        form_id: form.id, tenant_id: form.tenant_id,
        event_type: 'qualified',
        session_id: tracking.session_id || null,
        metadata: { lead_id: lead.id, lead_score: lead.lead_score },
      });
    }
    await supabaseAdmin.from('form_events').insert(eventRows);
  }

  console.log(JSON.stringify({
    level: 'info',
    msg: isPartial ? 'lead_partial_saved' : 'lead_completed',
    lead_id: lead.id,
    form_id: form.id,
    is_partial: isPartial,
    is_complete: lead.is_complete,
  }));

  return {
    lead_id: lead.id,
    lead_score: lead.lead_score,
    is_qualified: lead.is_qualified,
    is_complete: lead.is_complete,
    whatsapp_link: form.whatsapp_link || null,
    success_button_label: form.success_button_label || 'Quero agilizar',
    redirect_url: (form.settings as any)?.thank_you_url || null,
  };
}

export async function trackFormEvent(input: unknown) {
  const parsed = eventTrackSchema.parse(input);
  const { data: form, error: fErr } = await supabaseAdmin
    .from('forms')
    .select('id, tenant_id, is_active')
    .eq('id', parsed.form_id)
    .maybeSingle();
  if (fErr) throw new AppError(fErr.message, { status: 500 });
  if (!form) throw new NotFoundError('Formulário não encontrado');
  if (!form.is_active) throw new AppError('Formulário inativo', { status: 403, code: 'form_inactive' });

  const { error: eErr } = await supabaseAdmin.from('form_events').insert({
    form_id: form.id,
    tenant_id: form.tenant_id,
    event_type: parsed.event_type,
    session_id: parsed.session_id,
    metadata: parsed.metadata || {},
  });
  if (eErr) throw new AppError(eErr.message, { status: 500 });
}
