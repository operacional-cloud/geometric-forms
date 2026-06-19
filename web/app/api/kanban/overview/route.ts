import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { getKanbanOverview } from '@/lib/server/kanban';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  const sellerParam = url.searchParams.get('seller_id');
  // seller_id 'null' (string) significa "sem vendedor"; ausente = todos
  const seller_id = sellerParam === null ? undefined : sellerParam === 'null' ? null : sellerParam;
  const data = await getKanbanOverview(ctx, {
    tenant_id: url.searchParams.get('tenant_id') || undefined,
    seller_id,
  });
  return Response.json({ success: true, data });
});
