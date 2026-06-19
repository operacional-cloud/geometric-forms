import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { getWhatsAppInstance, deleteWhatsAppInstance } from '@/lib/server/whatsapp';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenant_id');
  const instance = await getWhatsAppInstance(ctx, params.id, { tenant_id: tenantId });
  return Response.json({ success: true, data: { instance } });
});

export const DELETE = withErrorHandler(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenant_id');
  await deleteWhatsAppInstance(ctx, params.id, { tenant_id: tenantId });
  return Response.json({ success: true });
});
