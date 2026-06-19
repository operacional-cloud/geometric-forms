'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { apiFetch } from '@/lib/api';
import {
  PageHeader, GradientButton, GhostButton, ArrowRight, Kicker,
} from '@/components/ui';

const PRESET_COLORS = ['#10F2A0', '#5EE2FF', '#9E7DFF', '#FFC857', '#FF6363', '#F4F4F7'];

/** Converte mensagem de erro técnica do backend em texto amigável em PT-BR. */
function humanizeError(message: string, details: any): string {
  // 1) Zod issues array — traduz por path
  if (Array.isArray(details) && details.length > 0) {
    const msgs = details.map((issue: any) => {
      const path = (issue.path || []).join('.');
      switch (path) {
        case 'owner.email':       return 'O email do dono é inválido. Use o formato nome@empresa.com.';
        case 'owner.password':    return 'A senha temporária deve ter pelo menos 8 caracteres.';
        case 'owner.full_name':   return 'Informe o nome completo do dono.';
        case 'tenant.name':       return 'Informe o nome da empresa.';
        case 'tenant.slug':       return 'Slug inválido. Use apenas letras minúsculas, números e hifens (ex: minha-empresa).';
        case 'tenant.logo_url':   return 'A URL do logo é inválida.';
        case 'tenant.primary_color':   return 'Cor primária inválida.';
        case 'tenant.secondary_color': return 'Cor secundária inválida.';
        default: return issue.message || 'Campo inválido';
      }
    });
    return msgs.join(' · ');
  }

  // 2) Erros conhecidos do Supabase / backend
  const m = message || '';
  if (/already.*registered|already exists|user.*exists/i.test(m)) {
    return 'Esse email já está cadastrado em outra conta.';
  }
  if (/slug.*j[áa].*em uso|slug.*already/i.test(m)) {
    return 'Esse slug já está em uso por outro cliente. Escolha um diferente.';
  }
  if (/invalid.*email|email.*invalid|valid email/i.test(m)) {
    return 'O email do dono é inválido. Use o formato nome@empresa.com.';
  }
  if (/password.*(at least|m[íi]n|8)/i.test(m)) {
    return 'A senha temporária deve ter pelo menos 8 caracteres.';
  }
  if (/sem sess[ãa]o|n[ãa]o autenticado|unauthorized/i.test(m)) {
    return 'Sua sessão expirou. Faça login novamente.';
  }
  if (/network|failed to fetch|connection/i.test(m)) {
    return 'Falha de conexão. Verifique sua internet e tente novamente.';
  }

  // 3) Fallback — mostra mensagem original se não souber traduzir
  return m || 'Não foi possível cadastrar o cliente. Tente novamente.';
}

export default function NewTenantPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    slug: '',
    primary_color: '#10F2A0',
    plan: 'starter',
    ownerEmail: '',
    ownerName: '',
    ownerPassword: '',
  });

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((s) => ({ ...s, [k]: v }));
    if (k === 'name' && !form.slug) {
      const slug = String(v)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 60);
      setForm((s) => ({ ...s, slug }));
    }
  }

  // Validações de UX antes de enviar pro backend
  function preflight(): string | null {
    if (!form.name.trim()) return 'Informe o nome da empresa.';
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(form.slug)) {
      return 'Slug inválido. Use apenas letras minúsculas, números e hifens — ex: minha-empresa.';
    }
    if (!form.ownerName.trim()) return 'Informe o nome do dono da conta.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail)) {
      return 'O email do dono é inválido. Use o formato nome@empresa.com.';
    }
    if (form.ownerPassword.length < 8) return 'A senha temporária deve ter pelo menos 8 caracteres.';
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const pre = preflight();
    if (pre) {
      setError(pre);
      setBusy(false);
      return;
    }

    try {
      const { data: { session } } = await getSupabaseBrowser().auth.getSession();
      if (!session) throw new Error('Sem sessão. Faça login novamente.');

      await apiFetch('/api/admin/tenants', {
        method: 'POST',
        token: session.access_token,
        body: {
          tenant: {
            name: form.name,
            slug: form.slug,
            primary_color: form.primary_color,
            plan: form.plan,
          },
          owner: {
            email: form.ownerEmail,
            full_name: form.ownerName,
            password: form.ownerPassword,
          },
        },
      });
      router.push('/admin');
      router.refresh();
    } catch (e: any) {
      setError(humanizeError(e.message, e.details));
        setBusy(false);
    }
  }

  return (
    <main className="container-edge py-12">
      <PageHeader
        kicker="NEW TENANT · 001"
        title="Cadastrar cliente."
        subtitle="Cria o tenant + usuário owner com role=client e tenant_id vinculado."
      />

      <form onSubmit={onSubmit} className="grid lg:grid-cols-[1fr_360px] gap-8">
        <div className="space-y-6">
          <section className="glass-static p-6 lg:p-8">
            <Kicker>EMPRESA</Kicker>
            <div className="mt-5 space-y-5">
              <label className="block">
                <span className="text-sm text-fg-muted">Nome</span>
                <input
                  required
                  className="input mt-1"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="Pillar Consórcios"
                />
              </label>
              <label className="block">
                <span className="text-sm text-fg-muted">Slug · URL</span>
                <input
                  required
                  pattern="^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$"
                  className="input mt-1 font-mono"
                  value={form.slug}
                  onChange={(e) => update('slug', e.target.value)}
                  placeholder="pillar-consorcios"
                />
                <span className="mt-2 inline-block text-xs text-fg-dim font-mono">
                  /{form.slug || '…'}/{'{form-slug}'}
                </span>
              </label>

              <div className="grid grid-cols-2 gap-5">
                <label className="block">
                  <span className="text-sm text-fg-muted">Cor primária</span>
                  <div className="mt-1 input flex items-center gap-3 !py-2">
                    <input
                      type="color"
                      value={form.primary_color}
                      onChange={(e) => update('primary_color', e.target.value)}
                      className="h-7 w-9 rounded cursor-pointer border-0 bg-transparent"
                    />
                    <span className="font-mono text-sm">{form.primary_color}</span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => update('primary_color', c)}
                        className="h-5 w-5 rounded-full ring-1 ring-white/20 hover:ring-white/60 transition"
                        style={{ background: c }}
                        aria-label={c}
                      />
                    ))}
                  </div>
                </label>
                <label className="block">
                  <span className="text-sm text-fg-muted">Plano</span>
                  <select
                    className="input mt-1"
                    value={form.plan}
                    onChange={(e) => update('plan', e.target.value)}
                  >
                    <option value="starter">starter</option>
                    <option value="growth">growth</option>
                    <option value="scale">scale</option>
                  </select>
                </label>
              </div>
            </div>
          </section>

          <section className="glass-static p-6 lg:p-8">
            <Kicker>DONO DA CONTA</Kicker>
            <div className="mt-5 space-y-5">
              <label className="block">
                <span className="text-sm text-fg-muted">Nome completo</span>
                <input
                  required
                  className="input mt-1"
                  value={form.ownerName}
                  onChange={(e) => update('ownerName', e.target.value)}
                  placeholder="Carlos Yoshimori"
                />
              </label>
              <div className="grid grid-cols-2 gap-5">
                <label className="block">
                  <span className="text-sm text-fg-muted">Email</span>
                  <input
                    type="email"
                    required
                    className="input mt-1"
                    value={form.ownerEmail}
                    onChange={(e) => update('ownerEmail', e.target.value)}
                    placeholder="carlos@pillar.com"
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-fg-muted">Senha temporária</span>
                  <input
                    type="text"
                    required
                    minLength={8}
                    className="input mt-1 font-mono"
                    value={form.ownerPassword}
                    onChange={(e) => update('ownerPassword', e.target.value)}
                    placeholder="mín 8 caracteres"
                  />
                </label>
              </div>
            </div>
          </section>

          {error && (
            <div
              className="rounded-xl p-4 flex items-start gap-3"
              style={{
                background: 'rgba(255, 99, 99, 0.08)',
                border: '1px solid rgba(255, 99, 99, 0.30)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10" stroke="#FF6363" strokeWidth="1.8" />
                <path d="M12 8v4M12 16h.01" stroke="#FF6363" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <div className="text-sm" style={{ color: '#FF8B8B' }}>{error}</div>
            </div>
          )}
        </div>

        {/* SIDEBAR PREVIEW */}
        <aside className="lg:sticky lg:top-24 self-start space-y-4">
          <div className="glass-static p-6 relative overflow-hidden">
            <Kicker>PREVIEW</Kicker>
            <div className="mt-5 flex items-center gap-3">
              <span
                className="h-12 w-12 rounded-xl ring-1 ring-white/10"
                style={{ background: form.primary_color }}
              />
              <div className="min-w-0">
                <div className="font-semibold text-lg truncate">{form.name || 'Nome da empresa'}</div>
                <div className="font-mono text-xs text-fg-dim truncate">/{form.slug || 'slug'}</div>
              </div>
            </div>
            <div className="mt-5 pt-5 border-t border-line space-y-3 text-xs text-fg-muted">
              <div className="flex justify-between">
                <span className="kicker !mb-0">Plano</span>
                <span className="font-mono">{form.plan}</span>
              </div>
              <div className="flex justify-between">
                <span className="kicker !mb-0">Dono</span>
                <span className="font-mono truncate ml-3">{form.ownerEmail || '—'}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <GhostButton onClick={() => history.back()} className="flex-1 justify-center">
              Cancelar
            </GhostButton>
            <GradientButton type="submit" disabled={busy} className="flex-1 justify-center">
              {busy ? 'Criando…' : 'Criar'} <ArrowRight />
            </GradientButton>
          </div>
        </aside>
      </form>
    </main>
  );
}
