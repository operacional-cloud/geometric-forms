import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { listSellers, createSeller } from '@/lib/server/sellers';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  const sellers = await listSellers(ctx, {
    tenant_id: url.searchParams.get('tenant_id'),
    include_inactive: url.searchParams.get('include_inactive') === 'true',
  });
  return Response.json({ success: true, data: { sellers } });
});

export const POST = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const body = await req.json();
  const seller = await createSeller(ctx, {
    name: body?.name,
    email: body?.email,
    color: body?.color,
    tenant_id: body?.tenant_id,
  });
  return Response.json({ success: true, data: { seller } });
});
