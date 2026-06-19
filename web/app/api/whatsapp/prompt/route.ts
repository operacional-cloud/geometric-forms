import { withErrorHandler } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { getWhatsAppPrompt, saveWhatsAppPrompt } from '@/lib/server/whatsapp';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const url = new URL(req.url);
  const prompt = await getWhatsAppPrompt(ctx, { tenant_id: url.searchParams.get('tenant_id') });
  return Response.json({ success: true, data: { prompt } });
});

export const PUT = withErrorHandler(async (req) => {
  const ctx = await requireTenantMember();
  const body = await req.json();
  const url = new URL(req.url);
  const prompt = await saveWhatsAppPrompt(ctx, {
    system_prompt: body.system_prompt,
    qualification_criteria: body.qualification_criteria,
    initial_message: body.initial_message,
    transfer_message: body.transfer_message,
    ai_enabled: body.ai_enabled,
  }, { tenant_id: url.searchParams.get('tenant_id') });
  return Response.json({ success: true, data: { prompt } });
});
