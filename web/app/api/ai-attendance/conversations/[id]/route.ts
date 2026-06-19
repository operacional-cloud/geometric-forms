import { withErrorHandler } from '@/lib/server/errors';
import { requireAiAccess } from '@/lib/server/ai-attendance';
import { deleteConversation, setConversationPause } from '@/lib/server/whatsapp';

export const dynamic = 'force-dynamic';

export const DELETE = withErrorHandler(async (_req, { params }: { params: { id: string } }) => {
  const ctx = await requireAiAccess();
  await deleteConversation(ctx, params.id, { tenant_id: ctx.profile.tenant_id });
  return Response.json({ success: true });
});

export const PATCH = withErrorHandler(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireAiAccess();
  const body = await req.json();
  if (typeof body?.ai_paused === 'boolean') {
    await setConversationPause(ctx, params.id, body.ai_paused, { tenant_id: ctx.profile.tenant_id });
  }
  return Response.json({ success: true });
});
