/**
 * Cliente Meta Marketing API (Facebook/Instagram Ads).
 *
 * Usa System User Token (não expira) — escopo limitado às Ad Accounts
 * dentro do Business Portfolio "Geometric Agency".
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/
 *
 * Métricas suportadas:
 *   - insights (impressions, reach, clicks, spend, cpc, cpm, ctr, results)
 *   - daily breakdown
 *   - demographic breakdown (age, gender, region)
 *   - top ads (best CPR)
 */

const API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

const TOKEN = process.env.META_SYSTEM_USER_TOKEN || '';
const DEFAULT_AD_ACCOUNT = process.env.META_DEFAULT_AD_ACCOUNT || '';

function assertConfigured() {
  if (!TOKEN) throw new Error('META_SYSTEM_USER_TOKEN não configurado.');
}

export async function metaFetch<T = any>(path: string, params: Record<string, string> = {}, init: RequestInit = {}): Promise<T> {
  assertConfigured();
  const url = new URL(`${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);
  url.searchParams.set('access_token', TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20000), ...init });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data?.error) {
    const msg = data?.error?.message || `Meta API ${res.status}`;
    const err = new Error(msg) as any;
    err.status = res.status;
    err.code = data?.error?.code;
    err.fbtrace_id = data?.error?.fbtrace_id;
    throw err;
  }
  return data as T;
}

// =============================================================================
// Types
// =============================================================================

export type MetaAdAccount = {
  id: string;
  name: string;
  account_status: number;
  currency: string;
};

export type MetaInsights = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;        // %
  cpc: number;        // R$
  cpm: number;        // R$
  results: number;    // total de "actions" do tipo configurado
  cpr: number;        // custo por resultado
  frequency: number;
};

export type MetaCampaignRow = {
  campaign_id: string;
  campaign_name: string;
  adset_name?: string;
  ad_name?: string;
  spend: number;
  clicks: number;
  results: number;
  frequency: number;
  cpr: number;
};

export type MetaDailyRow = {
  date: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  results: number;
};

export type MetaDemoRow = { key: string; reach: number; impressions: number; clicks: number; results: number; spend: number };

export type MetaDashboard = {
  account: { id: string; name: string; currency: string };
  totals: MetaInsights;
  daily: MetaDailyRow[];
  campaigns: MetaCampaignRow[];
  by_gender: MetaDemoRow[];
  by_age: MetaDemoRow[];
  by_region: MetaDemoRow[];
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Tipos de ação que representam "resultado" no Meta Ads.
 *
 * O painel oficial do Meta mostra "Resultados" baseado no optimization_goal de cada
 * campanha. Como agregamos no nível conta, pegamos o action_type lead-like com MAIOR
 * valor — pra campanha objetivo MENSAGENS o `messaging_conversation_started_7d` vai
 * ser maior; pra Lead Ads, o `lead_grouped` vai ser maior; etc.
 */
const LEAD_ACTION_TYPES = [
  // Lead Ads / Instant Form
  'onsite_conversion.lead_grouped',
  'onsite_conversion.lead',
  'lead',
  'lead_form_submit',
  // Pixel de site
  'offsite_conversion.fb_pixel_lead',
  'offsite_complete_registration_add_meta_leads',
  'offsite_conversion.fb_pixel_complete_registration',
  'offsite_content_view_add_meta_leads',
  'offsite_search_add_meta_leads',
  'onsite_web_lead',
  // Mensagens (WhatsApp/Messenger/Instagram)
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.messaging_first_reply',
  'onsite_conversion.total_messaging_connection',
  // Compras
  'purchase',
  'onsite_conversion.purchase',
  'offsite_conversion.fb_pixel_purchase',
  // Flows
  'onsite_conversion.flow_complete',
];

function extractResults(insight: any): number {
  const actions: Array<{ action_type: string; value: string }> = insight?.actions || [];
  if (!actions.length) return 0;

  // Pega o MAIOR valor entre os action_types lead-like.
  // Isso replica o que o painel oficial mostra como "Resultados".
  let max = 0;
  for (const t of LEAD_ACTION_TYPES) {
    const hit = actions.find((a) => a.action_type === t);
    if (hit) {
      const v = Number(hit.value) || 0;
      if (v > max) max = v;
    }
  }
  if (max > 0) return max;

  // Fallback: link clicks (campanhas de tráfego puro)
  const linkClicks = actions.find((a) => a.action_type === 'link_click');
  return linkClicks ? Number(linkClicks.value) || 0 : 0;
}

function parseInsights(raw: any): MetaInsights {
  const spend = Number(raw?.spend) || 0;
  const impressions = Number(raw?.impressions) || 0;
  const reach = Number(raw?.reach) || 0;
  const clicks = Number(raw?.clicks) || 0;
  const ctr = Number(raw?.ctr) || 0;
  const cpc = Number(raw?.cpc) || 0;
  const cpm = Number(raw?.cpm) || 0;
  const frequency = Number(raw?.frequency) || 0;
  const results = extractResults(raw);
  const cpr = results > 0 ? spend / results : 0;
  return { spend, impressions, reach, clicks, ctr, cpc, cpm, results, cpr, frequency };
}

// =============================================================================
// API
// =============================================================================

const AD_ACCOUNT_FIELDS = 'id,name,account_status,currency';

/** Diagnóstico de uma fonte (edge) de contas. */
export type AdAccountSource = { source: string; count: number; pages: number; error?: string };
export type AdAccountsDiagnostics = {
  sources: AdAccountSource[];
  businesses: number;
  businesses_error?: string;
  total_unique: number;
};

/**
 * Pagina um edge que retorna ad accounts, seguindo paging.next até esgotar.
 * Tolerante a erro de permissão num edge específico (retorna o que já tem +
 * a mensagem de erro pra diagnóstico).
 */
async function paginateAdAccounts(path: string): Promise<{ accounts: MetaAdAccount[]; pages: number; error?: string }> {
  const out: MetaAdAccount[] = [];
  let nextUrl: string | null = null;
  let page = 0;
  try {
    do {
      let r: any;
      if (nextUrl) {
        const res = await fetch(nextUrl, { signal: AbortSignal.timeout(20000) });
        r = await res.json();
        if (r?.error) return { accounts: out, pages: page, error: r.error.message };
      } else {
        r = await metaFetch<{ data: MetaAdAccount[]; paging?: { next?: string } }>(path, {
          fields: AD_ACCOUNT_FIELDS,
          limit: '100',
        });
      }
      if (Array.isArray(r?.data)) out.push(...r.data);
      nextUrl = r?.paging?.next || null;
      page++;
      if (page > 50) break; // safety cap (~5000 contas por edge)
    } while (nextUrl);
  } catch (e: any) {
    return { accounts: out, pages: page, error: e?.message || 'erro desconhecido' };
  }
  return { accounts: out, pages: page };
}

/**
 * Lista TODAS as contas de anúncio acessíveis + diagnóstico por fonte.
 *
 * `/me/adaccounts` só traz as contas em que o System User foi atribuído
 * diretamente. Para cobrir tudo que o Business Portfolio tem acesso, também
 * varremos cada negócio em `/me/businesses` pegando `owned_ad_accounts`
 * (contas próprias) + `client_ad_accounts` (contas de clientes às quais o
 * portfolio tem acesso). Juntamos tudo com dedupe por id.
 */
export async function listAdAccountsDetailed(): Promise<{ accounts: MetaAdAccount[]; diagnostics: AdAccountsDiagnostics }> {
  const labeled: Array<{ label: string; p: Promise<{ accounts: MetaAdAccount[]; pages: number; error?: string }> }> = [
    { label: '/me/adaccounts', p: paginateAdAccounts('/me/adaccounts') },
  ];

  // Contas via negócios (owned + client).
  //
  // Atenção: com token de SYSTEM USER, `/me/businesses` retorna vazio — o
  // system user não lista o próprio Business Manager por esse edge. Por isso
  // os IDs dos BMs da agência precisam ser informados em META_BUSINESS_IDS
  // (separados por vírgula). Cada BM expõe `client_ad_accounts` (contas de
  // clientes compartilhadas com a agência) que NÃO aparecem em /me/adaccounts.
  const bizMap = new Map<string, string>(); // id -> nome
  let businessesError: string | undefined;
  try {
    const biz = await metaFetch<{ data: Array<{ id: string; name?: string }> }>('/me/businesses', {
      fields: 'id,name',
      limit: '100',
    });
    for (const b of biz?.data || []) bizMap.set(b.id, b.name || b.id);
  } catch (e: any) {
    businessesError = e?.message || 'falha ao listar /me/businesses (business_management?)';
  }

  // BMs configurados explicitamente (fonte principal pra token de system user)
  const envIds = (process.env.META_BUSINESS_IDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  for (const id of envIds) {
    if (bizMap.has(id)) continue;
    let name = id;
    try {
      const info = await metaFetch<{ name?: string }>(`/${id}`, { fields: 'name' });
      if (info?.name) name = info.name;
    } catch { /* id inválido / sem acesso — mantém o id como label */ }
    bizMap.set(id, name);
  }

  const businessesCount = bizMap.size;
  for (const [id, name] of bizMap) {
    labeled.push({ label: `owned · ${name}`, p: paginateAdAccounts(`/${id}/owned_ad_accounts`) });
    labeled.push({ label: `client · ${name}`, p: paginateAdAccounts(`/${id}/client_ad_accounts`) });
  }

  const settled = await Promise.all(labeled.map(async ({ label, p }) => ({ label, ...(await p) })));

  // Dedupe por id mantendo o primeiro nome/status não-vazio encontrado
  const byId = new Map<string, MetaAdAccount>();
  for (const s of settled) {
    for (const acc of s.accounts) {
      if (!acc?.id) continue;
      const prev = byId.get(acc.id);
      if (!prev) byId.set(acc.id, acc);
      else if (!prev.name && acc.name) byId.set(acc.id, acc);
    }
  }

  const accounts = Array.from(byId.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const diagnostics: AdAccountsDiagnostics = {
    sources: settled.map((s) => ({ source: s.label, count: s.accounts.length, pages: s.pages, error: s.error })),
    businesses: businessesCount,
    businesses_error: businessesError,
    total_unique: accounts.length,
  };
  return { accounts, diagnostics };
}

export async function listAdAccounts(): Promise<MetaAdAccount[]> {
  return (await listAdAccountsDetailed()).accounts;
}

export async function getAccountInfo(adAccountId: string): Promise<MetaAdAccount> {
  const id = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  return metaFetch<MetaAdAccount>(`/${id}`, {
    fields: 'id,name,account_status,currency',
  });
}

/**
 * Pega métricas agregadas + diárias + campanhas.
 *
 * @param adAccountId Formato `act_XXXXX`
 * @param start Data início YYYY-MM-DD
 * @param end Data fim YYYY-MM-DD
 */
// Presets de data aceitos da Meta (ela resolve a janela no FUSO DA CONTA, igual
// ao Ads Manager). Usar date_preset garante que o gasto bata exato com o painel
// oficial — em vez de mandar datas em UTC com janela deslocada/incluindo hoje.
const ALLOWED_DATE_PRESETS = new Set([
  'today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'last_90d',
  'this_month', 'last_month', 'this_quarter', 'maximum',
]);

export async function getDashboardData(opts: {
  adAccountId?: string;
  start: string;
  end: string;
  datePreset?: string;
}): Promise<MetaDashboard> {
  const id = (opts.adAccountId || DEFAULT_AD_ACCOUNT).trim();
  if (!id) throw new Error('Ad Account ID não definido.');
  const account_id = id.startsWith('act_') ? id : `act_${id}`;
  const time_range = JSON.stringify({ since: opts.start, until: opts.end });
  // Com preset válido → date_preset (fuso da conta). Sem preset (range custom) →
  // time_range com as datas escolhidas pelo usuário.
  const rangeParams: Record<string, string> =
    opts.datePreset && ALLOWED_DATE_PRESETS.has(opts.datePreset)
      ? { date_preset: opts.datePreset }
      : { time_range };

  // 1. Account info
  const account = await getAccountInfo(account_id);

  // 2. Insights totais — use_unified_attribution_setting garante que os números
  // batam com o painel oficial do Meta (mesmo modelo de atribuição que a conta usa).
  const totalsRaw = await metaFetch<{ data: any[] }>(`/${account_id}/insights`, {
    fields: 'spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,cost_per_action_type',
    ...rangeParams,
    level: 'account',
    use_unified_attribution_setting: 'true',
  });
  const totals = parseInsights(totalsRaw.data?.[0] || {});

  // 3. Insights diários
  const dailyRaw = await metaFetch<{ data: any[] }>(`/${account_id}/insights`, {
    fields: 'date_start,spend,impressions,reach,clicks,actions',
    ...rangeParams,
    level: 'account',
    time_increment: '1',
    use_unified_attribution_setting: 'true',
  });
  const daily: MetaDailyRow[] = (dailyRaw.data || []).map((r: any) => ({
    date: r.date_start,
    spend: Number(r.spend) || 0,
    impressions: Number(r.impressions) || 0,
    reach: Number(r.reach) || 0,
    clicks: Number(r.clicks) || 0,
    results: extractResults(r),
  }));

  // 4. Campanhas (top por menor CPR)
  const campaignsRaw = await metaFetch<{ data: any[] }>(`/${account_id}/insights`, {
    fields: 'campaign_id,campaign_name,adset_name,ad_name,spend,clicks,frequency,actions',
    ...rangeParams,
    level: 'ad',
    limit: '50',
    use_unified_attribution_setting: 'true',
  });
  const campaigns: MetaCampaignRow[] = (campaignsRaw.data || []).map((r: any) => {
    const spend = Number(r.spend) || 0;
    const clicks = Number(r.clicks) || 0;
    const results = extractResults(r);
    return {
      campaign_id: r.campaign_id || '',
      campaign_name: r.campaign_name || '',
      adset_name: r.adset_name,
      ad_name: r.ad_name,
      spend,
      clicks,
      results,
      frequency: Number(r.frequency) || 0,
      cpr: results > 0 ? spend / results : 0,
    };
  }).sort((a: MetaCampaignRow, b: MetaCampaignRow) => {
    // Ordena por CPR crescente (melhor primeiro), com resultados > 0
    if (a.results === 0 && b.results > 0) return 1;
    if (b.results === 0 && a.results > 0) return -1;
    return a.cpr - b.cpr;
  });

  // 5. Demografia: gênero, idade, região (cada um em chamada separada com breakdown)
  async function fetchBreakdown(breakdown: string): Promise<MetaDemoRow[]> {
    try {
      const r = await metaFetch<{ data: any[] }>(`/${account_id}/insights`, {
        fields: 'reach,impressions,clicks,spend,actions',
        ...rangeParams,
        level: 'account',
        breakdowns: breakdown,
        limit: '500',
        use_unified_attribution_setting: 'true',
      });
      return (r.data || []).map((row: any) => ({
        key: String(row[breakdown] ?? 'desconhecido'),
        reach: Number(row.reach) || 0,
        impressions: Number(row.impressions) || 0,
        clicks: Number(row.clicks) || 0,
        results: extractResults(row),
        spend: Number(row.spend) || 0,
      }));
    } catch {
      return [];
    }
  }

  const [by_gender, by_age, by_region] = await Promise.all([
    fetchBreakdown('gender'),
    fetchBreakdown('age'),
    fetchBreakdown('region').then((rows) =>
      rows
        .sort((a, b) => b.reach - a.reach)
        .slice(0, 10),
    ),
  ]);

  return {
    account: { id: account.id, name: account.name, currency: account.currency },
    totals,
    daily,
    campaigns,
    by_gender,
    by_age,
    by_region,
  };
}
