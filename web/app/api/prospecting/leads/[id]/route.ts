import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { deleteProspectingLead } from '@/lib/server/prospecting';

export const dynamic = 'force-dynamic';

export const DELETE = withErrorHandler(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenant_id');
  await deleteProspectingLead(ctx, params.id, { tenantId });
  return Response.json({ success: true });
});
