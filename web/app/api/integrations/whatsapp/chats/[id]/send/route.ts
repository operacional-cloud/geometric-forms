import { handleIntegration, preflight } from '@/lib/server/integration-auth';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { AppError, NotFoundError, ValidationError } from '@/lib/server/errors';
import { sendText } from '@/lib/server/evolution';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const OPTIONS = (req: Request) => preflight(req);

/**
 * POST /api/integrations/whatsapp/chats/{id}/send
 * Body: { text: string }
 * Envia mensagem como source='human' (assume controle da IA pra esse turno).
 */
export const POST = handleIntegration(async (req, ctx) => {
  const parts = new URL(req.url).pathname.split('/');
  const convId = parts[parts.length - 2];
  const body = await req.json().catch(() => ({}));
  const text = String(body?.text || '').trim();
  if (!text) throw new ValidationError('Campo `text` obrigatório.');

  const { data: conv, error: errC } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('id, remote_jid, instance_id')
    .eq('id', convId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (errC) throw new AppError(errC.message, { status: 500 });
  if (!conv) throw new NotFoundError('Conversa não encontrada.');

  const { data: instance, error: errI } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('instance_name')
    .eq('id', (conv as any).instance_id)
    .single();
  if (errI || !instance) throw new AppError('Instância WhatsApp não encontrada.', { status: 500 });

  const sent = await sendText((instance as any).instance_name, (conv as any).remote_jid, text);

  await supabaseAdmin.from('whatsapp_messages').insert({
    conversation_id: convId,
    direction: 'outbound',
    source: 'human',
    content: text,
    evolution_message_id: sent?.key?.id || null,
    metadata: { sent_via: 'integration_api' },
  });

  await supabaseAdmin
    .from('whatsapp_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: text.slice(0, 120),
      message_count: ((conv as any).message_count || 0) + 1,
    })
    .eq('id', convId);

  return Response.json({ success: true, data: { sent: true, evolution_message_id: sent?.key?.id || null } });
});
