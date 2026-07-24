import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { getFollowupEnabled, setFollowupEnabled } from '@/lib/server/followup';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenant_id') || ctx.profile.tenant_id;
  const enabled = await getFollowupEnabled(tenantId!);
  return Response.json({ success: true, data: { enabled } });
});

export const PUT = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const body = await req.json();
  const url = new URL(req.url);
  const enabled = await setFollowupEnabled(ctx, !!body.enabled, {
    tenant_id: url.searchParams.get('tenant_id'),
  });
  return Response.json({ success: true, data: { enabled } });
});
