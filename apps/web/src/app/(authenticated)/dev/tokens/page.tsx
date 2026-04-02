import type { JSX } from 'react';

import { ThemeToggleSection } from './_theme-toggle';

const colorFamilies = [
  {
    name: 'synapse',
    label: 'Synapse — Synaptic Blue',
    description: 'Primary actions, active connections, brand accent',
  },
  {
    name: 'dendrite',
    label: 'Dendrite — Dendrite Violet',
    description: 'Knowledge graph nodes, deep learning states',
  },
  {
    name: 'myelin',
    label: 'Myelin — Myelin Gold',
    description: 'Mastery, confidence, review readiness',
  },
  {
    name: 'neuron',
    label: 'Neuron — Neural Green',
    description: 'Correct answers, healthy states, success',
  },
  {
    name: 'cortex',
    label: 'Cortex — Cortex Rose',
    description: 'Errors, misconceptions, destructive actions',
  },
  {
    name: 'axon',
    label: 'Axon — Axon Gray',
    description: 'Neutral surfaces, text hierarchy, borders',
  },
] as const;

const shades = [50, 100, 200, 400, 600, 900] as const;

const typographyTokens = [
  { cls: 'text-page-title', label: 'page-title', sample: 'Page Title — Deep Learning' },
  { cls: 'text-section-title', label: 'section-title', sample: 'Section: Spaced Repetition' },
  { cls: 'text-card-title', label: 'card-title', sample: 'Card: Hebbian Learning' },
  { cls: 'text-metric-value', label: 'metric-value', sample: '98.4' },
  { cls: 'text-metric-label', label: 'metric-label', sample: 'Retention Rate' },
  {
    cls: 'text-body',
    label: 'body',
    sample:
      'Spaced repetition is a learning technique that incorporates increasing intervals of time between reviews of previously learned material.',
  },
  {
    cls: 'text-caption',
    label: 'caption',
    sample: 'Last reviewed 3 days ago · Due tomorrow',
  },
] as const;

const spacingTokens = [
  { varName: '--space-section', label: '--space-section (1.5rem)', tokenClass: 'section' },
  { varName: '--space-card-gap', label: '--space-card-gap (1rem)', tokenClass: 'card-gap' },
  { varName: '--space-inset', label: '--space-inset (1.5rem)', tokenClass: 'inset' },
  { varName: '--space-tight', label: '--space-tight (0.5rem)', tokenClass: 'tight' },
] as const;

const animationTokens = [
  {
    cls: 'animate-pulse-glow',
    label: 'pulse-glow',
    description: 'Active session indicator',
    bg: 'bg-synapse-400',
  },
  {
    cls: 'animate-fade-slide-in',
    label: 'fade-slide-in',
    description: 'Panel/card entrance',
    bg: 'bg-dendrite-400',
  },
  {
    cls: 'animate-ring-fill',
    label: 'ring-fill',
    description: 'Progress ring fill',
    bg: 'bg-myelin-400',
  },
  {
    cls: 'animate-particle-flow',
    label: 'particle-flow',
    description: 'Knowledge flow indicator',
    bg: 'bg-neuron-400',
  },
  {
    cls: 'shimmer',
    label: 'shimmer',
    description: 'Loading placeholder',
    bg: '',
  },
] as const;

export default function TokenGalleryPage(): JSX.Element {
  // Dev-only route — return nothing in production; Next.js middleware handles 404
  if (process.env.NODE_ENV === 'production') {
    return <></>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 space-y-12">
      <header>
        <h1 className="text-page-title text-synapse-400">
          Design Token Gallery — Phase 00 Synapse
        </h1>
        <p className="text-body text-axon-400 mt-2">
          Dev-only · All tokens, all shades, both themes
        </p>
      </header>

      {/* ── Theme Toggle ───────────────────────────────────────── */}
      <ThemeToggleSection />

      {/* ── Color Families ─────────────────────────────────────── */}
      <section>
        <h2 className="text-section-title mb-4">Color Families</h2>
        <div className="space-y-8">
          {colorFamilies.map((family) => (
            <div key={family.name}>
              <h3 className="text-card-title mb-1">{family.label}</h3>
              <p className="text-caption mb-4">{family.description}</p>
              <div className="flex gap-3 flex-wrap">
                {shades.map((shade) => (
                  <div key={shade} className="flex flex-col items-center gap-1">
                    <div
                      className="w-16 h-16 rounded-lg border border-border"
                      style={{ backgroundColor: `hsl(var(--${family.name}-${String(shade)}))` }}
                    />
                    <span className="text-caption">{shade}</span>
                    <span className="text-caption font-mono text-[10px]">
                      {family.name}-{shade}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Typography Scale ───────────────────────────────────── */}
      <section>
        <h2 className="text-section-title mb-4">Typography Scale</h2>
        <div className="space-y-4 border border-border rounded-lg p-6">
          {typographyTokens.map((t) => (
            <div
              key={t.cls}
              className="flex flex-col gap-1 border-b border-border pb-4 last:border-0 last:pb-0"
            >
              <span className="text-caption text-axon-400 font-mono">.{t.label}</span>
              <span className={t.cls}>{t.sample}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Spacing Tokens ─────────────────────────────────────── */}
      <section>
        <h2 className="text-section-title mb-4">Spacing Tokens</h2>
        <div className="space-y-4">
          {spacingTokens.map((s) => (
            <div key={s.varName} className="flex items-center gap-4">
              <span className="text-caption font-mono w-56">{s.label}</span>
              <div
                className="bg-synapse-400/20 border border-synapse-400 flex items-center"
                style={{ padding: `var(${s.varName})` }}
              >
                <span className="text-caption whitespace-nowrap">p-{s.tokenClass}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Animations ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-section-title mb-4">Animations</h2>
        <div className="flex flex-wrap gap-4">
          {animationTokens.map((a) => (
            <div
              key={a.label}
              className="flex flex-col items-center gap-2 border border-border rounded-lg p-6 w-40"
            >
              <div className={`w-12 h-12 rounded-full ${a.bg !== '' ? a.bg : ''} ${a.cls}`} />
              <span className="text-caption font-mono text-center">{a.label}</span>
              <span className="text-caption text-axon-400 text-center">{a.description}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
