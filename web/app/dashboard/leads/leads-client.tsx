'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { whatsappLink, formatPhone } from '@/lib/contact';
import { apiFetch } from '@/lib/api';
import { Kicker } from '@/components/ui';
import { useDialog } from '@/components/Dialog';

type LeadOrigin = 'form' | 'manual' | 'prospecting';

type UnifiedLead = {
  id: string;
  origin: LeadOrigin;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  created_at: string;
  form_id?: string | null;
  form_title?: string | null;
  lead_score?: number | null;
  is_qualified?: boolean | null;
  is_complete?: boolean | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  ad_platform?: string | null;
  geo_country?: string | null;
  geo_region?: string | null;
  geo_city?: string | null;
  keyword_used?: string | null;
  source_url?: string | null;
  metadata?: Record<string, any> | null;
  seller_id?: string | null;
};

type Seller = { id: string; name: string; color: string; active: boolean };

type Filter = 'all' | LeadOrigin;

export function LeadsClient({
  leads: initialLeads,
}: {
  leads: UnifiedLead[];
  formCount: number;
  manualCount: number;
  prospectingCount: number;
}) {
  const router = useRouter();
  const { confirm, notify } = useDialog();
  const [filter, setFilter] = useState<Filter>('all');
  const [leads, setLeads] = useState<UnifiedLead[]>(initialLeads);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [sellers, setSellers] = useState<Seller[]>([]);

  useEffect(() => {
    apiFetch<{ data: { sellers: Seller[] } }>('/api/kanban/sellers')
      .then((r) => setSellers(r.data.sellers))
      .catch(() => {});
  }, []);

  const sellerMap = useMemo(() => new Map(sellers.map((s) => [s.id, s])), [sellers]);

  async function assignSeller(lead: UnifiedLead, sellerId: string | null) {
    // Otimista
    setLeads((prev) => prev.map((l) =>
      l.origin === lead.origin && l.id === lead.id ? { ...l, seller_id: sellerId } : l
    ));
    try {
      await apiFetch('/api/kanban/assign', {
        method: 'POST',
        body: { lead_id: lead.id, origin: lead.origin, seller_id: sellerId },
      });
    } catch (e: any) {
      notify(`Falha ao atribuir vendedor: ${e?.message || 'erro'}`, 'danger');
      router.refresh();
    }
  }

  const counts = useMemo(() => ({
    form: leads.filter((l) => l.origin === 'form').length,
    manual: leads.filter((l) => l.origin === 'manual').length,
    prospecting: leads.filter((l) => l.origin === 'prospecting').length,
  }), [leads]);

  const visible = useMemo(() => {
    if (filter === 'all') return leads;
    return leads.filter((l) => l.origin === filter);
  }, [leads, filter]);

  async function onDelete(lead: UnifiedLead) {
    const label = lead.name || formatPhone(lead.phone || '') || 'este lead';
    const ok = await confirm({
      title: 'Excluir lead?',
      message: `"${label}" será removido permanentemente do banco. Essa ação não pode ser desfeita.`,
      variant: 'danger',
      confirmLabel: 'Sim, excluir',
    });
    if (!ok) return;
    setDeletingId(`${lead.origin}-${lead.id}`);
    try {
      const url = lead.origin === 'prospecting'
        ? `/api/prospecting/leads/${lead.id}`
        : `/api/leads/${lead.id}`;
      await apiFetch(url, { method: 'DELETE' });
      setLeads((prev) => prev.filter((l) => !(l.origin === lead.origin && l.id === lead.id)));
      notify(`Lead "${label}" excluído`, 'success');
      router.refresh();
    } catch (e: any) {
      notify(`Falha ao excluir: ${e?.message || 'erro desconhecido'}`, 'danger');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: filtros + botão adicionar */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-1 p-1 rounded-xl glass-inner inline-flex">
          <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>
            Todos <span className="ml-1 text-fg-dim">· {leads.length}</span>
          </FilterButton>
          <FilterButton active={filter === 'form'} onClick={() => setFilter('form')}>
            📝 Formulário <span className="ml-1 text-fg-dim">· {counts.form}</span>
          </FilterButton>
          <FilterButton active={filter === 'manual'} onClick={() => setFilter('manual')}>
            ✏️ Manual <span className="ml-1 text-fg-dim">· {counts.manual}</span>
          </FilterButton>
          <FilterButton active={filter === 'prospecting'} onClick={() => setFilter('prospecting')}>
            🎯 Prospectados <span className="ml-1 text-fg-dim">· {counts.prospecting}</span>
          </FilterButton>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="btn btn-primary !text-sm !py-2"
        >
          + Novo lead manual
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="glass-static p-12 text-center text-sm text-fg-muted">
          {leads.length === 0
            ? 'Nenhum lead ainda. Adicione manualmente, publique um form ou peça pro admin prospectar.'
            : 'Nenhum lead nesse filtro.'}
        </div>
      ) : (
        <div className="glass-static overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02]">
              <tr className="border-b border-line">
                <th className="text-left py-3 px-4 kicker !mb-0">#</th>
                <th className="text-left py-3 px-4 kicker !mb-0">Origem</th>
                <th className="text-left py-3 px-4 kicker !mb-0">Contato</th>
                <th className="text-left py-3 px-4 kicker !mb-0">Vendedor</th>
                <th className="text-left py-3 px-4 kicker !mb-0">Detalhe</th>
                <th className="text-left py-3 px-4 kicker !mb-0">WhatsApp</th>
                <th className="text-right py-3 px-4 kicker !mb-0">Data</th>
                <th className="text-right py-3 px-4 kicker !mb-0">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((l, i) => {
                const wa = l.phone ? whatsappLink(l.phone, l.name ? `Olá ${l.name.split(' ')[0]}!` : undefined) : null;
                return (
                  <tr key={`${l.origin}-${l.id}`} className="border-b border-line/50 hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-fg-dim">{String(i + 1).padStart(3, '0')}</td>
                    <td className="py-3 px-4">
                      <OriginBadge origin={l.origin} />
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium truncate max-w-[200px] flex items-center gap-2">
                        <span className="truncate">{l.name || <span className="text-fg-muted">—</span>}</span>
                        {l.origin === 'form' && l.is_qualified && (
                          <span className="badge badge-success badge-dot !py-0 !px-1.5 !text-[9px]">QL</span>
                        )}
                        {l.origin === 'form' && l.is_complete === false && (
                          <span className="badge badge-warn !py-0 !px-1.5 !text-[9px]">incompleto</span>
                        )}
                      </div>
                      <div className="text-xs text-fg-muted font-mono mt-0.5 truncate max-w-[200px]">
                        {l.email || formatPhone(l.phone || '')}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <SellerSelect
                        value={l.seller_id || null}
                        sellers={sellers}
                        sellerMap={sellerMap}
                        onChange={(sid) => assignSeller(l, sid)}
                      />
                    </td>
                    <td className="py-3 px-4">
                      {l.origin === 'form' ? (
                        <FormDetail lead={l} />
                      ) : l.origin === 'manual' ? (
                        <ManualDetail lead={l} />
                      ) : (
                        <ProspectingDetail lead={l} />
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {wa ? (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn !py-1 !px-2 !text-[11px] !rounded-md"
                          style={{ background: 'linear-gradient(180deg, #25D366 0%, #128C7E 100%)', color: '#fff' }}
                        >
                          chamar ↗
                        </a>
                      ) : <span className="text-xs text-fg-dim">—</span>}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-fg-muted">
                      {new Date(l.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onDelete(l)}
                        disabled={deletingId === `${l.origin}-${l.id}`}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md text-fg-dim hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-40 disabled:cursor-wait"
                        title="Excluir lead"
                        aria-label="Excluir lead"
                      >
                        {deletingId === `${l.origin}-${l.id}` ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="animate-spin">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                          </svg>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <AddManualLeadModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => { setShowAddModal(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? 'bg-brand/20 text-brand' : 'text-fg-muted hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}

function OriginBadge({ origin }: { origin: LeadOrigin }) {
  if (origin === 'form') {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono uppercase tracking-wider"
        style={{ background: 'rgba(94, 226, 255, 0.10)', color: '#5EE2FF', border: '1px solid rgba(94, 226, 255, 0.30)' }}
        title="Lead capturado via formulário"
      >
        📝 Formulário
      </span>
    );
  }
  if (origin === 'manual') {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono uppercase tracking-wider"
        style={{ background: 'rgba(166, 110, 252, 0.10)', color: '#A66EFC', border: '1px solid rgba(166, 110, 252, 0.30)' }}
        title="Adicionado manualmente pelo time"
      >
        ✏️ Add manual
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono uppercase tracking-wider"
      style={{ background: 'rgba(16, 242, 160, 0.10)', color: '#10F2A0', border: '1px solid rgba(16, 242, 160, 0.30)' }}
      title="Lead obtido via prospecção ativa"
    >
      🎯 Prospectado
    </span>
  );
}

function FormDetail({ lead }: { lead: UnifiedLead }) {
  return (
    <div>
      {lead.form_id && lead.form_title && (
        <Link href={`/dashboard/forms/${lead.form_id}/leads`} className="link text-xs">
          {lead.form_title}
        </Link>
      )}
      <div className="text-[11px] text-fg-dim font-mono mt-0.5 flex items-center gap-2 flex-wrap">
        <span className="tabular">pts {lead.lead_score ?? 0}</span>
        {(lead.ad_platform || lead.utm_source) && <span>· {lead.ad_platform || lead.utm_source}</span>}
      </div>
      {(lead.utm_campaign || lead.utm_term || lead.utm_content || lead.geo_city || lead.geo_region) && (
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          {lead.utm_campaign && <AttrMini label="Campanha" value={lead.utm_campaign} />}
          {lead.utm_term && <AttrMini label="Conjunto" value={lead.utm_term} />}
          {lead.utm_content && <AttrMini label="Anúncio" value={lead.utm_content} />}
          {(lead.geo_city || lead.geo_region) && (
            <AttrMini label="Região" value={[lead.geo_city, lead.geo_region].filter(Boolean).join(' · ')} />
          )}
        </div>
      )}
    </div>
  );
}

function AttrMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="text-fg-dim uppercase tracking-wider">{label}: </span>
      <span className="text-fg-muted" title={value}>{value}</span>
    </div>
  );
}

function SellerSelect({ value, sellers, sellerMap, onChange }: {
  value: string | null;
  sellers: Seller[];
  sellerMap: Map<string, Seller>;
  onChange: (sellerId: string | null) => void;
}) {
  const current = value ? sellerMap.get(value) : null;
  const active = sellers.filter((s) => s.active || s.id === value);
  if (active.length === 0) {
    return (
      <a href="/dashboard/kanban" className="text-[11px] text-fg-dim link">+ Cadastrar</a>
    );
  }
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="bg-transparent border-0 text-xs focus:outline-none cursor-pointer rounded px-1 py-0.5"
      style={{
        color: current?.color || '#A8B7BB',
        background: current ? `${current.color}15` : 'transparent',
        border: current ? `1px solid ${current.color}40` : '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <option value="">— sem vendedor —</option>
      {active.map((s) => (
        <option key={s.id} value={s.id}>{s.name}{!s.active ? ' (inativo)' : ''}</option>
      ))}
    </select>
  );
}

function ManualDetail({ lead }: { lead: UnifiedLead }) {
  const phone = lead.phone || '—';
  return (
    <div>
      <div className="text-xs text-fg">Cadastro manual</div>
      <div className="text-[11px] text-fg-dim font-mono mt-0.5 truncate max-w-[200px]">{phone}</div>
    </div>
  );
}

function ProspectingDetail({ lead }: { lead: UnifiedLead }) {
  const meta = lead.metadata || {};
  return (
    <div>
      <div className="text-xs text-fg truncate max-w-[200px]">{lead.keyword_used || '—'}</div>
      <div className="text-[11px] text-fg-dim font-mono mt-0.5 flex items-center gap-2">
        <span>{meta.origin === 'telelistas' ? 'telelistas' : meta.origin === 'osm' ? 'osm' : '—'}</span>
        {meta.is_mobile === false && <span className="text-warn">fixo</span>}
        {meta.is_mobile === true && <span className="text-emerald">móvel</span>}
      </div>
    </div>
  );
}

/* ============================================================
   Modal: novo lead manual
   ============================================================ */

function AddManualLeadModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save() {
    if (!name.trim() && !phone.trim() && !email.trim()) {
      setError('Preencha pelo menos um campo: nome, telefone ou email.');
      return;
    }
    setBusy(true); setError(null);
    try {
      const val = dealValue.trim() ? Number(dealValue.replace(/\./g, '').replace(',', '.')) : null;
      await apiFetch('/api/leads/manual-client', {
        method: 'POST',
        body: {
          name: name.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          notes: notes.trim() || null,
          deal_value: val,
        },
      });
      onCreated();
    } catch (e: any) {
      setError(e?.message || 'Falha ao criar lead.');
    } finally { setBusy(false); }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-md w-full p-6 rounded-xl"
        style={{ background: '#0B1314', border: '1px solid rgba(166, 110, 252, 0.30)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <Kicker>✏️ NOVO LEAD MANUAL</Kicker>
          <button type="button" onClick={onClose} className="text-fg-muted hover:text-fg text-lg leading-none">✕</button>
        </div>

        <p className="text-xs text-fg-muted mb-5">
          Adiciona um lead direto na sua base. Vai aparecer com etiqueta <strong>✏️ Add manual</strong> em todos os lugares (Leads, Kanban, Métricas).
        </p>

        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-fg-muted">Nome</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input mt-1 !text-base" autoFocus maxLength={200} />
            </label>
            <label className="block">
              <span className="text-sm text-fg-muted">Telefone</span>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="11 99999-9999" className="input mt-1 !text-base font-mono" />
            </label>
          </div>
          <label className="block">
            <span className="text-sm text-fg-muted">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input mt-1 !text-base" />
          </label>
          <label className="block">
            <span className="text-sm text-fg-muted">Valor do negócio (R$)</span>
            <input type="text" inputMode="decimal" value={dealValue} onChange={(e) => setDealValue(e.target.value)} placeholder="0,00" className="input mt-1 !text-base font-mono" />
          </label>
          <label className="block">
            <span className="text-sm text-fg-muted">Anotações</span>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="input mt-1 resize-y" />
          </label>
        </div>

        {error && (
          <div className="mt-4 rounded-md px-3 py-2 text-sm" style={{ background: 'rgba(255,99,99,0.08)', color: '#FF8B8B', border: '1px solid rgba(255,99,99,0.30)' }}>
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost !text-sm">Cancelar</button>
          <button type="button" onClick={save} disabled={busy} className="btn btn-primary !text-sm disabled:opacity-50">
            {busy ? 'Adicionando…' : '+ Adicionar lead'}
          </button>
        </div>
      </div>
    </div>
  );
}
