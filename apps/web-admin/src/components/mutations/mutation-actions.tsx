'use client';
/**
 * @noema/web-admin - MutationActions
 *
 * Admin action panel for a CKG mutation (approve/reject/revision/cancel).
 */
import * as React from 'react';
import {
  useApproveMutation,
  useCancelMutation,
  useRejectMutation,
  useRequestRevision,
  kgKeys,
} from '@noema/api-client';
import type { ICkgMutationDto } from '@noema/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@noema/ui';
import { Check, MessageSquare, RotateCcw, X } from 'lucide-react';
import {
  getMutationWorkflowMeta,
  isMutationCancellable,
  isMutationReadyForReview,
  isMutationTerminal,
} from '@/lib/mutation-workflow';

type ActionMode = 'idle' | 'reject' | 'revision' | 'cancel';

export function MutationActions({ mutation }: { mutation: ICkgMutationDto }): React.JSX.Element {
  const [mode, setMode] = React.useState<ActionMode>('idle');
  const [rejectNote, setRejectNote] = React.useState('');
  const [revisionFeedback, setRevisionFeedback] = React.useState('');

  const queryClient = useQueryClient();

  const approve = useApproveMutation();
  const reject = useRejectMutation();
  const requestRevision = useRequestRevision();
  const cancel = useCancelMutation();

  const id = mutation.id;
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const workflow = getMutationWorkflowMeta(mutation);
  const readyForReview = isMutationReadyForReview(mutation);
  const cancellable = isMutationCancellable(mutation);

  if (isMutationTerminal(mutation) || (!readyForReview && !cancellable)) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            No admin actions are available while this mutation is in{' '}
            <strong>{workflow.label}</strong>.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Admin Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorMsg !== null && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errorMsg}
          </p>
        )}
        {mode === 'idle' && (
          <div className="flex flex-wrap gap-2">
            {readyForReview && (
              <>
                <Button
                  onClick={() => {
                    setErrorMsg(null);
                    approve.mutate(
                      { id },
                      {
                        onSuccess: () => {
                          setMode('idle');
                          void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutation(id) });
                          void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
                        },
                        onError: (err) => {
                          setErrorMsg(err.message);
                        },
                      }
                    );
                  }}
                  disabled={approve.isPending}
                  className="gap-2"
                >
                  <Check className="h-4 w-4" /> Approve
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setMode('reject');
                  }}
                  className="gap-2"
                >
                  <X className="h-4 w-4" /> Reject
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setMode('revision');
                  }}
                  className="gap-2"
                >
                  <MessageSquare className="h-4 w-4" /> Request Revision
                </Button>
              </>
            )}
            {cancellable && (
              <Button
                variant="outline"
                onClick={() => {
                  setMode('cancel');
                }}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" /> Cancel
              </Button>
            )}
          </div>
        )}

        {mode === 'reject' && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Rejection reason (required):</p>
            <textarea
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm min-h-20 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Explain why this mutation is being rejected..."
              value={rejectNote}
              onChange={(e) => {
                setRejectNote(e.target.value);
              }}
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={rejectNote.trim() === '' || reject.isPending}
                onClick={() => {
                  setErrorMsg(null);
                  reject.mutate(
                    { id, note: rejectNote },
                    {
                      onSuccess: () => {
                        setRejectNote('');
                        setMode('idle');
                        void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutation(id) });
                        void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
                      },
                      onError: (err) => {
                        setErrorMsg(err.message);
                      },
                    }
                  );
                }}
              >
                Confirm Reject
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setMode('idle');
                  setRejectNote('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {mode === 'revision' && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Feedback for submitter:</p>
            <textarea
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm min-h-20 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="What needs to be revised?"
              value={revisionFeedback}
              onChange={(e) => {
                setRevisionFeedback(e.target.value);
              }}
            />
            <div className="flex gap-2">
              <Button
                disabled={revisionFeedback.trim() === '' || requestRevision.isPending}
                onClick={() => {
                  setErrorMsg(null);
                  requestRevision.mutate(
                    { id, feedback: revisionFeedback },
                    {
                      onSuccess: () => {
                        setRevisionFeedback('');
                        setMode('idle');
                        void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutation(id) });
                        void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
                      },
                      onError: (err) => {
                        setErrorMsg(err.message);
                      },
                    }
                  );
                }}
              >
                Send Feedback
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setMode('idle');
                  setRevisionFeedback('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {mode === 'cancel' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Cancel this mutation permanently? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={cancel.isPending}
                onClick={() => {
                  setErrorMsg(null);
                  cancel.mutate(id, {
                    onSuccess: () => {
                      setMode('idle');
                      void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutation(id) });
                      void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
                    },
                    onError: (err) => {
                      setErrorMsg(err.message);
                    },
                  });
                }}
              >
                Confirm Cancel
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setMode('idle');
                }}
              >
                Back
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
