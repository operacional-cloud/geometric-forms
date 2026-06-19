import { handleIntegration, preflight } from '@/lib/server/integration-auth';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { AppError } from '@/lib/server/errors';

export const dynamic = 'force-dynamic';

export const OPTIONS = (req: Request) => preflight(req);

/**
 * GET /api/integrations/whatsapp/chats?limit=50&include_groups=false&status=qualifying
 * Lista conversas WhatsApp do tenant (ordenadas por last_message_at desc).
 */
export const GET = handleIntegration(async (req, ctx) => {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
  const includeGroups = url.searchParams.get('include_groups') === 'true';
  const status = url.searchParams.get('status');

  let q = supabaseAdmin
    .from('whatsapp_conversations')
    .select('id, instance_id, remote_jid, display_name, status, qualification_summary, ai_paused, last_message_at, last_message_preview, message_count, is_group, group_subject, created_at')
    .eq('tenant_id', ctx.tenantId)
    .order('last_message_at', { ascending: false })
    .limit(limit);

  if (!includeGroups) q = q.eq('is_group', false);
  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) throw new AppError(error.message, { status: 500 });

  return Response.json({ success: true, data: { conversations: data || [] } });
});
