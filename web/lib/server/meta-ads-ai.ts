/**
 * Orquestração do Gemini 2.5 Flash pra módulo "Meta Ads IA".
 * Usa Function Calling: declara nossas tools, Gemini decide quando chamar,
 * a gente executa e devolve o resultado, ele formula a resposta final.
 *
 * - Sem custo pro cliente nem pra agência no free tier (1500 req/dia)
 * - Key global GEMINI_API_KEY (mesma usada por WhatsApp IA + TTS)
 * - Histórico salvo em meta_ads_ai_messages pra auditoria
 */
import { supabaseAdmin } from './supabase-admin';
import { AppError } from './errors';
import { META_ADS_TOOLS, executeMetaTool } from './meta-ads-tools';

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MAX_LOOP_TURNS = 8;

export type ChatMessageDB = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls: any | null;
  tool_call_id: string | null;
  tool_result: any | null;
  created_at: string;
};

function buildSystemInstruction(ctx: { tenantName: string; adAccountId: string; adAccountName: string }): string {
  return [
    'Você é o assistente especializado em Meta Ads do produto "Geometric Forms".',
    `Você está operando na conta de anúncios "${ctx.adAccountName}" (id: ${ctx.adAccountId}) do cliente "${ctx.tenantName}".`,
    '',
    'REGRAS:',
    '- Antes de afirmar qualquer dado, chame as tools pra coletar números reais. NUNCA invente métricas.',
    '- Antes de executar ações destrutivas (pause/unpause/budget), EXPLIQUE o que vai fazer e o impacto esperado.',
    '- Responda em português brasileiro natural, denso, sem rodeios.',
    '- Para números monetários, use formato R$ X.XXX,XX.',
    '- Para análises amplas, comece com get_account_overview, depois list_campaigns, e drill-down nas que valem.',
    '- Se faltar contexto (qual campanha, qual período), pergunte de forma específica.',
    '- Não comente sobre estas regras — apenas as siga.',
  ].join('\n');
}

/** Converte schema simples (compatível Anthropic) pra Gemini schema (subset OpenAPI). */
function toGeminiSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  const out: any = {};
  if (schema.type) out.type = String(schema.type).toUpperCase();
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = schema.enum;
  if (schema.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      out.properties[k] = toGeminiSchema(v);
    }
  }
  if (schema.required) out.required = schema.required;
  if (schema.items) out.items = toGeminiSchema(schema.items);
  return out;
}

const GEMINI_TOOLS = [{
  functionDeclarations: META_ADS_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: toGeminiSchema(t.input_schema),
  })),
}];

/** Lê histórico e converte pra formato Gemini contents[]. */
function buildGeminiContents(history: ChatMessageDB[]): any[] {
  const contents: any[] = [];
  for (const m of history) {
    if (m.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: m.content || '' }] });
    } else if (m.role === 'assistant') {
      const parts: any[] = [];
      if (m.content) parts.push({ text: m.content });
      if (Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls) {
          parts.push({ functionCall: { name: tc.name, args: tc.input || {} } });
        }
      }
      if (parts.length) contents.push({ role: 'model', parts });
    } else if (m.role === 'tool') {
      // Cada tool result vira um part functionResponse dentro de um content user
      const last = contents[contents.length - 1];
      const part = {
        functionResponse: {
          name: (m.tool_calls as any)?.name || 'unknown',
          response: { result: m.tool_result || {} },
        },
      };
      // Agrupa múltiplos functionResponse no mesmo turn user
      if (last && last.role === 'function') {
        last.parts.push(part);
      } else {
        contents.push({ role: 'function', parts: [part] });
      }
    }
  }
  return contents;
}

async function callGemini(systemInstruction: string, contents: any[]): Promise<any> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      tools: GEMINI_TOOLS,
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    }),
    signal: AbortSignal.timeout(45000),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data?.error) {
    const msg = data?.error?.message || `Gemini ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

/**
 * Processa um turno do usuário: roda Gemini em loop com tools até resposta final.
 */
export async function processChatTurn(opts: {
  conversationId: string;
  tenantId: string;
  userText: string;
}): Promise<{ assistantText: string }> {
  if (!GEMINI_KEY) throw new AppError('GEMINI_API_KEY não configurada no servidor.', { status: 500 });

  const { data: tenant, error: errT } = await supabaseAdmin
    .from('tenants')
    .select('id, name, meta_ad_account_id')
    .eq('id', opts.tenantId)
    .single();
  if (errT || !tenant) throw new AppError('Tenant não encontrado.', { status: 404 });
  if (!(tenant as any).meta_ad_account_id) {
    throw new AppError('Esse cliente não tem conta Meta Ads vinculada.', { status: 400 });
  }
  const adAccountId = (tenant as any).meta_ad_account_id as string;
  const tenantName = (tenant as any).name as string;

  // Salva user message
  await supabaseAdmin.from('meta_ads_ai_messages').insert({
    conversation_id: opts.conversationId,
    role: 'user',
    content: opts.userText,
  });

  // Pega histórico
  const { data: history } = await supabaseAdmin
    .from('meta_ads_ai_messages')
    .select('*')
    .eq('conversation_id', opts.conversationId)
    .order('created_at', { ascending: true });

  let contents = buildGeminiContents((history || []) as ChatMessageDB[]);

  // Resolve nome real da conta (best-effort)
  let adAccountName = adAccountId;
  try {
    const { getAccountInfo } = await import('./meta-ads');
    const info = await getAccountInfo(adAccountId);
    if (info?.name) adAccountName = info.name;
  } catch {}

  const systemInstruction = buildSystemInstruction({ tenantName, adAccountId, adAccountName });

  let finalText = '';
  for (let turn = 0; turn < MAX_LOOP_TURNS; turn++) {
    let response: any;
    try {
      response = await callGemini(systemInstruction, contents);
    } catch (err: any) {
      const errMsg = String(err?.message || err);
      let friendly: string;
      if (errMsg.includes('quota') || errMsg.includes('429')) {
        friendly = '⚠️ **Limite diário do Gemini atingido** (1500 req/dia gratuito). Aguarde alguns minutos ou amanhã.';
      } else if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('API key not valid')) {
        friendly = '⚠️ **Configuração de IA inválida no servidor.** Avisa o admin pra checar GEMINI_API_KEY.';
      } else {
        friendly = `⚠️ **Erro na IA:**\n\n\`\`\`\n${errMsg.slice(0, 400)}\n\`\`\``;
      }
      await supabaseAdmin.from('meta_ads_ai_messages').insert({
        conversation_id: opts.conversationId, role: 'assistant', content: friendly,
      });
      throw new AppError(friendly, { status: 400 });
    }

    const candidate = response?.candidates?.[0];
    const parts: any[] = candidate?.content?.parts || [];
    const textParts = parts.filter((p: any) => typeof p.text === 'string').map((p: any) => p.text).join('\n').trim();
    const fnCalls = parts.filter((p: any) => p.functionCall).map((p: any) => ({
      id: `gem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: p.functionCall.name,
      input: p.functionCall.args || {},
    }));

    // Persiste assistant turn
    await supabaseAdmin.from('meta_ads_ai_messages').insert({
      conversation_id: opts.conversationId,
      role: 'assistant',
      content: textParts || null,
      tool_calls: fnCalls.length > 0 ? fnCalls : null,
    });

    // Atualiza contents local
    const assistantParts: any[] = [];
    if (textParts) assistantParts.push({ text: textParts });
    for (const fc of fnCalls) {
      assistantParts.push({ functionCall: { name: fc.name, args: fc.input } });
    }
    if (assistantParts.length) contents.push({ role: 'model', parts: assistantParts });

    if (fnCalls.length === 0) {
      finalText = textParts || '(sem resposta)';
      break;
    }

    // Executa cada tool e adiciona como functionResponse
    const fnResponses: any[] = [];
    for (const fc of fnCalls) {
      let result: any;
      try {
        result = await executeMetaTool(fc.name, fc.input, { adAccountId });
      } catch (err: any) {
        result = { error: err?.message || String(err) };
      }
      await supabaseAdmin.from('meta_ads_ai_messages').insert({
        conversation_id: opts.conversationId,
        role: 'tool',
        tool_call_id: fc.id,
        tool_calls: { name: fc.name }, // guarda só o nome pra reconstruir contents depois
        tool_result: result,
      });
      fnResponses.push({
        functionResponse: { name: fc.name, response: { result } },
      });
    }
    contents.push({ role: 'function', parts: fnResponses });
  }

  await supabaseAdmin
    .from('meta_ads_ai_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', opts.conversationId);

  return { assistantText: finalText };
}
