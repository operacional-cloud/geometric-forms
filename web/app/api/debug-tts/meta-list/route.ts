import { listAdAccounts } from '@/lib/server/meta-ads';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const accounts = await listAdAccounts();
    return Response.json({
      ok: true,
      count: accounts.length,
      sample: accounts.slice(0, 10).map((a) => ({ id: a.id, name: a.name })),
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message || String(e) });
  }
}
