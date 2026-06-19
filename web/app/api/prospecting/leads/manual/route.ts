import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { createManualLead } from '@/lib/server/prospecting';
import { manualLeadSchema } from '@/lib/server/validators';

export const dynamic = 'force-dynamic';

/**
 * Adiciona um lead manual (não-prospectado).
 * Body: { name?, phone, niche, city?, tenant_id? }
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const body = await req.json();
  const parsed = manualLeadSchema.parse(body);
  const result = await createManualLead(ctx, parsed);
  return Response.json({ success: true, data: result });
});
