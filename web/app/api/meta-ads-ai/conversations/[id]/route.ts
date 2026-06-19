import { withErrorHandler, AppError } from '@/lib/server/errors';
import { requireAiAccess } from '@/lib/server/ai-attendance';
import { supabaseAdmin } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';

export const DELETE = withErrorHandler(async (_req, { params }: { params: { id: string } }) => {
  const ctx = await requireAiAccess();
  if (!ctx.profile.tenant_id) throw new AppError('Sem tenant.', { status: 403 });
  await supabaseAdmin
    .from('meta_ads_ai_conversations')
    .delete()
    .eq('id', params.id)
    .eq('tenant_id', ctx.profile.tenant_id);
  return Response.json({ success: true });
});

export const PATCH = withErrorHandler(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireAiAccess();
  if (!ctx.profile.tenant_id) throw new AppError('Sem tenant.', { status: 403 });
  const body = await req.json();
  const updates: any = {};
  if (typeof body?.title === 'string') updates.title = body.title.slice(0, 100);
  if (Object.keys(updates).length === 0) return Response.json({ success: true });
  await supabaseAdmin
    .from('meta_ads_ai_conversations')
    .update(updates)
    .eq('id', params.id)
    .eq('tenant_id', ctx.profile.tenant_id);
  return Response.json({ success: true });
});
