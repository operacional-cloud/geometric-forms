import { withErrorHandler } from '@/lib/server/errors';
import { trackFormEvent } from '@/lib/server/publicLeads';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (req) => {
  const body = await req.json();
  await trackFormEvent(body);
  return Response.json({ success: true });
});
