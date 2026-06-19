import { requireAdmin } from '@/lib/server/auth';
import { listTenants } from '@/lib/server/tenants';
import { PageHeader } from '@/components/ui';
import { WhatsAppAdminClient } from './whatsapp-admin-client';

export const dynamic = 'force-dynamic';

export default async function AdminWhatsAppPage() {
  await requireAdmin();
  const { tenants } = await listTenants();
  const tenantOptions = (tenants as any[]).map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
  }));

  return (
    <main className="container-edge py-12">
      <PageHeader
        kicker="WHATSAPP · IA QUALIFIER · ADMIN"
        title="WhatsApp."
        subtitle="Conecte um número via QR, deixe a IA qualificar leads antes de passar pro cliente."
      />
      <WhatsAppAdminClient tenants={tenantOptions} />
    </main>
  );
}
