import { requireTenantMember, type AuthContext } from './auth';
import { isAiUnlocked } from './ai-gate';
import { AppError } from './errors';

/**
 * Gate combinado: usuário precisa estar logado E ter destravado o módulo
 * com credencial de admin (cookie ai_unlock). Retorna o auth context normal.
 */
export async function requireAiAccess(): Promise<AuthContext> {
  const ctx = await requireTenantMember();
  const unlock = await isAiUnlocked();
  if (!unlock) {
    throw new AppError('Módulo bloqueado. Destrave com credencial de administrador.', { status: 403 });
  }
  return ctx;
}
