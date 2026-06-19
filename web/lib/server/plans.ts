/**
 * Camada de PLANOS & LIMITES (Fase 1 do SaaS — sem billing).
 *
 * Fonte da verdade: tabela public.plans (limites configuráveis no banco, sem
 * deploy). Vínculo via tenants.plan_id. NULL num limite = ILIMITADO.
 *
 * Filosofia de segurança: as checagens de enforcement FALHAM ABERTAS em erro de
 * infra (tabela ausente, plano não encontrado) — assim um deploy de código sem a
 * migration aplicada NÃO derruba a criação de formulários/leads. Só bloqueia
 * quando há um limite real estourado.
 */

import { supabaseAdmin } from './supabase-admin';
import { AppError } from './errors';

export type Plan = {
  id: string;
  slug: string;
  name: string;
  price_cents: number;
  currency: string;
  max_formularios: number | null; // null = ilimitado
  max_leads_mes: number | null;   // null = ilimitado
  mcp_habilitado: boolean;
  features: Record<string, any>;
  is_active: boolean;
};

export type TenantUsage = {
  forms: number;
  leads_month: number;
};

export type TenantPlanStatus = {
  tenant_id: string;
  account_status: string | null; // tenants.status: active | trial | suspended | inactive
  plan: Plan | null;
  usage: TenantUsage;
  limits: { max_formularios: number | null; max_leads_mes: number | null; mcp_habilitado: boolean };
  remaining: { forms: number | null; leads: number | null }; // null = ilimitado
  over: { forms: boolean; leads: boolean };
};

/** Primeiro instante do mês corrente em UTC (ISO), pra contar leads do mês. */
function startOfCurrentMonthUTC(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

/** Busca o plano efetivo do tenant (plan_id; fallback no slug legado tenants.plan). */
export async function getPlanForTenant(tenantId: string): Promise<Plan | null> {
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('plan_id, plan')
    .eq('id', tenantId)
    .maybeSingle();
  if (!tenant) return null;

  if ((tenant as any).plan_id) {
    const { data } = await supabaseAdmin.from('plans').select('*').eq('id', (tenant as any).plan_id).maybeSingle();
    if (data) return data as Plan;
  }
  // Fallback: casa pelo slug legado (tenants.plan) se ainda não houver plan_id.
  if ((tenant as any).plan) {
    const { data } = await supabaseAdmin.from('plans').select('*').eq('slug', (tenant as any).plan).maybeSingle();
    if (data) return data as Plan;
  }
  return null;
}

async function countForms(tenantId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('forms')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  // Propaga erro: o caller (assert) trata como fail-open MAS logado — em vez de
  // silenciosamente virar 0 e liberar como se o tenant tivesse zero formulários.
  if (error) throw new Error(`countForms: ${error.message}`);
  return count || 0;
}

async function countLeadsThisMonth(tenantId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', startOfCurrentMonthUTC());
  if (error) throw new Error(`countLeadsThisMonth: ${error.message}`);
  return count || 0;
}

/** Uso atual vs. limite do plano, pronto pra exibir em UI/admin. */
export async function getTenantPlanStatus(tenantId: string): Promise<TenantPlanStatus> {
  const [plan, forms, leads_month, statusRow] = await Promise.all([
    getPlanForTenant(tenantId),
    countForms(tenantId),
    countLeadsThisMonth(tenantId),
    supabaseAdmin.from('tenants').select('status').eq('id', tenantId).maybeSingle(),
  ]);

  const maxF = plan?.max_formularios ?? null;
  const maxL = plan?.max_leads_mes ?? null;

  return {
    tenant_id: tenantId,
    account_status: (statusRow.data as any)?.status ?? null,
    plan,
    usage: { forms, leads_month },
    limits: { max_formularios: maxF, max_leads_mes: maxL, mcp_habilitado: !!plan?.mcp_habilitado },
    remaining: {
      forms: maxF === null ? null : Math.max(0, maxF - forms),
      leads: maxL === null ? null : Math.max(0, maxL - leads_month),
    },
    over: {
      forms: maxF !== null && forms >= maxF,
      leads: maxL !== null && leads_month >= maxL,
    },
  };
}

/** O MCP está liberado para esse tenant? (uso na Fase 2+). */
export async function isMcpEnabled(tenantId: string): Promise<boolean> {
  try {
    const plan = await getPlanForTenant(tenantId);
    return !!plan?.mcp_habilitado;
  } catch {
    return false;
  }
}

/**
 * Bloqueia criação de formulário se o tenant estourou max_formularios.
 * Fail-open em erro de infra. Lança AppError(403, code='form_limit_reached').
 */
export async function assertWithinFormLimit(tenantId: string): Promise<void> {
  try {
    const plan = await getPlanForTenant(tenantId);
    const max = plan?.max_formularios ?? null;
    if (max === null) return; // ilimitado (ex.: plano interno)
    const forms = await countForms(tenantId);
    if (forms >= max) {
      throw new AppError(
        `Limite de formulários do plano${plan?.name ? ` ${plan.name}` : ''} atingido (${forms}/${max}). Faça upgrade para criar mais.`,
        { status: 403, code: 'form_limit_reached' },
      );
    }
  } catch (e: any) {
    if (e instanceof AppError) throw e; // limite real estourado: propaga
    console.warn('[plans] assertWithinFormLimit fail-open:', e?.message);
  }
}

/**
 * Bloqueia registro de lead se o tenant estourou max_leads_mes (mês corrente).
 * Fail-open em erro de infra. Lança AppError(403, code='lead_limit_reached').
 */
export async function assertWithinLeadLimit(tenantId: string): Promise<void> {
  try {
    const plan = await getPlanForTenant(tenantId);
    const max = plan?.max_leads_mes ?? null;
    if (max === null) return; // ilimitado
    const leads = await countLeadsThisMonth(tenantId);
    if (leads >= max) {
      throw new AppError(
        `Limite de leads do mês atingido (${leads}/${max})${plan?.name ? ` no plano ${plan.name}` : ''}.`,
        { status: 403, code: 'lead_limit_reached' },
      );
    }
  } catch (e: any) {
    if (e instanceof AppError) throw e;
    console.warn('[plans] assertWithinLeadLimit fail-open:', e?.message);
  }
}
