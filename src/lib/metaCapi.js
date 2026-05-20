import crypto from 'node:crypto';

const API_VERSION = process.env.META_CAPI_API_VERSION || 'v18.0';
const TEST_EVENT_CODE = process.env.META_CAPI_TEST_EVENT_CODE || null;

// SHA256 lower-case trim — padrão da Meta para hash de PII.
function sha256Lower(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function hashEmail(value) {
  return sha256Lower(value);
}

function hashPhone(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return null;
  return crypto.createHash('sha256').update(digits).digest('hex');
}

/**
 * Tenta extrair email e phone das respostas de um lead olhando os campos do
 * form (type=email / type=phone). Retorna { email, phone } ou nulls.
 */
function extractContact(lead, form) {
  let email = null;
  let phone = null;
  for (const field of form.fields || []) {
    const v = lead.answers?.[field.id];
    if (!v) continue;
    if (field.type === 'email' && !email) email = String(v);
    if (field.type === 'phone' && !phone) phone = String(v);
  }
  return { email, phone };
}

/**
 * Envia evento de lead para a Meta Conversions API.
 *
 * IMPORTANTE: a chamada HTTP real está COMENTADA neste MVP. A função monta o
 * payload completo, loga, e simula sucesso. Descomente o bloco de fetch quando
 * for ativar em produção.
 *
 * @param {object}  args
 * @param {object}  args.lead       - registro de leads (com tenant_id, fbc, fbp, ip_address, user_agent, capi_event_id)
 * @param {object}  args.form       - registro de forms (com meta_pixel_id, meta_access_token, meta_dataset_id, fields)
 * @param {boolean} args.qualified  - se true, usa event_name = 'QualifiedLead' (custom) além de Lead
 * @returns {Promise<{ ok: boolean, status: string, payload: object, response?: any }>}
 */
export async function sendLeadEvent({ lead, form, qualified }) {
  if (!form.meta_pixel_id || !form.meta_access_token) {
    return { ok: false, status: 'skipped_no_credentials', payload: null };
  }

  const { email, phone } = extractContact(lead, form);

  const user_data = {};
  const em = hashEmail(email);
  const ph = hashPhone(phone);
  if (em) user_data.em = [em];
  if (ph) user_data.ph = [ph];
  if (lead.meta_fbc) user_data.fbc = lead.meta_fbc;
  if (lead.meta_fbp) user_data.fbp = lead.meta_fbp;
  if (lead.ip_address) user_data.client_ip_address = lead.ip_address;
  if (lead.user_agent) user_data.client_user_agent = lead.user_agent;

  const payload = {
    data: [
      {
        event_name: qualified ? 'QualifiedLead' : 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        event_id: lead.capi_event_id || lead.id,
        action_source: 'website',
        event_source_url: lead.event_source_url || undefined,
        user_data,
        custom_data: {
          lead_score: lead.lead_score,
          form_id: form.id,
          currency: 'BRL',
          // value: opcional — defina por cliente/plano se quiser
        },
      },
    ],
  };
  if (TEST_EVENT_CODE) payload.test_event_code = TEST_EVENT_CODE;

  const datasetId = form.meta_dataset_id || form.meta_pixel_id;
  const url = `https://graph.facebook.com/${API_VERSION}/${datasetId}/events?access_token=${encodeURIComponent(form.meta_access_token)}`;

  console.log(JSON.stringify({
    level: 'info',
    msg: 'capi_payload_built',
    lead_id: lead.id,
    qualified,
    url_host: 'graph.facebook.com',
    event_id: payload.data[0].event_id,
  }));

  // ===========================================================================
  // TODO: ativar quando for pra produção. Estrutura validada, basta descomentar.
  //
  // try {
  //   const res = await fetch(url, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify(payload),
  //   });
  //   const json = await res.json().catch(() => ({}));
  //   return {
  //     ok: res.ok,
  //     status: res.ok ? 'sent' : `error_${res.status}`,
  //     payload,
  //     response: json,
  //   };
  // } catch (err) {
  //   return { ok: false, status: 'network_error', payload, response: { message: err.message } };
  // }
  // ===========================================================================

  return { ok: true, status: 'simulated', payload };
}
