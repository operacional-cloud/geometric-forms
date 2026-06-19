/**
 * Auth + CORS para a API pública de integrações (`/api/integrations/*`).
 *
 * Modelo: token global único (env `INTEGRATION_API_TOKEN`).
 * Cliente DEVE mandar em CADA request:
 *   Authorization: Bearer <token>
 *   X-Tenant-Id: <uuid_do_tenant>   (ou slug do tenant)
 *
 * O token NÃO isola por tenant — quem tiver o token pode acessar qualquer
 * cliente passando o id correspondente. Mantemos em env e nunca expomos
 * em log/resposta. Pra rotacionar, troca a env e redeploya.
 */
import { supabaseAdmin } from './supabase-admin';
import { AppError, UnauthorizedError, ForbiddenError, NotFoundError } from './errors';

const ALLOWED_ORIGINS = (
  process.env.INTEGRATION_ALLOWED_ORIGINS ||
  'https://indica.geometricagency.com,http://localhost:3000,http://localhost:3001'
).split(',').map((s) => s.trim()).filter(Boolean);

export type IntegrationContext = {
  tenantId: string;
  tenant: { id: string; name: string; slug: string };
};

function pickAllowedOrigin(req: Request): string | null {
  const origin = req.headers.get('origin') || '';
  if (!origin) return null;
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  // Curinga simples por subdomínio: aceita qualquer .geometricagency.com
  try {
    const url = new URL(origin);
    if (url.hostname.endsWith('.geometricagency.com')) return origin;
  } catch {}
  return null;
}

export function corsHeaders(req: Request): Record<string, string> {
  const allow = pickAllowedOrigin(req);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Tenant-Id',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (allow) headers['Access-Control-Allow-Origin'] = allow;
  return headers;
}

/** Resposta vazia pra preflight OPTIONS. Use em todas as routes. */
export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

/** Embrulha um Response com CORS headers — chame antes de devolver. */
export function withCors(req: Request, res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders(req))) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

/** Valida Bearer token + resolve tenant via header X-Tenant-Id (uuid ou slug). */
export async function requireIntegrationAuth(req: Request): Promise<IntegrationContext> {
  const token = process.env.INTEGRATION_API_TOKEN || '';
  if (!token) throw new AppError('INTEGRATION_API_TOKEN não configurado no servidor.', { status: 500 });

  const authz = req.headers.get('authorization') || '';
  const match = authz.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new UnauthorizedError('Header Authorization Bearer ausente.');
  if (match[1] !== token) throw new UnauthorizedError('Token inválido.');

  const tenantHeader = (req.headers.get('x-tenant-id') || '').trim();
  if (!tenantHeader) throw new ForbiddenError('Header X-Tenant-Id obrigatório.');

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantHeader);
  const { data: tenant, error } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug, status')
    .eq(isUuid ? 'id' : 'slug', tenantHeader)
    .maybeSingle();
  if (error) throw new AppError(error.message, { status: 500 });
  if (!tenant) throw new NotFoundError('Tenant não encontrado.');
  if ((tenant as any).status === 'inactive') throw new ForbiddenError('Tenant inativo.');

  return {
    tenantId: (tenant as any).id,
    tenant: { id: (tenant as any).id, name: (tenant as any).name, slug: (tenant as any).slug },
  };
}

/**
 * Helper de uso típico em route handler. Cuida de OPTIONS, auth, CORS e erro.
 *
 *   export const GET = handleIntegration(async (req, ctx) => {
 *     return Response.json({ ... });
 *   });
 */
export function handleIntegration(
  fn: (req: Request, ctx: IntegrationContext) => Promise<Response>,
) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return preflight(req);
    try {
      const ctx = await requireIntegrationAuth(req);
      const res = await fn(req, ctx);
      return withCors(req, res);
    } catch (err: any) {
      const status = err instanceof AppError ? err.status : 500;
      const code = err instanceof AppError ? err.code : 'internal_error';
      const message = err?.message || 'Erro interno';
      return withCors(req, Response.json(
        { success: false, error: { code, message } },
        { status },
      ));
    }
  };
}
