'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/lib/api';
import { Kicker, ArrowRight } from '@/components/ui';
import { AnimatedCounter } from '@/components/AnimatedCounter';
import { useDialog } from '@/components/Dialog';

type BRState = { uf: string; name: string };

type Lead = {
  id: string;
  name: string | null;
  whatsapp_number: string;
  keyword_used: string | null;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  source_url: string | null;
  metadata?: { source?: 'wa_link' | 'phone_pattern' } | null;
  created_at: string;
  last_error: string | null;
};

type Stats = {
  total: number; pending: number; sending: number; sent: number; failed: number;
};

const TABS = [
  { id: 'capture',  label: '1. Capturar Leads', icon: <CaptureIcon /> },
  { id: 'queue',    label: '2. Painel da Fila', icon: <QueueIcon /> },
] as const;

export function ProspectingClient({
  initialLeads, initialStats, niches, states, disabled = false, targetTenantId,
}: {
  initialLeads: Lead[];
  initialStats: Stats;
  niches: string[];
  states: BRState[];
  disabled?: boolean;
  // Quando admin opera em nome de um cliente, este id é passado em todas as chamadas
  targetTenantId?: string;
}) {
  const [tab, setTab] = useState<typeof TABS[number]['id']>('capture');
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [stats, setStats] = useState<Stats>(initialStats);
  const [, startTransition] = useTransition();

  // Quando targetTenantId muda (admin trocou de cliente), reseta UI local e recarrega.
  useEffect(() => {
    if (!targetTenantId) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetTenantId]);

  async function refresh() {
    try {
      const qs = new URLSearchParams({ limit: '100' });
      if (targetTenantId) qs.set('tenant_id', targetTenantId);
      const r = await apiFetch<{ data: { leads: Lead[]; stats: Stats } }>(`/api/prospecting/leads?${qs}`);
      startTransition(() => {
        setLeads(r.data.leads);
        setStats(r.data.stats);
      });
    } catch {}
  }

  return (
    <div className="space-y-6">
      {/* TABS HEADER */}
      <div className="flex items-center gap-1 border-b border-line overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`relative px-4 py-2.5 text-sm font-medium rounded-t-md transition-colors flex items-center gap-2 shrink-0 ${
              tab === t.id ? 'text-fg bg-white/[0.04]' : 'text-fg-muted hover:text-fg'
            }`}
          >
            {t.icon}
            {t.label}
            {tab === t.id && (
              <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-gradient-to-r from-brand/40 via-brand to-brand/40 rounded-full" />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'capture' && (
          <motion.div key="capture" {...fadeIn}>
            <CaptureTab onCaptured={refresh} stats={stats} disabled={disabled} niches={niches} states={states} targetTenantId={targetTenantId} />
          </motion.div>
        )}
        {tab === 'queue' && (
          <motion.div key="queue" {...fadeIn}>
            <QueueTab leads={leads} stats={stats} onRefresh={refresh} targetTenantId={targetTenantId} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============================================================
   TAB 1 — Capturar Leads
   ============================================================ */

type ScrapeResult = {
  inserted: number;
  total_found: number;
  keyword: string;
  niche_matched: string | null;
  city: string | null;
  source: 'overpass' | 'searxng' | 'mixed' | 'none';
  overpass_results: number;
  raw_osm_count: number;
  telelistas_results: number;
};

type ExtractResult = {
  inserted: number;
  total_found: number;
  urls_processed: number;
  urls_failed: number;
  keyword: string | null;
};

function CaptureTab({
  onCaptured, stats, disabled = false, niches, states, targetTenantId,
}: {
  onCaptured: () => void;
  stats: Stats;
  disabled?: boolean;
  niches: string[];
  states: BRState[];
  targetTenantId?: string;
}) {
  const [mode, setMode] = useState<'auto' | 'manual' | 'add'>('auto');
  const [niche, setNiche] = useState(niches[0] || '');
  const [stateUf, setStateUf] = useState<string>(states.find((s) => s.uf === 'SP')?.uf || states[0]?.uf || '');
  const [city, setCity] = useState<string>('');
  const [maxLeads, setMaxLeads] = useState<number>(50);
  const [keyword, setKeyword] = useState('');
  const [urlsText, setUrlsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modo "adicionar manualmente"
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualNiche, setManualNiche] = useState('');
  const [manualCity, setManualCity] = useState('');
  const [manualMsg, setManualMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Cidades do estado selecionado (carregadas on-demand via IBGE).
  const [cities, setCities] = useState<string[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);

  useEffect(() => {
    if (!stateUf) return;
    let cancelled = false;
    setCitiesLoading(true);
    setCities([]);
    apiFetch<{ data: { cities: string[] } }>(`/api/prospecting/cities?uf=${stateUf}`)
      .then((r) => {
        if (cancelled) return;
        setCities(r.data.cities);
        setCity((prev) => (prev && r.data.cities.includes(prev)) ? prev : (r.data.cities[0] || ''));
      })
      .catch(() => {
        if (!cancelled) setCities([]);
      })
      .finally(() => {
        if (!cancelled) setCitiesLoading(false);
      });
    return () => { cancelled = true; };
  }, [stateUf]);

  async function onScrape() {
    if (!niche || !stateUf || !city) {
      setError('Selecione um nicho, estado e cidade.');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    setExtractResult(null);
    try {
      const body: any = { niche, state: stateUf, city, max_leads: maxLeads };
      if (targetTenantId) body.tenant_id = targetTenantId;
      const r = await apiFetch<{ data: ScrapeResult }>(
        '/api/prospecting/scrape',
        { method: 'POST', body },
      );
      setResult(r.data);
      onCaptured();
    } catch (e: any) {
      setError(e.message || 'Falha na captura. Tente outro nicho.');
    } finally {
      setBusy(false);
    }
  }

  async function onAddManual() {
    if (!manualPhone.trim() || !manualNiche.trim()) {
      setManualMsg({ ok: false, text: 'Número e nicho são obrigatórios.' });
      return;
    }
    setBusy(true);
    setManualMsg(null);
    try {
      const body: any = {
        name: manualName.trim() || null,
        phone: manualPhone.trim(),
        niche: manualNiche.trim(),
        city: manualCity.trim() || null,
      };
      if (targetTenantId) body.tenant_id = targetTenantId;
      const r = await apiFetch<{ data: { lead: any; created: boolean } }>(
        '/api/prospecting/leads/manual',
        { method: 'POST', body },
      );
      if (r.data.created) {
        setManualMsg({ ok: true, text: `✓ Lead "${manualName || manualPhone}" adicionado.` });
        setManualName('');
        setManualPhone('');
        // mantém nicho e cidade pra agilizar entrada em lote
      } else {
        setManualMsg({ ok: false, text: `Já existe um lead com esse número.` });
      }
      onCaptured();
    } catch (e: any) {
      setManualMsg({ ok: false, text: e?.message || 'Falha ao adicionar lead.' });
    } finally {
      setBusy(false);
      setTimeout(() => setManualMsg(null), 5000);
    }
  }

  async function onExtract() {
    const urls = urlsText
      .split(/[\n,;\s]+/)
      .map((u) => u.trim())
      .filter((u) => u.startsWith('http'));
    if (urls.length === 0) {
      setError('Cole pelo menos 1 URL começando com http:// ou https://');
      return;
    }
    if (urls.length > 50) {
      setError('Máximo de 50 URLs por execução. Divide em batches.');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    setExtractResult(null);
    try {
      const r = await apiFetch<{ data: ExtractResult }>(
        '/api/prospecting/extract-urls',
        { method: 'POST', body: { urls, keyword: keyword.trim() || undefined } },
      );
      setExtractResult(r.data);
      onCaptured();
    } catch (e: any) {
      setError(e.message || 'Falha ao processar URLs.');
    } finally {
      setBusy(false);
    }
  }

  const urlCount = urlsText.split(/[\n,;\s]+/).filter((u) => u.trim().startsWith('http')).length;

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-6">
        {/* MODE TOGGLE */}
        <div className="flex items-center gap-1 p-1 rounded-xl glass-inner self-start inline-flex w-fit flex-wrap">
          <button
            type="button"
            onClick={() => setMode('add')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'add' ? 'bg-brand/20 text-brand' : 'text-fg-muted hover:text-fg'
            }`}
          >
            ✏️ Adicionar manualmente
          </button>
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'manual' ? 'bg-brand/20 text-brand' : 'text-fg-muted hover:text-fg'
            }`}
          >
            🔗 Colar URLs (confiável)
          </button>
          <button
            type="button"
            onClick={() => setMode('auto')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'auto' ? 'bg-brand/20 text-brand' : 'text-fg-muted hover:text-fg'
            }`}
          >
            🤖 Busca automática (beta)
          </button>
        </div>

        {mode === 'add' ? (
          /* ============ MODO ADICIONAR MANUALMENTE ============ */
          <section className="glass-static p-6 lg:p-8 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent" />
            <div className="mb-5 rounded-lg p-3 text-xs flex items-start gap-2"
              style={{ background: 'rgba(94, 226, 255, 0.06)', border: '1px solid rgba(94, 226, 255, 0.25)' }}>
              <span className="shrink-0">✏️</span>
              <span className="text-fg-muted">
                <strong style={{ color: '#5EE2FF' }}>Adicionar manualmente:</strong> cadastra leads conhecidos sem rodar busca.
                Útil pra indicações, referências ou contatos coletados em outros canais.
              </span>
            </div>

            <Kicker>NOVO LEAD</Kicker>
            <div className="mt-5 grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm text-fg-muted">Nome (opcional)</span>
                <input
                  type="text"
                  className="input mt-2 !text-base"
                  placeholder="Ex: João Silva ou Restaurante Sabor"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  disabled={busy}
                  maxLength={200}
                />
              </label>
              <label className="block">
                <span className="text-sm text-fg-muted">Número de WhatsApp <span className="text-danger">*</span></span>
                <input
                  type="tel"
                  className="input mt-2 !text-base font-mono"
                  placeholder="11 99999-9999 ou +55 11 99999-9999"
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  disabled={busy}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && manualPhone.trim() && manualNiche.trim()) onAddManual();
                  }}
                />
                <span className="block mt-1.5 text-[11px] text-fg-dim">Apenas BR. Móvel ou fixo.</span>
              </label>
              <label className="block">
                <span className="text-sm text-fg-muted">Nicho <span className="text-danger">*</span></span>
                <input
                  type="text"
                  className="input mt-2 !text-base"
                  placeholder="Ex: estética, clínica, restaurante"
                  value={manualNiche}
                  onChange={(e) => setManualNiche(e.target.value)}
                  disabled={busy}
                  maxLength={80}
                />
              </label>
              <label className="block">
                <span className="text-sm text-fg-muted">Cidade (opcional)</span>
                <input
                  type="text"
                  className="input mt-2 !text-base"
                  placeholder="Ex: São Paulo"
                  value={manualCity}
                  onChange={(e) => setManualCity(e.target.value)}
                  disabled={busy}
                  maxLength={80}
                />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onAddManual}
                disabled={busy || !manualPhone.trim() || !manualNiche.trim() || disabled}
                className="btn btn-primary disabled:opacity-50"
                title={disabled ? 'Disponível apenas pra contas de cliente' : undefined}
              >
                {busy ? <><Spinner /> Adicionando…</> : <>+ Adicionar lead</>}
              </button>
              <span className="text-xs text-fg-dim">
                Tip: depois de adicionar, o nicho e cidade ficam preenchidos pra acelerar entrada em lote.
              </span>
            </div>

            {manualMsg && (
              <div className="mt-5 rounded-md px-3 py-2 text-sm"
                style={{
                  background: manualMsg.ok ? 'rgba(16, 242, 160, 0.08)' : 'rgba(255, 99, 99, 0.08)',
                  border: `1px solid ${manualMsg.ok ? 'rgba(16, 242, 160, 0.30)' : 'rgba(255, 99, 99, 0.30)'}`,
                  color: manualMsg.ok ? '#10F2A0' : '#FF8B8B',
                }}
              >
                {manualMsg.text}
              </div>
            )}
          </section>
        ) : mode === 'manual' ? (
          /* ============ MODO MANUAL: COLAR URLs ============ */
          <section className="glass-static p-6 lg:p-8 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent" />
            <Kicker>URLs · COLA AQUI</Kicker>

            <div className="mt-4 text-sm text-fg-muted leading-relaxed">
              <div className="font-semibold text-fg mb-2">Como usar (1 minuto, funciona 100%):</div>
              <ol className="list-decimal list-inside space-y-1 text-[13px]">
                <li>Abra Google/Instagram normalmente no seu navegador</li>
                <li>Busque por <code className="text-brand">"wa.me" {`{seu nicho}`} {`{cidade}`}</code> ou navegue por perfis públicos</li>
                <li>Copia os links dos resultados ou perfis (Ctrl+C nos URLs)</li>
                <li>Cola tudo aqui (separados por linha, vírgula ou espaço) e clica em <strong>Extrair</strong></li>
              </ol>
              <p className="mt-3 text-[12px] text-fg-dim">
                O sistema vai abrir cada URL e extrair todos os <code>wa.me</code>, <code>api.whatsapp.com/send</code> e telefones brasileiros que encontrar.
              </p>
            </div>

            <label className="block mt-5">
              <span className="text-sm text-fg-muted">Nicho/palavra-chave (opcional, pra organizar)</span>
              <input
                type="text"
                className="input mt-1"
                placeholder="Ex: estetica facial SP"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                maxLength={80}
                disabled={busy}
              />
            </label>

            <label className="block mt-4">
              <span className="text-sm text-fg-muted">URLs (até 50 por vez)</span>
              <textarea
                rows={8}
                className="input mt-1 font-mono !text-xs resize-y leading-relaxed"
                placeholder={`https://www.instagram.com/clinicasaopaulo
https://linktr.ee/clinicaexemplo
https://wa.me/5511999998888
https://www.exemplo.com.br/contato
…`}
                value={urlsText}
                onChange={(e) => setUrlsText(e.target.value)}
                disabled={busy}
              />
              <span className="block mt-2 text-[11px] text-fg-dim">
                {urlCount} URL{urlCount === 1 ? '' : 's'} detectada{urlCount === 1 ? '' : 's'} {urlCount > 50 && '· LIMITE 50'}
              </span>
            </label>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onExtract}
                disabled={busy || urlCount === 0 || disabled}
                className="btn btn-primary disabled:opacity-50"
                title={disabled ? 'Disponível apenas pra contas de cliente' : undefined}
              >
                {busy ? <><Spinner /> Extraindo…</> : <>Extrair números <ArrowRight /></>}
              </button>
              {busy && <span className="text-xs text-fg-muted">Pode levar até 30s — abrindo cada URL.</span>}
            </div>
          </section>
        ) : (
          /* ============ MODO AUTO: OpenStreetMap (funciona em prod) ============ */
          <section className="glass-static p-6 lg:p-8 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent" />
            <div className="mb-5 rounded-lg p-3 text-xs flex items-start gap-2"
              style={{ background: 'rgba(16, 242, 160, 0.06)', border: '1px solid rgba(16, 242, 160, 0.25)' }}>
              <span className="shrink-0">✨</span>
              <span className="text-fg-muted">
                <strong className="text-emerald">2 fontes consultadas em paralelo:</strong> OpenStreetMap (cobre capitais) + Telelistas (cobre cidades médias e pequenas).
                Telefones validados como móvel ou fixo BR.
              </span>
            </div>
            <Kicker>NICHO + REGIÃO</Kicker>
            <div className="mt-5 grid md:grid-cols-3 gap-4">
              <div>
                <span className="text-sm text-fg-muted">Nicho do negócio</span>
                <Combobox
                  options={niches}
                  value={niche}
                  onChange={setNiche}
                  placeholder="Buscar nicho…"
                  disabled={busy}
                />
              </div>
              <div>
                <span className="text-sm text-fg-muted">Estado</span>
                <Combobox
                  options={states.map((s) => ({ value: s.uf, label: `${s.uf} · ${s.name}` }))}
                  value={stateUf}
                  onChange={(v) => { setStateUf(v); setCity(''); }}
                  placeholder="Buscar estado…"
                  disabled={busy}
                />
              </div>
              <div>
                <span className="text-sm text-fg-muted">
                  Cidade {citiesLoading && <span className="text-fg-dim">· carregando…</span>}
                </span>
                <Combobox
                  options={cities}
                  value={city}
                  onChange={setCity}
                  placeholder={citiesLoading ? 'Carregando…' : 'Buscar cidade…'}
                  disabled={busy || citiesLoading || !cities.length}
                />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-end gap-4">
              <div className="min-w-[200px]">
                <span className="text-sm text-fg-muted">Quantidade máxima de leads</span>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={200}
                    step={1}
                    value={maxLeads}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) setMaxLeads(Math.min(200, Math.max(1, v)));
                    }}
                    disabled={busy}
                    className="input !text-base !w-24 font-mono tabular text-center"
                  />
                  <div className="flex gap-1">
                    {[10, 25, 50, 100, 200].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setMaxLeads(n)}
                        disabled={busy}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors ${
                          maxLeads === n ? 'bg-brand/20 text-brand' : 'text-fg-dim hover:text-fg hover:bg-white/[0.04]'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-1.5 text-[11px] text-fg-dim">limite após dedup · 1 a 200</div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onScrape}
                disabled={busy || !niche || !stateUf || !city || disabled}
                className="btn btn-primary disabled:opacity-50"
                title={disabled ? 'Disponível apenas pra contas de cliente' : undefined}
              >
                {busy ? <><Spinner /> Capturando…</> : <>Capturar até {maxLeads} leads <ArrowRight /></>}
              </button>
              {busy && <span className="text-xs text-fg-muted">Pode levar até 30s — resolvendo cidade + consultando OSM.</span>}
            </div>

            <div className="mt-5 text-[11px] text-fg-dim">
              ⓘ Cobertura depende do quanto o OSM tem mapeado da região. Cidades grandes costumam ter mais resultados.
              Se vier pouco, complemente com o modo <strong>Colar URLs</strong>.
            </div>
          </section>
        )}

          {error && (
            <div className="mt-5 rounded-xl p-4 flex items-start gap-3"
              style={{ background: 'rgba(255, 99, 99, 0.08)', border: '1px solid rgba(255, 99, 99, 0.30)' }}>
              <AlertIcon />
              <div className="text-sm" style={{ color: '#FF8B8B' }}>{error}</div>
            </div>
          )}

          {result && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="glass-inner p-4">
                  <Kicker>NESSA RODADA</Kicker>
                  <div className="text-3xl font-semibold tabular tracking-tightest mt-2 text-emerald">
                    <AnimatedCounter value={result.inserted} />
                  </div>
                  <div className="text-xs text-fg-muted mt-1">novos números salvos</div>
                </div>
                <div className="glass-inner p-4">
                  <Kicker>ENCONTRADOS</Kicker>
                  <div className="text-3xl font-semibold tabular tracking-tightest mt-2 stat-number">
                    <AnimatedCounter value={result.total_found} />
                  </div>
                  <div className="text-xs text-fg-muted mt-1">no total (incluindo duplicados)</div>
                </div>
              </div>

              {/* Diagnóstico */}
              <div className="glass-inner p-4 text-xs text-fg-muted font-mono">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div><span className="text-fg-dim">fonte</span> · {result.source}</div>
                  <div><span className="text-fg-dim">cidade</span> · {result.city || '—'}</div>
                  <div><span className="text-fg-dim">osm</span> · {result.raw_osm_count} <span className="text-fg-dim">total</span> · {result.overpass_results} c/ tel</div>
                  <div className={result.telelistas_results > 0 ? 'text-emerald' : ''}>
                    <span className="text-fg-dim">telelistas</span> · {result.telelistas_results}
                  </div>
                  <div className={result.total_found > 0 ? 'text-emerald' : ''}>
                    <span className="text-fg-dim">salvos</span> · {result.total_found}
                  </div>
                </div>
              </div>

              {result.total_found === 0 && (
                <div className="rounded-xl p-4 text-sm leading-relaxed"
                  style={{ background: 'rgba(255, 200, 87, 0.08)', border: '1px solid rgba(255, 200, 87, 0.30)', color: '#FFD680' }}>
                  <div className="font-semibold mb-2">
                    {result.raw_osm_count > 0
                      ? `Achei ${result.raw_osm_count} ${result.raw_osm_count === 1 ? 'negócio' : 'negócios'} no OSM, mas nenhum tem telefone público — e Telelistas também não trouxe nada.`
                      : `Nenhum resultado pra ${result.niche_matched} em ${result.city}.`}
                  </div>
                  <ul className="space-y-1 text-[13px] list-disc list-inside text-fg mt-3">
                    <li>Tente um <strong>nicho próximo</strong> — ex: "salão de beleza" no lugar de "estética", "restaurante" no lugar de "pizzaria"</li>
                    <li>Tente uma <strong>cidade maior próxima</strong> (capital ou região metropolitana)</li>
                    <li>Complemente com o modo <strong>Colar URLs</strong></li>
                  </ul>
                </div>
              )}
            </motion.div>
          )}

          {extractResult && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 space-y-4"
            >
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="glass-inner p-4">
                  <Kicker>SALVOS</Kicker>
                  <div className="text-3xl font-semibold tabular tracking-tightest mt-2 text-emerald">
                    <AnimatedCounter value={extractResult.inserted} />
                  </div>
                  <div className="text-xs text-fg-muted mt-1">novos números</div>
                </div>
                <div className="glass-inner p-4">
                  <Kicker>ACHADOS</Kicker>
                  <div className="text-3xl font-semibold tabular tracking-tightest mt-2 stat-number">
                    <AnimatedCounter value={extractResult.total_found} />
                  </div>
                  <div className="text-xs text-fg-muted mt-1">no total</div>
                </div>
                <div className="glass-inner p-4">
                  <Kicker>URLs</Kicker>
                  <div className="text-3xl font-semibold tabular tracking-tightest mt-2 stat-number">
                    <AnimatedCounter value={extractResult.urls_processed} />
                  </div>
                  <div className="text-xs text-fg-muted mt-1">processadas</div>
                </div>
                <div className="glass-inner p-4">
                  <Kicker>FALHARAM</Kicker>
                  <div className="text-3xl font-semibold tabular tracking-tightest mt-2 stat-number">
                    <AnimatedCounter value={extractResult.urls_failed} />
                  </div>
                  <div className="text-xs text-fg-muted mt-1">não responderam</div>
                </div>
              </div>

              {extractResult.total_found === 0 && (
                <div className="rounded-xl p-4 text-sm leading-relaxed"
                  style={{ background: 'rgba(255, 200, 87, 0.08)', border: '1px solid rgba(255, 200, 87, 0.30)', color: '#FFD680' }}>
                  <div className="font-semibold mb-2">Nenhum número encontrado nessas URLs.</div>
                  <p className="text-fg text-[13px]">
                    Verifique se as URLs contêm de fato links <code>wa.me</code>, <code>api.whatsapp.com/send</code> ou números brasileiros visíveis no HTML.
                  </p>
                </div>
              )}
            </motion.div>
          )}

        <section className="glass-static p-5 text-sm text-fg-muted leading-relaxed">
          <Kicker>COMO FUNCIONA</Kicker>
          {mode === 'manual' ? (
            <ul className="mt-4 space-y-2 text-sm">
              <li>• Você busca normalmente no Google/Instagram (seu IP residencial não é bloqueado)</li>
              <li>• Cola as URLs no campo acima</li>
              <li>• Backend abre cada URL e extrai todos os <code className="text-brand">wa.me</code>, <code className="text-brand">api.whatsapp.com/send</code> e telefones BR no HTML</li>
              <li>• Salva sem duplicar (cada número entra 1 vez por cliente)</li>
              <li>• Use a aba <strong>Anti-Ban & IA</strong> pra configurar como disparar</li>
            </ul>
          ) : (
            <ul className="mt-4 space-y-2 text-sm">
              <li>• Disparamos <strong>OSM (OpenStreetMap)</strong> + <strong>Telelistas</strong> em paralelo e juntamos resultados</li>
              <li>• OSM = base global de negócios mapeados (forte em capitais)</li>
              <li>• Telelistas = lista telefônica BR pública (forte em cidades médias e pequenas)</li>
              <li>• Telefones BR validados como móvel (3º = 9) ou fixo</li>
              <li>• Dedup automático: cada número entra 1 vez por cliente</li>
            </ul>
          )}
        </section>
      </div>

      <aside className="lg:sticky lg:top-24 self-start space-y-3">
        <div className="glass-static p-5">
          <Kicker>TOTAL CAPTURADO</Kicker>
          <div className="text-5xl font-semibold tabular tracking-tightest mt-3 text-brand-gradient">
            <AnimatedCounter value={stats.total} />
          </div>
          <div className="text-xs text-fg-muted mt-1">números únicos na sua base</div>
        </div>
        <div className="glass-static p-5 space-y-2">
          <Row label="Pendentes" value={stats.pending} dot="warn" />
          <Row label="Enviando" value={stats.sending} dot="cyan" />
          <Row label="Enviados" value={stats.sent} dot="success" />
          <Row label="Falharam" value={stats.failed} dot="danger" />
        </div>
      </aside>
    </div>
  );
}

/* ============================================================
   TAB 3 — Painel da Fila
   ============================================================ */

type WAInstance = { id: string; name: string; status: string; phone_number: string | null };

function QueueTab({
  leads, stats, onRefresh, targetTenantId,
}: {
  leads: Lead[];
  stats: Stats;
  onRefresh: () => void;
  targetTenantId?: string;
}) {
  const [filter, setFilter] = useState<string>('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [instances, setInstances] = useState<WAInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  const [qualifyingId, setQualifyingId] = useState<string | null>(null);
  const [qualifyResult, setQualifyResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const { confirm, notify } = useDialog();

  // Auto-refresh a cada 15s
  useEffect(() => {
    const t = setInterval(onRefresh, 15000);
    return () => clearInterval(t);
  }, [onRefresh]);

  // Carrega instâncias WhatsApp conectadas pra esse tenant
  useEffect(() => {
    if (!targetTenantId) return;
    apiFetch<{ data: { instances: WAInstance[] } }>(`/api/whatsapp/instances?tenant_id=${targetTenantId}`)
      .then((r) => {
        const connected = r.data.instances.filter((i) => i.status === 'connected');
        setInstances(connected);
        // Pré-seleciona a primeira se houver e não tiver nenhuma selecionada
        setSelectedInstance((prev) => prev || (connected[0]?.id || ''));
      })
      .catch(() => {});
  }, [targetTenantId]);

  async function onDelete(lead: Lead) {
    const phone = formatPhone(lead.whatsapp_number);
    const label = lead.name ? `${lead.name} (${phone})` : phone;
    const ok = await confirm({
      title: 'Excluir lead?',
      message: `"${label}" será removido permanentemente.`,
      variant: 'danger',
      confirmLabel: 'Sim, excluir',
    });
    if (!ok) return;
    setDeletingId(lead.id);
    try {
      const url = targetTenantId
        ? `/api/prospecting/leads/${lead.id}?tenant_id=${targetTenantId}`
        : `/api/prospecting/leads/${lead.id}`;
      await apiFetch(url, { method: 'DELETE' });
      notify('Lead excluído', 'success');
      await onRefresh();
    } catch (e: any) {
      notify(`Falha ao excluir: ${e?.message || 'erro desconhecido'}`, 'danger');
    } finally {
      setDeletingId(null);
    }
  }

  function toggleSelect(leadId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId); else next.add(leadId);
      return next;
    });
  }

  function selectAllVisible(visibleLeads: Lead[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = visibleLeads.every((l) => next.has(l.id));
      if (allSelected) {
        visibleLeads.forEach((l) => next.delete(l.id));
      } else {
        visibleLeads.forEach((l) => next.add(l.id));
      }
      return next;
    });
  }

  async function onBatchDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const ok = await confirm({
      title: `Excluir ${ids.length} lead${ids.length === 1 ? '' : 's'}?`,
      message: 'Todos os leads selecionados serão removidos permanentemente.',
      variant: 'danger',
      confirmLabel: `Excluir ${ids.length} lead${ids.length === 1 ? '' : 's'}`,
    });
    if (!ok) return;
    setBatchBusy(true);
    try {
      const qs = targetTenantId ? `?tenant_id=${targetTenantId}` : '';
      await Promise.allSettled(
        ids.map((id) =>
          apiFetch(`/api/prospecting/leads/${id}${qs}`, { method: 'DELETE' }),
        ),
      );
      notify(`${ids.length} lead${ids.length === 1 ? '' : 's'} excluído${ids.length === 1 ? '' : 's'}`, 'success');
      setSelectedIds(new Set());
      await onRefresh();
    } catch (e: any) {
      notify(`Falha em lote: ${e?.message || 'erro'}`, 'danger');
    } finally {
      setBatchBusy(false);
    }
  }

  async function onBatchQualify() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!selectedInstance) {
      setQualifyResult({ ok: false, msg: 'Selecione uma conexão WhatsApp acima primeiro.' });
      return;
    }
    const ok = await confirm({
      title: 'Iniciar qualificação via IA?',
      message: `A IA vai enviar a primeira mensagem pra ${ids.length} lead${ids.length === 1 ? '' : 's'} no WhatsApp.`,
      variant: 'confirm',
      confirmLabel: 'Iniciar qualificação',
    });
    if (!ok) return;
    setBatchBusy(true);
    setQualifyResult(null);
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          apiFetch('/api/whatsapp/qualify', {
            method: 'POST',
            body: { lead_id: id, instance_id: selectedInstance, tenant_id: targetTenantId },
          }),
        ),
      );
      const okCount = results.filter((r) => r.status === 'fulfilled').length;
      const failCount = results.length - okCount;
      setQualifyResult({
        ok: failCount === 0,
        msg: failCount === 0
          ? `✓ Qualificação iniciada em ${okCount} lead${okCount === 1 ? '' : 's'}.`
          : `${okCount} ok · ${failCount} com erro (números inválidos ou já enviados).`,
      });
      setSelectedIds(new Set());
      await onRefresh();
    } catch (e: any) {
      setQualifyResult({ ok: false, msg: e?.message || 'Falha no lote.' });
    } finally {
      setBatchBusy(false);
      setTimeout(() => setQualifyResult(null), 8000);
    }
  }

  async function onQualify(lead: Lead) {
    if (!selectedInstance) {
      setQualifyResult({ ok: false, msg: 'Selecione uma conexão WhatsApp acima primeiro.' });
      return;
    }
    setQualifyingId(lead.id);
    setQualifyResult(null);
    try {
      await apiFetch<{ data: { conversation_id: string } }>('/api/whatsapp/qualify', {
        method: 'POST',
        body: {
          lead_id: lead.id,
          instance_id: selectedInstance,
          tenant_id: targetTenantId,
        },
      });
      setQualifyResult({ ok: true, msg: `✓ Qualificação iniciada com ${lead.name || formatPhone(lead.whatsapp_number)}. IA assume quando o lead responder.` });
      await onRefresh();
    } catch (e: any) {
      setQualifyResult({ ok: false, msg: e?.message || 'Falha ao iniciar qualificação.' });
    } finally {
      setQualifyingId(null);
      setTimeout(() => setQualifyResult(null), 6000);
    }
  }

  const progress = stats.total > 0 ? Math.round((stats.sent / stats.total) * 100) : 0;

  // Agrupa leads por nicho (keyword_used). "Sem nicho" pra leads sem categorização.
  const groups = leads.reduce<Record<string, Lead[]>>((acc, l) => {
    const key = l.keyword_used || 'Sem nicho';
    (acc[key] ||= []).push(l);
    return acc;
  }, {});
  const allGroupKeys = Object.keys(groups).sort();
  const groupEntries = Object.entries(groups)
    .filter(([k]) => !filter || k === filter)
    .sort((a, b) => b[1].length - a[1].length);

  const visibleLeadCount = groupEntries.reduce((acc, [, items]) => acc + items.length, 0);

  return (
    <div className="space-y-6">
      <section className="glass-static p-6 lg:p-8">
        <div className="flex items-end justify-between mb-5 gap-4 flex-wrap">
          <div>
            <Kicker>PROGRESSO GERAL</Kicker>
            <div className="mt-2 text-4xl font-semibold tabular tracking-tightest text-brand-gradient">
              {progress}%
            </div>
            <div className="text-xs text-fg-muted mt-1">
              {stats.sent} de {stats.total} disparados
            </div>
          </div>
          <button onClick={onRefresh} className="btn btn-ghost !text-xs !py-1.5">
            <RefreshIcon /> Atualizar
          </button>
        </div>

        <div className="progress-bar !h-2">
          <span style={{ width: `${progress}%` }} />
        </div>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat label="Total" value={stats.total} />
          <MiniStat label="Pendentes" value={stats.pending} tone="warn" />
          <MiniStat label="Enviados" value={stats.sent} tone="success" />
          <MiniStat label="Falharam" value={stats.failed} tone="danger" />
        </div>
      </section>

      {leads.length === 0 ? (
        <section className="glass-static p-12 text-center text-sm text-fg-muted">
          Nenhum lead capturado ainda. Use a aba <strong>1. Capturar Leads</strong> pra começar.
        </section>
      ) : (
        <>
          {selectedIds.size > 0 && (
            <section className="glass-static p-4 lg:p-5"
              style={{ background: 'rgba(16, 242, 160, 0.04)', border: '1px solid rgba(16, 242, 160, 0.25)' }}>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium text-emerald">
                  ✓ {selectedIds.size} lead{selectedIds.size === 1 ? '' : 's'} selecionado{selectedIds.size === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={onBatchQualify}
                  disabled={batchBusy || !selectedInstance || instances.length === 0}
                  className="btn btn-primary !text-xs !py-1.5 disabled:opacity-50"
                  title={!selectedInstance ? 'Selecione uma conexão WhatsApp' : 'Qualificar todos os selecionados'}
                >
                  {batchBusy ? 'Processando…' : `🤖 Qualificar ${selectedIds.size} lead${selectedIds.size === 1 ? '' : 's'}`}
                </button>
                <button
                  type="button"
                  onClick={onBatchDelete}
                  disabled={batchBusy}
                  className="btn !text-xs !py-1.5 disabled:opacity-50"
                  style={{
                    background: 'rgba(255, 99, 99, 0.10)',
                    color: '#FF6363',
                    border: '1px solid rgba(255, 99, 99, 0.35)',
                  }}
                >
                  🗑 Excluir {selectedIds.size}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="btn btn-ghost !text-xs !py-1.5 ml-auto"
                >
                  ✕ Limpar seleção
                </button>
              </div>
            </section>
          )}

          <section className="glass-static p-4 lg:p-5 space-y-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[260px] max-w-md">
                <span className="text-[11px] uppercase tracking-widest text-fg-dim font-mono">FILTRAR POR NICHO</span>
                <Combobox
                  options={[
                    { value: '', label: `Todos os nichos · ${leads.length} leads` },
                    ...allGroupKeys.map((k) => ({ value: k, label: `${k} · ${groups[k].length}` })),
                  ]}
                  value={filter}
                  onChange={setFilter}
                  placeholder="Buscar nicho…"
                />
              </div>
              {filter && (
                <button
                  type="button"
                  onClick={() => setFilter('')}
                  className="btn btn-ghost !text-xs !py-2"
                >
                  ✕ Limpar filtro
                </button>
              )}
              <div className="text-xs text-fg-muted font-mono tabular ml-auto">
                {visibleLeadCount} {visibleLeadCount === 1 ? 'lead visível' : 'leads visíveis'}
              </div>
            </div>

            {/* Seletor de conexão WhatsApp pra qualificar */}
            <div className="pt-3 border-t border-line/50">
              <div className="flex items-end gap-3 flex-wrap">
                <div className="flex-1 min-w-[260px] max-w-md">
                  <span className="text-[11px] uppercase tracking-widest text-fg-dim font-mono">CONEXÃO WHATSAPP PRA QUALIFICAR</span>
                  {instances.length === 0 ? (
                    <div className="mt-2 text-sm text-fg-muted px-3 py-2 rounded-md"
                      style={{ background: 'rgba(255, 200, 87, 0.06)', border: '1px solid rgba(255, 200, 87, 0.25)' }}>
                      Nenhuma conexão ativa.{' '}
                      <a href="/admin/whatsapp" className="link">Conectar agora →</a>
                    </div>
                  ) : (
                    <select
                      className="input !text-base mt-2 w-full"
                      value={selectedInstance}
                      onChange={(e) => setSelectedInstance(e.target.value)}
                    >
                      {instances.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}{i.phone_number ? ` · +${i.phone_number}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="text-[11px] text-fg-dim max-w-sm">
                  ⓘ Clique em <strong>🤖 Qualificar</strong> em cada lead pendente. A IA envia a mensagem inicial (do prompt) e assume a conversa quando o lead responder.
                </div>
              </div>
            </div>

            {qualifyResult && (
              <div className="rounded-md px-3 py-2 text-sm"
                style={{
                  background: qualifyResult.ok ? 'rgba(16, 242, 160, 0.08)' : 'rgba(255, 99, 99, 0.08)',
                  border: `1px solid ${qualifyResult.ok ? 'rgba(16, 242, 160, 0.30)' : 'rgba(255, 99, 99, 0.30)'}`,
                  color: qualifyResult.ok ? '#10F2A0' : '#FF8B8B',
                }}
              >
                {qualifyResult.msg}
              </div>
            )}
          </section>

          {groupEntries.length === 0 ? (
            <section className="glass-static p-8 text-center text-sm text-fg-muted">
              Nenhum lead para o nicho selecionado.
            </section>
          ) : (
            groupEntries.map(([nicho, items]) => (
              <NicheGroup
                key={nicho}
                nicho={nicho}
                items={items}
                onDelete={onDelete}
                deletingId={deletingId}
                onQualify={onQualify}
                qualifyingId={qualifyingId}
                canQualify={instances.length > 0 && !!selectedInstance}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onToggleSelectAll={() => selectAllVisible(items)}
              />
            ))
          )}
        </>
      )}
    </div>
  );
}

function NicheGroup({
  nicho, items, onDelete, deletingId, onQualify, qualifyingId, canQualify,
  selectedIds, onToggleSelect, onToggleSelectAll,
}: {
  nicho: string;
  items: Lead[];
  onDelete: (l: Lead) => void;
  deletingId: string | null;
  onQualify: (l: Lead) => void;
  qualifyingId: string | null;
  canQualify: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
}) {
  const allSelected = items.length > 0 && items.every((l) => selectedIds.has(l.id));
  const someSelected = items.some((l) => selectedIds.has(l.id));
  const [open, setOpen] = useState(true);
  const counts = items.reduce(
    (a, l) => ((a[l.status] = (a[l.status] || 0) + 1), a),
    {} as Record<Lead['status'], number>,
  );

  return (
    <section className="glass-static overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-6 py-4 border-b border-line flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <ChevronIcon open={open} />
          <Kicker>{nicho}</Kicker>
          <span className="badge badge-success">{items.length} {items.length === 1 ? 'lead' : 'leads'}</span>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-[11px] font-mono uppercase tracking-wider text-fg-muted">
          {counts.pending ? <span className="text-warn">{counts.pending} pend</span> : null}
          {counts.sending ? <span className="text-brand">{counts.sending} env</span> : null}
          {counts.sent ? <span className="text-emerald">{counts.sent} ok</span> : null}
          {counts.failed ? <span className="text-danger">{counts.failed} falha</span> : null}
        </div>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02]">
              <tr className="border-b border-line">
                <th className="py-3 px-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allSelected && someSelected;
                    }}
                    onChange={onToggleSelectAll}
                    className="cursor-pointer"
                    aria-label="Selecionar todos deste grupo"
                  />
                </th>
                <th className="text-left py-3 px-4 text-[11px] font-mono uppercase tracking-wider text-fg-muted">#</th>
                <th className="text-left py-3 px-4 text-[11px] font-mono uppercase tracking-wider text-fg-muted">Nome</th>
                <th className="text-left py-3 px-4 text-[11px] font-mono uppercase tracking-wider text-fg-muted">WhatsApp</th>
                <th className="text-left py-3 px-4 text-[11px] font-mono uppercase tracking-wider text-fg-muted">Confiança</th>
                <th className="text-left py-3 px-4 text-[11px] font-mono uppercase tracking-wider text-fg-muted">Status</th>
                <th className="text-right py-3 px-4 text-[11px] font-mono uppercase tracking-wider text-fg-muted">Capturado</th>
                <th className="text-right py-3 px-4 text-[11px] font-mono uppercase tracking-wider text-fg-muted">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((l, i) => (
                <tr
                  key={l.id}
                  className={`border-b border-line/40 hover:bg-white/[0.02] transition-colors ${
                    selectedIds.has(l.id) ? 'bg-emerald/[0.04]' : ''
                  }`}
                >
                  <td className="py-3 px-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(l.id)}
                      onChange={() => onToggleSelect(l.id)}
                      className="cursor-pointer"
                      aria-label={`Selecionar ${l.name || formatPhone(l.whatsapp_number)}`}
                    />
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-fg-dim">{String(i + 1).padStart(3, '0')}</td>
                  <td className="py-3 px-4">
                    <div className="font-medium truncate max-w-[200px]">
                      {l.name || <span className="text-fg-dim">—</span>}
                    </div>
                    {l.source_url && (
                      <a href={l.source_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-fg-dim hover:text-brand truncate block max-w-[200px]">
                        {l.source_url.replace(/^https?:\/\//, '').slice(0, 32)}…
                      </a>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono">{formatPhone(l.whatsapp_number)}</td>
                  <td className="py-3 px-4"><SourceBadge source={l.metadata?.source} /></td>
                  <td className="py-3 px-4"><StatusPill status={l.status} /></td>
                  <td className="py-3 px-4 text-right font-mono text-xs text-fg-muted">
                    {new Date(l.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-1.5 justify-end">
                      <button
                        type="button"
                        onClick={() => onQualify(l)}
                        disabled={
                          !canQualify
                          || qualifyingId === l.id
                          || l.status === 'sent'
                          || l.status === 'sending'
                        }
                        className="btn !text-[11px] !py-1.5 !px-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                          background: 'rgba(16, 242, 160, 0.10)',
                          color: '#10F2A0',
                          border: '1px solid rgba(16, 242, 160, 0.30)',
                        }}
                        title={
                          !canQualify
                            ? 'Selecione uma conexão WhatsApp acima'
                            : l.status === 'sending' || l.status === 'sent'
                              ? 'Lead já foi acionado'
                              : 'Iniciar qualificação via IA pelo WhatsApp'
                        }
                      >
                        {qualifyingId === l.id ? <><Spinner /> Iniciando…</> : <>🤖 Qualificar</>}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(l)}
                        disabled={deletingId === l.id}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md text-fg-dim hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-40 disabled:cursor-wait"
                        title="Excluir lead"
                        aria-label="Excluir lead"
                      >
                        {deletingId === l.id ? <Spinner /> : <TrashIcon />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" stroke="currentColor"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/* ============================================================
   Helpers
   ============================================================ */

const fadeIn = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.2 },
};

function Row({ label, value, dot }: { label: string; value: number; dot: 'success' | 'warn' | 'danger' | 'cyan' }) {
  const color =
    dot === 'success' ? '#10F2A0'
    : dot === 'warn' ? '#FFC857'
    : dot === 'danger' ? '#FF6363'
    : '#5EE2FF';
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}80` }} />
        <span className="text-fg-muted">{label}</span>
      </span>
      <span className="tabular font-semibold">{value}</span>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-fg-muted">{k}</span>
      <span className="font-mono">{v}</span>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'warn' | 'danger' }) {
  const color =
    tone === 'success' ? 'text-emerald'
    : tone === 'warn' ? 'text-warn'
    : tone === 'danger' ? 'text-danger'
    : 'stat-number';
  return (
    <div className="glass-inner p-4">
      <div className="text-[10px] uppercase tracking-widest text-fg-dim">{label}</div>
      <div className={`mt-1 text-3xl font-semibold tabular tracking-tightest ${color}`}>
        <AnimatedCounter value={value} />
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source?: 'wa_link' | 'phone_pattern' }) {
  if (source === 'wa_link') {
    return (
      <span className="badge badge-success badge-dot" title="Tirado de link wa.me/api.whatsapp — alta probabilidade de estar no WhatsApp">
        wa.me
      </span>
    );
  }
  return (
    <span className="badge badge-warn" title="Telefone genérico do HTML — pode não estar no WhatsApp (verificar)">
      tel
    </span>
  );
}

function StatusPill({ status }: { status: Lead['status'] }) {
  const map = {
    pending: { cls: 'badge-warn',    label: 'pendente' },
    sending: { cls: 'badge',         label: 'enviando' },
    sent:    { cls: 'badge-success', label: 'enviado' },
    failed:  { cls: 'badge-danger',  label: 'falhou' },
  } as const;
  const m = map[status];
  return <span className={`badge ${m.cls} badge-dot`}>{m.label}</span>;
}

type ComboOption = string | { value: string; label: string };

function Combobox({
  options, value, onChange, placeholder, disabled = false,
}: {
  options: ComboOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const normalized = useMemo(
    () => options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o)),
    [options],
  );
  const selectedLabel = useMemo(() => {
    const hit = normalized.find((o) => o.value === value);
    return hit ? hit.label : '';
  }, [normalized, value]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => { if (!open) setQuery(''); }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (!q) return normalized;
    return normalized.filter((o) => {
      const lbl = o.label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const val = o.value.toLowerCase();
      return lbl.includes(q) || val.includes(q);
    });
  }, [normalized, query]);

  return (
    <div ref={wrapRef} className="relative mt-2">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className="input !text-base text-left flex items-center justify-between gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={selectedLabel ? '' : 'text-fg-dim'}>{selectedLabel || placeholder || 'Selecione…'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor"
          strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-fg-muted">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && !disabled && (
        <div
          className="absolute mt-1 w-full p-2 max-h-72 overflow-hidden flex flex-col rounded-xl"
          style={{
            zIndex: 50,
            background: '#0B1314',
            border: '1px solid rgba(16, 242, 160, 0.20)',
            boxShadow: '0 20px 60px -10px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(16, 242, 160, 0.05)',
          }}
        >
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder || 'Pesquisar…'}
            className="input !text-sm !py-2 shrink-0"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'Enter' && filtered[0]) {
                onChange(filtered[0].value); setOpen(false);
              }
            }}
          />
          <div className="mt-2 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-fg-dim text-center">Nada encontrado.</div>
            ) : (
              filtered.slice(0, 200).map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                    o.value === value
                      ? 'bg-brand/15 text-brand'
                      : 'hover:bg-white/[0.04] text-fg'
                  }`}
                >
                  {o.label}
                </button>
              ))
            )}
            {filtered.length > 200 && (
              <div className="px-3 py-2 text-[11px] text-fg-dim text-center border-t border-line mt-1">
                Mostrando 200 de {filtered.length} — refine a busca.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatPhone(raw: string): string {
  const d = String(raw).replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 12 && d.startsWith('55')) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  return raw;
}

/* ============================================================
   Icons
   ============================================================ */

function CaptureIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="1.7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06A2 2 0 1 1 4.27 16.96l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1A1.65 1.65 0 0 0 4.27 7.04l-.06-.06A2 2 0 1 1 7.04 4.27l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.46.46 1.05.5 1.51.5H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function QueueIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="1.7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}
function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="animate-spin">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
function AlertIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0 mt-0.5">
      <circle cx="12" cy="12" r="10" stroke="#FF6363" strokeWidth="1.8" />
      <path d="M12 8v4M12 16h.01" stroke="#FF6363" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
function RefreshIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}
