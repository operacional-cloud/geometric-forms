import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { extractFromUrls } from '@/lib/server/prospecting';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const body = await req.json();
  const data = await extractFromUrls(ctx, body);
  return Response.json({ success: true, data });
});
