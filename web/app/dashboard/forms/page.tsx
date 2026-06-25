import { requireTenantMember } from '@/lib/server/auth';
import { listForms } from '@/lib/server/forms';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { getActiveTenantId } from '@/lib/server/active-tenant';
import { PageHeader, GradientButton, Empty } from '@/components/ui';
import { FormsClient } from './forms-client';
import { ImportFormButton } from './import-form-button';

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
type FormWithTenant = Form & { tenant_id: string };

export default async function FormsPage() {
  const ctx = await requireTenantMember();

  let leads: Lead[] = [];
  let tenantSlug: string | null = null;

  const fr = await listForms(ctx);
  let forms = fr.forms as FormWithTenant[];

  // Filtra forms pelo tenant ativo (cookie viewing_tenant_id quando admin).
  const activeTenantId = getActiveTenantId(ctx);
  if (activeTenantId) {
    forms = forms.filter((f) => f.tenant_id === activeTenantId);
  }

  // Busca leads matchando os forms visíveis (funciona pra admin e member).
  if (forms.length > 0) {
    const formIds = forms.map((f) => f.id);
    const { data } = await supabaseAdmin
      .from('leads')
      .select('id, form_id, is_qualified, created_at')
      .in('form_id', formIds)
      .limit(2000);
    leads = (data || []) as Lead[];
  }

  // Slug do tenant pra montar URL pública. Prioriza tenant ativo.
  const tenantIdForSlug = activeTenantId || forms[0]?.tenant_id;
  if (tenantIdForSlug) {
    const { data: t } = await supabaseAdmin
      .from('tenants')
      .select('slug')
      .eq('id', tenantIdForSlug)
      .maybeSingle();
    tenantSlug = (t as any)?.slug ?? null;
  }

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
        action={(
          <div className="flex items-center gap-2">
            <ImportFormButton />
            <GradientButton href="/dashboard/forms/new">+ Novo Formulário</GradientButton>
          </div>
        )}
      />

      {forms.length === 0 ? (
        <Empty message="Nenhum formulário ainda." cta={{ href: '/dashboard/forms/new', label: 'Criar primeiro form' }} />
      ) : (
        <FormsClient forms={forms} stats={stats} totalLeads={leads.length} tenantSlug={tenantSlug} />
      )}
    </main>
  );
}
