import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { listMessages } from '@/lib/server/whatsapp';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  const messages = await listMessages(ctx, params.id, {
    tenant_id: url.searchParams.get('tenant_id'),
    limit: Number(url.searchParams.get('limit')) || 500,
  });
  return Response.json({ success: true, data: { messages } });
});
