import Link from 'next/link';
import { Header } from '@/components/Header';
import { AnimatedGrid } from '@/components/AnimatedGrid';
import { GradientButton, GhostButton, ArrowRight, Sparkline, FadeIn, Kicker } from '@/components/ui';

export default function Landing() {
  const sparkA = [4, 6, 5, 9, 11, 14, 17, 21, 19, 26];
  const sparkB = [10, 12, 9, 14, 13, 18, 17, 22, 24, 28];
  const sparkC = [2, 3, 5, 8, 13, 21, 34, 55, 89, 144];
  const sparkD = [22, 26, 25, 27, 26, 28, 30, 33, 35, 38];

  return (
    <main className="relative">
      <Header
        rightSlot={
          <>
            <Link href="#how" className="link hidden sm:inline">como funciona</Link>
            <Link href="/login" className="btn btn-ghost !py-1.5 !px-3 text-xs">login →</Link>
          </>
        }
      />

      {/* HERO */}
      <section className="relative">
        <AnimatedGrid />
        <div className="container-edge relative pt-24 pb-32 lg:pt-32 lg:pb-40">
          <FadeIn>
            <Kicker>EST. 2026 · MULTI-TENANT SAAS · SP-BR</Kicker>
          </FadeIn>

          <FadeIn delay={0.05}>
            <h1 className="mt-8 text-5xl sm:text-7xl lg:text-[112px] font-semibold leading-[0.95] tracking-tightest">
              Qualificação de leads,<br />
              <span className="text-brand-gradient italic font-display font-normal">repensada.</span>
            </h1>
          </FadeIn>

          <FadeIn delay={0.15}>
            <p className="mt-10 text-lg lg:text-xl text-fg-muted max-w-2xl leading-relaxed">
              Substituímos o Lead Ads do Meta por formulários que <span className="text-fg">pontuam cada resposta</span>{' '}
              e devolvem só os bons leads via Conversions API. O algoritmo para de buscar quantidade.
              Começa a buscar gente parecida com quem você fecha.
            </p>
          </FadeIn>

          <FadeIn delay={0.25}>
            <div className="mt-12 flex flex-wrap gap-3">
              <GradientButton href="/login">
                Acessar painel <ArrowRight />
              </GradientButton>
              <GhostButton href="#how">Como funciona</GhostButton>
            </div>
          </FadeIn>

          {/* Floating preview card */}
          <FadeIn delay={0.4}>
            <div className="mt-24 lg:mt-32 relative max-w-4xl mx-auto">
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-brand/40 via-brand-cyan/30 to-brand-violet/40 blur-2xl opacity-50" />
              <div className="glass-static relative p-2">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-line text-xs text-fg-muted">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FF6363]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FFC857]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#10F2A0]" />
                  <span className="ml-3 font-mono">geometric.forms / dashboard</span>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 p-3">
                  {[
                    { k: 'leads', v: '47', s: sparkA },
                    { k: 'qualificados', v: '23', s: sparkB },
                    { k: 'taxa qual.', v: '49%', s: sparkC },
                    { k: 'CAPI enviados', v: '23', s: sparkD },
                  ].map((c) => (
                    <div key={c.k} className="glass-inner p-4 flex flex-col gap-3">
                      <div className="kicker">{c.k}</div>
                      <div className="text-3xl font-semibold tracking-tightest tabular stat-number">
                        {c.v}
                      </div>
                      <Sparkline points={c.s} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="relative border-t border-line py-32">
        <div className="container-edge">
          <Kicker>COMO FUNCIONA · 002</Kicker>
          <h2 className="mt-6 text-4xl lg:text-6xl font-semibold tracking-tightest max-w-3xl">
            Quatro etapas.{' '}
            <span className="text-fg-muted italic font-display font-normal">Zero atrito.</span>
          </h2>

          <div className="mt-16 grid md:grid-cols-2 gap-4">
            {[
              {
                n: '01',
                t: 'Anúncio aponta pro form',
                b: 'A campanha do Meta envia tráfego pra URL pública do seu formulário, não pra um Lead Ad nativo.',
              },
              {
                n: '02',
                t: 'Lead preenche e pontua',
                b: 'Cada resposta soma pontos. Renda, intenção, prazo, qualquer coisa. Score em tempo real, threshold por form.',
              },
              {
                n: '03',
                t: 'Qualificados via CAPI',
                b: 'Só leads acima do threshold viram evento `QualifiedLead` na Conversions API. Pixel + CAPI deduplicados.',
              },
              {
                n: '04',
                t: 'Você atende os melhores',
                b: 'O painel mostra quem entrou, score, UTMs e status (novo → IA → reunião → ganho/perdido).',
              },
            ].map((step, i) => (
              <FadeIn key={step.n} delay={i * 0.06}>
                <div className="glass lift p-7 h-full">
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-xs text-fg-dim">/{step.n}</span>
                    <ArrowRight />
                  </div>
                  <h3 className="mt-6 text-xl font-semibold tracking-tightest">{step.t}</h3>
                  <p className="mt-3 text-fg-muted text-[15px] leading-relaxed">{step.b}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* STACK */}
      <section className="border-t border-line py-24">
        <div className="container-edge">
          <Kicker>TECNOLOGIA · 003</Kicker>
          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { k: 'Servidor', v: 'Node + Express' },
              { k: 'Banco', v: 'Supabase (Postgres + RLS)' },
              { k: 'Interface', v: 'Next.js 14' },
              { k: 'Rastreio', v: 'Meta CAPI + Pixel' },
            ].map((s) => (
              <div key={s.k} className="glass-static p-5">
                <div className="kicker">{s.k}</div>
                <div className="mt-2 font-medium">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-line py-10">
        <div className="container-edge flex flex-wrap items-center justify-between gap-4 text-xs text-fg-dim font-mono">
          <span>© 2026 — GEOMETRIC AGENCY</span>
          <span>EST. SÃO PAULO, BRASIL</span>
        </div>
      </footer>
    </main>
  );
}
