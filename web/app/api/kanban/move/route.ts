import { withErrorHandler, AppError } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { moveLead } from '@/lib/server/kanban';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const body = await req.json();
  if (!body?.lead_id || !body?.origin) {
    throw new AppError('lead_id e origin obrigatórios.', { status: 400 });
  }
  if (!['form', 'manual', 'prospecting'].includes(body.origin)) {
    throw new AppError('origin inválido.', { status: 400 });
  }
  await moveLead(ctx, {
    lead_id: body.lead_id,
    origin: body.origin,
    column_id: body.column_id || null,
    deal_value: body.deal_value,
    notes: body.notes,
    tenant_id: body.tenant_id,
  });
  return Response.json({ success: true });
});
