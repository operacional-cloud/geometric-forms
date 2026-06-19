import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { listNiches, listStatesBR } from '@/lib/server/prospecting';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async () => {
  await requireTenantMember();
  return Response.json({
    success: true,
    data: {
      niches: listNiches(),
      states: listStatesBR(),
    },
  });
});
