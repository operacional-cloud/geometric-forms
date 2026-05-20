import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/server/auth';
import { listTenants } from '@/lib/server/tenants';
import { NewFormForTenantClient } from './new-form-client';

export const dynamic = 'force-dynamic';

export default async function AdminNewFormForTenantPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  let tenant: any = null;
  try {
    const r = await listTenants();
    tenant = (r.tenants as any[]).find((t) => t.id === params.id) ?? null;
  } catch {}
  if (!tenant) notFound();
  return <NewFormForTenantClient tenant={tenant} />;
}
