'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/lib/api';
import { Kicker } from '@/components/ui';
import { useDialog } from '@/components/Dialog';

type Tenant = { id: string; name: string; slug: string };
type Instance = {
  id: string;
  name: string;
  evolution_instance: string;
  status: 'pending' | 'qr' | 'connecting' | 'connected' | 'disconnected' | 'failed';
  phone_number: string | null;
  qr_code: string | null;
  last_event_at: string;
  connected_at: string | null;
  created_at: string;
};
type Conversation = {
  id: string;
  remote_jid: string;
  display_name: string | null;
  status: 'qualifying' | 'qualified' | 'rejected' | 'transferred' | 'paused' | 'human_takeover';
  qualification_summary: string | null;
  ai_paused: boolean;
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
};
type Tab = 'instances' | 'conversations' | 'prompt';

export function WhatsAppAdminClient({ tenants }: { tenants: Tenant[] }) {
  const [tenantId, setTenantId] = useState<string>('');
  const [tab, setTab] = useState<Tab>('instances');
  const selected = tenants.find((t) => t.id === tenantId);

  return (
    <div className="space-y-6">
      {/* Cliente selector */}
      <section className="glass-static p-5 lg:p-6">
        <Kicker>CLIENTE ALVO</Kicker>
        <p className="mt-2 text-sm text-fg-muted">
          Cada cliente tem suas próprias conexões de WhatsApp + IA. Selecione pra começar.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            className="input !text-base flex-1 min-w-[260px]"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
          >
            <option value="">— Selecione um cliente —</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>
            ))}
          </select>
          {selected && (
            <span className="badge badge-success">
              Gerenciando <strong className="ml-1">{selected.name}</strong>
            </span>
          )}
        </div>
      </section>

      {!tenantId ? (
        <section className="glass-static p-12 text-center text-sm text-fg-muted">
          Escolha um cliente acima pra continuar.
        </section>
      ) : (
        <div key={tenantId} className="space-y-6">
          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-line overflow-x-auto">
            <TabButton active={tab === 'instances'} onClick={() => setTab('instances')}>
              📱 Conexões
            </TabButton>
            <TabButton active={tab === 'conversations'} onClick={() => setTab('conversations')}>
              💬 Conversas
            </TabButton>
            <TabButton active={tab === 'prompt'} onClick={() => setTab('prompt')}>
              🤖 Prompt da IA
            </TabButton>
          </div>

          <AnimatePresence mode="wait">
            {tab === 'instances' && (
              <motion.div key="instances" {...fadeIn}>
                <InstancesTab tenantId={tenantId} />
              </motion.div>
            )}
            {tab === 'conversations' && (
              <motion.div key="conversations" {...fadeIn}>
                <ConversationsTab tenantId={tenantId} />
              </motion.div>
            )}
            {tab === 'prompt' && (
              <motion.div key="prompt" {...fadeIn}>
                <PromptTab tenantId={tenantId} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

const fadeIn = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.2 },
};

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-4 py-2.5 text-sm font-medium rounded-t-md transition-colors flex items-center gap-2 shrink-0 ${
        active ? 'text-fg bg-white/[0.04]' : 'text-fg-muted hover:text-fg'
      }`}
    >
      {children}
      {active && (
        <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-gradient-to-r from-brand/40 via-brand to-brand/40 rounded-full" />
      )}
    </button>
  );
}

/* ============================================================
   TAB 1 — Instances (conexões)
   ============================================================ */

function InstancesTab({ tenantId }: { tenantId: string }) {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [qrInstance, setQrInstance] = useState<Instance | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm } = useDialog();

  async function refresh() {
    setLoading(true);
    try {
      const r = await apiFetch<{ data: { instances: Instance[] } }>(`/api/whatsapp/instances?tenant_id=${tenantId}`);
      setInstances(r.data.instances);
    } catch (e: any) {
      setError(e?.message || 'Falha ao listar conexões.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [tenantId]);

  // Auto-poll a cada 4s pra atualizar status (conectado/desconectado/QR novo)
  useEffect(() => {
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [tenantId]);

  async function onCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const r = await apiFetch<{ data: { instance: Instance } }>('/api/whatsapp/instances', {
        method: 'POST',
        body: { name: newName.trim(), tenant_id: tenantId },
      });
      setNewName('');
      await refresh();
      // Já abre o QR pra escanear
      setTimeout(() => openQR(r.data.instance), 500);
    } catch (e: any) {
      setError(e?.message || 'Falha ao criar conexão.');
    } finally {
      setCreating(false);
    }
  }

  async function openQR(inst: Instance) {
    setQrInstance(inst);
    setQrLoading(true);
    try {
      const r = await apiFetch<{ data: { qrcode: string | null } }>(`/api/whatsapp/instances/${inst.id}/qr?tenant_id=${tenantId}`);
      // Atualiza o QR diretamente no state
      setQrInstance((cur) => cur ? { ...cur, qr_code: r.data.qrcode } : null);
    } catch (e: any) {
      setError(e?.message || 'Falha ao buscar QR.');
    } finally {
      setQrLoading(false);
    }
  }

  async function onDelete(inst: Instance) {
    const ok = await confirm({
      title: `Excluir a conexão "${inst.name}"?`,
      message:
        'Isso vai desconectar do WhatsApp imediatamente, remover a instância do servidor Evolution e apagar o registro do banco. As conversas já capturadas ficam preservadas, mas você não receberá novas mensagens. Essa ação é IRREVERSÍVEL.',
      confirmLabel: 'Excluir conexão',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/whatsapp/instances/${inst.id}?tenant_id=${tenantId}`, { method: 'DELETE' });
      await refresh();
    } catch (e: any) {
      setError(e?.message || 'Falha ao excluir.');
    }
  }

  return (
    <div className="space-y-4">
      {/* Criar nova */}
      <section className="glass-static p-5 lg:p-6">
        <Kicker>NOVA CONEXÃO</Kicker>
        <p className="mt-2 text-sm text-fg-muted">
          Crie uma nova conexão de WhatsApp. Depois escaneie o QR no celular pra conectar.
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

      {error && (
        <div className="rounded-xl p-4 flex items-start gap-3"
          style={{ background: 'rgba(255, 99, 99, 0.08)', border: '1px solid rgba(255, 99, 99, 0.30)' }}>
          <div className="text-sm" style={{ color: '#FF8B8B' }}>{error}</div>
        </div>
      )}

      {/* Lista de instances */}
      {loading && instances.length === 0 ? (
        <div className="glass-static p-12 text-center text-sm text-fg-muted">Carregando…</div>
      ) : instances.length === 0 ? (
        <div className="glass-static p-12 text-center text-sm text-fg-muted">
          Nenhuma conexão ainda. Crie uma acima.
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
                  <button
                    type="button"
                    onClick={() => openQR(inst)}
                    className="btn btn-ghost !text-xs !py-1.5"
                  >
                    📱 Mostrar QR
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(inst)}
                  className="btn !text-xs !py-1.5"
                  style={{
                    background: 'rgba(255, 99, 99, 0.10)',
                    color: '#FF6363',
                    border: '1px solid rgba(255, 99, 99, 0.35)',
                  }}
                  title="Remove a instância do Evolution + banco. Irreversível."
                >
                  🗑 Excluir conexão
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* QR modal */}
      {qrInstance && (
        <QRModal
          instance={qrInstance}
          loading={qrLoading}
          onClose={() => setQrInstance(null)}
          onRefresh={() => openQR(qrInstance)}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Instance['status'] }) {
  const map: Record<Instance['status'], { label: string; className: string }> = {
    pending:      { label: 'pendente',     className: 'badge-warn' },
    qr:           { label: 'aguardando QR', className: 'badge-warn badge-dot' },
    connecting:   { label: 'conectando',   className: 'badge-warn badge-dot' },
    connected:    { label: 'conectado',    className: 'badge-success badge-dot' },
    disconnected: { label: 'desconectado', className: 'badge-danger badge-dot' },
    failed:       { label: 'falha',        className: 'badge-danger badge-dot' },
  };
  const m = map[status];
  return <span className={`badge ${m.className}`}>{m.label}</span>;
}

function QRModal({ instance, loading, onClose, onRefresh }: {
  instance: Instance;
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  // Quando o status muda pra connected, fecha modal automaticamente
  useEffect(() => {
    if (instance.status === 'connected') {
      setTimeout(onClose, 1500);
    }
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
        style={{ background: '#0B1314', border: '1px solid rgba(16, 242, 160, 0.25)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <Kicker>ESCANEAR QR</Kicker>
          <button type="button" onClick={onClose} className="text-fg-muted hover:text-fg">✕</button>
        </div>
        <p className="text-sm text-fg-muted mb-4">
          No celular, abra <strong>WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho</strong> e escaneie:
        </p>
        <div className="aspect-square w-full bg-white rounded-lg p-4 flex items-center justify-center">
          {loading || !instance.qr_code ? (
            <div className="text-fg-dim text-sm">{loading ? 'Carregando QR…' : 'Aguardando QR do Evolution…'}</div>
          ) : (
            <img src={instance.qr_code} alt="QR code" className="w-full h-full object-contain" />
          )}
        </div>
        <div className="mt-4 flex gap-2 justify-between">
          <span className="text-xs text-fg-dim self-center">
            Status: <StatusBadge status={instance.status} />
          </span>
          <button type="button" onClick={onRefresh} className="btn btn-ghost !text-xs !py-1.5">
            Atualizar QR
          </button>
        </div>
        {instance.status === 'connected' && (
          <div className="mt-3 text-center text-sm text-emerald">✓ Conectado! Fechando…</div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   TAB 2 — Conversations
   ============================================================ */

function ConversationsTab({ tenantId }: { tenantId: string }) {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [filter, setFilter] = useState<'all' | Conversation['status']>('all');
  const [deleting, setDeleting] = useState(false);
  const { confirm, notify } = useDialog();

  async function onDeleteConversation(conv: Conversation) {
    const label = conv.display_name || conv.remote_jid.replace(/@.*/, '');
    const ok = await confirm({
      title: `Excluir TODA a conversa com "${label}"?`,
      message:
        'Isso remove a conversa e TODAS as mensagens do banco. As mensagens NÃO são apagadas no WhatsApp do destinatário. Você poderá iniciar uma NOVA qualificação depois (começa do zero). Essa ação é IRREVERSÍVEL.',
      confirmLabel: 'Excluir conversa',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/whatsapp/conversations/${conv.id}?tenant_id=${tenantId}`, { method: 'DELETE' });
      setSelected(null);
      await refresh();
    } catch (e: any) {
      notify(`Falha ao excluir: ${e?.message || 'erro'}`, 'danger');
    } finally {
      setDeleting(false);
    }
  }

  async function refresh() {
    setLoading(true);
    try {
      const r = await apiFetch<{ data: { conversations: Conversation[] } }>(`/api/whatsapp/conversations?tenant_id=${tenantId}&limit=200`);
      setConvs(r.data.conversations);
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [tenantId]);
  useEffect(() => {
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [tenantId]);

  const visible = useMemo(() => {
    if (filter === 'all') return convs;
    return convs.filter((c) => c.status === filter);
  }, [convs, filter]);

  const counts = useMemo(() => ({
    qualifying: convs.filter((c) => c.status === 'qualifying').length,
    qualified:  convs.filter((c) => c.status === 'qualified').length,
    rejected:   convs.filter((c) => c.status === 'rejected').length,
    transferred:convs.filter((c) => c.status === 'transferred').length,
    human:      convs.filter((c) => c.status === 'human_takeover').length,
  }), [convs]);

  return (
    <div className="grid lg:grid-cols-[340px_1fr] gap-4">
      <div className="space-y-3">
        {/* Filtros */}
        <div className="glass-static p-3 space-y-1">
          <FilterRow active={filter === 'all'} onClick={() => setFilter('all')} label="Todas" count={convs.length} />
          <FilterRow active={filter === 'qualifying'} onClick={() => setFilter('qualifying')} label="Em qualificação" count={counts.qualifying} tone="warn" />
          <FilterRow active={filter === 'qualified'} onClick={() => setFilter('qualified')} label="Qualificados" count={counts.qualified} tone="success" />
          <FilterRow active={filter === 'rejected'} onClick={() => setFilter('rejected')} label="Rejeitados" count={counts.rejected} tone="danger" />
          <FilterRow active={filter === 'human_takeover'} onClick={() => setFilter('human_takeover')} label="Atendimento humano" count={counts.human} tone="info" />
        </div>

        {/* Lista */}
        <div className="glass-static overflow-hidden max-h-[600px] overflow-y-auto">
          {loading && convs.length === 0 ? (
            <div className="p-8 text-center text-sm text-fg-muted">Carregando…</div>
          ) : visible.length === 0 ? (
            <div className="p-8 text-center text-sm text-fg-muted">Nenhuma conversa.</div>
          ) : (
            visible.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelected(c)}
                className={`w-full text-left px-4 py-3 border-b border-line/40 hover:bg-white/[0.04] transition-colors ${
                  selected?.id === c.id ? 'bg-brand/10' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium truncate">{c.display_name || c.remote_jid.replace(/@.*/, '')}</div>
                  <ConvStatusDot status={c.status} />
                </div>
                <div className="text-xs text-fg-muted truncate mt-1">{c.last_message_preview || '—'}</div>
                <div className="text-[10px] text-fg-dim font-mono mt-1">
                  {new Date(c.last_message_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {' · '}{c.message_count} msg
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat viewer */}
      <div>
        {selected ? (
          <ChatViewer
            key={selected.id}
            conversation={selected}
            tenantId={tenantId}
            onChanged={refresh}
            onDelete={() => onDeleteConversation(selected)}
            deleting={deleting}
          />
        ) : (
          <div className="glass-static p-12 text-center text-sm text-fg-muted h-full flex items-center justify-center">
            Selecione uma conversa na lista pra ver as mensagens.
          </div>
        )}
      </div>
    </div>
  );
}

function FilterRow({ active, onClick, label, count, tone }: {
  active: boolean; onClick: () => void; label: string; count: number; tone?: 'success' | 'warn' | 'danger' | 'info';
}) {
  const color =
    tone === 'success' ? '#10F2A0'
    : tone === 'warn' ? '#FFC857'
    : tone === 'danger' ? '#FF6363'
    : tone === 'info' ? '#5EE2FF'
    : '#A8B7BB';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-3 py-2 rounded-md text-sm flex items-center justify-between transition-colors ${
        active ? 'bg-brand/15 text-fg' : 'text-fg-muted hover:bg-white/[0.04] hover:text-fg'
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="text-xs font-mono tabular">{count}</span>
    </button>
  );
}

function ConvStatusDot({ status }: { status: Conversation['status'] }) {
  const color =
    status === 'qualified' ? '#10F2A0'
    : status === 'rejected' ? '#FF6363'
    : status === 'transferred' ? '#5EE2FF'
    : status === 'human_takeover' ? '#FFC857'
    : '#A8B7BB';
  return <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />;
}

function ChatViewer({ conversation, tenantId, onChanged, onDelete, deleting }: {
  conversation: Conversation;
  tenantId: string;
  onChanged: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [messages, setMessages] = useState<Array<{ id: string; direction: string; source: string; content: string; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = await apiFetch<{ data: { messages: any[] } }>(`/api/whatsapp/conversations/${conversation.id}/messages?tenant_id=${tenantId}`);
      setMessages(r.data.messages);
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [conversation.id]);
  useEffect(() => {
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [conversation.id]);

  // Auto-scroll pro final quando novas mensagens chegam
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // IA considerada "off" se foi pausada manual OU se a conversa virou rejected/transferred/human_takeover
  const aiOff = conversation.ai_paused
    || ['rejected', 'transferred', 'human_takeover'].includes(conversation.status);

  async function togglePause() {
    try {
      await apiFetch(`/api/whatsapp/conversations/${conversation.id}/pause?tenant_id=${tenantId}`, {
        method: 'POST',
        body: { paused: !aiOff },
      });
      onChanged();
    } catch {}
  }

  async function sendManual() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await apiFetch(`/api/whatsapp/conversations/${conversation.id}/send?tenant_id=${tenantId}`, {
        method: 'POST',
        body: { text },
      });
      setDraft('');
      await refresh();
      onChanged();
    } catch (e: any) {
      setSendError(e?.message || 'Falha ao enviar.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="glass-static overflow-hidden flex flex-col h-[640px]">
      <div className="px-5 py-3 border-b border-line flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold truncate">{conversation.display_name || conversation.remote_jid.replace(/@.*/, '')}</div>
          <div className="text-xs text-fg-dim font-mono mt-0.5">+{conversation.remote_jid.replace(/@.*/, '')}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={togglePause}
            className="btn btn-ghost !text-xs !py-1.5"
          >
            {aiOff ? '▶ Reativar IA' : '⏸ Pausar IA (assumir)'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="btn !text-xs !py-1.5 disabled:opacity-50"
            style={{
              background: 'rgba(255, 99, 99, 0.10)',
              color: '#FF6363',
              border: '1px solid rgba(255, 99, 99, 0.35)',
            }}
            title="Excluir TODA a conversa (mensagens + histórico). Irreversível."
          >
            {deleting ? 'Excluindo…' : '🗑 Excluir conversa'}
          </button>
        </div>
      </div>

      {conversation.qualification_summary && (
        <div className="px-5 py-2.5 bg-emerald/5 border-b border-emerald/20 text-xs">
          <strong className="text-emerald">Resumo da IA:</strong>{' '}
          <span className="text-fg-muted">{conversation.qualification_summary}</span>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
        {loading && messages.length === 0 ? (
          <div className="text-center text-sm text-fg-muted">Carregando…</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-sm text-fg-muted">Sem mensagens ainda.</div>
        ) : (
          messages.map((m) => (
            <Bubble key={m.id} message={m} />
          ))
        )}
      </div>

      <div className="border-t border-line p-3 space-y-2">
        {sendError && (
          <div className="text-xs px-3 py-2 rounded-md" style={{ background: 'rgba(255, 99, 99, 0.08)', color: '#FF8B8B', border: '1px solid rgba(255, 99, 99, 0.30)' }}>
            {sendError}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendManual(); }
            }}
            placeholder="Digite uma mensagem… (Enter envia · Shift+Enter quebra linha)"
            rows={2}
            disabled={sending}
            className="input flex-1 resize-none !py-2 !text-sm"
          />
          <button
            type="button"
            onClick={sendManual}
            disabled={sending || !draft.trim()}
            className="btn btn-primary disabled:opacity-50 !py-2"
          >
            {sending ? 'Enviando…' : 'Enviar →'}
          </button>
        </div>

        <div className="text-[11px] text-fg-dim px-1">
          ⓘ Enviar manualmente <strong>pausa a IA</strong> automaticamente. Reative no botão acima.
        </div>
      </div>
    </div>
  );
}

function Bubble({ message }: { message: any }) {
  const isOutbound = message.direction === 'outbound';
  const isAI = message.source === 'ai';
  const isHuman = message.source === 'human';

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[70%]">
        <div className="text-[10px] text-fg-dim mb-1 px-1 font-mono">
          {isOutbound ? (isAI ? '🤖 IA' : isHuman ? '👤 humano' : 'sistema') : '📥 lead'}
          {' · '}
          {new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div
          className="rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
          style={
            isOutbound
              ? { background: 'linear-gradient(180deg, #16855E, #105F44)', color: '#fff' }
              : { background: 'rgba(255,255,255,0.06)', color: '#E8EDED' }
          }
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   TAB 3 — Prompt
   ============================================================ */

function PromptTab({ tenantId }: { tenantId: string }) {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await apiFetch<{ data: { prompt: Prompt } }>(`/api/whatsapp/prompt?tenant_id=${tenantId}`);
      setPrompt(r.data.prompt);
    } catch (e: any) { setError(e?.message || 'Falha ao carregar.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tenantId]);

  async function save() {
    if (!prompt) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      await apiFetch(`/api/whatsapp/prompt?tenant_id=${tenantId}`, {
        method: 'PUT',
        body: prompt,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) { setError(e?.message || 'Falha ao salvar.'); }
    finally { setBusy(false); }
  }

  if (loading || !prompt) {
    return <div className="glass-static p-12 text-center text-sm text-fg-muted">Carregando…</div>;
  }

  return (
    <div className="space-y-5">
      <section className="glass-static p-6">
        <Kicker>PERSONALIDADE DA IA (SYSTEM PROMPT)</Kicker>
        <p className="mt-2 text-sm text-fg-muted">
          Como a IA deve se apresentar e conversar. Use uma linguagem natural, descreva o tom de voz.
        </p>
        <textarea
          rows={6}
          className="input mt-3 resize-y leading-relaxed"
          value={prompt.system_prompt}
          onChange={(e) => setPrompt({ ...prompt, system_prompt: e.target.value })}
          placeholder="Ex: Você é o Pedro, da agência Geometric. Conversa por WhatsApp..."
        />
      </section>

      <section className="glass-static p-6">
        <Kicker>CRITÉRIOS DE QUALIFICAÇÃO</Kicker>
        <p className="mt-2 text-sm text-fg-muted">
          Quando a IA deve considerar o lead qualificado e passar pra equipe humana. Use bullets.
        </p>
        <textarea
          rows={6}
          className="input mt-3 resize-y leading-relaxed"
          value={prompt.qualification_criteria}
          onChange={(e) => setPrompt({ ...prompt, qualification_criteria: e.target.value })}
          placeholder={'- Lead tem negócio próprio\n- Orçamento de R$ 500+/mês\n- Disponível pra reunião'}
        />
      </section>

      <section className="glass-static p-6">
        <Kicker>MENSAGEM INICIAL (DISPARO)</Kicker>
        <p className="mt-2 text-sm text-fg-muted">
          Primeira mensagem enviada ao lead prospectado. Variáveis disponíveis: <code className="text-brand">{'{nicho}'}</code>, <code className="text-brand">{'{cidade}'}</code>.
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
        <p className="mt-2 text-sm text-fg-muted">
          Enviada quando a IA qualifica o lead. Avisa que humano vai assumir.
        </p>
        <textarea
          rows={3}
          className="input mt-3 resize-y leading-relaxed"
          value={prompt.transfer_message}
          onChange={(e) => setPrompt({ ...prompt, transfer_message: e.target.value })}
        />
      </section>

      <section className="glass-static p-5 flex items-center justify-between">
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={prompt.ai_enabled}
            onChange={(e) => setPrompt({ ...prompt, ai_enabled: e.target.checked })}
          />
          <span>IA ativa (responde mensagens automaticamente)</span>
        </label>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-emerald">✓ Salvo</span>}
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="btn btn-primary disabled:opacity-50"
          >
            {busy ? 'Salvando…' : 'Salvar prompt'}
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-xl p-4" style={{ background: 'rgba(255, 99, 99, 0.08)', border: '1px solid rgba(255, 99, 99, 0.30)', color: '#FF8B8B' }}>
          {error}
        </div>
      )}
    </div>
  );
}
