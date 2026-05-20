import { redirect } from 'next/navigation';
import { getAuthOrNull } from '@/lib/server/auth';
import { Header } from '@/components/Header';
import { LogoutButton } from '@/components/LogoutButton';
import { NavTabs } from '@/components/NavTabs';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthOrNull();
  if (!ctx) redirect('/login?next=/dashboard');

  return (
    <div className="min-h-screen">
      <Header
        variant="dashboard"
        rightSlot={
          <>
            <span className="hidden sm:inline">{ctx.profile?.full_name || ctx.user.email}</span>
            <LogoutButton />
          </>
        }
      />
      <NavTabs items={[
        { href: '/dashboard', label: 'Visão geral' },
        { href: '/dashboard/forms', label: 'Formulários' },
        { href: '/dashboard/leads', label: 'Leads' },
      ]} />
      <div>{children}</div>
    </div>
  );
}
