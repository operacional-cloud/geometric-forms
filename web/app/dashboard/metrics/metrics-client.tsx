'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Kicker } from '@/components/ui';
import { hiddenSet, type MetricsConfig } from '@/lib/metrics-catalog';

// ============================================================================
// Tipos
// ============================================================================

type Metrics = {
  totals: {
    leads_total: number;
    leads_form: number;
    leads_manual: number;
    leads_prospecting: number;
    deal_value_total: number;
    deal_value_won: number;
  };
  by_column: Array<{ column_id: string; column_name: string; column_color: string; kind: string; count: number; value: number }>;
  by_origin: Array<{ origin: 'form' | 'manual' | 'prospecting'; count: number; value: number }>;
  conversion: { won_count: number; lost_count: number; in_progress_count: number; won_rate: number };
};

type SalesDailyRow = {
  date: string;
  leads: number; qualified: number; meeting_scheduled: number; meeting_held: number;
  no_show: number; proposal: number; followup: number; won: number; lost: number; deal_value: number;
};

type SalesDashboard = {
  period: { start: string; end: string };
  daily: SalesDailyRow[];
  totals: SalesDailyRow & { date: string };
  conversion: {
    lead_to_qualified: number; lead_to_meeting: number; meeting_to_won: number;
    lead_to_won: number; avg_ticket: number;
  };
};

type MetaDailyRow = { date: string; spend: number; impressions: number; reach: number; clicks: number; results: number };
type MetaDemoRow = { key: string; reach: number; impressions: number; clicks: number; results: number; spend: number };

type MetaDashboard = {
  account: { id: string; name: string; currency: string };
  totals: {
    spend: number; impressions: number; reach: number; clicks: number;
    ctr: number; cpc: number; cpm: number; results: number; cpr: number; frequency: number;
  };
  daily: MetaDailyRow[];
  campaigns: Array<{ campaign_id: string; campaign_name: string; adset_name?: string; ad_name?: string; spend: number; clicks: number; results: number; frequency: number; cpr: number }>;
  by_gender: MetaDemoRow[];
  by_age: MetaDemoRow[];
  by_region: MetaDemoRow[];
};

type Tab = 'overview' | 'meta';

/** Função de visibilidade — true se o bloco deve aparecer. */
type Vis = (key: string) => boolean;

type OverviewBucket = {
  leads: number; qualified: number; em_contato: number;
  meeting_scheduled: number; meeting_held: number; no_show: number;
  proposal: number; followup: number; won: number; lost: number; deal_value: number;
};

type OverviewSellerSlice = {
  seller_id: string | null;
  seller_name: string;
  seller_color: string;
  bucket: OverviewBucket;
};

type Overview = {
  total: OverviewBucket;
  by_seller: OverviewSellerSlice[];
  by_column: Array<{ column_id: string; column_name: string; column_color: string; kind: string; count: number; value: number }>;
};

type Seller = { id: string; name: string; color: string; active: boolean };

// ============================================================================
// Helpers
// ============================================================================

const PRESETS = [
  { label: 'Hoje', days: 0 },
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
];

function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }
// Mapeia o preset (em dias) pro date_preset da Meta — assim o gasto é calculado
// no fuso da conta (igual Ads Manager). Custom (-1) → null (usa datas time_range).
function metaPresetFor(days: number): string | null {
  switch (days) {
    case 0: return 'today';
    case 7: return 'last_7d';
    case 30: return 'last_30d';
    case 90: return 'last_90d';
    default: return null;
  }
}
function formatCurrency(v: number): string { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function formatPct(v: number): string { return `${(v * 100).toFixed(1)}%`; }
function formatNumber(v: number): string { return v.toLocaleString('pt-BR'); }
function safeRatio(a: number, b: number): number { return b > 0 ? a / b : 0; }

// ============================================================================
// Root
// ============================================================================

// initial passado pra ser ignorado (mantém compat com page.tsx)
export function MetricsClient({ initial: _initial, config }: { initial: Metrics; config?: MetricsConfig | null }) {
  const [tab, setTab] = useState<Tab>('overview');

  // Conjunto de blocos escondidos pra esse cliente (admin controla).
  const hidden = useMemo(() => hiddenSet(config), [config]);
  const vis: Vis = (key: string) => !hidden.has(key);

  function exportPdf() {
    document.body.classList.add('printing-metrics');
    const cleanup = () => {
      document.body.classList.remove('printing-metrics');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    // pequeno delay garante que o layout de impressão aplique antes do diálogo
    setTimeout(() => { window.print(); }, 60);
  }

  const menuLabel = tab === 'overview' ? 'Comercial + Tráfego' : 'Campanha';

  return (
    <div className="metrics-print-root space-y-5">
      {/* Toolbar: troca de menu (segmented) + exportar PDF */}
      <div className="no-print flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-xl glass-inner">
          <MenuButton active={tab === 'overview'} onClick={() => setTab('overview')} icon="📊">
            Comercial + Tráfego
          </MenuButton>
          <MenuButton active={tab === 'meta'} onClick={() => setTab('meta')} icon="📈">
            Campanha
          </MenuButton>
        </div>
        <button
          type="button"
          onClick={exportPdf}
          className="btn btn-ghost !text-sm inline-flex items-center gap-2"
          title="Exportar o painel atual em PDF"
        >
          📄 Exportar PDF
        </button>
      </div>

      {/* Cabeçalho impresso (só aparece no PDF) */}
      <div className="print-only mb-4">
        <div className="text-[11px] uppercase tracking-widest font-mono opacity-60">RELATÓRIO DE MÉTRICAS · {menuLabel}</div>
        <div className="text-lg font-semibold">Métricas — {menuLabel}</div>
      </div>

      {tab === 'overview' && <OverviewPanel vis={vis} />}
      {tab === 'meta' && <MetaAdsPanel vis={vis} />}
    </div>
  );
}

function MenuButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2 ${
        active ? 'bg-brand/20 text-brand' : 'text-fg-muted hover:text-fg'
      }`}
    >
      <span className="text-base">{icon}</span>
      {children}
    </button>
  );
}

// ============================================================================
// VISÃO GERAL (kanban × Meta)
// ============================================================================

function OverviewPanel({ vis }: { vis: Vis }) {
  const anyVis = (keys: string[]) => keys.some(vis);
  const [preset, setPreset] = useState<number>(30);
  const [start, setStart] = useState<string>(() => { const d = new Date(); d.setDate(d.getDate() - 30); return isoDate(d); });
  const [end, setEnd] = useState<string>(() => isoDate(new Date()));
  const [overview, setOverview] = useState<Overview | null>(null);
  const [sales, setSales] = useState<SalesDashboard | null>(null);
  const [meta, setMeta] = useState<MetaDashboard | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sellerFilter, setSellerFilter] = useState<string>(''); // '' = todos, 'null' = sem vendedor, id = vendedor
  const [tagMetrics, setTagMetrics] = useState<Array<{ tag: string; count: number; value: number }>>([]);

  function applyPreset(days: number) {
    setPreset(days);
    const e = new Date(); const s = new Date(); s.setDate(e.getDate() - days);
    setStart(isoDate(s)); setEnd(isoDate(e));
  }

  useEffect(() => {
    setLoading(true); setMetaError(null);
    const sellerQ = sellerFilter ? `?seller_id=${encodeURIComponent(sellerFilter)}` : '';
    const overviewP = apiFetch<{ data: Overview }>(`/api/kanban/overview${sellerQ}`);
    const salesP = apiFetch<{ data: SalesDashboard }>(`/api/metrics/sales?start=${start}&end=${end}`).catch(() => null);
    const mp = metaPresetFor(preset);
    const metaP = apiFetch<{ data: MetaDashboard }>(`/api/metrics/meta-ads?start=${start}&end=${end}${mp ? `&preset=${mp}` : ''}`)
      .catch((e: any) => { setMetaError(e?.message || 'sem Meta'); return null; });
    const tagsP = apiFetch<{ data: { tags: Array<{ tag: string; count: number; value: number }> } }>('/api/kanban/tags').catch(() => null);
    Promise.all([overviewP, salesP, metaP, tagsP])
      .then(([ov, s, m, t]) => { setOverview(ov.data); setSales(s ? s.data : null); setMeta(m ? m.data : null); setTagMetrics(t ? t.data.tags : []); })
      .finally(() => setLoading(false));
  }, [start, end, preset, sellerFilter]);

  if (loading && !overview) {
    return <div className="glass-static p-12 text-center text-sm text-fg-muted">Carregando…</div>;
  }
  if (!overview) return null;

  // Total vem do overview (estado atual das colunas) — não depende de timestamps
  const t = overview.total;

  const spend = meta?.totals.spend || 0;
  const reach = meta?.totals.reach || 0;
  const impressions = meta?.totals.impressions || 0;
  const clicks = meta?.totals.clicks || 0;
  const metaResults = meta?.totals.results || 0;

  // Métricas e taxas combinadas
  const cpl_real = safeRatio(spend, t.leads);
  const cpa_real = safeRatio(spend, t.won);
  const roas = safeRatio(t.deal_value, spend);
  const profit = t.deal_value - spend;
  const margin = safeRatio(profit, t.deal_value);
  const tx_qualif = safeRatio(t.qualified, t.leads);
  const tx_agend = safeRatio(t.meeting_scheduled, t.leads);
  const tx_show = safeRatio(t.meeting_held, t.meeting_scheduled);
  const tx_noshow = safeRatio(t.no_show, t.meeting_scheduled);
  const tx_proposta = safeRatio(t.proposal, t.meeting_held);
  const tx_fechamento = safeRatio(t.won, t.proposal);
  const tx_conversao_geral = safeRatio(t.won, t.leads);
  const ticket = safeRatio(t.deal_value, t.won);
  const ctr_real = safeRatio(t.leads, clicks);

  return (
    <div className="space-y-6">
      {/* Period selector + filtro vendedor */}
      <div className="grid lg:grid-cols-[1fr_auto] gap-3">
        <PeriodFilter preset={preset} start={start} end={end}
          onPreset={applyPreset}
          onStart={(v) => { setPreset(-1); setStart(v); }}
          onEnd={(v) => { setPreset(-1); setEnd(v); }}
          loading={loading}
        />
        <div className="glass-static p-4 flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-widest text-fg-dim font-mono">VENDEDOR</span>
          <select
            value={sellerFilter}
            onChange={(e) => setSellerFilter(e.target.value)}
            className="input !text-sm !py-1.5"
          >
            <option value="">Todos</option>
            {overview.by_seller.map((s) => (
              <option key={s.seller_id || 'none'} value={s.seller_id || 'null'}>
                {s.seller_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {metaError && (
        <div className="glass-static p-3 text-xs"
          style={{ background: 'rgba(255,200,87,0.06)', border: '1px solid rgba(255,200,87,0.25)', color: '#FFD680' }}>
          ⓘ Meta Ads não vinculado a esse cliente. Métricas de investimento, ROAS e demografia ficam vazias até admin vincular a conta.
        </div>
      )}

      {/* CARDS PRINCIPAIS — Comercial */}
      {anyVis(['leads','qualified','meeting_scheduled','meeting_held','no_show','proposal','won','lost','deal_value','ticket']) && (
      <Section title="COMERCIAL · FUNIL" >
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {vis('leads') && <Stat icon="👥" label="Leads recebidos" value={formatNumber(t.leads)} accent="info" />}
          {vis('qualified') && <Stat icon="✓" label="Qualificados" value={formatNumber(t.qualified)} accent="warn" sub={formatPct(tx_qualif)} />}
          {vis('meeting_scheduled') && <Stat icon="📅" label="Reuniões marcadas" value={formatNumber(t.meeting_scheduled)} accent="warn" sub={formatPct(tx_agend)} />}
          {vis('meeting_held') && <Stat icon="🤝" label="Reuniões realizadas" value={formatNumber(t.meeting_held)} accent="info" sub={`show ${formatPct(tx_show)}`} />}
          {vis('no_show') && <Stat icon="❌" label="No show" value={formatNumber(t.no_show)} accent="danger" sub={t.meeting_scheduled > 0 ? formatPct(tx_noshow) : '—'} />}
          {vis('proposal') && <Stat icon="📄" label="Propostas" value={formatNumber(t.proposal)} accent="info" sub={t.meeting_held > 0 ? formatPct(tx_proposta) : '—'} />}
          {vis('won') && <Stat icon="🏆" label="Vendas fechadas" value={formatNumber(t.won)} accent="success" sub={t.proposal > 0 ? formatPct(tx_fechamento) : '—'} />}
          {vis('lost') && <Stat icon="💔" label="Perdidos" value={formatNumber(t.lost)} accent="danger" />}
          {vis('deal_value') && <Stat icon="💰" label="Valor em vendas" value={formatCurrency(t.deal_value)} accent="success" />}
          {vis('ticket') && <Stat icon="🎯" label="Ticket médio" value={formatCurrency(ticket)} accent="success" />}
        </div>
      </Section>
      )}

      {/* MÉTRICAS COMBINADAS — Meta × Comercial */}
      {anyVis(['roi_spend','cpl_real','cpa_real','roas','profit']) && (
      <Section title="META × COMERCIAL · ROI">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {vis('roi_spend') && <Stat icon="📊" label="Investimento Meta" value={formatCurrency(spend)} accent="info" />}
          {vis('cpl_real') && <Stat icon="💵" label="CPL real" value={t.leads > 0 ? formatCurrency(cpl_real) : '—'} accent="warn" sub="invest. ÷ leads" />}
          {vis('cpa_real') && <Stat icon="💸" label="CPA real" value={t.won > 0 ? formatCurrency(cpa_real) : '—'} accent="warn" sub="invest. ÷ vendas" />}
          {vis('roas') && <Stat
            icon="🔥"
            label="ROAS"
            value={spend > 0 ? `${roas.toFixed(2)}×` : '—'}
            accent={roas >= 1 ? 'success' : roas > 0 ? 'warn' : 'info'}
            sub={spend > 0 ? `${formatPct(margin)} margem` : '—'}
          />}
          {vis('profit') && <Stat
            icon={profit >= 0 ? '✅' : '⚠️'}
            label="Lucro líquido"
            value={formatCurrency(profit)}
            accent={profit >= 0 ? 'success' : 'danger'}
          />}
        </div>
      </Section>
      )}

      {/* TAXAS DE CONVERSÃO — funil completo */}
      {anyVis(['rate_qualif','rate_agend','rate_show','rate_proposta','rate_fechamento','rate_geral']) && (
      <Section title="TAXAS DE CONVERSÃO">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {vis('rate_qualif') && <RateCard label="Lead → Qualificado" value={tx_qualif} />}
          {vis('rate_agend') && <RateCard label="Lead → Reunião marcada" value={tx_agend} />}
          {vis('rate_show') && <RateCard label="Show up (compareceu)" value={tx_show} />}
          {vis('rate_proposta') && <RateCard label="Reunião → Proposta" value={tx_proposta} />}
          {vis('rate_fechamento') && <RateCard label="Proposta → Venda" value={tx_fechamento} />}
          {vis('rate_geral') && <RateCard label="Lead → Venda (geral)" value={tx_conversao_geral} highlight />}
        </div>
      </Section>
      )}

      {/* POR VENDEDOR */}
      {vis('sec_sellers') && overview.by_seller.length > 0 && !sellerFilter && (
        <Section title="DESEMPENHO POR VENDEDOR">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {overview.by_seller.map((s) => (
              <SellerCard key={s.seller_id || 'none'} slice={s} onClick={() => setSellerFilter(s.seller_id || 'null')} />
            ))}
          </div>
          <div className="text-[11px] text-fg-dim mt-3">
            ⓘ Click num card pra filtrar todas as métricas acima pelo vendedor.
          </div>
        </Section>
      )}

      {/* FUNIL VISUAL + STATUS META */}
      {(vis('sec_funnel') || vis('sec_meta_resumo')) && (
      <div className={`grid gap-6 ${vis('sec_funnel') && vis('sec_meta_resumo') ? 'lg:grid-cols-[1.5fr_1fr]' : 'lg:grid-cols-1'}`}>
        {vis('sec_funnel') && (
        <Section title="FUNIL DE CONVERSÃO">
          <div className="space-y-3">
            <FunnelBar label="Leads"            value={t.leads}             max={t.leads || 1} color="#5EE2FF" />
            <FunnelBar label="Qualificados"     value={t.qualified}         max={t.leads || 1} color="#FFC857" />
            <FunnelBar label="Reuniões marc."   value={t.meeting_scheduled} max={t.leads || 1} color="#FF8B3D" />
            <FunnelBar label="Reuniões real."   value={t.meeting_held}      max={t.leads || 1} color="#A66EFC" />
            <FunnelBar label="Propostas"        value={t.proposal}          max={t.leads || 1} color="#3DB6FF" />
            <FunnelBar label="Vendas fechadas"  value={t.won}               max={t.leads || 1} color="#10F2A0" highlight />
          </div>
        </Section>
        )}

        {vis('sec_meta_resumo') && (
        <Section title="META — RESUMO">
          {meta && spend > 0 ? (
            <div className="space-y-3 text-sm">
              <KV label="Alcance" value={formatNumber(reach)} />
              <KV label="Impressões" value={formatNumber(impressions)} />
              <KV label="Cliques" value={formatNumber(clicks)} />
              <KV label="CTR (Meta)" value={`${meta.totals.ctr.toFixed(2)}%`} />
              <KV label="CPC" value={formatCurrency(meta.totals.cpc)} />
              <KV label="CPM" value={formatCurrency(meta.totals.cpm)} />
              <KV label="Resultados Meta" value={formatNumber(metaResults)} mono />
              <KV label="Frequência" value={meta.totals.frequency.toFixed(2)} />
              <div className="pt-2 mt-2 border-t border-line/40">
                <KV label="% cliques → lead real" value={clicks > 0 ? formatPct(ctr_real) : '—'} highlight />
              </div>
            </div>
          ) : (
            <div className="text-sm text-fg-muted py-8 text-center">Sem dados Meta no período.</div>
          )}
        </Section>
        )}
      </div>
      )}

      {/* GRÁFICOS TEMPORAIS — só aparecem se a SQL de timestamps foi rodada */}
      {vis('sec_evolucao') && sales && sales.daily.length > 0 && sales.totals.leads > 0 && (
        <Section title="EVOLUÇÃO DIÁRIA · LEADS × VENDAS × INVESTIMENTO">
          <MultiLineChart
            daily={sales.daily}
            meta={meta?.daily || []}
            series={[
              { key: 'leads', label: 'Leads (kanban)', color: '#5EE2FF', source: 'sales' },
              { key: 'won', label: 'Vendas', color: '#10F2A0', source: 'sales' },
              { key: 'deal_value', label: 'Valor vendas (R$)', color: '#16855E', source: 'sales', dashed: true, scale: 'right' },
              { key: 'spend', label: 'Investimento (R$)', color: '#FFC857', source: 'meta', dashed: true, scale: 'right' },
            ]}
          />
        </Section>
      )}

      {vis('sec_roas_daily') && meta && spend > 0 && sales && (
        <Section title="ROAS DIÁRIO">
          <RoasDailyChart sales={sales.daily} meta={meta.daily} />
        </Section>
      )}

      {vis('sec_tags') && tagMetrics.length > 0 && (
        <Section title="POR TAG · acumulado por coluna">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tagMetrics.map((t) => (
              <div key={t.tag} className="glass-inner p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{t.tag}</span>
                  <span className="text-xs font-mono tabular text-fg-dim">{formatNumber(t.count)}</span>
                </div>
                {t.value > 0 && (
                  <div className="mt-1 text-[11px] text-emerald font-mono tabular">
                    {formatCurrency(t.value)}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 text-[10px] text-fg-dim">
            ⓘ Tags são adicionadas automaticamente quando um lead passa por uma coluna. Um lead acumula várias tags ao longo do funil.
          </div>
        </Section>
      )}

      {vis('sec_followup') && sales && (
        <Section title="FOLLOW-UP DIÁRIO · DETALHADO">
          <FollowupTable sales={sales} meta={meta} />
        </Section>
      )}

      <div className="text-center text-[11px] text-fg-dim">
        ⓘ Eventos são contados na data em que o lead foi movido pela 1ª vez pra cada coluna do
        <a href="/dashboard/kanban" className="link"> kanban</a>. Configure colunas com os <em>kinds</em> corretos
        (Qualificado, Reunião marcada, Realizada, No show, Proposta, Venda, Perdido).
      </div>
    </div>
  );
}

// ============================================================================
// META ADS panel
// ============================================================================

function MetaAdsPanel({ vis }: { vis: Vis }) {
  const anyVis = (keys: string[]) => keys.some(vis);
  const [preset, setPreset] = useState<number>(30);
  const [start, setStart] = useState<string>(() => { const d = new Date(); d.setDate(d.getDate() - 30); return isoDate(d); });
  const [end, setEnd] = useState<string>(() => isoDate(new Date()));
  const [data, setData] = useState<MetaDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function applyPreset(days: number) {
    setPreset(days);
    const e = new Date(); const s = new Date(); s.setDate(e.getDate() - days);
    setStart(isoDate(s)); setEnd(isoDate(e));
  }

  useEffect(() => {
    setLoading(true); setError(null);
    const mp = metaPresetFor(preset);
    apiFetch<{ data: MetaDashboard }>(`/api/metrics/meta-ads?start=${start}&end=${end}${mp ? `&preset=${mp}` : ''}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e?.message || 'Falha ao carregar Meta Ads.'))
      .finally(() => setLoading(false));
  }, [start, end, preset]);

  if (error && !data) {
    return (
      <div className="glass-static p-8">
        <div className="text-sm mb-2" style={{ color: '#FF8B8B' }}>⚠️ {error}</div>
        <div className="text-xs text-fg-muted">
          Sua conta Meta Ads ainda não está vinculada. Peça pro admin configurar em /admin → cliente → Integração Meta Ads.
        </div>
      </div>
    );
  }
  if (loading && !data) return <div className="glass-static p-12 text-center text-sm text-fg-muted">Carregando Meta Ads…</div>;
  if (!data) return null;

  const t = data.totals;

  return (
    <div className="space-y-6">
      <section className="glass-static p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-sm flex items-center gap-2 min-w-0">
            <span className="text-fg-dim text-[11px] uppercase tracking-widest font-mono">Conta:</span>
            <span className="font-medium truncate">{data.account.name}</span>
            <span className="text-fg-dim font-mono text-xs">{data.account.id}</span>
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <div className="flex items-center gap-1 p-1 rounded-lg glass-inner">
              {PRESETS.map((p) => (
                <button key={p.days} type="button" onClick={() => applyPreset(p.days)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    preset === p.days ? 'bg-brand/20 text-brand' : 'text-fg-muted hover:text-fg'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-fg-muted">
              <input type="date" value={start} onChange={(e) => { setPreset(-1); setStart(e.target.value); }} className="input !text-xs !py-1" />
              <span>até</span>
              <input type="date" value={end} onChange={(e) => { setPreset(-1); setEnd(e.target.value); }} className="input !text-xs !py-1" />
            </div>
            {loading && <span className="text-xs text-fg-dim">…</span>}
          </div>
        </div>
      </section>

      {/* Cards principais */}
      {anyVis(['m_spend','m_results','m_clicks','m_reach','m_impressions','m_frequency','m_cpr','m_cpc','m_ctr','m_cpm']) && (
      <Section title="MÉTRICAS PRINCIPAIS">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {vis('m_spend') && <Stat icon="💰" label="Investimento" value={formatCurrency(t.spend)} accent="success" />}
          {vis('m_results') && <Stat icon="🎯" label="Resultados" value={formatNumber(t.results)} accent="info" />}
          {vis('m_clicks') && <Stat icon="👆" label="Cliques" value={formatNumber(t.clicks)} accent="info" />}
          {vis('m_reach') && <Stat icon="👁" label="Alcance" value={formatNumber(t.reach)} accent="info" />}
          {vis('m_impressions') && <Stat icon="📊" label="Impressões" value={formatNumber(t.impressions)} accent="info" />}
          {vis('m_frequency') && <Stat icon="🔁" label="Frequência" value={t.frequency.toFixed(2)} accent="info" />}
        </div>
        {anyVis(['m_cpr','m_cpc','m_ctr','m_cpm']) && (
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          {vis('m_cpr') && <Stat icon="💵" label="CPR" value={t.results > 0 ? formatCurrency(t.cpr) : '—'} accent="warn" sub="custo / resultado" />}
          {vis('m_cpc') && <Stat icon="💲" label="CPC" value={formatCurrency(t.cpc)} accent="warn" sub="custo / clique" />}
          {vis('m_ctr') && <Stat icon="📈" label="CTR" value={`${t.ctr.toFixed(2)}%`} accent="warn" sub="cliques / impressões" />}
          {vis('m_cpm') && <Stat icon="📉" label="CPM" value={formatCurrency(t.cpm)} accent="warn" sub="custo / 1k impressões" />}
        </div>
        )}
      </Section>
      )}

      {/* Funil de tráfego */}
      {vis('m_sec_funnel') && (
      <Section title="FUNIL DE TRÁFEGO">
        <div className="space-y-3">
          <FunnelBar label="Impressões" value={t.impressions} max={t.impressions || 1} color="#5EE2FF" />
          <FunnelBar label="Alcance"    value={t.reach}       max={t.impressions || 1} color="#A66EFC" />
          <FunnelBar label="Cliques"    value={t.clicks}      max={t.impressions || 1} color="#FFC857" />
          <FunnelBar label="Resultados" value={t.results}     max={t.impressions || 1} color="#10F2A0" highlight />
        </div>
      </Section>
      )}

      {/* Demografia: Gênero (donut) + Idade (barras) */}
      {(vis('m_sec_gender') || vis('m_sec_age')) && (
      <div className={`grid gap-6 ${vis('m_sec_gender') && vis('m_sec_age') ? 'lg:grid-cols-2' : 'lg:grid-cols-1'}`}>
        {vis('m_sec_gender') && (
        <Section title="ALCANCE POR GÊNERO">
          {data.by_gender.length === 0 ? (
            <div className="text-sm text-fg-muted py-8 text-center">Sem dados demográficos no período.</div>
          ) : (
            <GenderDonut data={data.by_gender} />
          )}
        </Section>
        )}
        {vis('m_sec_age') && (
        <Section title="ALCANCE POR FAIXA ETÁRIA">
          {data.by_age.length === 0 ? (
            <div className="text-sm text-fg-muted py-8 text-center">Sem dados demográficos no período.</div>
          ) : (
            <AgeBarChart data={data.by_age} />
          )}
        </Section>
        )}
      </div>
      )}

      {/* Top regiões */}
      {vis('m_sec_region') && data.by_region.length > 0 && (
        <Section title="TOP 10 REGIÕES · POR ALCANCE">
          <RegionBarChart data={data.by_region} />
        </Section>
      )}

      {/* Evolução diária Meta */}
      {vis('m_sec_daily') && (
      <Section title="INVESTIMENTO × RESULTADOS · DIÁRIO">
        <MetaDailyChart daily={data.daily} />
      </Section>
      )}

      {/* Melhores anúncios */}
      {vis('m_sec_ads') && (
      <Section title="MELHORES ANÚNCIOS · MENOR CPR">
        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-xs">
            <thead className="bg-white/[0.02]">
              <tr className="border-b border-line">
                <th className="text-left py-2.5 px-3 font-mono uppercase tracking-wider text-fg-muted">Campanha</th>
                <th className="text-left py-2.5 px-3 font-mono uppercase tracking-wider text-fg-muted">Conjunto</th>
                <th className="text-left py-2.5 px-3 font-mono uppercase tracking-wider text-fg-muted">Anúncio</th>
                <th className="text-right py-2.5 px-3 font-mono uppercase tracking-wider text-fg-muted">Invest.</th>
                <th className="text-right py-2.5 px-3 font-mono uppercase tracking-wider text-fg-muted">Cliques</th>
                <th className="text-right py-2.5 px-3 font-mono uppercase tracking-wider text-fg-muted">Result.</th>
                <th className="text-right py-2.5 px-3 font-mono uppercase tracking-wider text-fg-muted">CPR</th>
                <th className="text-right py-2.5 px-3 font-mono uppercase tracking-wider text-fg-muted">Freq.</th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-fg-muted">Sem anúncios no período.</td></tr>
              ) : data.campaigns.slice(0, 50).map((c, i) => (
                <tr key={`${c.campaign_id}-${i}`} className="border-b border-line/40 hover:bg-white/[0.02]">
                  <td className="py-2 px-3 truncate max-w-[160px]" title={c.campaign_name}>{c.campaign_name}</td>
                  <td className="py-2 px-3 truncate max-w-[160px] text-fg-muted" title={c.adset_name}>{c.adset_name || '—'}</td>
                  <td className="py-2 px-3 truncate max-w-[160px] text-fg-muted" title={c.ad_name}>{c.ad_name || '—'}</td>
                  <td className="py-2 px-3 text-right font-mono tabular">{formatCurrency(c.spend)}</td>
                  <td className="py-2 px-3 text-right font-mono tabular">{c.clicks}</td>
                  <td className="py-2 px-3 text-right font-mono tabular text-emerald">{c.results}</td>
                  <td className="py-2 px-3 text-right font-mono tabular">{c.results > 0 ? formatCurrency(c.cpr) : '—'}</td>
                  <td className="py-2 px-3 text-right font-mono tabular text-fg-muted">{c.frequency.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      )}
    </div>
  );
}

// ============================================================================
// Componentes reusáveis
// ============================================================================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass-static p-5 lg:p-6">
      <Kicker>{title}</Kicker>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PeriodFilter({ preset, start, end, onPreset, onStart, onEnd, loading }: {
  preset: number; start: string; end: string;
  onPreset: (n: number) => void; onStart: (v: string) => void; onEnd: (v: string) => void;
  loading?: boolean;
}) {
  return (
    <section className="glass-static p-4 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1 p-1 rounded-lg glass-inner">
        {PRESETS.map((p) => (
          <button key={p.days} type="button" onClick={() => onPreset(p.days)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              preset === p.days ? 'bg-brand/20 text-brand' : 'text-fg-muted hover:text-fg'
            }`}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-fg-muted ml-auto">
        <span>De</span>
        <input type="date" value={start} onChange={(e) => onStart(e.target.value)} className="input !text-xs !py-1" />
        <span>até</span>
        <input type="date" value={end} onChange={(e) => onEnd(e.target.value)} className="input !text-xs !py-1" />
        {loading && <span className="text-fg-dim ml-2">…</span>}
      </div>
    </section>
  );
}

function Stat({ icon, label, value, accent = 'info', sub }: {
  icon?: string; label: string; value: string | number; accent?: 'brand' | 'success' | 'warn' | 'info' | 'danger'; sub?: string;
}) {
  const color =
    accent === 'success' ? '#10F2A0'
    : accent === 'warn' ? '#FFC857'
    : accent === 'danger' ? '#FF6363'
    : accent === 'brand' ? '#10F2A0'
    : '#5EE2FF';
  return (
    <div className="glass-inner p-4">
      <div className="text-[10px] uppercase tracking-widest text-fg-dim font-mono flex items-center gap-1.5">
        {icon && <span className="text-base">{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular tracking-tightest" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-fg-muted mt-1 truncate">{sub}</div>}
    </div>
  );
}

function RateCard({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  const pct = value * 100;
  return (
    <div className="glass-inner p-4">
      <div className="text-[10px] uppercase tracking-widest text-fg-dim font-mono mb-2">{label}</div>
      <div className={`text-2xl font-semibold tabular ${highlight ? 'text-emerald' : ''}`}>{pct.toFixed(1)}%</div>
      <div className="mt-2 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: highlight ? '#10F2A0' : '#5EE2FF' }} />
      </div>
    </div>
  );
}

function KV({ label, value, mono = false, highlight = false }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-fg-muted">{label}</span>
      <span className={`${mono ? 'font-mono' : ''} ${highlight ? 'text-emerald font-semibold' : ''} tabular`}>{value}</span>
    </div>
  );
}

function SellerCard({ slice, onClick }: { slice: OverviewSellerSlice; onClick: () => void }) {
  const b = slice.bucket;
  const conv = safeRatio(b.won, b.leads);
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-inner p-4 text-left transition-all hover:bg-white/[0.04]"
      style={{ borderLeft: `4px solid ${slice.seller_color}` }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="h-7 w-7 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold"
          style={{ background: `${slice.seller_color}22`, color: slice.seller_color }}>
          {slice.seller_name.charAt(0).toUpperCase()}
        </div>
        <div className="font-medium text-sm truncate flex-1">{slice.seller_name}</div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
        <div>
          <div className="text-fg-dim text-[10px] uppercase tracking-widest">Leads</div>
          <div className="text-lg font-semibold tabular">{b.leads}</div>
        </div>
        <div>
          <div className="text-fg-dim text-[10px] uppercase tracking-widest">Vendas</div>
          <div className="text-lg font-semibold tabular text-emerald">{b.won}</div>
        </div>
        <div>
          <div className="text-fg-dim text-[10px] uppercase tracking-widest">Conv.</div>
          <div className="text-lg font-semibold tabular">{formatPct(conv)}</div>
        </div>
      </div>
      {b.deal_value > 0 && (
        <div className="mt-3 pt-3 border-t border-line/40 text-xs">
          <div className="text-fg-dim text-[10px] uppercase tracking-widest">Valor em vendas</div>
          <div className="text-base font-mono tabular text-emerald mt-0.5">{formatCurrency(b.deal_value)}</div>
        </div>
      )}
    </button>
  );
}

function FunnelBar({ label, value, max, color, highlight = false }: {
  label: string; value: number; max: number; color: string; highlight?: boolean;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className={highlight ? 'font-semibold text-emerald' : ''}>{label}</span>
        <span className="font-mono tabular text-fg-muted text-xs">{formatNumber(value)}</span>
      </div>
      <div className="h-4 rounded-full bg-white/[0.04] overflow-hidden relative">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}40` }} />
      </div>
    </div>
  );
}

// ============================================================================
// Gráficos
// ============================================================================

function MultiLineChart({ daily, meta, series }: {
  daily: SalesDailyRow[];
  meta: MetaDailyRow[];
  series: Array<{ key: string; label: string; color: string; source: 'sales' | 'meta'; dashed?: boolean; scale?: 'left' | 'right' }>;
}) {
  const width = 900, height = 240, pad = 36;
  const innerW = width - pad * 2, innerH = height - pad * 2;
  const metaMap = new Map(meta.map((m) => [m.date, m]));

  // Cria array combinado de dias com ambas fontes
  const points = daily.map((d) => ({
    date: d.date,
    sales: d,
    meta: metaMap.get(d.date) || { date: d.date, spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0 },
  }));

  const leftSeries = series.filter((s) => (s.scale || 'left') === 'left');
  const rightSeries = series.filter((s) => s.scale === 'right');

  function getVal(p: typeof points[number], s: typeof series[number]): number {
    const src = s.source === 'sales' ? p.sales : p.meta;
    return Number((src as any)[s.key]) || 0;
  }

  const maxLeft = Math.max(1, ...points.flatMap((p) => leftSeries.map((s) => getVal(p, s))));
  const maxRight = Math.max(1, ...points.flatMap((p) => rightSeries.map((s) => getVal(p, s))));

  function xAt(i: number) { return points.length <= 1 ? pad + innerW / 2 : pad + (i / (points.length - 1)) * innerW; }
  function yLeft(v: number) { return pad + innerH - (v / maxLeft) * innerH; }
  function yRight(v: number) { return pad + innerH - (v / maxRight) * innerH; }

  function pathFor(s: typeof series[number]): string {
    const yFn = (s.scale || 'left') === 'left' ? yLeft : yRight;
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yFn(getVal(p, s))}`).join(' ');
  }

  // Eixo X: mostra alguns dias
  const step = Math.max(1, Math.floor(points.length / 8));
  const xTicks = points.map((p, i) => ({ i, date: p.date })).filter((_, i) => i % step === 0);

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" preserveAspectRatio="none">
        {/* Grid */}
        {[0.25, 0.5, 0.75].map((p) => (
          <line key={p} x1={pad} y1={pad + innerH * p} x2={width - pad} y2={pad + innerH * p}
            stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
        ))}
        {/* Linhas */}
        {series.map((s) => (
          <path key={s.key} d={pathFor(s)} fill="none" stroke={s.color} strokeWidth="2"
            strokeDasharray={s.dashed ? '4 3' : undefined} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {/* X ticks */}
        {xTicks.map((t) => (
          <text key={t.i} x={xAt(t.i)} y={height - 8} textAnchor="middle" fontSize="9" fill="#7A8584" fontFamily="monospace">
            {t.date.slice(5).replace('-', '/')}
          </text>
        ))}
      </svg>
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-fg-muted mt-2">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5" style={{ background: s.color, borderTop: s.dashed ? `1px dashed ${s.color}` : 'none' }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function RoasDailyChart({ sales, meta }: { sales: SalesDailyRow[]; meta: MetaDailyRow[] }) {
  const metaMap = new Map(meta.map((m) => [m.date, m]));
  const points = sales.map((d) => {
    const m = metaMap.get(d.date);
    const spend = m?.spend || 0;
    const roas = spend > 0 ? d.deal_value / spend : 0;
    return { date: d.date, roas, spend, value: d.deal_value };
  });

  const width = 900, height = 200, pad = 36;
  const innerW = width - pad * 2, innerH = height - pad * 2;
  const maxRoas = Math.max(1, ...points.map((p) => p.roas));

  function xAt(i: number) { return points.length <= 1 ? pad + innerW / 2 : pad + (i / (points.length - 1)) * innerW; }
  function yAt(v: number) { return pad + innerH - (v / maxRoas) * innerH; }

  // Linha base ROAS=1 (breakeven)
  const breakevenY = yAt(1);

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((p) => (
          <line key={p} x1={pad} y1={pad + innerH * p} x2={width - pad} y2={pad + innerH * p}
            stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
        ))}
        {/* Linha de breakeven */}
        <line x1={pad} y1={breakevenY} x2={width - pad} y2={breakevenY} stroke="#FFC857" strokeDasharray="4 4" strokeWidth="1.5" />
        <text x={pad + 4} y={breakevenY - 4} fontSize="10" fill="#FFC857" fontFamily="monospace">breakeven (1×)</text>

        {/* Barras coloridas baseadas em ROAS */}
        {points.map((p, i) => {
          if (p.roas === 0) return null;
          const x = xAt(i);
          const y = yAt(p.roas);
          const h = pad + innerH - y;
          const color = p.roas >= 2 ? '#10F2A0' : p.roas >= 1 ? '#5EE2FF' : '#FF6363';
          const bw = innerW / Math.max(1, points.length) * 0.7;
          return <rect key={i} x={x - bw / 2} y={y} width={bw} height={h} fill={color} opacity="0.85" rx="2" />;
        })}
      </svg>
      <div className="flex items-center justify-center gap-5 text-[11px] text-fg-muted mt-2">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#10F2A0' }} />≥ 2× (escala)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#5EE2FF' }} />1×–2× (positivo)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#FF6363' }} />&lt; 1× (prejuízo)</span>
      </div>
    </div>
  );
}

function MetaDailyChart({ daily }: { daily: MetaDailyRow[] }) {
  const maxSpend = Math.max(1, ...daily.map((d) => d.spend));
  const maxRes = Math.max(1, ...daily.map((d) => d.results));
  const width = 900, height = 220, pad = 36;
  const innerW = width - pad * 2, innerH = height - pad * 2;
  function xAt(i: number) { return daily.length <= 1 ? pad + innerW / 2 : pad + (i / (daily.length - 1)) * innerW; }
  function ySpend(v: number) { return pad + innerH - (v / maxSpend) * innerH; }
  function yRes(v: number) { return pad + innerH - (v / maxRes) * innerH; }

  const step = Math.max(1, Math.floor(daily.length / 8));
  const xTicks = daily.map((p, i) => ({ i, date: p.date })).filter((_, i) => i % step === 0);

  // Área de spend
  const areaPath = daily.length > 0
    ? `M ${xAt(0)} ${pad + innerH} ` +
      daily.map((d, i) => `L ${xAt(i)} ${ySpend(d.spend)}`).join(' ') +
      ` L ${xAt(daily.length - 1)} ${pad + innerH} Z`
    : '';
  const resPath = daily.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yRes(d.results)}`).join(' ');

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" preserveAspectRatio="none">
        <defs>
          <linearGradient id="spendGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#10F2A0" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#10F2A0" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((p) => (
          <line key={p} x1={pad} y1={pad + innerH * p} x2={width - pad} y2={pad + innerH * p}
            stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
        ))}
        <path d={areaPath} fill="url(#spendGrad)" />
        <path d={daily.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${ySpend(d.spend)}`).join(' ')} fill="none" stroke="#10F2A0" strokeWidth="2" />
        <path d={resPath} fill="none" stroke="#5EE2FF" strokeWidth="2" strokeDasharray="4 3" />
        {xTicks.map((t) => (
          <text key={t.i} x={xAt(t.i)} y={height - 8} textAnchor="middle" fontSize="9" fill="#7A8584" fontFamily="monospace">
            {t.date.slice(5).replace('-', '/')}
          </text>
        ))}
      </svg>
      <div className="flex items-center justify-center gap-5 text-[11px] text-fg-muted mt-2">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5" style={{ background: '#10F2A0' }} />Investimento (R$)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5" style={{ background: '#5EE2FF', borderTop: '1px dashed #5EE2FF' }} />Resultados</span>
      </div>
    </div>
  );
}

function GenderDonut({ data }: { data: MetaDemoRow[] }) {
  const total = data.reduce((acc, d) => acc + d.reach, 0);
  if (total === 0) return <div className="text-sm text-fg-muted py-8 text-center">Sem dados.</div>;

  const colorMap: Record<string, string> = {
    male: '#5EE2FF', female: '#E060B6', unknown: '#7A8584',
  };
  const labelMap: Record<string, string> = {
    male: 'Masculino', female: 'Feminino', unknown: 'Não identificado',
  };

  const size = 200, radius = 80, cx = size / 2, cy = size / 2;
  let cumulative = 0;
  const slices = data.map((d) => {
    const pct = d.reach / total;
    const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    cumulative += pct;
    const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);
    const large = pct > 0.5 ? 1 : 0;
    return {
      key: d.key,
      pct,
      reach: d.reach,
      color: colorMap[d.key] || '#A66EFC',
      label: labelMap[d.key] || d.key,
      path: `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`,
    };
  });

  return (
    <div className="flex items-center gap-6 flex-wrap justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((s) => (
          <path key={s.key} d={s.path} fill={s.color} stroke="#0B1314" strokeWidth="2" />
        ))}
        {/* Donut hole */}
        <circle cx={cx} cy={cy} r={50} fill="#0B1314" />
        <text x={cx} y={cy - 5} textAnchor="middle" fontSize="12" fill="#7A8584" fontFamily="monospace">ALCANCE</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="16" fill="#E8EDED" fontWeight="600" fontFamily="monospace">
          {formatNumber(total)}
        </text>
      </svg>
      <div className="space-y-2 min-w-[140px]">
        {slices.map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 rounded-sm" style={{ background: s.color }} />
            <span className="flex-1">{s.label}</span>
            <span className="font-mono tabular text-fg-muted">{formatPct(s.pct)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgeBarChart({ data }: { data: MetaDemoRow[] }) {
  // Ordena por faixa (13-17, 18-24, ...)
  const orderMap: Record<string, number> = { '13-17': 1, '18-24': 2, '25-34': 3, '35-44': 4, '45-54': 5, '55-64': 6, '65+': 7 };
  const sorted = [...data].sort((a, b) => (orderMap[a.key] || 99) - (orderMap[b.key] || 99));
  const max = Math.max(1, ...sorted.map((d) => d.reach));
  const total = sorted.reduce((acc, d) => acc + d.reach, 0);

  return (
    <div className="space-y-2.5">
      {sorted.map((d) => {
        const pct = d.reach / max;
        const sharePct = total > 0 ? d.reach / total : 0;
        return (
          <div key={d.key}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-mono">{d.key}</span>
              <span className="font-mono tabular text-fg-muted">
                {formatNumber(d.reach)} <span className="text-fg-dim">· {formatPct(sharePct)}</span>
              </span>
            </div>
            <div className="h-3 rounded-full bg-white/[0.04] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: 'linear-gradient(90deg, #5EE2FF, #A66EFC)' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RegionBarChart({ data }: { data: MetaDemoRow[] }) {
  const max = Math.max(1, ...data.map((d) => d.reach));
  return (
    <div className="space-y-2">
      {data.map((d, i) => {
        const pct = d.reach / max;
        return (
          <div key={d.key} className="flex items-center gap-3 text-xs">
            <span className="font-mono text-fg-dim w-6 text-right">{i + 1}.</span>
            <span className="min-w-[140px] truncate">{d.key}</span>
            <div className="flex-1 h-2.5 rounded-full bg-white/[0.04] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: '#FFC857' }} />
            </div>
            <span className="font-mono tabular text-fg-muted min-w-[60px] text-right">{formatNumber(d.reach)}</span>
          </div>
        );
      })}
    </div>
  );
}

function FollowupTable({ sales, meta }: { sales: SalesDashboard; meta: MetaDashboard | null }) {
  const metaMap = new Map((meta?.daily || []).map((m) => [m.date, m]));
  const rows = sales.daily.slice().reverse();

  return (
    <div className="overflow-x-auto -mx-6">
      <table className="w-full text-xs">
        <thead className="bg-white/[0.02]">
          <tr className="border-b border-line">
            <th className="text-left py-2.5 px-3 font-mono uppercase tracking-wider text-fg-muted">Data</th>
            <th className="text-right py-2.5 px-3 font-mono uppercase tracking-wider text-fg-muted">Leads</th>
            <th className="text-right py-2.5 px-3 font-mono uppercase tracking-wider text-fg-muted">Qualif.</th>
            <th className="text-right py-2.5 px-3 font-mono uppercase tracking-wider text-fg-muted">Reun. marc.</th>
            <th className="text-right py-2.5 px-3 font-mono uppercase tracking-wider text-fg-muted">Reun. real.</th>
            <th className="text-right py-2.5 px-3 font-mono uppercase tracking-wider text-fg-muted">No show</th>
            <th className="text-right py-2.5 px-3 font-mono uppercase tracking-wider text-fg-muted">Propostas</th>
            <th className="text-right py-2.5 px-3 font-mono uppercase tracking-wider text-fg-muted">Vendas</th>
            <th className="text-right py-2.5 px-3 font-mono uppercase tracking-wider text-fg-muted">Valor</th>
            <th className="text-right py-2.5 px-3 font-mono uppercase tracking-wider text-fg-muted">Invest. Meta</th>
            <th className="text-right py-2.5 px-3 font-mono uppercase tracking-wider text-fg-muted">ROAS</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={11} className="py-8 text-center text-fg-muted">Sem dados no período.</td></tr>
          ) : rows.map((d) => {
            const m = metaMap.get(d.date);
            const spend = m?.spend || 0;
            const roas = spend > 0 ? d.deal_value / spend : 0;
            return (
              <tr key={d.date} className="border-b border-line/40 hover:bg-white/[0.02]">
                <td className="py-2 px-3 font-mono">{d.date.split('-').reverse().join('/')}</td>
                <td className="py-2 px-3 text-right font-mono tabular">{d.leads || ''}</td>
                <td className="py-2 px-3 text-right font-mono tabular">{d.qualified || ''}</td>
                <td className="py-2 px-3 text-right font-mono tabular">{d.meeting_scheduled || ''}</td>
                <td className="py-2 px-3 text-right font-mono tabular">{d.meeting_held || ''}</td>
                <td className="py-2 px-3 text-right font-mono tabular text-warn">{d.no_show || ''}</td>
                <td className="py-2 px-3 text-right font-mono tabular">{d.proposal || ''}</td>
                <td className="py-2 px-3 text-right font-mono tabular text-emerald">{d.won || ''}</td>
                <td className="py-2 px-3 text-right font-mono tabular text-emerald">{d.deal_value > 0 ? formatCurrency(d.deal_value) : ''}</td>
                <td className="py-2 px-3 text-right font-mono tabular">{spend > 0 ? formatCurrency(spend) : ''}</td>
                <td className="py-2 px-3 text-right font-mono tabular" style={{ color: roas >= 2 ? '#10F2A0' : roas >= 1 ? '#5EE2FF' : roas > 0 ? '#FF6363' : '#7A8584' }}>
                  {roas > 0 ? `${roas.toFixed(2)}×` : ''}
                </td>
              </tr>
            );
          })}
          {/* Totalizador */}
          <tr className="bg-white/[0.03] font-semibold">
            <td className="py-3 px-3 font-mono">TOTAL</td>
            <td className="py-3 px-3 text-right font-mono tabular">{sales.totals.leads}</td>
            <td className="py-3 px-3 text-right font-mono tabular">{sales.totals.qualified}</td>
            <td className="py-3 px-3 text-right font-mono tabular">{sales.totals.meeting_scheduled}</td>
            <td className="py-3 px-3 text-right font-mono tabular">{sales.totals.meeting_held}</td>
            <td className="py-3 px-3 text-right font-mono tabular text-warn">{sales.totals.no_show}</td>
            <td className="py-3 px-3 text-right font-mono tabular">{sales.totals.proposal}</td>
            <td className="py-3 px-3 text-right font-mono tabular text-emerald">{sales.totals.won}</td>
            <td className="py-3 px-3 text-right font-mono tabular text-emerald">{formatCurrency(sales.totals.deal_value)}</td>
            <td className="py-3 px-3 text-right font-mono tabular">{meta ? formatCurrency(meta.totals.spend) : '—'}</td>
            <td className="py-3 px-3 text-right font-mono tabular text-emerald">
              {meta && meta.totals.spend > 0 ? `${(sales.totals.deal_value / meta.totals.spend).toFixed(2)}×` : '—'}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
