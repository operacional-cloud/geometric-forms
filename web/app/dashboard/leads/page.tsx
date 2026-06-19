import { requireTenantMember } from '@/lib/server/auth';
import { listLeadsUnified } from '@/lib/server/unifiedLeads';
import { PageHeader } from '@/components/ui';
import { LeadsClient } from './leads-client';

export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  const ctx = await requireTenantMember();
  let leads: any[] = [];
  let formCount = 0;
  let manualCount = 0;
  let prospectingCount = 0;
  try {
    const r = await listLeadsUnified(ctx, { limit: 500 });
    leads = r.leads;
    formCount = r.formCount;
    manualCount = r.manualCount;
    prospectingCount = r.prospectingCount;
  } catch {}

  const total = leads.length;

  return (
    <main className="container-edge py-12">
      <PageHeader
        kicker="LEADS · 003"
        title="Todos os leads."
        subtitle={`${total} no total · ${formCount} do formulário · ${manualCount} manuais · ${prospectingCount} prospectados`}
      />

      <LeadsClient
        leads={leads}
        formCount={formCount}
        manualCount={manualCount}
        prospectingCount={prospectingCount}
      />
    </main>
  );
}
