'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/lib/api';
import { Kicker } from '@/components/ui';
import { useDialog } from '@/components/Dialog';

type Instance = {
  id: string;
  name: string;
  evolution_instance: string;
  status: 'pending' | 'qr' | 'connecting' | 'connected' | 'disconnected' | 'failed';
  phone_number: string | null;
  qr_code: string | null;
  created_at: string;
};
type Conversation = {
  id: string;
  remote_jid: string;
  display_name: string | null;
  group_subject: string | null;
  status: 'qualifying' | 'qualified' | 'rejected' | 'transferred' | 'paused' | 'human_takeover';
  ai_paused: boolean;
  is_group: boolean;
  last_message_at: string;
  last_message_preview: string | null;
  message_count: number;
};
type Prompt = {
  system_prompt: string;
  qualification_criteria: string;
  initial_message: string;
  transfer_message: string;
  ai_enabled: boolean;
  fake_call_enabled: boolean;
  voice_reply_enabled: boolean;
};
type Tab = 'instances' | 'chat' | 'prompt';

export function AiAttendanceClient() {
  const [tab, setTab] = useState<Tab>('instances');

  async function lock() {
    try {
      await apiFetch('/api/auth/ai-unlock', { method: 'DELETE' });
    } catch {}
    window.location.reload();
  }

  return (
    <main className="container-edge py-8">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div>
          <Kicker>MÓDULO RESTRITO · destravado</Kicker>
          <h1 className="mt-2 text-3xl font-semibold tracking-tightest">IA de Atendimento</h1>
          <p className="mt-1 text-sm text-fg-muted">
            WhatsApp + IA conversacional. Tudo do seu cliente, com isolamento de tenant.
          </p>
        </div>
        <button type="button" onClick={lock} className="btn btn-ghost !text-xs !py-2">
          🔒 Travar de novo
        </button>
      </div>

      <div className="flex items-center gap-1 border-b border-line overflow-x-auto mb-6">
        <TabBtn active={tab === 'instances'} onClick={() => setTab('instances')}>📱 Conexões</TabBtn>
        <TabBtn active={tab === 'chat'} onClick={() => setTab('chat')}>💬 Conversas</TabBtn>
        <TabBtn active={tab === 'prompt'} onClick={() => setTab('prompt')}>🤖 IA</TabBtn>
      </div>

      <AnimatePresence mode="wait">
        {tab === 'instances' && <motion.div key="i" {...fade}><InstancesTab /></motion.div>}
        {tab === 'chat' && <motion.div key="c" {...fade}><ChatTab /></motion.div>}
        {tab === 'prompt' && <motion.div key="p" {...fade}><PromptTab /></motion.div>}
      </AnimatePresence>
    </main>
  );
}

const fade = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.2 },
};

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-4 py-2.5 text-sm rounded-t-md transition-colors shrink-0 ${
        active ? 'text-fg bg-white/[0.04]' : 'text-fg-muted hover:text-fg'
      }`}
    >
      {children}
      {active && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-gradient-to-r from-brand/40 via-brand to-brand/40 rounded-full" />}
    </button>
  );
}

/* ============================================================
   INSTÂNCIAS WhatsApp (mesma lógica que admin/whatsapp, sem seletor de cliente)
   ============================================================ */

function InstancesTab() {
  const { confirm, notify } = useDialog();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [qr, setQr] = useState<Instance | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = await apiFetch<{ data: { instances: Instance[] } }>('/api/ai-attendance/instances');
      setInstances(r.data.instances);
    } catch (e: any) {
      setErr(e?.message || 'Falha ao listar.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, []);

  async function onCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setErr(null);
    try {
      const r = await apiFetch<{ data: { instance: Instance } }>('/api/ai-attendance/instances', {
        method: 'POST',
        body: { name: newName.trim() },
      });
      setNewName('');
      await refresh();
      setTimeout(() => openQR(r.data.instance), 500);
    } catch (e: any) {
      setErr(e?.message || 'Falha ao criar conexão.');
    } finally {
      setCreating(false);
    }
  }

  async function openQR(inst: Instance) {
    setQr(inst);
    setQrLoading(true);
    try {
      const r = await apiFetch<{ data: { qrcode: string | null } }>(`/api/ai-attendance/instances/${inst.id}/qr`);
      setQr((cur) => cur ? { ...cur, qr_code: r.data.qrcode } : null);
    } catch (e: any) {
      setErr(e?.message || 'Falha ao buscar QR.');
    } finally {
      setQrLoading(false);
    }
  }

  async function onDelete(inst: Instance) {
    const ok = await confirm({
      title: `Excluir conexão "${inst.name}"?`,
      message: 'Desconecta do WhatsApp e remove a instância do servidor. As conversas já capturadas ficam no banco. IRREVERSÍVEL.',
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/ai-attendance/instances/${inst.id}`, { method: 'DELETE' });
      notify('Conexão excluída', 'success');
      await refresh();
    } catch (e: any) {
      notify(`Falha: ${e?.message || 'erro'}`, 'danger');
    }
  }

  return (
    <div className="space-y-4">
      <section className="glass-static p-5 lg:p-6">
        <Kicker>NOVA CONEXÃO</Kicker>
        <p className="mt-2 text-sm text-fg-muted">
          Crie e escaneie o QR no celular pra conectar seu WhatsApp.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            className="input !text-base flex-1 min-w-[260px]"
            placeholder="Nome (ex: WhatsApp Vendas)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={creating}
            onKeyDown={(e) => e.key === 'Enter' && onCreate()}
          />
          <button
            type="button"
            onClick={onCreate}
            disabled={creating || !newName.trim()}
            className="btn btn-primary disabled:opacity-50"
          >
            {creating ? 'Criando…' : '+ Criar conexão'}
          </button>
        </div>
      </section>

      {err && (
        <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(255,99,99,0.08)', border: '1px solid rgba(255,99,99,0.30)', color: '#FF8B8B' }}>
          {err}
        </div>
      )}

      {loading && instances.length === 0 ? (
        <div className="glass-static p-12 text-center text-sm text-fg-muted">Carregando…</div>
      ) : instances.length === 0 ? (
        <div className="glass-static p-12 text-center text-sm text-fg-muted">
          Nenhuma conexão ainda. Cria uma acima.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {instances.map((inst) => (
            <div key={inst.id} className="glass-static p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-lg truncate">{inst.name}</div>
                  <div className="text-xs text-fg-dim font-mono mt-0.5 truncate">{inst.evolution_instance}</div>
                </div>
                <StatusBadge status={inst.status} />
              </div>
              {inst.phone_number && (
                <div className="mt-3 text-xs text-fg-muted">
                  Número: <code className="text-brand">+{inst.phone_number}</code>
                </div>
              )}
              <div className="mt-4 flex gap-2 flex-wrap">
                {inst.status !== 'connected' && (
                  <button type="button" onClick={() => openQR(inst)} className="btn btn-ghost !text-xs !py-1.5">
                    📱 Mostrar QR
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(inst)}
                  className="btn !text-xs !py-1.5"
                  style={{ background: 'rgba(255,99,99,0.10)', color: '#FF6363', border: '1px solid rgba(255,99,99,0.35)' }}
                >
                  🗑 Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {qr && (
        <QRModal instance={qr} loading={qrLoading} onClose={() => setQr(null)} onRefresh={() => openQR(qr)} />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Instance['status'] }) {
  const map: Record<Instance['status'], { label: string; cls: string }> = {
    pending:      { label: 'pendente',     cls: 'badge-warn' },
    qr:           { label: 'aguardando QR', cls: 'badge-warn badge-dot' },
    connecting:   { label: 'conectando',   cls: 'badge-warn badge-dot' },
    connected:    { label: 'conectado',    cls: 'badge-success badge-dot' },
    disconnected: { label: 'desconectado', cls: 'badge-danger badge-dot' },
    failed:       { label: 'falha',        cls: 'badge-danger badge-dot' },
  };
  const m = map[status];
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}

function QRModal({ instance, loading, onClose, onRefresh }: {
  instance: Instance; loading: boolean; onClose: () => void; onRefresh: () => void;
}) {
  useEffect(() => {
    if (instance.status === 'connected') setTimeout(onClose, 1500);
  }, [instance.status, onClose]);
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-md w-full p-6 rounded-xl"
        style={{ background: '#0B1314', border: '1px solid rgba(16,242,160,0.25)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <Kicker>ESCANEAR QR</Kicker>
          <button type="button" onClick={onClose} className="text-fg-muted hover:text-fg">✕</button>
        </div>
        <p className="text-sm text-fg-muted mb-4">
          Abre <strong>WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho</strong>:
        </p>
        <div className="aspect-square w-full bg-white rounded-lg p-4 flex items-center justify-center">
          {loading || !instance.qr_code ? (
            <div className="text-fg-dim text-sm">{loading ? 'Carregando QR…' : 'Aguardando QR…'}</div>
          ) : (
            <img src={instance.qr_code} alt="QR" className="w-full h-full object-contain" />
          )}
        </div>
        <div className="mt-4 flex gap-2 justify-between">
          <span className="text-xs text-fg-dim self-center">Status: <StatusBadge status={instance.status} /></span>
          <button type="button" onClick={onRefresh} className="btn btn-ghost !text-xs !py-1.5">Atualizar QR</button>
        </div>
        {instance.status === 'connected' && (
          <div className="mt-3 text-center text-sm text-emerald">✓ Conectado! Fechando…</div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   CHAT (todas conversas incluindo grupos, polling 3s)
   ============================================================ */

function ChatTab() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  async function refresh() {
    try {
      const r = await apiFetch<{ data: { conversations: Conversation[] } }>('/api/ai-attendance/conversations');
      setConvs(r.data.conversations);
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, []);

  const { contacts, groups } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filterFn = (c: Conversation) => {
      if (!q) return true;
      const name = (c.group_subject || c.display_name || c.remote_jid.replace(/@.*/, '')).toLowerCase();
      return name.includes(q) || c.remote_jid.toLowerCase().includes(q);
    };
    return {
      contacts: convs.filter((c) => !c.is_group).filter(filterFn),
      groups: convs.filter((c) => c.is_group).filter(filterFn),
    };
  }, [convs, search]);

  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-4">
      <div className="space-y-3">
        <div className="glass-static p-3">
          <input
            type="text"
            className="input !text-sm !py-1.5"
            placeholder="🔎 Procurar contato ou grupo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Seção Contatos */}
        <div className="glass-static overflow-hidden">
          <div className="px-4 py-2 flex items-center justify-between border-b border-line/40 bg-white/[0.02]">
            <span className="text-[11px] uppercase tracking-widest font-mono text-fg-dim">💬 Contatos</span>
            <span className="text-[10px] font-mono tabular text-fg-dim">{contacts.length}</span>
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {loading && contacts.length === 0 ? (
              <div className="p-6 text-center text-xs text-fg-muted">Carregando…</div>
            ) : contacts.length === 0 ? (
              <div className="p-6 text-center text-xs text-fg-muted">Sem contatos individuais.</div>
            ) : (
              contacts.map((c) => <ConvRow key={c.id} c={c} selected={selected?.id === c.id} onClick={() => setSelected(c)} />)
            )}
          </div>
        </div>

        {/* Seção Grupos */}
        <div className="glass-static overflow-hidden">
          <div className="px-4 py-2 flex items-center justify-between border-b border-line/40 bg-white/[0.02]">
            <span className="text-[11px] uppercase tracking-widest font-mono text-fg-dim">👥 Grupos</span>
            <span className="text-[10px] font-mono tabular text-fg-dim">{groups.length}</span>
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {loading && groups.length === 0 ? (
              <div className="p-6 text-center text-xs text-fg-muted">Carregando…</div>
            ) : groups.length === 0 ? (
              <div className="p-6 text-center text-xs text-fg-muted">Sem grupos.</div>
            ) : (
              groups.map((c) => <ConvRow key={c.id} c={c} selected={selected?.id === c.id} onClick={() => setSelected(c)} />)
            )}
          </div>
        </div>
      </div>

      <div>
        {selected ? (
          <ChatViewer
            key={selected.id}
            conversation={selected}
            onChanged={refresh}
            onDeleted={() => setSelected(null)}
          />
        ) : (
          <div className="glass-static p-12 text-center text-sm text-fg-muted h-full flex items-center justify-center">
            Selecione uma conversa pra ver e responder mensagens.
          </div>
        )}
      </div>
    </div>
  );
}

function ConvRow({ c, selected, onClick }: { c: Conversation; selected: boolean; onClick: () => void }) {
  const title = c.group_subject || c.display_name || c.remote_jid.replace(/@.*/, '');
  const aiOff = c.ai_paused || ['rejected', 'transferred', 'human_takeover'].includes(c.status);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-line/40 hover:bg-white/[0.04] transition-colors ${
        selected ? 'bg-brand/10' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium truncate flex items-center gap-1.5">
          {c.is_group && <span className="text-[10px]">👥</span>}
          <span className="truncate">{title}</span>
        </div>
        {!c.is_group && (
          aiOff
            ? <span className="text-[9px] font-mono text-fg-dim">IA OFF</span>
            : <span className="text-[9px] font-mono text-emerald">IA ON</span>
        )}
      </div>
      <div className="text-xs text-fg-muted truncate mt-1">{c.last_message_preview || '—'}</div>
      <div className="text-[10px] text-fg-dim font-mono mt-1">
        {new Date(c.last_message_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        {' · '}{c.message_count} msg
      </div>
    </button>
  );
}

const AUTO_PAUSE_STATUSES = ['rejected', 'transferred', 'human_takeover'];

function ChatViewer({ conversation, onChanged, onDeleted }: { conversation: Conversation; onChanged: () => void; onDeleted?: () => void }) {
  const { notify, confirm } = useDialog();
  const [messages, setMessages] = useState<Array<{ id: string; direction: string; source: string; content: string; created_at: string; sender_name?: string | null; sender_jid?: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // IA está "off" se foi pausada manualmente OU se a conversa virou rejected/transferred/human_takeover
  const aiOff = conversation.ai_paused || AUTO_PAUSE_STATUSES.includes(conversation.status);
  const statusLabel: Record<string, string> = {
    qualifying: 'Em qualificação',
    qualified: 'Qualificado',
    rejected: 'Rejeitado pela IA',
    transferred: 'Transferido',
    paused: 'Pausado',
    human_takeover: 'Atendimento humano',
  };

  async function refresh() {
    try {
      const r = await apiFetch<{ data: { messages: any[] } }>(`/api/ai-attendance/conversations/${conversation.id}/messages`);
      setMessages(r.data.messages);
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => { refresh(); }, [conversation.id]);
  useEffect(() => {
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [conversation.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await apiFetch(`/api/ai-attendance/conversations/${conversation.id}/send`, {
        method: 'POST',
        body: { text },
      });
      setDraft('');
      await refresh();
      onChanged();
    } catch (e: any) {
      notify(`Falha ao enviar: ${e?.message || 'erro'}`, 'danger');
    } finally {
      setSending(false);
    }
  }

  async function toggleAi() {
    // Quando IA está off (pausada OU status final), o clique tem que REATIVAR:
    // - ai_paused=false E status volta pra 'qualifying' (backend já faz isso ao mandar ai_paused=false)
    const newPaused = !aiOff;
    try {
      await apiFetch(`/api/ai-attendance/conversations/${conversation.id}`, {
        method: 'PATCH',
        body: { ai_paused: newPaused },
      });
      onChanged();
    } catch (e: any) {
      notify(`Falha: ${e?.message || 'erro'}`, 'danger');
    }
  }

  async function deleteConv() {
    const label = conversation.group_subject || conversation.display_name || conversation.remote_jid.replace(/@.*/, '');
    const ok = await confirm({
      title: `Excluir conversa com "${label}"?`,
      message:
        'Remove a conversa e TODAS as mensagens do banco. Não apaga as mensagens no WhatsApp do destinatário. Você pode iniciar uma nova conversa depois (começa do zero). Essa ação é IRREVERSÍVEL.',
      confirmLabel: 'Excluir conversa',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/ai-attendance/conversations/${conversation.id}`, { method: 'DELETE' });
      notify('Conversa excluída', 'success');
      onDeleted?.();
      onChanged();
    } catch (e: any) {
      notify(`Falha ao excluir: ${e?.message || 'erro'}`, 'danger');
    }
  }

  return (
    <div className="glass-static overflow-hidden flex flex-col h-[680px]">
      <div className="px-5 py-3 border-b border-line flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold truncate flex items-center gap-2">
            {conversation.is_group && <span>👥</span>}
            {conversation.group_subject || conversation.display_name || conversation.remote_jid.replace(/@.*/, '')}
          </div>
          <div className="text-xs text-fg-dim font-mono mt-0.5 truncate">{conversation.remote_jid}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!conversation.is_group && (
            <>
              <span className="text-[10px] font-mono uppercase tracking-wider"
                style={{ color: aiOff ? '#FFC857' : '#10F2A0' }}
                title={statusLabel[conversation.status] || conversation.status}>
                {statusLabel[conversation.status] || conversation.status} · IA {aiOff ? 'OFF' : 'ON'}
              </span>
              <button type="button" onClick={toggleAi} className="btn btn-ghost !text-xs !py-1.5">
                {aiOff ? '▶ Reativar IA' : '⏸ Pausar IA'}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={deleteConv}
            className="btn !text-xs !py-1.5"
            style={{
              background: 'rgba(255, 99, 99, 0.10)',
              color: '#FF6363',
              border: '1px solid rgba(255, 99, 99, 0.35)',
            }}
            title="Excluir conversa (irreversível)"
          >
            🗑 Excluir
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
        {loading && messages.length === 0 ? (
          <div className="text-center text-sm text-fg-muted">Carregando…</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-sm text-fg-muted">Sem mensagens ainda.</div>
        ) : (
          messages.map((m) => <Bubble key={m.id} message={m} isGroup={conversation.is_group} />)
        )}
      </div>

      <div className="border-t border-line p-3 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder="Digite uma mensagem… (Enter envia · Shift+Enter quebra linha)"
          rows={2}
          disabled={sending}
          className="input flex-1 resize-none !py-2 !text-sm"
        />
        <button type="button" onClick={send} disabled={sending || !draft.trim()} className="btn btn-primary disabled:opacity-50 !py-2">
          {sending ? '…' : 'Enviar →'}
        </button>
      </div>
    </div>
  );
}

function Bubble({ message, isGroup }: { message: any; isGroup?: boolean }) {
  const isOutbound = message.direction === 'outbound';
  const isAI = message.source === 'ai';
  const isHuman = message.source === 'human';
  // Em grupos, mostra o nome de quem mandou (ou jid em fallback)
  const senderLabel = isGroup && !isOutbound
    ? (message.sender_name || (message.sender_jid ? message.sender_jid.replace(/@.*/, '') : 'contato'))
    : null;
  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[70%]">
        <div className="text-[10px] text-fg-dim mb-1 px-1 font-mono">
          {isOutbound
            ? (isAI ? '🤖 IA' : isHuman ? '👤 humano' : 'sistema')
            : (senderLabel ? `👤 ${senderLabel}` : '📥 contato')}
          {' · '}
          {new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div
          className="rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
          style={isOutbound
            ? { background: 'linear-gradient(180deg, #16855E, #105F44)', color: '#fff' }
            : { background: 'rgba(255,255,255,0.06)', color: '#E8EDED' }}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   PROMPT (config da IA — só funciona em contatos, não grupos)
   ============================================================ */

function PromptTab() {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await apiFetch<{ data: { prompt: Prompt } }>('/api/ai-attendance/prompt');
      setPrompt(r.data.prompt);
    } catch (e: any) { setErr(e?.message || 'Falha ao carregar.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function save() {
    if (!prompt) return;
    setBusy(true); setErr(null); setSaved(false);
    try {
      await apiFetch('/api/ai-attendance/prompt', { method: 'PUT', body: prompt });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) { setErr(e?.message || 'Falha ao salvar.'); }
    finally { setBusy(false); }
  }

  if (loading || !prompt) {
    return <div className="glass-static p-12 text-center text-sm text-fg-muted">Carregando…</div>;
  }

  return (
    <div className="space-y-5">
      <section className="glass-static p-6">
        <Kicker>PERSONALIDADE DA IA</Kicker>
        <p className="mt-2 text-sm text-fg-muted">Como a IA se apresenta e fala. Linguagem natural, tom de voz.</p>
        <textarea
          rows={6}
          className="input mt-3 resize-y leading-relaxed"
          value={prompt.system_prompt}
          onChange={(e) => setPrompt({ ...prompt, system_prompt: e.target.value })}
          placeholder="Ex: Você é o Pedro da equipe…"
        />
      </section>

      <section className="glass-static p-6">
        <Kicker>CRITÉRIOS DE QUALIFICAÇÃO</Kicker>
        <p className="mt-2 text-sm text-fg-muted">Quando o lead deve ser considerado qualificado.</p>
        <textarea
          rows={6}
          className="input mt-3 resize-y leading-relaxed"
          value={prompt.qualification_criteria}
          onChange={(e) => setPrompt({ ...prompt, qualification_criteria: e.target.value })}
          placeholder={'- Tem orçamento\n- Disponível pra reunião'}
        />
      </section>

      <section className="glass-static p-6">
        <Kicker>MENSAGEM INICIAL</Kicker>
        <p className="mt-2 text-sm text-fg-muted">
          Variáveis: <code className="text-brand">{'{nicho}'}</code> · <code className="text-brand">{'{cidade}'}</code> · <code className="text-brand">{'{nome}'}</code>.
        </p>
        <textarea
          rows={3}
          className="input mt-3 resize-y leading-relaxed"
          value={prompt.initial_message}
          onChange={(e) => setPrompt({ ...prompt, initial_message: e.target.value })}
        />
      </section>

      <section className="glass-static p-6">
        <Kicker>MENSAGEM DE TRANSFERÊNCIA</Kicker>
        <p className="mt-2 text-sm text-fg-muted">Quando a IA marca o lead como qualificado.</p>
        <textarea
          rows={3}
          className="input mt-3 resize-y leading-relaxed"
          value={prompt.transfer_message}
          onChange={(e) => setPrompt({ ...prompt, transfer_message: e.target.value })}
        />
      </section>

      <section className="glass-static p-5 space-y-3">
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={prompt.ai_enabled}
            onChange={(e) => setPrompt({ ...prompt, ai_enabled: e.target.checked })}
          />
          <span>IA ativa (responde mensagens automaticamente — exceto grupos)</span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={prompt.fake_call_enabled}
            onChange={(e) => setPrompt({ ...prompt, fake_call_enabled: e.target.checked })}
          />
          <div>
            <div>📞 Disparar chamada perdida quando lead mandar mensagem</div>
            <div className="text-[11px] text-fg-muted mt-0.5">
              Toca o ringtone do WhatsApp do lead pra chamar atenção. Limitado a 1 chamada a cada 5 min por contato. Apenas em conversas individuais (não grupos).
            </div>
          </div>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={prompt.voice_reply_enabled}
            onChange={(e) => setPrompt({ ...prompt, voice_reply_enabled: e.target.checked })}
          />
          <div>
            <div>🎤 Responder em áudio quando lead mandar áudio</div>
            <div className="text-[11px] text-fg-muted mt-0.5">
              IA usa voz brasileira natural (Gemini TTS) pra responder com voice note quando o lead enviar áudio. Quando desligado, sempre responde texto.
            </div>
          </div>
        </label>
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-line/40">
          {saved && <span className="text-xs text-emerald">✓ Salvo</span>}
          <button type="button" onClick={save} disabled={busy} className="btn btn-primary disabled:opacity-50">
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </section>

      {err && (
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,99,99,0.08)', border: '1px solid rgba(255,99,99,0.30)', color: '#FF8B8B' }}>
          {err}
        </div>
      )}
    </div>
  );
}
