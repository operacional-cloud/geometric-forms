import { supabaseAdmin } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const log: any = {};
  // Tabelas existem?
  try {
    const { error: e1 } = await supabaseAdmin.from('meta_ads_ai_conversations').select('id').limit(1);
    log.conv_table = e1 ? `ERR: ${e1.message}` : 'OK';
  } catch (e: any) { log.conv_table = `EX: ${e?.message}`; }
  try {
    const { error: e2 } = await supabaseAdmin.from('meta_ads_ai_messages').select('id').limit(1);
    log.msg_table = e2 ? `ERR: ${e2.message}` : 'OK';
  } catch (e: any) { log.msg_table = `EX: ${e?.message}`; }
  // Tenants com key?
  try {
    const { data } = await supabaseAdmin
      .from('tenants')
      .select('id, name, meta_ad_account_id, anthropic_api_key')
      .order('created_at', { ascending: false })
      .limit(10);
    log.tenants = (data || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      has_meta_account: !!t.meta_ad_account_id,
      meta_account: t.meta_ad_account_id,
      has_anthropic_key: !!t.anthropic_api_key,
      key_prefix: t.anthropic_api_key ? String(t.anthropic_api_key).slice(0, 12) + '...' : null,
    }));
  } catch (e: any) { log.tenants = `EX: ${e?.message}`; }
  // Últimas conversas
  try {
    const { data } = await supabaseAdmin
      .from('meta_ads_ai_conversations')
      .select('id, title, tenant_id, updated_at')
      .order('updated_at', { ascending: false })
      .limit(5);
    log.recent_conversations = data;
  } catch (e: any) { log.recent_conversations = `EX: ${e?.message}`; }
  // Últimas mensagens
  try {
    const { data } = await supabaseAdmin
      .from('meta_ads_ai_messages')
      .select('id, role, content, tool_calls, tool_call_id, tool_result, created_at')
      .order('created_at', { ascending: false })
      .limit(30);
    log.recent_messages = (data || []).map((m: any) => ({
      role: m.role,
      created_at: m.created_at,
      content_preview: m.content ? String(m.content).slice(0, 250) : null,
      tool_calls_names: Array.isArray(m.tool_calls) ? m.tool_calls.map((tc: any) => tc.name) : [],
      tool_call_id: m.tool_call_id,
      tool_result_preview: m.tool_result ? JSON.stringify(m.tool_result).slice(0, 400) : null,
    }));
  } catch (e: any) { log.recent_messages = `EX: ${e?.message}`; }
  return Response.json(log);
}
