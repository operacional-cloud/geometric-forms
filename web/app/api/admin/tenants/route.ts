import { withErrorHandler } from '@/lib/server/errors';
import { requireAdmin } from '@/lib/server/auth';
import { createClientTenant, listTenants } from '@/lib/server/tenants';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (req) => {
  await requireAdmin();
  const body = await req.json();
  const data = await createClientTenant(body);
  return Response.json({ success: true, data }, { status: 201 });
});

export const GET = withErrorHandler(async () => {
  await requireAdmin();
  const data = await listTenants();
  return Response.json({ success: true, data });
});
