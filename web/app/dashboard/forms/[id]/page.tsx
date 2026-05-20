import { notFound } from 'next/navigation';
import { getSessionAndProfile } from '@/lib/supabase-server';
import { apiFetch } from '@/lib/api';
import { EditFormClient } from './edit-client';

type Form = {
  id: string;
  tenant_id: string;
  slug: string;
  title: string;
  description: string | null;
  fields: any[];
  qualification_threshold: number;
  is_active: boolean;
  settings: Record<string, any>;
};

export default async function EditFormPage({ params }: { params: { id: string } }) {
  const { accessToken } = await getSessionAndProfile();
  let form: Form | null = null;
  try {
    const r = await apiFetch<{ data: { forms: Form[] } }>('/api/forms', { token: accessToken });
    form = r.data.forms.find((f) => f.id === params.id) ?? null;
  } catch {}
  if (!form) notFound();

  return <EditFormClient form={form} />;
}

export const dynamic = 'force-dynamic';
