import { redirect } from 'next/navigation';
import { getAuthOrNull } from '@/lib/server/auth';
import { getActiveTenantId } from '@/lib/server/active-tenant';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { LogoutButton } from '@/components/LogoutButton';
import { Sidebar, SidebarShell, type SidebarItem } from '@/components/Sidebar';
import { ViewingAsBanner } from '@/components/ViewingAsBanner';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthOrNull();
  if (!ctx) redirect('/login?next=/dashboard');

  const isAdmin = ctx.profile?.role === 'admin';
  const activeTenantId = isAdmin ? getActiveTenantId(ctx) : null;

  // Pega nome do tenant pro banner (só quando admin está em modo view-as)
  let viewingTenant: { name: string; slug: string } | null = null;
  if (isAdmin && activeTenantId) {
    const { data } = await supabaseAdmin
      .from('tenants')
      .select('name, slug')
      .eq('id', activeTenantId)
      .maybeSingle();
    if (data) viewingTenant = data as any;
  }

  const items: SidebarItem[] = [
    ...(isAdmin ? [{ href: '/admin', label: 'Voltar pro Admin', iconKey: 'home' as const }] : []),
    { href: '/dashboard', label: 'Visão geral', iconKey: 'overview' },
    { href: '/dashboard/forms', label: 'Formulários', iconKey: 'forms' },
    { href: '/dashboard/leads', label: 'Leads', iconKey: 'leads' },
    { href: '/dashboard/kanban', label: 'Kanban', iconKey: 'kanban' },
    { href: '/dashboard/metrics', label: 'Métricas', iconKey: 'metrics' },
    { href: '/dashboard/ai-attendance', label: 'IA de Atendimento', iconKey: 'ai', locked: true },
    { href: '/dashboard/followup', label: 'Follow-up IA', iconKey: 'followup' },
    { href: '/dashboard/meta-ads-ai', label: 'Meta Ads IA', iconKey: 'ads_ai', locked: true },
    { href: '/dashboard/integrations', label: 'Integrações', iconKey: 'integrations', locked: true },
  ];

  return (
    <div className="min-h-screen">
      <Sidebar
        variant="dashboard"
        userLabel={ctx.profile?.full_name || ctx.user.email}
        items={items}
        bottomSlot={<LogoutButton />}
      />
      <SidebarShell>
        {viewingTenant && (
          <ViewingAsBanner tenantName={viewingTenant.name} tenantSlug={viewingTenant.slug} />
        )}
        {children}
      </SidebarShell>
    </div>
  );
}
