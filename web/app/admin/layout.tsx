import { redirect } from 'next/navigation';
import { getAuthOrNull } from '@/lib/server/auth';
import { Header } from '@/components/Header';
import { LogoutButton } from '@/components/LogoutButton';
import { NavTabs } from '@/components/NavTabs';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthOrNull();
  if (!ctx) redirect('/login?next=/admin');
  if (ctx.profile.role !== 'admin') redirect('/dashboard');

  return (
    <div className="min-h-screen">
      <Header
        variant="admin"
        rightSlot={
          <>
            <span className="hidden sm:inline">{ctx.user.email}</span>
            <LogoutButton />
          </>
        }
      />
      <NavTabs items={[{ href: '/admin', label: 'Clientes' }]} />
      <div>{children}</div>
    </div>
  );
}
