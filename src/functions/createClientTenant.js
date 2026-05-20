import { supabaseAdmin } from '../lib/supabaseClient.js';
import { createTenantPayloadSchema } from '../utils/validators.js';
import { ConflictError, AppError } from '../utils/errors.js';

/**
 * POST /api/admin/tenants
 *
 * Cria um tenant novo + usuário owner (role=client) já vinculado.
 * Acesso restrito a role=admin (validado por middleware).
 *
 * Lógica:
 *   1. Valida payload com zod
 *   2. Verifica slug único
 *   3. INSERT em tenants
 *   4. supabaseAdmin.auth.admin.createUser com tenant_id em raw_user_meta_data
 *      (o trigger handle_new_user cria o profile)
 *   5. UPDATE profile pra garantir role=client, tenant_id e full_name
 *   6. Em qualquer falha pós-tenant, DELETE em tenants (rollback manual)
 */
export async function createClientTenant(req, res, next) {
  try {
    const input = createTenantPayloadSchema.parse(req.body);
    const { tenant, owner } = input;

    // 1) Slug único
    const { data: existing, error: checkErr } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('slug', tenant.slug)
      .maybeSingle();
    if (checkErr) throw new AppError(checkErr.message, { status: 500 });
    if (existing) throw new ConflictError(`Slug "${tenant.slug}" já está em uso`);

    // 2) Cria tenant
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

    // 3) Cria usuário owner. raw_user_meta_data alimenta o trigger handle_new_user.
    const { data: userResp, error: uErr } = await supabaseAdmin.auth.admin.createUser({
      email: owner.email,
      password: owner.password,
      email_confirm: true,
      user_metadata: {
        full_name: owner.full_name,
        role: 'client',
        tenant_id: createdTenant.id,
      },
    });

    if (uErr || !userResp?.user) {
      // rollback
      await supabaseAdmin.from('tenants').delete().eq('id', createdTenant.id);
      throw new AppError(`Falha ao criar usuário owner: ${uErr?.message || 'erro desconhecido'}`, {
        status: 500,
      });
    }

    // 4) Garante consistência do profile (trigger pode não preencher tudo igual)
    const { error: pErr } = await supabaseAdmin
      .from('profiles')
      .update({
        full_name: owner.full_name,
        role: 'client',
        tenant_id: createdTenant.id,
      })
      .eq('id', userResp.user.id);
    if (pErr) {
      // rollback: deleta user + tenant
      await supabaseAdmin.auth.admin.deleteUser(userResp.user.id);
      await supabaseAdmin.from('tenants').delete().eq('id', createdTenant.id);
      throw new AppError(`Falha ao ajustar profile: ${pErr.message}`, { status: 500 });
    }

    console.log(JSON.stringify({
      level: 'info',
      msg: 'tenant_created',
      tenant_id: createdTenant.id,
      tenant_slug: createdTenant.slug,
      owner_id: userResp.user.id,
      owner_email: userResp.user.email,
    }));

    res.status(201).json({
      success: true,
      data: {
        tenant: createdTenant,
        owner: { id: userResp.user.id, email: userResp.user.email },
      },
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/tenants — lista todos (admin only) */
export async function listTenants(_req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new AppError(error.message, { status: 500 });
    res.json({ success: true, data: { tenants: data } });
  } catch (err) {
    next(err);
  }
}
