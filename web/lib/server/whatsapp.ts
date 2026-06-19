/**
 * Service layer do módulo WhatsApp.
 *
 * Orquestra:
 *   - Evolution API (lib/server/evolution.ts) — criação de instances, envio de msgs
 *   - Supabase (whatsapp_* tables) — persistência de instances, conversas, mensagens, prompts
 *   - Gemini (lib/server/gemini.ts) — qualificação humanizada
 *
 * Cliente comum só pode ver dados do próprio tenant; admin pode atuar em nome de qualquer tenant
 * (passa `tenantId` explícito quando aplicável).
 */

import { supabaseAdmin } from './supabase-admin';
import { AppError } from './errors';
import type { AuthContext } from './auth';
import * as evo from './evolution';
import { runQualifier, runResume, synthesizeSpeech, type ChatTurn } from './gemini';

// =============================================================================
// Helpers de auth
// =============================================================================

function resolveTenant(ctx: AuthContext, requested?: string | null): string {
  if (ctx.profile.role === 'admin') {
    if (!requested) throw new AppError('Admin precisa selecionar um cliente.', { status: 400 });
    return requested;
  }
  if (!ctx.profile.tenant_id) throw new AppError('Usuário sem tenant.', { status: 403 });
  return ctx.profile.tenant_id;
}

// =============================================================================
// Tipos
// =============================================================================

export type WhatsAppInstance = {
  id: string;
  tenant_id: string;
  name: string;
  evolution_instance: string;
  status: 'pending' | 'qr' | 'connecting' | 'connected' | 'disconnected' | 'failed';
  phone_number: string | null;
  qr_code: string | null;
  last_event_at: string;
  connected_at: string | null;
  created_at: string;
};

export type WhatsAppConversation = {
  id: string;
  tenant_id: string;
  instance_id: string;
  prospecting_lead_id: string | null;
  remote_jid: string;
  display_name: string | null;
  status: 'qualifying' | 'qualified' | 'rejected' | 'transferred' | 'paused' | 'human_takeover';
  qualification_summary: string | null;
  qualified_at: string | null;
  transferred_at: string | null;
  ai_paused: boolean;
  last_message_at: string;
  last_message_preview: string | null;
  message_count: number;
  is_group: boolean;
  created_at: string;
};

export type WhatsAppMessage = {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  source: 'ai' | 'human' | 'system' | 'user';
  content: string;
  evolution_message_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
  /** Em grupos: nome (pushName) do remetente daquela mensagem */
  sender_name?: string | null;
  /** Em grupos: jid do participante remetente */
  sender_jid?: string | null;
};

export type WhatsAppPrompt = {
  tenant_id: string;
  system_prompt: string;
  qualification_criteria: string;
  initial_message: string;
  transfer_message: string;
  ai_enabled: boolean;
  fake_call_enabled: boolean;
  voice_reply_enabled: boolean;
  updated_at: string;
};

// =============================================================================
// Instances
// =============================================================================

export async function createWhatsAppInstance(
  ctx: AuthContext,
  input: { name: string; tenant_id?: string | null },
): Promise<WhatsAppInstance> {
  const tenantId = resolveTenant(ctx, input.tenant_id);
  const name = input.name.trim();
  if (!name) throw new AppError('Nome obrigatório.', { status: 400 });

  // Gera nome técnico único pra Evolution
  const evolutionName = evo.makeInstanceName(name, tenantId.slice(0, 8));

  // 1. Cria no Evolution
  try {
    await evo.createInstance(evolutionName);
  } catch (err: any) {
    // Se já existe no Evolution, segue (pode ter sido criado antes e o registro sumiu no banco)
    if (!String(err?.message || '').toLowerCase().includes('already')) {
      throw new AppError(`Falha ao criar instance no Evolution: ${err?.message || err}`, { status: 502 });
    }
  }

  // 2. Persiste no banco
  const { data, error } = await supabaseAdmin
    .from('whatsapp_instances')
    .insert({
      tenant_id: tenantId,
      name,
      evolution_instance: evolutionName,
      status: 'qr',
    })
    .select('*')
    .single();

  if (error) throw new AppError(error.message, { status: 500 });
  return data as WhatsAppInstance;
}

export async function listWhatsAppInstances(
  ctx: AuthContext,
  opts: { tenant_id?: string | null } = {},
): Promise<WhatsAppInstance[]> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);
  const { data, error } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) throw new AppError(error.message, { status: 500 });

  const list = (data || []) as WhatsAppInstance[];

  // Sync ativo: pra cada instance que NÃO está num estado final (connected/failed),
  // consulta o Evolution e atualiza o banco. Resolve o caso do webhook não chegar.
  await Promise.all(
    list.map(async (inst) => {
      if (inst.status === 'connected' || inst.status === 'failed') return;
      try {
        const r = await evo.getInstanceState(inst.evolution_instance);
        const state = r?.instance?.state || '';
        const map: Record<string, WhatsAppInstance['status']> = {
          open: 'connected',
          connecting: 'connecting',
          close: 'disconnected',
          qrcode: 'qr',
        };
        const mapped = map[state] || inst.status;
        if (mapped !== inst.status) {
          const updates: any = {
            status: mapped,
            last_event_at: new Date().toISOString(),
          };
          if (mapped === 'connected') {
            updates.connected_at = new Date().toISOString();
            updates.qr_code = null;
          }
          await supabaseAdmin
            .from('whatsapp_instances')
            .update(updates)
            .eq('id', inst.id);
          inst.status = mapped;
          if (mapped === 'connected') {
            inst.connected_at = updates.connected_at;
            inst.qr_code = null;
          }
        }
      } catch {
        // Não fatal: deixa o status como tá. Pode ser tunnel offline ou Evolution lento.
      }
    }),
  );

  return list;
}

export async function getWhatsAppInstance(
  ctx: AuthContext,
  instanceId: string,
  opts: { tenant_id?: string | null } = {},
): Promise<WhatsAppInstance> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);
  const { data, error } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('*')
    .eq('id', instanceId)
    .eq('tenant_id', tenantId)
    .single();
  if (error) throw new AppError('Instance não encontrada.', { status: 404 });
  return data as WhatsAppInstance;
}

/**
 * Pede QR code novo ao Evolution e atualiza no banco.
 */
export async function refreshInstanceQR(
  ctx: AuthContext,
  instanceId: string,
  opts: { tenant_id?: string | null } = {},
): Promise<{ qrcode: string | null; state: string }> {
  const inst = await getWhatsAppInstance(ctx, instanceId, opts);

  const result = await evo.connectInstance(inst.evolution_instance);
  const qrcode = result.base64 || null;

  await supabaseAdmin
    .from('whatsapp_instances')
    .update({
      qr_code: qrcode,
      status: qrcode ? 'qr' : 'connecting',
      last_event_at: new Date().toISOString(),
    })
    .eq('id', instanceId);

  return { qrcode, state: 'qr' };
}

export async function deleteWhatsAppInstance(
  ctx: AuthContext,
  instanceId: string,
  opts: { tenant_id?: string | null } = {},
): Promise<void> {
  const inst = await getWhatsAppInstance(ctx, instanceId, opts);

  // Tenta logout + delete no Evolution. Não fatal se falhar (tunnel offline, instance já não existe lá, etc).
  let logoutOk = false;
  let deleteOk = false;
  try {
    await evo.logoutInstance(inst.evolution_instance);
    logoutOk = true;
  } catch (err: any) {
    console.log(JSON.stringify({ level: 'warn', msg: 'wa_logout_failed', instance: inst.evolution_instance, err: err?.message }));
  }
  try {
    await evo.deleteInstance(inst.evolution_instance);
    deleteOk = true;
  } catch (err: any) {
    console.log(JSON.stringify({ level: 'warn', msg: 'wa_delete_evolution_failed', instance: inst.evolution_instance, err: err?.message }));
  }

  // Apaga do banco SEMPRE (mesmo se Evolution falhou)
  const { error } = await supabaseAdmin
    .from('whatsapp_instances')
    .delete()
    .eq('id', instanceId);
  if (error) throw new AppError(error.message, { status: 500 });

  console.log(JSON.stringify({
    level: 'info', msg: 'wa_instance_deleted',
    instance: inst.evolution_instance,
    logoutOk, deleteOk, db_deleted: true,
  }));
}

// =============================================================================
// Conversations
// =============================================================================

export async function listConversations(
  ctx: AuthContext,
  opts: {
    tenant_id?: string | null;
    instance_id?: string;
    status?: string;
    limit?: number;
    /** Default false: exclui grupos. Passa true pra incluir (UI de IA de Atendimento). */
    includeGroups?: boolean;
    /** Default false: retorna apenas grupos. */
    onlyGroups?: boolean;
  } = {},
): Promise<WhatsAppConversation[]> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);
  let q = supabaseAdmin
    .from('whatsapp_conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('last_message_at', { ascending: false })
    .limit(Math.min(opts.limit || 100, 500));
  if (opts.instance_id) q = q.eq('instance_id', opts.instance_id);
  if (opts.status) q = q.eq('status', opts.status);
  if (opts.onlyGroups) q = q.eq('is_group', true);
  else if (!opts.includeGroups) q = q.eq('is_group', false);
  const { data, error } = await q;
  if (error) throw new AppError(error.message, { status: 500 });
  return (data || []) as WhatsAppConversation[];
}

export async function listMessages(
  ctx: AuthContext,
  conversationId: string,
  opts: { tenant_id?: string | null; limit?: number } = {},
): Promise<WhatsAppMessage[]> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);
  // Garante que conversa é do tenant
  const { data: conv, error: errC } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)
    .single();
  if (errC || !conv) throw new AppError('Conversa não encontrada.', { status: 404 });

  const { data, error } = await supabaseAdmin
    .from('whatsapp_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(Math.min(opts.limit || 500, 1000));
  if (error) throw new AppError(error.message, { status: 500 });
  return (data || []) as WhatsAppMessage[];
}

/**
 * Inicia qualificação de um prospecting_lead via WhatsApp:
 *   1. Resolve lead + instance + prompt
 *   2. Substitui variáveis na initial_message
 *   3. Envia mensagem pelo Evolution
 *   4. Cria conversation vinculada ao prospecting_lead_id
 *   5. Atualiza prospecting_lead.status pra 'sending'
 *
 * Quando o lead responder, o webhook chama processInboundMessage que continua
 * a conversa com a IA conforme o prompt.
 */
export async function startLeadQualification(
  ctx: AuthContext,
  input: { lead_id: string; instance_id: string; tenant_id?: string | null },
): Promise<{ conversation_id: string; remote_jid: string; sent_text: string; resumed: boolean }> {
  const tenantId = resolveTenant(ctx, input.tenant_id);

  // 1. Lead
  const { data: lead, error: errL } = await supabaseAdmin
    .from('prospecting_leads')
    .select('id, name, whatsapp_number, keyword_used, metadata, status')
    .eq('id', input.lead_id)
    .eq('tenant_id', tenantId)
    .single();
  if (errL || !lead) throw new AppError('Lead não encontrado.', { status: 404 });
  if (!lead.whatsapp_number) throw new AppError('Lead sem número WhatsApp.', { status: 400 });

  // 2. Instance
  const { data: inst, error: errI } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('id, evolution_instance, status')
    .eq('id', input.instance_id)
    .eq('tenant_id', tenantId)
    .single();
  if (errI || !inst) throw new AppError('Conexão WhatsApp não encontrada.', { status: 404 });
  if (inst.status !== 'connected') {
    throw new AppError('Conexão WhatsApp não está ativa. Verifique o status.', { status: 400 });
  }

  // 3. Prompt do tenant
  const { data: promptRow } = await supabaseAdmin
    .from('whatsapp_prompts')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const prompt = (promptRow as WhatsAppPrompt) || {
    ...({
      system_prompt: '',
      qualification_criteria: '',
      initial_message: 'Olá! Tudo bem? Vi seu negócio aqui e queria fazer uma pergunta rápida.',
      transfer_message: '',
      ai_enabled: true,
    } as Omit<WhatsAppPrompt, 'tenant_id' | 'updated_at'>),
    tenant_id: tenantId,
    updated_at: '',
  };

  // 4. Variáveis pra substituição
  const meta = (lead.metadata as any) || {};
  const nicho = meta.osm_niche || (lead.keyword_used?.split('·')[0] || '').trim() || 'negócio';
  const cidade = meta.osm_city || (lead.keyword_used?.split('·')[1] || '').trim() || 'sua região';
  const nome = lead.name || '';
  const firstName = nome.split(' ')[0];

  function fillVars(template: string): string {
    return (template || 'Olá!')
      .replace(/\{nicho\}/g, nicho)
      .replace(/\{cidade\}/g, cidade)
      .replace(/\{nome\}/g, firstName)
      .replace(/\{negocio\}/g, nome);
  }

  // 5. Resolve JID REAL no WhatsApp (contorna "lógica do 9")
  const check = await evo.checkWhatsAppNumber(inst.evolution_instance, lead.whatsapp_number);
  if (!check.exists || !check.jid) {
    await supabaseAdmin
      .from('prospecting_leads')
      .update({ status: 'failed', last_error: 'Número não existe no WhatsApp' })
      .eq('id', lead.id);
    throw new AppError('Esse número não existe no WhatsApp. Verifique o número e tente novamente.', { status: 400 });
  }
  const realJid = check.jid;

  // 6. Verifica se já existe conversation com esse JID nessa instance.
  //    Match exato OU por número limpo (cobre variações @lid vs @s.whatsapp.net).
  let { data: conv } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('*')
    .eq('instance_id', inst.id)
    .eq('remote_jid', realJid)
    .maybeSingle();
  if (!conv) {
    const realClean = evo.jidToNumber(realJid);
    const { data: candidates } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('*')
      .eq('instance_id', inst.id);
    conv = (candidates || []).find((c: any) => {
      const candClean = evo.jidToNumber(c.remote_jid);
      return candClean === realClean
        || (candClean.length >= 10 && realClean.length >= 10
            && (candClean.endsWith(realClean) || realClean.endsWith(candClean)));
    }) || null;
  }

  // 7. Decide qual mensagem enviar:
  //    - Conv existe E tem histórico → usa runResume (IA gera msg de continuidade com contexto)
  //    - Senão → usa initial_message do prompt
  let messageToSend: string;
  let resumed = false;
  if (conv && conv.message_count > 0) {
    // Pega histórico pra contexto
    const { data: history } = await supabaseAdmin
      .from('whatsapp_messages')
      .select('direction, content, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })
      .limit(40);
    const turns: ChatTurn[] = (history || []).map((m: any) => ({
      role: m.direction === 'inbound' ? 'user' as const : 'model' as const,
      text: m.content,
    }));
    try {
      const resumeResult = await runResume({
        systemPrompt: prompt.system_prompt,
        qualificationCriteria: prompt.qualification_criteria,
        history: turns,
      });
      messageToSend = resumeResult.reply;
      resumed = true;
    } catch (err: any) {
      console.log(JSON.stringify({ level: 'warn', msg: 'wa_resume_failed_fallback_initial', err: err?.message }));
      messageToSend = fillVars(prompt.initial_message);
    }
  } else {
    messageToSend = fillVars(prompt.initial_message);
  }

  // 8. Envia via Evolution usando o JID real
  let sentMessageId: string | null = null;
  let remoteJid: string = realJid;
  try {
    const sent = await evo.sendText(inst.evolution_instance, realJid, messageToSend);
    sentMessageId = sent?.key?.id || null;
    const retJid = (sent?.key as any)?.remoteJid;
    if (retJid) remoteJid = retJid;
  } catch (err: any) {
    console.log(JSON.stringify({
      level: 'error', msg: 'wa_qualify_send_failed',
      err: err?.message,
      details: err?.data ? JSON.stringify(err.data).slice(0, 500) : null,
      lead_id: lead.id, number: lead.whatsapp_number, realJid,
    }));
    await supabaseAdmin
      .from('prospecting_leads')
      .update({ status: 'failed', last_error: err?.message || 'erro envio' })
      .eq('id', lead.id);
    throw new AppError(`Falha ao enviar primeira mensagem: ${err?.message || err}`, { status: 502 });
  }

  // 9. Cria ou atualiza conversation
  if (!conv) {
    const ins = await supabaseAdmin
      .from('whatsapp_conversations')
      .insert({
        tenant_id: tenantId,
        instance_id: inst.id,
        prospecting_lead_id: lead.id,
        remote_jid: remoteJid,
        display_name: lead.name,
        last_message_preview: messageToSend.slice(0, 200),
        message_count: 1,
      })
      .select('*')
      .single();
    if (ins.error) throw new AppError(ins.error.message, { status: 500 });
    conv = ins.data;
  } else {
    // Reativa IA + vincula lead + atualiza preview/contagem
    await supabaseAdmin
      .from('whatsapp_conversations')
      .update({
        prospecting_lead_id: conv.prospecting_lead_id || lead.id,
        display_name: conv.display_name || lead.name,
        last_message_at: new Date().toISOString(),
        last_message_preview: messageToSend.slice(0, 200),
        message_count: (conv.message_count || 0) + 1,
        status: 'qualifying',
        ai_paused: false,
      })
      .eq('id', conv.id);
  }

  // 10. Salva a mensagem enviada como outbound/ai
  await supabaseAdmin.from('whatsapp_messages').insert({
    conversation_id: conv.id,
    direction: 'outbound',
    source: 'ai',
    content: messageToSend,
    evolution_message_id: sentMessageId,
    metadata: { initial: !resumed, resumed },
  });

  // 8. Atualiza lead → 'sending' (significa que primeira msg foi enviada)
  await supabaseAdmin
    .from('prospecting_leads')
    .update({ status: 'sending', sent_at: new Date().toISOString(), last_error: null })
    .eq('id', lead.id);

  console.log(JSON.stringify({
    level: 'info', msg: 'wa_qualify_started',
    lead_id: lead.id, conversation_id: conv.id, instance: inst.evolution_instance,
  }));

  return {
    conversation_id: conv.id,
    remote_jid: remoteJid,
    sent_text: messageToSend,
    resumed,
  };
}

export async function deleteConversation(
  ctx: AuthContext,
  conversationId: string,
  opts: { tenant_id?: string | null } = {},
): Promise<void> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);
  // Verifica que pertence ao tenant
  const { data: conv, error: errC } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('id, tenant_id')
    .eq('id', conversationId)
    .eq('tenant_id', tenantId)
    .single();
  if (errC || !conv) throw new AppError('Conversa não encontrada.', { status: 404 });

  // Apaga conv (cascata apaga whatsapp_messages via FK)
  const { error } = await supabaseAdmin
    .from('whatsapp_conversations')
    .delete()
    .eq('id', conversationId)
    .eq('tenant_id', tenantId);
  if (error) throw new AppError(error.message, { status: 500 });

  console.log(JSON.stringify({ level: 'info', msg: 'wa_conversation_deleted', conversation_id: conversationId }));
}

export async function setConversationPause(
  ctx: AuthContext,
  conversationId: string,
  paused: boolean,
  opts: { tenant_id?: string | null } = {},
): Promise<void> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);
  const { error } = await supabaseAdmin
    .from('whatsapp_conversations')
    .update({ ai_paused: paused, status: paused ? 'human_takeover' : 'qualifying' })
    .eq('id', conversationId)
    .eq('tenant_id', tenantId);
  if (error) throw new AppError(error.message, { status: 500 });
}

// =============================================================================
// Prompts (config da IA por tenant)
// =============================================================================

const DEFAULT_PROMPT: Omit<WhatsAppPrompt, 'tenant_id' | 'updated_at'> = {
  system_prompt:
    'Você é o Pedro, da Geometric Agency. Conversa por WhatsApp de forma natural, descontraída, '
    + 'sem parecer robô. Sua missão é descobrir se o lead tem interesse genuíno em melhorar resultados '
    + 'no marketing digital antes de passar pra equipe humana de vendas.',
  qualification_criteria:
    '- Lead demonstra ter negócio em operação\n'
    + '- Tem orçamento mensal pra investir em marketing (>= R$ 500)\n'
    + '- Está aberto a uma conversa de 15 minutos esta semana',
  initial_message:
    'Oi! Vi que você é dono de {nicho} aí em {cidade}. Tô fazendo uma rodada rápida pra entender '
    + 'como tá o marketing aí — posso te fazer 2-3 perguntas em 30 segundos?',
  transfer_message:
    'Show! Vou alinhar com o {responsavel} aqui da equipe e ele te chama daqui a pouco, beleza?',
  ai_enabled: true,
  fake_call_enabled: false,
  voice_reply_enabled: false,
};

export async function getWhatsAppPrompt(
  ctx: AuthContext,
  opts: { tenant_id?: string | null } = {},
): Promise<WhatsAppPrompt> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);
  const { data, error } = await supabaseAdmin
    .from('whatsapp_prompts')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new AppError(error.message, { status: 500 });
  if (!data) {
    return { tenant_id: tenantId, updated_at: new Date().toISOString(), ...DEFAULT_PROMPT };
  }
  return data as WhatsAppPrompt;
}

export async function saveWhatsAppPrompt(
  ctx: AuthContext,
  input: Partial<Omit<WhatsAppPrompt, 'tenant_id' | 'updated_at'>>,
  opts: { tenant_id?: string | null } = {},
): Promise<WhatsAppPrompt> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);
  const current = await getWhatsAppPrompt(ctx, opts);
  const next = { ...current, ...input, tenant_id: tenantId };
  const { data, error } = await supabaseAdmin
    .from('whatsapp_prompts')
    .upsert({
      tenant_id: tenantId,
      system_prompt: next.system_prompt,
      qualification_criteria: next.qualification_criteria,
      initial_message: next.initial_message,
      transfer_message: next.transfer_message,
      ai_enabled: next.ai_enabled,
      fake_call_enabled: next.fake_call_enabled,
      voice_reply_enabled: next.voice_reply_enabled,
    })
    .select('*')
    .single();
  if (error) throw new AppError(error.message, { status: 500 });
  return data as WhatsAppPrompt;
}

// =============================================================================
// Engine: processar mensagem entrante (chamado pelo webhook)
// =============================================================================

/**
 * Processa uma mensagem inbound do WhatsApp:
 *   1. Acha ou cria a conversa
 *   2. Salva a mensagem
 *   3. Se IA não estiver pausada, roda Gemini + envia resposta
 *   4. Se Gemini decidir qualified/rejected, atualiza status e envia mensagem de transferência
 */
export async function processInboundMessage(input: {
  evolutionInstance: string;
  remoteJid: string;
  remoteJidAlt?: string;          // JID alternativo (s.whatsapp.net quando remoteJid é @lid)
  displayName?: string | null;
  text: string;
  evolutionMessageId?: string;
  /** True quando o remetente é um grupo (@g.us). Nesse caso a IA NÃO responde automaticamente. */
  isGroup?: boolean;
  /** True quando a mensagem inbound original era áudio (tem o prefixo 🎤). IA responde também em áudio. */
  wasAudio?: boolean;
  /** Em grupos, jid do participante que mandou (data.key.participant) */
  senderJid?: string | null;
  /** Em grupos, nome do remetente (pushName) */
  senderName?: string | null;
}): Promise<{ replied: boolean; decision?: string }> {
  // 1. Acha instance no banco pelo nome técnico do Evolution
  const { data: inst, error: errI } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('*')
    .eq('evolution_instance', input.evolutionInstance)
    .single();
  if (errI || !inst) {
    console.log(JSON.stringify({ level: 'warn', msg: 'wa_unknown_instance', evolution_instance: input.evolutionInstance }));
    return { replied: false };
  }

  const tenantId = inst.tenant_id as string;
  const cleanNumber = evo.jidToNumber(input.remoteJid);
  // Pra LIDs (Linked Identity), Evolution exige o JID completo no envio.
  // Pra números convencionais, basta o número stripado.
  const sendTarget = input.remoteJid.endsWith('@lid') ? input.remoteJid : cleanNumber;

  // 2. Tenta vincular a um prospecting_lead existente (mesmo número, mesmo tenant)
  const { data: lead } = await supabaseAdmin
    .from('prospecting_leads')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('whatsapp_number', cleanNumber)
    .maybeSingle();

  // 3. Acha ou cria conversa. Estratégias de match em ordem:
  //    a) Match exato por remote_jid
  //    b) Match por remoteJidAlt (vem do webhook quando remoteJid é @lid — vincula
  //       sem ambiguidade ao JID público @s.whatsapp.net usado no qualify)
  //    c) Match por alt_jid (LID salvo de associação anterior)
  //    d) Match por número limpo (cobre "9 a mais" do BR)
  let { data: conv } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('*')
    .eq('instance_id', inst.id)
    .eq('remote_jid', input.remoteJid)
    .maybeSingle();

  // (b) Match por remoteJidAlt — sinal mais forte que temos
  if (!conv && input.remoteJidAlt) {
    const { data: byAlt } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('*')
      .eq('instance_id', inst.id)
      .eq('remote_jid', input.remoteJidAlt)
      .maybeSingle();
    if (byAlt) {
      conv = byAlt;
      // Salva o LID em alt_jid pra próximas mensagens baterem direto pelo (b'=)
      // (match exato por remote_jid não vai funcionar pq o conv tem @s.whatsapp.net
      // e a próxima msg vai chegar de novo com @lid).
      if (!conv.alt_jid) {
        await supabaseAdmin
          .from('whatsapp_conversations')
          .update({ alt_jid: input.remoteJid })
          .eq('id', conv.id);
        conv.alt_jid = input.remoteJid;
      }
      console.log(JSON.stringify({
        level: 'info', msg: 'wa_conv_matched_by_alt',
        conversation_id: conv.id, primary: conv.remote_jid, lid: input.remoteJid,
      }));
    }
  }

  // (b'=) alt_jid salvo previamente
  if (!conv) {
    const { data: byAltCol } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('*')
      .eq('instance_id', inst.id)
      .eq('alt_jid', input.remoteJid)
      .maybeSingle();
    if (byAltCol) conv = byAltCol;
  }

  // (d) Match por número limpo (cobre "9 a mais" do BR mobile)
  if (!conv) {
    const { data: candidates } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('*')
      .eq('instance_id', inst.id)
      .order('last_message_at', { ascending: false })
      .limit(50);
    const match = (candidates || []).find((c: any) => {
      const candClean = evo.jidToNumber(c.remote_jid);
      return candClean === cleanNumber
        || (candClean.length >= 10 && cleanNumber.length >= 10
            && (candClean.endsWith(cleanNumber) || cleanNumber.endsWith(candClean)));
    });
    if (match) {
      conv = match;
      console.log(JSON.stringify({
        level: 'info', msg: 'wa_conv_matched_by_number',
        conversation_id: conv.id, original_jid: conv.remote_jid, incoming_jid: input.remoteJid,
      }));
    }
  }

  if (!conv) {
    // Pra grupos, tenta buscar o nome real do grupo no Evolution (subject).
    // Display_name fica como nome do grupo; em contato direto, displayName é o pushName.
    let groupSubject: string | null = null;
    let convDisplayName = input.displayName || null;
    if (input.isGroup) {
      const groupInfo = await evo.getGroupInfo(inst.evolution_instance, input.remoteJid);
      if (groupInfo?.subject) {
        groupSubject = groupInfo.subject;
        convDisplayName = groupInfo.subject; // exibe nome do grupo na lista
      }
    }
    const ins = await supabaseAdmin
      .from('whatsapp_conversations')
      .insert({
        tenant_id: tenantId,
        instance_id: inst.id,
        prospecting_lead_id: lead?.id || null,
        remote_jid: input.remoteJid,
        display_name: convDisplayName,
        group_subject: groupSubject,
        is_group: !!input.isGroup,
      })
      .select('*')
      .single();
    if (ins.error) throw new AppError(ins.error.message, { status: 500 });
    conv = ins.data;
  }

  // 4. Salva mensagem inbound (com sender info em grupos)
  await supabaseAdmin.from('whatsapp_messages').insert({
    conversation_id: conv.id,
    direction: 'inbound',
    source: 'user',
    content: input.text,
    evolution_message_id: input.evolutionMessageId || null,
    sender_jid: input.senderJid || null,
    sender_name: input.senderName || null,
  });

  await supabaseAdmin
    .from('whatsapp_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: input.text.slice(0, 200),
      message_count: (conv.message_count || 0) + 1,
    })
    .eq('id', conv.id);

  // 4.5 Fake call: dispara chamada perdida pra chamar atenção (só contatos, não grupos,
  // e rate-limited 5min por conversa pra não ficar invasivo). Best-effort: erros são silenciosos.
  if (!input.isGroup && !conv.is_group) {
    const { data: promptRow } = await supabaseAdmin
      .from('whatsapp_prompts')
      .select('fake_call_enabled')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    const fakeCallOn = !!(promptRow as any)?.fake_call_enabled;
    if (fakeCallOn) {
      const lastCall = (conv as any).last_fake_call_at ? new Date((conv as any).last_fake_call_at) : null;
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (!lastCall || lastCall < fiveMinAgo) {
        evo.fakeCall(inst.evolution_instance, sendTarget).then((r) => {
          if (r.ok) {
            supabaseAdmin
              .from('whatsapp_conversations')
              .update({ last_fake_call_at: new Date().toISOString() })
              .eq('id', conv.id)
              .then(() => {});
          }
        }).catch(() => {});
      }
    }
  }

  // 5. Se IA pausada, conversa encerrada, ou é grupo → não responde automaticamente
  if (conv.ai_paused || conv.is_group || input.isGroup || ['transferred', 'rejected', 'human_takeover'].includes(conv.status)) {
    return { replied: false };
  }

  // 6. Pega config da IA do tenant
  const { data: promptRow } = await supabaseAdmin
    .from('whatsapp_prompts')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const prompt = (promptRow as WhatsAppPrompt) || { ...DEFAULT_PROMPT, tenant_id: tenantId, updated_at: '' };

  if (!prompt.ai_enabled) {
    return { replied: false };
  }

  // 7. Carrega histórico recente pra dar contexto ao Gemini (até 20 últimas turns)
  const { data: history } = await supabaseAdmin
    .from('whatsapp_messages')
    .select('direction,source,content,created_at')
    .eq('conversation_id', conv.id)
    .order('created_at', { ascending: true })
    .limit(40);

  const turns: ChatTurn[] = [];
  for (const m of (history || [])) {
    // Pula a mensagem que acabamos de inserir — ela vai entrar como `userMessage`
    if (m.content === input.text && m.direction === 'inbound') continue;
    turns.push({
      role: m.direction === 'inbound' ? 'user' : 'model',
      text: m.content,
    });
  }

  // 8. Roda Gemini
  let qualifier;
  try {
    qualifier = await runQualifier({
      systemPrompt: prompt.system_prompt,
      qualificationCriteria: prompt.qualification_criteria,
      history: turns,
      userMessage: input.text,
    });
  } catch (err: any) {
    console.log(JSON.stringify({ level: 'error', msg: 'gemini_failed', err: err?.message }));
    return { replied: false };
  }

  // 9. Envia resposta humanizada — em áudio se o lead enviou áudio E o toggle voice_reply_enabled está ON
  try {
    let sentMessageId: string | null = null;
    let sentAsAudio = false;
    if (input.wasAudio && prompt.voice_reply_enabled) {
      const audio = await synthesizeSpeech(qualifier.reply);
      if (audio?.base64) {
        try {
          const sent = await evo.sendAudio(inst.evolution_instance, sendTarget, audio.base64);
          sentMessageId = sent?.key?.id || null;
          sentAsAudio = true;
        } catch (audioErr: any) {
          console.log(JSON.stringify({
            level: 'warn', msg: 'wa_audio_send_failed_fallback_text', err: audioErr?.message,
          }));
          // Fallback: manda texto se áudio falhar
        }
      }
    }
    if (!sentAsAudio) {
      const sent = await evo.sendText(inst.evolution_instance, sendTarget, qualifier.reply);
      sentMessageId = sent?.key?.id || null;
    }
    await supabaseAdmin.from('whatsapp_messages').insert({
      conversation_id: conv.id,
      direction: 'outbound',
      source: 'ai',
      content: sentAsAudio ? `🔊 (áudio) ${qualifier.reply}` : qualifier.reply,
      evolution_message_id: sentMessageId,
      metadata: { format: sentAsAudio ? 'audio' : 'text' },
    });
  } catch (err: any) {
    console.log(JSON.stringify({
      level: 'error', msg: 'wa_send_failed',
      err: err?.message,
      number: cleanNumber,
      instance: inst.evolution_instance,
      details: err?.data ? JSON.stringify(err.data).slice(0, 500) : null,
    }));
    // Salva como mensagem system pra mostrar na UI que houve tentativa
    await supabaseAdmin.from('whatsapp_messages').insert({
      conversation_id: conv.id,
      direction: 'outbound',
      source: 'system',
      content: `[Falha ao enviar resposta da IA: ${err?.message || 'erro'}]`,
      metadata: { error: true },
    });
    return { replied: false };
  }

  // 10. Atualiza status conforme decisão
  if (qualifier.decision === 'qualified') {
    await supabaseAdmin
      .from('whatsapp_conversations')
      .update({
        status: 'qualified',
        qualification_summary: qualifier.summary || null,
        qualified_at: new Date().toISOString(),
      })
      .eq('id', conv.id);
  } else if (qualifier.decision === 'rejected') {
    await supabaseAdmin
      .from('whatsapp_conversations')
      .update({
        status: 'rejected',
        qualification_summary: qualifier.summary || null,
      })
      .eq('id', conv.id);
  }

  return { replied: true, decision: qualifier.decision };
}
