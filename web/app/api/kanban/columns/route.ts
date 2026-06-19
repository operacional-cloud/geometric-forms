import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { listKanbanColumns, createKanbanColumn } from '@/lib/server/kanban';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  const cols = await listKanbanColumns(ctx, { tenant_id: url.searchParams.get('tenant_id') });
  return Response.json({ success: true, data: { columns: cols } });
});

export const POST = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const body = await req.json();
  const col = await createKanbanColumn(ctx, {
    name: body?.name,
    color: body?.color,
    position: body?.position,
    tenant_id: body?.tenant_id,
  });
  return Response.json({ success: true, data: { column: col } });
});
