import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { deleteConversation } from '@/lib/server/whatsapp';

export const dynamic = 'force-dynamic';

export const DELETE = withErrorHandler(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenant_id');
  await deleteConversation(ctx, params.id, { tenant_id: tenantId });
  return Response.json({ success: true });
});
