'use client';
/**
 * @noema/web-admin - MutationActions
 *
 * Admin action panel for a CKG mutation (approve/reject/revision/cancel).
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  type ICkgMutationDto,
  type ICkgMutationRecoveryCheckDto,
  useApproveMutation,
  useCancelMutation,
  useCheckMutationReconcile,
  useCheckMutationSafeRetry,
  useRejectMutation,
  useRequestRevision,
  useReconcileMutation,
  useRecoverRejectMutation,
  kgKeys,
} from '@noema/api-client';
import { useRetryMutation } from '@noema/api-client/knowledge-graph';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@noema/ui';
import { Check, Loader2, MessageSquare, RotateCcw, Search, ShieldAlert, Wrench, X } from 'lucide-react';
import {
  getMutationWorkflowMeta,
  getMutationWorkflowState,
  isMutationCancellable,
  isMutationReadyForReview,
  isMutationTerminal,
} from '@/lib/mutation-workflow';

type ActionMode = 'idle' | 'reject' | 'revision' | 'cancel' | 'recoverReject' | 'reconcile';

export function MutationActions({ mutation }: { mutation: ICkgMutationDto }): React.JSX.Element {
  const [mode, setMode] = React.useState<ActionMode>('idle');
  const [rejectNote, setRejectNote] = React.useState('');
  const [revisionFeedback, setRevisionFeedback] = React.useState('');
  const [diagnostic, setDiagnostic] = React.useState<ICkgMutationRecoveryCheckDto | null>(null);

  const queryClient = useQueryClient();
  const router = useRouter();

  const approve = useApproveMutation();
  const reject = useRejectMutation();
  const reconcile = useReconcileMutation();
  const recoverReject = useRecoverRejectMutation();
  const checkSafeRetry = useCheckMutationSafeRetry();
  const checkReconcile = useCheckMutationReconcile();
  const requestRevision = useRequestRevision();
  const cancel = useCancelMutation();
  const retry = useRetryMutation();

  const id = mutation.id;
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const workflow = getMutationWorkflowMeta(mutation);
  const workflowState = getMutationWorkflowState(mutation);
  const readyForReview = isMutationReadyForReview(mutation);
  const cancellable = isMutationCancellable(mutation);
  const recoverable =
    workflowState === 'validating' ||
    workflowState === 'validated' ||
    workflowState === 'proving' ||
    workflowState === 'proven' ||
    workflowState === 'committing';
  const canRunRecoveryChecks = recoverable || workflowState === 'rejected';

  if (isMutationTerminal(mutation) && !canRunRecoveryChecks) {
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

  if (!readyForReview && !cancellable && !recoverable && !canRunRecoveryChecks) {
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
          <div className="space-y-4">
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
              {recoverable && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setMode('recoverReject');
                    }}
                    className="gap-2"
                  >
                    <ShieldAlert className="h-4 w-4" /> Reject As Stuck
                  </Button>
                  {workflowState === 'committing' && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setMode('reconcile');
                      }}
                      className="gap-2"
                    >
                      <Wrench className="h-4 w-4" /> Reconcile Commit
                    </Button>
                  )}
                </>
              )}
              {workflowState === 'rejected' && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setErrorMsg(null);
                    retry.mutate(id, {
                      onSuccess: (response) => {
                        const retriedMutationId = response.data.id;
                        if (retriedMutationId === undefined || retriedMutationId === null) {
                          setErrorMsg('Retry succeeded but the new mutation id was missing from the response.');
                          return;
                        }
                        void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutation(id) });
                        void queryClient.invalidateQueries({
                          queryKey: kgKeys.ckgMutation(retriedMutationId),
                        });
                        void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
                        router.push(`/dashboard/ckg/mutations/${String(retriedMutationId)}`);
                      },
                      onError: (err: Error) => {
                        setErrorMsg(err.message);
                      },
                    });
                  }}
                  disabled={retry.isPending}
                  className="gap-2"
                >
                  <RotateCcw className="h-4 w-4" /> Retry
                </Button>
              )}
            </div>

            {canRunRecoveryChecks && (
              <div className="rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Operator Diagnostics
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={checkSafeRetry.isPending}
                    onClick={() => {
                      setErrorMsg(null);
                      checkSafeRetry.mutate(
                        { id },
                        {
                          onSuccess: (response: { data: ICkgMutationRecoveryCheckDto }) => {
                            setDiagnostic(response.data);
                          },
                          onError: (err: Error) => {
                            setErrorMsg(err.message);
                          },
                        }
                      );
                    }}
                    className="h-8 gap-1 px-2 text-xs text-muted-foreground"
                  >
                    {checkSafeRetry.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Search className="h-3.5 w-3.5" />
                    )}
                    Check Safe Retry
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={checkReconcile.isPending}
                    onClick={() => {
                      setErrorMsg(null);
                      checkReconcile.mutate(
                        { id },
                        {
                          onSuccess: (response: { data: ICkgMutationRecoveryCheckDto }) => {
                            setDiagnostic(response.data);
                          },
                          onError: (err: Error) => {
                            setErrorMsg(err.message);
                          },
                        }
                      );
                    }}
                    className="h-8 gap-1 px-2 text-xs text-muted-foreground"
                  >
                    {checkReconcile.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Search className="h-3.5 w-3.5" />
                    )}
                    Check Reconcile
                  </Button>
                </div>

                {diagnostic !== null && (
                  <div className="mt-3 space-y-2 text-sm">
                    <p className="font-medium">
                      {getDiagnosticHeadline(diagnostic, workflowState)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {getDiagnosticSubtext(diagnostic, workflowState)}
                    </p>
                    {getDiagnosticEvidence(diagnostic) !== null && (
                      <p className="text-xs text-muted-foreground">
                        {getDiagnosticEvidence(diagnostic)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {mode === 'reject' && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Rejection reason (required):</p>
            <textarea
              name="rejectNote"
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
              name="revisionFeedback"
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

        {mode === 'recoverReject' && (
          <RecoveryActionForm
            title="Reject stuck mutation"
            description="Use this when the mutation is stuck and the graph write did not land. The mutation will move to rejected so it can be retried safely."
            submitLabel="Reject As Stuck"
            pending={recoverReject.isPending}
            onSubmit={(note) => {
              setErrorMsg(null);
              recoverReject.mutate(
                { id, note },
                {
                  onSuccess: () => {
                    setMode('idle');
                    void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutation(id) });
                    void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
                  },
                  onError: (err: Error) => {
                    setErrorMsg(err.message);
                  },
                }
              );
            }}
            onCancel={() => {
              setMode('idle');
            }}
          />
        )}

        {mode === 'reconcile' && (
          <RecoveryActionForm
            title="Reconcile stuck commit"
            description="Use this only after you verify that the graph write already landed and Postgres state is the only thing stuck."
            submitLabel="Reconcile Commit"
            pending={reconcile.isPending}
            onSubmit={(note) => {
              setErrorMsg(null);
              reconcile.mutate(
                { id, note },
                {
                  onSuccess: () => {
                    setMode('idle');
                    void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutation(id) });
                    void queryClient.invalidateQueries({ queryKey: kgKeys.ckgMutations() });
                  },
                  onError: (err: Error) => {
                    setErrorMsg(err.message);
                  },
                }
              );
            }}
            onCancel={() => {
              setMode('idle');
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

function formatRecommendedAction(
  action: ICkgMutationRecoveryCheckDto['recommendedAction']
): string {
  switch (action) {
    case 'recover_reject':
      return 'Reject As Stuck';
    case 'reconcile_commit':
      return 'Reconcile Commit';
    case 'wait':
      return 'Wait and re-check';
    default:
      return 'No recovery action recommended';
  }
}

function getDiagnosticHeadline(
  diagnostic: ICkgMutationRecoveryCheckDto,
  workflowState: string
): string {
  if (workflowState === 'rejected' && diagnostic.check === 'safe_retry') {
    return 'No canonical graph write was found. Use Retry to resubmit this mutation.';
  }

  if (workflowState === 'rejected' && diagnostic.check === 'reconcile_commit') {
    return 'Reconcile Commit is only available while a mutation is still committing.';
  }

  return diagnostic.summary;
}

function getDiagnosticSubtext(
  diagnostic: ICkgMutationRecoveryCheckDto,
  workflowState: string
): string {
  if (workflowState === 'rejected') {
    return 'This mutation is already closed, so the next valid action is Retry.';
  }

  return `Recommended action: ${formatRecommendedAction(diagnostic.recommendedAction)}.`;
}

function getDiagnosticEvidence(diagnostic: ICkgMutationRecoveryCheckDto): string | null {
  if (diagnostic.graphEvidence.matchedNodeIds.length > 0) {
    return `Matched nodes: ${diagnostic.graphEvidence.matchedNodeIds.join(', ')}.`;
  }

  if (diagnostic.graphEvidence.matchedEdgeIds.length > 0) {
    return `Matched edges: ${diagnostic.graphEvidence.matchedEdgeIds.join(', ')}.`;
  }

  return 'No canonical node or edge matches were found for this payload.';
}

function RecoveryActionForm({
  title,
  description,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  title: string;
  description: string;
  submitLabel: string;
  pending: boolean;
  onSubmit: (note: string) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [note, setNote] = React.useState('');

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
      <textarea
        name="recoveryNote"
        className="w-full rounded-md border bg-transparent px-3 py-2 text-sm min-h-20 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        placeholder="Explain what you verified and why this recovery action is safe..."
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
        }}
      />
      <div className="flex gap-2">
        <Button
          variant="destructive"
          disabled={note.trim() === '' || pending}
          onClick={() => {
            onSubmit(note);
          }}
        >
          {submitLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setNote('');
            onCancel();
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
