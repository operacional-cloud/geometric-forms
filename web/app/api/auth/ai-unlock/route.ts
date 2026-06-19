import { withErrorHandler, AppError } from '@/lib/server/errors';
import { requireTenantMember } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { signAiUnlock, verifyAiUnlock, AI_UNLOCK_COOKIE, AI_UNLOCK_TTL_MS } from '@/lib/server/ai-gate';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/** POST { email, password } — valida credenciais de admin e seta cookie de destrava. */
export const POST = withErrorHandler(async (req) => {
  // Exige que o usuário atual esteja autenticado (qualquer tenant); o gate é em CIMA disso.
  await requireTenantMember();

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  if (!email || !password) {
    throw new AppError('Email e senha obrigatórios.', { status: 400 });
  }

  // Cria um client anônimo (não compartilha sessão com o cookie atual) só pra validar credenciais.
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const tempClient = createClient(supaUrl, anonKey, { auth: { persistSession: false } });
  const { data, error } = await tempClient.auth.signInWithPassword({ email, password });
  if (error || !data?.user) {
    throw new AppError('Email ou senha inválidos.', { status: 401 });
  }
  const adminId = data.user.id;
  // Logout local da sessão temporária (não afeta o cookie do cliente)
  await tempClient.auth.signOut().catch(() => {});

  // Checa role=admin via service role (não depende de RLS)
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', adminId)
    .maybeSingle();
  if (!profile || (profile as any).role !== 'admin') {
    throw new AppError('Credenciais válidas mas o usuário não é admin.', { status: 403 });
  }

  const token = signAiUnlock(adminId);
  const c = await cookies();
  c.set(AI_UNLOCK_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(AI_UNLOCK_TTL_MS / 1000),
  });
  return Response.json({ success: true });
});

/** DELETE — limpa o cookie (logout do módulo). */
export const DELETE = withErrorHandler(async () => {
  await requireTenantMember();
  const c = await cookies();
  c.delete(AI_UNLOCK_COOKIE);
  return Response.json({ success: true });
});

/** GET — checa se o cookie atual é válido (usado pelo front pra revalidar). */
export const GET = withErrorHandler(async () => {
  await requireTenantMember();
  const c = await cookies();
  const tk = c.get(AI_UNLOCK_COOKIE)?.value;
  const v = verifyAiUnlock(tk);
  return Response.json({ success: true, data: { unlocked: !!v } });
});
