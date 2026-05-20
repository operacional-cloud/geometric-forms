import { notFound } from 'next/navigation';
import { requireTenantMember } from '@/lib/server/auth';
import { listForms } from '@/lib/server/forms';
import { EditFormClient } from './edit-client';

export const dynamic = 'force-dynamic';

export default async function EditFormPage({ params }: { params: { id: string } }) {
  const ctx = await requireTenantMember();
  let form: any = null;
  try {
    const r = await listForms(ctx);
    form = (r.forms as any[]).find((f) => f.id === params.id) ?? null;
  } catch {}
  if (!form) notFound();
  return <EditFormClient form={form} />;
}
