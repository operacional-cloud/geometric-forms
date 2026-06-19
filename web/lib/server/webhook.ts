// Helper pra disparar webhooks dos formulários (background via waitUntil).

import { waitUntil } from '@vercel/functions';

export type WebhookResponse = {
  question: string;
  field_id: string;
  type: string;
  answer: any;
};

export type WebhookPayload = {
  event: 'lead.completed';
  form_id: string;
  tenant_id: string;
  lead: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    responses: WebhookResponse[];
    lead_score: number;
    is_qualified: boolean;
    status: string;
    utm?: {
      source?: string | null;
      medium?: string | null;
      campaign?: string | null;
      content?: string | null;
      term?: string | null;
    };
    meta?: {
      fbc?: string | null;
      fbp?: string | null;
      fbclid?: string | null;
    };
    ip_address?: string | null;
    user_agent?: string | null;
    created_at: string;
  };
  sent_at: string;
};

/**
 * Dispara webhook via POST JSON em background usando waitUntil do Vercel.
 *
 * Por que waitUntil: serverless da Vercel mata promises pendentes assim que
 * a Response é devolvida ao cliente. Sem waitUntil, o fetch do webhook é
 * abortado antes de chegar no destino. waitUntil mantém a função viva até
 * o fetch resolver ou rejeitar.
 *
 * Timeout interno de 8s pra não segurar a função indefinidamente caso o
 * destino esteja lento.
 */
export function fireWebhook(url: string | null | undefined, payload: WebhookPayload): void {
  if (!url) return;

  const job = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Geometric-Forms-Webhook/1.0',
          'X-Geometric-Event': payload.event,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      console.log(JSON.stringify({
        level: 'info',
        msg: 'webhook_sent',
        url,
        status: res.status,
        lead_id: payload.lead.id,
      }));
    } catch (err: any) {
      console.log(JSON.stringify({
        level: 'warn',
        msg: 'webhook_failed',
        url,
        error: err?.message || String(err),
        lead_id: payload.lead.id,
      }));
    } finally {
      clearTimeout(timer);
    }
  })();

  // Vercel mantém a função viva até o job terminar (ou timeout do request)
  try {
    waitUntil(job);
  } catch {
    // Fora do ambiente Vercel (dev local) — apenas deixa rodar em background
  }
}
