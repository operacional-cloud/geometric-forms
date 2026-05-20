'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Kicker } from '@/components/ui';
import { FormCard } from './form-card';

type Form = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  qualification_threshold: number;
  fields: any[];
  created_at: string;
  updated_at: string;
};
type Stat = {
  formId: string;
  total: number;
  qualified: number;
  rate: number;
  lastAt: string | null;
};

export function FormsClient({
  forms, stats, totalLeads, tenantSlug,
}: {
  forms: Form[];
  stats: Stat[];
  totalLeads: number;
  tenantSlug: string | null;
}) {
  const [tab, setTab] = useState<'forms' | 'analysis'>('forms');
  const [selectedForm, setSelectedForm] = useState<string>('all');
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);

  const statById = useMemo(
    () => new Map(stats.map((s) => [s.formId, s])),
    [stats]
  );

  const activeCount = forms.filter((f) => f.is_active).length;

  return (
    <div className="space-y-8">
      {/* ============ STATS TOP CARDS ============ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Total de Formulários"
          value={forms.length}
          icon={<DocIcon />}
          tone="brand"
        />
        <StatCard
          label="Formulários Ativos"
          value={activeCount}
          icon={<CheckIcon />}
          tone="emerald"
        />
        <StatCard
          label="Total de Respostas"
          value={totalLeads}
          icon={<UsersIcon />}
          tone="cyan"
        />
      </div>

      {/* ============ TABS ============ */}
      <div className="flex items-center gap-1 border-b border-line">
        <TabButton active={tab === 'forms'} onClick={() => setTab('forms')} icon={<DocIcon small />}>
          Formulários
        </TabButton>
        <TabButton active={tab === 'analysis'} onClick={() => setTab('analysis')} icon={<SearchIcon />}>
          Análise de leads
        </TabButton>
      </div>

      {/* ============ REPORT PANEL ============ */}
      <div className="glass-static p-5 lg:p-6 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/60 to-transparent" />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Kicker>RELATÓRIO DE PERFORMANCE POR FORMULÁRIO</Kicker>
          <button className="btn btn-ghost !py-1.5 !px-3 !text-xs">
            <FilterIcon /> Abrir Relatório
          </button>
        </div>

        <div className="mt-5 grid lg:grid-cols-[1fr_180px_180px_120px] gap-3 items-end">
          <label className="block">
            <span className="kicker !mb-1">Formulário</span>
            <select
              className="input mt-1"
              value={selectedForm}
              onChange={(e) => setSelectedForm(e.target.value)}
            >
              <option value="all">Todos os Formulários</option>
              {forms.map((f) => (
                <option key={f.id} value={f.id}>{f.title}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="kicker !mb-1">De</span>
            <input type="date" className="input mt-1 font-mono !text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block">
            <span className="kicker !mb-1">Até</span>
            <input type="date" className="input mt-1 font-mono !text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button type="button" className="btn btn-primary !py-2.5 !justify-center">
            <ChartIcon /> Gerar
          </button>
        </div>
      </div>

      {/* ============ TAB CONTENT ============ */}
      {tab === 'forms' ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {forms.map((f, i) => {
            const s = statById.get(f.id) || { total: 0, qualified: 0, rate: 0, lastAt: null, formId: f.id };
            const isFiltered = selectedForm !== 'all' && selectedForm !== f.id;
            if (isFiltered) return null;
            return (
              <FormCard
                key={f.id}
                form={f as any}
                stat={s}
                index={i}
                tenantSlug={tenantSlug}
              />
            );
          })}
        </div>
      ) : (
        // ANALYSIS TAB
        <div className="space-y-4">
          {forms.map((f) => {
            const s = statById.get(f.id);
            if (!s) return null;
            return (
              <div key={f.id} className="glass-static p-5 flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{f.title}</div>
                  <div className="text-xs text-fg-muted font-mono mt-1">/{f.slug}</div>
                </div>
                <div className="flex items-center gap-6">
                  <Cell label="Respostas" value={s.total} />
                  <Cell label="Qualificados" value={s.qualified} tone="emerald" />
                  <Cell label="Taxa" value={`${s.rate}%`} tone="emerald" />
                  <Link href={`/dashboard/forms/${f.id}/leads`} className="btn btn-ghost !py-1.5 !px-3 !text-xs">
                    Ver leads →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Inner pieces
   ============================================================ */

function StatCard({
  label, value, icon, tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: 'brand' | 'emerald' | 'cyan';
}) {
  const toneClasses =
    tone === 'brand'   ? 'bg-brand/10 text-brand'
    : tone === 'emerald' ? 'bg-emerald/10 text-emerald'
    : 'bg-cyan/10 text-cyan';
  return (
    <div className="glass-static p-5 lg:p-6 relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-fg-muted">{label}</div>
          <div className="mt-3 text-4xl font-semibold tracking-tightest tabular stat-number">
            {value}
          </div>
        </div>
        <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${toneClasses}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active, onClick, children, icon,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-4 py-2.5 text-sm font-medium rounded-t-md transition-colors flex items-center gap-2 ${
        active ? 'text-fg bg-white/[0.04]' : 'text-fg-muted hover:text-fg'
      }`}
    >
      {icon}
      {children}
      {active && (
        <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-gradient-to-r from-brand/40 via-brand to-brand/40 rounded-full" />
      )}
    </button>
  );
}

function Cell({ label, value, tone }: { label: string; value: any; tone?: 'emerald' }) {
  return (
    <div className="text-right">
      <div className="kicker !mb-0.5">{label}</div>
      <div className={`text-lg font-semibold tabular ${tone === 'emerald' ? 'text-emerald' : ''}`}>{value}</div>
    </div>
  );
}

/* ============================================================
   Icons (inline SVG, herdam currentColor)
   ============================================================ */

function DocIcon({ small }: { small?: boolean }) {
  const s = small ? 14 : 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" strokeWidth="1.7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h6M9 9h1" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="1.7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
function ChartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 14l3-3 4 4 5-6" />
    </svg>
  );
}
function FilterIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M6 12h12M10 18h4" />
    </svg>
  );
}
