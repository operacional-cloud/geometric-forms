import { withErrorHandler, AppError } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { assignLeadToSeller } from '@/lib/server/sellers';

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
  await assignLeadToSeller(ctx, {
    lead_id: body.lead_id,
    origin: body.origin,
    seller_id: body.seller_id || null,
    tenant_id: body.tenant_id,
  });
  return Response.json({ success: true });
});
