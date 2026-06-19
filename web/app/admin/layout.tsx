import { redirect } from 'next/navigation';
import { getAuthOrNull } from '@/lib/server/auth';
import { LogoutButton } from '@/components/LogoutButton';
import { Sidebar, SidebarShell } from '@/components/Sidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthOrNull();
  if (!ctx) redirect('/login?next=/admin');
  if (ctx.profile.role !== 'admin') redirect('/dashboard');

  return (
    <div className="min-h-screen">
      <Sidebar
        variant="admin"
        userLabel={ctx.user.email}
        items={[
          { href: '/admin', label: 'Clientes', iconKey: 'clients' },
          { href: '/admin/prospecting', label: 'Prospecção', iconKey: 'prospecting' },
          { href: '/admin/whatsapp', label: 'WhatsApp', iconKey: 'whatsapp', badge: 'BETA' },
        ]}
        bottomSlot={<LogoutButton />}
      />
      <SidebarShell>{children}</SidebarShell>
    </div>
  );
}
