import { supabaseAdmin } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';

/** Endpoint diagnóstico: últimas 5 conversas + state. */
export async function GET() {
  const { data: convs } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('id, display_name, remote_jid, status, ai_paused, is_group, last_message_at, message_count')
    .eq('is_group', false)
    .order('last_message_at', { ascending: false })
    .limit(10);
  const { data, error } = await supabaseAdmin
    .from('whatsapp_messages')
    .select('id, conversation_id, direction, source, content, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return Response.json({ error: error.message });
  const { data: lucasMsgs } = await supabaseAdmin
    .from('whatsapp_messages')
    .select('id, direction, source, content, metadata, created_at')
    .eq('conversation_id', '06a08f4b-e22b-4095-8c19-b4bdeeb1bfe4')
    .order('created_at', { ascending: false })
    .limit(15);
  return Response.json({
    conversations: convs,
    lucas_messages: lucasMsgs,
    count: data?.length || 0,
    messages: (data || []).map((m: any) => ({
      id: m.id,
      direction: m.direction,
      source: m.source,
      created_at: m.created_at,
      was_audio: String(m.content || '').startsWith('🎤'),
      content_preview: String(m.content || '').slice(0, 120),
      metadata: m.metadata,
    })),
  });
}
