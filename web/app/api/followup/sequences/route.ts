import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { listSequences, createSequence } from '@/lib/server/followup';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  const sequences = await listSequences(ctx, { tenant_id: url.searchParams.get('tenant_id') });
  return Response.json({ success: true, data: { sequences } });
});

export const POST = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const body = await req.json();
  const url = new URL(req.url);
  const sequence = await createSequence(ctx, {
    ...body,
    tenant_id: url.searchParams.get('tenant_id'),
  });
  return Response.json({ success: true, data: { sequence } });
});
