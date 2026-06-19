import { withErrorHandler } from '@/lib/server/errors';
import { requireAiAccess } from '@/lib/server/ai-attendance';
import { refreshInstanceQR } from '@/lib/server/whatsapp';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (_req, { params }: { params: { id: string } }) => {
  const ctx = await requireAiAccess();
  const r = await refreshInstanceQR(ctx, params.id, { tenant_id: ctx.profile.tenant_id });
  return Response.json({ success: true, data: r });
});
