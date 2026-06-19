'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Item = {
  href: string;
  label: string;
  badge?: string;
};

export function NavTabs({ items }: { items: Item[] }) {
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
              className={`relative px-3 py-2 text-sm rounded-md transition-colors inline-flex items-center gap-2 ${
                active ? 'text-fg' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {it.label}
              {it.badge && (
                <span
                  className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-widest leading-none"
                  style={{
                    background: 'linear-gradient(180deg, #18ffae 0%, #0bd592 100%)',
                    color: '#08080B',
                    fontWeight: 700,
                    boxShadow: '0 0 0 1px rgba(16, 242, 160, 0.45)',
                  }}
                >
                  {it.badge}
                </span>
              )}
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
