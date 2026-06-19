import { cookies } from 'next/headers';
import { withErrorHandler, AppError, ValidationError } from '@/lib/server/errors';
import { requireAdmin } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { VIEWING_TENANT_COOKIE } from '@/lib/server/active-tenant';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/view-as { tenant_id: string }
 * Seta cookie de "view-as" pro admin entrar no painel daquele cliente.
 */
export const POST = withErrorHandler(async (req: Request) => {
  await requireAdmin();
  const body = await req.json().catch(() => ({}));
  const tenantId = String(body?.tenant_id || '').trim();
  if (!tenantId) throw new ValidationError('tenant_id é obrigatório.');

  // Valida que o tenant existe
  const { data: tenant, error } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) throw new AppError(error.message, { status: 500 });
  if (!tenant) throw new AppError('Tenant não encontrado.', { status: 404 });

  cookies().set(VIEWING_TENANT_COOKIE, tenantId, {
    httpOnly: false, // pode ser lido client-side pra exibir banner
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 dias
  });

  return Response.json({ success: true, data: { tenant } });
});

/** DELETE — limpa o cookie (admin "sai" do painel do cliente). */
export const DELETE = withErrorHandler(async () => {
  await requireAdmin();
  cookies().delete(VIEWING_TENANT_COOKIE);
  return Response.json({ success: true });
});
