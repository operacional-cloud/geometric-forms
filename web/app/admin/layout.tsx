import { redirect } from 'next/navigation';
import { getSessionAndProfile } from '@/lib/supabase-server';
import { Header } from '@/components/Header';
import { LogoutButton } from '@/components/LogoutButton';
import { NavTabs } from '@/components/NavTabs';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getSessionAndProfile();
  if (!user) redirect('/login?next=/admin');
  if (profile?.role !== 'admin') redirect('/dashboard');

  return (
    <div className="min-h-screen">
      <Header
        variant="admin"
        rightSlot={
          <>
            <span className="hidden sm:inline">{user.email}</span>
            <LogoutButton />
          </>
        }
      />
      <NavTabs items={[
        { href: '/admin', label: 'Clientes' },
      ]} />
      <div>{children}</div>
    </div>
  );
}
