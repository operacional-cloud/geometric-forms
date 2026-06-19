'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useDialog } from '@/components/Dialog';

export function EnterPanelButton({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const router = useRouter();
  const { notify } = useDialog();
  const [busy, setBusy] = useState(false);

  async function enter() {
    setBusy(true);
    try {
      await apiFetch('/api/admin/view-as', {
        method: 'POST',
        body: { tenant_id: tenantId },
      });
      notify(`Entrando no painel de ${tenantName}…`, 'success');
      router.push('/dashboard');
    } catch (e: any) {
      notify(`Falha: ${e?.message || 'erro'}`, 'danger');
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={enter}
      disabled={busy}
      className="btn btn-primary !text-sm disabled:opacity-50"
    >
      {busy ? 'Entrando…' : '→ Entrar no painel'}
    </button>
  );
}
