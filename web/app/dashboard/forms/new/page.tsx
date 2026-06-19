'use client';

import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/ui';
import { FormBuilder, type FormDraft } from '@/components/FormBuilder';

export default function NewFormPage() {
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
          .map((o) => ({ label: o.label, value: o.value, ...(typeof o.score === 'number' ? { score: o.score } : {}) }));
      }
      return out;
    });

    const { data: { session } } = await getSupabaseBrowser().auth.getSession();
    if (!session) throw new Error('Sem sessão');

    await apiFetch('/api/forms', {
      method: 'POST',
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
        meta_pixel_id: draft.meta_pixel_id || null,
        webhook_url: draft.webhook_url || null,
      },
    });
    router.push('/dashboard/forms');
    router.refresh();
  }

  return (
    <main className="container-edge py-12">
      <PageHeader
        kicker="NEW FORM · BUILDER"
        title="Criar formulário."
        subtitle="Os campos Nome e WhatsApp já vêm fixos e obrigatórios em todo formulário."
      />
      <FormBuilder onSubmit={handleSubmit} submitLabel="Criar form" />
    </main>
  );
}
