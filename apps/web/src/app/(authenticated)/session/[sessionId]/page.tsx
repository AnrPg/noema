'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Loader2, Send, SkipForward } from 'lucide-react';
import { Button } from '@noema/ui';
import type { ISevenFrameTraceDto } from '@noema/contracts';
import { StepSelfRating, type SessionId, type StepId } from '@noema/types';
import { useAuth } from '@noema/auth';
import {
  useAnswerStep,
  useNextStep,
  usePresentStep,
  useSkipStep,
  type IStepDto,
} from '@noema/api-client/session';

import { SelfRatingControls } from '@/components/session/self-rating-controls';
import { TraceBuilder } from '@/components/session/trace-builder';
import { formatApiErrorMessage } from '@/lib/api-errors';
import { AgentActionButton } from '@/features/agents';

function getPrimaryPrompt(step: IStepDto): string {
  return step.activities?.[0]?.prompt ?? step.objective;
}

function getStepProgressLabel(completed: number, planned: number): string {
  if (planned <= 0) {
    return `${String(completed)} steps completed`;
  }

  return `${String(completed)} of ${String(planned)} steps completed`;
}

function buildSevenFrameTrace(
  step: IStepDto,
  response: string,
  selfRating: StepSelfRating,
  correct: boolean
): ISevenFrameTraceDto {
  const hasResponse = response.trim().length > 0;
  const confidenceScore =
    selfRating === StepSelfRating.KNEW_IT ? 1 : selfRating === StepSelfRating.HESITATED ? 0.5 : 0;
  const responseScore = hasResponse ? 0.7 : 0.2;
  const correctnessScore = correct ? 0.75 : 0.25;

  return {
    frames: {
      f0: {
        score: responseScore,
        notes: `Objective: ${step.objective}`,
      },
      f1: {
        score: responseScore,
        notes: `Expected outcome: ${step.expectedOutcome}`,
      },
      f2: {
        score: 0.6,
        notes: `Selected mode: ${step.selectedMode}`,
      },
      f3: {
        score: responseScore,
        notes: hasResponse ? 'Learner supplied a response.' : 'Learner submitted no response.',
      },
      f4: {
        score: responseScore,
        notes: `Transformation: ${step.transformationType}`,
      },
      f5: {
        score: confidenceScore,
        notes: `Self-rating: ${selfRating}`,
      },
      f6: {
        score: correctnessScore,
        notes: correct
          ? 'Learner reported the answer as correct.'
          : 'Learner reported the answer as incorrect.',
      },
    },
  };
}

export default function ActiveSessionPage(): React.JSX.Element {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const raw = params['sessionId'];
  const sessionId = (typeof raw === 'string' ? raw : '') as SessionId;

  const [response, setResponse] = React.useState('');
  const [selfRating, setSelfRating] = React.useState<StepSelfRating>(StepSelfRating.HESITATED);
  const [metExpectedOutcome, setMetExpectedOutcome] = React.useState(false);
  const [mutationError, setMutationError] = React.useState<string | null>(null);
  const stepStartedAtRef = React.useRef<number>(Date.now());

  const nextStepQuery = useNextStep(sessionId, {
    refetchInterval: (query) => {
      const nextStep = query.state.data?.data.nextStep;
      return nextStep?.status === 'answered' ? 1500 : false;
    },
  });
  const snapshot = nextStepQuery.data?.data ?? null;
  const currentStep = snapshot?.nextStep ?? null;
  const currentStepId = (currentStep?.id ?? '') as StepId;
  const presentStep = usePresentStep();
  const answerStep = useAnswerStep(currentStepId);
  const skipStep = useSkipStep(currentStepId);

  React.useEffect(() => {
    stepStartedAtRef.current = Date.now();
    setResponse('');
    setSelfRating(StepSelfRating.HESITATED);
    setMetExpectedOutcome(false);
    setMutationError(null);
  }, [currentStepId]);

  async function refreshSessionState(): Promise<void> {
    await nextStepQuery.refetch();
  }

  async function handlePresent(): Promise<void> {
    if (currentStep === null) {
      return;
    }

    setMutationError(null);
    try {
      await presentStep.mutateAsync(currentStep.id);
      await refreshSessionState();
    } catch (error) {
      setMutationError(
        formatApiErrorMessage(error, {
          action: 'present the next step',
          fallback: 'We could not open this step. Please try again.',
        })
      );
    }
  }

  async function handleAnswer(correct: boolean): Promise<void> {
    if (currentStep === null) {
      return;
    }

    setMutationError(null);
    const responseTimeMs = Math.max(0, Date.now() - stepStartedAtRef.current);

    try {
      await answerStep.mutateAsync({
        response: response.trim() === '' ? null : response,
        correct,
        selfRating,
        responseTimeMs,
        trace: buildSevenFrameTrace(currentStep, response, selfRating, correct),
      });
      await refreshSessionState();
    } catch (error) {
      setMutationError(
        formatApiErrorMessage(error, {
          action: 'save your answer',
          fallback: 'We could not save your answer. Please try again.',
        })
      );
    }
  }

  async function handleSkip(): Promise<void> {
    if (currentStep === null) {
      return;
    }

    setMutationError(null);
    try {
      await skipStep.mutateAsync({ reason: 'user_skipped', skippedBy: 'user' });
      await refreshSessionState();
    } catch (error) {
      setMutationError(
        formatApiErrorMessage(error, {
          action: 'skip this step',
          fallback: 'We could not skip this step. Please try again.',
        })
      );
    }
  }

  const tracePreview = React.useMemo(
    () =>
      currentStep === null
        ? null
        : buildSevenFrameTrace(currentStep, response, selfRating, metExpectedOutcome),
    [currentStep, metExpectedOutcome, response, selfRating]
  );

  if (typeof raw !== 'string' || raw === '') {
    return <div className="px-4 py-8 text-sm text-destructive">Invalid session ID.</div>;
  }

  if (nextStepQuery.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (nextStepQuery.isError) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
        <div>
          <h1 className="text-lg font-semibold text-foreground">Session unavailable</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            We could not load the current step for this session.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void refreshSessionState();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  const session = snapshot?.session ?? null;
  const stats = session?.stats;
  const agentContext = {
    userId: user?.id ?? '',
    sessionId,
    stepId: currentStep?.id ?? null,
    studyMode: session?.learningMode ?? null,
    payload: {
      surface: 'active-session',
      stepStatus: currentStep?.status ?? 'none',
      objective: currentStep?.objective ?? null,
    },
  };
  const isSubmitting = presentStep.isPending || answerStep.isPending || skipStep.isPending;
  const hasStep = currentStep !== null;
  const isAwaitingPresentation =
    currentStep?.status === 'queued' || currentStep?.status === 'planned';
  const isEvaluationPending = currentStep?.status === 'answered';

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-4xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Active Step Loop
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {session?.config.topic ?? 'Study step'}
          </h1>
          {stats !== undefined && (
            <p className="mt-1 text-sm text-muted-foreground">
              {getStepProgressLabel(stats.stepsEvaluated + stats.stepsSkipped, stats.stepsPlanned)}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          onClick={() => {
            router.push('/session/new');
          }}
        >
          Start New
        </Button>
      </header>

      {mutationError !== null && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {mutationError}
        </div>
      )}

      {!hasStep ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-4 rounded-lg border border-border bg-background px-6 py-16 text-center">
          <CheckCircle2 className="h-10 w-10 text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-xl font-semibold text-foreground">Session complete</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              There are no more planned steps in this session.
            </p>
          </div>
          <Button
            onClick={() => {
              router.push(`/session/${sessionId}/summary`);
            }}
          >
            View Summary
          </Button>
        </section>
      ) : (
        <main className="flex flex-1 flex-col gap-5">
          {isEvaluationPending && (
            <section className="rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
              We saved your answer and we are finishing its evaluation now. This view will refresh automatically when the next step is ready.
            </section>
          )}
          <section className="rounded-lg border border-border bg-background p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Step support
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ask only when the current Step needs a nudge, explanation, or local replan.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <AgentActionButton
                  agentName="mental-debugger"
                  context={agentContext}
                  label="Reasoning help"
                  size="sm"
                />
                <AgentActionButton
                  agentName="strategy-replanning-agent"
                  context={agentContext}
                  label="Replan next"
                  size="sm"
                />
              </div>
            </div>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border px-2.5 py-1">
                {currentStep.selectedMode.replace(/_/g, ' ')}
              </span>
              <span className="rounded-full border border-border px-2.5 py-1">
                {currentStep.transformationType.replace(/_/g, ' ')}
              </span>
              <span className="rounded-full border border-border px-2.5 py-1">
                difficulty {String(currentStep.difficulty)}
              </span>
            </div>
            <h2 className="text-lg font-semibold leading-7 text-foreground">
              {currentStep.objective}
            </h2>
            <p className="mt-4 whitespace-pre-wrap rounded-lg border border-border/70 bg-background/70 px-4 py-3 text-sm leading-6 text-foreground">
              {getPrimaryPrompt(currentStep)}
            </p>
            {isAwaitingPresentation && (
              <Button className="mt-4" disabled={isSubmitting} onClick={() => void handlePresent()}>
                {presentStep.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                )}
                Begin Step
              </Button>
            )}
          </section>

          {!isAwaitingPresentation && (
            <section className="rounded-lg border border-border bg-background p-5">
              <label htmlFor="step-response" className="text-sm font-medium text-foreground">
                Step response
              </label>
              <textarea
                id="step-response"
                value={response}
                rows={7}
                disabled={isSubmitting || isEvaluationPending}
                onChange={(event) => {
                  setResponse(event.target.value);
                }}
                className="mt-2 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                placeholder="Write your answer, reasoning, or notes here."
              />

              <div className="mt-4">
                <SelfRatingControls
                  value={selfRating}
                  disabled={isSubmitting || isEvaluationPending}
                  onChange={setSelfRating}
                />
              </div>

              <label className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={metExpectedOutcome}
                  disabled={isSubmitting || isEvaluationPending}
                  onChange={(event) => {
                    setMetExpectedOutcome(event.target.checked);
                  }}
                  className="h-4 w-4 rounded border-input"
                />
                I met the expected outcome
              </label>

              {tracePreview !== null && (
                <div className="mt-5">
                  <TraceBuilder
                    trace={tracePreview}
                    selfRating={selfRating}
                    expectedOutcome={currentStep.expectedOutcome}
                    metExpectedOutcome={metExpectedOutcome}
                  />
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  disabled={isSubmitting || isEvaluationPending}
                  onClick={() => {
                    void handleAnswer(metExpectedOutcome);
                  }}
                >
                  {answerStep.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  Submit Step
                </Button>
                <Button
                  variant="outline"
                  disabled={isSubmitting || isEvaluationPending}
                  onClick={() => {
                    void handleSkip();
                  }}
                >
                  <SkipForward className="mr-2 h-4 w-4" aria-hidden="true" />
                  Skip
                </Button>
              </div>
            </section>
          )}
        </main>
      )}
    </div>
  );
}
