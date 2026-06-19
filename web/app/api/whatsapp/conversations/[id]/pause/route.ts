import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { setConversationPause } from '@/lib/server/whatsapp';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireTenantMember();
  const body = await req.json().catch(() => ({}));
  const url = new URL(req.url);
  await setConversationPause(ctx, params.id, !!body.paused, {
    tenant_id: url.searchParams.get('tenant_id'),
  });
  return Response.json({ success: true });
});
