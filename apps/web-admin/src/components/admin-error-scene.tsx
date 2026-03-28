'use client';

import { Button, Card, CardContent } from '@noema/ui';
import { AlertTriangle, Home, RefreshCcw, Search, Shield } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';

type AdminErrorVariant = 'not-found' | 'error';

interface IAdminErrorSceneProps {
  variant: AdminErrorVariant;
  error?: Error & { digest?: string };
  onRetry?: () => void;
}

interface IAdminErrorConfig {
  code: string;
  eyebrow: string;
  title: string;
  description: string;
  detail: string;
  primaryLabel: string;
  primaryHref?: Route;
  secondaryLabel: string;
  secondaryHref: Route;
}

const ADMIN_ERROR_CONFIG: Record<AdminErrorVariant, IAdminErrorConfig> = {
  'not-found': {
    code: '404',
    eyebrow: 'Admin route missing',
    title: 'This admin page could not be found.',
    description:
      'The control surface you asked for is missing, moved, or no longer exposed in the current admin navigation.',
    detail:
      'Check the URL, return to the dashboard, or use the sidebar to reopen the section you meant to inspect.',
    primaryLabel: 'Open dashboard',
    primaryHref: '/dashboard',
    secondaryLabel: 'Go to login',
    secondaryHref: '/login',
  },
  error: {
    code: '500',
    eyebrow: 'Admin runtime interruption',
    title: 'The admin console hit an internal error.',
    description:
      'Something in the dashboard failed while rendering or loading data. The safest next step is to retry the page.',
    detail:
      'Your current admin session is still intact. If the problem keeps happening, retry once more and then capture the request details for debugging.',
    primaryLabel: 'Retry',
    secondaryLabel: 'Back to dashboard',
    secondaryHref: '/dashboard',
  },
};

export function AdminErrorScene({
  variant,
  error,
  onRetry,
}: IAdminErrorSceneProps): React.JSX.Element {
  const config = ADMIN_ERROR_CONFIG[variant];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,hsl(var(--background))_0%,hsl(var(--background))_42%,rgba(134,239,172,0.08)_100%)] text-foreground">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-10">
        <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
          <section className="space-y-6">
            <div className="inline-flex items-center gap-3 rounded-full border border-border bg-background/70 px-4 py-2 backdrop-blur">
              {variant === 'not-found' ? (
                <Search className="h-4 w-4 text-primary" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-primary" aria-hidden="true" />
              )}
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                {config.eyebrow}
              </span>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-border bg-primary/10 text-primary">
                  <Shield className="h-8 w-8" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-mono text-sm uppercase tracking-[0.3em] text-muted-foreground">
                    Noema Admin
                  </p>
                  <p className="font-mono text-4xl font-semibold tracking-[0.18em] text-primary">
                    {config.code}
                  </p>
                </div>
              </div>

              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
                {config.title}
              </h1>

              <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
                {config.description}
              </p>

              <p className="max-w-xl text-sm leading-7 text-muted-foreground">{config.detail}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              {config.primaryHref !== undefined ? (
                <Button asChild size="lg">
                  <Link href={config.primaryHref}>
                    <Home className="mr-2 h-4 w-4" aria-hidden="true" />
                    {config.primaryLabel}
                  </Link>
                </Button>
              ) : (
                <Button type="button" size="lg" onClick={onRetry}>
                  <RefreshCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                  {config.primaryLabel}
                </Button>
              )}

              <Button asChild variant="outline" size="lg">
                <Link href={config.secondaryHref}>
                  <Home className="mr-2 h-4 w-4" aria-hidden="true" />
                  {config.secondaryLabel}
                </Link>
              </Button>
            </div>
          </section>

          <section>
            <Card className="border-border/80 bg-background/80 backdrop-blur">
              <CardContent className="space-y-4 p-6">
                <div className="rounded-2xl border border-border bg-muted/30 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Status</p>
                  <p className="mt-2 text-base font-medium">
                    {variant === 'not-found'
                      ? 'Requested admin surface unavailable'
                      : 'Recovery path ready'}
                  </p>
                </div>

                <div className="grid gap-3">
                  <div className="rounded-2xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                    {variant === 'not-found'
                      ? 'Use the dashboard entry point or the sidebar to navigate back into a valid admin area.'
                      : 'Retry the page first. If the failure repeats, reproduce it once and capture the visible error context.'}
                  </div>
                  {error?.message !== undefined && variant === 'error' && (
                    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-destructive/80">
                        Error message
                      </p>
                      <p className="mt-2 break-words text-sm text-destructive">{error.message}</p>
                    </div>
                  )}
                  {error?.digest !== undefined && variant === 'error' && (
                    <div className="rounded-2xl border border-border bg-muted/20 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Digest
                      </p>
                      <p className="mt-2 font-mono text-xs text-foreground">{error.digest}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </main>
  );
}
