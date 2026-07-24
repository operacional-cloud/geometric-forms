import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { getFollowupStats } from '@/lib/server/followup';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  const stats = await getFollowupStats(ctx, { tenant_id: url.searchParams.get('tenant_id') });
  return Response.json({ success: true, data: { stats } });
});
