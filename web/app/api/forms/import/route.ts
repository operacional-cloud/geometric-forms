import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { importForm } from '@/lib/server/forms';

export const dynamic = 'force-dynamic';

/**
 * POST /api/forms/import
 * Body: template JSON exportado de outro formulário/cliente.
 * Cria um novo formulário no cliente em foco (admin: cookie viewing_tenant_id).
 */
export const POST = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const body = await req.json();
  const data = await importForm(ctx, body);
  return Response.json({ success: true, data }, { status: 201 });
});
