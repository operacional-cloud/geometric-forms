import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { listLeads } from '@/lib/server/forms';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit')) || 100;
  const formId = url.searchParams.get('form_id');
  const onlyQualified = url.searchParams.get('qualified') === 'true';
  const data = await listLeads(ctx, { limit, formId, onlyQualified });
  return Response.json({ success: true, data });
});
