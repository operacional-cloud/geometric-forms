import { handleIntegration, preflight } from '@/lib/server/integration-auth';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { AppError, NotFoundError } from '@/lib/server/errors';

export const dynamic = 'force-dynamic';

export const OPTIONS = (req: Request) => preflight(req);

/** GET /api/integrations/whatsapp/chats/{id}/messages?limit=200 */
export const GET = handleIntegration(async (req, ctx) => {
  const url = new URL(req.url);
  const parts = url.pathname.split('/');
  // .../chats/{id}/messages
  const convId = parts[parts.length - 2];
  const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 1000);

  const { data: conv, error: errC } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('id')
    .eq('id', convId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (errC) throw new AppError(errC.message, { status: 500 });
  if (!conv) throw new NotFoundError('Conversa não encontrada.');

  const { data, error } = await supabaseAdmin
    .from('whatsapp_messages')
    .select('id, direction, source, content, evolution_message_id, metadata, created_at')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new AppError(error.message, { status: 500 });

  return Response.json({ success: true, data: { messages: data || [] } });
});
