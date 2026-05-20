'use client';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

export function LogoutButton() {
  const router = useRouter();
  async function onClick() {
    await getSupabaseBrowser().auth.signOut();
    router.push('/');
    router.refresh();
  }
  return (
    <button onClick={onClick} className="link text-xs">
      sair
    </button>
  );
}
