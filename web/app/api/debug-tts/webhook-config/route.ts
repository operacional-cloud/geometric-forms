export const dynamic = 'force-dynamic';

const EVOLUTION_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || '';

/** GET ?instance=01-d822fe1f — mostra config webhook da instance no Evolution. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const instance = url.searchParams.get('instance') || '';
  if (!instance) return Response.json({ ok: false, error: 'missing instance' });
  try {
    const r = await fetch(`${EVOLUTION_URL}/webhook/find/${encodeURIComponent(instance)}`, {
      headers: { apikey: EVOLUTION_KEY },
    });
    const text = await r.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return Response.json({ ok: r.ok, status: r.status, data });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message });
  }
}
