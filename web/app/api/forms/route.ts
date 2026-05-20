import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { createForm, listForms } from '@/lib/server/forms';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const body = await req.json();
  const data = await createForm(ctx, body);
  return Response.json({ success: true, data }, { status: 201 });
});

export const GET = withErrorHandler(async () => {
  const ctx = await requireTenantMember();
  const data = await listForms(ctx);
  return Response.json({ success: true, data });
});
