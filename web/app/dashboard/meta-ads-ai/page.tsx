import { requireTenantMember } from '@/lib/server/auth';
import { isAiUnlocked } from '@/lib/server/ai-gate';
import { UnlockGate } from '../ai-attendance/unlock-gate';
import { MetaAdsAiClient } from './meta-ads-ai-client';

export const dynamic = 'force-dynamic';

export default async function MetaAdsAiPage() {
  await requireTenantMember();
  const unlocked = await isAiUnlocked();
  if (!unlocked) return <UnlockGate />;
  return <MetaAdsAiClient />;
}
