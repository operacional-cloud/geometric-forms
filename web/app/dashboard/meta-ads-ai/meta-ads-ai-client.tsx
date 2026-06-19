'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Kicker } from '@/components/ui';
import { useDialog } from '@/components/Dialog';

type Conversation = { id: string; title: string; created_at: string; updated_at: string };
type Message = {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls: Array<{ id: string; name: string; input: any }> | null;
  tool_call_id: string | null;
  tool_result: any | null;
  created_at: string;
};

export function MetaAdsAiClient() {
  const { confirm, notify } = useDialog();
  const [keyStatus, setKeyStatus] = useState<{ has_key: boolean; has_meta_account: boolean } | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  async function loadStatus() {
    try {
      const r = await apiFetch<{ data: { has_key: boolean; has_meta_account: boolean } }>('/api/meta-ads-ai/key');
      setKeyStatus(r.data);
    } catch {}
  }
  async function loadConversations() {
    try {
      const r = await apiFetch<{ data: { conversations: Conversation[] } }>('/api/meta-ads-ai/conversations');
      setConversations(r.data.conversations);
    } catch {}
  }
  async function loadMessages(convId: string) {
    setLoadingMsgs(true);
    try {
      const r = await apiFetch<{ data: { messages: Message[] } }>(`/api/meta-ads-ai/conversations/${convId}/messages`);
      setMessages(r.data.messages);
    } catch {} finally { setLoadingMsgs(false); }
  }

  useEffect(() => { loadStatus(); loadConversations(); }, []);
  useEffect(() => { if (selected) loadMessages(selected.id); else setMessages([]); }, [selected]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  async function newConversation() {
    try {
      const r = await apiFetch<{ data: { conversation: Conversation } }>('/api/meta-ads-ai/conversations', {
        method: 'POST',
        body: { title: 'Nova conversa' },
      });
      setConversations((prev) => [r.data.conversation, ...prev]);
      setSelected(r.data.conversation);
    } catch (e: any) {
      notify(`Falha: ${e?.message || 'erro'}`, 'danger');
    }
  }

  async function deleteConv(c: Conversation) {
    const ok = await confirm({
      title: `Excluir conversa "${c.title}"?`,
      message: 'Remove a conversa e todo o histórico do banco. Irreversível.',
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/meta-ads-ai/conversations/${c.id}`, { method: 'DELETE' });
      setConversations((prev) => prev.filter((x) => x.id !== c.id));
      if (selected?.id === c.id) setSelected(null);
      notify('Conversa excluída', 'success');
    } catch (e: any) {
      notify(`Falha: ${e?.message || 'erro'}`, 'danger');
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending || !selected) return;
    setSending(true);
    // Otimista: adiciona user msg local
    const localUser: Message = {
      id: 'local-' + Date.now(),
      role: 'user', content: text, tool_calls: null, tool_call_id: null, tool_result: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, localUser]);
    setDraft('');
    try {
      await apiFetch(`/api/meta-ads-ai/conversations/${selected.id}/send`, {
        method: 'POST',
        body: { text },
      });
      await loadMessages(selected.id);
      await loadConversations();
    } catch (e: any) {
      notify(`Falha: ${e?.message || 'erro'}`, 'danger');
      // remove a otimista em caso de erro
      setMessages((prev) => prev.filter((m) => m.id !== localUser.id));
    } finally {
      setSending(false);
    }
  }

  async function lock() {
    try { await apiFetch('/api/auth/ai-unlock', { method: 'DELETE' }); } catch {}
    window.location.reload();
  }

  // Filtra mensagens "tool" do display (mostramos via badge no assistant turn)
  const displayMessages = useMemo(() => messages.filter((m) => m.role !== 'tool'), [messages]);

  if (!keyStatus) {
    return <div className="container-edge py-16 text-center text-sm text-fg-muted">Carregando…</div>;
  }

  return (
    <main className="container-edge py-8">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div>
          <Kicker>MÓDULO RESTRITO · destravado</Kicker>
          <h1 className="mt-2 text-3xl font-semibold tracking-tightest">Meta Ads · IA</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Converse com a IA pra analisar e otimizar campanhas. Opera direto na conta vinculada ao cliente ativo, com 55 ferramentas (insights, criação, catálogo, audiências, pixel, Ads Library).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={lock} className="btn btn-ghost !text-xs !py-2">🔒 Travar</button>
        </div>
      </div>

      {!keyStatus.has_meta_account && (
        <div className="glass-static p-4 mb-4 text-sm" style={{ color: '#FFC857', borderColor: 'rgba(255,200,87,0.30)' }}>
          ⚠️ Esse cliente não tem conta Meta Ads vinculada. Peça pro admin atribuir uma conta em <strong>Clientes → editar</strong>.
        </div>
      )}

      <div className="grid lg:grid-cols-[280px_1fr] gap-4">
        {/* Sidebar de conversas */}
        <aside className="space-y-3">
          <button
            type="button"
            onClick={newConversation}
            disabled={!keyStatus.has_meta_account}
            className="btn btn-primary w-full justify-center !py-2.5 disabled:opacity-40"
          >
            + Nova conversa
          </button>
          <div className="glass-static overflow-hidden max-h-[640px] overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-fg-muted">Nenhuma conversa ainda.</div>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  className={`group flex items-center gap-2 px-3 py-2.5 border-b border-line/40 hover:bg-white/[0.04] cursor-pointer transition-colors ${
                    selected?.id === c.id ? 'bg-brand/10' : ''
                  }`}
                  onClick={() => setSelected(c)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{c.title}</div>
                    <div className="text-[10px] text-fg-dim font-mono mt-0.5">
                      {new Date(c.updated_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); deleteConv(c); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-fg-dim hover:text-danger text-xs"
                    title="Excluir"
                  >🗑</button>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Chat */}
        <section className="glass-static overflow-hidden flex flex-col h-[680px]">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center p-12 text-center">
              <div className="max-w-md space-y-4">
                <Kicker>COMECE AGORA</Kicker>
                <h2 className="text-2xl font-semibold tracking-tightest">
                  Pergunta algo sobre as <span className="text-brand-gradient italic font-display">campanhas</span>
                </h2>
                <p className="text-sm text-fg-muted">
                  Exemplos: <em>"como tá o CPL dos últimos 30 dias?"</em>, <em>"lista as 5 campanhas com pior ROI"</em>, <em>"pausa a campanha com CPL maior que R$ 80"</em>.
                </p>
                <button
                  type="button"
                  onClick={newConversation}
                  disabled={!keyStatus.has_meta_account}
                  className="btn btn-primary disabled:opacity-40"
                >
                  + Nova conversa
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="px-5 py-3 border-b border-line">
                <div className="font-semibold truncate">{selected.title}</div>
                <div className="text-[11px] text-fg-dim font-mono mt-0.5">Gemini 2.5 Flash · {META_TOOL_COUNT} tools · grátis</div>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
                {loadingMsgs && displayMessages.length === 0 ? (
                  <div className="text-center text-sm text-fg-muted">Carregando…</div>
                ) : displayMessages.length === 0 ? (
                  <div className="text-center text-sm text-fg-muted">Manda a primeira mensagem.</div>
                ) : (
                  displayMessages.map((m) => <ChatBubble key={m.id} message={m} />)
                )}
                {sending && (
                  <div className="text-xs text-fg-dim italic">IA está pensando<span className="animate-pulse">…</span></div>
                )}
              </div>

              <div className="border-t border-line p-3 flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                  }}
                  placeholder="Pergunta algo sobre as campanhas… (Enter envia)"
                  rows={2}
                  disabled={sending}
                  className="input flex-1 resize-none !py-2 !text-sm"
                />
                <button type="button" onClick={send} disabled={sending || !draft.trim()} className="btn btn-primary disabled:opacity-50 !py-2">
                  {sending ? '…' : 'Enviar →'}
                </button>
              </div>
            </>
          )}
        </section>
      </div>

    </main>
  );
}

const META_TOOL_COUNT = 55;

function ChatBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const hasTools = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[80%]">
        <div className="text-[10px] text-fg-dim mb-1 px-1 font-mono">
          {isUser ? '👤 você' : '🤖 IA'}
          {' · '}
          {new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </div>
        {hasTools && (
          <div className="mb-2 flex flex-wrap gap-1">
            {message.tool_calls!.map((tc) => (
              <span
                key={tc.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono"
                style={{ background: 'rgba(94,226,255,0.10)', color: '#5EE2FF', border: '1px solid rgba(94,226,255,0.30)' }}
                title={JSON.stringify(tc.input)}
              >
                🛠 {tc.name}
              </span>
            ))}
          </div>
        )}
        {message.content && (
          <div
            className="rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
            style={isUser
              ? { background: 'linear-gradient(180deg, #16855E, #105F44)', color: '#fff' }
              : { background: 'rgba(255,255,255,0.06)', color: '#E8EDED' }}
          >{message.content}</div>
        )}
      </div>
    </div>
  );
}

