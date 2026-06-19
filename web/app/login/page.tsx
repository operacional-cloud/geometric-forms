'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { Header } from '@/components/Header';
import { ArrowRight, Kicker, PasswordInput } from '@/components/ui';
import { Logo } from '@/components/Logo';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = getSupabaseBrowser();
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError(err.message); setBusy(false); return; }
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', data.user!.id).maybeSingle();
    const target = next || (profile?.role === 'admin' ? '/admin' : '/dashboard');
    router.push(target); router.refresh();
  }

  return (
    <main className="min-h-screen">
      <Header />

      <section className="container-edge py-20 lg:py-28 relative">
        <div className="absolute inset-0 grid-bg pointer-events-none" />
        <motion.div
          className="absolute top-32 left-1/2 -translate-x-1/2 h-[400px] w-[400px] rounded-full blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(closest-side, rgba(16,242,160,0.05), transparent)' }}
          animate={{ opacity: [0.2, 0.35, 0.2] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />

        <div className="relative max-w-md mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="relative"
          >
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-brand/15 via-cyan/10 to-violet/15 blur-xl opacity-30" />
            <div className="glass-static relative p-8 lg:p-10">
              <div className="flex items-center gap-3 mb-8">
                <Logo size={28} />
                <span className="text-lg font-semibold tracking-tight">Geometric Forms</span>
              </div>

              <Kicker>ENTRAR · 001</Kicker>
              <h1 className="mt-4 text-4xl font-semibold tracking-tightest">
                Olá, <span className="text-brand-gradient italic font-display font-normal">visitante.</span>
              </h1>

              <form onSubmit={onSubmit} className="mt-8 space-y-4">
                <label className="block">
                  <span className="kicker">Email</span>
                  <input
                    type="email"
                    required
                    autoFocus
                    className="input mt-2"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@empresa.com"
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
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="badge badge-danger w-full justify-center !py-2"
                  >
                    {error}
                  </motion.div>
                )}

                <button type="submit" disabled={busy} className="btn btn-primary w-full justify-center !py-3">
                  {busy ? 'Entrando…' : 'Entrar'} <ArrowRight />
                </button>
              </form>

              <div className="mt-8 pt-6 border-t border-line text-xs text-fg-dim flex justify-between font-mono">
                <span>SUPABASE AUTH</span>
                <span>v0.1.0</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
