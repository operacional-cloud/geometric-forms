/**
 * Camada de leitura unificada de leads (formulário + prospecção).
 * Mantém as duas tabelas separadas (cada uma com seu schema/RLS),
 * mas oferece uma visão única pra UI do cliente.
 */
import type { AuthContext } from './auth';
import { supabaseAdmin } from './supabase-admin';
import { listForms } from './forms';
import { AppError } from './errors';
import { getActiveTenantId } from './active-tenant';
import { getLeadName, getLeadPhone, getLeadEmail } from '@/lib/contact';

export type LeadOrigin = 'form' | 'manual' | 'prospecting';

export type UnifiedLead = {
  id: string;
  origin: LeadOrigin;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  created_at: string;
  seller_id: string | null;

  // Form-only
  form_id?: string | null;
  form_title?: string | null;
  lead_score?: number | null;
  is_qualified?: boolean | null;
  is_complete?: boolean | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  ad_platform?: string | null;
  geo_country?: string | null;
  geo_region?: string | null;
  geo_city?: string | null;
  answers?: Record<string, any> | null;

  // Prospecting-only
  whatsapp_number?: string | null;
  keyword_used?: string | null;
  source_url?: string | null;
  metadata?: Record<string, any> | null;
};

/**
 * Lista leads de formulário + prospecção do tenant do user.
 * Retorna ordenado por created_at desc.
 */
export async function listLeadsUnified(
  ctx: AuthContext,
  opts: { limit?: number } = {},
): Promise<{ leads: UnifiedLead[]; formCount: number; manualCount: number; prospectingCount: number }> {
  const isAdmin = ctx.profile.role === 'admin';
  // Tenant ativo: member usa o próprio; admin usa o cookie "viewing_tenant_id".
  const tenantId = getActiveTenantId(ctx);

  if (!tenantId && !isAdmin) {
    throw new AppError('Usuário sem vínculo com tenant.', { status: 403 });
  }

  const limit = Math.min(opts.limit || 500, 1000);

  // Admin sem cliente selecionado vê leads de TODOS os clientes (escopo global).
  // Admin com viewing_tenant_id setado, ou member, vê só do tenant ativo.
  let leadsQ = supabaseAdmin
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  let prospQ = supabaseAdmin
    .from('prospecting_leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (tenantId) {
    leadsQ = leadsQ.eq('tenant_id', tenantId);
    prospQ = prospQ.eq('tenant_id', tenantId);
  }

  const [formsResult, formLeadsRes, prospectingRes] = await Promise.all([
    listForms(ctx).catch(() => ({ forms: [] as any[] })),
    leadsQ,
    prospQ,
  ]);

  if (formLeadsRes.error) throw new AppError(formLeadsRes.error.message, { status: 500 });
  if (prospectingRes.error) throw new AppError(prospectingRes.error.message, { status: 500 });

  const forms = formsResult.forms as Array<{ id: string; title: string; fields: any[] }>;
  const formMap = new Map(forms.map((f) => [f.id, f]));

  const formLeads: UnifiedLead[] = (formLeadsRes.data || []).map((l: any) => {
    const form = l.form_id ? formMap.get(l.form_id) : null;
    const fields = form?.fields || [];
    const isManual = !!l.is_manual;
    // Lead manual usa manual_data; lead de form usa answers
    const source = (isManual && l.manual_data) ? l.manual_data : (l.answers || {});
    return {
      id: l.id,
      origin: isManual ? 'manual' : 'form',
      name: getLeadName(source, fields) || (source?.name ? String(source.name) : null),
      phone: getLeadPhone(source, fields) || (source?.phone ? String(source.phone) : null),
      email: getLeadEmail(source, fields) || (source?.email ? String(source.email) : null),
      status: l.status || 'new',
      created_at: l.created_at,
      seller_id: l.seller_id || null,
      form_id: l.form_id,
      form_title: form?.title || null,
      lead_score: l.lead_score ?? 0,
      is_qualified: !!l.is_qualified,
      is_complete: l.is_complete !== false,
      utm_source: l.utm_source || null,
      utm_medium: l.utm_medium || null,
      utm_campaign: l.utm_campaign || null,
      utm_content: l.utm_content || null,
      utm_term: l.utm_term || null,
      ad_platform: l.ad_platform || null,
      geo_country: l.geo_country || null,
      geo_region: l.geo_region || null,
      geo_city: l.geo_city || null,
      answers: l.answers || null,
    };
  });

  const prospectingLeads: UnifiedLead[] = (prospectingRes.data || []).map((l: any) => ({
    id: l.id,
    origin: 'prospecting',
    name: l.name,
    phone: l.whatsapp_number,
    email: null,
    status: l.status || 'pending',
    created_at: l.created_at,
    seller_id: l.seller_id || null,
    whatsapp_number: l.whatsapp_number,
    keyword_used: l.keyword_used,
    source_url: l.source_url,
    metadata: l.metadata,
  }));

  // Merge ordenado por created_at desc
  const merged = [...formLeads, ...prospectingLeads].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );

  const formCount = formLeads.filter((l) => l.origin === 'form').length;
  const manualCount = formLeads.filter((l) => l.origin === 'manual').length;

  return {
    leads: merged.slice(0, limit),
    formCount,
    manualCount,
    prospectingCount: prospectingLeads.length,
  };
}
