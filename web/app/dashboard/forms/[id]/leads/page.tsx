import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantMember } from '@/lib/server/auth';
import { listForms, listLeads } from '@/lib/server/forms';
import { PageHeader, GhostButton, Kicker, Empty } from '@/components/ui';
import { LeadCard } from './lead-card';

type Form = {
  id: string;
  slug: string;
  title: string;
  fields: any[];
  qualification_threshold: number;
};
type Lead = {
  id: string;
  form_id: string;
  answers: Record<string, any>;
  lead_score: number;
  is_qualified: boolean;
  is_complete?: boolean;
  status: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  created_at: string;
  capi_event_id: string | null;
};

export default async function FormLeadsPage({ params }: { params: { id: string } }) {
  const ctx = await requireTenantMember();
  let form: Form | null = null;
  let leads: Lead[] = [];
  try {
    const fr = await listForms(ctx);
    form = (fr.forms as Form[]).find((f) => f.id === params.id) ?? null;
    if (form) {
      const lr = await listLeads(ctx, { limit: 500, formId: form.id });
      leads = lr.leads as Lead[];
    }
  } catch {}
  if (!form) notFound();

  const qualified = leads.filter((l) => l.is_qualified).length;
  const qualRate = leads.length > 0 ? Math.round((qualified / leads.length) * 100) : 0;

  return (
    <main className="container-edge py-12">
      <PageHeader
        kicker={`LEADS · ${form.title}`}
        title={`${leads.length} resposta${leads.length === 1 ? '' : 's'}.`}
        subtitle={`${qualified} qualificados (${qualRate}%) · threshold ${form.qualification_threshold} pts`}
        action={
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/forms/${form.id}`} className="btn btn-ghost !text-sm">
              Editar form
            </Link>
            <GhostButton href="/dashboard/forms">Voltar</GhostButton>
          </div>
        }
      />

      {leads.length === 0 ? (
        <Empty message="Nenhum lead respondeu esse formulário ainda." cta={{ href: '/dashboard/forms', label: 'Ver formulários' }} />
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {leads.map((lead, i) => (
            <LeadCard key={lead.id} lead={lead} form={form!} index={i + 1} />
          ))}
        </div>
      )}

      <div className="mt-12 glass-static p-4 flex items-center gap-3 text-sm text-fg-muted">
        <Kicker>WHATSAPP</Kicker>
        <span>Botões "Falar no WhatsApp" usam o número do campo <code className="text-brand">telefone</code> com prefixo +55 quando faltar código de país.</span>
      </div>
    </main>
  );
}
