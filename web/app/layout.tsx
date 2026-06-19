import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Instrument_Serif } from 'next/font/google';
import './globals.css';
import { DialogProvider } from '@/components/Dialog';

const display = Instrument_Serif({
  subsets: ['latin'],
  variable: '--font-display',
  weight: '400',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Geometric Forms',
    template: '%s · Geometric Forms',
  },
  description:
    'SaaS multi-tenant que substitui o Lead Ads do Meta por formulários que qualificam leads e devolvem só os bons via Conversions API.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`dark ${GeistSans.variable} ${GeistMono.variable} ${display.variable}`}
      style={{
        ['--font-sans' as any]: GeistSans.style.fontFamily,
        ['--font-mono' as any]: GeistMono.style.fontFamily,
      }}
    >
      <body>
        <DialogProvider>{children}</DialogProvider>
      </body>
    </html>
  );
}
