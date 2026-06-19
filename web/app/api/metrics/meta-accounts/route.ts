import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { listAdAccountsDetailed } from '@/lib/server/meta-ads';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Lista todas as Ad Accounts que o token tem acesso (direto + via negócios).
 * Usado pelo seletor de conta no UI.
 *
 * `?debug=1` (apenas admin) retorna também o diagnóstico por fonte: quantas
 * contas vieram de /me/adaccounts vs owned/client de cada negócio, e erros
 * (ex.: falta de business_management). Útil pra entender contas faltando.
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const { accounts, diagnostics } = await listAdAccountsDetailed();

  const url = new URL(req.url);
  const wantDebug = url.searchParams.get('debug') === '1' && ctx.profile.role === 'admin';

  return Response.json({
    success: true,
    data: wantDebug ? { accounts, diagnostics } : { accounts },
  });
});
