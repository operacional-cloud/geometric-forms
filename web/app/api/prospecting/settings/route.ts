import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { getProspectingSettings, saveProspectingSettings } from '@/lib/server/prospecting';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async () => {
  const ctx = await requireTenantMember();
  const data = await getProspectingSettings(ctx);
  return Response.json({ success: true, data });
});

export const PUT = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const body = await req.json();
  const data = await saveProspectingSettings(ctx, body);
  return Response.json({ success: true, data });
});
