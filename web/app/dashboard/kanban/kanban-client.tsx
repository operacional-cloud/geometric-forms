'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Kicker } from '@/components/ui';
import { useDialog } from '@/components/Dialog';

type LeadOrigin = 'form' | 'manual' | 'prospecting';

type KanbanColumnKind =
  | 'default' | 'qualified' | 'em_contato' | 'meeting_scheduled' | 'meeting_held'
  | 'no_show' | 'proposal' | 'followup' | 'won' | 'lost' | 'custom';

type KanbanColumn = {
  id: string;
  name: string;
  color: string;
  position: number;
  kind: KanbanColumnKind;
};

type KanbanLead = {
  id: string;
  origin: LeadOrigin;
  kanban_column_id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  deal_value: number | null;
  notes: string | null;
  created_at: string;
  tags: string[];
  won_at?: string | null;
  followup_at?: string | null;
  form_title?: string | null;
  keyword_used?: string | null;
  seller_id?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  ad_platform?: string | null;
  geo_country?: string | null;
  geo_region?: string | null;
  geo_city?: string | null;
};

const FOLLOWUP_DAYS_THRESHOLD = 7;

type Seller = { id: string; name: string; email: string | null; color: string; active: boolean };

const COLOR_PRESETS = [
  '#5EE2FF', '#FFC857', '#10F2A0', '#A66EFC', '#16855E', '#FF6363',
  '#FF8B3D', '#3DB6FF', '#E060B6', '#8A8A8A',
];

export function KanbanClient({
  initialColumns, initialLeads,
}: {
  initialColumns: KanbanColumn[];
  initialLeads: KanbanLead[];
}) {
  const { confirm, notify } = useDialog();
  const [columns, setColumns] = useState<KanbanColumn[]>(initialColumns);
  const [leads, setLeads] = useState<KanbanLead[]>(initialLeads);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [sellerFilter, setSellerFilter] = useState<string>(''); // '', 'null', or seller id
  const [dragLead, setDragLead] = useState<KanbanLead | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  // Modais
  const [editLead, setEditLead] = useState<KanbanLead | null>(null);
  const [showSellers, setShowSellers] = useState(false);
  const [, setAddingColumn] = useState(false);
  const [, setEditingColumn] = useState<KanbanColumn | null>(null);

  // Carrega vendedores ao montar
  useEffect(() => {
    apiFetch<{ data: { sellers: Seller[] } }>('/api/kanban/sellers?include_inactive=true')
      .then((r) => setSellers(r.data.sellers))
      .catch(() => {});
  }, []);

  function refreshSellers() {
    apiFetch<{ data: { sellers: Seller[] } }>('/api/kanban/sellers?include_inactive=true')
      .then((r) => setSellers(r.data.sellers))
      .catch(() => {});
  }

  async function refresh() {
    try {
      const r = await apiFetch<{ data: { columns: KanbanColumn[]; leads: KanbanLead[] } }>('/api/kanban/board');
      setColumns(r.data.columns);
      setLeads(r.data.leads);
    } catch {}
  }

  // Aplica filtro de vendedor antes de agrupar
  const filteredLeads = useMemo(() => {
    if (!sellerFilter) return leads;
    if (sellerFilter === 'null') return leads.filter((l) => !l.seller_id);
    return leads.filter((l) => l.seller_id === sellerFilter);
  }, [leads, sellerFilter]);

  // Mapa coluna_id → kind pra detectar won/followup
  const colKindById = useMemo(() => {
    const m = new Map<string, KanbanColumnKind>();
    columns.forEach((c) => m.set(c.id, c.kind));
    return m;
  }, [columns]);

  // Separa em 3 grupos: board (atual), fechados (kind=won), follow-up (kind=followup há > 7 dias)
  const sevenDaysAgo = useMemo(() => Date.now() - FOLLOWUP_DAYS_THRESHOLD * 86400 * 1000, []);
  const { boardLeads, wonLeads, followupLeads } = useMemo(() => {
    const board: KanbanLead[] = [];
    const won: KanbanLead[] = [];
    const followup: KanbanLead[] = [];
    for (const l of filteredLeads) {
      const kind = l.kanban_column_id ? colKindById.get(l.kanban_column_id) : null;
      if (kind === 'won') {
        won.push(l);
      } else if (kind === 'followup' && l.followup_at && new Date(l.followup_at).getTime() < sevenDaysAgo) {
        followup.push(l);
      } else {
        board.push(l);
      }
    }
    // Ordena: won por won_at desc; followup por followup_at asc (mais antigos primeiro)
    won.sort((a, b) => (b.won_at || '').localeCompare(a.won_at || ''));
    followup.sort((a, b) => (a.followup_at || '').localeCompare(b.followup_at || ''));
    return { boardLeads: board, wonLeads: won, followupLeads: followup };
  }, [filteredLeads, colKindById, sevenDaysAgo]);

  // Agrupa leads por coluna (apenas os do board)
  const leadsByCol = useMemo(() => {
    const map = new Map<string | null, KanbanLead[]>();
    map.set(null, []); // sem coluna
    columns.forEach((c) => map.set(c.id, []));
    boardLeads.forEach((l) => {
      const k = l.kanban_column_id;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(l);
    });
    return map;
  }, [columns, boardLeads]);

  const sellerMap = useMemo(() => new Map(sellers.map((s) => [s.id, s])), [sellers]);

  async function moveLeadTo(lead: KanbanLead, columnId: string | null) {
    if (lead.kanban_column_id === columnId) return;
    const targetCol = columns.find((c) => c.id === columnId);
    const newTag = targetCol?.name;
    // Otimista: atualiza UI (move + acumula tag se aplicável)
    setLeads((prev) => prev.map((l) => {
      if (!(l.id === lead.id && l.origin === lead.origin)) return l;
      const nextTags = newTag && !l.tags.includes(newTag) ? [...l.tags, newTag] : l.tags;
      return { ...l, kanban_column_id: columnId, tags: nextTags };
    }));
    try {
      await apiFetch('/api/kanban/move', {
        method: 'POST',
        body: { lead_id: lead.id, origin: lead.origin, column_id: columnId },
      });
    } catch (e: any) {
      notify(`Falha ao mover: ${e?.message || 'erro'}`, 'danger');
      refresh();
    }
  }

  async function removeTag(lead: KanbanLead, tag: string) {
    // Otimista
    setLeads((prev) => prev.map((l) =>
      l.id === lead.id && l.origin === lead.origin
        ? { ...l, tags: l.tags.filter((t) => t !== tag) }
        : l,
    ));
    try {
      await apiFetch('/api/kanban/tag', {
        method: 'DELETE',
        body: { lead_id: lead.id, origin: lead.origin, tag },
      });
    } catch (e: any) {
      notify(`Falha ao remover tag: ${e?.message || 'erro'}`, 'danger');
      refresh();
    }
  }

  async function updateLeadValue(lead: KanbanLead, newValue: number | null) {
    if (lead.deal_value === newValue) return;
    setLeads((prev) => prev.map((l) =>
      l.id === lead.id && l.origin === lead.origin
        ? { ...l, deal_value: newValue }
        : l,
    ));
    try {
      await apiFetch('/api/kanban/move', {
        method: 'POST',
        body: {
          lead_id: lead.id,
          origin: lead.origin,
          column_id: lead.kanban_column_id,
          deal_value: newValue,
        },
      });
    } catch (e: any) {
      notify(`Falha ao salvar valor: ${e?.message || 'erro'}`, 'danger');
      refresh();
    }
  }

  async function deleteColumn(col: KanbanColumn) {
    const ok = await confirm({
      title: `Excluir coluna "${col.name}"?`,
      message: 'Leads dessa coluna voltam pra "sem coluna" (não são apagados).',
      variant: 'danger',
      confirmLabel: 'Excluir coluna',
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/kanban/columns/${col.id}`, { method: 'DELETE' });
      notify(`Coluna "${col.name}" excluída`, 'success');
      await refresh();
    } catch (e: any) {
      notify(`Falha ao excluir: ${e?.message || 'erro'}`, 'danger');
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-sm text-fg-muted">
            {filteredLeads.length}/{leads.length} {leads.length === 1 ? 'lead' : 'leads'} · {columns.length} colunas fixas
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg glass-inner">
            <span className="text-[10px] uppercase tracking-widest text-fg-dim font-mono">VENDEDOR</span>
            <select
              value={sellerFilter}
              onChange={(e) => setSellerFilter(e.target.value)}
              className="bg-transparent border-0 text-sm focus:outline-none"
            >
              <option value="">Todos</option>
              <option value="null">Sem vendedor</option>
              {sellers.filter((s) => s.active).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowSellers(true)}
          className="btn btn-ghost !text-sm !py-2"
        >
          👥 Vendedores
        </button>
      </div>
      <div className="text-[11px] text-fg-dim -mt-3">
        ⓘ Adicionar lead manual: <a href="/dashboard/leads" className="link">Leads</a>. Atribuir vendedor a um lead: clique no card.
      </div>

      {/* Board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-fit">
          {columns.map((col) => {
            const items = leadsByCol.get(col.id) || [];
            const total = items.reduce((acc, l) => acc + (l.deal_value || 0), 0);
            const isDragOver = dragOverCol === col.id;
            return (
              <div
                key={col.id}
                onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.id); }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={() => {
                  setDragOverCol(null);
                  if (dragLead) moveLeadTo(dragLead, col.id);
                  setDragLead(null);
                }}
                className="rounded-xl flex flex-col w-[280px] shrink-0"
                style={{
                  background: isDragOver ? `${col.color}22` : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isDragOver ? col.color : 'rgba(255,255,255,0.06)'}`,
                  minHeight: 400,
                }}
              >
                <div className="px-4 py-3 flex items-center justify-between gap-2 border-b border-line/40">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: col.color, boxShadow: `0 0 8px ${col.color}80` }} />
                    <span className="font-semibold text-sm truncate">{col.name}</span>
                    <span className="text-[11px] text-fg-dim font-mono tabular">{items.length}</span>
                  </div>
                </div>
                {total > 0 && (
                  <div className="px-4 py-1.5 text-[11px] text-fg-dim font-mono border-b border-line/30">
                    R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                )}

                <div className="flex-1 p-2 space-y-2 overflow-y-auto" style={{ maxHeight: 600 }}>
                  {items.length === 0 ? (
                    <div className="px-2 py-6 text-center text-xs text-fg-dim">
                      Solte um lead aqui
                    </div>
                  ) : (
                    items.map((lead) => (
                      <LeadCard
                        key={`${lead.origin}-${lead.id}`}
                        lead={lead}
                        seller={lead.seller_id ? sellerMap.get(lead.seller_id) : undefined}
                        onDragStart={() => setDragLead(lead)}
                        onDragEnd={() => setDragLead(null)}
                        onClick={() => setEditLead(lead)}
                        onValueChange={(v) => updateLeadValue(lead, v)}
                        onRemoveTag={(t) => removeTag(lead, t)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}

          {/* Coluna "sem categoria" se houver leads órfãos */}
          {(leadsByCol.get(null) || []).length > 0 && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOverCol('__none__'); }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={() => {
                setDragOverCol(null);
                if (dragLead) moveLeadTo(dragLead, null);
                setDragLead(null);
              }}
              className="rounded-xl flex flex-col w-[280px] shrink-0"
              style={{
                background: dragOverCol === '__none__' ? 'rgba(168, 183, 187, 0.15)' : 'rgba(255,255,255,0.02)',
                border: '1px dashed rgba(255,255,255,0.15)',
                minHeight: 400,
              }}
            >
              <div className="px-4 py-3 border-b border-line/40">
                <span className="font-semibold text-sm text-fg-muted">Sem coluna</span>
                <span className="ml-2 text-[11px] text-fg-dim font-mono">{(leadsByCol.get(null) || []).length}</span>
              </div>
              <div className="flex-1 p-2 space-y-2 overflow-y-auto" style={{ maxHeight: 600 }}>
                {(leadsByCol.get(null) || []).map((lead) => (
                  <LeadCard
                    key={`${lead.origin}-${lead.id}`}
                    lead={lead}
                    onDragStart={() => setDragLead(lead)}
                    onDragEnd={() => setDragLead(null)}
                    onClick={() => setEditLead(lead)}
                    onValueChange={(v) => updateLeadValue(lead, v)}
                    onRemoveTag={(t) => removeTag(lead, t)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Listas: Clientes Fechados + Em Follow-up */}
      <FlatLeadsList
        title="🎉 Clientes Fechados"
        emptyLabel="Nenhum cliente fechado ainda."
        leads={wonLeads}
        columns={columns}
        sellers={sellers}
        dateLabel="Fechado em"
        getDate={(l) => l.won_at}
        onSelectLead={setEditLead}
        onMoveLead={moveLeadTo}
      />
      <FlatLeadsList
        title="⏳ Em Follow-up há mais de 7 dias"
        emptyLabel="Nenhum lead parado em follow-up por mais de 7 dias."
        leads={followupLeads}
        columns={columns}
        sellers={sellers}
        dateLabel="Em follow-up desde"
        getDate={(l) => l.followup_at}
        onSelectLead={setEditLead}
        onMoveLead={moveLeadTo}
      />

      {/* Modal: editar lead */}
      {editLead && (
        <LeadEditModal
          lead={editLead}
          columns={columns}
          sellers={sellers.filter((s) => s.active)}
          onClose={() => setEditLead(null)}
          onSaved={refresh}
        />
      )}

      {/* Modal: gerenciar vendedores */}
      {showSellers && (
        <SellersModal
          sellers={sellers}
          onClose={() => setShowSellers(false)}
          onChanged={refreshSellers}
        />
      )}

    </div>
  );
}

/* ============================================================
   Lead card (draggable)
   ============================================================ */

/* ============================================================
   Lista plana (fechados / follow-up): tabela simples com data,
   valor, seller e select pra mudar de coluna.
   ============================================================ */

function FlatLeadsList({
  title, emptyLabel, leads, columns, sellers, dateLabel, getDate, onSelectLead, onMoveLead,
}: {
  title: string;
  emptyLabel: string;
  leads: KanbanLead[];
  columns: KanbanColumn[];
  sellers: Seller[];
  dateLabel: string;
  getDate: (l: KanbanLead) => string | null | undefined;
  onSelectLead: (l: KanbanLead) => void;
  onMoveLead: (l: KanbanLead, columnId: string | null) => void;
}) {
  const sellerMap = new Map(sellers.map((s) => [s.id, s]));
  const total = leads.reduce((acc, l) => acc + (l.deal_value || 0), 0);
  return (
    <section className="glass-static overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between gap-3 border-b border-line/40">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <span className="text-[11px] text-fg-dim font-mono tabular">{leads.length}</span>
        </div>
        {total > 0 && (
          <span className="text-xs font-mono tabular text-emerald">
            R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        )}
      </div>
      {leads.length === 0 ? (
        <div className="px-5 py-8 text-center text-xs text-fg-muted">{emptyLabel}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-fg-dim font-mono border-b border-line/40">
                <th className="text-left px-4 py-2 font-normal">Nome</th>
                <th className="text-left px-4 py-2 font-normal">Contato</th>
                <th className="text-left px-4 py-2 font-normal">{dateLabel}</th>
                <th className="text-right px-4 py-2 font-normal">Valor</th>
                <th className="text-left px-4 py-2 font-normal">Vendedor</th>
                <th className="text-left px-4 py-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const seller = lead.seller_id ? sellerMap.get(lead.seller_id) : undefined;
                const d = getDate(lead);
                return (
                  <tr
                    key={`${lead.origin}-${lead.id}`}
                    className="border-b border-line/20 hover:bg-white/[0.03] transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => onSelectLead(lead)}
                        className="text-left hover:text-brand transition-colors"
                      >
                        <div className="font-medium truncate max-w-[200px]">{lead.name || '—'}</div>
                        {(lead.form_title || lead.keyword_used) && (
                          <div className="text-[10px] text-fg-dim mt-0.5 truncate max-w-[200px]">
                            {lead.form_title || lead.keyword_used}
                          </div>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-fg-muted">
                      {lead.phone || lead.email || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-fg-muted font-mono tabular">
                      {d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs font-mono tabular text-emerald">
                      {lead.deal_value
                        ? `R$ ${lead.deal_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      {seller ? (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono"
                          style={{ background: `${seller.color}15`, color: seller.color, border: `1px solid ${seller.color}40` }}
                        >
                          {seller.name}
                        </span>
                      ) : (
                        <span className="text-[10px] text-fg-dim">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={lead.kanban_column_id || ''}
                        onChange={(e) => onMoveLead(lead, e.target.value || null)}
                        className="bg-transparent border border-white/[0.10] rounded text-xs px-2 py-1 focus:outline-none focus:border-brand"
                      >
                        {columns.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function LeadCard({
  lead, seller, onDragStart, onDragEnd, onClick, onValueChange, onRemoveTag,
}: {
  lead: KanbanLead;
  seller?: Seller;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
  onValueChange: (value: number | null) => Promise<void> | void;
  onRemoveTag?: (tag: string) => void;
}) {
  const originLabel = lead.origin === 'form' ? '📝' : lead.origin === 'manual' ? '✏️' : '🎯';
  const [valueInput, setValueInput] = useState(
    lead.deal_value !== null ? lead.deal_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''
  );
  const [saving, setSaving] = useState(false);

  // Sincroniza quando o lead muda externamente (drag, refresh)
  useEffect(() => {
    setValueInput(lead.deal_value !== null ? lead.deal_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
  }, [lead.deal_value]);

  async function commitValue() {
    const raw = valueInput.trim().replace(/\./g, '').replace(',', '.');
    const num = raw ? Number(raw) : null;
    if (num !== null && !Number.isFinite(num)) {
      setValueInput(lead.deal_value !== null ? String(lead.deal_value) : '');
      return;
    }
    if (num === lead.deal_value) return;
    setSaving(true);
    try {
      await onValueChange(num);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', `${lead.origin}:${lead.id}`);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-brand/40 transition-colors"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex items-start gap-2" onClick={onClick}>
        <span className="text-base shrink-0" title={lead.origin}>{originLabel}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{lead.name || lead.phone || lead.email || 'Sem nome'}</div>
          {lead.phone && lead.name && <div className="text-[11px] text-fg-dim font-mono mt-0.5 truncate">{lead.phone}</div>}
          {(lead.form_title || lead.keyword_used) && (
            <div className="text-[10px] text-fg-dim mt-1 truncate">
              {lead.form_title || lead.keyword_used}
            </div>
          )}
          {seller && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-mono"
              style={{ background: `${seller.color}15`, color: seller.color, border: `1px solid ${seller.color}40` }}>
              👤 {seller.name}
            </div>
          )}
          {lead.tags.length > 0 && (
            <div
              className="mt-2 flex flex-wrap gap-1"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {lead.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[10px] font-medium"
                  style={{
                    background: 'rgba(94, 226, 255, 0.10)',
                    color: '#5EE2FF',
                    border: '1px solid rgba(94, 226, 255, 0.30)',
                  }}
                >
                  <span className="truncate max-w-[120px]">{t}</span>
                  {onRemoveTag && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onRemoveTag(t); }}
                      className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full hover:bg-white/[0.12] transition-colors"
                      aria-label={`Remover tag ${t}`}
                      title={`Remover tag "${t}"`}
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
                        <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Input de valor inline — fora do onClick pra não abrir modal ao editar */}
      <div
        className="mt-2 flex items-center gap-1 px-2 py-1 rounded-md transition-colors"
        style={{ background: 'rgba(16, 242, 160, 0.06)' }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[11px] text-fg-dim font-mono">R$</span>
        <input
          type="text"
          inputMode="decimal"
          value={valueInput}
          onChange={(e) => setValueInput(e.target.value)}
          onBlur={commitValue}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setValueInput(lead.deal_value !== null ? String(lead.deal_value) : '');
              (e.target as HTMLInputElement).blur();
            }
          }}
          draggable={false}
          placeholder="0,00"
          className="bg-transparent border-0 text-xs font-mono tabular text-emerald flex-1 focus:outline-none px-1"
          style={{ minWidth: 0 }}
        />
        {saving && <span className="text-[10px] text-fg-dim animate-pulse">…</span>}
      </div>
    </div>
  );
}

/* ============================================================
   Modal: editar lead (valor + notes)
   ============================================================ */

function AttrRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <div className="text-fg-dim text-[10px] uppercase tracking-wider">{label}</div>
      <div className="truncate text-sm font-medium" title={value || undefined}>{value || '—'}</div>
    </div>
  );
}

function LeadEditModal({
  lead, columns, sellers, onClose, onSaved,
}: {
  lead: KanbanLead;
  columns: KanbanColumn[];
  sellers: Seller[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useDialog();
  const [colId, setColId] = useState<string | null>(lead.kanban_column_id);
  const [sellerId, setSellerId] = useState<string | null>(lead.seller_id || null);
  const [dealValue, setDealValue] = useState<string>(lead.deal_value?.toString() || '');
  const [notes, setNotes] = useState(lead.notes || '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const val = dealValue.trim() ? Number(dealValue.replace(',', '.')) : null;
      // 1. Salva column/value/notes
      await apiFetch('/api/kanban/move', {
        method: 'POST',
        body: {
          lead_id: lead.id,
          origin: lead.origin,
          column_id: colId,
          deal_value: val,
          notes: notes.trim() || null,
        },
      });
      // 2. Salva vendedor se mudou
      if (sellerId !== (lead.seller_id || null)) {
        await apiFetch('/api/kanban/assign', {
          method: 'POST',
          body: { lead_id: lead.id, origin: lead.origin, seller_id: sellerId },
        });
      }
      onSaved();
      onClose();
    } catch (e: any) {
      notify(`Falha ao salvar: ${e?.message || 'erro'}`, 'danger');
    } finally { setBusy(false); }
  }

  return (
    <ModalShell onClose={onClose} title={lead.name || lead.phone || 'Lead'}>
      <div className="space-y-4">
        <div className="text-xs text-fg-dim font-mono">
          {lead.origin === 'form' ? '📝 Formulário' : lead.origin === 'manual' ? '✏️ Manual' : '🎯 Prospectado'}
          {lead.phone && ` · ${lead.phone}`}
          {lead.email && ` · ${lead.email}`}
        </div>

        {(lead.utm_campaign || lead.utm_content || lead.utm_term || lead.utm_source || lead.ad_platform || lead.geo_city || lead.geo_region) && (
          <div className="rounded-lg p-3" style={{ background: 'rgba(94,226,255,0.06)', border: '1px solid rgba(94,226,255,0.18)' }}>
            <div className="text-[11px] font-mono uppercase tracking-widest text-fg-dim mb-2">📢 Origem do anúncio</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <AttrRow label="Plataforma" value={lead.ad_platform || lead.utm_source} />
              <AttrRow label="Campanha" value={lead.utm_campaign} />
              <AttrRow label="Conjunto de anúncios" value={lead.utm_term} />
              <AttrRow label="Anúncio" value={lead.utm_content} />
              <AttrRow label="Região" value={[lead.geo_city, lead.geo_region, lead.geo_country].filter(Boolean).join(' · ') || null} />
            </div>
          </div>
        )}

        <label className="block">
          <span className="text-sm text-fg-muted">Coluna</span>
          <select
            value={colId || ''}
            onChange={(e) => setColId(e.target.value || null)}
            className="input mt-1 !text-base"
          >
            <option value="">— sem coluna —</option>
            {columns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm text-fg-muted">Vendedor</span>
          <select
            value={sellerId || ''}
            onChange={(e) => setSellerId(e.target.value || null)}
            className="input mt-1 !text-base"
          >
            <option value="">— sem vendedor —</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm text-fg-muted">Valor do negócio (R$)</span>
          <input
            type="text"
            inputMode="decimal"
            value={dealValue}
            onChange={(e) => setDealValue(e.target.value)}
            placeholder="0,00"
            className="input mt-1 !text-base font-mono"
          />
        </label>

        <label className="block">
          <span className="text-sm text-fg-muted">Anotações</span>
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input mt-1 resize-y"
            placeholder="Observações internas, próximos passos, etc."
          />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn btn-ghost !text-sm">Cancelar</button>
          <button type="button" onClick={save} disabled={busy} className="btn btn-primary !text-sm disabled:opacity-50">
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ============================================================
   Modal: criar/editar coluna
   ============================================================ */

function ColumnFormModal({
  mode, column, onClose, onSaved, onDelete,
}: {
  mode: 'create' | 'edit';
  column?: KanbanColumn;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
}) {
  const { notify } = useDialog();
  const [name, setName] = useState(column?.name || '');
  const [color, setColor] = useState(column?.color || COLOR_PRESETS[0]);
  const [kind, setKind] = useState<KanbanColumn['kind']>(column?.kind || 'custom');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (mode === 'create') {
        await apiFetch('/api/kanban/columns', {
          method: 'POST',
          body: { name: name.trim(), color },
        });
      } else if (column) {
        await apiFetch(`/api/kanban/columns/${column.id}`, {
          method: 'PATCH',
          body: { name: name.trim(), color, kind },
        });
      }
      onSaved();
      onClose();
    } catch (e: any) {
      notify(`Falha: ${e?.message || 'erro'}`, 'danger');
    } finally { setBusy(false); }
  }

  return (
    <ModalShell onClose={onClose} title={mode === 'create' ? 'Nova coluna' : 'Editar coluna'}>
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm text-fg-muted">Nome</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Qualificado, Reunião marcada, Venda fechada"
            className="input mt-1 !text-base"
            autoFocus
            maxLength={40}
          />
        </label>

        <div>
          <span className="text-sm text-fg-muted">Cor</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="h-8 w-8 rounded-full transition-transform hover:scale-110"
                style={{
                  background: c,
                  border: color === c ? '2px solid white' : '2px solid transparent',
                  boxShadow: color === c ? `0 0 12px ${c}80` : 'none',
                }}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        {mode === 'edit' && (
          <label className="block">
            <span className="text-sm text-fg-muted">Tipo (afeta métricas)</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as any)}
              className="input mt-1 !text-base"
            >
              <option value="custom">Normal</option>
              <option value="default">📥 Entrada (leads novos caem aqui)</option>
              <option value="qualified">✓ Qualificado</option>
              <option value="won">💰 Venda fechada</option>
              <option value="lost">✕ Perdido</option>
            </select>
          </label>
        )}

        <div className="flex justify-between items-center pt-2">
          {mode === 'edit' && onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="btn !text-sm"
              style={{ background: 'rgba(255,99,99,0.10)', color: '#FF6363', border: '1px solid rgba(255,99,99,0.35)' }}
            >
              🗑 Excluir
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost !text-sm">Cancelar</button>
            <button type="button" onClick={save} disabled={busy || !name.trim()} className="btn btn-primary !text-sm disabled:opacity-50">
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

/* ============================================================
   Modal shell genérico
   ============================================================ */

/* ============================================================
   Modal: Vendedores (CRUD inline)
   ============================================================ */

function SellersModal({
  sellers, onClose, onChanged,
}: {
  sellers: Seller[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { confirm, notify } = useDialog();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLOR_PRESETS[0]);
  const [busy, setBusy] = useState(false);

  async function addSeller() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await apiFetch('/api/kanban/sellers', {
        method: 'POST',
        body: { name: newName.trim(), color: newColor },
      });
      setNewName('');
      onChanged();
      notify(`Vendedor "${newName.trim()}" adicionado`, 'success');
    } catch (e: any) {
      notify(`Falha: ${e?.message || 'erro'}`, 'danger');
    } finally { setBusy(false); }
  }

  async function deleteS(s: Seller) {
    const ok = await confirm({
      title: `Excluir vendedor "${s.name}"?`,
      message: 'Leads atribuídos a esse vendedor ficam sem vendedor (não são apagados).',
      variant: 'danger',
      confirmLabel: 'Excluir vendedor',
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/kanban/sellers/${s.id}`, { method: 'DELETE' });
      onChanged();
      notify(`Vendedor "${s.name}" excluído`, 'success');
    } catch (e: any) { notify(`Falha: ${e?.message || 'erro'}`, 'danger'); }
  }

  async function toggleActive(s: Seller) {
    try {
      await apiFetch(`/api/kanban/sellers/${s.id}`, { method: 'PATCH', body: { active: !s.active } });
      onChanged();
    } catch (e: any) { notify(`Falha: ${e?.message || 'erro'}`, 'danger'); }
  }

  async function changeColor(s: Seller, color: string) {
    try {
      await apiFetch(`/api/kanban/sellers/${s.id}`, { method: 'PATCH', body: { color } });
      onChanged();
    } catch {}
  }

  return (
    <ModalShell onClose={onClose} title="👥 VENDEDORES">
      <div className="space-y-4">
        <div className="glass-inner p-4">
          <div className="text-xs text-fg-muted mb-2 font-mono uppercase tracking-widest">+ Adicionar vendedor</div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1 min-w-[200px]">
              <span className="text-xs text-fg-muted">Nome</span>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSeller()}
                placeholder="Ex: João Silva"
                maxLength={100}
                className="input !text-sm mt-1"
              />
            </label>
            <div>
              <span className="text-xs text-fg-muted">Cor</span>
              <div className="flex gap-1 mt-1">
                {COLOR_PRESETS.slice(0, 6).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className="h-6 w-6 rounded-full"
                    style={{
                      background: c,
                      border: newColor === c ? '2px solid white' : '2px solid transparent',
                    }}
                  />
                ))}
              </div>
            </div>
            <button type="button" onClick={addSeller} disabled={busy || !newName.trim()} className="btn btn-primary !text-sm disabled:opacity-50">
              {busy ? '…' : 'Adicionar'}
            </button>
          </div>
        </div>

        {sellers.length === 0 ? (
          <div className="text-center text-sm text-fg-muted py-8">Nenhum vendedor cadastrado.</div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {sellers.map((s) => (
              <div key={s.id} className="glass-inner p-3 flex items-center gap-3" style={{ opacity: s.active ? 1 : 0.5 }}>
                <div className="h-9 w-9 rounded-lg flex items-center justify-center text-sm font-semibold shrink-0"
                  style={{ background: `${s.color}22`, color: s.color, border: `1px solid ${s.color}40` }}>
                  {s.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{s.name}</div>
                  {!s.active && <div className="text-[11px] text-fg-dim">Inativo</div>}
                </div>
                <div className="flex gap-1">
                  {COLOR_PRESETS.slice(0, 6).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => changeColor(s, c)}
                      className="h-5 w-5 rounded-full transition-transform hover:scale-110"
                      style={{ background: c, border: s.color === c ? '2px solid white' : '2px solid transparent' }}
                    />
                  ))}
                </div>
                <button type="button" onClick={() => toggleActive(s)} className="btn btn-ghost !text-xs !py-1" title={s.active ? 'Desativar' : 'Reativar'}>
                  {s.active ? '⏸' : '▶'}
                </button>
                <button type="button" onClick={() => deleteS(s)} className="text-fg-dim hover:text-danger transition-colors p-1.5" title="Excluir">
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function ModalShell({
  title, children, onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
        <div className="flex items-center justify-between mb-5">
          <Kicker>{title}</Kicker>
          <button type="button" onClick={onClose} className="text-fg-muted hover:text-fg text-lg leading-none">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
