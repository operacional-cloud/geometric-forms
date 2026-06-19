import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { AppError } from '@/lib/server/errors';

export const dynamic = 'force-dynamic';

/**
 * /embed/kanban?token=<INTEGRATION_API_TOKEN>&tenant_id=<uuid|slug>
 *
 * Página enxuta, dark, sem navegação — pronta pra iframe no Indica.
 * Valida o token e renderiza o board do tenant.
 */
export default async function EmbedKanban({
  searchParams,
}: {
  searchParams: { token?: string; tenant_id?: string };
}) {
  const expected = process.env.INTEGRATION_API_TOKEN || '';
  const token = searchParams.token || '';
  const tenantIdent = (searchParams.tenant_id || '').trim();

  if (!expected || token !== expected) {
    return <Error msg="Token inválido ou não fornecido. Adicione ?token=...&tenant_id=... à URL." />;
  }
  if (!tenantIdent) {
    return <Error msg="Tenant não informado. Passe ?tenant_id=<uuid_ou_slug>." />;
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantIdent);
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug, primary_color, secondary_color')
    .eq(isUuid ? 'id' : 'slug', tenantIdent)
    .maybeSingle();
  if (!tenant) return <Error msg="Tenant não encontrado." />;

  const [colsRes, leadsRes] = await Promise.all([
    supabaseAdmin
      .from('kanban_columns')
      .select('id, name, color, position, kind')
      .eq('tenant_id', (tenant as any).id)
      .order('position', { ascending: true }),
    supabaseAdmin
      .from('leads')
      .select('id, answers, lead_score, is_qualified, kanban_column_id, deal_value, status, created_at')
      .eq('tenant_id', (tenant as any).id)
      .order('created_at', { ascending: false })
      .limit(1000),
  ]);

  if (colsRes.error || leadsRes.error) {
    throw new AppError('Erro ao carregar kanban.', { status: 500 });
  }

  const columns = (colsRes.data || []).map((c: any) => ({ ...c, leads: [] as any[] }));
  const byCol = new Map(columns.map((c) => [c.id, c]));
  for (const l of leadsRes.data || []) {
    const slim = {
      id: l.id,
      name: (l.answers as any)?.nome || '(sem nome)',
      phone: (l.answers as any)?.telefone || null,
      score: l.lead_score,
      qualified: l.is_qualified,
      deal_value: l.deal_value,
      created_at: l.created_at,
    };
    const col = byCol.get(l.kanban_column_id);
    if (col) col.leads.push(slim);
  }

  return (
    <main className="p-4 md:p-6">
      <header className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-fg-dim font-mono">Pipeline</div>
          <h1 className="text-xl md:text-2xl font-semibold mt-1">{(tenant as any).name}</h1>
        </div>
        <div className="text-[11px] font-mono text-fg-dim">
          {(leadsRes.data || []).length} leads · {columns.length} colunas
        </div>
      </header>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((col) => (
          <div key={col.id} className="flex-shrink-0 w-[260px]">
            <div
              className="rounded-lg border border-line/60 bg-bg-2/40 backdrop-blur p-2 min-h-[70vh]"
              style={{ borderTopColor: col.color, borderTopWidth: 3 }}
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="text-sm font-semibold truncate" style={{ color: col.color }}>
                  {col.name}
                </div>
                <div className="text-[10px] font-mono text-fg-dim">{col.leads.length}</div>
              </div>
              <div className="space-y-2">
                {col.leads.length === 0 ? (
                  <div className="text-[11px] text-fg-dim text-center py-6 italic">vazio</div>
                ) : col.leads.map((l: any) => (
                  <div key={l.id} className="rounded-md bg-white/[0.04] border border-line/40 p-2.5 hover:bg-white/[0.07] transition-colors">
                    <div className="text-sm font-medium truncate">{l.name}</div>
                    {l.phone && (
                      <div className="text-[11px] font-mono text-fg-dim mt-0.5">{l.phone}</div>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <div className="text-[10px] text-fg-dim font-mono">
                        {new Date(l.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {l.qualified && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono" style={{ background: 'rgba(16,242,160,0.15)', color: '#10F2A0' }}>QUALI</span>
                        )}
                        {l.deal_value && (
                          <span className="text-[10px] font-mono text-fg">R$ {Number(l.deal_value).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function Error({ msg }: { msg: string }) {
  return (
    <main className="min-h-[60vh] flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-3">
        <div className="text-[10px] uppercase tracking-widest text-danger font-mono">Acesso negado</div>
        <p className="text-sm text-fg-muted">{msg}</p>
      </div>
    </main>
  );
}
