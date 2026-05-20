import { supabaseAdmin } from '../lib/supabaseClient.js';
import { eventTrackSchema } from '../utils/validators.js';
import { AppError, NotFoundError } from '../utils/errors.js';

/**
 * POST /api/public/events — registra evento de funil (view/start/field_complete).
 * Eventos submit/qualified são gerados internamente por submitPublicLead.
 */
export async function trackFormEvent(req, res, next) {
  try {
    const input = eventTrackSchema.parse(req.body);

    const { data: form, error: fErr } = await supabaseAdmin
      .from('forms')
      .select('id, tenant_id, is_active')
      .eq('id', input.form_id)
      .maybeSingle();
    if (fErr) throw new AppError(fErr.message, { status: 500 });
    if (!form) throw new NotFoundError('Formulário não encontrado');
    if (!form.is_active) throw new AppError('Formulário inativo', { status: 403, code: 'form_inactive' });

    const { error: eErr } = await supabaseAdmin.from('form_events').insert({
      form_id: form.id,
      tenant_id: form.tenant_id,
      event_type: input.event_type,
      session_id: input.session_id,
      metadata: input.metadata || {},
    });
    if (eErr) throw new AppError(eErr.message, { status: 500 });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
