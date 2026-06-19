import { withErrorHandler } from '@/lib/server/errors';
import { requireAiAccess } from '@/lib/server/ai-attendance';
import { deleteWhatsAppInstance } from '@/lib/server/whatsapp';

export const dynamic = 'force-dynamic';

export const DELETE = withErrorHandler(async (_req, { params }: { params: { id: string } }) => {
  const ctx = await requireAiAccess();
  await deleteWhatsAppInstance(ctx, params.id, { tenant_id: ctx.profile.tenant_id });
  return Response.json({ success: true });
});
