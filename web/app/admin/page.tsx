import Link from 'next/link';
import { requireAdmin } from '@/lib/server/auth';
import { listTenants } from '@/lib/server/tenants';
import {
  PageHeader, GradientButton, ArrowRight, StatusBadge, Empty,
} from '@/components/ui';

type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: 'active' | 'trial' | 'inactive';
  primary_color: string;
  created_at: string;
};

export default async function AdminHome() {
  await requireAdmin();
  let tenants: Tenant[] = [];
  let error: string | null = null;
  try {
    const r = await listTenants();
    tenants = r.tenants as Tenant[];
  } catch (e: any) { error = e.message; }

  const totals = {
    all: tenants.length,
    active: tenants.filter((t) => t.status === 'active').length,
    trial: tenants.filter((t) => t.status === 'trial').length,
  };

  return (
    <main className="container-edge py-12">
      <PageHeader
        kicker="TODOS OS CLIENTES · 001"
        title="Clientes."
        subtitle={`${totals.all} clientes · ${totals.active} ativos · ${totals.trial} em avaliação`}
        action={<GradientButton href="/admin/new">+ Novo cliente <ArrowRight /></GradientButton>}
      />

      {error && <div className="badge badge-danger mb-8">ERRO: {error}</div>}

      {tenants.length === 0 && !error && (
        <Empty message="Nenhum cliente cadastrado ainda." cta={{ href: '/admin/new', label: 'Cadastrar o primeiro' }} />
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {tenants.map((t, i) => (
          <Link key={t.id} href={`/admin/${t.id}`} className="glass lift p-6 block">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] text-fg-dim tracking-widest">
                /{String(i + 1).padStart(3, '0')}
              </span>
              <StatusBadge status={t.status} />
            </div>
            <div className="mt-6 flex items-center gap-3">
              <span
                className="h-9 w-9 rounded-lg ring-1 ring-white/10"
                style={{ background: t.primary_color || '#10F2A0' }}
                aria-hidden
              />
              <div className="min-w-0">
                <div className="font-semibold tracking-tightest text-lg truncate">{t.name}</div>
                <div className="font-mono text-xs text-fg-dim truncate">/{t.slug}</div>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-line flex items-center justify-between text-xs text-fg-muted">
              <span className="font-mono uppercase tracking-wider">{t.plan}</span>
              <span className="link inline-flex items-center gap-1">abrir <ArrowRight /></span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
