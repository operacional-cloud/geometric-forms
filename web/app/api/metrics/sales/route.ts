import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { getSalesDashboard } from '@/lib/server/kanban';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setDate(today.getDate() - 30);
  const start = url.searchParams.get('start') || monthAgo.toISOString().slice(0, 10);
  const end = url.searchParams.get('end') || today.toISOString().slice(0, 10);
  const data = await getSalesDashboard(ctx, {
    start, end,
    tenant_id: url.searchParams.get('tenant_id') || undefined,
  });
  return Response.json({ success: true, data });
});
