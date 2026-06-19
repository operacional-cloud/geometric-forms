import { withErrorHandler } from '@/lib/server/errors';
import { requireAdmin } from '@/lib/server/auth';
import { getTenantPlanStatus } from '@/lib/server/plans';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/tenants/{id}/plan
 * Retorna plano + uso atual vs. limite do tenant (formulários e leads/mês).
 * Admin-only. Base pra futura tela de planos e pro billing (Fase 2).
 */
export const GET = withErrorHandler(async (_req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const status = await getTenantPlanStatus(params.id);
  return Response.json({ success: true, data: status });
});
