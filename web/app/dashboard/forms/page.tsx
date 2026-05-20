import { getSessionAndProfile, getSupabaseServer } from '@/lib/supabase-server';
import { apiFetch } from '@/lib/api';
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
  const { accessToken, profile } = await getSessionAndProfile();

  let forms: Form[] = [];
  let leads: Lead[] = [];
  let tenantSlug: string | null = null;

  try {
    const fr = await apiFetch<{ data: { forms: Form[] } }>('/api/forms', { token: accessToken });
    forms = fr.data.forms;
    const lr = await apiFetch<{ data: { leads: Lead[] } }>('/api/leads?limit=1000', { token: accessToken });
    leads = lr.data.leads;

    // Busca o slug do tenant pra montar URL pública
    if (profile?.tenant_id) {
      const supabase = await getSupabaseServer();
      const { data: t } = await supabase
        .from('tenants')
        .select('slug')
        .eq('id', profile.tenant_id)
        .maybeSingle();
      tenantSlug = t?.slug ?? null;
    }
  } catch {}

  // Pre-compute por-form stats
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
        <FormsClient
          forms={forms}
          stats={stats}
          totalLeads={leads.length}
          tenantSlug={tenantSlug}
        />
      )}
    </main>
  );
}
