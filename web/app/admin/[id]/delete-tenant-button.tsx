'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

/**
 * Botão admin pra EXCLUIR um cliente (tenant) e todos os dados dele.
 * Ação irreversível — exige digitar o nome exato do cliente pra confirmar.
 */
export function DeleteTenantButton({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText.trim() === tenantName.trim();

  async function doDelete() {
    if (!canDelete) return;
    setBusy(true); setError(null);
    try {
      await apiFetch(`/api/admin/tenants/${tenantId}`, { method: 'DELETE' });
      // Cliente excluído — volta pra lista.
      router.push('/admin');
      router.refresh();
    } catch (e: any) {
      setError(e?.message || 'Falha ao excluir.');
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setConfirmText(''); setError(null); }}
        className="btn !text-sm"
        style={{ background: 'rgba(255,99,99,0.10)', color: '#FF6363', border: '1px solid rgba(255,99,99,0.30)' }}
      >
        🗑 Excluir cliente
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: '#16161B', border: '1px solid rgba(255,99,99,0.30)' }}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">⚠️</span>
              <h2 className="text-lg font-semibold" style={{ color: '#FF8B8B' }}>Excluir cliente</h2>
            </div>
            <p className="text-sm text-fg-muted">
              Isso apaga <strong className="text-fg">permanentemente</strong> o cliente <strong className="text-fg">{tenantName}</strong> e
              tudo dele: formulários, leads, kanban, prospecção, WhatsApp, integrações e os
              usuários de login. <strong style={{ color: '#FF8B8B' }}>Não tem como desfazer.</strong>
            </p>
            <label className="block mt-4">
              <span className="text-xs text-fg-muted">
                Pra confirmar, digite o nome do cliente: <span className="font-mono text-fg">{tenantName}</span>
              </span>
              <input
                autoFocus
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={tenantName}
                className="input mt-2 !text-sm"
              />
            </label>

            {error && (
              <div className="mt-3 rounded-md px-3 py-2 text-sm" style={{ background: 'rgba(255,99,99,0.08)', color: '#FF8B8B', border: '1px solid rgba(255,99,99,0.30)' }}>
                {error}
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="btn btn-ghost !text-sm">
                Cancelar
              </button>
              <button
                type="button"
                onClick={doDelete}
                disabled={!canDelete || busy}
                className="btn !text-sm disabled:opacity-40"
                style={{ background: '#FF6363', color: '#0a0a0c', fontWeight: 600 }}
              >
                {busy ? 'Excluindo…' : 'Excluir definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
