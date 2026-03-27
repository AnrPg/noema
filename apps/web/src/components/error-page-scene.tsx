'use client';

import { Button, Card, CardContent, cn } from '@noema/ui';
import { AlertTriangle, Brain, Home, RefreshCcw, Search, Sparkles } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { ErrorRecoveryPanel } from '@/components/error-recovery-panel';

type SceneVariant = 'not-found' | 'error';

interface IErrorPageSceneProps {
  variant: SceneVariant;
  error?: Error & { digest?: string };
  onRetry?: () => void;
}

interface IStatusBadge {
  label: string;
  value: string;
  className: string;
}

interface ISceneConfig {
  code: string;
  eyebrow: string;
  title: string;
  description: string;
  detail: string;
  primaryLabel: string;
  primaryHref?: Route;
  secondaryLabel: string;
  secondaryHref: Route;
  signals: string[];
  badges: IStatusBadge[];
  diagnostics: string[];
  accentClassName: string;
}

const SCENE_CONFIG: Record<SceneVariant, ISceneConfig> = {
  'not-found': {
    code: '404',
    eyebrow: 'Retrieval mismatch detected',
    title: 'This pathway never made it into long-term memory.',
    description:
      'We sent a retrieval cue through the Noema graph and it came back carrying a blank flashcard and several strong opinions.',
    detail:
      'The page may have moved, been renamed, or existed only in a remarkably confident neuron.',
    primaryLabel: 'Back to knowledge map',
    primaryHref: '/knowledge',
    secondaryLabel: 'Return home',
    secondaryHref: '/',
    signals: ['missing synapse', 'route drift', 'speculative memory'],
    badges: [
      { label: 'Signal integrity', value: '72%', className: 'text-synapse-100' },
      { label: 'Hippocampus note', value: 'Page never indexed', className: 'text-dendrite-100' },
      { label: 'Mood', value: 'Confused but curious', className: 'text-myelin-100' },
    ],
    diagnostics: [
      'The address resolved to a very persuasive shrug.',
      'Search party checked the semantic attic and found only dust.',
      'Autocorrect suggested a page about confidence calibration instead.',
    ],
    accentClassName: 'from-synapse-400/30 via-dendrite-400/20 to-myelin-400/15',
  },
  error: {
    code: '500',
    eyebrow: 'Cortical overload containment',
    title: 'The cortex dropped a stack of thoughts.',
    description:
      'Something inside Noema had a dramatic runtime moment. We are calming the neurons, collecting the fragments, and pretending this was part of an experiment.',
    detail:
      'Your data is probably fine. The execution path just tried to sprint through a wall and is now reconsidering its life choices.',
    primaryLabel: 'Recalibrate',
    secondaryLabel: 'Go to dashboard',
    secondaryHref: '/dashboard',
    signals: ['containment active', 'runtime wobble', 'recovery in progress'],
    badges: [
      { label: 'Stability', value: 'Recovering', className: 'text-cortex-100' },
      {
        label: 'Primary suspect',
        value: 'Overenthusiastic code path',
        className: 'text-synapse-100',
      },
      { label: 'Team response', value: 'Retry available', className: 'text-neuron-100' },
    ],
    diagnostics: [
      'The exception was politely invited to leave and instead brought friends.',
      'Stack trace has been translated into interpretive neuroscience.',
      'Meanwhile, the interface is keeping the panic volume intentionally low.',
    ],
    accentClassName: 'from-cortex-400/30 via-synapse-400/15 to-dendrite-400/20',
  },
};

export function ErrorPageScene({
  variant,
  error: _error,
  onRetry,
}: IErrorPageSceneProps): React.JSX.Element {
  const config = SCENE_CONFIG[variant];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,hsl(var(--synapse-900))_0%,hsl(var(--background))_38%,hsl(var(--axon-900))_100%)] text-foreground">
      <div className="error-neural-grid absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="error-neural-noise absolute inset-0 opacity-40" aria-hidden="true" />
      <div
        className="error-orb absolute -left-24 top-[-6rem] h-80 w-80 rounded-full bg-[radial-gradient(circle,hsl(var(--synapse-400)/0.32),transparent_65%)] blur-3xl"
        style={{ animationDuration: '20s' }}
        aria-hidden="true"
      />
      <div
        className="error-orb-reverse absolute right-[-8rem] top-1/4 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,hsl(var(--dendrite-400)/0.18),transparent_68%)] blur-3xl"
        style={{ animationDuration: '24s' }}
        aria-hidden="true"
      />
      <div
        className={cn(
          'absolute bottom-[-10rem] left-1/3 h-[26rem] w-[26rem] rounded-full bg-gradient-to-br blur-3xl',
          config.accentClassName
        )}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl items-center px-6 py-10 sm:px-10">
        <div className="grid w-full items-center gap-10 lg:grid-cols-[minmax(0,1.02fr)_minmax(420px,0.98fr)]">
          <section className="space-y-7">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-md">
              {variant === 'not-found' ? (
                <Search className="h-4 w-4 text-synapse-200" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-cortex-200" aria-hidden="true" />
              )}
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-axon-100/80">
                {config.eyebrow}
              </span>
            </div>

            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-white/5 shadow-[0_0_40px_hsl(var(--synapse-400)/0.15)] backdrop-blur-md">
                  <Brain className="h-8 w-8 text-synapse-100" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <p className="font-mono text-sm uppercase tracking-[0.32em] text-synapse-100/70">
                    Neural incident
                  </p>
                  <p className="font-mono text-4xl font-semibold tracking-[0.2em] text-synapse-100">
                    {config.code}
                  </p>
                </div>
              </div>

              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl xl:text-6xl">
                {config.title}
              </h1>

              <p className="max-w-2xl text-lg leading-relaxed text-axon-100/88 sm:text-xl">
                {config.description}
              </p>

              <p className="max-w-xl text-sm leading-7 text-axon-200/78 sm:text-base">
                {config.detail}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {config.primaryHref !== undefined ? (
                <Button
                  asChild
                  size="lg"
                  className="rounded-2xl px-6 shadow-[0_0_24px_hsl(var(--synapse-400)/0.25)]"
                >
                  <Link href={config.primaryHref}>
                    {variant === 'not-found' ? (
                      <Search className="mr-2 h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    {config.primaryLabel}
                  </Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  size="lg"
                  className="rounded-2xl px-6 shadow-[0_0_24px_hsl(var(--synapse-400)/0.25)]"
                  onClick={onRetry}
                >
                  <RefreshCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                  {config.primaryLabel}
                </Button>
              )}

              <Button
                asChild
                variant="outline"
                size="lg"
                className="rounded-2xl border-white/15 bg-white/5 px-6 backdrop-blur-md hover:bg-white/10"
              >
                <Link href={config.secondaryHref}>
                  <Home className="mr-2 h-4 w-4" aria-hidden="true" />
                  {config.secondaryLabel}
                </Link>
              </Button>
            </div>

            <div className="flex flex-wrap gap-3">
              {config.signals.map((signal) => (
                <span
                  key={signal}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-axon-100/78 backdrop-blur-md"
                >
                  {signal}
                </span>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {config.badges.map((badge) => (
                <Card
                  key={badge.label}
                  className="border-white/10 bg-white/5 shadow-[0_20px_50px_rgba(3,6,18,0.32)] backdrop-blur-xl"
                >
                  <CardContent className="space-y-1 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-axon-100/65">
                      {badge.label}
                    </p>
                    <p className={cn('text-sm font-medium', badge.className)}>{badge.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {config.diagnostics.map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-axon-100/78"
                >
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section className="relative">
            <ErrorRecoveryPanel {...(onRetry !== undefined ? { onRetry } : {})} />
          </section>
        </div>
      </div>
    </main>
  );
}
