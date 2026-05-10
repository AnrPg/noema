'use client';

import Link from 'next/link';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useCurricula } from '@noema/api-client';
import type { ICurriculum } from '@noema/api-client';
import { ArrowRight, Plus } from 'lucide-react';
import { CurriculumDag } from '@/features/curricula/curriculum-dag';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatState(value: string): string {
  if (value.length === 0) return 'Unknown';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function CurriculumRow({ curriculum }: { curriculum: ICurriculum }): React.JSX.Element {
  const router = useRouter();
  const nodeCount = curriculum.activeVersion?.nodes.length ?? 0;
  const edgeCount = curriculum.activeVersion?.edges.length ?? 0;
  const frozenNodeCount = curriculum.metadata.frozenStableNodeKeys?.length ?? 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/curricula/${curriculum.id}`}
              className="text-lg font-semibold text-foreground underline-offset-4 hover:underline"
            >
              {curriculum.title}
            </Link>
            <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {formatState(curriculum.state)}
            </span>
            <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {curriculum.originMode.replace(/_/g, ' ')}
            </span>
          </div>
          {curriculum.goal !== undefined && curriculum.goal !== '' && (
            <p className="max-w-3xl text-sm text-muted-foreground">{curriculum.goal}</p>
          )}
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-muted px-2.5 py-1">{String(nodeCount)} nodes</span>
            <span className="rounded-full bg-muted px-2.5 py-1">{String(edgeCount)} edges</span>
            <span className="rounded-full bg-muted px-2.5 py-1">
              {String(frozenNodeCount)} frozen
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1">
              Updated {formatDate(curriculum.updatedAt)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/session/new?curriculumId=${encodeURIComponent(curriculum.id)}`}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Choose
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href={`/curricula/${curriculum.id}`}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Inspect
            </Link>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Path DAG
            </p>
            <span className="text-xs text-muted-foreground">Static preview</span>
          </div>
          <CurriculumDag
            nodes={curriculum.activeVersion?.nodes ?? []}
            edges={curriculum.activeVersion?.edges ?? []}
            variant="compact"
            onNodeClick={(node) => {
              router.push(
                `/curricula/${encodeURIComponent(curriculum.id)}?nodeId=${encodeURIComponent(node.id)}`
              );
            }}
            emptyMessage="This curriculum does not have an active DAG yet."
          />
        </div>
      </div>
    </div>
  );
}

export default function CurriculaPage(): React.JSX.Element {
  const { data, isLoading, isError, error } = useCurricula();
  const curricula = data?.data ?? [];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Curriculum Vault</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Choose a learning path for the next session, inspect its structure, and freeze nodes
            that should not be rewritten by future realignments.
          </p>
        </div>
        <Link
          href="/curricula/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New curriculum
        </Link>
      </header>

      {isError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error instanceof Error ? error.message : 'Failed to load curricula.'}
        </div>
      )}

      <section className="grid gap-4">
        {isLoading ? (
          <>
            <div className="h-32 animate-pulse rounded-xl border border-border bg-card" />
            <div className="h-32 animate-pulse rounded-xl border border-border bg-card" />
            <div className="h-32 animate-pulse rounded-xl border border-border bg-card" />
          </>
        ) : curricula.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
            <h2 className="text-lg font-semibold text-foreground">
              No curricula in your vault yet
            </h2>
            <p className="max-w-xl text-sm text-muted-foreground">
              Create a curriculum from a goal first, then use it as the required path for new study
              sessions.
            </p>
            <Link
              href="/curricula/new"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Create your first curriculum
            </Link>
          </div>
        ) : (
          curricula.map((curriculum) => (
            <CurriculumRow key={curriculum.id} curriculum={curriculum} />
          ))
        )}
      </section>
    </main>
  );
}
