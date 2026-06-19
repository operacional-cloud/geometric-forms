'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export function ViewingAsBanner({ tenantName, tenantSlug }: { tenantName: string; tenantSlug: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function exit() {
    setBusy(true);
    try {
      await apiFetch('/api/admin/view-as', { method: 'DELETE' });
      router.push('/admin');
    } catch {
      setBusy(false);
    }
  }

  return (
    <div
      className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-2 text-xs font-mono"
      style={{
        background: 'linear-gradient(90deg, rgba(166,110,252,0.18) 0%, rgba(94,226,255,0.12) 100%)',
        borderBottom: '1px solid rgba(166,110,252,0.35)',
        color: '#E8EDED',
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] uppercase tracking-widest opacity-70 hidden sm:inline">VISUALIZANDO COMO</span>
        <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: '#A66EFC', color: '#0a0a0c' }}>
          {tenantName}
        </span>
        <span className="text-fg-dim truncate hidden md:inline">/{tenantSlug}</span>
      </div>
      <button
        type="button"
        onClick={exit}
        disabled={busy}
        className="text-[11px] hover:text-fg transition-colors disabled:opacity-50"
        style={{ color: '#A66EFC' }}
      >
        {busy ? 'Saindo…' : 'Sair do painel ↩'}
      </button>
    </div>
  );
}
