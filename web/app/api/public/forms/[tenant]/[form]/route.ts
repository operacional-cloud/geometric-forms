import { withErrorHandler } from '@/lib/server/errors';
import { getPublicForm } from '@/lib/server/publicLeads';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (
  _req,
  { params }: { params: { tenant: string; form: string } },
) => {
  const data = await getPublicForm(params.tenant, params.form);
  return Response.json({ success: true, data });
});
