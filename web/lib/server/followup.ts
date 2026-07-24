import { supabaseAdmin } from './supabase-admin';
import { AppError } from './errors';
import type { AuthContext } from './auth';
import * as evo from './evolution';
import { synthesizeSpeech } from './gemini';

function resolveTenant(ctx: AuthContext, requested?: string | null): string {
  if (ctx.profile.role === 'admin') {
    if (!requested) throw new AppError('Admin precisa selecionar um cliente.', { status: 400 });
    return requested;
  }
  if (!ctx.profile.tenant_id) throw new AppError('Usuário sem tenant.', { status: 403 });
  return ctx.profile.tenant_id;
}

// =============================================================================
// Types
// =============================================================================

export type FollowupStepType = 'text' | 'audio' | 'sticker' | 'fake_call';

export type FollowupStep = {
  day: number;
  type: FollowupStepType;
  template: string;
  media_url?: string;
};

export type FollowupSequence = {
  id: string;
  tenant_id: string;
  name: string;
  niche: string;
  is_active: boolean;
  inactivity_hours: number;
  send_window_start: string;
  send_window_end: string;
  steps: FollowupStep[];
  created_at: string;
  updated_at: string;
};

export type FollowupQueueItem = {
  id: string;
  tenant_id: string;
  conversation_id: string;
  sequence_id: string;
  instance_id: string;
  current_step: number;
  status: 'active' | 'paused' | 'completed' | 'responded' | 'cancelled';
  next_action_at: string;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

export type FollowupLog = {
  id: string;
  queue_id: string;
  step_index: number;
  message_type: FollowupStepType;
  content_sent: string | null;
  sent_at: string;
  delivered: boolean;
  responded_at: string | null;
  error: string | null;
};

// =============================================================================
// Sequences CRUD
// =============================================================================

export async function listSequences(
  ctx: AuthContext,
  opts: { tenant_id?: string | null } = {},
): Promise<FollowupSequence[]> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);
  const { data, error } = await supabaseAdmin
    .from('followup_sequences')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) throw new AppError(error.message, { status: 500 });
  return (data || []) as FollowupSequence[];
}

export async function getSequence(
  ctx: AuthContext,
  sequenceId: string,
  opts: { tenant_id?: string | null } = {},
): Promise<FollowupSequence> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);
  const { data, error } = await supabaseAdmin
    .from('followup_sequences')
    .select('*')
    .eq('id', sequenceId)
    .eq('tenant_id', tenantId)
    .single();
  if (error) throw new AppError('Sequência não encontrada.', { status: 404 });
  return data as FollowupSequence;
}

export async function createSequence(
  ctx: AuthContext,
  input: {
    name: string;
    niche?: string;
    inactivity_hours?: number;
    send_window_start?: string;
    send_window_end?: string;
    steps?: FollowupStep[];
    tenant_id?: string | null;
  },
): Promise<FollowupSequence> {
  const tenantId = resolveTenant(ctx, input.tenant_id);
  if (!input.name?.trim()) throw new AppError('Nome obrigatório.', { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('followup_sequences')
    .insert({
      tenant_id: tenantId,
      name: input.name.trim(),
      niche: input.niche || '',
      inactivity_hours: input.inactivity_hours ?? 24,
      send_window_start: input.send_window_start || '09:00',
      send_window_end: input.send_window_end || '18:00',
      steps: input.steps || [],
    })
    .select('*')
    .single();
  if (error) throw new AppError(error.message, { status: 500 });
  return data as FollowupSequence;
}

export async function updateSequence(
  ctx: AuthContext,
  sequenceId: string,
  input: Partial<Omit<FollowupSequence, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>> & { tenant_id?: string | null },
): Promise<FollowupSequence> {
  const tenantId = resolveTenant(ctx, input.tenant_id);
  await getSequence(ctx, sequenceId, { tenant_id: input.tenant_id });

  const updates: Record<string, any> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.niche !== undefined) updates.niche = input.niche;
  if (input.is_active !== undefined) updates.is_active = input.is_active;
  if (input.inactivity_hours !== undefined) updates.inactivity_hours = input.inactivity_hours;
  if (input.send_window_start !== undefined) updates.send_window_start = input.send_window_start;
  if (input.send_window_end !== undefined) updates.send_window_end = input.send_window_end;
  if (input.steps !== undefined) updates.steps = input.steps;

  const { data, error } = await supabaseAdmin
    .from('followup_sequences')
    .update(updates)
    .eq('id', sequenceId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error) throw new AppError(error.message, { status: 500 });
  return data as FollowupSequence;
}

export async function deleteSequence(
  ctx: AuthContext,
  sequenceId: string,
  opts: { tenant_id?: string | null } = {},
): Promise<void> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);
  await getSequence(ctx, sequenceId, opts);

  await supabaseAdmin
    .from('followup_queue')
    .update({ status: 'cancelled' })
    .eq('sequence_id', sequenceId)
    .eq('status', 'active');

  const { error } = await supabaseAdmin
    .from('followup_sequences')
    .delete()
    .eq('id', sequenceId)
    .eq('tenant_id', tenantId);
  if (error) throw new AppError(error.message, { status: 500 });
}

// =============================================================================
// Queue management
// =============================================================================

export async function enqueueConversation(
  tenantId: string,
  conversationId: string,
  instanceId: string,
  sequenceId: string,
): Promise<FollowupQueueItem | null> {
  const { data: existing } = await supabaseAdmin
    .from('followup_queue')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('status', 'active')
    .maybeSingle();
  if (existing) return null;

  const { data: seq } = await supabaseAdmin
    .from('followup_sequences')
    .select('steps, inactivity_hours')
    .eq('id', sequenceId)
    .single();
  if (!seq) return null;

  const steps = (seq.steps as FollowupStep[]) || [];
  if (steps.length === 0) return null;

  const firstStepDay = steps[0]?.day ?? 1;
  const nextAction = new Date(Date.now() + firstStepDay * 24 * 60 * 60 * 1000);

  const { data, error } = await supabaseAdmin
    .from('followup_queue')
    .insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      sequence_id: sequenceId,
      instance_id: instanceId,
      current_step: 0,
      status: 'active',
      next_action_at: nextAction.toISOString(),
    })
    .select('*')
    .single();
  if (error) {
    console.log(JSON.stringify({ level: 'error', msg: 'followup_enqueue_failed', error: error.message }));
    return null;
  }
  return data as FollowupQueueItem;
}

export async function cancelFollowupForConversation(conversationId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from('followup_queue')
    .update({ status: 'responded', completed_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('status', 'active')
    .select('id');
  return data?.length || 0;
}

export async function listQueue(
  ctx: AuthContext,
  opts: { tenant_id?: string | null; status?: string; limit?: number } = {},
): Promise<(FollowupQueueItem & { conversation?: any; sequence?: any })[]> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);
  let q = supabaseAdmin
    .from('followup_queue')
    .select('*, conversation:whatsapp_conversations(id, remote_jid, display_name, last_message_at), sequence:followup_sequences(id, name, niche, steps)')
    .eq('tenant_id', tenantId)
    .order('next_action_at', { ascending: true })
    .limit(opts.limit || 100);
  if (opts.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) throw new AppError(error.message, { status: 500 });
  return (data || []) as any[];
}

// =============================================================================
// Stats
// =============================================================================

export async function getFollowupStats(
  ctx: AuthContext,
  opts: { tenant_id?: string | null } = {},
): Promise<{
  active_in_queue: number;
  total_sent: number;
  total_responded: number;
  response_rate: number;
}> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);

  const { data: queueIds } = await supabaseAdmin
    .from('followup_queue')
    .select('id')
    .eq('tenant_id', tenantId);
  const ids = (queueIds || []).map((q: any) => q.id);

  const [queueRes, logsRes, respondedRes] = await Promise.all([
    supabaseAdmin
      .from('followup_queue')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'active'),
    ids.length > 0
      ? supabaseAdmin
          .from('followup_logs')
          .select('id', { count: 'exact', head: true })
          .in('queue_id', ids)
      : Promise.resolve({ count: 0 }),
    supabaseAdmin
      .from('followup_queue')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'responded'),
  ]);

  const totalSent = (logsRes as any).count || 0;
  const totalResponded = respondedRes.count || 0;

  return {
    active_in_queue: queueRes.count || 0,
    total_sent: totalSent,
    total_responded: totalResponded,
    response_rate: totalSent > 0 ? Math.round((totalResponded / totalSent) * 100) : 0,
  };
}

// =============================================================================
// Toggle follow-up on/off (no whatsapp_prompts)
// =============================================================================

export async function getFollowupEnabled(tenantId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('whatsapp_prompts')
    .select('followup_enabled')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return !!(data as any)?.followup_enabled;
}

export async function setFollowupEnabled(
  ctx: AuthContext,
  enabled: boolean,
  opts: { tenant_id?: string | null } = {},
): Promise<boolean> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);
  await supabaseAdmin
    .from('whatsapp_prompts')
    .upsert({
      tenant_id: tenantId,
      followup_enabled: enabled,
    }, { onConflict: 'tenant_id' });
  return enabled;
}

// =============================================================================
// Cron: processar fila de follow-up
// =============================================================================

export async function processFollowupQueue(): Promise<{
  processed: number;
  sent: number;
  errors: number;
  completed: number;
}> {
  const now = new Date();
  const result = { processed: 0, sent: 0, errors: 0, completed: 0 };

  const { data: items } = await supabaseAdmin
    .from('followup_queue')
    .select('*, sequence:followup_sequences(*), instance:whatsapp_instances(evolution_instance, status), conversation:whatsapp_conversations(remote_jid, ai_paused, status)')
    .eq('status', 'active')
    .lte('next_action_at', now.toISOString())
    .limit(50);

  if (!items || items.length === 0) return result;

  for (const item of items) {
    result.processed++;
    const seq = item.sequence as any as FollowupSequence;
    const inst = item.instance as any;
    const conv = item.conversation as any;

    if (!seq || !inst || !conv) {
      await supabaseAdmin
        .from('followup_queue')
        .update({ status: 'cancelled', completed_at: now.toISOString() })
        .eq('id', item.id);
      result.errors++;
      continue;
    }

    if (inst.status !== 'connected') {
      console.log(JSON.stringify({ level: 'warn', msg: 'followup_skip_disconnected', queue_id: item.id }));
      continue;
    }

    if (conv.ai_paused || conv.status === 'human_takeover') {
      await supabaseAdmin
        .from('followup_queue')
        .update({ status: 'paused' })
        .eq('id', item.id);
      continue;
    }

    const steps = (seq.steps as FollowupStep[]) || [];
    const step = steps[item.current_step];
    if (!step) {
      await supabaseAdmin
        .from('followup_queue')
        .update({ status: 'completed', completed_at: now.toISOString() })
        .eq('id', item.id);
      result.completed++;
      continue;
    }

    const currentHour = now.getUTCHours() - 3;
    const windowStart = parseInt(seq.send_window_start?.split(':')[0] || '9', 10);
    const windowEnd = parseInt(seq.send_window_end?.split(':')[0] || '18', 10);
    const adjustedHour = currentHour < 0 ? currentHour + 24 : currentHour;
    if (adjustedHour < windowStart || adjustedHour >= windowEnd) continue;

    const remoteJid = conv.remote_jid;
    const sendTarget = remoteJid.includes('@') ? remoteJid : remoteJid.replace(/\D/g, '');
    let contentSent = '';
    let sendError: string | null = null;

    try {
      switch (step.type) {
        case 'text': {
          const text = step.template || 'Oi! Tudo bem?';
          await evo.sendText(inst.evolution_instance, sendTarget, text);
          contentSent = text;
          break;
        }
        case 'audio': {
          const audioText = step.template || 'Oi, tudo bem? Passando aqui pra dar um alô!';
          const audio = await synthesizeSpeech(audioText);
          if (audio?.base64) {
            await evo.sendAudio(inst.evolution_instance, sendTarget, audio.base64);
            contentSent = `🔊 ${audioText}`;
          } else {
            await evo.sendText(inst.evolution_instance, sendTarget, audioText);
            contentSent = audioText;
          }
          break;
        }
        case 'sticker': {
          const stickerText = step.template || '';
          if (stickerText) {
            await evo.sendText(inst.evolution_instance, sendTarget, stickerText);
            contentSent = stickerText;
          }
          break;
        }
        case 'fake_call': {
          await evo.fakeCall(inst.evolution_instance, sendTarget, { attempts: 2 });
          if (step.template) {
            await new Promise((r) => setTimeout(r, 3000));
            await evo.sendText(inst.evolution_instance, sendTarget, step.template);
            contentSent = `📞 + ${step.template}`;
          } else {
            contentSent = '📞 Ligação';
          }
          break;
        }
      }
      result.sent++;
    } catch (err: any) {
      sendError = err?.message || 'erro desconhecido';
      result.errors++;
      console.log(JSON.stringify({
        level: 'error', msg: 'followup_send_failed',
        queue_id: item.id, step: item.current_step, err: sendError,
      }));
    }

    await supabaseAdmin.from('followup_logs').insert({
      queue_id: item.id,
      step_index: item.current_step,
      message_type: step.type,
      content_sent: contentSent || null,
      delivered: !sendError,
      error: sendError,
    });

    if (contentSent && !sendError) {
      await supabaseAdmin.from('whatsapp_messages').insert({
        conversation_id: item.conversation_id,
        direction: 'outbound',
        source: 'ai',
        content: contentSent,
        metadata: { followup: true, step_index: item.current_step },
      });
      await supabaseAdmin
        .from('whatsapp_conversations')
        .update({
          last_message_at: now.toISOString(),
          last_message_preview: contentSent.slice(0, 200),
        })
        .eq('id', item.conversation_id);
    }

    const nextStepIndex = item.current_step + 1;
    if (nextStepIndex >= steps.length) {
      await supabaseAdmin
        .from('followup_queue')
        .update({ current_step: nextStepIndex, status: 'completed', completed_at: now.toISOString() })
        .eq('id', item.id);
      result.completed++;
    } else {
      const nextStep = steps[nextStepIndex];
      const daysDiff = (nextStep?.day || 1) - (step.day || 0);
      const nextAction = new Date(now.getTime() + Math.max(daysDiff, 1) * 24 * 60 * 60 * 1000);
      await supabaseAdmin
        .from('followup_queue')
        .update({ current_step: nextStepIndex, next_action_at: nextAction.toISOString() })
        .eq('id', item.id);
    }
  }

  console.log(JSON.stringify({ level: 'info', msg: 'followup_cron_done', ...result }));
  return result;
}

// =============================================================================
// Auto-enqueue: chamado quando detecta inatividade
// =============================================================================

export async function checkAndEnqueueInactive(tenantId: string): Promise<number> {
  const enabled = await getFollowupEnabled(tenantId);
  if (!enabled) return 0;

  const { data: sequences } = await supabaseAdmin
    .from('followup_sequences')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .limit(1);

  const seq = sequences?.[0] as FollowupSequence | undefined;
  if (!seq || !seq.steps || (seq.steps as any[]).length === 0) return 0;

  const cutoff = new Date(Date.now() - seq.inactivity_hours * 60 * 60 * 1000);

  const { data: conversations } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('id, instance_id, last_message_at')
    .eq('tenant_id', tenantId)
    .eq('is_group', false)
    .in('status', ['qualifying', 'paused'])
    .lt('last_message_at', cutoff.toISOString())
    .limit(50);

  if (!conversations || conversations.length === 0) return 0;

  const { data: alreadyQueued } = await supabaseAdmin
    .from('followup_queue')
    .select('conversation_id')
    .eq('tenant_id', tenantId)
    .in('status', ['active', 'paused']);
  const queuedSet = new Set((alreadyQueued || []).map((q: any) => q.conversation_id));

  let enqueued = 0;
  for (const conv of conversations) {
    if (queuedSet.has(conv.id)) continue;
    const result = await enqueueConversation(tenantId, conv.id, conv.instance_id, seq.id);
    if (result) enqueued++;
  }

  if (enqueued > 0) {
    console.log(JSON.stringify({ level: 'info', msg: 'followup_auto_enqueued', tenant_id: tenantId, count: enqueued }));
  }
  return enqueued;
}
