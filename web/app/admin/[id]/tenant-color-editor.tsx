'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { Kicker } from '@/components/ui';
import { useDialog } from '@/components/Dialog';

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

// Paleta sugerida de cores da marca + Tailwind populares
const PRESETS = [
  '#10F2A0', '#5EE2FF', '#16855E', '#A66EFC', '#FFC857', '#FF6363',
  '#FF8B8B', '#3B82F6', '#22C55E', '#F59E0B', '#EC4899', '#14B8A6',
];

export function TenantColorEditor({
  tenantId,
  initialPrimary,
  initialSecondary,
}: {
  tenantId: string;
  initialPrimary: string;
  initialSecondary: string;
}) {
  const router = useRouter();
  const { notify } = useDialog();
  const [primary, setPrimary] = useState(initialPrimary);
  const [secondary, setSecondary] = useState(initialSecondary);
  const [saving, setSaving] = useState(false);

  const primaryValid = HEX_RE.test(primary);
  const secondaryValid = HEX_RE.test(secondary);
  const dirty = primary !== initialPrimary || secondary !== initialSecondary;

  async function save() {
    if (!primaryValid || !secondaryValid) {
      notify('Cor inválida. Use formato hex #RRGGBB (ex: #10F2A0)', 'danger');
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        body: { primary_color: primary, secondary_color: secondary },
      });
      notify('Cores atualizadas', 'success');
      router.refresh();
    } catch (e: any) {
      notify(`Falha: ${e?.message || 'erro'}`, 'danger');
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setPrimary(initialPrimary);
    setSecondary(initialSecondary);
  }

  return (
    <section className="glass-static p-6 lg:p-7 mb-8">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div>
          <Kicker>CORES DA MARCA</Kicker>
          <p className="text-xs text-fg-muted mt-1">
            Personalize as cores que aparecem nos formulários públicos e no painel do cliente.
          </p>
        </div>
        {dirty && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reset}
              disabled={saving}
              className="btn btn-ghost !text-xs !py-1.5 !px-3"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !primaryValid || !secondaryValid}
              className="btn btn-primary !text-xs !py-1.5 !px-3 disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <ColorPicker
          label="Cor primária"
          value={primary}
          onChange={setPrimary}
          valid={primaryValid}
          presets={PRESETS}
        />
        <ColorPicker
          label="Cor secundária"
          value={secondary}
          onChange={setSecondary}
          valid={secondaryValid}
          presets={PRESETS}
        />
      </div>

      {/* Preview ao vivo */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="glass-inner p-4">
          <div className="kicker !mb-2">PREVIEW · BOTÃO</div>
          <button
            type="button"
            className="rounded-md px-4 py-2 text-sm font-semibold"
            style={{ background: primaryValid ? primary : '#666', color: '#0a0a0c' }}
          >
            Enviar
          </button>
        </div>
        <div className="glass-inner p-4">
          <div className="kicker !mb-2">PREVIEW · LOGO</div>
          <div
            className="h-10 w-10 rounded-xl ring-1 ring-white/10 flex items-center justify-center text-base font-semibold"
            style={{
              background: primaryValid ? `linear-gradient(135deg, ${primary}, ${secondaryValid ? secondary : primary})` : '#666',
              color: '#0a0a0c',
            }}
          >
            G
          </div>
        </div>
      </div>
    </section>
  );
}

function ColorPicker({
  label,
  value,
  onChange,
  valid,
  presets,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  valid: boolean;
  presets: string[];
}) {
  return (
    <div>
      <label className="block">
        <div className="kicker !mb-2">{label}</div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={valid ? value : '#10F2A0'}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="h-10 w-12 rounded-md cursor-pointer border border-line bg-transparent"
            aria-label={`${label} (color picker)`}
          />
          <input
            type="text"
            value={value}
            onChange={(e) => {
              let v = e.target.value.trim().toUpperCase();
              if (v && !v.startsWith('#')) v = '#' + v;
              onChange(v);
            }}
            placeholder="#10F2A0"
            maxLength={7}
            className={`input flex-1 !text-sm !font-mono ${!valid ? '!border-danger/40' : ''}`}
          />
        </div>
        {!valid && (
          <div className="mt-1 text-[11px] text-danger font-mono">
            Formato hex inválido (use #RRGGBB)
          </div>
        )}
      </label>

      <div className="mt-3">
        <div className="text-[10px] text-fg-dim uppercase tracking-widest mb-1.5">Sugestões</div>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              className="h-6 w-6 rounded ring-1 ring-white/10 hover:ring-white/40 transition-all"
              style={{ background: c }}
              title={c}
              aria-label={`Usar cor ${c}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
