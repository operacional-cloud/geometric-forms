import { supabaseAdmin, getSupabaseForUser } from './supabaseClient.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';

/**
 * Middleware: exige JWT válido. Anexa req.user, req.profile e req.supabase
 * (cliente Supabase autenticado com o JWT do usuário, respeitando RLS).
 */
export async function requireAuth(req, _res, next) {
  try {
    const authHeader = req.header('authorization') || req.header('Authorization');
    if (!authHeader?.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedError('Token Bearer ausente');
    }
    const jwt = authHeader.slice(7).trim();
    if (!jwt) throw new UnauthorizedError('Token vazio');

    const { data, error } = await supabaseAdmin.auth.getUser(jwt);
    if (error || !data?.user) {
      throw new UnauthorizedError('Token inválido ou expirado');
    }

    // Buscar profile (via admin pra não ficar refém do RLS aqui)
    const { data: profile, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();
    if (pErr) throw new UnauthorizedError('Falha ao carregar profile');
    if (!profile) throw new UnauthorizedError('Profile não encontrado para o usuário');

    req.user = data.user;
    req.profile = profile;
    req.supabase = getSupabaseForUser(jwt);
    next();
  } catch (err) {
    next(err);
  }
}

/** Middleware: exige role='admin'. Use depois de requireAuth. */
export function requireAdmin(req, _res, next) {
  if (req.profile?.role !== 'admin') {
    return next(new ForbiddenError('Apenas administradores'));
  }
  next();
}

/**
 * Middleware: exige client ou admin do tenant. Use depois de requireAuth.
 * Admin sempre passa. Client/viewer só passa se tem tenant_id definido.
 */
export function requireTenantMember(req, _res, next) {
  const role = req.profile?.role;
  if (role === 'admin') return next();
  if ((role === 'client' || role === 'viewer') && req.profile?.tenant_id) return next();
  return next(new ForbiddenError('Usuário sem vínculo com tenant'));
}
