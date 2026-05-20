import { requireTenantMember } from '@/lib/server/auth';
import { listForms, listLeads } from '@/lib/server/forms';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { PageHeader, GradientButton, Empty } from '@/components/ui';
import { FormsClient } from './forms-client';

type Form = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  qualification_threshold: number;
  fields: any[];
  created_at: string;
  updated_at: string;
};
type Lead = { id: string; form_id: string; is_qualified: boolean; created_at: string };

export default async function FormsPage() {
  const ctx = await requireTenantMember();

  let forms: Form[] = [];
  let leads: Lead[] = [];
  let tenantSlug: string | null = null;
  try {
    const fr = await listForms(ctx);
    forms = fr.forms as Form[];
    const lr = await listLeads(ctx, { limit: 1000 });
    leads = lr.leads as Lead[];
    if (ctx.profile.tenant_id) {
      const { data: t } = await supabaseAdmin
        .from('tenants')
        .select('slug')
        .eq('id', ctx.profile.tenant_id)
        .maybeSingle();
      tenantSlug = (t as any)?.slug ?? null;
    }
  } catch {}

  const stats = forms.map((f) => {
    const formLeads = leads.filter((l) => l.form_id === f.id);
    const qualified = formLeads.filter((l) => l.is_qualified).length;
    return {
      formId: f.id,
      total: formLeads.length,
      qualified,
      rate: formLeads.length > 0 ? Math.round((qualified / formLeads.length) * 100) : 0,
      lastAt: formLeads.length > 0
        ? formLeads.reduce((max, l) => (l.created_at > max ? l.created_at : max), '0')
        : null,
    };
  });

  return (
    <main className="container-edge py-12">
      <PageHeader
        kicker="FORMULÁRIOS · 002"
        title="Formulários."
        subtitle="Crie e gerencie seus formulários de captura de leads."
        action={<GradientButton href="/dashboard/forms/new">+ Novo Formulário</GradientButton>}
      />

      {forms.length === 0 ? (
        <Empty message="Nenhum formulário ainda." cta={{ href: '/dashboard/forms/new', label: 'Criar primeiro form' }} />
      ) : (
        <FormsClient forms={forms} stats={stats} totalLeads={leads.length} tenantSlug={tenantSlug} />
      )}
    </main>
  );
}
