/**
 * Catálogo de métricas do painel do cliente.
 *
 * Cada item é um "bloco" (card ou seção) que pode ser ligado/desligado por
 * cliente. O admin controla a visibilidade em /admin/[id]; o cliente só vê os
 * blocos habilitados.
 *
 * Dois menus:
 *   - 'comercial' → painel Comercial + Tráfego (kanban × Meta)
 *   - 'campanha'  → painel Campanha (somente Meta Ads)
 *
 * A config fica em tenants.metrics_config = { hidden: string[] }.
 * Chave AUSENTE de `hidden` => visível (default). Assim contas antigas (config
 * null) mostram tudo.
 */

export type MetricMenu = 'comercial' | 'campanha';

export type MetricItem = {
  key: string;
  label: string;
  menu: MetricMenu;
  group: string;
  /** Hint pro admin do que é o bloco. */
  hint?: string;
};

export type MetricsConfig = { hidden?: string[] };

export const METRIC_CATALOG: MetricItem[] = [
  // ===== MENU COMERCIAL + TRÁFEGO =====
  // Funil comercial (cards)
  { key: 'leads', label: 'Leads recebidos', menu: 'comercial', group: 'Funil comercial' },
  { key: 'qualified', label: 'Qualificados', menu: 'comercial', group: 'Funil comercial' },
  { key: 'meeting_scheduled', label: 'Reuniões marcadas', menu: 'comercial', group: 'Funil comercial' },
  { key: 'meeting_held', label: 'Reuniões realizadas', menu: 'comercial', group: 'Funil comercial' },
  { key: 'no_show', label: 'No show', menu: 'comercial', group: 'Funil comercial' },
  { key: 'proposal', label: 'Propostas', menu: 'comercial', group: 'Funil comercial' },
  { key: 'won', label: 'Vendas fechadas', menu: 'comercial', group: 'Funil comercial' },
  { key: 'lost', label: 'Perdidos', menu: 'comercial', group: 'Funil comercial' },
  { key: 'deal_value', label: 'Valor em vendas', menu: 'comercial', group: 'Funil comercial' },
  { key: 'ticket', label: 'Ticket médio', menu: 'comercial', group: 'Funil comercial' },
  // ROI (Meta × comercial)
  { key: 'roi_spend', label: 'Investimento Meta', menu: 'comercial', group: 'ROI' },
  { key: 'cpl_real', label: 'CPL real', menu: 'comercial', group: 'ROI' },
  { key: 'cpa_real', label: 'CPA real', menu: 'comercial', group: 'ROI' },
  { key: 'roas', label: 'ROAS', menu: 'comercial', group: 'ROI' },
  { key: 'profit', label: 'Lucro líquido', menu: 'comercial', group: 'ROI' },
  // Taxas de conversão
  { key: 'rate_qualif', label: 'Taxa Lead → Qualificado', menu: 'comercial', group: 'Taxas de conversão' },
  { key: 'rate_agend', label: 'Taxa Lead → Reunião', menu: 'comercial', group: 'Taxas de conversão' },
  { key: 'rate_show', label: 'Taxa Show up', menu: 'comercial', group: 'Taxas de conversão' },
  { key: 'rate_proposta', label: 'Taxa Reunião → Proposta', menu: 'comercial', group: 'Taxas de conversão' },
  { key: 'rate_fechamento', label: 'Taxa Proposta → Venda', menu: 'comercial', group: 'Taxas de conversão' },
  { key: 'rate_geral', label: 'Taxa Lead → Venda', menu: 'comercial', group: 'Taxas de conversão' },
  // Seções
  { key: 'sec_sellers', label: 'Desempenho por vendedor', menu: 'comercial', group: 'Seções', hint: 'Cards de cada vendedor' },
  { key: 'sec_funnel', label: 'Funil de conversão (visual)', menu: 'comercial', group: 'Seções' },
  { key: 'sec_meta_resumo', label: 'Resumo Meta', menu: 'comercial', group: 'Seções' },
  { key: 'sec_evolucao', label: 'Evolução diária', menu: 'comercial', group: 'Seções', hint: 'Leads × Vendas × Investimento' },
  { key: 'sec_roas_daily', label: 'ROAS diário', menu: 'comercial', group: 'Seções' },
  { key: 'sec_tags', label: 'Por tag', menu: 'comercial', group: 'Seções' },
  { key: 'sec_followup', label: 'Follow-up diário (tabela)', menu: 'comercial', group: 'Seções' },

  // ===== MENU CAMPANHA (Meta Ads) =====
  { key: 'm_spend', label: 'Investimento', menu: 'campanha', group: 'Métricas principais' },
  { key: 'm_results', label: 'Resultados', menu: 'campanha', group: 'Métricas principais' },
  { key: 'm_clicks', label: 'Cliques', menu: 'campanha', group: 'Métricas principais' },
  { key: 'm_reach', label: 'Alcance', menu: 'campanha', group: 'Métricas principais' },
  { key: 'm_impressions', label: 'Impressões', menu: 'campanha', group: 'Métricas principais' },
  { key: 'm_frequency', label: 'Frequência', menu: 'campanha', group: 'Métricas principais' },
  { key: 'm_cpr', label: 'CPR (custo/resultado)', menu: 'campanha', group: 'Métricas principais' },
  { key: 'm_cpc', label: 'CPC', menu: 'campanha', group: 'Métricas principais' },
  { key: 'm_ctr', label: 'CTR', menu: 'campanha', group: 'Métricas principais' },
  { key: 'm_cpm', label: 'CPM', menu: 'campanha', group: 'Métricas principais' },
  // Seções
  { key: 'm_sec_funnel', label: 'Funil de tráfego', menu: 'campanha', group: 'Seções' },
  { key: 'm_sec_gender', label: 'Alcance por gênero', menu: 'campanha', group: 'Seções' },
  { key: 'm_sec_age', label: 'Alcance por faixa etária', menu: 'campanha', group: 'Seções' },
  { key: 'm_sec_region', label: 'Top regiões', menu: 'campanha', group: 'Seções' },
  { key: 'm_sec_daily', label: 'Investimento × Resultados (diário)', menu: 'campanha', group: 'Seções' },
  { key: 'm_sec_ads', label: 'Melhores anúncios', menu: 'campanha', group: 'Seções' },
];

export const METRIC_KEYS = METRIC_CATALOG.map((m) => m.key);

/** Agrupa o catálogo por menu → grupo, pra render no admin. */
export function groupCatalog(menu: MetricMenu): Array<{ group: string; items: MetricItem[] }> {
  const out: Array<{ group: string; items: MetricItem[] }> = [];
  for (const item of METRIC_CATALOG) {
    if (item.menu !== menu) continue;
    let bucket = out.find((b) => b.group === item.group);
    if (!bucket) { bucket = { group: item.group, items: [] }; out.push(bucket); }
    bucket.items.push(item);
  }
  return out;
}

/** Set de chaves escondidas, a partir da config do tenant. */
export function hiddenSet(config: MetricsConfig | null | undefined): Set<string> {
  const hidden = config?.hidden;
  return new Set(Array.isArray(hidden) ? hidden : []);
}
