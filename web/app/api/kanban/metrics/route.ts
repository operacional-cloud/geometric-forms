import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { getKanbanMetrics } from '@/lib/server/kanban';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  const metrics = await getKanbanMetrics(ctx, { tenant_id: url.searchParams.get('tenant_id') || undefined });
  return Response.json({ success: true, data: metrics });
});
