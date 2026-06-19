import { synthesizeSpeech } from '@/lib/server/gemini';
import * as evo from '@/lib/server/evolution';
import { supabaseAdmin } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';

/**
 * Endpoint diagnóstico: POST { conv_id, text }
 * Pega a conversa, gera TTS, tenta enviar via Evolution. Retorna logs detalhados.
 */
export async function POST(req: Request) {
  const log: string[] = [];
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const convId = String(body?.conv_id || '');
    const text = String(body?.text || 'Olá, este é um teste de áudio gerado pela inteligência artificial.');
    log.push(`Start: conv_id=${convId} text_len=${text.length}`);

    const { data: conv } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('id, instance_id, remote_jid')
      .eq('id', convId)
      .maybeSingle();
    if (!conv) return Response.json({ ok: false, log: [...log, 'conv not found'] });
    log.push(`Found conv jid=${conv.remote_jid}`);

    const { data: inst } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('evolution_instance, status')
      .eq('id', conv.instance_id)
      .maybeSingle();
    if (!inst) return Response.json({ ok: false, log: [...log, 'inst not found'] });
    log.push(`Inst ${inst.evolution_instance} status=${inst.status}`);

    log.push('Calling synthesizeSpeech...');
    const audio = await synthesizeSpeech(text);
    log.push(`TTS result: ${audio ? `OK len=${audio.base64.length} mime=${audio.mimetype}` : 'NULL'}`);
    if (!audio) return Response.json({ ok: false, log });

    log.push('Calling evo.sendAudio...');
    try {
      const sent = await evo.sendAudio(inst.evolution_instance, conv.remote_jid, audio.base64);
      log.push(`Sent OK key=${JSON.stringify(sent?.key || {})}`);
    } catch (e: any) {
      log.push(`Send ERR: ${e?.message || e}`);
      log.push(`Send data: ${JSON.stringify(e?.data || {}).slice(0, 400)}`);
      return Response.json({ ok: false, log, total_ms: Date.now() - t0 });
    }
    return Response.json({ ok: true, log, total_ms: Date.now() - t0 });
  } catch (e: any) {
    log.push(`Outer ERR: ${e?.message || e}`);
    return Response.json({ ok: false, log, total_ms: Date.now() - t0 });
  }
}
