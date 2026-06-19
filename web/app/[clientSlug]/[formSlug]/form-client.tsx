'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { apiFetch } from '@/lib/api';

type FieldOption = { label: string; value: string; score?: number };
type Field = {
  id: string;
  type: 'text' | 'email' | 'phone' | 'number' | 'radio' | 'checkbox' | 'select' | 'textarea';
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: FieldOption[];
  order?: number;
  system?: boolean;
};
type Tenant = {
  id: string; name: string; slug: string; logo_url: string | null;
  primary_color: string; secondary_color: string;
};
type Form = {
  id: string; slug: string; title: string; description: string | null;
  fields: Field[]; settings: Record<string, any>;
  meta_pixel_id: string | null;
  cover_image_url: string | null;
  whatsapp_link: string | null;
  success_button_label: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidPhone(v: string): boolean {
  // Aceita qualquer formatação — valida pelo número de dígitos (BR mobile = 10 ou 11)
  const digits = String(v).replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 13;
}
const uuid = () => crypto.randomUUID();
const LETTER = (i: number) => String.fromCharCode(65 + i); // 0 -> A

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return m ? m[2] : null;
}
function captureTracking() {
  const s = new URLSearchParams(window.location.search);
  return {
    fbc: readCookie('_fbc') || undefined,
    fbp: readCookie('_fbp') || undefined,
    fbclid: s.get('fbclid') || undefined,
    utm_source: s.get('utm_source') || undefined,
    utm_medium: s.get('utm_medium') || undefined,
    utm_campaign: s.get('utm_campaign') || undefined,
    utm_content: s.get('utm_content') || undefined,
    utm_term: s.get('utm_term') || undefined,
    user_agent: navigator.userAgent,
    page_url: window.location.href,
  };
}
function isLight(hex: string): boolean {
  const h = hex.replace('#', '');
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 160;
}
function formatPhoneBR(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function PublicFormClient({ tenant, form }: { tenant: Tenant; form: Form }) {
  const accent = tenant.primary_color || '#10F2A0';
  const accentText = isLight(accent) ? '#0a0a0c' : '#ffffff';

  // step: -1 = intro, 0..n-1 = perguntas, n = sucesso
  const [step, setStep] = useState<number>(-1);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId] = useState(uuid);
  const [eventId] = useState(uuid);
  const [tracked, setTracked] = useState({ view: false, start: false, partialSaved: false });

  const fields = useMemo(
    () => [...(form.fields || [])].sort((a, b) => (a.order || 0) - (b.order || 0)),
    [form.fields]
  );
  const total = fields.length;
  const current = step >= 0 && step < total ? fields[step] : null;
  const isLast = step === total - 1;
  const onSuccess = step === total;

  // Detecta índices dos system fields (nome=0, telefone=1)
  const nomeIdx = fields.findIndex((f) => f.id === 'nome' || (f.system && f.type === 'text'));
  const phoneIdx = fields.findIndex((f) => f.id === 'telefone' || (f.system && f.type === 'phone'));

  // Pixel + view event
  useEffect(() => {
    if (form.meta_pixel_id && typeof window !== 'undefined' && !(window as any).fbq) {
      const id = form.meta_pixel_id;
      (function (f: any, b: any, e: any, v: any, n: any, t: any, s: any) {
        if (f.fbq) return;
        n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
        if (!f._fbq) f._fbq = n;
        n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
        t = b.createElement(e); t.async = true; t.src = v;
        s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
      })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js', null, null, null);
      (window as any).fbq('init', id);
      (window as any).fbq('track', 'PageView');
    }
    if (!tracked.view) {
      apiFetch('/api/public/events', {
        method: 'POST',
        body: { form_id: form.id, event_type: 'view', session_id: sessionId, metadata: { page_url: location.href } },
      }).catch(() => {});
      setTracked((s) => ({ ...s, view: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setAnswer(id: string, v: any) {
    setAnswers((s) => ({ ...s, [id]: v }));
    if (!tracked.start) {
      apiFetch('/api/public/events', {
        method: 'POST',
        body: { form_id: form.id, event_type: 'start', session_id: sessionId, metadata: { field_id: id } },
      }).catch(() => {});
      setTracked((s) => ({ ...s, start: true }));
    }
  }

  function isFieldValid(f: Field, valOverride?: any): boolean {
    const v = valOverride !== undefined ? valOverride : answers[f.id];
    if (!f.required) return v === undefined || v === null || v === '' || true;
    if (v === undefined || v === null || v === '') return false;
    if (f.type === 'checkbox' && Array.isArray(v) && v.length === 0) return false;
    if (f.type === 'email' && !EMAIL_RE.test(String(v))) return false;
    if (f.type === 'phone' && !isValidPhone(String(v))) return false;
    return true;
  }

  // Salva parcial em background — chamado após o usuário preencher telefone
  async function savePartial(currentAnswers: Record<string, any>) {
    if (tracked.partialSaved) return;
    try {
      const tracking = captureTracking();
      await apiFetch('/api/public/leads', {
        method: 'POST',
        body: {
          form_id: form.id,
          event_id: eventId,
          is_partial: true,
          answers: currentAnswers,
          tracking,
        },
      });
      setTracked((s) => ({ ...s, partialSaved: true }));
    } catch { /* silencioso */ }
  }

  async function goNext() {
    if (!current) return;
    if (!isFieldValid(current)) {
      setError(`Por favor, ${current.type === 'phone' ? 'preencha um WhatsApp válido' : current.type === 'email' ? 'preencha um email válido' : 'preencha este campo'}.`);
      return;
    }
    setError(null);

    apiFetch('/api/public/events', {
      method: 'POST',
      body: { form_id: form.id, event_type: 'field_complete', session_id: sessionId, metadata: { field_id: current.id } },
    }).catch(() => {});

    // Se acabou de responder o telefone, dispara save parcial (fire-and-forget)
    if (step === phoneIdx && !tracked.partialSaved) {
      savePartial(answers);
    }

    if (isLast) {
      return submitFinal();
    }
    setStep((s) => s + 1);
  }
  function goPrev() { if (step > 0) setStep((s) => s - 1); }

  async function submitFinal() {
    setBusy(true);
    setError(null);
    try {
      const tracking = captureTracking();
      const res = await apiFetch<{ data: { lead_id: string; lead_score: number; is_qualified: boolean; is_complete: boolean; whatsapp_link: string | null; success_button_label: string } }>(
        '/api/public/leads',
        {
          method: 'POST',
          body: {
            form_id: form.id,
            event_id: eventId,
            is_partial: false,
            answers,
            tracking,
          },
        }
      );
      if (typeof window !== 'undefined' && (window as any).fbq) {
        (window as any).fbq('track', 'Lead', { value: res.data.lead_score, currency: 'BRL' }, { eventID: eventId });
        if (res.data.is_qualified) {
          (window as any).fbq('trackCustom', 'QualifiedLead', { value: res.data.lead_score, currency: 'BRL' }, { eventID: eventId });
        }
      }
      setStep(total);
      setBusy(false);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  // Auto-save parcial ao sair da página (se já tem nome+telefone)
  const partialSavedRef = useRef(false);
  partialSavedRef.current = tracked.partialSaved;
  useEffect(() => {
    function handleUnload() {
      if (partialSavedRef.current) return;
      const hasNome = nomeIdx >= 0 && answers[fields[nomeIdx]?.id];
      const hasPhone = phoneIdx >= 0 && answers[fields[phoneIdx]?.id];
      if (!hasNome || !hasPhone) return;
      try {
        const payload = JSON.stringify({
          form_id: form.id,
          event_id: eventId,
          is_partial: true,
          answers,
          tracking: captureTracking(),
        });
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon?.((process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000') + '/api/public/leads', blob);
      } catch {}
    }
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, [answers, eventId, form.id, fields, nomeIdx, phoneIdx]);

  const progress = total > 0 && step >= 0 && step < total
    ? Math.round(((step + 1) / total) * 100)
    : (onSuccess ? 100 : 0);

  // =========================================================================
  // INTRO SCREEN
  // =========================================================================
  if (step === -1) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: '#0f0f12' }}>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-xl"
        >
          <div className="rounded-2xl overflow-hidden border border-white/10" style={{ background: '#16161B' }}>
            {form.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.cover_image_url}
                alt={form.title}
                className="w-full h-72 object-cover"
              />
            ) : (
              <div
                className="w-full h-72 flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${accent}30, ${accent}10)` }}
              >
                {tenant.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tenant.logo_url} alt={tenant.name} className="h-24" />
                ) : (
                  <span className="font-display text-5xl tracking-tightest" style={{ color: accent }}>
                    {tenant.name}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="mt-8 text-center px-2">
            <h1 className="text-3xl md:text-4xl font-bold leading-tight">{form.title}</h1>
            {form.description && (
              <p className="mt-5 text-fg-muted text-base md:text-lg leading-relaxed">{form.description}</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setStep(0)}
            className="mt-10 w-full rounded-full py-5 font-semibold text-lg inline-flex items-center justify-center gap-2 transition-transform active:scale-95"
            style={{ background: accent, color: accentText }}
          >
            Começar <span aria-hidden>→</span>
          </button>

          <div className="mt-6 text-center text-[11px] font-mono uppercase tracking-widest text-fg-dim">
            powered by geometric forms
          </div>
          <p className="mt-3 text-center text-[10.5px] leading-relaxed text-fg-dim/80 max-w-md mx-auto px-2">
            Ao preencher este formulário, você está ciente de que seus dados serão compartilhados conosco e tratados com total confidencialidade.
          </p>
        </motion.div>
      </main>
    );
  }

  // =========================================================================
  // SUCCESS SCREEN
  // =========================================================================
  if (onSuccess) {
    const wa = form.whatsapp_link;
    const buttonLabel = form.success_button_label || 'Quero agilizar';
    return (
      <main className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: '#0f0f12' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-xl text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 200, damping: 14 }}
            className="mx-auto h-28 w-28 rounded-full flex items-center justify-center"
            style={{ background: '#A7E8C1' }}
          >
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
              <path d="M5 12l4.5 4.5L19 7" stroke="#0a0a0c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.div>
          <h1 className="mt-10 text-4xl md:text-5xl font-bold">Obrigado!</h1>
          <p className="mt-5 text-fg-muted text-base md:text-lg leading-relaxed">
            Cadastro realizado! Em breve nossa equipe entrará em contato.
            {wa && <> Para agilizar seu atendimento clique no botão abaixo!</>}
          </p>

          {wa ? (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-10 w-full rounded-full py-5 font-semibold text-lg inline-flex items-center justify-center transition-transform active:scale-95"
              style={{ background: accent, color: accentText }}
            >
              {buttonLabel}
            </a>
          ) : (
            <div
              className="mt-10 inline-block rounded-full px-8 py-4 text-base"
              style={{ background: `${accent}20`, color: accent, border: `1px solid ${accent}50` }}
            >
              Aguarde nosso contato
            </div>
          )}
        </motion.div>
      </main>
    );
  }

  // =========================================================================
  // QUESTION SCREEN
  // =========================================================================
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: '#0f0f12' }}>
      <div className="w-full max-w-xl">
        <div className="rounded-2xl border border-white/10 p-8 lg:p-10" style={{ background: '#16161B' }}>
          <div className="text-[13px] font-bold uppercase tracking-widest text-fg-muted">
            Pergunta {step + 1} de {total}
          </div>

          <AnimatePresence mode="wait">
            {current && (
              <motion.div
                key={current.id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25 }}
              >
                <h2 className="mt-4 text-2xl md:text-3xl font-bold leading-snug">
                  {current.label}
                  {current.required && <span style={{ color: '#FF4D4D' }} className="ml-1">*</span>}
                </h2>

                <div className="mt-8">
                  <FieldInput
                    field={current}
                    value={answers[current.id]}
                    onChange={(v) => setAnswer(current.id, v)}
                    accent={accent}
                    accentText={accentText}
                  />
                </div>

                {error && (
                  <div
                    className="mt-5 text-sm px-4 py-3 rounded-lg"
                    style={{ background: 'rgba(255, 77, 77, 0.10)', color: '#FF8B8B', border: '1px solid rgba(255, 77, 77, 0.30)' }}
                  >
                    {error}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* CONTROLS */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={step === 0}
            className="text-base font-medium text-fg-muted disabled:opacity-30 hover:text-fg transition-colors py-3 px-4"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={busy}
            className="rounded-full px-9 py-4 font-semibold text-base transition-transform active:scale-95 disabled:opacity-50"
            style={{ background: accent, color: accentText }}
          >
            {busy ? '…' : isLast ? 'Finalizar' : 'Próxima'}
          </button>
        </div>

        {/* Progress mini */}
        <div className="mt-6 px-2">
          <div className="h-1.5 w-full rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${progress}%`, background: accent }}
            />
          </div>
        </div>

        <div className="mt-6 text-center text-[11px] font-mono uppercase tracking-widest text-fg-dim">
          powered by geometric forms
        </div>
      </div>
    </main>
  );
}

/* ============================================================
   Inputs (estilo screenshot)
   ============================================================ */

function FieldInput({
  field, value, onChange, accent, accentText,
}: {
  field: Field; value: any;
  onChange: (v: any) => void;
  accent: string; accentText: string;
}) {
  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          rows={4}
          autoFocus
          className="public-input resize-none"
          placeholder={field.placeholder || 'Sua resposta…'}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          inputMode="numeric"
          autoFocus
          className="public-input font-mono"
          placeholder={field.placeholder || '0'}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      );
    case 'select':
      return (
        <select
          className="public-input"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="" disabled>Selecione…</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    case 'radio':
      return (
        <div className="space-y-3">
          {field.options?.map((o, i) => {
            const checked = value === o.value;
            return (
              <button
                type="button"
                key={o.value}
                onClick={() => onChange(o.value)}
                className="w-full text-left rounded-xl border transition-all duration-150 px-5 py-4 flex items-center gap-4"
                style={
                  checked
                    ? { background: accent, borderColor: accent, color: accentText }
                    : { background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.10)' }
                }
              >
                <span
                  className="shrink-0 h-9 w-9 rounded-full border flex items-center justify-center text-sm font-bold"
                  style={
                    checked
                      ? { borderColor: accentText, color: accentText, background: 'transparent' }
                      : { borderColor: 'rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.65)' }
                  }
                >
                  {LETTER(i)}
                </span>
                <span className="font-medium text-base md:text-lg">{o.label}</span>
              </button>
            );
          })}
        </div>
      );
    case 'checkbox': {
      const arr: string[] = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-3">
          {field.options?.map((o, i) => {
            const checked = arr.includes(o.value);
            return (
              <button
                type="button"
                key={o.value}
                onClick={() => {
                  const next = checked ? arr.filter((x) => x !== o.value) : [...arr, o.value];
                  onChange(next);
                }}
                className="w-full text-left rounded-xl border transition-all duration-150 px-5 py-4 flex items-center gap-4"
                style={
                  checked
                    ? { background: accent, borderColor: accent, color: accentText }
                    : { background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.10)' }
                }
              >
                <span
                  className="shrink-0 h-9 w-9 rounded-md border flex items-center justify-center text-sm font-bold"
                  style={
                    checked
                      ? { borderColor: accentText, color: accentText, background: 'transparent' }
                      : { borderColor: 'rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.65)' }
                  }
                >
                  {LETTER(i)}
                </span>
                <span className="font-medium text-base md:text-lg">{o.label}</span>
              </button>
            );
          })}
        </div>
      );
    }
    case 'phone':
      return (
        <input
          type="tel"
          inputMode="tel"
          autoFocus
          className="public-input"
          placeholder={field.placeholder || '(00) 00000-0000'}
          value={value || ''}
          onChange={(e) => onChange(formatPhoneBR(e.target.value))}
        />
      );
    case 'email':
    case 'text':
    default:
      return (
        <input
          type={field.type === 'email' ? 'email' : 'text'}
          autoFocus
          className="public-input"
          placeholder={field.placeholder || 'Digite sua resposta…'}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
