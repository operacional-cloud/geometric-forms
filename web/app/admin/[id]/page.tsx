import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSessionAndProfile } from '@/lib/supabase-server';
import { apiFetch } from '@/lib/api';
import {
  PageHeader, GhostButton, StatusBadge, Kicker, Empty,
} from '@/components/ui';

type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: 'active' | 'trial' | 'inactive';
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
};
type Form = {
  id: string;
  tenant_id: string;
  title: string;
  slug: string;
  is_active: boolean;
  qualification_threshold: number;
  fields: any[];
  created_at: string;
};
type Lead = {
  id: string;
  tenant_id: string;
  form_id: string;
  lead_score: number;
  is_qualified: boolean;
  status: string;
  created_at: string;
};

export default async function TenantDetailPage({ params }: { params: { id: string } }) {
  const { accessToken } = await getSessionAndProfile();

  let tenant: Tenant | null = null;
  let forms: Form[] = [];
  let leads: Lead[] = [];
  try {
    const tr = await apiFetch<{ data: { tenants: Tenant[] } }>('/api/admin/tenants', {
      token: accessToken,
    });
    tenant = tr.data.tenants.find((t) => t.id === params.id) ?? null;
    // Admin enxerga tudo via RLS — filtra client-side
    const fr = await apiFetch<{ data: { forms: Form[] } }>('/api/forms', { token: accessToken });
    forms = fr.data.forms.filter((f) => f.tenant_id === params.id);
    const lr = await apiFetch<{ data: { leads: Lead[] } }>('/api/leads?limit=1000', { token: accessToken });
    leads = lr.data.leads.filter((l) => l.tenant_id === params.id);
  } catch {}

  if (!tenant) notFound();

  const qualified = leads.filter((l) => l.is_qualified).length;
  const qualRate = leads.length > 0 ? Math.round((qualified / leads.length) * 100) : 0;
  const activeForms = forms.filter((f) => f.is_active).length;
  const formMap = new Map(forms.map((f) => [f.id, f.title]));
  const lastLeadAt = leads.length > 0
    ? leads.reduce((m, l) => (l.created_at > m ? l.created_at : m), '0')
    : null;

  return (
    <main className="container-edge py-12">
      <PageHeader
        kicker={`TENANT · /${tenant.slug}`}
        title={tenant.name}
        subtitle={`Visão geral do cliente · plano ${tenant.plan} · cadastrado em ${new Date(tenant.created_at).toLocaleDateString('pt-BR')}`}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={tenant.status} />
            <GhostButton href="/admin">← Tenants</GhostButton>
          </div>
        }
      />

      {/* IDENTITY CARD */}
      <section className="glass-static p-6 lg:p-7 mb-8 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-4">
          {tenant.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logo_url} alt={tenant.name} className="h-14 w-14 rounded-2xl ring-1 ring-white/10" />
          ) : (
            <div
              className="h-14 w-14 rounded-2xl ring-1 ring-white/10 flex items-center justify-center text-xl font-semibold"
              style={{ background: tenant.primary_color, color: '#0a0a0c' }}
            >
              {tenant.name.charAt(0)}
            </div>
          )}
          <div>
            <div className="text-xs text-fg-muted font-mono">tenant_id</div>
            <div className="font-mono text-sm break-all">{tenant.id}</div>
          </div>
        </div>
        <div className="flex items-center gap-6 ml-auto flex-wrap">
          <Field label="Slug" value={`/${tenant.slug}`} mono />
          <Field label="Plano" value={tenant.plan} />
          <Field label="Cor" value={
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded ring-1 ring-white/20" style={{ background: tenant.primary_color }} />
              <span className="font-mono">{tenant.primary_color}</span>
            </span>
          } />
        </div>
      </section>

      {/* STATS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <BigStat label="Formulários" value={forms.length} sub={`${activeForms} ativos`} />
        <BigStat label="Leads" value={leads.length} sub="todos os tempos" />
        <BigStat label="Qualificados" value={qualified} sub={`${qualRate}% do total`} tone="emerald" />
        <BigStat
          label="Último lead"
          value={lastLeadAt ? relativeDate(lastLeadAt) : '—'}
          sub={lastLeadAt ? new Date(lastLeadAt).toLocaleDateString('pt-BR') : 'sem leads'}
          small
        />
      </div>

      {/* FORMS */}
      <section className="mb-12">
        <div className="flex items-center justify-between pb-4 border-b border-line mb-4 gap-4 flex-wrap">
          <Kicker>FORMULÁRIOS · {forms.length}</Kicker>
          <div className="flex items-center gap-2">
            {forms.length > 0 && (
              <span className="text-xs text-fg-muted font-mono hidden sm:inline">/f/{tenant.slug}/...</span>
            )}
            <Link href={`/admin/${tenant.id}/forms/new`} className="btn btn-primary !py-1.5 !px-3 !text-xs">
              + Novo formulário
            </Link>
          </div>
        </div>

        {forms.length === 0 ? (
          <Empty
            message="Esse cliente ainda não tem nenhum formulário."
            cta={{ href: `/admin/${tenant.id}/forms/new`, label: '+ Criar primeiro formulário' }}
          />
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {forms.map((f, i) => {
              const formLeads = leads.filter((l) => l.form_id === f.id);
              return (
                <div key={f.id} className="glass-static p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-[11px] text-fg-dim">/{String(i + 1).padStart(3, '0')}</div>
                      <h4 className="mt-1 font-semibold truncate">{f.title}</h4>
                      <div className="text-xs text-fg-muted font-mono mt-1 truncate">/{f.slug}</div>
                    </div>
                    <span className={`badge badge-dot ${f.is_active ? 'badge-success' : 'badge-muted'}`}>
                      {f.is_active ? 'ativo' : 'pausado'}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <Mini label="Campos" value={f.fields?.length || 0} />
                    <Mini label="Leads" value={formLeads.length} />
                    <Mini label="Thr" value={f.qualification_threshold} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Link
                      href={`/dashboard/forms/${f.id}`}
                      className="btn btn-ghost !py-1.5 !text-xs justify-center"
                    >
                      Editar
                    </Link>
                    <a
                      href={`/f/${tenant.slug}/${f.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost !py-1.5 !text-xs justify-center"
                    >
                      Abrir ↗
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* RECENT LEADS */}
      <section>
        <div className="flex items-center justify-between pb-4 border-b border-line mb-4">
          <Kicker>LEADS · recentes</Kicker>
          <span className="text-xs text-fg-muted">{leads.length} no total</span>
        </div>

        {leads.length === 0 ? (
          <Empty message="Esse cliente ainda não recebeu leads." />
        ) : (
          <div className="glass-static overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.02]">
                <tr className="border-b border-line">
                  <th className="text-left py-3 px-4 kicker !mb-0">#</th>
                  <th className="text-left py-3 px-4 kicker !mb-0">Pontos</th>
                  <th className="text-left py-3 px-4 kicker !mb-0">Formulário</th>
                  <th className="text-left py-3 px-4 kicker !mb-0">Status</th>
                  <th className="text-right py-3 px-4 kicker !mb-0">Data</th>
                </tr>
              </thead>
              <tbody>
                {leads.slice(0, 20).map((l, i) => (
                  <tr key={l.id} className="border-b border-line/40 hover:bg-white/[0.02]">
                    <td className="py-3 px-4 font-mono text-xs text-fg-dim">{String(i + 1).padStart(3, '0')}</td>
                    <td className="py-3 px-4">
                      <span className={`tabular font-semibold ${l.is_qualified ? 'text-emerald' : ''}`}>
                        {l.lead_score}
                      </span>
                      {l.is_qualified && <span className="ml-2 badge badge-success badge-dot">QL</span>}
                    </td>
                    <td className="py-3 px-4 text-fg-muted">{formMap.get(l.form_id) || '—'}</td>
                    <td className="py-3 px-4"><span className="badge">{l.status}</span></td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-fg-muted">
                      {new Date(l.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="kicker !mb-1">{label}</div>
      <div className={mono ? 'font-mono text-sm' : 'text-sm'}>{value}</div>
    </div>
  );
}

function BigStat({
  label, value, sub, tone, small,
}: {
  label: string;
  value: any;
  sub?: string;
  tone?: 'emerald';
  small?: boolean;
}) {
  return (
    <div className="glass-static p-5">
      <div className="kicker">{label}</div>
      <div className={`mt-3 font-semibold tracking-tightest tabular ${
        small ? 'text-2xl' : 'text-4xl'
      } ${tone === 'emerald' ? 'text-emerald' : 'stat-number'}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-fg-muted">{sub}</div>}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: any }) {
  return (
    <div className="glass-inner py-2 px-2">
      <div className="text-[10px] text-fg-dim uppercase tracking-widest">{label}</div>
      <div className="tabular font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
