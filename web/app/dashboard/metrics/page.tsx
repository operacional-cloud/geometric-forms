import { requireTenantMember } from '@/lib/server/auth';
import { getActiveTenantId } from '@/lib/server/active-tenant';
import { getKanbanMetrics } from '@/lib/server/kanban';
import { getTenantById } from '@/lib/server/tenants';
import { PageHeader } from '@/components/ui';
import { MetricsClient } from './metrics-client';
import type { MetricsConfig } from '@/lib/metrics-catalog';

export const dynamic = 'force-dynamic';

export default async function MetricsPage() {
  const ctx = await requireTenantMember();
  let metrics: any = null;
  try {
    metrics = await getKanbanMetrics(ctx);
  } catch {}

  // Config de visibilidade do tenant ativo (cliente vê só o que o admin liberou).
  let metricsConfig: MetricsConfig | null = null;
  const tenantId = getActiveTenantId(ctx);
  if (tenantId) {
    try {
      const t = await getTenantById(tenantId);
      metricsConfig = ((t as any).metrics_config as MetricsConfig) || null;
    } catch {}
  }

  return (
    <main className="container-edge py-12">
      <PageHeader
        kicker="DASHBOARD · MÉTRICAS"
        title="Métricas."
        subtitle="Acompanhe seu funil de vendas: leads por origem, conversão, valor pipeline."
      />
      {metrics ? <MetricsClient initial={metrics} config={metricsConfig} /> : (
        <div className="glass-static p-12 text-center text-sm text-fg-muted">
          Carregando…
        </div>
      )}
    </main>
  );
}
