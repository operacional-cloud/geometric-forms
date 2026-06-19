import { handleIntegration, preflight } from '@/lib/server/integration-auth';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { AppError, ValidationError } from '@/lib/server/errors';
import { assertWithinLeadLimit } from '@/lib/server/plans';

export const dynamic = 'force-dynamic';

export const OPTIONS = (req: Request) => preflight(req);

/**
 * GET /api/integrations/leads?limit=50&offset=0&qualified=true&since=2026-01-01&q=joao
 * Lista leads do tenant (ordenados por created_at desc, paginados).
 */
export const GET = handleIntegration(async (req, ctx) => {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
  const onlyQualified = url.searchParams.get('qualified') === 'true';
  const since = url.searchParams.get('since');
  const q = url.searchParams.get('q');
  const stageId = url.searchParams.get('stage_id');

  let query = supabaseAdmin
    .from('leads')
    .select('id, tenant_id, form_id, answers, lead_score, is_qualified, is_complete, status, kanban_column_id, deal_value, notes, utm_source, utm_medium, utm_campaign, created_at, updated_at', { count: 'exact' })
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (onlyQualified) query = query.eq('is_qualified', true);
  if (since) query = query.gte('created_at', since);
  if (stageId) query = query.eq('kanban_column_id', stageId);

  const { data, error, count } = await query;
  if (error) throw new AppError(error.message, { status: 500 });

  let leads = data || [];
  if (q) {
    const needle = q.toLowerCase();
    leads = leads.filter((l: any) => {
      const a = l.answers || {};
      return [a.nome, a.email, a.telefone].some((v) => typeof v === 'string' && v.toLowerCase().includes(needle));
    });
  }

  return Response.json({
    success: true,
    data: {
      leads,
      pagination: { total: count || 0, limit, offset, has_more: (offset + limit) < (count || 0) },
    },
  });
});

/**
 * POST /api/integrations/leads
 * Body: { name, phone, email?, notes?, deal_value?, source?, utm?, answers? }
 * Cria lead manual no tenant (entra na coluna kanban padrão "Lead novo").
 */
export const POST = handleIntegration(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  if (!name) throw new ValidationError('Campo `name` obrigatório.');
  if (!phone) throw new ValidationError('Campo `phone` obrigatório.');

  // Enforcement de plano: lead via API também conta contra max_leads_mes.
  await assertWithinLeadLimit(ctx.tenantId);

  // Procura coluna default
  const { data: defaultCol } = await supabaseAdmin
    .from('kanban_columns')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('kind', 'default')
    .order('position', { ascending: true })
    .maybeSingle();

  const answers: Record<string, any> = {
    nome: name,
    telefone: phone,
    ...(body.email ? { email: String(body.email) } : {}),
    ...(body.answers && typeof body.answers === 'object' ? body.answers : {}),
  };

  const insertRow: any = {
    tenant_id: ctx.tenantId,
    form_id: null,
    answers,
    is_manual: true,
    is_complete: true,
    is_qualified: !!body.is_qualified,
    status: body.status || 'novo',
    kanban_column_id: defaultCol?.id || null,
    notes: body.notes || null,
    deal_value: typeof body.deal_value === 'number' ? body.deal_value : null,
    utm_source: body.utm?.source || body.source || 'integration',
    utm_medium: body.utm?.medium || null,
    utm_campaign: body.utm?.campaign || null,
    utm_content: body.utm?.content || null,
    utm_term: body.utm?.term || null,
    manual_data: { created_via: 'integration_api', source: body.source || null },
  };

  const { data: lead, error } = await supabaseAdmin
    .from('leads')
    .insert(insertRow)
    .select('*')
    .single();
  if (error) throw new AppError(error.message, { status: 500 });

  return Response.json({ success: true, data: { lead } }, { status: 201 });
});
