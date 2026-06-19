/**
 * Tools (function-calling) que a IA usa pra operar sobre uma conta Meta Ads.
 * Equivale ao "Meta MCP" oficial — ~55 tools cobrindo análise, criação,
 * catálogos, audiências, pixel/datasets, criativos, ads library.
 *
 * Cada tool tem schema (input_schema compatível JSON Schema reduzido) e implementação.
 * `adAccountId` é fixo por sessão (vem de tenants.meta_ad_account_id).
 */
import { metaFetch } from './meta-ads';

export type ToolDef = {
  name: string;
  description: string;
  input_schema: any;
};

// =============================================================================
// Schemas / Tool definitions
// =============================================================================

export const META_ADS_TOOLS: ToolDef[] = [
  // ─── Análise / Insights básicos ─────────────────────────────────────────────
  {
    name: 'get_account_overview',
    description: 'Métricas agregadas da conta no período (spend, impressions, reach, clicks, ctr, cpc, cpm, results, cpr, frequency). Use primeiro pra diagnóstico geral.',
    input_schema: { type: 'object', properties: { days: { type: 'number', default: 30 } } },
  },
  {
    name: 'list_campaigns',
    description: 'Lista campanhas com status, objetivo, spend e CPL. Use pra inventariar antes de drill-down. Ordenadas por spend.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', default: 30 },
        status: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'ALL'], default: 'ALL' },
      },
    },
  },
  {
    name: 'get_campaign_insights',
    description: 'Métricas detalhadas de UMA campanha (spend, CPM, CTR, frequência, results).',
    input_schema: { type: 'object', required: ['campaign_id'], properties: { campaign_id: { type: 'string' }, days: { type: 'number', default: 30 } } },
  },
  {
    name: 'list_adsets',
    description: 'Lista conjuntos de anúncios (adsets) de uma campanha com budget diário, status e configuração de bid.',
    input_schema: { type: 'object', required: ['campaign_id'], properties: { campaign_id: { type: 'string' } } },
  },
  {
    name: 'get_adset_insights',
    description: 'Métricas de UM adset específico.',
    input_schema: { type: 'object', required: ['adset_id'], properties: { adset_id: { type: 'string' }, days: { type: 'number', default: 30 } } },
  },
  {
    name: 'list_ads',
    description: 'Lista anúncios (creatives) de uma campanha ou adset com performance.',
    input_schema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string' },
        adset_id: { type: 'string' },
        days: { type: 'number', default: 30 },
      },
    },
  },
  {
    name: 'get_ad_insights',
    description: 'Métricas de UM anúncio específico.',
    input_schema: { type: 'object', required: ['ad_id'], properties: { ad_id: { type: 'string' }, days: { type: 'number', default: 30 } } },
  },
  {
    name: 'get_demographics',
    description: 'Breakdown demográfico de uma campanha (idade, gênero, região) pra entender quem responde.',
    input_schema: {
      type: 'object',
      required: ['campaign_id'],
      properties: {
        campaign_id: { type: 'string' },
        days: { type: 'number', default: 30 },
        breakdown: { type: 'string', enum: ['age', 'gender', 'region', 'country', 'age,gender', 'publisher_platform', 'platform_position', 'device_platform'], default: 'age,gender' },
      },
    },
  },

  // ─── Insights avançados (nível MCP oficial) ────────────────────────────────
  {
    name: 'get_industry_benchmark',
    description: 'Compara CPL, CPC, CTR, CPM da conta com benchmarks do setor (industry). Use pra responder "tô bem comparado ao meu mercado?".',
    input_schema: { type: 'object', properties: { days: { type: 'number', default: 30 } } },
  },
  {
    name: 'get_auction_ranking_benchmarks',
    description: 'Ranking de leilão (quality_ranking, engagement_rate_ranking, conversion_rate_ranking) por ad. Mostra se cada anúncio é "above_average", "average" ou "below_average".',
    input_schema: { type: 'object', required: ['campaign_id'], properties: { campaign_id: { type: 'string' }, days: { type: 'number', default: 30 } } },
  },
  {
    name: 'get_anomaly_signals',
    description: 'Detecta anomalias na performance (queda brusca em conversões, gasto fora do padrão, etc).',
    input_schema: { type: 'object', properties: { days: { type: 'number', default: 30 } } },
  },
  {
    name: 'get_performance_trend',
    description: 'Tendência de performance ao longo do tempo (slope, indica se métricas estão melhorando ou piorando).',
    input_schema: { type: 'object', required: ['metric'], properties: { metric: { type: 'string', enum: ['spend', 'impressions', 'clicks', 'ctr', 'cpc', 'cpm', 'frequency'], description: 'Métrica pra analisar tendência' }, days: { type: 'number', default: 30 }, level: { type: 'string', enum: ['account', 'campaign', 'adset', 'ad'], default: 'account' }, entity_id: { type: 'string', description: 'ID quando level != account' } } },
  },
  {
    name: 'get_opportunity_score',
    description: 'Score de oportunidades de otimização sugeridas pelo próprio Meta (ações recomendadas).',
    input_schema: { type: 'object', properties: { days: { type: 'number', default: 30 } } },
  },
  {
    name: 'get_account_errors',
    description: 'Lista erros recentes da conta de anúncios (rejeições, problemas de pagamento, ad approval issues).',
    input_schema: { type: 'object', properties: {} },
  },

  // ─── Mutações (já existentes + novas) ──────────────────────────────────────
  {
    name: 'pause_campaign',
    description: 'Pausa uma campanha (status=PAUSED). Use apenas quando o usuário pediu explicitamente.',
    input_schema: { type: 'object', required: ['campaign_id'], properties: { campaign_id: { type: 'string' } } },
  },
  {
    name: 'unpause_campaign',
    description: 'Reativa uma campanha pausada (status=ACTIVE).',
    input_schema: { type: 'object', required: ['campaign_id'], properties: { campaign_id: { type: 'string' } } },
  },
  {
    name: 'pause_adset',
    description: 'Pausa um adset.',
    input_schema: { type: 'object', required: ['adset_id'], properties: { adset_id: { type: 'string' } } },
  },
  {
    name: 'unpause_adset',
    description: 'Reativa um adset.',
    input_schema: { type: 'object', required: ['adset_id'], properties: { adset_id: { type: 'string' } } },
  },
  {
    name: 'pause_ad',
    description: 'Pausa um anúncio específico.',
    input_schema: { type: 'object', required: ['ad_id'], properties: { ad_id: { type: 'string' } } },
  },
  {
    name: 'unpause_ad',
    description: 'Reativa um anúncio.',
    input_schema: { type: 'object', required: ['ad_id'], properties: { ad_id: { type: 'string' } } },
  },
  {
    name: 'update_adset_budget',
    description: 'Altera budget diário de um adset (em reais). Sistema converte pra centavos.',
    input_schema: { type: 'object', required: ['adset_id', 'daily_budget_brl'], properties: { adset_id: { type: 'string' }, daily_budget_brl: { type: 'number', description: 'Novo budget em reais (ex: 50.00)' } } },
  },
  {
    name: 'update_campaign_budget',
    description: 'Altera budget diário de uma campanha (CBO). Em reais.',
    input_schema: { type: 'object', required: ['campaign_id', 'daily_budget_brl'], properties: { campaign_id: { type: 'string' }, daily_budget_brl: { type: 'number' } } },
  },
  {
    name: 'update_entity',
    description: 'Atualiza propriedades genéricas de uma entidade (campaign/adset/ad). Use pra mudar nome, status, ou outros campos. Recebe JSON de updates.',
    input_schema: { type: 'object', required: ['entity_id', 'updates'], properties: { entity_id: { type: 'string' }, updates: { type: 'object', description: 'Pares chave-valor do que atualizar (ex: { name: "Novo Nome", status: "ACTIVE" })' } } },
  },

  // ─── Criação ───────────────────────────────────────────────────────────────
  {
    name: 'create_campaign',
    description: 'Cria nova campanha. Confirme com o usuário todos os parâmetros antes.',
    input_schema: {
      type: 'object',
      required: ['name', 'objective', 'status'],
      properties: {
        name: { type: 'string' },
        objective: { type: 'string', description: 'Ex: OUTCOME_LEADS, OUTCOME_SALES, OUTCOME_TRAFFIC, OUTCOME_AWARENESS, OUTCOME_ENGAGEMENT, OUTCOME_APP_PROMOTION' },
        status: { type: 'string', enum: ['ACTIVE', 'PAUSED'], default: 'PAUSED' },
        special_ad_categories: { type: 'array', items: { type: 'string' }, description: 'Ex: ["HOUSING"], ["EMPLOYMENT"]. Use [] se nenhuma.' },
        daily_budget_brl: { type: 'number', description: 'Budget diário em R$ (opcional — se omitido, budget fica no adset)' },
      },
    },
  },
  {
    name: 'create_adset',
    description: 'Cria adset dentro de uma campanha.',
    input_schema: {
      type: 'object',
      required: ['campaign_id', 'name', 'optimization_goal', 'billing_event', 'daily_budget_brl', 'targeting'],
      properties: {
        campaign_id: { type: 'string' },
        name: { type: 'string' },
        optimization_goal: { type: 'string', description: 'Ex: LEAD_GENERATION, OFFSITE_CONVERSIONS, LINK_CLICKS, REACH, IMPRESSIONS, VALUE' },
        billing_event: { type: 'string', description: 'Ex: IMPRESSIONS, LINK_CLICKS' },
        daily_budget_brl: { type: 'number' },
        targeting: { type: 'object', description: 'Spec targeting (geo_locations, age_min, age_max, genders, interests, custom_audiences, etc)' },
        status: { type: 'string', enum: ['ACTIVE', 'PAUSED'], default: 'PAUSED' },
        start_time: { type: 'string', description: 'ISO datetime' },
        end_time: { type: 'string' },
      },
    },
  },
  {
    name: 'create_ad',
    description: 'Cria anúncio (vincula creative ao adset).',
    input_schema: {
      type: 'object',
      required: ['adset_id', 'name', 'creative_id'],
      properties: {
        adset_id: { type: 'string' },
        name: { type: 'string' },
        creative_id: { type: 'string', description: 'ID do creative (criado com create_creative)' },
        status: { type: 'string', enum: ['ACTIVE', 'PAUSED'], default: 'PAUSED' },
      },
    },
  },
  {
    name: 'create_creative',
    description: 'Cria creative (criativo) que será associado a um ad.',
    input_schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
        page_id: { type: 'string', description: 'ID da página Facebook que vai postar' },
        object_story_spec: { type: 'object', description: 'Spec completa do post (link_data com message/headline/image_hash/call_to_action, video_data, etc)' },
        title: { type: 'string' },
        body: { type: 'string' },
        image_url: { type: 'string' },
      },
    },
  },

  // ─── Catálogo (e-commerce) ─────────────────────────────────────────────────
  {
    name: 'list_catalogs',
    description: 'Lista catálogos de produtos disponíveis ao Business Manager.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_catalog_details',
    description: 'Detalhes de um catálogo específico (nome, vertical, número de produtos).',
    input_schema: { type: 'object', required: ['catalog_id'], properties: { catalog_id: { type: 'string' } } },
  },
  {
    name: 'get_catalog_diagnostics',
    description: 'Health-check do catálogo (issues, erros de feed, produtos rejeitados).',
    input_schema: { type: 'object', required: ['catalog_id'], properties: { catalog_id: { type: 'string' } } },
  },
  {
    name: 'list_catalog_products',
    description: 'Lista produtos de um catálogo.',
    input_schema: { type: 'object', required: ['catalog_id'], properties: { catalog_id: { type: 'string' }, limit: { type: 'number', default: 25 } } },
  },
  {
    name: 'search_catalog_products',
    description: 'Busca produtos por nome/SKU/marca em um catálogo.',
    input_schema: { type: 'object', required: ['catalog_id', 'query'], properties: { catalog_id: { type: 'string' }, query: { type: 'string' } } },
  },
  {
    name: 'get_product_details',
    description: 'Detalhes de um produto específico.',
    input_schema: { type: 'object', required: ['product_id'], properties: { product_id: { type: 'string' } } },
  },
  {
    name: 'list_product_sets',
    description: 'Lista conjuntos de produtos (product sets) de um catálogo.',
    input_schema: { type: 'object', required: ['catalog_id'], properties: { catalog_id: { type: 'string' } } },
  },
  {
    name: 'list_product_set_products',
    description: 'Lista produtos dentro de um product set.',
    input_schema: { type: 'object', required: ['product_set_id'], properties: { product_set_id: { type: 'string' } } },
  },
  {
    name: 'create_product_set',
    description: 'Cria um novo product set num catálogo (com filtro de produtos).',
    input_schema: { type: 'object', required: ['catalog_id', 'name', 'filter'], properties: { catalog_id: { type: 'string' }, name: { type: 'string' }, filter: { type: 'object', description: 'Filtro JSON (ex: {"product_type": {"eq": "shoes"}})' } } },
  },
  {
    name: 'get_product_feed_details',
    description: 'Detalhes de feeds que abastecem um catálogo (URL, schedule, status).',
    input_schema: { type: 'object', required: ['catalog_id'], properties: { catalog_id: { type: 'string' } } },
  },

  // ─── Audiences (públicos customizados) ─────────────────────────────────────
  {
    name: 'list_custom_audiences',
    description: 'Lista públicos customizados da conta (Custom Audiences).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_custom_audience_details',
    description: 'Detalhes de um público (tamanho, status, subtype, fonte).',
    input_schema: { type: 'object', required: ['audience_id'], properties: { audience_id: { type: 'string' } } },
  },
  {
    name: 'get_custom_audience_adsets',
    description: 'Lista adsets que estão usando esse público.',
    input_schema: { type: 'object', required: ['audience_id'], properties: { audience_id: { type: 'string' } } },
  },
  {
    name: 'create_custom_audience',
    description: 'Cria novo Custom Audience (CUSTOM, WEBSITE, etc).',
    input_schema: { type: 'object', required: ['name', 'subtype'], properties: { name: { type: 'string' }, description: { type: 'string' }, subtype: { type: 'string', enum: ['CUSTOM', 'WEBSITE', 'APP', 'OFFLINE_CONVERSION', 'CLAIM', 'PARTNER', 'MANAGED', 'VIDEO', 'LOOKALIKE', 'ENGAGEMENT', 'BAG_OF_ACCOUNTS', 'STUDY_RULE_AUDIENCE'] }, customer_file_source: { type: 'string' } } },
  },
  {
    name: 'update_custom_audience',
    description: 'Atualiza propriedades de um público (nome, descrição).',
    input_schema: { type: 'object', required: ['audience_id', 'updates'], properties: { audience_id: { type: 'string' }, updates: { type: 'object' } } },
  },
  {
    name: 'delete_custom_audience',
    description: 'Deleta um público. Irreversível.',
    input_schema: { type: 'object', required: ['audience_id'], properties: { audience_id: { type: 'string' } } },
  },

  // ─── Pixel / Datasets ──────────────────────────────────────────────────────
  {
    name: 'list_datasets',
    description: 'Lista datasets/pixels da conta.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_dataset_details',
    description: 'Detalhes de um dataset (eventos, URL, status).',
    input_schema: { type: 'object', required: ['dataset_id'], properties: { dataset_id: { type: 'string' } } },
  },
  {
    name: 'get_dataset_quality',
    description: 'Qualidade do dataset/pixel (match rate, event quality).',
    input_schema: { type: 'object', required: ['dataset_id'], properties: { dataset_id: { type: 'string' } } },
  },
  {
    name: 'get_dataset_stats',
    description: 'Stats agregadas de um dataset (volume de eventos, frequência).',
    input_schema: { type: 'object', required: ['dataset_id'], properties: { dataset_id: { type: 'string' } } },
  },
  {
    name: 'list_custom_conversions',
    description: 'Lista custom conversions da conta.',
    input_schema: { type: 'object', properties: {} },
  },

  // ─── Páginas ──────────────────────────────────────────────────────────────
  {
    name: 'list_user_pages',
    description: 'Lista páginas do Facebook que o usuário tem acesso.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_account_pages',
    description: 'Lista páginas vinculadas à conta de anúncios.',
    input_schema: { type: 'object', properties: {} },
  },

  // ─── Creatives / mídias ───────────────────────────────────────────────────
  {
    name: 'list_creatives',
    description: 'Lista creatives da conta.',
    input_schema: { type: 'object', properties: { limit: { type: 'number', default: 25 } } },
  },
  {
    name: 'get_creative_details',
    description: 'Detalhes de um creative específico.',
    input_schema: { type: 'object', required: ['creative_id'], properties: { creative_id: { type: 'string' } } },
  },
  {
    name: 'list_ad_images',
    description: 'Lista imagens disponíveis na conta (image library).',
    input_schema: { type: 'object', properties: { limit: { type: 'number', default: 25 } } },
  },
  {
    name: 'list_ad_videos',
    description: 'Lista vídeos disponíveis na conta.',
    input_schema: { type: 'object', properties: { limit: { type: 'number', default: 25 } } },
  },
  {
    name: 'get_ad_preview',
    description: 'Gera URL de preview de um anúncio (como ele aparece em diferentes posições).',
    input_schema: { type: 'object', required: ['ad_id', 'format'], properties: { ad_id: { type: 'string' }, format: { type: 'string', enum: ['MOBILE_FEED_STANDARD', 'INSTAGRAM_STANDARD', 'INSTAGRAM_STORY', 'FACEBOOK_STORY_MOBILE', 'INSTAGRAM_REELS', 'DESKTOP_FEED_STANDARD'], description: 'Formato/posicionamento' } } },
  },

  // ─── Ads Library (concorrência) ───────────────────────────────────────────
  {
    name: 'search_ads_library',
    description: 'Busca anúncios públicos no Meta Ads Library — útil pra ver o que CONCORRENTES estão veiculando.',
    input_schema: { type: 'object', required: ['search_terms'], properties: { search_terms: { type: 'string', description: 'Palavra-chave, marca, ou nome de página' }, ad_reached_countries: { type: 'array', items: { type: 'string' }, description: 'Códigos ISO 2 letras (ex: ["BR"])' }, ad_active_status: { type: 'string', enum: ['ACTIVE', 'ALL', 'INACTIVE'], default: 'ACTIVE' }, limit: { type: 'number', default: 10 } } },
  },
];

// =============================================================================
// Helpers
// =============================================================================

function rangeFromDays(days: number): { since: string; until: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - Math.max(1, Math.min(days || 30, 365)));
  return { since: start.toISOString().slice(0, 10), until: end.toISOString().slice(0, 10) };
}

function actId(adAccountId: string): string {
  return adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
}

function brlToCents(brl: number): number {
  const c = Math.round(Number(brl) * 100);
  if (!Number.isFinite(c) || c <= 0) throw new Error('Valor em reais inválido');
  return c;
}

function postUrlEncoded(updates: Record<string, any>): { body: string; headers: Record<string, string> } {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(updates)) {
    params.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  return { body: params.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };
}

function sumLeadResults(actions: any): number {
  if (!Array.isArray(actions)) return 0;
  const leadTypes = new Set([
    'lead', 'leadgen.other', 'onsite_conversion.lead_grouped',
    'offsite_conversion.fb_pixel_lead', 'onsite_web_lead',
    'messaging_conversation_started_7d', 'purchase',
    'offsite_conversion.fb_pixel_purchase',
  ]);
  let max = 0;
  for (const a of actions) {
    if (leadTypes.has(a.action_type)) max = Math.max(max, Number(a.value || 0));
  }
  return max;
}

// =============================================================================
// Execução
// =============================================================================

export async function executeMetaTool(name: string, input: any, ctx: { adAccountId: string }): Promise<any> {
  const acct = actId(ctx.adAccountId);

  switch (name) {
    // ─── Insights básicos ────────────────────────────────────────────────────
    case 'get_account_overview':
    case 'get_campaign_insights':
    case 'get_adset_insights':
    case 'get_ad_insights': {
      const target = name === 'get_account_overview' ? acct
        : name === 'get_campaign_insights' ? input.campaign_id
        : name === 'get_adset_insights' ? input.adset_id
        : input.ad_id;
      const { since, until } = rangeFromDays(input?.days);
      const r = await metaFetch<{ data: any[] }>(`/${target}/insights`, {
        fields: 'spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,action_values',
        time_range: JSON.stringify({ since, until }),
        use_unified_attribution_setting: 'true',
      });
      const row = r.data?.[0] || {};
      const spend = Number(row.spend) || 0;
      const results = sumLeadResults(row.actions);
      return {
        target, period: { since, until },
        spend, impressions: Number(row.impressions || 0), reach: Number(row.reach || 0),
        clicks: Number(row.clicks || 0), ctr: Number(row.ctr || 0), cpc: Number(row.cpc || 0),
        cpm: Number(row.cpm || 0), frequency: Number(row.frequency || 0),
        results, cpr: results > 0 ? spend / results : 0,
        actions: row.actions, action_values: row.action_values,
      };
    }

    case 'list_campaigns': {
      const { since, until } = rangeFromDays(input?.days);
      const r = await metaFetch<{ data: any[] }>(`/${acct}/insights`, {
        fields: 'campaign_id,campaign_name,objective,status,spend,impressions,clicks,actions',
        time_range: JSON.stringify({ since, until }),
        level: 'campaign', limit: '100',
        use_unified_attribution_setting: 'true',
      });
      let rows = (r.data || []).map((c) => {
        const spend = Number(c.spend) || 0;
        const results = sumLeadResults(c.actions);
        return { campaign_id: c.campaign_id, name: c.campaign_name, objective: c.objective, status: c.status, spend, results, cpl: results > 0 ? spend / results : 0, clicks: Number(c.clicks || 0), impressions: Number(c.impressions || 0) };
      });
      const wantStatus = (input?.status || 'ALL').toUpperCase();
      if (wantStatus !== 'ALL') rows = rows.filter((c) => c.status === wantStatus);
      rows.sort((a, b) => b.spend - a.spend);
      return { period: { since, until }, count: rows.length, campaigns: rows };
    }

    case 'list_adsets': {
      const r = await metaFetch<{ data: any[] }>(`/${input.campaign_id}/adsets`, {
        fields: 'id,name,status,daily_budget,lifetime_budget,optimization_goal,billing_event,bid_strategy,bid_amount,targeting',
        limit: '50',
      });
      return { campaign_id: input.campaign_id, adsets: r.data || [] };
    }

    case 'list_ads': {
      const { since, until } = rangeFromDays(input?.days);
      const parent = input.campaign_id || input.adset_id;
      if (!parent) throw new Error('Forneça campaign_id ou adset_id');
      const r = await metaFetch<{ data: any[] }>(`/${parent}/insights`, {
        fields: 'ad_id,ad_name,spend,impressions,clicks,ctr,actions',
        time_range: JSON.stringify({ since, until }),
        level: 'ad', limit: '50',
        use_unified_attribution_setting: 'true',
      });
      return { ads: (r.data || []).map((a) => { const spend = Number(a.spend) || 0; const results = sumLeadResults(a.actions); return { ad_id: a.ad_id, name: a.ad_name, spend, impressions: Number(a.impressions || 0), clicks: Number(a.clicks || 0), ctr: Number(a.ctr || 0), results, cpl: results > 0 ? spend / results : 0 }; }).sort((a, b) => b.spend - a.spend) };
    }

    case 'get_demographics': {
      const { since, until } = rangeFromDays(input?.days);
      const breakdown = input?.breakdown || 'age,gender';
      const r = await metaFetch<{ data: any[] }>(`/${input.campaign_id}/insights`, {
        fields: 'spend,impressions,reach,clicks,actions',
        time_range: JSON.stringify({ since, until }),
        breakdowns: breakdown,
        use_unified_attribution_setting: 'true',
        limit: '100',
      });
      return { campaign_id: input.campaign_id, period: { since, until }, breakdown, rows: (r.data || []).map((row) => ({ ...row, spend: Number(row.spend || 0), reach: Number(row.reach || 0), clicks: Number(row.clicks || 0), results: sumLeadResults(row.actions) })) };
    }

    // ─── Insights avançados ─────────────────────────────────────────────────
    case 'get_industry_benchmark': {
      const { since, until } = rangeFromDays(input?.days);
      const r = await metaFetch<{ data: any[] }>(`/${acct}/insights`, {
        fields: 'spend,clicks,ctr,cpc,cpm,actions',
        time_range: JSON.stringify({ since, until }),
        action_breakdowns: 'action_type',
        use_unified_attribution_setting: 'true',
      });
      return { account: r.data?.[0] || {}, note: 'Benchmark de mercado: Meta não expõe API pública oficial. Use os dados da conta vs média histórica como proxy. Para benchmark setorial real, considere fontes externas.' };
    }
    case 'get_auction_ranking_benchmarks': {
      const { since, until } = rangeFromDays(input?.days);
      const r = await metaFetch<{ data: any[] }>(`/${input.campaign_id}/insights`, {
        fields: 'ad_id,ad_name,quality_ranking,engagement_rate_ranking,conversion_rate_ranking',
        time_range: JSON.stringify({ since, until }),
        level: 'ad', limit: '100',
      });
      return { campaign_id: input.campaign_id, ads: r.data || [] };
    }
    case 'get_anomaly_signals': {
      const { since, until } = rangeFromDays(input?.days);
      // Compara última semana com penúltima
      const halfDays = Math.floor((input?.days || 30) / 2);
      const recent = rangeFromDays(halfDays);
      const r1 = await metaFetch<{ data: any[] }>(`/${acct}/insights`, { fields: 'spend,clicks,actions', time_range: JSON.stringify(recent), use_unified_attribution_setting: 'true' });
      const r2 = await metaFetch<{ data: any[] }>(`/${acct}/insights`, { fields: 'spend,clicks,actions', time_range: JSON.stringify({ since, until: recent.since }), use_unified_attribution_setting: 'true' });
      const recentRow = r1.data?.[0] || {};
      const prevRow = r2.data?.[0] || {};
      const anomalies: any[] = [];
      const recentSpend = Number(recentRow.spend || 0);
      const prevSpend = Number(prevRow.spend || 0);
      if (prevSpend > 0 && Math.abs(recentSpend - prevSpend) / prevSpend > 0.3) {
        anomalies.push({ metric: 'spend', change_pct: ((recentSpend - prevSpend) / prevSpend) * 100, severity: 'high' });
      }
      const recentResults = sumLeadResults(recentRow.actions);
      const prevResults = sumLeadResults(prevRow.actions);
      if (prevResults > 0 && (recentResults - prevResults) / prevResults < -0.25) {
        anomalies.push({ metric: 'results', change_pct: ((recentResults - prevResults) / prevResults) * 100, severity: 'critical' });
      }
      return { anomalies, recent_period: recent, previous_period: { since, until: recent.since } };
    }
    case 'get_performance_trend': {
      const { since, until } = rangeFromDays(input?.days);
      const target = input?.level === 'account' || !input?.entity_id ? acct : input.entity_id;
      const r = await metaFetch<{ data: any[] }>(`/${target}/insights`, {
        fields: 'spend,impressions,clicks,ctr,cpc,cpm,frequency,actions',
        time_range: JSON.stringify({ since, until }),
        time_increment: '1',
        use_unified_attribution_setting: 'true',
        limit: '365',
      });
      const metric = input.metric || 'spend';
      const series = (r.data || []).map((d) => ({ date: d.date_start, value: metric === 'results' ? sumLeadResults(d.actions) : Number(d[metric] || 0) }));
      const half = Math.floor(series.length / 2);
      const avgFirst = series.slice(0, half).reduce((a, b) => a + b.value, 0) / Math.max(half, 1);
      const avgLast = series.slice(half).reduce((a, b) => a + b.value, 0) / Math.max(series.length - half, 1);
      const trend = avgFirst > 0 ? ((avgLast - avgFirst) / avgFirst) * 100 : 0;
      return { target, metric, series, trend_pct: trend, interpretation: trend > 10 ? 'Em alta' : trend < -10 ? 'Em queda' : 'Estável' };
    }
    case 'get_opportunity_score': {
      const r = await metaFetch<any>(`/${acct}`, { fields: 'recommendations' });
      return { recommendations: r?.recommendations || [], note: 'Recomendações oficiais do Meta. Vazias quando não há sugestões pendentes.' };
    }
    case 'get_account_errors': {
      const r = await metaFetch<any>(`/${acct}`, { fields: 'account_status,disable_reason,funding_source_details,balance,spend_cap,end_advertiser' });
      return { account_health: r };
    }

    // ─── Mutações ───────────────────────────────────────────────────────────
    case 'pause_campaign':
    case 'unpause_campaign':
    case 'pause_adset':
    case 'unpause_adset':
    case 'pause_ad':
    case 'unpause_ad': {
      const id = input.campaign_id || input.adset_id || input.ad_id;
      const newStatus = name.startsWith('pause') ? 'PAUSED' : 'ACTIVE';
      const { body, headers } = postUrlEncoded({ status: newStatus });
      await metaFetch(`/${id}`, {}, { method: 'POST', body, headers });
      return { ok: true, id, new_status: newStatus };
    }
    case 'update_adset_budget': {
      const cents = brlToCents(input.daily_budget_brl);
      const { body, headers } = postUrlEncoded({ daily_budget: String(cents) });
      await metaFetch(`/${input.adset_id}`, {}, { method: 'POST', body, headers });
      return { ok: true, adset_id: input.adset_id, new_daily_budget_brl: input.daily_budget_brl };
    }
    case 'update_campaign_budget': {
      const cents = brlToCents(input.daily_budget_brl);
      const { body, headers } = postUrlEncoded({ daily_budget: String(cents) });
      await metaFetch(`/${input.campaign_id}`, {}, { method: 'POST', body, headers });
      return { ok: true, campaign_id: input.campaign_id, new_daily_budget_brl: input.daily_budget_brl };
    }
    case 'update_entity': {
      const { body, headers } = postUrlEncoded(input.updates || {});
      const r = await metaFetch<any>(`/${input.entity_id}`, {}, { method: 'POST', body, headers });
      return { ok: true, entity_id: input.entity_id, response: r };
    }

    // ─── Criação ────────────────────────────────────────────────────────────
    case 'create_campaign': {
      const updates: any = { name: input.name, objective: input.objective, status: input.status || 'PAUSED', special_ad_categories: input.special_ad_categories || [] };
      if (input.daily_budget_brl) updates.daily_budget = String(brlToCents(input.daily_budget_brl));
      const { body, headers } = postUrlEncoded(updates);
      const r = await metaFetch<any>(`/${acct}/campaigns`, {}, { method: 'POST', body, headers });
      return { ok: true, campaign_id: r.id, ...r };
    }
    case 'create_adset': {
      const updates: any = {
        campaign_id: input.campaign_id, name: input.name,
        optimization_goal: input.optimization_goal, billing_event: input.billing_event,
        daily_budget: String(brlToCents(input.daily_budget_brl)),
        targeting: input.targeting, status: input.status || 'PAUSED',
      };
      if (input.start_time) updates.start_time = input.start_time;
      if (input.end_time) updates.end_time = input.end_time;
      const { body, headers } = postUrlEncoded(updates);
      const r = await metaFetch<any>(`/${acct}/adsets`, {}, { method: 'POST', body, headers });
      return { ok: true, adset_id: r.id, ...r };
    }
    case 'create_ad': {
      const updates: any = { name: input.name, adset_id: input.adset_id, creative: JSON.stringify({ creative_id: input.creative_id }), status: input.status || 'PAUSED' };
      const { body, headers } = postUrlEncoded(updates);
      const r = await metaFetch<any>(`/${acct}/ads`, {}, { method: 'POST', body, headers });
      return { ok: true, ad_id: r.id, ...r };
    }
    case 'create_creative': {
      const updates: any = { name: input.name };
      if (input.object_story_spec) updates.object_story_spec = input.object_story_spec;
      if (input.title) updates.title = input.title;
      if (input.body) updates.body = input.body;
      if (input.image_url) updates.image_url = input.image_url;
      const { body, headers } = postUrlEncoded(updates);
      const r = await metaFetch<any>(`/${acct}/adcreatives`, {}, { method: 'POST', body, headers });
      return { ok: true, creative_id: r.id, ...r };
    }

    // ─── Catálogo ───────────────────────────────────────────────────────────
    case 'list_catalogs': {
      const r = await metaFetch<any>(`/${acct}`, { fields: 'business{owned_product_catalogs{id,name,vertical,product_count}}' });
      return r;
    }
    case 'get_catalog_details': {
      const r = await metaFetch<any>(`/${input.catalog_id}`, { fields: 'id,name,vertical,product_count,da_display_settings,fallback_image_url' });
      return r;
    }
    case 'get_catalog_diagnostics': {
      const r = await metaFetch<any>(`/${input.catalog_id}/diagnostics`, { fields: '*' });
      return r;
    }
    case 'list_catalog_products': {
      const r = await metaFetch<any>(`/${input.catalog_id}/products`, { fields: 'id,retailer_id,name,price,availability,condition,brand,description,image_url', limit: String(input.limit || 25) });
      return r;
    }
    case 'search_catalog_products': {
      const r = await metaFetch<any>(`/${input.catalog_id}/products`, { fields: 'id,name,retailer_id,price,availability', filter: JSON.stringify({ or: [{ name: { i_contains: input.query } }, { retailer_id: { i_contains: input.query } }, { brand: { i_contains: input.query } }] }) });
      return r;
    }
    case 'get_product_details': {
      const r = await metaFetch<any>(`/${input.product_id}`, { fields: 'id,retailer_id,name,description,price,availability,condition,brand,image_url,additional_image_urls,url,product_type' });
      return r;
    }
    case 'list_product_sets': {
      const r = await metaFetch<any>(`/${input.catalog_id}/product_sets`, { fields: 'id,name,product_count,filter' });
      return r;
    }
    case 'list_product_set_products': {
      const r = await metaFetch<any>(`/${input.product_set_id}/products`, { fields: 'id,name,retailer_id,availability,price', limit: '50' });
      return r;
    }
    case 'create_product_set': {
      const { body, headers } = postUrlEncoded({ name: input.name, filter: input.filter });
      const r = await metaFetch<any>(`/${input.catalog_id}/product_sets`, {}, { method: 'POST', body, headers });
      return { ok: true, product_set_id: r.id, ...r };
    }
    case 'get_product_feed_details': {
      const r = await metaFetch<any>(`/${input.catalog_id}/product_feeds`, { fields: 'id,name,schedule,update_schedule,quoted_fields_mode,product_count,latest_upload' });
      return r;
    }

    // ─── Audiences ──────────────────────────────────────────────────────────
    case 'list_custom_audiences': {
      const r = await metaFetch<any>(`/${acct}/customaudiences`, { fields: 'id,name,description,approximate_count,subtype,operation_status,delivery_status', limit: '100' });
      return r;
    }
    case 'get_custom_audience_details': {
      const r = await metaFetch<any>(`/${input.audience_id}`, { fields: 'id,name,description,approximate_count,subtype,rule,retention_days,customer_file_source' });
      return r;
    }
    case 'get_custom_audience_adsets': {
      const r = await metaFetch<any>(`/${input.audience_id}/adsets`, { fields: 'id,name,campaign{id,name}' });
      return r;
    }
    case 'create_custom_audience': {
      const updates: any = { name: input.name, subtype: input.subtype };
      if (input.description) updates.description = input.description;
      if (input.customer_file_source) updates.customer_file_source = input.customer_file_source;
      const { body, headers } = postUrlEncoded(updates);
      const r = await metaFetch<any>(`/${acct}/customaudiences`, {}, { method: 'POST', body, headers });
      return { ok: true, audience_id: r.id, ...r };
    }
    case 'update_custom_audience': {
      const { body, headers } = postUrlEncoded(input.updates || {});
      await metaFetch(`/${input.audience_id}`, {}, { method: 'POST', body, headers });
      return { ok: true, audience_id: input.audience_id };
    }
    case 'delete_custom_audience': {
      await metaFetch(`/${input.audience_id}`, {}, { method: 'DELETE' });
      return { ok: true, audience_id: input.audience_id, deleted: true };
    }

    // ─── Pixel / Datasets ───────────────────────────────────────────────────
    case 'list_datasets': {
      const r = await metaFetch<any>(`/${acct}`, { fields: 'business{owned_pixels{id,name,creation_time,last_fired_time}}' });
      return r;
    }
    case 'get_dataset_details': {
      const r = await metaFetch<any>(`/${input.dataset_id}`, { fields: 'id,name,creation_time,last_fired_time,code,owner_business' });
      return r;
    }
    case 'get_dataset_quality': {
      const r = await metaFetch<any>(`/${input.dataset_id}/event_quality`, {});
      return r;
    }
    case 'get_dataset_stats': {
      const r = await metaFetch<any>(`/${input.dataset_id}/stats`, { aggregation: 'event' });
      return r;
    }
    case 'list_custom_conversions': {
      const r = await metaFetch<any>(`/${acct}/customconversions`, { fields: 'id,name,description,event_source_id,custom_event_type,rule,creation_time,count', limit: '100' });
      return r;
    }

    // ─── Páginas ────────────────────────────────────────────────────────────
    case 'list_user_pages': {
      const r = await metaFetch<any>('/me/accounts', { fields: 'id,name,category,access_token' });
      return { pages: (r?.data || []).map((p: any) => ({ id: p.id, name: p.name, category: p.category })) };
    }
    case 'list_account_pages': {
      const r = await metaFetch<any>(`/${acct}/promote_pages`, { fields: 'id,name,category' });
      return r;
    }

    // ─── Creatives / mídias ────────────────────────────────────────────────
    case 'list_creatives': {
      const r = await metaFetch<any>(`/${acct}/adcreatives`, { fields: 'id,name,title,body,thumbnail_url,image_url,object_story_spec', limit: String(input.limit || 25) });
      return r;
    }
    case 'get_creative_details': {
      const r = await metaFetch<any>(`/${input.creative_id}`, { fields: 'id,name,title,body,thumbnail_url,image_url,video_id,object_story_spec,call_to_action_type,asset_feed_spec' });
      return r;
    }
    case 'list_ad_images': {
      const r = await metaFetch<any>(`/${acct}/adimages`, { fields: 'hash,name,url,width,height,created_time', limit: String(input.limit || 25) });
      return r;
    }
    case 'list_ad_videos': {
      const r = await metaFetch<any>(`/${acct}/advideos`, { fields: 'id,title,description,thumbnails,created_time,length', limit: String(input.limit || 25) });
      return r;
    }
    case 'get_ad_preview': {
      const r = await metaFetch<any>(`/${input.ad_id}/previews`, { ad_format: input.format });
      return r;
    }

    // ─── Ads Library ────────────────────────────────────────────────────────
    case 'search_ads_library': {
      const params: any = {
        search_terms: input.search_terms,
        ad_active_status: input.ad_active_status || 'ACTIVE',
        ad_reached_countries: JSON.stringify(input.ad_reached_countries || ['BR']),
        fields: 'page_id,page_name,ad_creative_bodies,ad_creative_link_captions,ad_creative_link_descriptions,ad_creative_link_titles,ad_delivery_start_time,ad_snapshot_url',
        limit: String(input.limit || 10),
      };
      const r = await metaFetch<any>('/ads_archive', params);
      return r;
    }

    default:
      throw new Error(`Tool desconhecida: ${name}`);
  }
}
