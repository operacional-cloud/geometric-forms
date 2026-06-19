import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { listKanbanColumns, listAllLeadsForKanban } from '@/lib/server/kanban';

export const dynamic = 'force-dynamic';

/**
 * Retorna kanban completo: colunas + todos os leads (agregados de leads + prospecting_leads).
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenant_id');
  const [columns, leads] = await Promise.all([
    listKanbanColumns(ctx, { tenant_id: tenantId }),
    listAllLeadsForKanban(ctx, { tenant_id: tenantId || undefined }),
  ]);
  return Response.json({ success: true, data: { columns, leads } });
});
