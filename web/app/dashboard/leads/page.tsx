import Link from 'next/link';
import { getSessionAndProfile } from '@/lib/supabase-server';
import { apiFetch } from '@/lib/api';
import { PageHeader, Empty, ArrowRight } from '@/components/ui';
import { getLeadName, getLeadPhone, getLeadEmail, whatsappLink, formatPhone } from '@/lib/contact';

type Lead = {
  id: string;
  form_id: string;
  answers: Record<string, any>;
  lead_score: number;
  is_qualified: boolean;
  is_complete?: boolean;
  status: string;
  utm_source: string | null;
  utm_campaign: string | null;
  created_at: string;
};
type Form = { id: string; title: string; fields: any[] };

export default async function LeadsPage() {
  const { accessToken } = await getSessionAndProfile();
  let leads: Lead[] = [];
  let forms: Form[] = [];
  try {
    const r = await apiFetch<{ data: { leads: Lead[] } }>('/api/leads?limit=500', { token: accessToken });
    leads = r.data.leads;
    const fr = await apiFetch<{ data: { forms: Form[] } }>('/api/forms', { token: accessToken });
    forms = fr.data.forms;
  } catch {}

  const formMap = new Map(forms.map((f) => [f.id, f]));

  return (
    <main className="container-edge py-12">
      <PageHeader
        kicker="LEADS · 003"
        title="Todos os leads."
        subtitle={`${leads.length} respostas no total — filtre por formulário pra ver detalhes.`}
        action={
          <Link href="/dashboard/forms" className="btn btn-ghost !text-sm">
            Ver por formulário <ArrowRight />
          </Link>
        }
      />

      {leads.length === 0 && (
        <Empty message="Nenhum lead ainda. Publique um form pra começar." cta={{ href: '/dashboard/forms', label: 'Ver formulários' }} />
      )}

      {leads.length > 0 && (
        <div className="glass-static overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02]">
              <tr className="border-b border-line">
                <th className="text-left py-3 px-4 kicker !mb-0">#</th>
                <th className="text-left py-3 px-4 kicker !mb-0">Pontos</th>
                <th className="text-left py-3 px-4 kicker !mb-0">Contato</th>
                <th className="text-left py-3 px-4 kicker !mb-0">Formulário</th>
                <th className="text-left py-3 px-4 kicker !mb-0">Origem</th>
                <th className="text-left py-3 px-4 kicker !mb-0">WhatsApp</th>
                <th className="text-right py-3 px-4 kicker !mb-0">Data</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l, i) => {
                const form = formMap.get(l.form_id);
                const fields = form?.fields || [];
                const name = getLeadName(l.answers, fields);
                const phone = getLeadPhone(l.answers, fields);
                const email = getLeadEmail(l.answers, fields);
                const wa = whatsappLink(phone, name ? `Olá ${name.split(' ')[0]}!` : undefined);
                return (
                  <tr key={l.id} className="border-b border-line/50 hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4 font-mono text-xs text-fg-dim">{String(i + 1).padStart(3, '0')}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className={`tabular font-semibold ${l.is_qualified ? 'text-emerald' : ''}`}>{l.lead_score}</span>
                        {l.is_qualified && <span className="badge badge-success badge-dot">QL</span>}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium truncate max-w-[180px] flex items-center gap-2">
                        <span className="truncate">{name || <span className="text-fg-muted">—</span>}</span>
                        {l.is_complete === false && (
                          <span className="badge badge-warn !py-0 !px-1.5 !text-[9px]">incompleto</span>
                        )}
                      </div>
                      <div className="text-xs text-fg-muted font-mono mt-0.5 truncate max-w-[180px]">{email || formatPhone(phone)}</div>
                    </td>
                    <td className="py-3 px-4">
                      {form ? (
                        <Link href={`/dashboard/forms/${l.form_id}/leads`} className="link text-xs">
                          {form.title}
                        </Link>
                      ) : <span className="text-fg-muted">—</span>}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-xs text-fg">{l.utm_source || '—'}</div>
                      {l.utm_campaign && <div className="text-[11px] text-fg-dim font-mono mt-0.5">{l.utm_campaign}</div>}
                    </td>
                    <td className="py-3 px-4">
                      {wa ? (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn !py-1 !px-2 !text-[11px] !rounded-md"
                          style={{
                            background: 'linear-gradient(180deg, #25D366 0%, #128C7E 100%)',
                            color: '#fff',
                          }}
                        >
                          chamar ↗
                        </a>
                      ) : <span className="text-xs text-fg-dim">—</span>}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-fg-muted">
                      {new Date(l.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
