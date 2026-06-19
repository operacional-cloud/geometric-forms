import { supabaseAdmin } from './supabase-admin';
import { createTenantPayloadSchema } from './validators';
import { AppError, ConflictError } from './errors';

export async function createClientTenant(input: unknown) {
  const { tenant, owner } = createTenantPayloadSchema.parse(input);

  const { data: existing } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('slug', tenant.slug)
    .maybeSingle();
  if (existing) throw new ConflictError(`Slug "${tenant.slug}" já está em uso`);

  const { data: createdTenant, error: tErr } = await supabaseAdmin
    .from('tenants')
    .insert({
      name: tenant.name,
      slug: tenant.slug,
      logo_url: tenant.logo_url || null,
      primary_color: tenant.primary_color || '#000000',
      secondary_color: tenant.secondary_color || '#FFFFFF',
      plan: tenant.plan || 'starter',
      status: tenant.status || 'trial',
    })
    .select('*')
    .single();
  if (tErr) throw new AppError(`Falha ao criar tenant: ${tErr.message}`, { status: 500 });

  const { data: userResp, error: uErr } = await supabaseAdmin.auth.admin.createUser({
    email: owner.email,
    password: owner.password,
    email_confirm: true,
    user_metadata: { full_name: owner.full_name, role: 'client', tenant_id: createdTenant.id },
  });
  if (uErr || !userResp?.user) {
    await supabaseAdmin.from('tenants').delete().eq('id', createdTenant.id);
    throw new AppError(`Falha ao criar usuário owner: ${uErr?.message || 'erro desconhecido'}`, { status: 500 });
  }

  const { error: pErr } = await supabaseAdmin
    .from('profiles')
    .update({ full_name: owner.full_name, role: 'client', tenant_id: createdTenant.id })
    .eq('id', userResp.user.id);
  if (pErr) {
    await supabaseAdmin.auth.admin.deleteUser(userResp.user.id);
    await supabaseAdmin.from('tenants').delete().eq('id', createdTenant.id);
    throw new AppError(`Falha ao ajustar profile: ${pErr.message}`, { status: 500 });
  }

  return {
    tenant: createdTenant,
    owner: { id: userResp.user.id, email: userResp.user.email },
  };
}

export async function listTenants() {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new AppError(error.message, { status: 500 });
  return { tenants: data || [] };
}

export async function getTenantById(tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .single();
  if (error) throw new AppError('Tenant não encontrado.', { status: 404 });
  return data;
}

/**
 * Atualiza campos do tenant. Usado pelo admin pra vincular Ad Account Meta etc.
 */
export async function updateTenant(
  tenantId: string,
  patch: {
    name?: string;
    slug?: string;
    logo_url?: string | null;
    primary_color?: string;
    secondary_color?: string;
    plan?: string;
    plan_id?: string | null;
    status?: 'active' | 'inactive' | 'trial' | 'suspended';
    meta_ad_account_id?: string | null;
    metrics_config?: { hidden?: string[] } | null;
  },
) {
  const updates: Record<string, any> = {};
  for (const k of ['name', 'slug', 'logo_url', 'primary_color', 'secondary_color', 'plan', 'plan_id', 'status', 'meta_ad_account_id', 'metrics_config'] as const) {
    if (patch[k] !== undefined) updates[k] = patch[k];
  }
  if (Object.keys(updates).length === 0) {
    return await getTenantById(tenantId);
  }
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .update(updates)
    .eq('id', tenantId)
    .select('*')
    .single();
  if (error) throw new AppError(error.message, { status: 500 });
  return data;
}
