import { notFound } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { PublicFormClient } from './form-client';

type PublicFormResp = {
  data: {
    tenant: {
      id: string;
      name: string;
      slug: string;
      logo_url: string | null;
      primary_color: string;
      secondary_color: string;
      status: string;
    };
    form: {
      id: string;
      slug: string;
      title: string;
      description: string | null;
      fields: any[];
      settings: Record<string, any>;
      meta_pixel_id: string | null;
      cover_image_url: string | null;
      whatsapp_link: string | null;
      success_button_label: string | null;
    };
  };
};

export default async function PublicFormPage({
  params,
}: {
  params: { tenant: string; form: string };
}) {
  let data: PublicFormResp['data'] | null = null;
  try {
    const r = await apiFetch<PublicFormResp>(
      `/api/public/forms/${encodeURIComponent(params.tenant)}/${encodeURIComponent(params.form)}`,
      { cache: 'no-store' }
    );
    data = r.data;
  } catch {
    notFound();
  }
  if (!data) notFound();

  const { tenant, form } = data;
  return <PublicFormClient tenant={tenant} form={form} />;
}

export const dynamic = 'force-dynamic';
