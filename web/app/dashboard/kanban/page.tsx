import { requireTenantMember } from '@/lib/server/auth';
import { listKanbanColumns, listAllLeadsForKanban } from '@/lib/server/kanban';
import { PageHeader } from '@/components/ui';
import { KanbanClient } from './kanban-client';

export const dynamic = 'force-dynamic';

export default async function KanbanPage() {
  await requireTenantMember();
  let columns: any[] = [];
  let leads: any[] = [];
  try {
    const ctx = await requireTenantMember();
    [columns, leads] = await Promise.all([
      listKanbanColumns(ctx),
      listAllLeadsForKanban(ctx),
    ]);
  } catch {}

  return (
    <main className="container-edge py-12">
      <PageHeader
        kicker="PIPELINE · KANBAN"
        title="Kanban."
        subtitle="Arraste leads entre as colunas. Personalize colunas conforme seu funil de vendas."
      />
      <KanbanClient initialColumns={columns} initialLeads={leads} />
    </main>
  );
}
