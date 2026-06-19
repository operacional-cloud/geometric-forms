import { withErrorHandler, AppError } from '@/lib/server/errors';
import { requireAiAccess } from '@/lib/server/ai-attendance';
import { processChatTurn } from '@/lib/server/meta-ads-ai';
import { supabaseAdmin } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = withErrorHandler(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireAiAccess();
  if (!ctx.profile.tenant_id) throw new AppError('Sem tenant.', { status: 403 });
  const body = await req.json();
  const text = String(body?.text || '').trim();
  if (!text) throw new AppError('Mensagem vazia.', { status: 400 });

  // Garante que conversa pertence ao tenant
  const { data: conv } = await supabaseAdmin
    .from('meta_ads_ai_conversations')
    .select('id, tenant_id, title')
    .eq('id', params.id)
    .eq('tenant_id', ctx.profile.tenant_id)
    .maybeSingle();
  if (!conv) throw new AppError('Conversa não encontrada.', { status: 404 });

  const r = await processChatTurn({
    conversationId: params.id,
    tenantId: ctx.profile.tenant_id,
    userText: text,
  });

  // Se o título ainda é "Nova conversa", define a partir dos primeiros 60 chars do texto
  if ((conv as any).title === 'Nova conversa') {
    await supabaseAdmin
      .from('meta_ads_ai_conversations')
      .update({ title: text.slice(0, 60) })
      .eq('id', params.id);
  }

  return Response.json({ success: true, data: { reply: r.assistantText } });
});
