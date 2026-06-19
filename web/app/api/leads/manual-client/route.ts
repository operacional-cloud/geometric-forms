import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { createManualClientLead } from '@/lib/server/kanban';

export const dynamic = 'force-dynamic';

/**
 * Cliente cria lead manual (sem vinculo com form / sem scraping).
 * Body: { name?, phone?, email?, notes?, deal_value?, column_id?, tenant_id? }
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const body = await req.json();
  const lead = await createManualClientLead(ctx, {
    name: body?.name,
    phone: body?.phone,
    email: body?.email,
    notes: body?.notes,
    deal_value: body?.deal_value,
    column_id: body?.column_id,
    tenant_id: body?.tenant_id,
  });
  return Response.json({ success: true, data: { lead } });
});
