'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Kicker } from '@/components/ui';

type MetaAccount = { id: string; name: string; account_status: number; currency: string };

const STATUS_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'ATIVA', color: '#10F2A0' },
  2: { label: 'DESABILITADA', color: '#FF6363' },
  3: { label: 'CANCELADA', color: '#FFC857' },
  7: { label: 'EM REVISÃO', color: '#FFC857' },
  9: { label: 'EM GRAÇA', color: '#FFC857' },
  100: { label: 'PENDENTE', color: '#A8B7BB' },
  101: { label: 'DESABILITADA', color: '#FF6363' },
  102: { label: 'PENDENTE', color: '#A8B7BB' },
};

export function MetaIntegrationCard({
  tenantId, initialAdAccountId,
}: {
  tenantId: string;
  initialAdAccountId: string | null;
}) {
  const [accounts, setAccounts] = useState<MetaAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [adAccountId, setAdAccountId] = useState<string>(initialAdAccountId || '');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active'>('active');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!initialAdAccountId); // se não tem vínculo, abre direto

  useEffect(() => {
    apiFetch<{ data: { accounts: MetaAccount[] } }>('/api/metrics/meta-accounts')
      .then((r) => setAccounts(r.data.accounts))
      .catch((e) => setError(e?.message || 'Falha ao listar contas Meta.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = accounts;
    if (statusFilter === 'active') list = list.filter((a) => a.account_status === 1);
    if (q) list = list.filter((a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q));
    return list;
  }, [accounts, search, statusFilter]);

  const current = accounts.find((a) => a.id === (initialAdAccountId || ''));
  const pending = accounts.find((a) => a.id === adAccountId);
  const dirty = adAccountId !== (initialAdAccountId || '');

  async function save() {
    setSaving(true); setError(null); setSaved(false);
    try {
      await apiFetch(`/api/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        body: { meta_ad_account_id: adAccountId || null },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar.');
    } finally { setSaving(false); }
  }

  async function unlink() {
    if (!confirm('Desvincular a Conta de Anúncio Meta?\n\nO cliente vai parar de ver métricas Meta no dashboard dele.')) return;
    setAdAccountId('');
    setSaving(true); setError(null);
    try {
      await apiFetch(`/api/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        body: { meta_ad_account_id: null },
      });
      setSaved(true);
      setExpanded(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e?.message || 'Falha ao desvincular.');
    } finally { setSaving(false); }
  }

  return (
    <section className="glass-static p-6 mb-8">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📈</span>
          <div>
            <Kicker>INTEGRAÇÃO META ADS</Kicker>
            <div className="text-xs text-fg-muted mt-0.5">
              Conta de anúncio que o cliente vê no dashboard dele
            </div>
          </div>
        </div>
        {current && (
          <span className="badge badge-success badge-dot">vinculado</span>
        )}
      </div>

      {/* CARD CONTA VINCULADA */}
      {current && !expanded && (
        <div className="rounded-xl p-5 flex items-center gap-4"
          style={{ background: 'linear-gradient(135deg, rgba(16,242,160,0.08), rgba(16,242,160,0.02))', border: '1px solid rgba(16,242,160,0.25)' }}>
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-xl"
            style={{ background: 'rgba(16,242,160,0.15)', color: '#10F2A0' }}>
            📊
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-lg truncate">{current.name}</div>
            <div className="text-xs text-fg-muted font-mono mt-0.5 flex items-center gap-2 flex-wrap">
              <span>{current.id}</span>
              <span>·</span>
              <span>{current.currency}</span>
              <span>·</span>
              <AccountStatus status={current.account_status} />
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="btn btn-ghost !text-xs !py-1.5"
            >
              ✏️ Trocar conta
            </button>
            <button
              type="button"
              onClick={unlink}
              disabled={saving}
              className="btn !text-xs !py-1.5 disabled:opacity-50"
              style={{ background: 'rgba(255,99,99,0.10)', color: '#FF6363', border: '1px solid rgba(255,99,99,0.30)' }}
            >
              Desvincular
            </button>
          </div>
        </div>
      )}

      {/* SELETOR (quando expandido ou sem vínculo) */}
      {(expanded || !current) && (
        <div className="space-y-4">
          {loading ? (
            <div className="text-sm text-fg-muted text-center py-8">Carregando contas disponíveis…</div>
          ) : (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  type="text"
                  placeholder="🔎 Buscar por nome ou ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input !text-sm !py-2 flex-1 min-w-[240px]"
                />
                <div className="flex items-center gap-1 p-1 rounded-lg glass-inner shrink-0">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('active')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      statusFilter === 'active' ? 'bg-brand/20 text-brand' : 'text-fg-muted hover:text-fg'
                    }`}
                  >
                    Só ativas · {accounts.filter((a) => a.account_status === 1).length}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      statusFilter === 'all' ? 'bg-brand/20 text-brand' : 'text-fg-muted hover:text-fg'
                    }`}
                  >
                    Todas · {accounts.length}
                  </button>
                </div>
              </div>

              {/* GRID DE CARDS */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[440px] overflow-y-auto pr-1">
                {filtered.length === 0 ? (
                  <div className="col-span-full text-center text-sm text-fg-muted py-8">
                    {search ? 'Nenhuma conta com esse filtro.' : 'Nenhuma conta disponível.'}
                  </div>
                ) : filtered.map((a) => {
                  const isSelected = a.id === adAccountId;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAdAccountId(a.id)}
                      className="text-left rounded-xl p-4 transition-all"
                      style={{
                        background: isSelected ? 'rgba(16,242,160,0.10)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${isSelected ? 'rgba(16,242,160,0.50)' : 'rgba(255,255,255,0.08)'}`,
                        boxShadow: isSelected ? '0 0 16px rgba(16,242,160,0.20)' : 'none',
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="h-9 w-9 rounded-lg shrink-0 flex items-center justify-center text-sm font-semibold"
                          style={{
                            background: isSelected ? 'rgba(16,242,160,0.20)' : 'rgba(255,255,255,0.04)',
                            color: isSelected ? '#10F2A0' : '#A8B7BB',
                          }}
                        >
                          {a.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate flex items-center gap-1.5">
                            {a.name}
                            {isSelected && <span className="text-emerald shrink-0">✓</span>}
                          </div>
                          <div className="text-[11px] text-fg-dim font-mono mt-1 truncate">{a.id}</div>
                          <div className="mt-2 flex items-center gap-2 text-[10px]">
                            <AccountStatus status={a.account_status} />
                            <span className="text-fg-dim font-mono">{a.currency}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* PREVIEW DA SELEÇÃO + AÇÕES */}
              {pending && (
                <div className="rounded-xl p-4 flex items-center gap-3 flex-wrap"
                  style={{ background: 'rgba(16,242,160,0.06)', border: '1px solid rgba(16,242,160,0.25)' }}>
                  <span className="text-emerald text-sm">✓ Pronto pra vincular:</span>
                  <span className="font-medium">{pending.name}</span>
                  <span className="font-mono text-xs text-fg-muted">{pending.id}</span>
                </div>
              )}

              {error && (
                <div className="rounded-md px-3 py-2 text-sm" style={{ background: 'rgba(255,99,99,0.08)', color: '#FF8B8B', border: '1px solid rgba(255,99,99,0.30)' }}>
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 flex-wrap">
                {current && (
                  <button
                    type="button"
                    onClick={() => { setExpanded(false); setAdAccountId(initialAdAccountId || ''); setSearch(''); }}
                    className="btn btn-ghost !text-sm"
                  >
                    ← Cancelar
                  </button>
                )}
                <div className="flex items-center gap-3 ml-auto">
                  {saved && <span className="text-xs text-emerald">✓ Salvo</span>}
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving || !dirty || !adAccountId}
                    className="btn btn-primary !text-sm disabled:opacity-50"
                  >
                    {saving ? 'Salvando…' : current ? '✓ Salvar nova conta' : '✓ Vincular esta conta'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {!current && !loading && saved && (
        <div className="mt-3 text-xs text-emerald">✓ Salvo</div>
      )}
    </section>
  );
}

function AccountStatus({ status }: { status: number }) {
  const s = STATUS_LABELS[status] || { label: 'OUTRO', color: '#A8B7BB' };
  return (
    <span className="inline-flex items-center gap-1 font-mono uppercase tracking-wider"
      style={{ color: s.color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}
