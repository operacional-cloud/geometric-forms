import Link from 'next/link';
import { Logo } from './Logo';

export function Header({
  variant = 'public',
  rightSlot,
}: {
  variant?: 'public' | 'admin' | 'dashboard';
  rightSlot?: React.ReactNode;
}) {
  const tag = variant === 'admin' ? 'admin' : variant === 'dashboard' ? 'painel' : null;
  return (
    <header className="site-header">
      <div className="container-edge flex items-center justify-between py-4">
        <Link href="/" className="flex items-center gap-2.5 group">
          <Logo />
          <span className="font-semibold tracking-tight text-[15px]">Geometric Forms</span>
          {tag && (
            <span className="ml-2 px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider font-mono text-brand border border-brand/40 bg-brand/10">
              {tag}
            </span>
          )}
        </Link>
        <div className="flex items-center gap-3 text-sm text-fg-muted">{rightSlot}</div>
      </div>
    </header>
  );
}
