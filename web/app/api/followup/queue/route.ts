import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { listQueue } from '@/lib/server/followup';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  const queue = await listQueue(ctx, {
    tenant_id: url.searchParams.get('tenant_id'),
    status: url.searchParams.get('status') || undefined,
  });
  return Response.json({ success: true, data: { queue } });
});
