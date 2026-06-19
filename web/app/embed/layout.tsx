import type { ReactNode } from 'react';

/**
 * Layout enxuto pra páginas embedáveis em iframe — sem sidebar/topbar.
 * Reutiliza fonte/dark mode do root layout.
 */
export default function EmbedLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
