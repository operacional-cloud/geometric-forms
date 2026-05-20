'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { getLeadName, getLeadPhone, getLeadEmail, whatsappLink, formatPhone } from '@/lib/contact';

type Lead = {
  id: string;
  answers: Record<string, any>;
  lead_score: number;
  is_qualified: boolean;
  is_complete?: boolean;
  status: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  created_at: string;
};

type Form = { id: string; title: string; fields: any[]; qualification_threshold: number };

function WhatsAppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
    </svg>
  );
}

export function LeadCard({ lead, form, index }: { lead: Lead; form: Form; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const fields = form.fields || [];
  const name = getLeadName(lead.answers, fields);
  const phone = getLeadPhone(lead.answers, fields);
  const email = getLeadEmail(lead.answers, fields);
  const waLink = whatsappLink(
    phone,
    name ? `Olá ${name.split(' ')[0]}, vi sua resposta no formulário ${form.title}!` : undefined,
  );

  const scoreColor = lead.is_qualified ? '#10F2A0' : '#8B8B98';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-static p-5 lg:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-[11px] text-fg-dim tracking-widest shrink-0">
            #{String(index).padStart(3, '0')}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-lg tracking-tightest truncate">
                {name || <span className="text-fg-muted">sem nome</span>}
              </span>
              {lead.is_complete === false ? (
                <span className="badge badge-warn badge-dot">incompleto</span>
              ) : (
                <span className="badge badge-success badge-dot">completo</span>
              )}
            </div>
            <div className="text-xs text-fg-muted font-mono mt-0.5">
              {new Date(lead.created_at).toLocaleString('pt-BR')}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className="text-3xl font-semibold tabular tracking-tightest"
            style={{ color: scoreColor }}
          >
            {lead.lead_score}
            <span className="text-xs text-fg-muted ml-0.5">pts</span>
          </div>
          <div className="mt-1">
            {lead.is_qualified ? (
              <span className="badge badge-success badge-dot">qualificado</span>
            ) : (
              <span className="badge badge-muted">sem qualificação</span>
            )}
          </div>
        </div>
      </div>

      {/* Contact strip */}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <div className="glass-inner p-3">
          <div className="kicker !mb-1">TELEFONE</div>
          <div className="font-mono text-sm truncate">{formatPhone(phone)}</div>
        </div>
        <div className="glass-inner p-3">
          <div className="kicker !mb-1">EMAIL</div>
          <div className="font-mono text-sm truncate">{email || '—'}</div>
        </div>
      </div>

      {/* UTM */}
      {(lead.utm_source || lead.utm_campaign) && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {lead.utm_source && <span className="badge tag-meta">{lead.utm_source}</span>}
          {lead.utm_medium && <span className="badge">{lead.utm_medium}</span>}
          {lead.utm_campaign && <span className="badge tag-mono">{lead.utm_campaign}</span>}
        </div>
      )}

      {/* Expandable answers */}
      <details
        className="mt-4 group"
        open={expanded}
        onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer list-none flex items-center justify-between text-xs text-fg-muted hover:text-fg select-none">
          <span className="kicker !mb-0">RESPOSTAS · {Object.keys(lead.answers).length}</span>
          <span className="font-mono group-open:rotate-90 transition-transform">›</span>
        </summary>
        <div className="mt-3 space-y-2">
          {fields.map((f: any) => {
            const v = lead.answers[f.id];
            const display = formatAnswer(v, f);
            return (
              <div key={f.id} className="grid grid-cols-[140px_1fr] gap-3 text-sm py-1.5 border-b border-line/40 last:border-0">
                <div className="text-fg-muted truncate">{f.label || f.id}</div>
                <div className="font-mono text-fg break-words">{display}</div>
              </div>
            );
          })}
        </div>
      </details>

      {/* Actions */}
      <div className="mt-5 pt-4 border-t border-line flex flex-wrap items-center gap-2">
        {waLink ? (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="btn !py-2 !px-3 !text-xs"
            style={{
              background: 'linear-gradient(180deg, #25D366 0%, #128C7E 100%)',
              color: '#fff',
              boxShadow: '0 8px 20px -5px rgba(37, 211, 102, 0.45)',
            }}
          >
            <WhatsAppIcon />
            Falar no WhatsApp
          </a>
        ) : (
          <span className="badge badge-muted">sem telefone</span>
        )}
        <span className="badge badge-muted ml-auto">{lead.status}</span>
      </div>
    </motion.div>
  );
}

function formatAnswer(v: any, field: any): string {
  if (v === undefined || v === null || v === '') return '—';
  if (Array.isArray(v)) {
    return v.map((x) => labelOfOption(x, field) || x).join(', ');
  }
  return labelOfOption(v, field) || String(v);
}
function labelOfOption(value: any, field: any): string | null {
  if (!field?.options) return null;
  const opt = field.options.find((o: any) => String(o.value) === String(value));
  return opt ? opt.label : null;
}
