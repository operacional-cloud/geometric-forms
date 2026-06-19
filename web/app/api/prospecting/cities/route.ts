import { withErrorHandler, AppError } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { listCitiesByState } from '@/lib/server/prospecting';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req) => {
  await requireTenantMember();
  const { searchParams } = new URL(req.url);
  const uf = (searchParams.get('uf') || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf)) {
    throw new AppError('Parâmetro "uf" obrigatório (ex: SP, RJ).', { status: 400 });
  }
  const cities = await listCitiesByState(uf);
  return Response.json({ success: true, data: { uf, cities } });
});
