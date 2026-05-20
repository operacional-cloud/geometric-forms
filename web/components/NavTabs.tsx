'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavTabs({ items }: { items: Array<{ href: string; label: string }> }) {
  const pathname = usePathname();
  return (
    <nav className="border-b border-line">
      <div className="container-edge flex gap-1 py-2">
        {items.map((it) => {
          const active = pathname === it.href || (it.href !== '/' && pathname.startsWith(it.href));
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`relative px-3 py-2 text-sm rounded-md transition-colors ${
                active ? 'text-fg' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {it.label}
              {active && (
                <span className="absolute -bottom-[9px] left-2 right-2 h-0.5 bg-gradient-to-r from-brand/40 via-brand to-brand/40 rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
