'use client';

import { useEffect, useState } from 'react';
import { animate } from 'framer-motion';

export function AnimatedCounter({
  value, duration = 0.9, decimals = 0, suffix,
}: {
  value: number;
  duration?: number;
  decimals?: number;
  suffix?: string;
}) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(0, value, {
      duration,
      ease: [0.22, 0.61, 0.36, 1],
      onUpdate(v) {
        setDisplay(v);
      },
    });
    return () => controls.stop();
  }, [value, duration]);
  return (
    <span className="tabular">
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
