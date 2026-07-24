import { processFollowupQueue, checkAndEnqueueInactive } from '@/lib/server/followup';
import { supabaseAdmin } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') || '';
  if (secret && auth !== `Bearer ${secret}`) {
    return new Response('unauthorized', { status: 401 });
  }
  try {
    const { data: tenants } = await supabaseAdmin
      .from('whatsapp_prompts')
      .select('tenant_id')
      .eq('followup_enabled', true);

    let totalEnqueued = 0;
    for (const t of tenants || []) {
      const n = await checkAndEnqueueInactive(t.tenant_id);
      totalEnqueued += n;
    }

    const result = await processFollowupQueue();
    return Response.json({ ok: true, enqueued: totalEnqueued, ...result });
  } catch (err: any) {
    console.log(JSON.stringify({ level: 'error', msg: 'followup_cron_error', err: err?.message }));
    return Response.json({ ok: false, error: err?.message || 'erro' }, { status: 500 });
  }
}
