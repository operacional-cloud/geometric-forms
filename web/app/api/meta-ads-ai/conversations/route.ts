import { withErrorHandler, AppError } from '@/lib/server/errors';
import { requireAiAccess } from '@/lib/server/ai-attendance';
import { supabaseAdmin } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async () => {
  const ctx = await requireAiAccess();
  if (!ctx.profile.tenant_id) throw new AppError('Sem tenant.', { status: 403 });
  const { data, error } = await supabaseAdmin
    .from('meta_ads_ai_conversations')
    .select('id, title, created_at, updated_at')
    .eq('tenant_id', ctx.profile.tenant_id)
    .order('updated_at', { ascending: false });
  if (error) throw new AppError(error.message, { status: 500 });
  return Response.json({ success: true, data: { conversations: data || [] } });
});

export const POST = withErrorHandler(async (req) => {
  const ctx = await requireAiAccess();
  if (!ctx.profile.tenant_id) throw new AppError('Sem tenant.', { status: 403 });
  const body = await req.json().catch(() => ({}));
  const title = String(body?.title || 'Nova conversa').slice(0, 100);
  const { data, error } = await supabaseAdmin
    .from('meta_ads_ai_conversations')
    .insert({ tenant_id: ctx.profile.tenant_id, title })
    .select('*')
    .single();
  if (error) throw new AppError(error.message, { status: 500 });
  return Response.json({ success: true, data: { conversation: data } });
});
