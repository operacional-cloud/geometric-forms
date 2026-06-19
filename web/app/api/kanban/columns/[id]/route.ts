import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { updateKanbanColumn, deleteKanbanColumn } from '@/lib/server/kanban';

export const dynamic = 'force-dynamic';

export const PATCH = withErrorHandler(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireTenantMember();
  const body = await req.json();
  const col = await updateKanbanColumn(ctx, params.id, {
    name: body?.name,
    color: body?.color,
    position: body?.position,
    kind: body?.kind,
    tenant_id: body?.tenant_id,
  });
  return Response.json({ success: true, data: { column: col } });
});

export const DELETE = withErrorHandler(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  await deleteKanbanColumn(ctx, params.id, { tenant_id: url.searchParams.get('tenant_id') || undefined });
  return Response.json({ success: true });
});
