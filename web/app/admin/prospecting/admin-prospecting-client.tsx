'use client';

import { useState } from 'react';
import { ProspectingClient } from '@/app/dashboard/prospecting/prospecting-client';
import { Kicker } from '@/components/ui';

type Tenant = { id: string; name: string; slug: string };
type BRState = { uf: string; name: string };

export function AdminProspectingClient({
  tenants, niches, states,
}: {
  tenants: Tenant[];
  niches: string[];
  states: BRState[];
}) {
  const [tenantId, setTenantId] = useState<string>('');
  const selected = tenants.find((t) => t.id === tenantId);

  return (
    <div className="space-y-6">
      <section className="glass-static p-5 lg:p-6">
        <Kicker>CLIENTE ALVO</Kicker>
        <p className="mt-2 text-sm text-fg-muted">
          Os leads capturados aqui ficam vinculados ao cliente selecionado e aparecem no painel dele.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            className="input !text-base flex-1 min-w-[260px]"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
          >
            <option value="">— Selecione um cliente —</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>
            ))}
          </select>
          {selected && (
            <span className="badge badge-success">
              Capturando pra <strong className="ml-1">{selected.name}</strong>
            </span>
          )}
        </div>
      </section>

      {!tenantId ? (
        <section className="glass-static p-12 text-center text-sm text-fg-muted">
          Escolha um cliente acima pra começar a prospectar.
        </section>
      ) : (
        <ProspectingClient
          key={tenantId}
          initialLeads={[]}
          initialStats={{ total: 0, pending: 0, sending: 0, sent: 0, failed: 0 }}
          niches={niches}
          states={states}
          targetTenantId={tenantId}
        />
      )}
    </div>
  );
}
