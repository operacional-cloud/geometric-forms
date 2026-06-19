import { notFound } from 'next/navigation';
import { getPublicForm } from '@/lib/server/publicLeads';
import { PublicFormClient } from './form-client';

export const dynamic = 'force-dynamic';

export default async function PublicFormPage({
  params,
}: {
  params: { clientSlug: string; formSlug: string };
}) {
  let data: any = null;
  try {
    data = await getPublicForm(params.clientSlug, params.formSlug);
  } catch {
    notFound();
  }
  if (!data) notFound();
  return <PublicFormClient tenant={data.tenant} form={data.form} />;
}
