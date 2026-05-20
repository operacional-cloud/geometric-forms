'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { apiFetch } from '@/lib/api';
import { PageHeader, GhostButton, ArrowRight } from '@/components/ui';
import { FormBuilder, type FormDraft } from '@/components/FormBuilder';

export function EditFormClient({ form }: { form: any }) {
  const router = useRouter();

  async function handleSubmit(draft: FormDraft) {
    const cleanedFields = draft.fields.map((f, idx) => {
      const out: any = { id: f.id, type: f.type, label: f.label, required: f.required, order: idx + 1 };
      if (f.placeholder) out.placeholder = f.placeholder;
      if (f.system) out.system = true;
      if (f.options) {
        out.options = f.options
          .filter((o) => o.label.trim() && o.value.trim())
          .map((o) => ({ label: o.label, value: o.value, ...(typeof o.score === 'number' ? { score: o.score } : {}) }));
      }
      return out;
    });

    const { data: { session } } = await getSupabaseBrowser().auth.getSession();
    if (!session) throw new Error('Sem sessão');

    await apiFetch(`/api/forms/${form.id}`, {
      method: 'PUT',
      token: session.access_token,
      body: {
        title: draft.title,
        description: draft.description || undefined,
        qualification_threshold: draft.qualification_threshold,
        is_active: draft.is_active,
        fields: cleanedFields,
        cover_image_url: draft.cover_image_url || null,
        whatsapp_link: draft.whatsapp_link || null,
        success_button_label: draft.success_button_label || null,
      },
    });
    router.push('/dashboard/forms');
    router.refresh();
  }

  return (
    <main className="container-edge py-12">
      <PageHeader
        kicker={`EDITANDO · /${form.slug}`}
        title={form.title}
        subtitle="Altere campos, pontuações ou threshold de qualificação."
        action={
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/forms/${form.id}/leads`} className="btn btn-ghost !text-sm">
              Ver leads <ArrowRight />
            </Link>
            <GhostButton href="/dashboard/forms">Voltar</GhostButton>
          </div>
        }
      />

      <FormBuilder
        initial={{
          title: form.title,
          description: form.description || '',
          qualification_threshold: form.qualification_threshold,
          is_active: form.is_active,
          fields: form.fields || [],
          cover_image_url: form.cover_image_url,
          whatsapp_link: form.whatsapp_link,
          success_button_label: form.success_button_label,
        }}
        submitLabel="Salvar alterações"
        onSubmit={handleSubmit}
      />
    </main>
  );
}
