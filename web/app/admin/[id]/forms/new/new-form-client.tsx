'use client';

import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { apiFetch } from '@/lib/api';
import { PageHeader, GhostButton } from '@/components/ui';
import { FormBuilder, type FormDraft } from '@/components/FormBuilder';

type Tenant = {
  id: string;
  name: string;
  slug: string;
  primary_color: string;
};

export function NewFormForTenantClient({ tenant }: { tenant: Tenant }) {
  const router = useRouter();

  async function handleSubmit(draft: FormDraft) {
    const cleanedFields = draft.fields.map((f, idx) => {
      const out: any = {
        id: f.id, type: f.type, label: f.label,
        required: f.required, order: idx + 1,
      };
      if (f.placeholder) out.placeholder = f.placeholder;
      if (f.system) out.system = true;
      if (f.options) {
        out.options = f.options
          .filter((o) => o.label.trim() && o.value.trim())
          .map((o) => ({
            label: o.label, value: o.value,
            ...(typeof o.score === 'number' ? { score: o.score } : {}),
          }));
      }
      return out;
    });

    const { data: { session } } = await getSupabaseBrowser().auth.getSession();
    if (!session) throw new Error('Sem sessão');

    // Admin: passa tenant_id no body pra criar EM NOME do cliente
    await apiFetch('/api/forms', {
      method: 'POST',
      token: session.access_token,
      body: {
        tenant_id: tenant.id,
        title: draft.title,
        description: draft.description || undefined,
        qualification_threshold: draft.qualification_threshold,
        is_active: draft.is_active,
        fields: cleanedFields,
        cover_image_url: draft.cover_image_url || null,
        whatsapp_link: draft.whatsapp_link || null,
        success_button_label: draft.success_button_label || null,
        meta_pixel_id: draft.meta_pixel_id || null,
        webhook_url: draft.webhook_url || null,
      },
    });

    router.push(`/admin/${tenant.id}`);
    router.refresh();
  }

  return (
    <main className="container-edge py-12">
      <PageHeader
        kicker={`NOVO FORMULÁRIO · ${tenant.name.toUpperCase()}`}
        title={
          <>
            Criando para{' '}
            <span
              className="inline-flex items-center gap-2 align-middle"
            >
              <span
                className="inline-block h-7 w-7 rounded-md ring-1 ring-white/15 align-middle"
                style={{ background: tenant.primary_color || '#10F2A0' }}
              />
              <span className="italic font-display font-normal text-brand-gradient">
                {tenant.name}.
              </span>
            </span>
          </>
        }
        subtitle="Você está criando este formulário em nome do cliente. Ele poderá editá-lo depois pelo próprio painel."
        action={<GhostButton href={`/admin/${tenant.id}`}>← Voltar</GhostButton>}
      />

      <FormBuilder onSubmit={handleSubmit} submitLabel="Criar formulário" />
    </main>
  );
}
