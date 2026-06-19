/**
 * Gate de acesso ao módulo "IA de Atendimento" no painel do cliente.
 *
 * Ideia: o cliente vê o menu no sidebar, mas pra entrar precisa de credenciais de ADMIN
 * do sistema (não as do próprio cliente). Quando o admin digita email/senha válidos com
 * role=admin, o servidor assina um token HMAC e grava em cookie httpOnly por 4h.
 * Páginas/APIs do módulo checam o cookie via verifyAiUnlock.
 */

import crypto from 'crypto';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'ai_unlock';
const TTL_MS = 4 * 60 * 60 * 1000; // 4h

function secret(): string {
  // Reusa uma env já existente como chave HMAC (não expõe nada novo).
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXTAUTH_SECRET || 'fallback-dev-secret';
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('hex').slice(0, 32);
}

export function signAiUnlock(adminUserId: string): string {
  const expiresAt = Date.now() + TTL_MS;
  const payload = `${adminUserId}.${expiresAt}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifyAiUnlock(token: string | undefined | null): { adminUserId: string } | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [adminUserId, expiresAtStr, sig] = parts;
  const payload = `${adminUserId}.${expiresAtStr}`;
  const expectSig = sign(payload);
  if (sig !== expectSig) return null;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  return { adminUserId };
}

/** Lê o cookie do request atual e retorna se está destravado. Server-side only. */
export async function isAiUnlocked(): Promise<{ adminUserId: string } | null> {
  const c = await cookies();
  const tk = c.get(COOKIE_NAME)?.value;
  return verifyAiUnlock(tk);
}

export const AI_UNLOCK_COOKIE = COOKIE_NAME;
export const AI_UNLOCK_TTL_MS = TTL_MS;
