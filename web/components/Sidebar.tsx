'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from './Logo';

export type SidebarIconKey =
  | 'overview' | 'forms' | 'leads' | 'kanban' | 'metrics'
  | 'clients' | 'prospecting' | 'whatsapp' | 'ai' | 'ads_ai' | 'integrations' | 'home';

export type SidebarItem = {
  href: string;
  label: string;
  iconKey?: SidebarIconKey;
  badge?: string;
  /** Mostra ícone de cadeado ao lado do label (UX hint; o gate real é server-side) */
  locked?: boolean;
};

export type SidebarProps = {
  variant: 'dashboard' | 'admin';
  items: SidebarItem[];
  userLabel?: string | null;
  bottomSlot?: React.ReactNode;
};

const ICONS: Record<string, React.ReactNode> = {
  overview: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  forms: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  leads: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 20c0-3.6 2.5-6 5.5-6s5.5 2.4 5.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="17" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M15 20c0-2.5 1.5-4.5 4-4.5s2.5 1.5 2.5 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  kanban: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="5" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="10" y="4" width="5" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="17" y="4" width="4" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  metrics: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 20V6M3 20h18M7 20v-6M11 20v-9M15 20v-4M19 20V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  clients: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  prospecting: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M21 21l-4.5-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  whatsapp: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M21 12a9 9 0 11-3.6-7.2L21 3l-1.8 3.6A9 9 0 0121 12z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8.5 9.5c.5 3 3 5.5 6 6 .8.1 1.3-.4 1.4-1l.1-.6c.1-.5-.2-1-.7-1.2l-1.1-.4c-.4-.1-.8 0-1 .3l-.4.4c-1.2-.5-2.1-1.4-2.6-2.6l.4-.4c.3-.3.4-.6.3-1l-.4-1.1c-.2-.5-.7-.8-1.2-.7l-.6.1c-.6.1-1.1.6-1 1.4z" fill="currentColor" />
    </svg>
  ),
  ai: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="6" width="16" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="9" cy="12" r="1.2" fill="currentColor" />
      <circle cx="15" cy="12" r="1.2" fill="currentColor" />
      <path d="M12 6V3M9 18l-1 2M15 18l1 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  ads_ai: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 20V6M3 20h18M7 20v-6M11 20v-9M15 20v-4M19 20V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="19" cy="6" r="2.5" fill="currentColor" />
    </svg>
  ),
  integrations: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8 3v3M16 3v3M8 21v-3M16 21v-3M3 8h3M3 16h3M21 8h-3M21 16h-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="6" y="6" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  home: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 11l9-8 9 8M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

function NavLink({
  item, active, collapsed, onNavigate,
}: { item: SidebarItem; active: boolean; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
        active
          ? 'bg-brand/15 text-fg shadow-[inset_0_0_0_1px_rgba(16,242,160,0.25)]'
          : 'text-fg-muted hover:text-fg hover:bg-white/[0.05]'
      }`}
    >
      <span className={`shrink-0 ${active ? 'text-brand' : 'text-fg-muted group-hover:text-fg'}`}>
        {item.iconKey ? ICONS[item.iconKey] : null}
      </span>
      <span className={`flex-1 truncate ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
      {item.locked && (
        <span
          className={`shrink-0 ${collapsed ? 'lg:hidden' : ''}`}
          title="Acesso restrito"
          aria-label="Bloqueado"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </span>
      )}
      {item.badge && (
        <span
          className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-widest leading-none ${collapsed ? 'lg:hidden' : ''}`}
          style={{
            background: 'linear-gradient(180deg, #18ffae 0%, #0bd592 100%)',
            color: '#08080B',
            fontWeight: 700,
            boxShadow: '0 0 0 1px rgba(16, 242, 160, 0.45)',
          }}
        >
          {item.badge}
        </span>
      )}
      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-brand" />}
    </Link>
  );
}

export function Sidebar({ variant, items, userLabel, bottomSlot }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const tag = variant === 'admin' ? 'admin' : 'painel';

  // Fecha mobile menu quando muda de rota
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Trava scroll do body quando drawer aberto
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [mobileOpen]);

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href + '/')) || pathname === href;

  return (
    <>
      {/* Topbar mobile (até md) */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between gap-3 px-4 h-14 border-b border-line bg-bg/85 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
          className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-white/[0.06] text-fg-muted hover:text-fg"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <Link href="/" className="flex items-center gap-2">
          <Logo size={22} />
          <span className="font-semibold text-[14px] tracking-tight">Geometric</span>
          <span className="ml-1 px-1.5 py-0.5 rounded-md text-[9px] uppercase tracking-wider font-mono text-brand border border-brand/40 bg-brand/10">
            {tag}
          </span>
        </Link>
        <div className="w-9" /> {/* spacer pra centralizar logo */}
      </header>

      {/* Backdrop mobile */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          aria-hidden
        />
      )}

      {/* Sidebar — desktop fixa, mobile drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-[#0B0B0F] border-r border-line transition-transform duration-300 ease-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0`}
      >
        <div className="flex items-center justify-between px-5 h-16 border-b border-line">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="font-semibold tracking-tight text-[15px]">Geometric</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-md text-[9px] uppercase tracking-wider font-mono text-brand border border-brand/40 bg-brand/10">
              {tag}
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
            className="lg:hidden h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-white/[0.06] text-fg-muted hover:text-fg"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {items.map((it) => (
            <NavLink
              key={it.href}
              item={it}
              active={isActive(it.href)}
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
            />
          ))}
        </nav>

        <div className="border-t border-line px-4 py-3 space-y-2">
          {userLabel && (
            <div className="text-[11px] font-mono text-fg-dim truncate" title={userLabel}>
              {userLabel}
            </div>
          )}
          {bottomSlot}
        </div>
      </aside>
    </>
  );
}

/** Wrapper pra usar dentro de layouts: empurra conteúdo pra direita da sidebar em desktop. */
export function SidebarShell({ children }: { children: React.ReactNode }) {
  return <div className="lg:pl-64 min-h-screen">{children}</div>;
}
