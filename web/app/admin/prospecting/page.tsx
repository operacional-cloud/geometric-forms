import { requireAdmin } from '@/lib/server/auth';
import { listTenants } from '@/lib/server/tenants';
import { listNiches, listStatesBR } from '@/lib/server/prospecting';
import { PageHeader } from '@/components/ui';
import { AdminProspectingClient } from './admin-prospecting-client';

export const dynamic = 'force-dynamic';

type TenantOption = { id: string; name: string; slug: string };

export default async function AdminProspectingPage() {
  await requireAdmin();
  const { tenants } = await listTenants();
  const tenantOptions: TenantOption[] = (tenants as any[]).map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
  }));

  return (
    <main className="container-edge py-12">
      <PageHeader
        kicker="PROSPECÇÃO ATIVA · OUTBOUND · ADMIN"
        title="Prospecção."
        subtitle="Escolha o cliente, capture números públicos de WhatsApp por nicho e dispare campanhas."
      />

      <AdminProspectingClient
        tenants={tenantOptions}
        niches={listNiches()}
        states={listStatesBR()}
      />
    </main>
  );
}
