import { supabaseAdmin } from '@/lib/server/supabase-admin';
import * as evo from '@/lib/server/evolution';

export const dynamic = 'force-dynamic';

/** POST { conv_id } — testa fake call pro número dessa conversa. */
export async function POST(req: Request) {
  const log: string[] = [];
  try {
    const body = await req.json().catch(() => ({}));
    const convId = String(body?.conv_id || '');
    log.push(`Start: conv_id=${convId}`);
    const { data: conv } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('id, instance_id, remote_jid, is_group')
      .eq('id', convId)
      .maybeSingle();
    if (!conv) return Response.json({ ok: false, log: [...log, 'conv not found'] });
    log.push(`Found conv jid=${conv.remote_jid} group=${conv.is_group}`);
    const { data: inst } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('evolution_instance, status')
      .eq('id', conv.instance_id)
      .maybeSingle();
    if (!inst) return Response.json({ ok: false, log: [...log, 'inst not found'] });
    log.push(`Inst ${inst.evolution_instance} status=${inst.status}`);

    log.push('Calling evo.fakeCall...');
    const r = await evo.fakeCall(inst.evolution_instance, conv.remote_jid, { callDurationSec: 8 });
    log.push(`Result: ok=${r.ok} data=${JSON.stringify(r.data || {}).slice(0, 300)}`);
    return Response.json({ ok: r.ok, log });
  } catch (e: any) {
    log.push(`ERR: ${e?.message || e}`);
    return Response.json({ ok: false, log });
  }
}
