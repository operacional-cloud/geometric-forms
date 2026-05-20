// Helpers de auth pra Route Handlers e Server Components.
// Lê sessão do cookie via @supabase/ssr e devolve user + profile + supabase
// client escopado ao user (RLS aplica naturalmente).

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from './supabase-admin';
import { ForbiddenError, UnauthorizedError } from './errors';

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'client' | 'viewer';
  tenant_id: string | null;
};

export type AuthContext = {
  user: { id: string; email?: string };
  profile: Profile;
  supabase: ReturnType<typeof createServerClient>;
};

/** Cria um supabase server client lendo cookies via next/headers. */
function makeServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }); } catch {}
        },
      },
    },
  );
}

/** Pega user + profile pelo cookie. Retorna null se não autenticado. */
export async function getAuthOrNull(): Promise<AuthContext | null> {
  const supabase = makeServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) return null;
  return { user: { id: user.id, email: user.email ?? undefined }, profile, supabase };
}

/** Pega user + profile pelo cookie. Lança UnauthorizedError se não autenticado. */
export async function requireAuth(): Promise<AuthContext> {
  const supabase = makeServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new UnauthorizedError('Token Bearer ausente ou inválido');

  // Busca profile via admin pra não depender do RLS (que pode esconder o próprio profile)
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) throw new UnauthorizedError('Profile não encontrado');

  return { user: { id: user.id, email: user.email ?? undefined }, profile, supabase };
}

/** Exige role=admin. Retorna o context auth. */
export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (ctx.profile.role !== 'admin') throw new ForbiddenError('Apenas administradores');
  return ctx;
}

/** Exige role=admin OU client/viewer com tenant_id. */
export async function requireTenantMember(): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (ctx.profile.role === 'admin') return ctx;
  if ((ctx.profile.role === 'client' || ctx.profile.role === 'viewer') && ctx.profile.tenant_id) {
    return ctx;
  }
  throw new ForbiddenError('Usuário sem vínculo com tenant');
}
