import { withErrorHandler, AppError } from '@/lib/server/errors';
import { requireAiAccess } from '@/lib/server/ai-attendance';
import { supabaseAdmin } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (_req, { params }: { params: { id: string } }) => {
  const ctx = await requireAiAccess();
  if (!ctx.profile.tenant_id) throw new AppError('Sem tenant.', { status: 403 });
  // Valida que conversa pertence ao tenant
  const { data: conv } = await supabaseAdmin
    .from('meta_ads_ai_conversations')
    .select('id')
    .eq('id', params.id)
    .eq('tenant_id', ctx.profile.tenant_id)
    .maybeSingle();
  if (!conv) throw new AppError('Conversa não encontrada.', { status: 404 });
  const { data, error } = await supabaseAdmin
    .from('meta_ads_ai_messages')
    .select('*')
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: true });
  if (error) throw new AppError(error.message, { status: 500 });
  return Response.json({ success: true, data: { messages: data || [] } });
});
