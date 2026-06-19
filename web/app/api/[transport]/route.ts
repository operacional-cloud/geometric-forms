/**
 * Servidor MCP do Geometric Forms — USO INTERNO/ADMIN.
 *
 * Endpoint: /api/mcp  (o segmento [transport] resolve "mcp" via basePath="/api").
 *
 * ⚠️ SENSÍVEL: usa SERVICE ROLE (bypassa RLS) e enxerga os leads de TODOS os
 * clientes. Por isso é protegido por bearer token (env MCP_API_TOKEN) via
 * withMcpAuth. Service role roda só aqui no server — nunca no client.
 *
 * Tools: list_leads, get_lead, lead_stats, list_forms.
 * Não toca em planos/billing/enforcement (Fase 1/2) — só leitura de leads/forms.
 */
import crypto from 'node:crypto';
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { getLeadName, getLeadPhone, getLeadEmail } from '@/lib/contact';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type AnyRec = Record<string, any>;

/** Resposta padrão das tools: JSON dentro de content[0].text. */
function jsonText(obj: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(obj, null, 2) }] };
}

/** Deriva contato (nome/telefone/email) de um lead: manual_data ou answers+fields. */
function deriveContact(lead: AnyRec, formFields: any[] = []) {
  if (lead.is_manual && lead.manual_data) {
    const m = lead.manual_data || {};
    return { nome: m.name ?? null, telefone: m.phone ?? null, email: m.email ?? null };
  }
  const answers = lead.answers || {};
  return {
    nome: getLeadName(answers, formFields),
    telefone: getLeadPhone(answers, formFields),
    email: getLeadEmail(answers, formFields),
  };
}

// =============================================================================
// MCP server + tools
// =============================================================================
const mcpHandler = createMcpHandler(
  (server) => {
    // ---- list_leads ---------------------------------------------------------
    server.tool(
      'list_leads',
      'Lista leads de TODOS os clientes (admin). Filtros opcionais por cliente (tenant_id), formulário (form_id), qualificação e data. Mais recentes primeiro. Limite padrão 50 (teto 200).',
      {
        tenant_id: z.string().uuid().optional().describe('Filtra por cliente (UUID do tenant).'),
        form_id: z.string().uuid().optional().describe('Filtra por formulário (UUID).'),
        qualified: z.boolean().optional().describe('true = só qualificados; false = só não-qualificados; omitido = todos.'),
        since: z.string().optional().describe('Data ISO (YYYY-MM-DD) — só leads criados a partir dela.'),
        limit: z.number().int().min(1).max(200).optional().describe('Máximo de leads a retornar (padrão 50, teto 200).'),
      },
      async (args) => {
        const limit = args.limit ?? 50;
        let q = supabaseAdmin
          .from('leads')
          .select('id, tenant_id, form_id, answers, manual_data, is_manual, lead_score, is_qualified, status, deal_value, notes, created_at')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (args.tenant_id) q = q.eq('tenant_id', args.tenant_id);
        if (args.form_id) q = q.eq('form_id', args.form_id);
        if (typeof args.qualified === 'boolean') q = q.eq('is_qualified', args.qualified);
        if (args.since) q = q.gte('created_at', args.since);

        const { data: leads, error } = await q;
        if (error) return jsonText({ error: error.message });
        const rows = leads || [];

        // Enriquecimento: títulos de formulário (+fields p/ derivar contato) e nomes de cliente.
        const formIds = [...new Set(rows.map((r) => r.form_id).filter(Boolean))] as string[];
        const tenantIds = [...new Set(rows.map((r) => r.tenant_id).filter(Boolean))] as string[];
        const [formsRes, tenantsRes] = await Promise.all([
          formIds.length ? supabaseAdmin.from('forms').select('id, title, fields').in('id', formIds) : Promise.resolve({ data: [] as any[] }),
          tenantIds.length ? supabaseAdmin.from('tenants').select('id, name, slug').in('id', tenantIds) : Promise.resolve({ data: [] as any[] }),
        ]);
        const formMap = new Map((formsRes.data || []).map((f: any) => [f.id, f]));
        const tenantMap = new Map((tenantsRes.data || []).map((t: any) => [t.id, t]));

        const out = rows.map((l) => {
          const form = l.form_id ? formMap.get(l.form_id) : null;
          const tenant = tenantMap.get(l.tenant_id);
          return {
            id: l.id,
            cliente: tenant ? { id: tenant.id, nome: tenant.name, slug: tenant.slug } : { id: l.tenant_id },
            formulario: form ? { id: l.form_id, titulo: form.title } : (l.form_id ? { id: l.form_id } : { tipo: 'manual' }),
            contato: deriveContact(l, form?.fields || []),
            lead_score: l.lead_score,
            qualificado: l.is_qualified,
            status: l.status,
            deal_value: l.deal_value,
            notes: l.notes,
            criado_em: l.created_at,
          };
        });
        return jsonText({ total_retornado: out.length, limite: limit, leads: out });
      },
    );

    // ---- get_lead -----------------------------------------------------------
    server.tool(
      'get_lead',
      'Retorna os dados completos de um lead pelo ID (UUID): contato, respostas brutas, UTM, status, timestamps do funil, cliente e formulário.',
      {
        id: z.string().uuid().describe('UUID do lead.'),
      },
      async ({ id }) => {
        const { data: lead, error } = await supabaseAdmin.from('leads').select('*').eq('id', id).maybeSingle();
        if (error) return jsonText({ error: error.message });
        if (!lead) return jsonText({ error: 'Lead não encontrado', id });

        const [formRes, tenantRes] = await Promise.all([
          lead.form_id
            ? supabaseAdmin.from('forms').select('id, title, slug, fields, qualification_threshold').eq('id', lead.form_id).maybeSingle()
            : Promise.resolve({ data: null as any }),
          supabaseAdmin.from('tenants').select('id, name, slug').eq('id', lead.tenant_id).maybeSingle(),
        ]);
        const form = formRes.data as AnyRec | null;
        const tenant = tenantRes.data as AnyRec | null;

        return jsonText({
          id: lead.id,
          cliente: tenant ? { id: tenant.id, nome: tenant.name, slug: tenant.slug } : { id: lead.tenant_id },
          formulario: form ? { id: form.id, titulo: form.title, slug: form.slug, qualification_threshold: form.qualification_threshold } : { tipo: 'manual' },
          contato: deriveContact(lead, form?.fields || []),
          lead_score: lead.lead_score,
          qualificado: lead.is_qualified,
          status: lead.status,
          deal_value: lead.deal_value,
          notes: lead.notes,
          tags: lead.tags,
          is_manual: lead.is_manual,
          utm: {
            source: lead.utm_source, medium: lead.utm_medium, campaign: lead.utm_campaign,
            content: lead.utm_content, term: lead.utm_term,
          },
          timestamps: {
            criado_em: lead.created_at, qualified_at: lead.qualified_at,
            meeting_scheduled_at: lead.meeting_scheduled_at, meeting_held_at: lead.meeting_held_at,
            won_at: lead.won_at, lost_at: lead.lost_at,
          },
          respostas: lead.answers,
        });
      },
    );

    // ---- lead_stats ---------------------------------------------------------
    server.tool(
      'lead_stats',
      'Estatísticas de leads: total, qualificados e taxa de qualificação (%). Filtros opcionais por cliente (tenant_id) e data (since).',
      {
        tenant_id: z.string().uuid().optional().describe('Filtra por cliente (UUID do tenant).'),
        since: z.string().optional().describe('Data ISO (YYYY-MM-DD) — conta só a partir dela.'),
      },
      async (args) => {
        const countQuery = (qualifiedOnly: boolean) => {
          let q = supabaseAdmin.from('leads').select('id', { count: 'exact', head: true });
          if (args.tenant_id) q = q.eq('tenant_id', args.tenant_id);
          if (args.since) q = q.gte('created_at', args.since);
          if (qualifiedOnly) q = q.eq('is_qualified', true);
          return q;
        };
        const [totalRes, qualRes] = await Promise.all([countQuery(false), countQuery(true)]);
        if (totalRes.error) return jsonText({ error: totalRes.error.message });
        const total = totalRes.count || 0;
        const qualificados = qualRes.count || 0;
        const taxa = total > 0 ? Math.round((qualificados / total) * 10000) / 100 : 0;
        return jsonText({
          filtros: { tenant_id: args.tenant_id ?? null, since: args.since ?? null },
          total,
          qualificados,
          taxa_qualificacao_pct: taxa,
        });
      },
    );

    // ---- list_forms ---------------------------------------------------------
    server.tool(
      'list_forms',
      'Lista os formulários cadastrados de todos os clientes, cada um anotado com o cliente (tenant) dono. Filtros opcionais por cliente e por ativo.',
      {
        tenant_id: z.string().uuid().optional().describe('Filtra por cliente (UUID do tenant).'),
        only_active: z.boolean().optional().describe('true = só formulários ativos.'),
      },
      async (args) => {
        let q = supabaseAdmin
          .from('forms')
          .select('id, tenant_id, title, slug, is_active, qualification_threshold, created_at')
          .order('created_at', { ascending: false });
        if (args.tenant_id) q = q.eq('tenant_id', args.tenant_id);
        if (args.only_active) q = q.eq('is_active', true);

        const { data: forms, error } = await q;
        if (error) return jsonText({ error: error.message });
        const rows = forms || [];

        const tenantIds = [...new Set(rows.map((r) => r.tenant_id))] as string[];
        const tenantsRes = tenantIds.length
          ? await supabaseAdmin.from('tenants').select('id, name, slug, status').in('id', tenantIds)
          : { data: [] as any[] };
        const tmap = new Map((tenantsRes.data || []).map((t: any) => [t.id, t]));

        const out = rows.map((f) => {
          const t = tmap.get(f.tenant_id);
          return {
            id: f.id,
            titulo: f.title,
            slug: f.slug,
            ativo: f.is_active,
            qualification_threshold: f.qualification_threshold,
            criado_em: f.created_at,
            cliente: t ? { id: f.tenant_id, nome: t.name, slug: t.slug, status: t.status } : { id: f.tenant_id },
          };
        });
        return jsonText({ total: out.length, formularios: out });
      },
    );
  },
  {
    serverInfo: { name: 'geometric-forms', version: '1.0.0' },
  },
  {
    basePath: '/api', // rota em app/api/[transport] → endpoint final /api/mcp
    maxDuration: 60,
    verboseLogs: false,
  },
);

// =============================================================================
// Auth: bearer token estático (MCP_API_TOKEN). Verificação isolada.
// =============================================================================

/** Compara tokens em tempo constante (evita timing attack). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Valida o bearer token contra MCP_API_TOKEN.
 * Fail-CLOSED: sem token configurado no servidor, nega tudo.
 * Retorna AuthInfo (autorizado) ou undefined (401).
 */
function verifyMcpToken(_req: Request, bearerToken?: string): AuthInfo | undefined {
  const expected = process.env.MCP_API_TOKEN;
  if (!expected) return undefined; // endpoint sensível: sem token no server, bloqueia
  if (!bearerToken || !safeEqual(bearerToken, expected)) return undefined;
  return { token: bearerToken, clientId: 'geometric-forms-admin', scopes: ['admin'] };
}

const authedHandler = withMcpAuth(mcpHandler, verifyMcpToken, { required: true });

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE };
