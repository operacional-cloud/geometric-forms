import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { refreshInstanceQR } from '@/lib/server/whatsapp';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenant_id');
  const data = await refreshInstanceQR(ctx, params.id, { tenant_id: tenantId });
  return Response.json({ success: true, data });
});
