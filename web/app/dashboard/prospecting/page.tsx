import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

// Prospecção é exclusiva do admin agora. Cliente que tentar acessar via URL é
// redirecionado pro dashboard; admin é redirecionado pro novo path em /admin.
export default async function ProspectingPage() {
  const ctx = await requireAuth();
  if (ctx.profile.role === 'admin') redirect('/admin/prospecting');
  redirect('/dashboard');
}
