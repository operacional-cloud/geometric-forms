import { withErrorHandler, AppError } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { addLeadTag, removeLeadTag } from '@/lib/server/kanban';

export const dynamic = 'force-dynamic';

function validate(body: any) {
  if (!body?.lead_id || !body?.origin || !body?.tag) {
    throw new AppError('lead_id, origin e tag obrigatórios.', { status: 400 });
  }
  if (!['form', 'manual', 'prospecting'].includes(body.origin)) {
    throw new AppError('origin inválido.', { status: 400 });
  }
}

export const POST = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const body = await req.json();
  validate(body);
  const tags = await addLeadTag(ctx, {
    lead_id: body.lead_id,
    origin: body.origin,
    tag: String(body.tag),
    tenant_id: body.tenant_id,
  });
  return Response.json({ success: true, data: { tags } });
});

export const DELETE = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const body = await req.json();
  validate(body);
  const tags = await removeLeadTag(ctx, {
    lead_id: body.lead_id,
    origin: body.origin,
    tag: String(body.tag),
    tenant_id: body.tenant_id,
  });
  return Response.json({ success: true, data: { tags } });
});
