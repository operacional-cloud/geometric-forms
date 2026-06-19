import { handleIntegration, preflight } from '@/lib/server/integration-auth';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { AppError } from '@/lib/server/errors';

export const dynamic = 'force-dynamic';

export const OPTIONS = (req: Request) => preflight(req);

/**
 * GET /api/integrations/kanban?days=30
 * Retorna board completo: colunas + leads agrupados por coluna.
 */
export const GET = handleIntegration(async (req, ctx) => {
  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 60, 1), 365);
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();

  const [colsRes, leadsRes] = await Promise.all([
    supabaseAdmin
      .from('kanban_columns')
      .select('id, name, color, position, kind')
      .eq('tenant_id', ctx.tenantId)
      .order('position', { ascending: true }),
    supabaseAdmin
      .from('leads')
      .select('id, answers, lead_score, is_qualified, kanban_column_id, deal_value, notes, status, created_at, updated_at')
      .eq('tenant_id', ctx.tenantId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(2000),
  ]);

  if (colsRes.error) throw new AppError(colsRes.error.message, { status: 500 });
  if (leadsRes.error) throw new AppError(leadsRes.error.message, { status: 500 });

  const columns = (colsRes.data || []).map((c: any) => ({ ...c, leads: [] as any[] }));
  const byCol = new Map(columns.map((c) => [c.id, c]));
  const orphans: any[] = [];

  for (const lead of leadsRes.data || []) {
    const slim = {
      id: lead.id,
      name: (lead.answers as any)?.nome || '(sem nome)',
      phone: (lead.answers as any)?.telefone || null,
      email: (lead.answers as any)?.email || null,
      lead_score: lead.lead_score,
      is_qualified: lead.is_qualified,
      deal_value: lead.deal_value,
      status: lead.status,
      notes: lead.notes,
      created_at: lead.created_at,
      updated_at: lead.updated_at,
    };
    const col = byCol.get(lead.kanban_column_id);
    if (col) col.leads.push(slim);
    else orphans.push(slim);
  }

  return Response.json({
    success: true,
    data: {
      tenant: ctx.tenant,
      period_days: days,
      columns,
      orphans,
      total_leads: (leadsRes.data || []).length,
    },
  });
});
