'use client';

import { useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Kicker } from '@/components/ui';
import {
  METRIC_CATALOG, groupCatalog, hiddenSet,
  type MetricMenu, type MetricsConfig,
} from '@/lib/metrics-catalog';

const MENUS: Array<{ key: MetricMenu; label: string; icon: string; hint: string }> = [
  { key: 'comercial', label: 'Comercial + Tráfego', icon: '📊', hint: 'Funil de vendas (kanban) cruzado com o investimento Meta.' },
  { key: 'campanha', label: 'Campanha', icon: '📈', hint: 'Métricas só da campanha (Meta Ads).' },
];

export function MetricsConfigCard({
  tenantId, initialConfig,
}: {
  tenantId: string;
  initialConfig: MetricsConfig | null;
}) {
  const [hidden, setHidden] = useState<Set<string>>(() => hiddenSet(initialConfig));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const initialHidden = useMemo(() => hiddenSet(initialConfig), [initialConfig]);
  const dirty = useMemo(() => {
    if (hidden.size !== initialHidden.size) return true;
    for (const k of hidden) if (!initialHidden.has(k)) return true;
    return false;
  }, [hidden, initialHidden]);

  const visibleCount = METRIC_CATALOG.length - hidden.size;

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function setMenu(menu: MetricMenu, show: boolean) {
    setHidden((prev) => {
      const next = new Set(prev);
      for (const item of METRIC_CATALOG) {
        if (item.menu !== menu) continue;
        if (show) next.delete(item.key); else next.add(item.key);
      }
      return next;
    });
  }

  async function save() {
    setSaving(true); setError(null); setSaved(false);
    try {
      await apiFetch(`/api/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        body: { metrics_config: { hidden: Array.from(hidden) } },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar.');
    } finally { setSaving(false); }
  }

  return (
    <section className="glass-static p-6 mb-8">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎛️</span>
          <div>
            <Kicker>MÉTRICAS VISÍVEIS</Kicker>
            <div className="text-xs text-fg-muted mt-0.5">
              Escolha o que esse cliente vê no painel de métricas · <span className="text-emerald font-mono">{visibleCount}</span> de {METRIC_CATALOG.length} ativas
            </div>
          </div>
        </div>
        <button type="button" onClick={() => setExpanded((v) => !v)} className="btn btn-ghost !text-xs !py-1.5">
          {expanded ? 'Fechar' : 'Personalizar'}
        </button>
      </div>

      {expanded && (
        <div className="mt-5 space-y-6">
          {MENUS.map((menu) => {
            const groups = groupCatalog(menu.key);
            const menuItems = METRIC_CATALOG.filter((m) => m.menu === menu.key);
            const allShown = menuItems.every((m) => !hidden.has(m.key));
            const noneShown = menuItems.every((m) => hidden.has(m.key));
            return (
              <div key={menu.key} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{menu.icon}</span>
                    <div>
                      <div className="font-semibold text-sm">{menu.label}</div>
                      <div className="text-[11px] text-fg-dim">{menu.hint}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 p-1 rounded-lg glass-inner">
                    <button type="button" onClick={() => setMenu(menu.key, true)} disabled={allShown}
                      className="px-2.5 py-1 rounded-md text-[11px] font-medium text-fg-muted hover:text-emerald disabled:opacity-40">
                      Marcar todas
                    </button>
                    <button type="button" onClick={() => setMenu(menu.key, false)} disabled={noneShown}
                      className="px-2.5 py-1 rounded-md text-[11px] font-medium text-fg-muted hover:text-danger disabled:opacity-40">
                      Desmarcar
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  {groups.map((g) => (
                    <div key={g.group}>
                      <div className="text-[10px] uppercase tracking-widest text-fg-dim font-mono mb-2">{g.group}</div>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {g.items.map((item) => {
                          const on = !hidden.has(item.key);
                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => toggle(item.key)}
                              className="flex items-center gap-2.5 text-left rounded-lg px-3 py-2 transition-colors"
                              style={{
                                background: on ? 'rgba(16,242,160,0.08)' : 'rgba(255,255,255,0.02)',
                                border: `1px solid ${on ? 'rgba(16,242,160,0.30)' : 'rgba(255,255,255,0.08)'}`,
                              }}
                            >
                              <span
                                className="h-4 w-4 rounded shrink-0 flex items-center justify-center text-[10px] font-bold"
                                style={{
                                  background: on ? '#10F2A0' : 'transparent',
                                  border: on ? 'none' : '1px solid rgba(255,255,255,0.25)',
                                  color: '#0B1314',
                                }}
                              >
                                {on ? '✓' : ''}
                              </span>
                              <span className={`text-xs truncate ${on ? '' : 'text-fg-muted'}`} title={item.hint || item.label}>
                                {item.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {error && (
            <div className="rounded-md px-3 py-2 text-sm" style={{ background: 'rgba(255,99,99,0.08)', color: '#FF8B8B', border: '1px solid rgba(255,99,99,0.30)' }}>
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            {saved && <span className="text-xs text-emerald">✓ Salvo</span>}
            <button type="button" onClick={save} disabled={saving || !dirty}
              className="btn btn-primary !text-sm disabled:opacity-50">
              {saving ? 'Salvando…' : '✓ Salvar visibilidade'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
