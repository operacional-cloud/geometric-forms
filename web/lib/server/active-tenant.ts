/**
 * Sistema de "view-as tenant" pro admin.
 *
 * Admin não tem tenant_id próprio. Quando ele entra no painel de um cliente
 * via /admin/[id] → botão "Entrar no painel", a gente seta o cookie
 * `viewing_tenant_id`. As páginas do /dashboard usam getActiveTenantId() em vez
 * de ctx.profile.tenant_id pra escopar os dados àquele cliente.
 *
 * Membro normal (client/viewer): cookie é ignorado; sempre usa o tenant_id do profile.
 * Admin sem cookie: retorna null — UI deve forçar selecionar cliente ou mostrar global.
 */
import { cookies } from 'next/headers';
import type { AuthContext } from './auth';

export const VIEWING_TENANT_COOKIE = 'viewing_tenant_id';

/**
 * Retorna o tenant_id que deve ser usado pra escopar dados na sessão atual.
 * - Member: sempre o próprio tenant_id (cookie ignorado por segurança).
 * - Admin: lê o cookie viewing_tenant_id; retorna null se não setado.
 */
export function getActiveTenantId(ctx: AuthContext): string | null {
  if (ctx.profile.role !== 'admin') {
    return ctx.profile.tenant_id || null;
  }
  // Admin: lê cookie
  try {
    const c = cookies().get(VIEWING_TENANT_COOKIE)?.value;
    return c && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c) ? c : null;
  } catch {
    return null;
  }
}

/** Helper pra reads em route handlers (mesma lógica, mas sem AuthContext). */
export function getActiveTenantIdRaw(role: string, profileTenantId: string | null): string | null {
  if (role !== 'admin') return profileTenantId;
  try {
    const c = cookies().get(VIEWING_TENANT_COOKIE)?.value;
    return c && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c) ? c : null;
  } catch {
    return null;
  }
}
