import { withErrorHandler, AppError } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { startLeadQualification } from '@/lib/server/whatsapp';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Inicia qualificação de um lead prospectado via WhatsApp.
 * Body: { lead_id, instance_id, tenant_id? }
 *   - tenant_id obrigatório se admin
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const body = await req.json();

  if (!body?.lead_id || typeof body.lead_id !== 'string') {
    throw new AppError('Campo "lead_id" obrigatório.', { status: 400 });
  }
  if (!body?.instance_id || typeof body.instance_id !== 'string') {
    throw new AppError('Campo "instance_id" obrigatório.', { status: 400 });
  }

  const result = await startLeadQualification(ctx, {
    lead_id: body.lead_id,
    instance_id: body.instance_id,
    tenant_id: body.tenant_id,
  });

  return Response.json({ success: true, data: result });
});
