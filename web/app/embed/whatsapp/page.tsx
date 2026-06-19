import { supabaseAdmin } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';

/**
 * /embed/whatsapp?token=<INTEGRATION_API_TOKEN>&tenant_id=<uuid|slug>
 * Lista compacta das últimas 50 conversas WhatsApp.
 */
export default async function EmbedWhatsapp({
  searchParams,
}: {
  searchParams: { token?: string; tenant_id?: string };
}) {
  const expected = process.env.INTEGRATION_API_TOKEN || '';
  const token = searchParams.token || '';
  const tenantIdent = (searchParams.tenant_id || '').trim();

  if (!expected || token !== expected) return <Err msg="Token inválido ou ausente." />;
  if (!tenantIdent) return <Err msg="Tenant não informado." />;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantIdent);
  const { data: tenant } = await supabaseAdmin
    .from('tenants').select('id, name, slug').eq(isUuid ? 'id' : 'slug', tenantIdent).maybeSingle();
  if (!tenant) return <Err msg="Tenant não encontrado." />;

  const { data: convs } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('id, remote_jid, display_name, status, last_message_at, last_message_preview, message_count, is_group, group_subject, ai_paused')
    .eq('tenant_id', (tenant as any).id)
    .eq('is_group', false)
    .order('last_message_at', { ascending: false })
    .limit(50);

  const rows = convs || [];
  const statusColor: Record<string, string> = {
    qualifying: '#FFC857',
    qualified: '#10F2A0',
    rejected: '#FF6363',
    transferred: '#A66EFC',
    paused: '#888',
    human_takeover: '#5EE2FF',
  };

  return (
    <main className="p-4 md:p-6">
      <header className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-fg-dim font-mono">WhatsApp</div>
          <h1 className="text-xl md:text-2xl font-semibold mt-1">{(tenant as any).name}</h1>
        </div>
        <div className="text-[11px] font-mono text-fg-dim">{rows.length} conversas</div>
      </header>

      <div className="rounded-lg border border-line/60 overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-3 py-8 text-center text-fg-dim italic text-sm">Nenhuma conversa.</div>
        ) : rows.map((c: any) => (
          <div key={c.id} className="border-t border-line/40 first:border-t-0 px-3 py-2.5 hover:bg-white/[0.04]">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: statusColor[c.status] || '#666' }}/>
                <div className="min-w-0">
                  <div className="text-sm truncate">{c.display_name || c.remote_jid.split('@')[0]}</div>
                  <div className="text-[11px] text-fg-dim truncate">{c.last_message_preview || ''}</div>
                </div>
              </div>
              <div className="text-right text-[11px] font-mono text-fg-dim flex-shrink-0">
                <div>{new Date(c.last_message_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                <div className="mt-0.5">{c.message_count} msgs</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function Err({ msg }: { msg: string }) {
  return (
    <main className="min-h-[60vh] flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-3">
        <div className="text-[10px] uppercase tracking-widest text-danger font-mono">Acesso negado</div>
        <p className="text-sm text-fg-muted">{msg}</p>
      </div>
    </main>
  );
}
