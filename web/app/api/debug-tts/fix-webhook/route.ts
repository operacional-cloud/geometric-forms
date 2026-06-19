export const dynamic = 'force-dynamic';

const EVOLUTION_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://forms.geometricagency.com';

/** POST { instance } — tenta vários endpoints pra atualizar webhook. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const instance = String(body?.instance || '');
  if (!instance) return Response.json({ ok: false, error: 'missing instance' });

  const webhookUrl = `${APP_URL}/api/whatsapp/webhook`;
  const events = ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE'];
  const attempts: any[] = [];

  // Tentativa 1: POST /webhook/set/{instance} com body {url, enabled, events} sem wrapper
  try {
    const r1 = await fetch(`${EVOLUTION_URL}/webhook/set/${encodeURIComponent(instance)}`, {
      method: 'POST',
      headers: { apikey: EVOLUTION_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, url: webhookUrl, webhookByEvents: false, webhookBase64: false, events }),
    });
    const t = await r1.text();
    attempts.push({ ep: 'webhook/set (flat)', status: r1.status, body: t.slice(0, 200) });
  } catch (e: any) {
    attempts.push({ ep: 'webhook/set (flat)', err: e?.message });
  }

  // Verifica se atualizou
  const r2 = await fetch(`${EVOLUTION_URL}/webhook/find/${encodeURIComponent(instance)}`, {
    headers: { apikey: EVOLUTION_KEY },
  });
  const v2 = await r2.json().catch(() => ({}));
  attempts.push({ check: 'webhook/find', current_url: v2?.url });

  return Response.json({ target_url: webhookUrl, attempts });
}

/** GET — atualiza TODAS as instances que estão no banco. */
export async function GET() {
  const { supabaseAdmin } = await import('@/lib/server/supabase-admin');
  const { data: instances } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('evolution_instance, name');
  const results: any[] = [];
  const webhookUrl = `${APP_URL}/api/whatsapp/webhook`;
  for (const inst of (instances || [])) {
    try {
      const r = await fetch(`${EVOLUTION_URL}/webhook/set/${encodeURIComponent(inst.evolution_instance)}`, {
        method: 'POST',
        headers: { apikey: EVOLUTION_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: webhookUrl,
            byEvents: false,
            base64: false,
            events: ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE'],
          },
        }),
      });
      results.push({ instance: inst.evolution_instance, name: inst.name, ok: r.ok, status: r.status });
    } catch (e: any) {
      results.push({ instance: inst.evolution_instance, name: inst.name, ok: false, err: e?.message });
    }
  }
  return Response.json({ set_to: webhookUrl, results });
}
