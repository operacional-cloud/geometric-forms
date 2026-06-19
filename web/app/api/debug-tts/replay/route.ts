import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { processInboundMessage } from '@/lib/server/whatsapp';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** POST { conv_id, text? } — replay processInboundMessage manualmente pra debug. */
export async function POST(req: Request) {
  const log: string[] = [];
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const convId = String(body?.conv_id || '');
    log.push(`Start: conv_id=${convId}`);
    const { data: conv } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('id, instance_id, remote_jid, is_group, status, ai_paused, message_count')
      .eq('id', convId)
      .maybeSingle();
    if (!conv) return Response.json({ ok: false, log: [...log, 'conv not found'] });
    const { data: inst } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('evolution_instance, status, tenant_id')
      .eq('id', conv.instance_id)
      .maybeSingle();
    if (!inst) return Response.json({ ok: false, log: [...log, 'inst not found'] });
    log.push(`Conv state: status=${conv.status} ai_paused=${conv.ai_paused} is_group=${conv.is_group}`);
    log.push(`Inst: ${inst.evolution_instance} status=${inst.status}`);

    const text = String(body?.text || 'teste de replay');
    log.push(`Calling processInboundMessage with text="${text}"`);
    const r = await processInboundMessage({
      evolutionInstance: inst.evolution_instance,
      remoteJid: conv.remote_jid,
      displayName: 'Debug',
      text,
      isGroup: conv.is_group,
      wasAudio: false,
    });
    log.push(`Result: ${JSON.stringify(r)}`);
    return Response.json({ ok: true, log, total_ms: Date.now() - t0 });
  } catch (e: any) {
    log.push(`ERR: ${e?.message || e} stack: ${e?.stack?.split('\n')[1] || ''}`);
    return Response.json({ ok: false, log, total_ms: Date.now() - t0 });
  }
}
