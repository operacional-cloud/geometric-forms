import { withErrorHandler } from '@/lib/server/errors';
import { requireAiAccess } from '@/lib/server/ai-attendance';
import { listConversations } from '@/lib/server/whatsapp';

export const dynamic = 'force-dynamic';

/**
 * Lista TODAS conversas do tenant (contatos + grupos), pra UI de IA de Atendimento.
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await requireAiAccess();
  const url = new URL(req.url);
  const instanceId = url.searchParams.get('instance_id') || undefined;
  const conversations = await listConversations(ctx, {
    tenant_id: ctx.profile.tenant_id,
    instance_id: instanceId,
    includeGroups: true,
    limit: 300,
  });
  return Response.json({ success: true, data: { conversations } });
});
