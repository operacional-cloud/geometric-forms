'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/**
 * Sistema de modais Confirm / Alert estilizados.
 *
 * Uso:
 *   const { confirm, alert, notify } = useDialog();
 *
 *   const ok = await confirm({
 *     title: 'Excluir lead?',
 *     message: 'Essa ação é permanente.',
 *     variant: 'danger',
 *     confirmLabel: 'Sim, excluir',
 *   });
 *   if (!ok) return;
 *
 *   await alert({ title: 'Erro', message: 'Algo deu errado.', variant: 'danger' });
 *   notify('Lead salvo ✓', 'success'); // toast efêmero
 */

type Variant = 'confirm' | 'danger' | 'warn' | 'success' | 'info';

type ConfirmOpts = {
  title?: string;
  message: string | React.ReactNode;
  variant?: Variant;
  confirmLabel?: string;
  cancelLabel?: string;
};

type AlertOpts = {
  title?: string;
  message: string | React.ReactNode;
  variant?: Variant;
  confirmLabel?: string;
};

type Toast = {
  id: number;
  message: string;
  variant: Variant;
};

type DialogContextType = {
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  alert: (opts: AlertOpts) => Promise<void>;
  notify: (message: string, variant?: Variant) => void;
};

const DialogContext = createContext<DialogContextType | null>(null);

type ActiveDialog =
  | { kind: 'confirm'; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: 'alert'; opts: AlertOpts; resolve: () => void };

const VARIANT_STYLES: Record<Variant, { color: string; bg: string; border: string; icon: string }> = {
  confirm: { color: '#5EE2FF', bg: 'rgba(94, 226, 255, 0.10)', border: 'rgba(94, 226, 255, 0.30)', icon: '❓' },
  danger:  { color: '#FF6363', bg: 'rgba(255, 99, 99, 0.10)',  border: 'rgba(255, 99, 99, 0.35)',  icon: '⚠️' },
  warn:    { color: '#FFC857', bg: 'rgba(255, 200, 87, 0.10)', border: 'rgba(255, 200, 87, 0.35)', icon: '⚠️' },
  success: { color: '#10F2A0', bg: 'rgba(16, 242, 160, 0.10)', border: 'rgba(16, 242, 160, 0.35)', icon: '✓' },
  info:    { color: '#5EE2FF', bg: 'rgba(94, 226, 255, 0.06)', border: 'rgba(94, 226, 255, 0.25)', icon: 'ℹ️' },
};

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<ActiveDialog | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const confirm = useCallback<DialogContextType['confirm']>((opts) => {
    return new Promise<boolean>((resolve) => setActive({ kind: 'confirm', opts, resolve }));
  }, []);

  const alert = useCallback<DialogContextType['alert']>((opts) => {
    return new Promise<void>((resolve) => setActive({ kind: 'alert', opts, resolve }));
  }, []);

  const notify = useCallback<DialogContextType['notify']>((message, variant = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  function handleConfirm() {
    if (!active) return;
    if (active.kind === 'confirm') active.resolve(true);
    else active.resolve();
    setActive(null);
  }
  function handleCancel() {
    if (!active) return;
    if (active.kind === 'confirm') active.resolve(false);
    else active.resolve();
    setActive(null);
  }

  // ESC fecha (= cancela)
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleCancel();
      if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName !== 'TEXTAREA') handleConfirm();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line
  }, [active]);

  return (
    <DialogContext.Provider value={{ confirm, alert, notify }}>
      {children}

      {/* Modal centralizado */}
      {active && <DialogShell active={active} onConfirm={handleConfirm} onCancel={handleCancel} />}

      {/* Toasts no canto */}
      <ToastStack toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </DialogContext.Provider>
  );
}

function DialogShell({
  active, onConfirm, onCancel,
}: {
  active: ActiveDialog;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const opts = active.opts;
  const variant: Variant = opts.variant || (active.kind === 'confirm' ? 'confirm' : 'info');
  const v = VARIANT_STYLES[variant];
  const isConfirm = active.kind === 'confirm';
  const title = opts.title || (isConfirm ? 'Confirmar ação' : 'Aviso');
  const confirmLabel = opts.confirmLabel || (isConfirm ? 'Confirmar' : 'OK');
  const cancelLabel = isConfirm ? ((opts as ConfirmOpts).cancelLabel || 'Cancelar') : null;

  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', animation: 'dialog-fade 150ms ease-out' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: '#0B1314',
          border: `1px solid ${v.border}`,
          boxShadow: `0 24px 64px -16px rgba(0,0,0,0.7), 0 0 32px ${v.bg}`,
          animation: 'dialog-slide-in 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header com ícone */}
        <div className="px-6 pt-6 pb-4 flex items-start gap-4">
          <div
            className="h-12 w-12 rounded-full flex items-center justify-center text-2xl shrink-0"
            style={{ background: v.bg, border: `1px solid ${v.border}` }}
          >
            {v.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold tracking-tightest leading-tight" style={{ color: v.color }}>
              {title}
            </h2>
            <div className="mt-2 text-sm text-fg-muted leading-relaxed whitespace-pre-wrap">
              {opts.message}
            </div>
          </div>
        </div>

        {/* Botões */}
        <div className="px-6 pb-6 pt-2 flex items-center justify-end gap-2">
          {cancelLabel && (
            <button
              type="button"
              onClick={onCancel}
              className="btn btn-ghost !text-sm !py-2 !px-4"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="btn !text-sm !py-2 !px-5 font-medium"
            style={{
              background: variant === 'danger'
                ? 'linear-gradient(180deg, #FF6363, #C53030)'
                : variant === 'success'
                ? 'linear-gradient(180deg, #10F2A0, #16855E)'
                : variant === 'warn'
                ? 'linear-gradient(180deg, #FFC857, #C99E29)'
                : 'linear-gradient(180deg, #5EE2FF, #1E94B6)',
              color: variant === 'danger' || variant === 'warn' ? '#0a0a0c' : '#0a0a0c',
              fontWeight: 600,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes dialog-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes dialog-slide-in {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

function ToastStack({ toasts, onClose }: { toasts: Toast[]; onClose: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[101] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => {
        const v = VARIANT_STYLES[t.variant];
        return (
          <div
            key={t.id}
            onClick={() => onClose(t.id)}
            className="px-4 py-3 rounded-xl text-sm cursor-pointer flex items-start gap-3"
            style={{
              background: '#0B1314',
              border: `1px solid ${v.border}`,
              color: v.color,
              boxShadow: `0 8px 24px -4px rgba(0,0,0,0.5), 0 0 16px ${v.bg}`,
              animation: 'toast-in 200ms ease-out',
              minWidth: '240px',
            }}
          >
            <span className="text-base shrink-0">{v.icon}</span>
            <span className="flex-1 text-fg">{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}

export function useDialog(): DialogContextType {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    // Fallback degradado: usa nativo se o provider não tá montado.
    return {
      confirm: async (opts) => window.confirm(typeof opts.message === 'string' ? opts.message : 'Confirmar?'),
      alert: async (opts) => window.alert(typeof opts.message === 'string' ? opts.message : ''),
      notify: (msg) => console.log('[notify]', msg),
    };
  }
  return ctx;
}
