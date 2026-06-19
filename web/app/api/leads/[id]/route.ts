import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { deleteFormLead } from '@/lib/server/forms';

export const dynamic = 'force-dynamic';

export const DELETE = withErrorHandler(async (_req, { params }: { params: { id: string } }) => {
  const ctx = await requireTenantMember();
  await deleteFormLead(ctx, params.id);
  return Response.json({ success: true });
});
