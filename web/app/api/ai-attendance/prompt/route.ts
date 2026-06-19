import { withErrorHandler } from '@/lib/server/errors';
import { requireAiAccess } from '@/lib/server/ai-attendance';
import { getWhatsAppPrompt, saveWhatsAppPrompt } from '@/lib/server/whatsapp';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async () => {
  const ctx = await requireAiAccess();
  const prompt = await getWhatsAppPrompt(ctx, { tenant_id: ctx.profile.tenant_id });
  return Response.json({ success: true, data: { prompt } });
});

export const PUT = withErrorHandler(async (req) => {
  const ctx = await requireAiAccess();
  const body = await req.json();
  const prompt = await saveWhatsAppPrompt(ctx, body, { tenant_id: ctx.profile.tenant_id });
  return Response.json({ success: true, data: { prompt } });
});
