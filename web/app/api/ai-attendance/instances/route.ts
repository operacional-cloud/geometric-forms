import { withErrorHandler, AppError } from '@/lib/server/errors';
import { requireAiAccess } from '@/lib/server/ai-attendance';
import { listWhatsAppInstances, createWhatsAppInstance } from '@/lib/server/whatsapp';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async () => {
  const ctx = await requireAiAccess();
  const instances = await listWhatsAppInstances(ctx, { tenant_id: ctx.profile.tenant_id });
  return Response.json({ success: true, data: { instances } });
});

export const POST = withErrorHandler(async (req) => {
  const ctx = await requireAiAccess();
  const body = await req.json();
  const name = String(body?.name || '').trim();
  if (!name) throw new AppError('Nome obrigatório.', { status: 400 });
  const instance = await createWhatsAppInstance(ctx, {
    name,
    tenant_id: ctx.profile.tenant_id,
  });
  return Response.json({ success: true, data: { instance } });
});
