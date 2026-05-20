import { redirect } from 'next/navigation';
import { getSessionAndProfile } from '@/lib/supabase-server';
import { Header } from '@/components/Header';
import { LogoutButton } from '@/components/LogoutButton';
import { NavTabs } from '@/components/NavTabs';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getSessionAndProfile();
  if (!user) redirect('/login?next=/dashboard');
  return (
    <div className="min-h-screen">
      <Header
        variant="dashboard"
        rightSlot={
          <>
            <span className="hidden sm:inline">{profile?.full_name || user.email}</span>
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
