import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { getTagMetrics } from '@/lib/server/kanban';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenant_id') || undefined;
  const tags = await getTagMetrics(ctx, { tenant_id: tenantId });
  return Response.json({ success: true, data: { tags } });
});
