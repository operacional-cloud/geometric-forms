/**
 * Service do Kanban: colunas customizáveis + movimentação de leads + métricas.
 *
 * Leads vivem em 2 tabelas (leads / prospecting_leads) — esse service abstrai isso
 * pra a UI tratar leads de forma unificada.
 */
import { supabaseAdmin } from './supabase-admin';
import { AppError } from './errors';
import type { AuthContext } from './auth';
import { getActiveTenantId } from './active-tenant';
import { assertWithinLeadLimit } from './plans';
import { getLeadName, getLeadPhone, getLeadEmail } from '@/lib/contact';

export type KanbanColumnKind =
  | 'default'
  | 'qualified'
  | 'em_contato'         // Em contato
  | 'meeting_scheduled'  // Reunião marcada
  | 'meeting_held'       // Reunião realizada
  | 'no_show'            // Não compareceu
  | 'proposal'           // Proposta enviada
  | 'followup'           // Follow up
  | 'won'                // Venda fechada
  | 'lost'               // Perdido
  | 'custom';

export type KanbanColumn = {
  id: string;
  tenant_id: string;
  name: string;
  color: string;
  position: number;
  kind: KanbanColumnKind;
  created_at: string;
};

export type LeadOrigin = 'form' | 'manual' | 'prospecting';

export type KanbanLead = {
  id: string;
  origin: LeadOrigin;
  kanban_column_id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  deal_value: number | null;
  notes: string | null;
  created_at: string;
  seller_id: string | null;
  tags: string[];
  /** Quando o lead entrou em coluna kind=won (1ª vez). Usado pra lista "Clientes fechados". */
  won_at?: string | null;
  /** Quando o lead entrou em coluna kind=followup (1ª vez). Usado pra detectar "parado > 7 dias". */
  followup_at?: string | null;
  // contexto adicional
  form_id?: string | null;
  form_title?: string | null;
  keyword_used?: string | null;
  metadata?: any;
};

function resolveTenant(ctx: AuthContext, requested?: string | null): string {
  if (ctx.profile.role === 'admin') {
    // 1) Parâmetro explícito tem prioridade
    if (requested) return requested;
    // 2) Cookie viewing_tenant_id (admin "entrou no painel" de um cliente)
    const active = getActiveTenantId(ctx);
    if (active) return active;
    throw new AppError('Admin precisa selecionar um cliente (entre no painel pela página /admin/[id]).', { status: 400 });
  }
  if (!ctx.profile.tenant_id) throw new AppError('Usuário sem tenant.', { status: 403 });
  return ctx.profile.tenant_id;
}

/**
 * Id da coluna de ENTRADA (kind='default', "Lead novo") do tenant. Garante que
 * as colunas default existam se ainda não foram criadas. Todo lead que entra
 * deve cair aqui — nunca ficar sem coluna (que vira a coluna "Sem coluna" na UI).
 */
export async function getDefaultColumnId(tenantId: string): Promise<string | null> {
  const pick = async () => {
    const { data } = await supabaseAdmin
      .from('kanban_columns')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('kind', 'default')
      .order('position')
      .limit(1)
      .maybeSingle();
    return (data?.id as string) || null;
  };
  let id = await pick();
  if (!id) {
    try {
      await supabaseAdmin.rpc('ensure_default_kanban_columns', { p_tenant_id: tenantId });
      id = await pick();
    } catch { /* mantém null */ }
  }
  return id;
}

// =============================================================================
// Columns CRUD
// =============================================================================

export async function listKanbanColumns(
  ctx: AuthContext,
  opts: { tenant_id?: string | null } = {},
): Promise<KanbanColumn[]> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);

  // Garante que tenha pelo menos as colunas default
  await supabaseAdmin.rpc('ensure_default_kanban_columns', { p_tenant_id: tenantId });

  const { data, error } = await supabaseAdmin
    .from('kanban_columns')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('position', { ascending: true });
  if (error) throw new AppError(error.message, { status: 500 });
  return (data || []) as KanbanColumn[];
}

export async function createKanbanColumn(
  ctx: AuthContext,
  input: { name: string; color?: string; position?: number; tenant_id?: string },
): Promise<KanbanColumn> {
  const tenantId = resolveTenant(ctx, input.tenant_id);
  const name = input.name.trim();
  if (!name) throw new AppError('Nome obrigatório.', { status: 400 });

  // Default position: depois da última
  let pos = input.position;
  if (pos == null) {
    const { data: last } = await supabaseAdmin
      .from('kanban_columns')
      .select('position')
      .eq('tenant_id', tenantId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    pos = ((last?.position as number) ?? -1) + 1;
  }

  const { data, error } = await supabaseAdmin
    .from('kanban_columns')
    .insert({
      tenant_id: tenantId,
      name,
      color: input.color || '#10F2A0',
      position: pos,
      kind: 'custom',
    })
    .select('*')
    .single();
  if (error) throw new AppError(error.message, { status: 500 });
  return data as KanbanColumn;
}

export async function updateKanbanColumn(
  ctx: AuthContext,
  columnId: string,
  patch: { name?: string; color?: string; position?: number; kind?: KanbanColumn['kind']; tenant_id?: string },
): Promise<KanbanColumn> {
  const tenantId = resolveTenant(ctx, patch.tenant_id);
  const updates: any = {};
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.color !== undefined) updates.color = patch.color;
  if (patch.position !== undefined) updates.position = patch.position;
  if (patch.kind !== undefined) updates.kind = patch.kind;

  const { data, error } = await supabaseAdmin
    .from('kanban_columns')
    .update(updates)
    .eq('id', columnId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error) throw new AppError(error.message, { status: 500 });
  return data as KanbanColumn;
}

export async function deleteKanbanColumn(
  ctx: AuthContext,
  columnId: string,
  opts: { tenant_id?: string } = {},
): Promise<void> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);
  // A coluna de entrada (kind='default', "Lead novo") é FIXA — onde todo lead
  // novo cai. Não pode ser excluída.
  const { data: col } = await supabaseAdmin
    .from('kanban_columns')
    .select('kind')
    .eq('id', columnId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if ((col as any)?.kind === 'default') {
    throw new AppError('A coluna de entrada "Lead novo" é fixa e não pode ser excluída.', { status: 400 });
  }
  // Leads que estavam nessa coluna ficam com kanban_column_id=null (ON DELETE SET NULL)
  const { error } = await supabaseAdmin
    .from('kanban_columns')
    .delete()
    .eq('id', columnId)
    .eq('tenant_id', tenantId);
  if (error) throw new AppError(error.message, { status: 500 });
}

export async function reorderKanbanColumns(
  ctx: AuthContext,
  orderedIds: string[],
  opts: { tenant_id?: string } = {},
): Promise<void> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);
  // Atualiza position em batch
  await Promise.all(
    orderedIds.map((id, idx) =>
      supabaseAdmin
        .from('kanban_columns')
        .update({ position: idx })
        .eq('id', id)
        .eq('tenant_id', tenantId),
    ),
  );
}

// =============================================================================
// Move lead between columns + lead manual + leads list
// =============================================================================

/**
 * Move um lead (form, manual ou prospecting) pra uma coluna do kanban.
 * Opcionalmente atualiza deal_value e notes.
 * Grava timestamps específicos baseado no kind da coluna (qualified_at, won_at, etc),
 * SOMENTE se o timestamp ainda não estiver setado (preserva primeira ocorrência).
 */
export async function moveLead(
  ctx: AuthContext,
  input: {
    lead_id: string;
    origin: LeadOrigin;
    column_id: string | null;
    deal_value?: number | null;
    notes?: string | null;
    tenant_id?: string;
  },
): Promise<void> {
  const tenantId = resolveTenant(ctx, input.tenant_id);
  const table = input.origin === 'prospecting' ? 'prospecting_leads' : 'leads';
  const updates: any = { kanban_column_id: input.column_id };
  if (input.deal_value !== undefined) updates.deal_value = input.deal_value;
  if (input.notes !== undefined) updates.notes = input.notes;

  // Descobre kind da nova coluna pra setar timestamp correspondente +
  // adicionar automaticamente o nome da coluna como tag no lead.
  let columnName: string | null = null;
  if (input.column_id) {
    const { data: col } = await supabaseAdmin
      .from('kanban_columns')
      .select('kind, name')
      .eq('id', input.column_id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (col) {
      columnName = (col as any).name || null;
      const now = new Date().toISOString();
      const kindToColumn: Partial<Record<KanbanColumnKind, string>> = {
        qualified: 'qualified_at',
        meeting_scheduled: 'meeting_scheduled_at',
        meeting_held: 'meeting_held_at',
        no_show: 'no_show_at',
        proposal: 'proposal_at',
        followup: 'followup_at',
        won: 'won_at',
        lost: 'lost_at',
      };
      const targetCol = kindToColumn[(col as any).kind as KanbanColumnKind];
      if (targetCol) {
        // Lê valor atual: só seta se ainda for null (preserva primeira vez)
        const { data: leadRow } = await supabaseAdmin
          .from(table)
          .select(targetCol)
          .eq('id', input.lead_id)
          .eq('tenant_id', tenantId)
          .maybeSingle();
        if (leadRow && !(leadRow as any)[targetCol]) {
          updates[targetCol] = now;
        }
      }
    }
  }

  const { error } = await supabaseAdmin
    .from(table)
    .update(updates)
    .eq('id', input.lead_id)
    .eq('tenant_id', tenantId);
  if (error) throw new AppError(error.message, { status: 500 });

  // Acumula tag com o nome da coluna (idempotente: array_append só se ainda não tem)
  if (columnName) {
    await addLeadTag(ctx, {
      lead_id: input.lead_id,
      origin: input.origin,
      tag: columnName,
      tenant_id: tenantId,
    }).catch(() => {});
  }
}

// =============================================================================
// Tags por lead
// =============================================================================

export async function addLeadTag(
  ctx: AuthContext,
  input: { lead_id: string; origin: LeadOrigin; tag: string; tenant_id?: string },
): Promise<string[]> {
  const tenantId = resolveTenant(ctx, input.tenant_id);
  const tag = (input.tag || '').trim();
  if (!tag) throw new AppError('Tag não pode ser vazia.', { status: 400 });
  const table = input.origin === 'prospecting' ? 'prospecting_leads' : 'leads';

  const { data: current, error: errR } = await supabaseAdmin
    .from(table)
    .select('tags')
    .eq('id', input.lead_id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (errR) throw new AppError(errR.message, { status: 500 });
  if (!current) throw new AppError('Lead não encontrado.', { status: 404 });

  const existing: string[] = Array.isArray((current as any).tags) ? (current as any).tags : [];
  if (existing.includes(tag)) return existing;
  const next = [...existing, tag];

  const { error } = await supabaseAdmin
    .from(table)
    .update({ tags: next })
    .eq('id', input.lead_id)
    .eq('tenant_id', tenantId);
  if (error) throw new AppError(error.message, { status: 500 });
  return next;
}

export async function removeLeadTag(
  ctx: AuthContext,
  input: { lead_id: string; origin: LeadOrigin; tag: string; tenant_id?: string },
): Promise<string[]> {
  const tenantId = resolveTenant(ctx, input.tenant_id);
  const tag = (input.tag || '').trim();
  if (!tag) throw new AppError('Tag não pode ser vazia.', { status: 400 });
  const table = input.origin === 'prospecting' ? 'prospecting_leads' : 'leads';

  const { data: current, error: errR } = await supabaseAdmin
    .from(table)
    .select('tags')
    .eq('id', input.lead_id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (errR) throw new AppError(errR.message, { status: 500 });
  if (!current) throw new AppError('Lead não encontrado.', { status: 404 });

  const existing: string[] = Array.isArray((current as any).tags) ? (current as any).tags : [];
  const next = existing.filter((t) => t !== tag);
  if (next.length === existing.length) return existing;

  const { error } = await supabaseAdmin
    .from(table)
    .update({ tags: next })
    .eq('id', input.lead_id)
    .eq('tenant_id', tenantId);
  if (error) throw new AppError(error.message, { status: 500 });
  return next;
}

/**
 * Cria lead manual direto na tabela leads (sem form_id).
 * Usado pelo CLIENTE no kanban pra adicionar contatos conhecidos.
 */
export async function createManualClientLead(
  ctx: AuthContext,
  input: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    notes?: string | null;
    deal_value?: number | null;
    column_id?: string | null;
    tenant_id?: string;
  },
): Promise<any> {
  const tenantId = resolveTenant(ctx, input.tenant_id);
  const name = (input.name || '').trim();
  const phone = (input.phone || '').replace(/\D/g, '');
  const email = (input.email || '').trim();

  if (!name && !phone && !email) {
    throw new AppError('Pelo menos nome, telefone ou email é obrigatório.', { status: 400 });
  }

  // Enforcement de plano: lead manual também conta contra max_leads_mes.
  await assertWithinLeadLimit(tenantId);

  // Se não tiver column_id, usa a coluna default do tenant
  let colId = input.column_id || null;
  if (!colId) {
    await supabaseAdmin.rpc('ensure_default_kanban_columns', { p_tenant_id: tenantId });
    const { data: defaultCol } = await supabaseAdmin
      .from('kanban_columns')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('kind', 'default')
      .maybeSingle();
    colId = (defaultCol?.id as string) || null;
  }

  const { data, error } = await supabaseAdmin
    .from('leads')
    .insert({
      tenant_id: tenantId,
      form_id: null,
      is_manual: true,
      manual_data: { name, phone, email },
      answers: { name, phone, email },
      notes: input.notes || null,
      deal_value: input.deal_value || null,
      kanban_column_id: colId,
      // 'novo' é o único valor válido pro check leads_status_check. A distinção
      // de lead manual fica em is_manual=true + tag, não no status.
      status: 'novo',
      lead_score: 0,
      is_qualified: false,
      is_complete: true,
    })
    .select('*')
    .single();
  if (error) throw new AppError(error.message, { status: 500 });
  return data;
}

// =============================================================================
// Kanban board: lista todos leads agrupados por coluna
// =============================================================================

export async function listAllLeadsForKanban(
  ctx: AuthContext,
  opts: { tenant_id?: string } = {},
): Promise<KanbanLead[]> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);

  const [formRes, prospRes, formsRes] = await Promise.all([
    supabaseAdmin
      .from('leads')
      .select('id, form_id, answers, manual_data, is_manual, kanban_column_id, deal_value, notes, created_at, seller_id, tags, won_at, followup_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(500),
    supabaseAdmin
      .from('prospecting_leads')
      .select('id, name, whatsapp_number, keyword_used, metadata, kanban_column_id, deal_value, notes, created_at, seller_id, tags, won_at, followup_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(500),
    supabaseAdmin
      .from('forms')
      .select('id, title, fields')
      .eq('tenant_id', tenantId),
  ]);

  if (formRes.error) throw new AppError(formRes.error.message, { status: 500 });
  if (prospRes.error) throw new AppError(prospRes.error.message, { status: 500 });

  const forms = (formsRes.data || []) as Array<{ id: string; title: string; fields: any[] }>;
  const formMap = new Map(forms.map((f) => [f.id, f]));

  const formLeads: KanbanLead[] = (formRes.data || []).map((l: any) => {
    const form = l.form_id ? formMap.get(l.form_id) : null;
    const fields = form?.fields || [];
    // Lead manual usa manual_data; lead de form usa answers
    const source = (l.is_manual && l.manual_data) ? l.manual_data : (l.answers || {});
    return {
      id: l.id,
      origin: l.is_manual ? 'manual' : 'form',
      kanban_column_id: l.kanban_column_id,
      name: getLeadName(source, fields) || (source?.name ? String(source.name) : null),
      phone: getLeadPhone(source, fields) || (source?.phone ? String(source.phone) : null),
      email: getLeadEmail(source, fields) || (source?.email ? String(source.email) : null),
      deal_value: l.deal_value !== null ? Number(l.deal_value) : null,
      notes: l.notes,
      created_at: l.created_at,
      seller_id: l.seller_id || null,
      tags: Array.isArray(l.tags) ? l.tags : [],
      won_at: l.won_at || null,
      followup_at: l.followup_at || null,
      form_id: l.form_id,
      form_title: form?.title || null,
    };
  });

  const prospLeads: KanbanLead[] = (prospRes.data || []).map((l: any) => ({
    id: l.id,
    origin: 'prospecting' as const,
    kanban_column_id: l.kanban_column_id,
    name: l.name,
    phone: l.whatsapp_number,
    email: null,
    deal_value: l.deal_value !== null ? Number(l.deal_value) : null,
    notes: l.notes,
    created_at: l.created_at,
    seller_id: l.seller_id || null,
    tags: Array.isArray(l.tags) ? l.tags : [],
    won_at: l.won_at || null,
    followup_at: l.followup_at || null,
    keyword_used: l.keyword_used,
    metadata: l.metadata,
  }));

  return [...formLeads, ...prospLeads].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}

// =============================================================================
// Métricas
// =============================================================================

export type KanbanMetrics = {
  totals: {
    leads_total: number;
    leads_form: number;
    leads_manual: number;
    leads_prospecting: number;
    deal_value_total: number;
    deal_value_won: number;
  };
  by_column: Array<{ column_id: string; column_name: string; column_color: string; kind: string; count: number; value: number }>;
  by_origin: Array<{ origin: LeadOrigin; count: number; value: number }>;
  conversion: {
    won_count: number;
    lost_count: number;
    in_progress_count: number;
    won_rate: number;
  };
};

// =============================================================================
// Métricas por tag (acumulam ao mover lead entre colunas)
// =============================================================================

export type TagMetric = { tag: string; count: number; value: number };

export async function getTagMetrics(
  ctx: AuthContext,
  opts: { tenant_id?: string } = {},
): Promise<TagMetric[]> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);
  const [formRes, prospRes] = await Promise.all([
    supabaseAdmin
      .from('leads')
      .select('tags, deal_value')
      .eq('tenant_id', tenantId),
    supabaseAdmin
      .from('prospecting_leads')
      .select('tags, deal_value')
      .eq('tenant_id', tenantId),
  ]);
  if (formRes.error) throw new AppError(formRes.error.message, { status: 500 });
  if (prospRes.error) throw new AppError(prospRes.error.message, { status: 500 });

  const acc = new Map<string, TagMetric>();
  for (const row of [...(formRes.data || []), ...(prospRes.data || [])] as any[]) {
    const tags = Array.isArray(row.tags) ? (row.tags as string[]) : [];
    const value = row.deal_value !== null ? Number(row.deal_value) : 0;
    for (const t of tags) {
      const cur = acc.get(t) || { tag: t, count: 0, value: 0 };
      cur.count += 1;
      cur.value += value;
      acc.set(t, cur);
    }
  }
  return Array.from(acc.values()).sort((a, b) => b.count - a.count);
}

// =============================================================================
// Sales Dashboard — agregado por dia (substitui a planilha)
// =============================================================================

export type SalesDailyRow = {
  date: string;             // YYYY-MM-DD
  leads: number;
  qualified: number;
  meeting_scheduled: number;
  meeting_held: number;
  no_show: number;
  proposal: number;
  followup: number;         // sempre 0 por enquanto (sem timestamp dedicado)
  won: number;
  lost: number;
  deal_value: number;       // soma de deal_value de vendas (won) fechadas nesse dia
};

export type SalesDashboard = {
  period: { start: string; end: string };
  daily: SalesDailyRow[];
  totals: SalesDailyRow & { date: string };
  conversion: {
    lead_to_qualified: number;
    lead_to_meeting: number;
    meeting_to_won: number;
    lead_to_won: number;
    avg_ticket: number;
  };
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getSalesDashboard(
  ctx: AuthContext,
  opts: { start: string; end: string; tenant_id?: string },
): Promise<SalesDashboard> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);
  const startISO = new Date(opts.start).toISOString();
  const endDate = new Date(opts.end);
  endDate.setHours(23, 59, 59, 999);
  const endISO = endDate.toISOString();

  // Pega TODOS os leads (form/manual/prospecting). Se as colunas timestamp ainda
  // não existem (SQL não rodada), faz fallback pra select básico (sem dados de funil).
  const TS_FIELDS = 'id, created_at, qualified_at, meeting_scheduled_at, meeting_held_at, no_show_at, proposal_at, won_at, lost_at, deal_value';
  const BASIC_FIELDS = 'id, created_at, deal_value';

  async function fetchLeads(table: 'leads' | 'prospecting_leads') {
    let r = await supabaseAdmin.from(table).select(TS_FIELDS).eq('tenant_id', tenantId);
    if (r.error) {
      // Colunas não existem → fallback. Loga uma vez só pra avisar.
      console.log(JSON.stringify({
        level: 'warn',
        msg: 'sales_timestamps_missing',
        table,
        err: r.error.message,
      }));
      const r2 = await supabaseAdmin.from(table).select(BASIC_FIELDS).eq('tenant_id', tenantId);
      if (r2.error) throw new AppError(r2.error.message, { status: 500 });
      return r2.data || [];
    }
    return r.data || [];
  }

  const [formData, prospData] = await Promise.all([
    fetchLeads('leads'),
    fetchLeads('prospecting_leads'),
  ]);
  const allLeads = [...formData, ...prospData] as any[];

  // Helper: cria map { 'YYYY-MM-DD' -> SalesDailyRow }
  const days = new Map<string, SalesDailyRow>();
  const startD = new Date(opts.start);
  const endD = new Date(opts.end);
  for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
    const key = isoDate(d);
    days.set(key, {
      date: key,
      leads: 0, qualified: 0, meeting_scheduled: 0, meeting_held: 0,
      no_show: 0, proposal: 0, followup: 0, won: 0, lost: 0, deal_value: 0,
    });
  }

  function bump(field: keyof SalesDailyRow, ts: string | null, valueIncr = 1) {
    if (!ts) return;
    const key = isoDate(new Date(ts));
    const day = days.get(key);
    if (!day) return;
    (day as any)[field] = ((day as any)[field] || 0) + valueIncr;
  }

  // Conta cada evento no dia que aconteceu
  for (const l of allLeads) {
    bump('leads', l.created_at);
    bump('qualified', l.qualified_at);
    bump('meeting_scheduled', l.meeting_scheduled_at);
    bump('meeting_held', l.meeting_held_at);
    bump('no_show', l.no_show_at);
    bump('proposal', l.proposal_at);
    bump('won', l.won_at);
    bump('lost', l.lost_at);
    if (l.won_at && l.deal_value) {
      bump('deal_value', l.won_at, Number(l.deal_value));
    }
  }

  const daily = Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Totais agregados
  const totals = {
    date: 'total',
    leads: 0, qualified: 0, meeting_scheduled: 0, meeting_held: 0,
    no_show: 0, proposal: 0, followup: 0, won: 0, lost: 0, deal_value: 0,
  };
  for (const d of daily) {
    totals.leads += d.leads;
    totals.qualified += d.qualified;
    totals.meeting_scheduled += d.meeting_scheduled;
    totals.meeting_held += d.meeting_held;
    totals.no_show += d.no_show;
    totals.proposal += d.proposal;
    totals.followup += d.followup;
    totals.won += d.won;
    totals.lost += d.lost;
    totals.deal_value += d.deal_value;
  }

  const lead_to_qualified = totals.leads > 0 ? totals.qualified / totals.leads : 0;
  const lead_to_meeting = totals.leads > 0 ? totals.meeting_held / totals.leads : 0;
  const meeting_to_won = totals.meeting_held > 0 ? totals.won / totals.meeting_held : 0;
  const lead_to_won = totals.leads > 0 ? totals.won / totals.leads : 0;
  const avg_ticket = totals.won > 0 ? totals.deal_value / totals.won : 0;

  return {
    period: { start: opts.start, end: opts.end },
    daily,
    totals,
    conversion: {
      lead_to_qualified,
      lead_to_meeting,
      meeting_to_won,
      lead_to_won,
      avg_ticket,
    },
  };
}

// =============================================================================
// OVERVIEW por estado atual das colunas (não usa timestamps)
// Esse é o painel principal que o cliente vê na aba Visão Geral.
// Funciona mesmo se a SQL de timestamps não tiver rodado.
// =============================================================================

export type OverviewBucket = {
  leads: number;
  qualified: number;
  em_contato: number;
  meeting_scheduled: number;
  meeting_held: number;
  no_show: number;
  proposal: number;
  followup: number;
  won: number;
  lost: number;
  deal_value: number;
};

export type OverviewSellerSlice = {
  seller_id: string | null;
  seller_name: string;
  seller_color: string;
  bucket: OverviewBucket;
};

export type Overview = {
  total: OverviewBucket;
  by_seller: OverviewSellerSlice[];   // inclui null (sem vendedor) como "Sem vendedor"
  by_column: Array<{ column_id: string; column_name: string; column_color: string; kind: string; count: number; value: number }>;
};

function emptyBucket(): OverviewBucket {
  return {
    leads: 0, qualified: 0, em_contato: 0, meeting_scheduled: 0, meeting_held: 0,
    no_show: 0, proposal: 0, followup: 0, won: 0, lost: 0, deal_value: 0,
  };
}

export async function getKanbanOverview(
  ctx: AuthContext,
  opts: { tenant_id?: string; seller_id?: string | null } = {},
): Promise<Overview> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);
  await supabaseAdmin.rpc('ensure_default_kanban_columns', { p_tenant_id: tenantId });

  const [colsRes, sellersRes, leadsRes, prospRes] = await Promise.all([
    supabaseAdmin
      .from('kanban_columns')
      .select('id, name, color, kind')
      .eq('tenant_id', tenantId)
      .order('position'),
    supabaseAdmin
      .from('kanban_sellers')
      .select('id, name, color, active')
      .eq('tenant_id', tenantId),
    supabaseAdmin
      .from('leads')
      .select('id, kanban_column_id, deal_value, seller_id')
      .eq('tenant_id', tenantId),
    supabaseAdmin
      .from('prospecting_leads')
      .select('id, kanban_column_id, deal_value, seller_id')
      .eq('tenant_id', tenantId),
  ]);

  if (colsRes.error) throw new AppError(colsRes.error.message, { status: 500 });
  if (leadsRes.error) throw new AppError(leadsRes.error.message, { status: 500 });
  if (prospRes.error) throw new AppError(prospRes.error.message, { status: 500 });

  const columns = (colsRes.data || []) as Array<{ id: string; name: string; color: string; kind: KanbanColumnKind }>;
  const colMap = new Map(columns.map((c) => [c.id, c]));
  // Sellers (pode falhar se tabela ainda não existe; trata como vazio)
  const sellers = (sellersRes.error ? [] : sellersRes.data || []) as Array<{ id: string; name: string; color: string; active: boolean }>;
  const sellerMap = new Map(sellers.map((s) => [s.id, s]));

  const allLeads = [...(leadsRes.data || []), ...(prospRes.data || [])] as any[];

  // Filtro por vendedor se solicitado
  const filteredLeads = opts.seller_id !== undefined
    ? allLeads.filter((l) => (opts.seller_id === null ? !l.seller_id : l.seller_id === opts.seller_id))
    : allLeads;

  function bucketizeLead(b: OverviewBucket, lead: any) {
    b.leads += 1;
    const col = lead.kanban_column_id ? colMap.get(lead.kanban_column_id) : null;
    const kind = col?.kind as KanbanColumnKind | undefined;
    const v = Number(lead.deal_value || 0);
    if (kind === 'qualified') b.qualified += 1;
    else if (kind === 'em_contato') b.em_contato += 1;
    else if (kind === 'meeting_scheduled') b.meeting_scheduled += 1;
    else if (kind === 'meeting_held') b.meeting_held += 1;
    else if (kind === 'no_show') b.no_show += 1;
    else if (kind === 'proposal') b.proposal += 1;
    else if (kind === 'followup') b.followup += 1;
    else if (kind === 'won') { b.won += 1; b.deal_value += v; }
    else if (kind === 'lost') b.lost += 1;
  }

  // Total
  const total = emptyBucket();
  filteredLeads.forEach((l) => bucketizeLead(total, l));

  // Por vendedor (agrupa)
  const bySellerMap = new Map<string | null, OverviewBucket>();
  for (const l of allLeads) {
    const sid = l.seller_id || null;
    if (!bySellerMap.has(sid)) bySellerMap.set(sid, emptyBucket());
    bucketizeLead(bySellerMap.get(sid)!, l);
  }
  const by_seller: OverviewSellerSlice[] = [];
  for (const [sid, bucket] of bySellerMap.entries()) {
    if (sid === null) {
      by_seller.push({ seller_id: null, seller_name: 'Sem vendedor', seller_color: '#7A8584', bucket });
    } else {
      const s = sellerMap.get(sid);
      by_seller.push({
        seller_id: sid,
        seller_name: s?.name || 'Vendedor removido',
        seller_color: s?.color || '#A8B7BB',
        bucket,
      });
    }
  }
  // Adiciona vendedores ativos que ainda não têm leads
  for (const s of sellers) {
    if (!s.active) continue;
    if (!bySellerMap.has(s.id)) {
      by_seller.push({ seller_id: s.id, seller_name: s.name, seller_color: s.color, bucket: emptyBucket() });
    }
  }
  // Ordena: vendedores ativos primeiro (por nome), depois "Sem vendedor"
  by_seller.sort((a, b) => {
    if (a.seller_id === null) return 1;
    if (b.seller_id === null) return -1;
    return a.seller_name.localeCompare(b.seller_name, 'pt-BR');
  });

  // Por coluna (estado atual)
  const by_column = columns.map((c) => {
    const leadsInCol = filteredLeads.filter((l) => l.kanban_column_id === c.id);
    return {
      column_id: c.id,
      column_name: c.name,
      column_color: c.color,
      kind: c.kind,
      count: leadsInCol.length,
      value: leadsInCol.reduce((acc, l) => acc + Number(l.deal_value || 0), 0),
    };
  });

  return { total, by_seller, by_column };
}

export async function getKanbanMetrics(
  ctx: AuthContext,
  opts: { tenant_id?: string } = {},
): Promise<KanbanMetrics> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);
  const [columns, leads] = await Promise.all([
    listKanbanColumns(ctx, opts),
    listAllLeadsForKanban(ctx, opts),
  ]);

  const colMap = new Map(columns.map((c) => [c.id, c]));

  const by_column = columns.map((c) => {
    const leadsInCol = leads.filter((l) => l.kanban_column_id === c.id);
    const value = leadsInCol.reduce((acc, l) => acc + (l.deal_value || 0), 0);
    return {
      column_id: c.id,
      column_name: c.name,
      column_color: c.color,
      kind: c.kind,
      count: leadsInCol.length,
      value,
    };
  });

  const by_origin_map: Record<LeadOrigin, { count: number; value: number }> = {
    form: { count: 0, value: 0 },
    manual: { count: 0, value: 0 },
    prospecting: { count: 0, value: 0 },
  };
  for (const l of leads) {
    by_origin_map[l.origin].count += 1;
    by_origin_map[l.origin].value += l.deal_value || 0;
  }
  const by_origin = (Object.keys(by_origin_map) as LeadOrigin[]).map((origin) => ({
    origin,
    count: by_origin_map[origin].count,
    value: by_origin_map[origin].value,
  }));

  let won_count = 0;
  let lost_count = 0;
  let won_value = 0;
  let total_value = 0;
  for (const l of leads) {
    const col = l.kanban_column_id ? colMap.get(l.kanban_column_id) : null;
    if (col?.kind === 'won') { won_count += 1; won_value += l.deal_value || 0; }
    if (col?.kind === 'lost') lost_count += 1;
    total_value += l.deal_value || 0;
  }
  const closed = won_count + lost_count;
  const in_progress = leads.length - closed;
  const won_rate = closed > 0 ? won_count / closed : 0;

  return {
    totals: {
      leads_total: leads.length,
      leads_form: by_origin_map.form.count,
      leads_manual: by_origin_map.manual.count,
      leads_prospecting: by_origin_map.prospecting.count,
      deal_value_total: total_value,
      deal_value_won: won_value,
    },
    by_column,
    by_origin,
    conversion: {
      won_count,
      lost_count,
      in_progress_count: in_progress,
      won_rate,
    },
  };
}
