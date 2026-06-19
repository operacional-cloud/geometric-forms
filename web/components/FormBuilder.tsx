'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GradientButton, GhostButton, ArrowRight, Kicker } from '@/components/ui';

export type FieldOption = { label: string; value: string; score?: number };
export type FieldType = 'text' | 'email' | 'phone' | 'number' | 'radio' | 'checkbox' | 'select' | 'textarea';
export type Field = {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: FieldOption[];
  /** Campo "do sistema" (nome/telefone) — não pode ser removido nem ter tipo alterado. */
  system?: boolean;
};

export type FormDraft = {
  title: string;
  description: string;
  qualification_threshold: number;
  is_active: boolean;
  fields: Field[];
  cover_image_url?: string | null;
  whatsapp_link?: string | null;
  success_button_label?: string | null;
  meta_pixel_id?: string | null;
  webhook_url?: string | null;
};

const NEEDS_OPTIONS = new Set(['radio', 'checkbox', 'select']);
const FIELD_TYPES: { t: FieldType; icon: string; label: string }[] = [
  { t: 'text',     icon: 'T', label: 'texto' },
  { t: 'textarea', icon: '¶', label: 'parágrafo' },
  { t: 'email',    icon: '@', label: 'email' },
  { t: 'phone',    icon: '☏', label: 'telefone' },
  { t: 'number',   icon: '#', label: 'número' },
  { t: 'radio',    icon: '○', label: 'única escolha' },
  { t: 'checkbox', icon: '☐', label: 'múltipla' },
  { t: 'select',   icon: '▾', label: 'select' },
];

function newId() { return Math.random().toString(36).slice(2, 10); }
function newField(type: FieldType = 'text'): Field {
  const base: Field = { id: newId(), type, label: '', required: false };
  if (NEEDS_OPTIONS.has(type)) {
    base.options = [
      { label: 'Opção A', value: 'opt_a', score: 1 },
      { label: 'Opção B', value: 'opt_b', score: 5 },
    ];
  }
  return base;
}

/** Default fields obrigatórios em todo form (nome + telefone). Não removíveis. */
export function makeDefaultSystemFields(): Field[] {
  return [
    { id: 'nome',     type: 'text',  label: 'Seu nome',  required: true, system: true, placeholder: 'João Silva' },
    { id: 'telefone', type: 'phone', label: 'WhatsApp',  required: true, system: true, placeholder: '+55 11 99999-9999' },
  ];
}

export function FormBuilder({
  initial,
  submitLabel = 'Salvar formulário',
  onSubmit,
}: {
  initial?: Partial<FormDraft>;
  submitLabel?: string;
  onSubmit: (draft: FormDraft) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [threshold, setThreshold] = useState(initial?.qualification_threshold ?? 5);
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [fields, setFields] = useState<Field[]>(() => {
    const incoming = initial?.fields ?? [];
    // Garante que nome+telefone existem sempre (e ficam no topo, marcados como system)
    const hasNome = incoming.some((f) => f.id === 'nome' || (f.system && f.type === 'text'));
    const hasPhone = incoming.some((f) => f.id === 'telefone' || (f.system && f.type === 'phone'));
    const defaults = makeDefaultSystemFields();
    let merged = [...incoming];
    if (!hasNome) merged = [defaults[0], ...merged];
    if (!hasPhone) merged = [merged[0], defaults[1], ...merged.slice(1)];
    // Marcar nome/telefone existentes como system, garantir required
    return merged.map((f) => {
      if (f.id === 'nome' || f.id === 'telefone' || f.system) {
        return { ...f, system: true, required: true };
      }
      return f;
    });
  });
  const [coverImageUrl, setCoverImageUrl] = useState(initial?.cover_image_url ?? '');
  const [whatsappLink, setWhatsappLink] = useState(initial?.whatsapp_link ?? '');
  const [successButtonLabel, setSuccessButtonLabel] = useState(initial?.success_button_label ?? 'Quero agilizar');
  const [metaPixelId, setMetaPixelId] = useState(initial?.meta_pixel_id ?? '');
  const [webhookUrl, setWebhookUrl] = useState(initial?.webhook_url ?? '');

  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField(id: string, patch: Partial<Field>) {
    setFields((s) => s.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }
  function changeType(id: string, type: FieldType) {
    const target = fields.find((f) => f.id === id);
    if (target?.system) return; // não muda tipo dos system fields
    const needs = NEEDS_OPTIONS.has(type);
    setFields((s) => s.map((f) => {
      if (f.id !== id) return f;
      const next: Field = { ...f, type };
      if (needs && !f.options) next.options = [{ label: '', value: '', score: 1 }];
      if (!needs) delete next.options;
      return next;
    }));
  }
  function moveField(id: string, dir: -1 | 1) {
    setFields((s) => {
      const i = s.findIndex((f) => f.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.length) return s;
      // Não permite mover system fields nem mover outro pra antes deles
      if (s[i].system || s[j].system) return s;
      const ns = [...s];
      [ns[i], ns[j]] = [ns[j], ns[i]];
      return ns;
    });
  }
  function removeField(id: string) {
    const target = fields.find((f) => f.id === id);
    if (target?.system) return; // não remove system fields
    setFields((s) => s.filter((f) => f.id !== id));
    if (activeId === id) setActiveId(null);
  }
  function addField(type: FieldType) {
    const f = newField(type);
    setFields((s) => [...s, f]);
    setActiveId(f.id);
  }

  function updateOption(fid: string, oi: number, patch: Partial<FieldOption>) {
    setFields((s) => s.map((f) => {
      if (f.id !== fid || !f.options) return f;
      return { ...f, options: f.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) };
    }));
  }
  function addOption(fid: string) {
    setFields((s) => s.map((f) => (f.id === fid && f.options
      ? { ...f, options: [...f.options, { label: '', value: '', score: 0 }] }
      : f
    )));
  }
  function removeOption(fid: string, oi: number) {
    setFields((s) => s.map((f) => (f.id === fid && f.options
      ? { ...f, options: f.options.filter((_, j) => j !== oi) }
      : f
    )));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        title,
        description,
        qualification_threshold: threshold,
        is_active: isActive,
        fields,
        cover_image_url: coverImageUrl.trim() || null,
        whatsapp_link: whatsappLink.trim() || null,
        success_button_label: successButtonLabel.trim() || null,
        meta_pixel_id: metaPixelId.trim() || null,
        webhook_url: webhookUrl.trim() || null,
      });
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  const totalMaxScore = fields.reduce((acc, f) => {
    if (!f.options) return acc;
    if (f.type === 'checkbox') return acc + f.options.reduce((a, o) => a + (o.score || 0), 0);
    return acc + Math.max(0, ...f.options.map((o) => o.score || 0));
  }, 0);

  return (
    <form onSubmit={handleSubmit} className="grid lg:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-5">
        {/* HEADER */}
        <section className="glass-static p-6 space-y-4">
          <Kicker>CABEÇALHO</Kicker>
          <input
            required
            className="input-bare !text-3xl font-semibold tracking-tightest"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título do formulário"
          />
          <textarea
            rows={2}
            className="input mt-2 resize-none"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrição opcional (mostrada na página pública)"
          />
        </section>

        {/* FIELDS */}
        <section className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Kicker>CAMPOS · {fields.length}</Kicker>
            <div className="flex flex-wrap gap-1.5">
              {FIELD_TYPES.map((ft) => (
                <button
                  key={ft.t}
                  type="button"
                  onClick={() => addField(ft.t)}
                  className="btn btn-ghost !py-1.5 !px-2.5 !text-xs"
                  title={`Adicionar campo ${ft.label}`}
                >
                  <span className="font-mono w-3 text-center">{ft.icon}</span>
                  {ft.label}
                </button>
              ))}
            </div>
          </div>

          <AnimatePresence initial={false}>
            {fields.map((f, fi) => {
              const isActive = activeId === f.id;
              const locked = !!f.system;
              return (
                <motion.div
                  key={f.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className={`glass-static p-5 ${isActive ? 'ring-1 ring-brand/40' : ''} ${locked ? 'border-brand/15' : ''}`}
                  onClick={() => setActiveId(f.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono text-[11px] text-fg-dim">/{String(fi + 1).padStart(2, '0')}</span>
                      <select
                        value={f.type}
                        disabled={locked}
                        onChange={(e) => changeType(f.id, e.target.value as FieldType)}
                        className="input !py-1 !px-2 !text-xs font-mono w-auto disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {FIELD_TYPES.map((ft) => (
                          <option key={ft.t} value={ft.t}>{ft.t}</option>
                        ))}
                      </select>
                      <label className={`flex items-center gap-2 text-xs text-fg-muted select-none ${locked ? 'opacity-60' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          checked={f.required}
                          disabled={locked}
                          onChange={(e) => updateField(f.id, { required: e.target.checked })}
                          className="accent-brand"
                        />
                        required
                      </label>
                      {locked && (
                        <span className="badge badge-gold !text-[9px]">obrigatório · sistema</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" disabled={locked} onClick={(e) => { e.stopPropagation(); moveField(f.id, -1); }}
                        className="btn-icon disabled:opacity-30 disabled:cursor-not-allowed" aria-label="Subir">↑</button>
                      <button type="button" disabled={locked} onClick={(e) => { e.stopPropagation(); moveField(f.id, 1); }}
                        className="btn-icon disabled:opacity-30 disabled:cursor-not-allowed" aria-label="Descer">↓</button>
                      <button type="button" disabled={locked} onClick={(e) => { e.stopPropagation(); removeField(f.id); }}
                        className="btn-icon !text-danger hover:!border-danger/40 disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Remover">×</button>
                    </div>
                  </div>

                  <input
                    required
                    className="input mt-3 !text-base"
                    value={f.label}
                    onChange={(e) => updateField(f.id, { label: e.target.value })}
                    placeholder="Pergunta visível ao lead"
                  />

                  {f.options && (
                    <div className="mt-4 space-y-2">
                      <div className="kicker">OPÇÕES · pontuam</div>
                      {f.options.map((o, oi) => (
                        <div key={oi} className="grid grid-cols-12 gap-2 items-center">
                          <input
                            className="input !py-1.5 !text-sm col-span-5"
                            value={o.label}
                            onChange={(e) => updateOption(f.id, oi, { label: e.target.value })}
                            placeholder="Label exibida"
                          />
                          <input
                            className="input !py-1.5 !text-sm font-mono col-span-4"
                            value={o.value}
                            onChange={(e) => updateOption(f.id, oi, { value: e.target.value })}
                            placeholder="value"
                          />
                          <input
                            type="number"
                            className="input !py-1.5 !text-sm font-mono text-center col-span-2"
                            value={o.score ?? 0}
                            onChange={(e) => updateOption(f.id, oi, { score: Number(e.target.value) })}
                            placeholder="pts"
                          />
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeOption(f.id, oi); }}
                            className="btn-icon col-span-1"
                            aria-label="Remover opção"
                          >×</button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); addOption(f.id); }}
                        className="btn btn-ghost !py-1 !px-2.5 !text-xs"
                      >
                        + opção
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </section>
      </div>

      {/* SIDEBAR */}
      <aside className="lg:sticky lg:top-24 self-start space-y-4">
        <div className="glass-static p-6 relative overflow-hidden">
          <Kicker>QUALIFICAÇÃO</Kicker>
          <label className="block mt-4">
            <span className="text-sm text-fg-muted">Threshold (pts)</span>
            <input
              type="number"
              className="input mt-1 font-mono"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              min={0}
            />
          </label>

          <label className="mt-4 flex items-center gap-2 text-sm text-fg-muted select-none cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="accent-brand"
            />
            Formulário ativo
          </label>

          <div className="mt-6 pt-6 border-t border-line">
            <div className="kicker">SCORE MÁX POSSÍVEL</div>
            <div className="mt-1 text-5xl font-semibold tracking-tightest tabular text-brand-gradient">
              {totalMaxScore}
            </div>
            <div className="mt-2 text-xs text-fg-muted">
              Lead qualifica se score ≥ <span className="font-mono text-brand">{threshold}</span>.
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-line">
            <div className="kicker">RESUMO</div>
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-fg-muted">Campos</span><span className="font-mono">{fields.length}</span></div>
              <div className="flex justify-between"><span className="text-fg-muted">Obrigatórios</span><span className="font-mono">{fields.filter((f) => f.required).length}</span></div>
              <div className="flex justify-between"><span className="text-fg-muted">Com opções</span><span className="font-mono">{fields.filter((f) => f.options).length}</span></div>
            </div>
          </div>
        </div>

        {/* ===== TELA DE INÍCIO ===== */}
        <div className="glass-static p-6">
          <Kicker>TELA DE INÍCIO</Kicker>
          <label className="block mt-4">
            <span className="text-sm text-fg-muted">URL da imagem de capa</span>
            <input
              type="url"
              className="input mt-1 font-mono !text-xs"
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              placeholder="https://… .png"
            />
            <span className="block mt-1.5 text-[11px] text-fg-dim">
              Exibida acima do título na tela inicial. Use uma imagem hospedada em qualquer URL pública.
            </span>
          </label>

          {coverImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverImageUrl}
              alt="Preview"
              className="mt-3 w-full h-24 object-cover rounded-md border border-line"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
        </div>

        {/* ===== INTEGRAÇÕES ===== */}
        <div className="glass-static p-6">
          <Kicker>INTEGRAÇÕES</Kicker>
          <label className="block mt-4">
            <span className="text-sm text-fg-muted">Meta Pixel ID</span>
            <input
              type="text"
              className="input mt-1 font-mono !text-xs"
              value={metaPixelId}
              onChange={(e) => setMetaPixelId(e.target.value)}
              placeholder="1234567890"
              maxLength={32}
            />
            <span className="block mt-1.5 text-[11px] text-fg-dim">
              ID do Meta Pixel injetado na página pública. Dispara <code className="text-brand">PageView</code> e <code className="text-brand">Lead</code> automaticamente.
            </span>
          </label>
          <label className="block mt-4">
            <span className="text-sm text-fg-muted">Webhook URL</span>
            <input
              type="url"
              className="input mt-1 font-mono !text-xs"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.zapier.com/… ou https://n8n.seu.com/webhook/…"
            />
            <span className="block mt-1.5 text-[11px] text-fg-dim">
              POST JSON disparado a cada lead recebido (parcial e completo). Útil pra Zapier, n8n, Make.
            </span>
          </label>
        </div>

        {/* ===== TELA DE OBRIGADO ===== */}
        <div className="glass-static p-6">
          <Kicker>TELA DE OBRIGADO</Kicker>
          <label className="block mt-4">
            <span className="text-sm text-fg-muted">Texto do botão final</span>
            <input
              type="text"
              className="input mt-1"
              value={successButtonLabel}
              onChange={(e) => setSuccessButtonLabel(e.target.value)}
              placeholder="Quero agilizar"
              maxLength={80}
            />
          </label>
          <label className="block mt-4">
            <span className="text-sm text-fg-muted">Link de WhatsApp do botão</span>
            <input
              type="url"
              className="input mt-1 font-mono !text-xs"
              value={whatsappLink}
              onChange={(e) => setWhatsappLink(e.target.value)}
              placeholder="https://wa.me/55…"
            />
            <span className="block mt-1.5 text-[11px] text-fg-dim">
              Após enviar o form, o lead clica nesse botão e abre seu WhatsApp.
            </span>
          </label>
        </div>

        {error && (
          <div className="glass-static p-4 border-danger/40">
            <Kicker>ERRO</Kicker>
            <div className="mt-2 text-sm text-danger break-words">{error}</div>
          </div>
        )}

        <div className="flex gap-2">
          <GhostButton onClick={() => history.back()} className="flex-1 justify-center">Cancelar</GhostButton>
          <GradientButton type="submit" disabled={busy || !title || fields.length === 0} className="flex-1 justify-center">
            {busy ? 'Salvando…' : submitLabel} <ArrowRight />
          </GradientButton>
        </div>
      </aside>
    </form>
  );
}
