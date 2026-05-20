import Link from 'next/link';
import { requireTenantMember } from '@/lib/server/auth';
import { listForms, listLeads } from '@/lib/server/forms';
import { ArrowRight, Sparkline, Kicker, Empty } from '@/components/ui';
import { AnimatedCounter } from '@/components/AnimatedCounter';

type Form = { id: string; title: string; slug: string; is_active: boolean; qualification_threshold: number };
type Lead = { id: string; lead_score: number; is_qualified: boolean; status: string; created_at: string; form_id: string };

function bucketize(leads: Lead[]) {
  const days: number[] = Array.from({ length: 14 }, () => 0);
  const days_q: number[] = Array.from({ length: 14 }, () => 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const l of leads) {
    const d = new Date(l.created_at);
    const diff = Math.floor((today.getTime() - d.setHours(0, 0, 0, 0)) / 86400000);
    if (diff >= 0 && diff < 14) {
      const idx = 13 - diff;
      days[idx] += 1;
      if (l.is_qualified) days_q[idx] += 1;
    }
  }
  return { days, days_q };
}

export default async function DashboardOverview() {
  const ctx = await requireTenantMember();

  let forms: Form[] = [];
  let leads: Lead[] = [];
  try {
    const fr = await listForms(ctx);
    forms = fr.forms as Form[];
    const lr = await listLeads(ctx, { limit: 500 });
    leads = lr.leads as Lead[];
  } catch {}

  const totalLeads = leads.length;
  const qualified = leads.filter((l) => l.is_qualified).length;
  const activeForms = forms.filter((f) => f.is_active).length;
  const qualRate = totalLeads > 0 ? Math.round((qualified / totalLeads) * 100) : 0;
  const last7 = leads.filter((l) => new Date(l.created_at).getTime() > Date.now() - 7 * 86400000).length;
  const { days, days_q } = bucketize(leads);

  const stats = [
    { k: 'Total de leads',      v: totalLeads, sub: 'todos os tempos', spark: days },
    { k: 'Qualificados',        v: qualified,  sub: `${qualRate}% da base`, spark: days_q, accent: true },
    { k: 'Formulários ativos',  v: activeForms, sub: `${forms.length} no total` },
    { k: 'Últimos 7 dias',      v: last7,      sub: 'novos leads' },
  ];

  const formMap = new Map(forms.map((f) => [f.id, f.title]));

  return (
    <main className="container-edge py-12">
      <div className="mb-10">
        <Kicker>VISÃO GERAL · {new Date().toLocaleDateString('pt-BR')}</Kicker>
        <h1 className="mt-4 text-4xl md:text-5xl font-semibold tracking-tightest">
          Olá,{' '}
          <span className="text-brand-gradient italic font-display font-normal">
            {(ctx.profile.full_name || 'cliente').split(' ')[0]}.
          </span>
        </h1>
        <p className="mt-2 text-fg-muted">Status do seu funil de qualificação.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-12">
        {stats.map((s, i) => (
          <div key={s.k} className="glass-static p-6 relative overflow-hidden">
            <div className="kicker">/{String(i + 1).padStart(3, '0')} · {s.k}</div>
            <div className={`mt-4 text-4xl md:text-5xl font-semibold tracking-tightest ${s.accent ? 'text-brand-gradient' : 'stat-number'}`}>
              <AnimatedCounter value={s.v} />
            </div>
            <div className="mt-2 text-xs text-fg-muted">{s.sub}</div>
            {s.spark && (
              <div className="mt-4 opacity-90">
                <Sparkline points={s.spark} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="glass-static p-6">
          <div className="flex items-center justify-between pb-4 border-b border-line">
            <Kicker>FORMULÁRIOS · recentes</Kicker>
            <Link href="/dashboard/forms" className="link text-xs inline-flex items-center gap-1">
              ver todos <ArrowRight />
            </Link>
          </div>
          {forms.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-fg-muted text-sm">Nenhum formulário ainda.</p>
              <Link href="/dashboard/forms/new" className="link text-xs inline-flex items-center gap-1 mt-3">
                criar o primeiro <ArrowRight />
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {forms.slice(0, 4).map((f, i) => (
                <li key={f.id} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-[11px] text-fg-dim">{String(i + 1).padStart(2, '0')}</span>
                    <span className="truncate font-medium">{f.title}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`badge badge-dot ${f.is_active ? 'badge-success' : 'badge-warn'}`}>
                      {f.is_active ? 'ativo' : 'pausado'}
                    </span>
                    <Link href={`/dashboard/forms/${f.id}`} className="link text-xs">editar</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="glass-static p-6">
          <div className="flex items-center justify-between pb-4 border-b border-line">
            <Kicker>LEADS · recentes</Kicker>
            <Link href="/dashboard/leads" className="link text-xs inline-flex items-center gap-1">
              ver todos <ArrowRight />
            </Link>
          </div>
          {leads.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-fg-muted text-sm">Nenhum lead ainda.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {leads.slice(0, 4).map((l, i) => (
                <li key={l.id} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-[11px] text-fg-dim">{String(i + 1).padStart(2, '0')}</span>
                    <span className="font-mono tabular">{l.lead_score} pts</span>
                    {l.is_qualified && <span className="badge badge-success badge-dot">qualificado</span>}
                    <span className="text-xs text-fg-muted truncate">{formMap.get(l.form_id) || ''}</span>
                  </div>
                  <span className="text-xs text-fg-dim font-mono">
                    {new Date(l.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {forms.length === 0 && (
        <div className="mt-12">
          <Empty message="Você ainda não criou nenhum formulário." cta={{ href: '/dashboard/forms/new', label: 'Criar primeiro form' }} />
        </div>
      )}
    </main>
  );
}
