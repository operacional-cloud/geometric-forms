import { withErrorHandler, AppError } from '@/lib/server/errors';
import { requireAiAccess } from '@/lib/server/ai-attendance';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import * as evo from '@/lib/server/evolution';

export const dynamic = 'force-dynamic';

/**
 * Envia mensagem manual da UI de IA de Atendimento. Funciona pra contatos E grupos.
 * Marca source='human' e pausa a IA automaticamente (a IA não responde grupos por padrão de qualquer forma).
 */
export const POST = withErrorHandler(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireAiAccess();
  const body = await req.json();
  const text = String(body?.text || '').trim();
  if (!text) throw new AppError('Mensagem vazia.', { status: 400 });

  const { data: conv, error: errC } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('id, instance_id, remote_jid, is_group, message_count, ai_paused')
    .eq('id', params.id)
    .eq('tenant_id', ctx.profile.tenant_id)
    .single();
  if (errC || !conv) throw new AppError('Conversa não encontrada.', { status: 404 });

  const { data: inst, error: errI } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('evolution_instance, status')
    .eq('id', conv.instance_id)
    .single();
  if (errI || !inst) throw new AppError('Conexão não encontrada.', { status: 404 });
  if (inst.status !== 'connected') {
    throw new AppError('Esta conexão WhatsApp não está ativa.', { status: 400 });
  }

  let messageId: string | null = null;
  try {
    const sent = await evo.sendText(inst.evolution_instance, conv.remote_jid, text);
    messageId = sent?.key?.id || null;
  } catch (err: any) {
    throw new AppError(`Falha ao enviar via WhatsApp: ${err?.message || err}`, { status: 502 });
  }

  await supabaseAdmin.from('whatsapp_messages').insert({
    conversation_id: conv.id,
    direction: 'outbound',
    source: 'human',
    content: text,
    evolution_message_id: messageId,
  });

  await supabaseAdmin
    .from('whatsapp_conversations')
    .update({
      ai_paused: true,
      status: 'human_takeover',
      last_message_at: new Date().toISOString(),
      last_message_preview: text.slice(0, 200),
      message_count: ((conv as any).message_count || 0) + 1,
    })
    .eq('id', conv.id);

  return Response.json({ success: true });
});
