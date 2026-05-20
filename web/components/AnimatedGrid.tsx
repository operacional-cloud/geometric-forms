'use client';

import { motion } from 'framer-motion';

// Grid de fundo + orbe gradiente pulsante. Pura SVG/CSS.
export function AnimatedGrid() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="grid-bg" />
      <motion.div
        className="absolute -top-32 left-1/2 -translate-x-1/2 h-[520px] w-[520px] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, rgba(16,242,160,0.16), rgba(16,242,160,0.0))',
        }}
        animate={{ opacity: [0.25, 0.45, 0.25], scale: [1, 1.06, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-40 right-0 h-[420px] w-[420px] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, rgba(94,226,255,0.12), rgba(94,226,255,0.0))',
        }}
        animate={{ opacity: [0.2, 0.35, 0.2], scale: [1, 1.08, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
      />
    </div>
  );
}
