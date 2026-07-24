'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/lib/api';
import { Kicker } from '@/components/ui';

const fade = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 }, transition: { duration: 0.2 } };

type Tab = 'overview' | 'sequences' | 'queue';

type FollowupStep = {
  day: number;
  type: 'text' | 'audio' | 'sticker' | 'fake_call';
  template: string;
  media_url?: string;
};

type Sequence = {
  id: string;
  name: string;
  niche: string;
  is_active: boolean;
  inactivity_hours: number;
  send_window_start: string;
  send_window_end: string;
  steps: FollowupStep[];
  created_at: string;
};

type QueueItem = {
  id: string;
  current_step: number;
  status: string;
  next_action_at: string;
  conversation?: { id: string; remote_jid: string; display_name: string | null; last_message_at: string };
  sequence?: { id: string; name: string; niche: string; steps: FollowupStep[] };
};

type Stats = {
  active_in_queue: number;
  total_sent: number;
  total_responded: number;
  response_rate: number;
};

const STEP_TYPE_LABELS: Record<string, string> = {
  text: 'Texto',
  audio: 'Áudio',
  sticker: 'Figurinha + Texto',
  fake_call: 'Ligação + Texto',
};

const STEP_TYPE_ICONS: Record<string, string> = {
  text: '💬',
  audio: '🎤',
  sticker: '🎨',
  fake_call: '📞',
};

export function FollowupClient() {
  const [tab, setTab] = useState<Tab>('overview');
  const [enabled, setEnabled] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/followup/toggle')
      .then((r) => setEnabled(r.data?.enabled ?? false))
      .finally(() => setLoading(false));
  }, []);

  async function toggleFollowup() {
    setToggling(true);
    try {
      const r = await apiFetch('/api/followup/toggle', {
        method: 'PUT',
        body: { enabled: !enabled },
      });
      setEnabled(r.data?.enabled ?? !enabled);
    } catch {}
    setToggling(false);
  }

  if (loading) {
    return (
      <main className="container-edge py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-white/[0.06] rounded" />
          <div className="h-4 w-96 bg-white/[0.06] rounded" />
          <div className="grid grid-cols-3 gap-4 mt-6">
            {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-white/[0.06] rounded-xl" />)}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="container-edge py-8">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div>
          <Kicker>FOLLOW-UP INTELIGENTE</Kicker>
          <h1 className="mt-2 text-3xl font-semibold tracking-tightest">IA de Follow-up</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Reengajamento automático de leads que pararam de responder.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleFollowup}
          disabled={toggling}
          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${enabled ? 'bg-brand' : 'bg-white/[0.15]'}`}
        >
          <span className={`pointer-events-none inline-block h-[22px] w-[22px] rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {!enabled && (
        <div className="glass-static p-6 text-center mb-6">
          <p className="text-fg-muted text-sm">
            O follow-up está <strong className="text-fg">desativado</strong>. Ative o toggle acima para começar a reengajar leads automaticamente.
          </p>
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-line overflow-x-auto mb-6">
        <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')}>Visão geral</TabBtn>
        <TabBtn active={tab === 'sequences'} onClick={() => setTab('sequences')}>Sequências</TabBtn>
        <TabBtn active={tab === 'queue'} onClick={() => setTab('queue')}>Fila</TabBtn>
      </div>

      <AnimatePresence mode="wait">
        {tab === 'overview' && <motion.div key="o" {...fade}><OverviewTab enabled={enabled} /></motion.div>}
        {tab === 'sequences' && <motion.div key="s" {...fade}><SequencesTab /></motion.div>}
        {tab === 'queue' && <motion.div key="q" {...fade}><QueueTab /></motion.div>}
      </AnimatePresence>
    </main>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active ? 'border-brand text-brand' : 'border-transparent text-fg-muted hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}

// =============================================================================
// Overview Tab
// =============================================================================

function OverviewTab({ enabled }: { enabled: boolean }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    apiFetch('/api/followup/stats').then((r) => setStats(r.data?.stats ?? null));
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Na fila" value={stats?.active_in_queue ?? '-'} />
        <StatCard label="Msgs enviadas" value={stats?.total_sent ?? '-'} />
        <StatCard label="Responderam" value={stats?.total_responded ?? '-'} />
        <StatCard label="Taxa de resposta" value={stats?.response_rate != null ? `${stats.response_rate}%` : '-'} accent />
      </div>

      <div className="glass-static p-6">
        <h3 className="text-sm font-medium mb-3">Como funciona</h3>
        <div className="space-y-3 text-sm text-fg-muted">
          <Step n={1} text="Lead conversa com a IA de pré-atendimento e para de responder" />
          <Step n={2} text={`Após ${enabled ? 'X horas' : 'o tempo configurado'} de inatividade, o lead entra na fila de follow-up`} />
          <Step n={3} text="O cron processa a fila e envia as mensagens da sequência (texto, áudio, figurinha, ligação)" />
          <Step n={4} text="Se o lead responder, o follow-up para e a conversa volta pro fluxo normal da IA" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="glass-static p-4 rounded-xl">
      <div className="text-xs text-fg-muted mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${accent ? 'text-brand' : ''}`}>{value}</div>
    </div>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="shrink-0 h-6 w-6 rounded-full bg-brand/20 text-brand text-xs font-semibold flex items-center justify-center">{n}</span>
      <span>{text}</span>
    </div>
  );
}

// =============================================================================
// Sequences Tab
// =============================================================================

function SequencesTab() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Sequence | null>(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/api/followup/sequences')
      .then((r) => setSequences(r.data?.sequences ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-center text-fg-muted py-8">Carregando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium">Sequências de follow-up</h3>
        <button type="button" onClick={() => setShowNew(true)} className="btn btn-primary !text-xs !py-2">
          + Nova sequência
        </button>
      </div>

      {showNew && (
        <SequenceEditor
          onSave={() => { setShowNew(false); load(); }}
          onCancel={() => setShowNew(false)}
        />
      )}

      {sequences.length === 0 && !showNew && (
        <div className="glass-static p-8 text-center">
          <p className="text-fg-muted text-sm mb-4">Nenhuma sequência criada ainda.</p>
          <button type="button" onClick={() => setShowNew(true)} className="btn btn-primary !text-sm">
            Criar primeira sequência
          </button>
        </div>
      )}

      {sequences.map((seq) => (
        <div key={seq.id}>
          {editing?.id === seq.id ? (
            <SequenceEditor
              initial={seq}
              onSave={() => { setEditing(null); load(); }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <SequenceCard seq={seq} onEdit={() => setEditing(seq)} onDelete={() => {
              if (!confirm('Deletar essa sequência? Follow-ups ativos serão cancelados.')) return;
              apiFetch(`/api/followup/sequences/${seq.id}`, { method: 'DELETE' }).then(load);
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

function SequenceCard({ seq, onEdit, onDelete }: { seq: Sequence; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="glass-static p-5 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h4 className="font-medium">{seq.name}</h4>
          {seq.niche && <span className="badge badge-info !text-[10px]">{seq.niche}</span>}
          <span className={`badge ${seq.is_active ? 'badge-success' : 'badge-danger'} badge-dot !text-[10px]`}>
            {seq.is_active ? 'Ativa' : 'Inativa'}
          </span>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onEdit} className="btn btn-ghost !text-xs !py-1.5">Editar</button>
          <button type="button" onClick={onDelete} className="btn btn-ghost !text-xs !py-1.5 !text-red-400 hover:!text-red-300">Deletar</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-fg-muted mb-3">
        <span>Inatividade: {seq.inactivity_hours}h</span>
        <span>Horário: {seq.send_window_start} - {seq.send_window_end}</span>
        <span>{seq.steps?.length || 0} steps</span>
      </div>
      {seq.steps && seq.steps.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {seq.steps.map((step, i) => (
            <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-line text-xs">
              <span>{STEP_TYPE_ICONS[step.type] || '?'}</span>
              <span className="text-fg-muted">Dia {step.day}</span>
              <span className="text-fg">{STEP_TYPE_LABELS[step.type]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Sequence Editor
// =============================================================================

function SequenceEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Sequence;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [niche, setNiche] = useState(initial?.niche || '');
  const [inactivityHours, setInactivityHours] = useState(initial?.inactivity_hours ?? 24);
  const [windowStart, setWindowStart] = useState(initial?.send_window_start || '09:00');
  const [windowEnd, setWindowEnd] = useState(initial?.send_window_end || '18:00');
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [steps, setSteps] = useState<FollowupStep[]>(initial?.steps || [{ day: 1, type: 'text', template: '' }]);
  const [saving, setSaving] = useState(false);

  function addStep() {
    const lastDay = steps.length > 0 ? steps[steps.length - 1].day : 0;
    setSteps([...steps, { day: lastDay + 2, type: 'text', template: '' }]);
  }

  function removeStep(i: number) {
    setSteps(steps.filter((_, idx) => idx !== i));
  }

  function updateStep(i: number, updates: Partial<FollowupStep>) {
    setSteps(steps.map((s, idx) => idx === i ? { ...s, ...updates } : s));
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (initial) {
        await apiFetch(`/api/followup/sequences/${initial.id}`, {
          method: 'PUT',
          body: { name, niche, inactivity_hours: inactivityHours, send_window_start: windowStart, send_window_end: windowEnd, is_active: isActive, steps },
        });
      } else {
        await apiFetch('/api/followup/sequences', {
          method: 'POST',
          body: { name, niche, inactivity_hours: inactivityHours, send_window_start: windowStart, send_window_end: windowEnd, steps },
        });
      }
      onSave();
    } catch (err: any) {
      alert(err?.message || 'Erro ao salvar');
    }
    setSaving(false);
  }

  return (
    <div className="glass-static p-6 rounded-xl space-y-4">
      <h4 className="text-sm font-medium">{initial ? 'Editar sequência' : 'Nova sequência'}</h4>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="kicker">Nome</span>
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Consórcio padrão" />
        </label>
        <label className="block">
          <span className="kicker">Nicho</span>
          <input className="input mt-1" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Ex: consorcio" />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <label className="block">
          <span className="kicker">Horas de inatividade</span>
          <input type="number" className="input mt-1" value={inactivityHours} onChange={(e) => setInactivityHours(Number(e.target.value))} min={1} />
        </label>
        <label className="block">
          <span className="kicker">Horário início</span>
          <input type="time" className="input mt-1" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
        </label>
        <label className="block">
          <span className="kicker">Horário fim</span>
          <input type="time" className="input mt-1" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
        </label>
      </div>

      {initial && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
          Sequência ativa
        </label>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="kicker">STEPS DA SEQUÊNCIA</span>
          <button type="button" onClick={addStep} className="btn btn-ghost !text-xs !py-1">+ Step</button>
        </div>

        <div className="space-y-3">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] border border-line">
              <div className="shrink-0 h-8 w-8 rounded-full bg-brand/20 text-brand text-xs font-bold flex items-center justify-center mt-1">
                {i + 1}
              </div>
              <div className="flex-1 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[10px] text-fg-muted uppercase">Dia</span>
                    <input type="number" className="input mt-0.5 !text-sm" value={step.day} min={1}
                      onChange={(e) => updateStep(i, { day: Number(e.target.value) })} />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-fg-muted uppercase">Tipo</span>
                    <select className="input mt-0.5 !text-sm" value={step.type}
                      onChange={(e) => updateStep(i, { type: e.target.value as FollowupStep['type'] })}>
                      <option value="text">Texto</option>
                      <option value="audio">Áudio (TTS)</option>
                      <option value="sticker">Figurinha + Texto</option>
                      <option value="fake_call">Ligação + Texto</option>
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="text-[10px] text-fg-muted uppercase">Mensagem</span>
                  <textarea className="input mt-0.5 !text-sm" rows={2} value={step.template}
                    onChange={(e) => updateStep(i, { template: e.target.value })}
                    placeholder={step.type === 'fake_call' ? 'Mensagem enviada após a ligação...' : 'Escreva a mensagem do follow-up...'} />
                </label>
              </div>
              {steps.length > 1 && (
                <button type="button" onClick={() => removeStep(i)} className="shrink-0 text-fg-muted hover:text-red-400 transition-colors mt-1" title="Remover step">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={save} disabled={saving || !name.trim()} className="btn btn-primary !text-sm">
          {saving ? 'Salvando...' : initial ? 'Salvar' : 'Criar sequência'}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost !text-sm">Cancelar</button>
      </div>
    </div>
  );
}

// =============================================================================
// Queue Tab
// =============================================================================

function QueueTab() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('active');

  const load = useCallback(() => {
    setLoading(true);
    apiFetch(`/api/followup/queue?status=${filter}`)
      .then((r) => setQueue(r.data?.queue ?? []))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-sm font-medium">Fila de follow-up</h3>
        <div className="flex gap-1 ml-auto">
          {['active', 'responded', 'completed', 'cancelled'].map((s) => (
            <button key={s} type="button" onClick={() => setFilter(s)}
              className={`px-3 py-1 text-xs rounded-lg transition-colors ${filter === s ? 'bg-brand/20 text-brand' : 'text-fg-muted hover:text-fg'}`}>
              {s === 'active' ? 'Ativos' : s === 'responded' ? 'Responderam' : s === 'completed' ? 'Finalizados' : 'Cancelados'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-fg-muted py-8">Carregando...</div>
      ) : queue.length === 0 ? (
        <div className="glass-static p-8 text-center">
          <p className="text-fg-muted text-sm">Nenhum lead nessa categoria.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {queue.map((item) => (
            <QueueRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueRow({ item }: { item: QueueItem }) {
  const conv = item.conversation;
  const seq = item.sequence;
  const totalSteps = (seq?.steps?.length || 0);
  const displayName = conv?.display_name || conv?.remote_jid?.replace(/@.*/, '') || 'Desconhecido';
  const nextDate = new Date(item.next_action_at);
  const isOverdue = item.status === 'active' && nextDate < new Date();

  return (
    <div className="glass-static p-4 rounded-xl flex items-center gap-4">
      <div className="shrink-0 h-10 w-10 rounded-full bg-white/[0.06] flex items-center justify-center text-lg">
        {item.status === 'responded' ? '✅' : item.status === 'completed' ? '🏁' : item.status === 'cancelled' ? '❌' : '⏳'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{displayName}</span>
          {seq && <span className="text-[10px] text-fg-muted">{seq.name}</span>}
        </div>
        <div className="text-xs text-fg-muted mt-0.5">
          Step {item.current_step + 1}/{totalSteps}
          {item.status === 'active' && (
            <span className={isOverdue ? ' text-amber-400' : ''}>
              {' · '}Próximo: {nextDate.toLocaleDateString('pt-BR')} {nextDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>
      <span className={`badge ${
        item.status === 'active' ? 'badge-info' :
        item.status === 'responded' ? 'badge-success' :
        item.status === 'completed' ? '' :
        'badge-danger'
      } badge-dot !text-[10px]`}>
        {item.status}
      </span>
    </div>
  );
}
