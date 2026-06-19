import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { listConversations } from '@/lib/server/whatsapp';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  const conversations = await listConversations(ctx, {
    tenant_id: url.searchParams.get('tenant_id'),
    instance_id: url.searchParams.get('instance_id') || undefined,
    status: url.searchParams.get('status') || undefined,
    limit: Number(url.searchParams.get('limit')) || 100,
  });
  return Response.json({ success: true, data: { conversations } });
});
