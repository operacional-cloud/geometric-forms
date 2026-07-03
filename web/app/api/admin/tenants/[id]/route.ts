import { withErrorHandler } from '@/lib/server/errors';
import { requireAdmin } from '@/lib/server/auth';
import { getTenantById, updateTenant, deleteTenant } from '@/lib/server/tenants';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (_req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const tenant = await getTenantById(params.id);
  return Response.json({ success: true, data: { tenant } });
});

export const PATCH = withErrorHandler(async (req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const body = await req.json();
  const tenant = await updateTenant(params.id, {
    name: body?.name,
    slug: body?.slug,
    logo_url: body?.logo_url,
    primary_color: body?.primary_color,
    secondary_color: body?.secondary_color,
    plan: body?.plan,
    plan_id: body?.plan_id,
    status: body?.status,
    meta_ad_account_id: body?.meta_ad_account_id,
    metrics_config: body?.metrics_config,
  });
  return Response.json({ success: true, data: { tenant } });
});

export const DELETE = withErrorHandler(async (_req, { params }: { params: { id: string } }) => {
  await requireAdmin();
  const data = await deleteTenant(params.id);
  return Response.json({ success: true, data });
});
