import { handleIntegration, preflight } from '@/lib/server/integration-auth';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { AppError, ValidationError } from '@/lib/server/errors';
import { META_ADS_TOOLS, executeMetaTool } from '@/lib/server/meta-ads-tools';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const OPTIONS = (req: Request) => preflight(req);

/**
 * GET /api/integrations/meta-ads/tool — lista as 55 tools disponíveis com schemas.
 */
export const GET = handleIntegration(async () => {
  return Response.json({
    success: true,
    data: {
      tools: META_ADS_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      })),
      count: META_ADS_TOOLS.length,
    },
  });
});

/**
 * POST /api/integrations/meta-ads/tool
 * Body: { name: "get_campaign_insights", input: { campaign_id: "...", days: 30 } }
 * Roda QUALQUER uma das 55 tools do módulo Meta Ads contra a conta vinculada ao tenant.
 */
export const POST = handleIntegration(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name || '').trim();
  const input = body?.input && typeof body.input === 'object' ? body.input : {};
  if (!name) throw new ValidationError('Campo `name` obrigatório (nome da tool).');

  const exists = META_ADS_TOOLS.some((t) => t.name === name);
  if (!exists) throw new ValidationError(`Tool desconhecida: ${name}. Use GET pra ver a lista.`);

  const { data: tenant, error } = await supabaseAdmin
    .from('tenants')
    .select('meta_ad_account_id')
    .eq('id', ctx.tenantId)
    .single();
  if (error) throw new AppError(error.message, { status: 500 });
  const adAccountId = (tenant as any)?.meta_ad_account_id;
  if (!adAccountId) throw new AppError('Tenant não tem meta_ad_account_id vinculado.', { status: 400 });

  let result: any;
  try {
    result = await executeMetaTool(name, input, { adAccountId });
  } catch (err: any) {
    return Response.json(
      { success: false, error: { code: 'meta_tool_error', message: err?.message || String(err), tool: name } },
      { status: 502 },
    );
  }

  return Response.json({ success: true, data: { tool: name, result } });
});
