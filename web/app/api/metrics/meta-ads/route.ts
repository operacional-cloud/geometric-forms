import { withErrorHandler, AppError } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { getActiveTenantId } from '@/lib/server/active-tenant';
import { getDashboardData } from '@/lib/server/meta-ads';
import { getTenantById } from '@/lib/server/tenants';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Retorna métricas Meta Ads.
 *
 * Comportamento por tipo de user:
 *  - Cliente comum: usa SEMPRE a conta vinculada ao tenant dele (campo
 *    tenants.meta_ad_account_id). Ignora ?ad_account=
 *  - Admin: usa a conta do cliente em que ele "entrou no painel" (cookie
 *    viewing_tenant_id). Pode sobrescrever com ?ad_account=act_XXX ou
 *    ?tenant_id=<uuid>. Nunca cai numa conta default — sempre é a do cliente.
 *
 * Query: ?start=YYYY-MM-DD&end=YYYY-MM-DD [&ad_account=act_X | &tenant_id=<uuid>]
 */
export const GET = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setDate(today.getDate() - 30);
  const start = url.searchParams.get('start') || monthAgo.toISOString().slice(0, 10);
  const end = url.searchParams.get('end') || today.toISOString().slice(0, 10);

  let adAccount: string | undefined;

  if (ctx.profile.role === 'admin') {
    // Admin: prioridade ad_account explícito → tenant explícito → cliente ativo (cookie).
    // NUNCA usa conta default: as métricas têm que ser sempre do cliente em foco.
    const requestedAcct = url.searchParams.get('ad_account');
    if (requestedAcct) {
      adAccount = requestedAcct;
    } else {
      const tenantId = url.searchParams.get('tenant_id') || getActiveTenantId(ctx);
      if (!tenantId) {
        throw new AppError('Nenhum cliente selecionado. Entre no painel de um cliente em /admin → cliente.', { status: 400 });
      }
      const t = await getTenantById(tenantId);
      adAccount = (t as any).meta_ad_account_id || undefined;
      if (!adAccount) {
        throw new AppError('Esse cliente ainda não tem Meta Ads vinculado. Vincule em /admin → cliente → Integração Meta Ads.', { status: 404 });
      }
    }
  } else {
    // Cliente: SEMPRE usa a conta vinculada ao próprio tenant (ignora query)
    if (!ctx.profile.tenant_id) {
      throw new AppError('Sem tenant.', { status: 403 });
    }
    const t = await getTenantById(ctx.profile.tenant_id);
    adAccount = (t as any).meta_ad_account_id || undefined;
    if (!adAccount) {
      throw new AppError('Sua conta ainda não tem Meta Ads vinculado. Peça pro admin configurar.', { status: 404 });
    }
  }

  const data = await getDashboardData({ adAccountId: adAccount, start, end });
  return Response.json({ success: true, data });
});
