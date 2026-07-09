import { handleIntegration, preflight, withCors } from '@/lib/server/integration-auth';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { AppError, ValidationError } from '@/lib/server/errors';
import { calculateScore } from '@/lib/server/leadScoring';
import { getDefaultColumnId } from '@/lib/server/kanban';
import { assertWithinLeadLimit } from '@/lib/server/plans';
import { getLeadName, getLeadPhone } from '@/lib/contact';

export const dynamic = 'force-dynamic';

export const OPTIONS = (req: Request) => preflight(req);

/**
 * POST /api/integrations/form-lead
 *
 * Ingere um lead externo (ex.: Lead Ad NATIVO do Meta, via Make/n8n/Zapier) e
 * cria um lead IGUAL a um lead de formulário: com respostas, lead_score
 * calculado pela pontuação das opções do formulário do Geometric, qualificação,
 * e cai no Kanban/Leads/Métricas.
 *
 * Body:
 *   {
 *     "form_id": "<uuid do formulário do Geometric que serve de gabarito/score>",
 *     "answers": { "<field_id>": "<valor>", ... },   // chaves = ids dos campos
 *     "name":  "João",            // opcional (senão deriva de answers)
 *     "phone": "5551999998888",   // opcional (senão deriva de answers)
 *     "email": "joao@x.com",      // opcional
 *     "utm": { "source": "...", "campaign": "...", "content": "...", "term": "..." },
 *     "platform": "instagram",    // opcional
 *     "source": "meta_lead_ad"    // opcional (rótulo livre)
 *   }
 *
 * As chaves de `answers` devem ser os IDS dos campos do formulário do Geometric
 * (veja no editor ou exportando o form). Para perguntas de múltipla escolha, o
 * VALOR precisa bater com o `value` da opção — assim a pontuação é somada.
 */
export const POST = handleIntegration(async (req, ctx) => {
  const body = await req.json().catch(() => ({} as any));
  const formId = String(body.form_id || '').trim();
  if (!formId) throw new ValidationError('Campo `form_id` obrigatório (formulário do Geometric usado como gabarito de score).');

  // Formulário-gabarito: precisa ser do mesmo tenant do token.
  const { data: form, error: fErr } = await supabaseAdmin
    .from('forms')
    .select('id, tenant_id, fields, qualification_threshold')
    .eq('id', formId)
    .maybeSingle();
  if (fErr) throw new AppError(fErr.message, { status: 500 });
  if (!form || (form as any).tenant_id !== ctx.tenantId) {
    throw new AppError('Formulário não encontrado neste cliente.', { status: 404 });
  }
  const fields = ((form as any).fields as any[]) || [];

  // Monta as respostas (chaveadas por field_id). Injeta name/phone/email nos
  // campos certos do form, se vierem soltos, pra derivar contato e (se houver
  // pontuação) somar no score.
  const answers: Record<string, any> = { ...(body.answers && typeof body.answers === 'object' ? body.answers : {}) };
  const putInto = (predicate: (f: any) => boolean, value: any) => {
    if (value === undefined || value === null || value === '') return;
    const f = fields.find(predicate);
    if (f && (answers[f.id] === undefined || answers[f.id] === '')) answers[f.id] = value;
  };
  putInto((f) => f.id === 'nome' || f.id === 'name' || /nome|name/i.test(f.id), body.name);
  putInto((f) => f.type === 'phone' || /telefone|phone|whatsapp|celular/i.test(f.id), body.phone);
  putInto((f) => f.type === 'email', body.email);

  if (Object.keys(answers).length === 0) {
    throw new ValidationError('Envie `answers` (chaveado por field_id) e/ou name/phone.');
  }

  const lead_score = calculateScore(answers, fields);
  const is_qualified = lead_score >= ((form as any).qualification_threshold ?? 0);

  // Enforcement de plano (conta contra o limite de leads do mês).
  await assertWithinLeadLimit(ctx.tenantId);

  const defaultColId = await getDefaultColumnId(ctx.tenantId);
  const utm = body.utm || {};

  const insertRow: any = {
    tenant_id: ctx.tenantId,
    form_id: (form as any).id,
    answers,
    lead_score,
    is_qualified,
    is_complete: true,
    status: 'novo',
    kanban_column_id: defaultColId,
    utm_source: utm.source || body.source || 'meta_lead_ad',
    utm_medium: utm.medium || 'paid',
    utm_campaign: utm.campaign || null,
    utm_content: utm.content || null,
    utm_term: utm.term || null,
    ad_platform: body.platform || null,
  };

  const { data: lead, error } = await supabaseAdmin
    .from('leads')
    .insert(insertRow)
    .select('*')
    .single();
  if (error) throw new AppError(error.message, { status: 500 });

  return withCors(req, Response.json({
    success: true,
    data: {
      lead: {
        id: (lead as any).id,
        name: getLeadName(answers, fields),
        phone: getLeadPhone(answers, fields),
        lead_score,
        is_qualified,
      },
    },
  }, { status: 201 }));
});
