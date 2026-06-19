import { withErrorHandler, AppError } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import {
  createWhatsAppInstance,
  listWhatsAppInstances,
} from '@/lib/server/whatsapp';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenant_id');
  const instances = await listWhatsAppInstances(ctx, { tenant_id: tenantId });
  return Response.json({ success: true, data: { instances } });
});

export const POST = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const body = await req.json();
  if (!body?.name || typeof body.name !== 'string') {
    throw new AppError('Campo "name" obrigatório.', { status: 400 });
  }
  const instance = await createWhatsAppInstance(ctx, {
    name: body.name,
    tenant_id: body.tenant_id,
  });
  return Response.json({ success: true, data: { instance } });
});
