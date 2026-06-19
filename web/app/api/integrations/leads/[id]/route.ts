import { handleIntegration, preflight } from '@/lib/server/integration-auth';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { AppError, NotFoundError, ValidationError } from '@/lib/server/errors';

export const dynamic = 'force-dynamic';

export const OPTIONS = (req: Request) => preflight(req);

async function findLead(id: string, tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new AppError(error.message, { status: 500 });
  if (!data) throw new NotFoundError('Lead não encontrado.');
  return data;
}

/** GET /api/integrations/leads/{id} */
export const GET = handleIntegration(async (req, ctx) => {
  const id = new URL(req.url).pathname.split('/').pop()!;
  const lead = await findLead(id, ctx.tenantId);
  return Response.json({ success: true, data: { lead } });
});

/**
 * PATCH /api/integrations/leads/{id}
 * Body: { kanban_column_id?, stage_id?, status?, deal_value?, notes?, answers?, is_qualified? }
 * Use `stage_id` como alias de `kanban_column_id` (mais intuitivo de fora).
 */
export const PATCH = handleIntegration(async (req, ctx) => {
  const id = new URL(req.url).pathname.split('/').pop()!;
  await findLead(id, ctx.tenantId);
  const body = await req.json().catch(() => ({}));

  const updates: any = {};
  if (body.kanban_column_id || body.stage_id) updates.kanban_column_id = body.kanban_column_id || body.stage_id;
  if (typeof body.status === 'string') updates.status = body.status;
  if (typeof body.deal_value === 'number') updates.deal_value = body.deal_value;
  if (typeof body.notes === 'string') updates.notes = body.notes;
  if (typeof body.is_qualified === 'boolean') updates.is_qualified = body.is_qualified;
  if (body.answers && typeof body.answers === 'object') {
    // merge
    const { data: existing } = await supabaseAdmin
      .from('leads').select('answers').eq('id', id).single();
    updates.answers = { ...((existing as any)?.answers || {}), ...body.answers };
  }

  if (Object.keys(updates).length === 0) throw new ValidationError('Nada pra atualizar.');

  // valida que a coluna kanban pertence ao tenant
  if (updates.kanban_column_id) {
    const { data: col } = await supabaseAdmin
      .from('kanban_columns').select('id').eq('id', updates.kanban_column_id).eq('tenant_id', ctx.tenantId).maybeSingle();
    if (!col) throw new ValidationError('kanban_column_id inválido ou não pertence ao tenant.');
  }

  const { data: lead, error } = await supabaseAdmin
    .from('leads').update(updates).eq('id', id).eq('tenant_id', ctx.tenantId).select('*').single();
  if (error) throw new AppError(error.message, { status: 500 });

  return Response.json({ success: true, data: { lead } });
});

/** DELETE /api/integrations/leads/{id} */
export const DELETE = handleIntegration(async (req, ctx) => {
  const id = new URL(req.url).pathname.split('/').pop()!;
  const { error, count } = await supabaseAdmin
    .from('leads').delete({ count: 'exact' }).eq('id', id).eq('tenant_id', ctx.tenantId);
  if (error) throw new AppError(error.message, { status: 500 });
  if (!count) throw new NotFoundError('Lead não encontrado.');
  return Response.json({ success: true, data: { deleted: true } });
});
