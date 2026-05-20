import crypto from 'node:crypto';

const API_VERSION = process.env.META_CAPI_API_VERSION || 'v18.0';
const TEST_EVENT_CODE = process.env.META_CAPI_TEST_EVENT_CODE || null;

function sha256Lower(value: any): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function hashEmail(value: any) { return sha256Lower(value); }
export function hashPhone(value: any) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return null;
  return crypto.createHash('sha256').update(digits).digest('hex');
}

function extractContact(lead: any, form: any) {
  let email: string | null = null;
  let phone: string | null = null;
  for (const field of form.fields || []) {
    const v = lead.answers?.[field.id];
    if (!v) continue;
    if (field.type === 'email' && !email) email = String(v);
    if (field.type === 'phone' && !phone) phone = String(v);
  }
  return { email, phone };
}

/**
 * Envia evento Lead/QualifiedLead pra Meta CAPI. Chamada HTTP real está comentada
 * — descomentar pra ativar em produção.
 */
export async function sendLeadEvent({ lead, form, qualified }: { lead: any; form: any; qualified: boolean }) {
  if (!form.meta_pixel_id || !form.meta_access_token) {
    return { ok: false, status: 'skipped_no_credentials' as const, payload: null };
  }
  const { email, phone } = extractContact(lead, form);
  const user_data: Record<string, any> = {};
  const em = hashEmail(email);
  const ph = hashPhone(phone);
  if (em) user_data.em = [em];
  if (ph) user_data.ph = [ph];
  if (lead.meta_fbc) user_data.fbc = lead.meta_fbc;
  if (lead.meta_fbp) user_data.fbp = lead.meta_fbp;
  if (lead.ip_address) user_data.client_ip_address = lead.ip_address;
  if (lead.user_agent) user_data.client_user_agent = lead.user_agent;

  const payload: any = {
    data: [{
      event_name: qualified ? 'QualifiedLead' : 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      event_id: lead.capi_event_id || lead.id,
      action_source: 'website',
      user_data,
      custom_data: { lead_score: lead.lead_score, form_id: form.id, currency: 'BRL' },
    }],
  };
  if (TEST_EVENT_CODE) payload.test_event_code = TEST_EVENT_CODE;

  console.log(JSON.stringify({ level: 'info', msg: 'capi_payload_built', lead_id: lead.id, qualified }));

  // TODO: ativar quando for pra produção
  // const datasetId = form.meta_dataset_id || form.meta_pixel_id;
  // const url = `https://graph.facebook.com/${API_VERSION}/${datasetId}/events?access_token=${encodeURIComponent(form.meta_access_token)}`;
  // const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  // return { ok: res.ok, status: res.ok ? 'sent' : `error_${res.status}`, payload, response: await res.json() };

  return { ok: true, status: 'simulated' as const, payload };
}
