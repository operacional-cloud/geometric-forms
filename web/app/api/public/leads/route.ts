import { withErrorHandler } from '@/lib/server/errors';
import { submitPublicLead } from '@/lib/server/publicLeads';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (req) => {
  const body = await req.json();
  const data = await submitPublicLead(body, req.headers);
  return Response.json({ success: true, data }, { status: 201 });
});
