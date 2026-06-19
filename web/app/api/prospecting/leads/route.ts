import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { listProspectingLeads, getProspectingStats } from '@/lib/server/prospecting';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit')) || 200;
  const status = url.searchParams.get('status');
  const tenantId = url.searchParams.get('tenant_id');

  const [{ leads }, stats] = await Promise.all([
    listProspectingLeads(ctx, { limit, status, tenantId }),
    getProspectingStats(ctx, { tenantId }),
  ]);
  return Response.json({ success: true, data: { leads, stats } });
});
