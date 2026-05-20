import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { updateForm, deleteForm } from '@/lib/server/forms';

export const dynamic = 'force-dynamic';

export const PUT = withErrorHandler(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireTenantMember();
  const body = await req.json();
  const data = await updateForm(ctx, params.id, body);
  return Response.json({ success: true, data });
});

export const DELETE = withErrorHandler(async (_req, { params }: { params: { id: string } }) => {
  const ctx = await requireTenantMember();
  const data = await deleteForm(ctx, params.id);
  return Response.json({ success: true, data });
});
