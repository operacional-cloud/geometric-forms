/**
 * Vendedores (sellers) — cada lead pode ser atribuído a um vendedor.
 * Métricas agregadas por vendedor mostram desempenho individual.
 */
import { supabaseAdmin } from './supabase-admin';
import { AppError } from './errors';
import type { AuthContext } from './auth';

export type Seller = {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  color: string;
  active: boolean;
  created_at: string;
};

function resolveTenant(ctx: AuthContext, requested?: string | null): string {
  if (ctx.profile.role === 'admin') {
    if (!requested) throw new AppError('Admin precisa selecionar cliente.', { status: 400 });
    return requested;
  }
  if (!ctx.profile.tenant_id) throw new AppError('Sem tenant.', { status: 403 });
  return ctx.profile.tenant_id;
}

export async function listSellers(
  ctx: AuthContext,
  opts: { tenant_id?: string | null; include_inactive?: boolean } = {},
): Promise<Seller[]> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);
  let q = supabaseAdmin
    .from('kanban_sellers')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true });
  if (!opts.include_inactive) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw new AppError(error.message, { status: 500 });
  return (data || []) as Seller[];
}

export async function createSeller(
  ctx: AuthContext,
  input: { name: string; email?: string | null; color?: string; tenant_id?: string },
): Promise<Seller> {
  const tenantId = resolveTenant(ctx, input.tenant_id);
  const name = input.name.trim();
  if (!name) throw new AppError('Nome obrigatório.', { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('kanban_sellers')
    .insert({
      tenant_id: tenantId,
      name,
      email: (input.email || '').trim() || null,
      color: input.color || '#10F2A0',
      active: true,
    })
    .select('*')
    .single();
  if (error) throw new AppError(error.message, { status: 500 });
  return data as Seller;
}

export async function updateSeller(
  ctx: AuthContext,
  sellerId: string,
  patch: { name?: string; email?: string | null; color?: string; active?: boolean; tenant_id?: string },
): Promise<Seller> {
  const tenantId = resolveTenant(ctx, patch.tenant_id);
  const updates: any = {};
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.email !== undefined) updates.email = (patch.email || '').trim() || null;
  if (patch.color !== undefined) updates.color = patch.color;
  if (patch.active !== undefined) updates.active = patch.active;

  const { data, error } = await supabaseAdmin
    .from('kanban_sellers')
    .update(updates)
    .eq('id', sellerId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single();
  if (error) throw new AppError(error.message, { status: 500 });
  return data as Seller;
}

export async function deleteSeller(
  ctx: AuthContext,
  sellerId: string,
  opts: { tenant_id?: string } = {},
): Promise<void> {
  const tenantId = resolveTenant(ctx, opts.tenant_id);
  // ON DELETE SET NULL nos leads — não apaga leads
  const { error } = await supabaseAdmin
    .from('kanban_sellers')
    .delete()
    .eq('id', sellerId)
    .eq('tenant_id', tenantId);
  if (error) throw new AppError(error.message, { status: 500 });
}

/**
 * Atribui (ou desatribui) um lead a um vendedor.
 */
export async function assignLeadToSeller(
  ctx: AuthContext,
  input: { lead_id: string; origin: 'form' | 'manual' | 'prospecting'; seller_id: string | null; tenant_id?: string },
): Promise<void> {
  const tenantId = resolveTenant(ctx, input.tenant_id);
  const table = input.origin === 'prospecting' ? 'prospecting_leads' : 'leads';
  const { error } = await supabaseAdmin
    .from(table)
    .update({ seller_id: input.seller_id })
    .eq('id', input.lead_id)
    .eq('tenant_id', tenantId);
  if (error) throw new AppError(error.message, { status: 500 });
}
