import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#08080B',
          elevated: '#0F0F14',
          elevated2: '#16161D',
        },
        line: {
          DEFAULT: '#22222C',
          strong: '#2E2E3A',
        },
        fg: {
          DEFAULT: '#F4F4F7',
          muted: '#8B8B98',
          dim: '#5A5A66',
        },
        // Primary brand = emerald (CTAs, focus, primary highlights)
        brand: {
          DEFAULT: '#10F2A0',
          soft: '#34D399',
          dark: '#0BD592',
          glow: '#10F2A0',
        },
        // Métricas/sucesso continuam emerald (mesma cor)
        emerald: {
          DEFAULT: '#10F2A0',
          soft: '#34D399',
        },
        cyan:    '#5EE2FF',
        violet:  '#9E7DFF',
        warn:    '#FFC857',
        danger:  '#FF6363',
        gold:    '#FBBF24',
        meta:    '#3B82F6',
        google:  '#EF4444',
      },
      fontFamily: {
        sans:    ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.045em',
      },
      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(16, 242, 160, 0.4)' },
          '50%':      { boxShadow: '0 0 30px 4px rgba(16, 242, 160, 0.25)' },
        },
        'grid-pan': {
          '0%':   { transform: 'translate(0, 0)' },
          '100%': { transform: 'translate(48px, 48px)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-up':    'fade-up 0.5s cubic-bezier(.22,.61,.36,1) both',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        'grid-pan':   'grid-pan 12s linear infinite',
        shimmer:      'shimmer 3s linear infinite',
      },
    },
  },
  plugins: [],
};
export default config;
