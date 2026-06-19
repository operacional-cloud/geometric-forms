import { withErrorHandler, AppError } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import * as evo from '@/lib/server/evolution';

export const dynamic = 'force-dynamic';

/**
 * Envia mensagem manual (operador humano assumindo o atendimento).
 * Marca source='human' pra distinguir da IA na UI.
 */
export const POST = withErrorHandler(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireTenantMember();
  const body = await req.json();
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenant_id');
  const text = String(body?.text || '').trim();

  if (!text) throw new AppError('Mensagem vazia.', { status: 400 });

  // Busca conversa + instance (sem RLS, validamos manualmente)
  const effectiveTenant = (ctx.profile.role === 'admin' && tenantId)
    ? tenantId
    : ctx.profile.tenant_id;
  if (!effectiveTenant) throw new AppError('Sem tenant.', { status: 403 });

  const { data: conv, error: errC } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('id, instance_id, remote_jid, tenant_id')
    .eq('id', params.id)
    .eq('tenant_id', effectiveTenant)
    .single();
  if (errC || !conv) throw new AppError('Conversa não encontrada.', { status: 404 });

  const { data: inst, error: errI } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('evolution_instance, status')
    .eq('id', conv.instance_id)
    .single();
  if (errI || !inst) throw new AppError('Instance não encontrada.', { status: 404 });
  if (inst.status !== 'connected') {
    throw new AppError('A instância não está conectada.', { status: 400 });
  }

  // Envia via Evolution
  let messageId: string | null = null;
  try {
    const sent = await evo.sendText(inst.evolution_instance, conv.remote_jid, text);
    messageId = sent?.key?.id || null;
  } catch (err: any) {
    throw new AppError(`Falha ao enviar via WhatsApp: ${err?.message || err}`, { status: 502 });
  }

  // Salva no banco como mensagem outbound humana + pausa IA automaticamente
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
    })
    .eq('id', conv.id);

  return Response.json({ success: true });
});
