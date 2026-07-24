import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { getSequence, updateSequence, deleteSequence } from '@/lib/server/followup';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireTenantMember();
  const { id } = await params;
  const url = new URL(req.url);
  const sequence = await getSequence(ctx, id, { tenant_id: url.searchParams.get('tenant_id') });
  return Response.json({ success: true, data: { sequence } });
});

export const PUT = withErrorHandler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireTenantMember();
  const { id } = await params;
  const body = await req.json();
  const url = new URL(req.url);
  const sequence = await updateSequence(ctx, id, {
    ...body,
    tenant_id: url.searchParams.get('tenant_id'),
  });
  return Response.json({ success: true, data: { sequence } });
});

export const DELETE = withErrorHandler(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireTenantMember();
  const { id } = await params;
  const url = new URL(req.url);
  await deleteSequence(ctx, id, { tenant_id: url.searchParams.get('tenant_id') });
  return Response.json({ success: true });
});
