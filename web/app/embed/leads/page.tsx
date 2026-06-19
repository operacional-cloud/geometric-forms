import { supabaseAdmin } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';

/**
 * /embed/leads?token=<INTEGRATION_API_TOKEN>&tenant_id=<uuid|slug>&qualified=true
 * Tabela compacta dos últimos 100 leads do tenant.
 */
export default async function EmbedLeads({
  searchParams,
}: {
  searchParams: { token?: string; tenant_id?: string; qualified?: string };
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

  let q = supabaseAdmin
    .from('leads')
    .select('id, answers, lead_score, is_qualified, status, deal_value, utm_source, created_at')
    .eq('tenant_id', (tenant as any).id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (searchParams.qualified === 'true') q = q.eq('is_qualified', true);

  const { data: leads } = await q;
  const rows = leads || [];

  return (
    <main className="p-4 md:p-6">
      <header className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-fg-dim font-mono">Leads</div>
          <h1 className="text-xl md:text-2xl font-semibold mt-1">{(tenant as any).name}</h1>
        </div>
        <div className="text-[11px] font-mono text-fg-dim">{rows.length} leads</div>
      </header>

      <div className="rounded-lg border border-line/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-2/50">
            <tr className="text-[10px] uppercase tracking-widest text-fg-dim">
              <th className="text-left px-3 py-2 font-medium">Nome</th>
              <th className="text-left px-3 py-2 font-medium">Telefone</th>
              <th className="text-left px-3 py-2 font-medium">Origem</th>
              <th className="text-right px-3 py-2 font-medium">Score</th>
              <th className="text-right px-3 py-2 font-medium">Valor</th>
              <th className="text-right px-3 py-2 font-medium">Data</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-fg-dim italic">Nenhum lead.</td></tr>
            ) : rows.map((l: any) => (
              <tr key={l.id} className="border-t border-line/40 hover:bg-white/[0.03]">
                <td className="px-3 py-2 truncate max-w-[180px]">
                  <div className="flex items-center gap-2">
                    {l.is_qualified && (
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#10F2A0' }} title="Qualificado"/>
                    )}
                    <span>{l.answers?.nome || '(sem nome)'}</span>
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-[12px] text-fg-muted">{l.answers?.telefone || '—'}</td>
                <td className="px-3 py-2 text-[12px] text-fg-muted">{l.utm_source || '—'}</td>
                <td className="px-3 py-2 text-right font-mono">{l.lead_score ?? '—'}</td>
                <td className="px-3 py-2 text-right font-mono">{l.deal_value ? `R$ ${Number(l.deal_value).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : '—'}</td>
                <td className="px-3 py-2 text-right text-[12px] text-fg-dim">
                  {new Date(l.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
