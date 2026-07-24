import { requireTenantMember } from '@/lib/server/auth';
import { FollowupClient } from './followup-client';

export const dynamic = 'force-dynamic';

export default async function FollowupPage() {
  await requireTenantMember();
  return <FollowupClient />;
}
