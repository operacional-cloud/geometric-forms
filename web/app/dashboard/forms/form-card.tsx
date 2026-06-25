'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { apiFetch } from '@/lib/api';
import { Kicker } from '@/components/ui';

type Form = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  qualification_threshold: number;
  fields: any[];
  settings?: Record<string, any>;
  meta_pixel_id?: string | null;
  meta_access_token?: string | null;
  meta_dataset_id?: string | null;
  cover_image_url?: string | null;
  whatsapp_link?: string | null;
  success_button_label?: string | null;
  webhook_url?: string | null;
  created_at: string;
  updated_at: string;
};

export function FormCard({
  form,
  stat,
  index,
  tenantSlug,
}: {
  form: Form;
  stat: { total: number; qualified: number; rate: number; lastAt: string | null };
  index: number;
  tenantSlug: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | 'duplicate' | 'delete'>(null);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState<null | 'public' | 'meta' | 'google'>(null);
  const [trackingPanel, setTrackingPanel] = useState<null | 'meta' | 'google'>(null);

  const publicUrl = tenantSlug
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/${tenantSlug}/${form.slug}`
    : null;

  function flashCopied(kind: 'public' | 'meta' | 'google') {
    setCopied(kind);
    setTimeout(() => setCopied(null), 1800);
  }

  async function getToken() {
    const { data: { session } } = await getSupabaseBrowser().auth.getSession();
    if (!session) throw new Error('Sem sessão');
    return session.access_token;
  }

  async function handleDuplicate() {
    setBusy('duplicate');
    try {
      const token = await getToken();
      // Sanitiza fields pra evitar quebrar o schema (remove props desconhecidas)
      const cleanFields = (form.fields || []).map((f: any, idx: number) => {
        const out: any = {
          id: f.id,
          type: f.type,
          label: f.label,
          required: !!f.required,
          order: idx + 1,
        };
        if (f.placeholder) out.placeholder = f.placeholder;
        if (f.system) out.system = true;
        if (Array.isArray(f.options) && f.options.length > 0) {
          out.options = f.options
            .filter((o: any) => o.label && o.value)
            .map((o: any) => ({
              label: o.label,
              value: o.value,
              ...(typeof o.score === 'number' ? { score: o.score } : {}),
            }));
        }
        if (f.validation) out.validation = f.validation;
        return out;
      });

      await apiFetch('/api/forms', {
        method: 'POST',
        token,
        body: {
          title: `${form.title} (cópia)`,
          description: form.description || undefined,
          qualification_threshold: form.qualification_threshold,
          is_active: false, // duplicata começa pausada
          fields: cleanFields,
          // Mantém TODAS as configurações do form original
          meta_pixel_id: form.meta_pixel_id || null,
          meta_access_token: form.meta_access_token || null,
          meta_dataset_id: form.meta_dataset_id || null,
          cover_image_url: form.cover_image_url || null,
          whatsapp_link: form.whatsapp_link || null,
          success_button_label: form.success_button_label || null,
          webhook_url: form.webhook_url || null,
          settings: form.settings || undefined,
        },
      });
      router.refresh();
    } catch (e: any) {
      alert('Erro ao duplicar: ' + e.message);
    } finally {
      setBusy(null);
    }
  }

  function handleExport() {
    // Template portável: só ESTRUTURA. Sem id/slug/tenant_id e sem meta_*
    // (pixel/token/dataset) — específicos de cada cliente.
    const tpl = {
      _type: 'geometric-form-template',
      _version: 1,
      title: form.title,
      description: form.description ?? null,
      fields: form.fields ?? [],
      settings: form.settings ?? {},
      qualification_threshold: form.qualification_threshold ?? 0,
      cover_image_url: form.cover_image_url ?? null,
      whatsapp_link: form.whatsapp_link ?? null,
      success_button_label: form.success_button_label ?? null,
      webhook_url: form.webhook_url ?? null,
    };
    const blob = new Blob([JSON.stringify(tpl, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `form-${form.slug || 'template'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleDelete() {
    setBusy('delete');
    try {
      const token = await getToken();
      await apiFetch(`/api/forms/${form.id}`, { method: 'DELETE', token });
      router.refresh();
    } catch (e: any) {
      alert('Erro ao excluir: ' + e.message);
    } finally {
      setBusy(null);
      setConfirming(false);
    }
  }

  async function safeCopy(text: string): Promise<boolean> {
    // Tenta Clipboard API moderna (precisa HTTPS + permissão)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    // Fallback: textarea + execCommand (funciona em browsers antigos / sem HTTPS)
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  async function copyPublicUrl() {
    if (!publicUrl) return;
    const ok = await safeCopy(publicUrl);
    if (ok) flashCopied('public');
    else alert('Não consegui copiar. Cole manual: ' + publicUrl);
  }

  function metaUrl(): string {
    if (!publicUrl) return '';
    // Templates Meta: https://www.facebook.com/business/help/2360940870872492
    const params = new URLSearchParams({
      utm_source: 'facebook',
      utm_medium: 'paid',
      utm_campaign: '{{campaign.name}}',
      utm_content: '{{ad.name}}',
      utm_term: '{{adset.name}}',
      fbclid: '{{fbclid}}',
    });
    return `${publicUrl}?${decodeURIComponent(params.toString())}`;
  }

  function googleUrl(): string {
    if (!publicUrl) return '';
    // Templates Google Ads ValueTrack: https://support.google.com/google-ads/answer/6305348
    const params = new URLSearchParams({
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: '{campaignid}',
      utm_content: '{creative}',
      utm_term: '{keyword}',
      gclid: '{gclid}',
    });
    return `${publicUrl}?${decodeURIComponent(params.toString())}`;
  }

  async function copyMeta() {
    const ok = await safeCopy(metaUrl());
    if (ok) flashCopied('meta');
    else alert('Não consegui copiar. Cole manual: ' + metaUrl());
  }
  async function copyGoogle() {
    const ok = await safeCopy(googleUrl());
    if (ok) flashCopied('google');
    else alert('Não consegui copiar. Cole manual: ' + googleUrl());
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="glass-static p-5 lg:p-6 flex flex-col relative overflow-hidden"
    >
      {/* Title row + ICONS */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold truncate">{form.title}</h3>
          <p className="text-xs text-fg-muted mt-1">
            Criado em {new Date(form.created_at).toLocaleDateString('pt-BR')}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <IconBtn
            title="Editar formulário"
            href={`/dashboard/forms/${form.id}`}
            color="brand"
          >
            <PencilIcon />
          </IconBtn>
          <IconBtn
            title="Duplicar formulário"
            onClick={handleDuplicate}
            disabled={busy === 'duplicate'}
            color="cyan"
          >
            <CopyIcon />
          </IconBtn>
          <IconBtn
            title="Exportar formulário (JSON) — pra importar em outro cliente"
            onClick={handleExport}
            color="cyan"
          >
            <DownloadIcon />
          </IconBtn>
          {publicUrl && (
            <IconBtn
              title={copied === 'public' ? 'Copiado!' : 'Copiar link do formulário'}
              onClick={copyPublicUrl}
              color="cyan"
            >
              <LinkIcon />
            </IconBtn>
          )}
          {publicUrl && (
            <IconBtn
              title="Abrir form público em nova aba"
              href={publicUrl}
              target="_blank"
              color="violet"
            >
              <ExternalIcon />
            </IconBtn>
          )}
          <IconBtn
            title="Excluir formulário"
            onClick={() => setConfirming(true)}
            color="danger"
          >
            <TrashIcon />
          </IconBtn>
        </div>
      </div>

      {/* Metrics */}
      <div className="mt-5 grid grid-cols-2 gap-4">
        <div>
          <div className="kicker">RESPOSTAS</div>
          <div className="text-3xl font-semibold tabular tracking-tightest mt-1 stat-number">
            {stat.total}
          </div>
        </div>
        <div>
          <div className="kicker">CONVERSÃO</div>
          <div className="text-3xl font-semibold tabular tracking-tightest mt-1 text-emerald">
            {stat.rate}%
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-4 progress-bar">
        <span style={{ width: `${stat.rate}%` }} />
      </div>

      {/* Status + last */}
      <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
        {form.is_active ? (
          <span className="badge badge-success badge-dot">ATIVO</span>
        ) : (
          <span className="badge badge-muted">PAUSADO</span>
        )}
        <span className="text-xs text-fg-muted font-mono">
          Última: {stat.lastAt ? new Date(stat.lastAt).toLocaleDateString('pt-BR') : '—'}
        </span>
      </div>

      {/* MAIN EDIT BUTTON */}
      <Link
        href={`/dashboard/forms/${form.id}`}
        className="mt-5 btn btn-ghost w-full justify-center !bg-black/40 hover:!bg-black/60 !border-white/10 !font-semibold"
      >
        <PencilIcon /> Editar formulário
      </Link>

      {/* INTEGRATION BUTTONS */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => { setTrackingPanel(trackingPanel === 'meta' ? null : 'meta'); copyMeta(); }}
          className="tracking-btn tracking-btn-meta"
          title="Copiar URL com UTMs do Meta Ads"
        >
          <MetaIcon /> {copied === 'meta' ? 'Copiado!' : 'Meta'}
        </button>
        <button
          type="button"
          onClick={() => { setTrackingPanel(trackingPanel === 'google' ? null : 'google'); copyGoogle(); }}
          className="tracking-btn tracking-btn-google"
          title="Copiar URL com UTMs do Google Ads"
        >
          <GoogleIcon /> {copied === 'google' ? 'Copiado!' : 'Google'}
        </button>
        <Link
          href={`/dashboard/forms/${form.id}/leads`}
          className="tracking-btn tracking-btn-leads"
          title={`Ver ${stat.total} lead${stat.total === 1 ? '' : 's'} desse formulário`}
        >
          <InboxIcon /> Leads · {stat.total}
        </Link>
      </div>

      {/* TRACKING PANEL */}
      <AnimatePresence>
        {trackingPanel && publicUrl && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 overflow-hidden"
          >
            <div className="glass-inner p-3">
              <Kicker>URL · {trackingPanel === 'meta' ? 'META ADS' : 'GOOGLE ADS'}</Kicker>
              <div className="mt-2 font-mono text-[11px] text-fg-muted break-all leading-relaxed bg-black/30 p-2 rounded border border-line">
                {trackingPanel === 'meta' ? metaUrl() : googleUrl()}
              </div>
              <p className="mt-2 text-[11px] text-fg-dim">
                {trackingPanel === 'meta'
                  ? 'Templates {{campaign.name}}, {{fbclid}}, etc são substituídos automaticamente pelo Meta.'
                  : 'Templates {campaignid}, {gclid}, etc são substituídos automaticamente pelo Google Ads.'}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={trackingPanel === 'meta' ? copyMeta : copyGoogle}
                  className="btn btn-ghost !py-1 !px-2 !text-xs"
                >
                  {copied ? 'Copiado!' : 'Copiar URL'}
                </button>
                <button
                  type="button"
                  onClick={() => setTrackingPanel(null)}
                  className="btn btn-ghost !py-1 !px-2 !text-xs"
                >
                  Fechar
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION OVERLAY */}
      <AnimatePresence>
        {confirming && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex items-center justify-center p-6"
            style={{ background: 'rgba(8,8,11,0.92)', backdropFilter: 'blur(4px)' }}
          >
            <div className="text-center">
              <div className="mx-auto h-10 w-10 rounded-full bg-danger/15 border border-danger/40 flex items-center justify-center mb-3">
                <TrashIcon />
              </div>
              <p className="text-sm font-semibold">Excluir este formulário?</p>
              <p className="text-xs text-fg-muted mt-1">
                Todos os leads vinculados também serão removidos.
              </p>
              <div className="mt-4 flex gap-2 justify-center">
                <button
                  type="button"
                  className="btn btn-ghost !py-1.5 !px-3 !text-xs"
                  onClick={() => setConfirming(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn !py-1.5 !px-3 !text-xs"
                  style={{
                    background: 'linear-gradient(180deg, #ff8b8b 0%, #FF6363 100%)',
                    color: '#1A0000',
                    fontWeight: 600,
                    boxShadow: '0 8px 20px -5px rgba(255, 99, 99, 0.45), 0 0 0 1px rgba(255,99,99,0.5)',
                  }}
                  onClick={handleDelete}
                  disabled={busy === 'delete'}
                >
                  {busy === 'delete' ? 'Excluindo…' : 'Sim, excluir'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Public URL copy toast */}
      <AnimatePresence>
        {copied === 'public' && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-3 left-3 right-3 text-center text-[11px] text-emerald font-medium"
          >
            ✓ URL copiada
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ============================================================
   Sub-components & icons
   ============================================================ */

function IconBtn({
  children, title, href, target, onClick, disabled, color = 'brand',
}: {
  children: React.ReactNode;
  title: string;
  href?: string;
  target?: string;
  onClick?: () => void;
  disabled?: boolean;
  color?: 'brand' | 'cyan' | 'violet' | 'danger';
}) {
  const colorMap = {
    brand: { hover: 'hover:!border-brand/40 hover:!text-brand' },
    cyan: { hover: 'hover:!border-cyan/40 hover:!text-cyan' },
    violet: { hover: 'hover:!border-violet/40 hover:!text-violet' },
    danger: { hover: 'hover:!border-danger/40 hover:!text-danger' },
  } as const;
  const cls = `icon-btn ${colorMap[color].hover}`;
  if (href) {
    return (
      <Link href={href} target={target} rel={target === '_blank' ? 'noopener noreferrer' : undefined} className={cls} title={title}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${cls} disabled:opacity-40 disabled:cursor-not-allowed`} title={title}>
      {children}
    </button>
  );
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
    </svg>
  );
}
function LinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.71" />
    </svg>
  );
}
function ExternalIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h6v6M10 14 21 3M21 14v7H3V3h7" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
function MetaIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0c6.627 0 12 5.373 12 12s-5.373 12-12 12S0 18.627 0 12 5.373 0 12 0zm5.04 7.4c-1.13 0-2.06.55-2.79 1.66-.97-1.11-1.84-1.66-2.95-1.66-1.13 0-2.06.55-2.83 1.66l-.05-1.49h-2.1v9.06h2.18v-5.18c.62-1.04 1.31-1.55 2.16-1.55.83 0 1.36.41 1.36 1.49v5.24h2.18v-5.24c.62-1 1.31-1.49 2.16-1.49.83 0 1.38.41 1.38 1.49v5.24H20V9.84c0-1.55-.97-2.44-2.96-2.44z" />
    </svg>
  );
}
function GoogleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
function InboxIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}
