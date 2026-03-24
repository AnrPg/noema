'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  useCancelOntologyImportRun,
  useOntologyImportRun,
  useRetryOntologyImportRun,
  useStartOntologyImportRun,
  useSubmitOntologyImportRunPreview,
} from '@noema/api-client';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@noema/ui';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { OntologyImportRunStatusPanel } from '@/components/ckg/ontology-imports/run-status-panel';
import { getOntologyImportPlaceholderRunDetail } from '@/components/ckg/ontology-imports/placeholder-data';

interface IRunDetailPageProps {
  params: {
    id: string;
  };
}

type MessageState = { type: 'success'; text: string } | { type: 'error'; text: string } | null;

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message !== '') {
    return error.message;
  }
  return fallback;
}

export default function OntologyImportRunDetailPage({
  params,
}: IRunDetailPageProps): React.JSX.Element {
  const [message, setMessage] = useState<MessageState>(null);
  const {
    data: liveDetail,
    isLoading,
    isError,
    refetch,
  } = useOntologyImportRun(params.id, {
    retry: false,
  });

  const fallbackDetail = useMemo(
    () => getOntologyImportPlaceholderRunDetail(params.id),
    [params.id]
  );
  const detail = liveDetail ?? fallbackDetail;
  const usingFallback = liveDetail === undefined && fallbackDetail !== null;

  const startRun = useStartOntologyImportRun({
    onSuccess: async () => {
      setMessage({ type: 'success', text: 'Import run moved into fetching.' });
      await refetch();
    },
    onError: (error) => {
      setMessage({
        type: 'error',
        text: errorMessage(error, 'We could not start this import run yet.'),
      });
    },
  });

  const cancelRun = useCancelOntologyImportRun({
    onSuccess: async () => {
      setMessage({ type: 'success', text: 'Import run cancelled.' });
      await refetch();
    },
    onError: (error) => {
      setMessage({
        type: 'error',
        text: errorMessage(error, 'We could not cancel this import run yet.'),
      });
    },
  });

  const retryRun = useRetryOntologyImportRun({
    onSuccess: async () => {
      setMessage({ type: 'success', text: 'Import run requeued.' });
      await refetch();
    },
    onError: (error) => {
      setMessage({
        type: 'error',
        text: errorMessage(error, 'We could not retry this import run yet.'),
      });
    },
  });
  const submitPreview = useSubmitOntologyImportRunPreview({
    onSuccess: async (response) => {
      const submittedCount = response.data.submittedCount;
      setMessage({
        type: 'success',
        text:
          `Submitted ${String(submittedCount)} mutation proposal${submittedCount === 1 ? '' : 's'} into the CKG review queue. ` +
          'Run detail now tracks the exact mutation ids for reviewer follow-up.',
      });
      await refetch();
    },
    onError: (error) => {
      setMessage({
        type: 'error',
        text: errorMessage(error, 'We could not submit this mutation preview yet.'),
      });
    },
  });

  if (detail === null) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Import run not found</h1>
          <p className="mt-1 text-muted-foreground">
            The route is ready, but this run does not exist in either the live registry or the
            seeded fallback catalog yet.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>What to do next</CardTitle>
            <CardDescription>
              Return to the imports workspace and open one of the visible pilot or live runs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard/ckg/imports">Back to ontology imports</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canStart = detail.run.status === 'queued' || detail.run.status === 'failed';
  const canCancel = detail.run.status === 'queued' || detail.run.status === 'fetching';
  const canRetry = detail.run.status === 'failed' || detail.run.status === 'cancelled';
  const canSubmitPreview =
    detail.run.status === 'ready_for_normalization' &&
    (detail.mutationPreview?.readyProposalCount ?? 0) > 0;
  const canReviewSubmittedMutations = detail.run.submittedMutationIds.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Ontology import run</h1>
          <p className="mt-1 text-muted-foreground">
            Inspect fetch, parse, normalization, and mutation-preview checkpoints, then submit the
            ready proposals into the CKG review queue when the run is ready.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!canSubmitPreview || submitPreview.isPending}
            onClick={() => {
              submitPreview.mutate(params.id);
            }}
          >
            {submitPreview.isPending ? 'Submitting…' : 'Submit preview'}
          </Button>
          {canReviewSubmittedMutations ? (
            <Button asChild variant="outline">
              <Link href={`/dashboard/ckg/mutations?importRunId=${encodeURIComponent(params.id)}`}>
                Review submitted mutations
              </Link>
            </Button>
          ) : (
            <Button variant="outline" disabled>
              Review submitted mutations
            </Button>
          )}
          <Button
            variant="outline"
            disabled={!canRetry || retryRun.isPending}
            onClick={() => {
              retryRun.mutate(params.id);
            }}
          >
            {retryRun.isPending ? 'Retrying…' : 'Retry run'}
          </Button>
          <Button
            variant="outline"
            disabled={!canCancel || cancelRun.isPending}
            onClick={() => {
              cancelRun.mutate({ runId: params.id, reason: 'Cancelled from admin UI' });
            }}
          >
            {cancelRun.isPending ? 'Cancelling…' : 'Cancel run'}
          </Button>
          <Button
            disabled={!canStart || startRun.isPending}
            onClick={() => {
              startRun.mutate(params.id);
            }}
          >
            {startRun.isPending ? 'Starting…' : 'Start run'}
          </Button>
          <Button asChild variant="ghost">
            <Link href="/dashboard/ckg/imports">Back to imports</Link>
          </Button>
        </div>
      </div>

      {usingFallback && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Live run detail is not available yet, so this screen is showing the seeded fallback
            payload instead of a blank page.
          </AlertDescription>
        </Alert>
      )}

      {message !== null && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'success'}>
          {message.type === 'error' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {isError && !usingFallback && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            We could not load this ontology import run right now. Please try again in a moment.
          </AlertDescription>
        </Alert>
      )}

      {isLoading && !usingFallback ? (
        <Card>
          <CardHeader>
            <CardTitle>Loading import run…</CardTitle>
            <CardDescription>
              Pulling the latest orchestration state from the knowledge graph service.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <OntologyImportRunStatusPanel detail={detail} />
      )}
    </div>
  );
}
