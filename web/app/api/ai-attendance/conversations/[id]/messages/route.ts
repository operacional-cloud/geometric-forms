import { withErrorHandler } from '@/lib/server/errors';
import { requireAiAccess } from '@/lib/server/ai-attendance';
import { listMessages } from '@/lib/server/whatsapp';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (_req, { params }: { params: { id: string } }) => {
  const ctx = await requireAiAccess();
  const messages = await listMessages(ctx, params.id, { tenant_id: ctx.profile.tenant_id, limit: 500 });
  return Response.json({ success: true, data: { messages } });
});
