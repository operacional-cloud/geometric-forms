import { notFound } from 'next/navigation';
import { getSessionAndProfile } from '@/lib/supabase-server';
import { apiFetch } from '@/lib/api';
import { NewFormForTenantClient } from './new-form-client';

type Tenant = {
  id: string;
  name: string;
  slug: string;
  primary_color: string;
};

export default async function AdminNewFormForTenantPage({
  params,
}: {
  params: { id: string };
}) {
  const { accessToken } = await getSessionAndProfile();
  let tenant: Tenant | null = null;
  try {
    const r = await apiFetch<{ data: { tenants: Tenant[] } }>('/api/admin/tenants', {
      token: accessToken,
    });
    tenant = r.data.tenants.find((t) => t.id === params.id) ?? null;
  } catch {}
  if (!tenant) notFound();

  return <NewFormForTenantClient tenant={tenant} />;
}

export const dynamic = 'force-dynamic';
