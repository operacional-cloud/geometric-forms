// Componentes base reutilizáveis — dark tech.
'use client';

import Link from 'next/link';
import { motion, type MotionProps } from 'framer-motion';

export function Kicker({ children }: { children: React.ReactNode }) {
  return <div className="kicker">{children}</div>;
}

export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'active' ? 'badge badge-success badge-dot'
    : status === 'trial' ? 'badge badge-warn badge-dot'
    : status === 'inactive' ? 'badge badge-danger badge-dot'
    : 'badge badge-dot';
  return <span className={cls}>{status}</span>;
}

export function GradientButton({
  href, children, onClick, type = 'button', disabled, className = '',
}: {
  href?: string;
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
}) {
  const cls = `btn btn-primary ${className}`;
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

export function GhostButton({
  href, children, onClick, type = 'button', className = '',
}: {
  href?: string;
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const cls = `btn btn-ghost ${className}`;
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return (
    <button type={type} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

export function ArrowRight({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 7h10M12 7L7.5 2.5M12 7l-4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Sparkline({ points }: { points: number[] }) {
  if (!points.length) return null;
  const w = 80, h = 24;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const step = w / Math.max(points.length - 1, 1);
  const path = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2={w} y2="0">
          <stop stopColor="#10F2A0" />
          <stop offset="1" stopColor="#5EE2FF" />
        </linearGradient>
      </defs>
      <path d={path} stroke="url(#spark)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Stat({
  label, value, sub, accent = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="glass-static p-6 relative overflow-hidden">
      <div className="kicker mb-3">{label}</div>
      <div className={`text-4xl font-semibold tracking-tightest tabular ${accent ? 'text-brand-gradient' : 'stat-number'}`}>
        {value}
      </div>
      {sub && <div className="mt-2 text-xs text-fg-muted">{sub}</div>}
    </div>
  );
}

export function FadeIn({
  children, delay = 0, className,
}: MotionProps & { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 0.61, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Empty({
  message, cta,
}: { message: string; cta?: { href: string; label: string } }) {
  return (
    <div className="glass-static px-8 py-16 text-center">
      <div className="mx-auto mb-6 h-12 w-12 rounded-2xl border border-line bg-bg-elevated flex items-center justify-center">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4" width="18" height="16" rx="2" stroke="#5A5A66" strokeWidth="1.5" />
          <path d="M7 9h10M7 13h6" stroke="#5A5A66" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-fg-muted">{message}</p>
      {cta && (
        <div className="mt-6 inline-flex">
          <GradientButton href={cta.href}>{cta.label}<ArrowRight /></GradientButton>
        </div>
      )}
    </div>
  );
}

export function PageHeader({
  kicker, title, subtitle, action,
}: {
  kicker?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6 pb-8 mb-10 border-b border-line">
      <div>
        {kicker && <Kicker>{kicker}</Kicker>}
        <h1 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tightest">{title}</h1>
        {subtitle && <p className="mt-2 text-fg-muted max-w-2xl">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}
