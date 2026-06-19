import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { updateSeller, deleteSeller } from '@/lib/server/sellers';

export const dynamic = 'force-dynamic';

export const PATCH = withErrorHandler(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireTenantMember();
  const body = await req.json();
  const seller = await updateSeller(ctx, params.id, {
    name: body?.name,
    email: body?.email,
    color: body?.color,
    active: body?.active,
    tenant_id: body?.tenant_id,
  });
  return Response.json({ success: true, data: { seller } });
});

export const DELETE = withErrorHandler(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  await deleteSeller(ctx, params.id, { tenant_id: url.searchParams.get('tenant_id') || undefined });
  return Response.json({ success: true });
});
