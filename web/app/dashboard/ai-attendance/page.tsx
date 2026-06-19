import { requireTenantMember } from '@/lib/server/auth';
import { isAiUnlocked } from '@/lib/server/ai-gate';
import { AiAttendanceClient } from './ai-attendance-client';
import { UnlockGate } from './unlock-gate';

export const dynamic = 'force-dynamic';

export default async function AiAttendancePage() {
  await requireTenantMember();
  const unlocked = await isAiUnlocked();
  if (!unlocked) return <UnlockGate />;
  return <AiAttendanceClient />;
}
