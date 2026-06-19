import { withErrorHandler, AppError } from '@/lib/server/errors';
import { requireAiAccess } from '@/lib/server/ai-attendance';
import { supabaseAdmin } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';

/**
 * Endpoint mantido por compatibilidade com a UI antiga.
 * Agora o módulo usa Gemini Flash com a key global da agência (GEMINI_API_KEY),
 * então o cliente não precisa configurar nada — sempre retorna has_key=true.
 */
export const GET = withErrorHandler(async () => {
  const ctx = await requireAiAccess();
  if (!ctx.profile.tenant_id) throw new AppError('Sem tenant.', { status: 403 });
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('meta_ad_account_id')
    .eq('id', ctx.profile.tenant_id)
    .single();
  return Response.json({
    success: true,
    data: {
      has_key: true,
      has_meta_account: !!(data as any)?.meta_ad_account_id,
    },
  });
});
