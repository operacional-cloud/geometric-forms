'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { apiFetch } from '@/lib/api';
import { Kicker, PasswordInput, ArrowRight } from '@/components/ui';

export function UnlockGate({ title = 'IA de Atendimento', description }: { title?: string; description?: string } = {}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/api/auth/ai-unlock', {
        method: 'POST',
        body: { email: email.trim(), password },
      });
      router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Falha ao destravar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container-edge py-16">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="max-w-md mx-auto"
      >
        <div className="glass-static p-8 lg:p-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(94,226,255,0.10)', border: '1px solid rgba(94,226,255,0.30)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: '#5EE2FF' }}>
                <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
                <path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </div>
            <div>
              <Kicker>MÓDULO RESTRITO</Kicker>
              <div className="text-xl font-semibold tracking-tight mt-1">{title}</div>
            </div>
          </div>

          <p className="text-sm text-fg-muted mb-6">
            {description || <>Esse módulo exige credenciais de <strong className="text-fg">administrador do sistema</strong>. Peça pro seu gerente da Geometric Agency liberar o acesso.</>}
          </p>

          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <span className="kicker">Email do admin</span>
              <input
                type="email"
                required
                autoFocus
                className="input mt-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@empresa.com"
              />
            </label>
            <label className="block">
              <span className="kicker">Senha</span>
              <div className="mt-2">
                <PasswordInput
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </label>

            {error && (
              <div className="badge badge-danger w-full justify-center !py-2">{error}</div>
            )}

            <button type="submit" disabled={busy} className="btn btn-primary w-full justify-center !py-3">
              {busy ? 'Verificando…' : 'Destravar'} <ArrowRight />
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-line text-[11px] text-fg-dim flex justify-between font-mono">
            <span>ACESSO TEMPORÁRIO · 4H</span>
            <span>HMAC</span>
          </div>
        </div>
      </motion.div>
    </main>
  );
}
