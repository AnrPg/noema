'use client';

/**
 * @noema/web - Session Start Page
 *
 * /session/new — configure and launch a new study session.
 * Three sections: mode selection, concept source, and session settings.
 */

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2, Play } from 'lucide-react';
import { useAuth } from '@noema/auth';
import {
  agentsApi,
  http,
  useCards,
  useCard,
  useCurriculum,
  useCurriculumFrontier,
  useCurricula,
  useDueConcepts,
  useStartSession,
  sessionsApi,
} from '@noema/api-client';
import type { IDeckQueryInput, ICurriculum } from '@noema/api-client';
import type {
  CardId,
  CurriculumId,
  CurriculumNodeId,
  DifficultyLevel,
  EpistemicMode,
  StudyMode,
  TransformationType,
} from '@noema/types';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@noema/ui';

import { ModeSelector } from '@/components/session/mode-selector';
import type { SessionLearningMode } from '@/components/session/mode-selector';
import { LaneMixSlider } from '@/components/session/lane-mix-slider';
import { CardRenderer } from '@/components/card-renderers';
import { DeckQueryFilter } from '@/components/deck-query-filter';
import { formatApiErrorMessage } from '@/lib/api-errors';
import { useActiveStudyMode } from '@/hooks/use-active-study-mode';
import {
  deriveSessionCardSides,
  getDefaultPromptSide,
  type SessionRevealMode,
} from '@/lib/session-card-sides';
import { CurriculumDag } from '@/features/curricula/curriculum-dag';

const SESSION_CANDIDATE_QUERY_LIMIT = 100;
const SESSION_SIZE_MIN = 5;
const SESSION_SIZE_MAX = 100;
const DEFAULT_GENERATED_CARD_COUNT = 4;
type CurriculumNode = NonNullable<ICurriculum['activeVersion']>['nodes'][number];
interface ImportGeneratedContentBatchInput {
  job: Record<string, unknown>;
  cards: Array<Record<string, unknown>>;
  activityVariants?: Array<Record<string, unknown>>;
  rejectedDrafts?: Array<Record<string, unknown>>;
  agentRunId?: string | null;
  resultPayload?: Record<string, unknown>;
}
const ACTIVITY_TYPE_OPTIONS: ReadonlyArray<{
  value: TransformationType;
  label: string;
  description: string;
}> = [
  {
    value: 'recall',
    label: 'Recall',
    description: 'Direct retrieval practice for the chosen frontier node.',
  },
  {
    value: 'explanation',
    label: 'Explanation',
    description: 'Ask the learner to explain the idea in their own words.',
  },
  {
    value: 'comparison',
    label: 'Comparison',
    description: 'Contrast the node against nearby or confusable ideas.',
  },
  {
    value: 'application',
    label: 'Application',
    description: 'Apply the idea in a concrete scenario or transfer context.',
  },
];

function supportsStudyMode(
  card: { supportedStudyModes?: string[] | undefined },
  activeStudyMode: string
): boolean {
  const supportedStudyModes = card.supportedStudyModes;
  return (
    supportedStudyModes === undefined ||
    supportedStudyModes.length === 0 ||
    supportedStudyModes.includes(activeStudyMode)
  );
}

// ============================================================================
// SessionNewPage
// ============================================================================

export default function SessionNewPage(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isInitialized } = useAuth();
  const activeStudyMode = useActiveStudyMode();
  const isReadyForAuthenticatedQueries = isInitialized && isAuthenticated && user?.id !== undefined;

  // ── Section 1: Mode ──────────────────────────────────────────────────────
  const [mode, setMode] = React.useState<SessionLearningMode>('exploration');

  // ── Section 2: Concept source ────────────────────────────────────────────
  const [useQuickStart, setUseQuickStart] = React.useState(true);
  const [customQuery, setCustomQuery] = React.useState<IDeckQueryInput>({});
  const [showCandidates, setShowCandidates] = React.useState(false);
  const [selectedCurriculumId, setSelectedCurriculumId] = React.useState<CurriculumId | ''>('');
  const [selectedFrontierNodeId, setSelectedFrontierNodeId] = React.useState<CurriculumNodeId | ''>(
    ''
  );
  const [autoGenerateMissingPractice, setAutoGenerateMissingPractice] = React.useState(true);
  const [generatedCardCount, setGeneratedCardCount] = React.useState(DEFAULT_GENERATED_CARD_COUNT);
  const [desiredActivityTypes, setDesiredActivityTypes] = React.useState<TransformationType[]>([
    'explanation',
    'application',
  ]);

  // ── Section 3: Settings ──────────────────────────────────────────────────
  const [retentionPct, setRetentionPct] = React.useState(80);
  const [sessionSize, setSessionSize] = React.useState(20);
  const [sessionSizeInput, setSessionSizeInput] = React.useState('20');
  const [startError, setStartError] = React.useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = React.useState(0);
  const [presentationPromptSide, setPresentationPromptSide] = React.useState('');
  const [presentationRevealMode, setPresentationRevealMode] =
    React.useState<SessionRevealMode>('all_at_once');

  // ── API hooks ────────────────────────────────────────────────────────────
  const dueConcepts = useDueConcepts(
    { limit: sessionSize, studyMode: activeStudyMode },
    { enabled: useQuickStart && isReadyForAuthenticatedQueries }
  );
  const sessionCandidates = useCards(
    { ...customQuery, limit: Math.max(sessionSize, SESSION_CANDIDATE_QUERY_LIMIT) },
    { enabled: !useQuickStart && showCandidates && isReadyForAuthenticatedQueries }
  );
  const curricula = useCurricula();
  const selectedCurriculum = useCurriculum(selectedCurriculumId as CurriculumId);
  const selectedCurriculumFrontier = useCurriculumFrontier(selectedCurriculumId as CurriculumId);

  const startSession = useStartSession();

  // ── Derived values ───────────────────────────────────────────────────────
  const dueConceptList = dueConcepts.data?.data.concepts ?? [];
  const curriculumItems = curricula.data?.data ?? [];
  const selectedCurriculumData = selectedCurriculum.data?.data;
  const frontierNodes = (selectedCurriculumFrontier.data?.data ?? []) as CurriculumNode[];
  const selectedFrontierNode =
    selectedFrontierNodeId === ''
      ? undefined
      : (frontierNodes.find((node) => node.id === selectedFrontierNodeId) ??
        selectedCurriculumData?.activeVersion?.nodes.find(
          (node) => node.id === selectedFrontierNodeId
        ));
  const selectedConceptId = selectedFrontierNode?.ckgConceptId;
  const retentionCount = dueConceptList.filter((concept) => concept.algorithm === 'fsrs').length;
  const calibrationCount = dueConceptList.filter((concept) => concept.algorithm === 'hlr').length;
  const compatibleCandidateItems = React.useMemo(
    () =>
      (sessionCandidates.data?.data.items ?? []).filter((candidate) =>
        supportsStudyMode(candidate, activeStudyMode)
      ),
    [activeStudyMode, sessionCandidates.data]
  );
  const previewCandidateIds = React.useMemo(
    () => compatibleCandidateItems.map((candidate) => candidate.id),
    [compatibleCandidateItems]
  );
  const previewCandidateId =
    previewCandidateIds.length > 0
      ? previewCandidateIds[Math.min(previewIndex, previewCandidateIds.length - 1)]
      : undefined;
  const previewCardId = useQuickStart ? undefined : previewCandidateId;
  const { data: previewCard, isLoading: previewCardLoading } = useCard(
    (previewCardId ?? '') as CardId,
    { enabled: isReadyForAuthenticatedQueries && previewCardId !== undefined }
  );
  const presentationSideOptions = React.useMemo(
    () =>
      previewCard !== undefined
        ? deriveSessionCardSides(previewCard).filter((side) => side.key !== 'hint')
        : [],
    [previewCard]
  );
  const derivedAnswerSide = React.useMemo(() => {
    const remaining = presentationSideOptions.filter((side) => side.key !== presentationPromptSide);
    return remaining[0]?.key;
  }, [presentationPromptSide, presentationSideOptions]);

  React.useEffect(() => {
    const requestedCurriculumId = searchParams.get('curriculumId');
    const requestedNodeId = searchParams.get('nodeId');
    if (requestedCurriculumId !== null && requestedCurriculumId !== '') {
      setSelectedCurriculumId(requestedCurriculumId as CurriculumId);
    }
    if (requestedNodeId !== null && requestedNodeId !== '') {
      setSelectedFrontierNodeId(requestedNodeId as CurriculumNodeId);
    }
  }, [searchParams]);

  React.useEffect(() => {
    if (selectedCurriculumId === '') {
      setSelectedFrontierNodeId('');
      return;
    }

    const frontierContainsSelected = frontierNodes.some(
      (node) => node.id === selectedFrontierNodeId
    );
    if (selectedFrontierNodeId !== '' && frontierContainsSelected) {
      return;
    }

    setSelectedFrontierNodeId('');
  }, [frontierNodes, selectedCurriculumId, selectedFrontierNodeId]);

  React.useEffect(() => {
    setPreviewIndex(0);
  }, [showCandidates, customQuery, sessionSize]);

  React.useEffect(() => {
    setSessionSizeInput(String(sessionSize));
  }, [sessionSize]);

  React.useEffect(() => {
    if (presentationSideOptions.length === 0) {
      setPresentationPromptSide('');
      return;
    }

    if (!presentationSideOptions.some((side) => side.key === presentationPromptSide)) {
      setPresentationPromptSide(getDefaultPromptSide(presentationSideOptions) ?? '');
    }
  }, [presentationPromptSide, presentationSideOptions]);

  const commitSessionSizeInput = React.useCallback((): number => {
    const trimmed = sessionSizeInput.trim();
    if (trimmed === '') {
      setSessionSizeInput(String(sessionSize));
      return sessionSize;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setSessionSizeInput(String(sessionSize));
      return sessionSize;
    }

    const clamped = clampSessionSize(parsed);
    setSessionSize(clamped);
    setSessionSizeInput(String(clamped));
    return clamped;
  }, [sessionSize, sessionSizeInput]);

  const adjustSessionSize = React.useCallback(
    (delta: number): void => {
      const rawValue = sessionSizeInput.trim() === '' ? sessionSize : Number(sessionSizeInput);
      const baseline = Number.isFinite(rawValue) ? rawValue : sessionSize;
      const nextValue = clampSessionSize(baseline + delta);
      setSessionSize(nextValue);
      setSessionSizeInput(String(nextValue));
    },
    [sessionSize, sessionSizeInput]
  );

  // ── Start handler ────────────────────────────────────────────────────────
  async function handleStart(): Promise<void> {
    setStartError(null);
    const resolvedSessionSize = commitSessionSizeInput();
    let customBuildHasCandidates = false;
    if (selectedCurriculumId === '') {
      setStartError(
        'Choose a curriculum before starting. Normal sessions are now bound to a curriculum path.'
      );
      return;
    }
    if (selectedFrontierNodeId === '') {
      setStartError(
        'Choose the exact frontier node you want to work on before starting this session.'
      );
      return;
    }
    if (useQuickStart) {
      const dueConceptResponse = dueConcepts.data?.data ?? (await dueConcepts.refetch()).data?.data;

      if (dueConceptResponse === undefined) {
        setStartError(
          'We could not load your due concepts yet, so we do not know which steps are safe to start. Please refresh or wait a moment and try again.'
        );
        return;
      }

      if (dueConceptResponse.concepts.length === 0) {
        setStartError(
          'Quick Start is empty right now. You are caught up on due concepts, so try Custom Build or come back when more steps are due.'
        );
        return;
      }
    } else {
      const candidateResponse = sessionCandidates.data ?? (await sessionCandidates.refetch()).data;
      const candidateItems = (candidateResponse?.data.items ?? []).filter((candidate) =>
        supportsStudyMode(candidate, activeStudyMode)
      );
      customBuildHasCandidates = candidateItems.length > 0;

      if (candidateItems.length === 0) {
        if (!autoGenerateMissingPractice) {
          setStartError(
            'This custom build has no matching concept payloads yet. Adjust the filters, or turn on automatic generation for missing practice.'
          );
          return;
        }
        if (selectedConceptId === undefined || selectedConceptId === '') {
          setStartError(
            'This frontier node is not anchored to a canonical concept yet, so Noema cannot auto-generate practice for it.'
          );
          return;
        }
      }

      const selectedCandidates = candidateItems.slice(0, resolvedSessionSize);
      if (selectedCandidates.length === 0) {
        if (!autoGenerateMissingPractice) {
          setStartError(
            'This custom build has no matching concept payloads yet. Adjust the filters, or turn on automatic generation for missing practice.'
          );
          return;
        }
        if (selectedConceptId === undefined || selectedConceptId === '') {
          setStartError(
            'This frontier node is not anchored to a canonical concept yet, so Noema cannot auto-generate practice for it.'
          );
          return;
        }
      }
    }
    if (selectedConceptId === undefined || selectedConceptId === '') {
      setStartError(
        'The selected frontier node is missing its concept anchor, so Noema cannot build a valid lesson plan for it yet.'
      );
      return;
    }

    try {
      const response = await startSession.mutateAsync({
        curriculumId: selectedCurriculumId,
        ...(selectedCurriculumData?.activeVersion?.id !== undefined
          ? { curriculumVersionId: selectedCurriculumData.activeVersion.id }
          : {}),
        learningMode: mode,
        studyMode: activeStudyMode,
        config: {
          maxSteps: resolvedSessionSize,
          sessionTimeoutHours: 24,
          ...(customQuery.cardTypes !== undefined ? { cardTypes: customQuery.cardTypes } : {}),
          ...(presentationPromptSide !== ''
            ? {
                presentation: {
                  promptSide: presentationPromptSide,
                  revealMode: presentationRevealMode,
                  ...(derivedAnswerSide !== undefined ? { answerSide: derivedAnswerSide } : {}),
                },
              }
            : {}),
        },
        ...(customQuery.sources !== undefined ? { sourceDecks: customQuery.sources } : {}),
        ...(customQuery.tags !== undefined ? { sourceCategories: customQuery.tags } : {}),
      });

      const sessionId = response.data.id;

      const shouldGenerateMissingPractice =
        !useQuickStart &&
        autoGenerateMissingPractice &&
        selectedConceptId !== undefined &&
        !customBuildHasCandidates;

      if (shouldGenerateMissingPractice) {
        await generateMissingPractice({
          userId: user?.id ?? '',
          curriculumId: selectedCurriculumId,
          sessionId,
          conceptId: selectedConceptId,
          selectedNodeId: selectedFrontierNodeId,
          studyMode: activeStudyMode,
          desiredCardTypes: customQuery.cardTypes ?? [],
          desiredActivityTypes,
          generatedCardCount,
        });
      }

      await sessionsApi.createLessonPlan(sessionId, {
        curriculumId: selectedCurriculumId,
        ...(selectedCurriculumData?.activeVersion?.id !== undefined
          ? { curriculumVersionId: selectedCurriculumData.activeVersion.id }
          : {}),
        selectedNodeIds: [selectedFrontierNodeId],
        rigorLevel: mode === 'goal_driven' ? 'full' : 'minimal',
        topic:
          selectedFrontierNode?.label ??
          customQuery.search ??
          response.data.config.topic ??
          'Curriculum session',
        steps: [
          {
            objective: `Work through the selected frontier node: ${selectedFrontierNode?.label ?? 'curriculum target'}`,
            expectedOutcome:
              'Learner can explain and apply the selected frontier concept with traceable reasoning.',
            conceptRefs: [selectedConceptId],
          },
        ],
      });
      router.push(`/session/${sessionId}`);
    } catch (err) {
      setStartError(formatStartSessionError(err));
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Start a Session</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure the Step loop and begin learning.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Curriculum</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="grid gap-2 text-sm font-medium">
            Path
            <select
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              value={selectedCurriculumId}
              onChange={(event) => {
                setSelectedCurriculumId(event.target.value as CurriculumId);
              }}
            >
              <option value="">Select a curriculum</option>
              {curriculumItems.map((curriculum) => (
                <option key={curriculum.id} value={curriculum.id}>
                  {curriculum.title}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-4 rounded-lg border border-border/70 bg-background/70 p-3">
            <p className="text-sm font-medium text-foreground">Before you start</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Pick the exact frontier node for this session. Noema now builds the lesson plan from
              that explicit node choice instead of silently inferring the slice.
            </p>
            {selectedCurriculumId !== '' && (
              <div className="mt-3">
                <Link
                  href={`/curricula/${encodeURIComponent(selectedCurriculumId)}${
                    selectedFrontierNodeId !== ''
                      ? `?nodeId=${encodeURIComponent(selectedFrontierNodeId)}`
                      : ''
                  }`}
                  className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  Review the curriculum frontier before starting
                </Link>
              </div>
            )}
          </div>
          {selectedCurriculumId !== '' && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Frontier nodes
                </p>
                <span className="text-xs text-muted-foreground">Choose one target</span>
              </div>
              {selectedCurriculumFrontier.isLoading ? (
                <div className="h-24 animate-pulse rounded-xl border border-border bg-card" />
              ) : frontierNodes.length === 0 ? (
                <p className="rounded-lg border border-border/70 bg-background/70 px-3 py-3 text-sm text-muted-foreground">
                  This curriculum does not have any open frontier nodes right now.
                </p>
              ) : (
                <div className="grid gap-2">
                  {frontierNodes.map((node) => {
                    const isSelected = node.id === selectedFrontierNodeId;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => {
                          setSelectedFrontierNodeId(node.id);
                        }}
                        className={[
                          'rounded-xl border px-4 py-3 text-left transition-colors',
                          isSelected
                            ? 'border-cyan-400/50 bg-cyan-400/10'
                            : 'border-border bg-background hover:bg-muted/40',
                        ].join(' ')}
                      >
                        <span className="block text-sm font-medium text-foreground">
                          {node.label}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {node.learningObjective ?? node.stableNodeKey}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {selectedCurriculumId !== '' && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Selected path DAG
                </p>
                <span className="text-xs text-muted-foreground">Static preview</span>
              </div>
              {selectedCurriculum.isLoading ? (
                <div className="h-40 animate-pulse rounded-xl border border-border bg-card" />
              ) : (
                <CurriculumDag
                  nodes={selectedCurriculumData?.activeVersion?.nodes ?? []}
                  edges={selectedCurriculumData?.activeVersion?.edges ?? []}
                  variant="compact"
                  onNodeClick={() => {
                    router.push(`/curricula/${encodeURIComponent(selectedCurriculumId)}`);
                  }}
                  emptyMessage="This curriculum does not have an active DAG yet."
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 1 — Mode Selection                                          */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Session Mode</CardTitle>
        </CardHeader>
        <CardContent>
          <ModeSelector value={mode} onChange={setMode} />
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 2 — Concept Source                                          */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Concept Source</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Toggle row */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setUseQuickStart(true);
              }}
              className={[
                'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                useQuickStart
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-background text-foreground hover:bg-muted',
              ].join(' ')}
            >
              Quick Start
            </button>
            <button
              type="button"
              onClick={() => {
                setUseQuickStart(false);
              }}
              className={[
                'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                !useQuickStart
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-background text-foreground hover:bg-muted',
              ].join(' ')}
            >
              Custom Build
            </button>
          </div>

          {/* Quick Start panel */}
          {useQuickStart && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Uses your concept schedule to seed the next available study steps.
              </p>
              {dueConcepts.isLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading due concepts…
                </div>
              )}
              {dueConcepts.isSuccess && (
                <p className="text-sm text-foreground">
                  <span className="font-medium text-blue-600 dark:text-blue-400">
                    {String(retentionCount)} retention
                  </span>{' '}
                  +{' '}
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    {String(calibrationCount)} calibration
                  </span>{' '}
                  concepts due now.
                </p>
              )}
            </div>
          )}

          {/* Custom Build panel */}
          {!useQuickStart && (
            <div className="flex flex-col gap-4">
              <DeckQueryFilter query={customQuery} onChange={setCustomQuery} />

              <button
                type="button"
                onClick={() => {
                  setShowCandidates((prev) => !prev);
                }}
                className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                {showCandidates ? 'Hide candidates' : 'Preview candidates'}
              </button>

              {showCandidates && (
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  {sessionCandidates.isLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Loading candidates…
                    </div>
                  )}
                  {sessionCandidates.isSuccess &&
                    (compatibleCandidateItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No candidates match the current filters.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              Candidate {String(previewIndex + 1)} of{' '}
                              {String(compatibleCandidateItems.length)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Previewing the payloads that can seed this Step loop.
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={previewIndex === 0}
                              onClick={() => {
                                setPreviewIndex((current) => Math.max(0, current - 1));
                              }}
                            >
                              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                              Prev
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={previewIndex >= compatibleCandidateItems.length - 1}
                              onClick={() => {
                                setPreviewIndex((current) =>
                                  Math.min(compatibleCandidateItems.length - 1, current + 1)
                                );
                              }}
                            >
                              Next
                              <ChevronRight className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>

                        {previewCardLoading ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            Loading payload preview…
                          </div>
                        ) : previewCard !== undefined ? (
                          <div className="space-y-3">
                            <CardRenderer card={previewCard} mode="preview" isRevealed={false} />
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{previewCard.cardType}</span>
                              <span>{formatDifficultyLabel(previewCard.difficulty)}</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            We found candidates, but this payload preview could not be loaded just
                            now.
                          </p>
                        )}

                        <div className="flex items-center justify-center gap-2">
                          {previewCandidateIds.map((candidateId, index) => (
                            <button
                              key={candidateId as string}
                              type="button"
                              aria-label={`Go to candidate ${String(index + 1)}`}
                              aria-pressed={index === previewIndex}
                              className={[
                                'h-2.5 w-2.5 rounded-full transition-colors',
                                index === previewIndex ? 'bg-primary' : 'bg-muted-foreground/30',
                              ].join(' ')}
                              onClick={() => {
                                setPreviewIndex(index);
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}

              <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Missing-practice generation
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      If this custom build has no usable payloads for the selected frontier node,
                      Noema can generate and persist a fresh set before the session begins.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={autoGenerateMissingPractice}
                      onChange={(event) => {
                        setAutoGenerateMissingPractice(event.target.checked);
                      }}
                    />
                    Auto-generate
                  </label>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-[120px_minmax(0,1fr)]">
                  <label className="grid gap-2 text-sm font-medium text-foreground">
                    Cards
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={generatedCardCount}
                      onChange={(event) => {
                        setGeneratedCardCount(
                          Math.min(12, Math.max(1, Number(event.target.value) || 1))
                        );
                      }}
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </label>

                  <div className="grid gap-2">
                    <p className="text-sm font-medium text-foreground">Activity types</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {ACTIVITY_TYPE_OPTIONS.map((option) => {
                        const checked = desiredActivityTypes.includes(option.value);
                        return (
                          <label
                            key={option.value}
                            className="flex gap-3 rounded-lg border border-border px-3 py-3 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setDesiredActivityTypes((current) => {
                                  if (checked) {
                                    const remaining = current.filter(
                                      (value) => value !== option.value
                                    );
                                    return remaining.length === 0 ? current : remaining;
                                  }
                                  return [...current, option.value];
                                });
                              }}
                            />
                            <span>
                              <span className="block font-medium text-foreground">
                                {option.label}
                              </span>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {option.description}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Section 3 — Session Settings                                        */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Session Settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {/* Lane mix slider */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Lane Mix</label>
            <LaneMixSlider
              retentionPct={retentionPct}
              onChange={setRetentionPct}
              retentionCount={retentionCount}
              calibrationCount={calibrationCount}
            />
          </div>

          {/* Session size input */}
          <div className="flex flex-col gap-2">
            <label htmlFor="session-size" className="text-sm font-medium text-foreground">
              Session Size
            </label>
            <div className="flex items-center gap-3">
              <div className="flex items-stretch overflow-hidden rounded-2xl border border-synapse-400/35 bg-background/80 shadow-[0_0_0_1px_rgba(34,211,238,0.14)] transition focus-within:border-synapse-300/60 focus-within:shadow-[0_0_0_2px_rgba(59,130,246,0.28)]">
                <input
                  id="session-size"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={sessionSizeInput}
                  onChange={(e) => {
                    const nextValue = e.target.value.replace(/\D/g, '');
                    setSessionSizeInput(nextValue);
                  }}
                  onBlur={() => {
                    commitSessionSizeInput();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      commitSessionSizeInput();
                    }
                  }}
                  className="w-24 bg-transparent px-4 py-3 text-3xl font-medium tabular-nums text-foreground outline-none"
                  aria-describedby="session-size-hint"
                />
                <div className="flex flex-col border-l border-border/70 bg-card/70">
                  <button
                    type="button"
                    aria-label="Increase session size"
                    className="flex h-1/2 min-h-[1.75rem] items-center justify-center px-3 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                    onClick={() => {
                      adjustSessionSize(1);
                    }}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Decrease session size"
                    className="flex h-1/2 min-h-[1.75rem] items-center justify-center border-t border-border/70 px-3 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                    onClick={() => {
                      adjustSessionSize(-1);
                    }}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <span id="session-size-hint" className="text-sm text-muted-foreground">
                steps ({String(SESSION_SIZE_MIN)} - {String(SESSION_SIZE_MAX)})
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="space-y-1">
              <label htmlFor="prompt-side" className="text-sm font-medium text-foreground">
                Payload Sides
              </label>
              <p className="text-sm text-muted-foreground">
                Choose which side appears first. Reveal can show everything at once or unfold one
                side at a time inside the Step.
              </p>
            </div>

            <select
              id="prompt-side"
              value={presentationPromptSide}
              disabled={presentationSideOptions.length === 0}
              onChange={(e) => {
                setPresentationPromptSide(e.target.value);
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {presentationSideOptions.length === 0 ? (
                <option value="">Load a previewable payload first</option>
              ) : (
                presentationSideOptions.map((side) => (
                  <option key={side.key} value={side.key}>
                    {side.label}
                  </option>
                ))
              )}
            </select>

            <div className="grid gap-2 md:grid-cols-2">
              <button
                type="button"
                className={[
                  'rounded-2xl border px-4 py-3 text-left transition-colors',
                  presentationRevealMode === 'all_at_once'
                    ? 'border-cyan-400/50 bg-cyan-400/10'
                    : 'border-border bg-background hover:bg-muted/40',
                ].join(' ')}
                onClick={() => {
                  setPresentationRevealMode('all_at_once');
                }}
              >
                <span className="block text-sm font-medium text-foreground">
                  Reveal all other sides
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Show every remaining side together when you reveal.
                </span>
              </button>
              <button
                type="button"
                className={[
                  'rounded-2xl border px-4 py-3 text-left transition-colors',
                  presentationRevealMode === 'one_then_more'
                    ? 'border-cyan-400/50 bg-cyan-400/10'
                    : 'border-border bg-background hover:bg-muted/40',
                ].join(' ')}
                onClick={() => {
                  setPresentationRevealMode('one_then_more');
                }}
              >
                <span className="block text-sm font-medium text-foreground">
                  Reveal one side first
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Start with the main answer, then open the rest one by one.
                </span>
              </button>
            </div>

            {presentationRevealMode === 'one_then_more' && derivedAnswerSide !== undefined && (
              <p className="text-xs text-muted-foreground">
                Primary revealed side:{' '}
                {presentationSideOptions.find((side) => side.key === derivedAnswerSide)?.label ??
                  'Next available side'}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Start Button                                                         */}
      {/* ------------------------------------------------------------------ */}
      {startError !== null && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {startError}
        </div>
      )}
      <Button
        className="w-full"
        size="lg"
        disabled={startSession.isPending}
        onClick={() => {
          void handleStart();
        }}
      >
        {startSession.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Starting…
          </>
        ) : (
          <>
            <Play className="mr-2 h-4 w-4" aria-hidden="true" />
            Start Session
          </>
        )}
      </Button>
    </div>
  );
}

function formatDifficultyLabel(difficulty: unknown): string {
  if (typeof difficulty === 'number' && Number.isFinite(difficulty)) {
    return `Difficulty ${(difficulty * 100).toFixed(0)}%`;
  }

  if (typeof difficulty === 'string' && difficulty.trim() !== '') {
    return difficulty.replace(/_/g, ' ');
  }

  return 'Difficulty unavailable';
}

function clampSessionSize(value: number): number {
  return Math.min(SESSION_SIZE_MAX, Math.max(SESSION_SIZE_MIN, Math.round(value)));
}

async function generateMissingPractice(input: {
  userId: string;
  curriculumId: CurriculumId;
  sessionId: string;
  conceptId: string;
  selectedNodeId: CurriculumNodeId;
  studyMode: StudyMode;
  desiredCardTypes: string[];
  desiredActivityTypes: TransformationType[];
  generatedCardCount: number;
}): Promise<void> {
  const runResponse = await agentsApi.runAgent('content-creation-orchestrator', {
    userId: input.userId,
    curriculumId: input.curriculumId,
    sessionId: input.sessionId,
    conceptIds: [input.conceptId],
    selectedNodeIds: [input.selectedNodeId],
    desiredCardTypes: input.desiredCardTypes,
    studyMode: input.studyMode,
    executionPreference: 'realtime',
    requestTimeoutMs: 90_000,
    payload: {
      mode: 'agent_autonomous',
      operationName: 'session_preparation',
      purpose: 'Generate missing practice before a curriculum-bound build-mode session starts.',
      trigger: 'curriculum_gap',
      desiredActivityTypes: input.desiredActivityTypes,
      budget: {
        maxCards: input.generatedCardCount,
        timeoutMs: 90_000,
      },
      varietyMandate: {
        minDistinctTypesPerConcept: Math.min(
          input.desiredActivityTypes.length,
          input.generatedCardCount
        ),
      },
    },
  });

  const executionRecord = asRecord(runResponse.data.execution);
  const executionResult = asRecord(executionRecord['result']);
  const agentRunId =
    typeof executionResult['agentRunId'] === 'string'
      ? executionResult['agentRunId']
      : runResponse.data.runId;
  const cards = readRecordArray(executionResult['cards']).slice(0, input.generatedCardCount);
  const activityVariants = readRecordArray(executionResult['activityVariants']);

  if (cards.length === 0 && activityVariants.length === 0) {
    throw new Error(
      'Noema could not generate any usable practice artifacts for this frontier node.'
    );
  }

  const importPayload: ImportGeneratedContentBatchInput = {
    job: {
      mode: 'agent_autonomous',
      conceptIds: [input.conceptId],
      curriculumContext: {
        curriculumId: input.curriculumId,
        selectedNodeIds: [input.selectedNodeId],
      },
      studentContext: {
        sessionId: input.sessionId,
      },
      desiredCardTypes: input.desiredCardTypes,
      varietyMandate: {
        minDistinctTypesPerConcept: Math.min(
          input.desiredActivityTypes.length,
          input.generatedCardCount
        ),
      },
      budget: {
        maxCards: input.generatedCardCount,
        timeoutMs: 90_000,
      },
    },
    cards: cards.map((card) => toGeneratedCardImport(card, agentRunId, input.studyMode)),
    activityVariants: activityVariants.map((variant) =>
      toGeneratedActivityVariantImport(variant, agentRunId)
    ),
    rejectedDrafts: readRecordArray(executionResult['rejectedDrafts']),
    agentRunId,
    resultPayload: {
      generatedDuring: 'session_start',
      sessionId: input.sessionId,
      cardCount: cards.length,
      activityVariantCount: activityVariants.length,
    },
  };

  await http.post('/v1/content/generation-jobs/import-result', importPayload);
}

function toGeneratedCardImport(
  card: Record<string, unknown>,
  agentRunId: string,
  studyMode: StudyMode
): {
  cardType: string;
  content: Record<string, unknown>;
  primaryConceptId: string;
  relatedConceptIds?: string[];
  tags?: string[];
  knowledgeNodeIds?: string[];
  anchoredCkgNodeIds?: string[];
  anchoredPkgNodeIds?: string[];
  source?: string;
  difficulty?: DifficultyLevel;
  supportedStudyModes?: StudyMode[];
  metadata?: Record<string, unknown>;
} {
  const conceptIds = readStringArray(card['conceptIds']);
  const anchoredCkgNodeIds = readStringArray(card['anchoredCkgNodeIds']);
  const anchoredPkgNodeIds = readStringArray(card['anchoredPkgNodeIds']);
  const primaryConceptId = conceptIds[0] ?? anchoredCkgNodeIds[0];

  if (primaryConceptId === undefined) {
    throw new Error('Generated card is missing a canonical concept anchor.');
  }

  return {
    cardType: readString(card['cardType']) ?? 'definition',
    content: asRecord(card['content']),
    primaryConceptId,
    relatedConceptIds: conceptIds.slice(1),
    tags: readStringArray(card['tags']),
    knowledgeNodeIds: anchoredPkgNodeIds,
    anchoredCkgNodeIds,
    anchoredPkgNodeIds,
    source: 'agent',
    difficulty: (readString(card['difficulty']) ?? 'intermediate') as DifficultyLevel,
    supportedStudyModes: readStudyModes(card['supportedStudyModes'], studyMode),
    metadata: {
      generationRationale: readString(card['rationale']) ?? '',
      originMode: readString(card['originMode']) ?? 'agent_autonomous',
      originAgentRunId: agentRunId,
      sourceDocumentIds: readStringArray(card['sourceDocumentIds']),
      sources: card['sources'],
      factualityScore: card['factualityScore'],
      guardianValidationId: readString(card['guardianValidationId']),
    },
  };
}

function toGeneratedActivityVariantImport(
  variant: Record<string, unknown>,
  agentRunId: string
): {
  conceptId: string;
  studyMode: StudyMode;
  transformationType: TransformationType;
  epistemicMode: EpistemicMode;
  difficultyBucket: number;
  sourceCardIds?: string[];
  prompt: string;
  renderPayload: Record<string, unknown>;
  expectedResponseType: string;
  responseSchema: Record<string, unknown>;
  variantSeed: string;
  generatorMetadata?: Record<string, unknown>;
  ttlAt: string;
} {
  const conceptId = readString(variant['conceptId']);
  if (conceptId === undefined) {
    throw new Error('Generated activity variant is missing its concept id.');
  }

  return {
    conceptId,
    studyMode: (readString(variant['studyMode']) ?? 'knowledge_gaining') as StudyMode,
    transformationType: (readString(variant['transformationType']) ??
      'explanation') as TransformationType,
    epistemicMode: (readString(variant['epistemicMode']) ??
      'generative_retrieval') as EpistemicMode,
    difficultyBucket: readNumber(variant['difficultyBucket']) ?? 2,
    sourceCardIds: readStringArray(variant['sourceCardIds']),
    prompt: readString(variant['prompt']) ?? 'Practice this concept.',
    renderPayload: asRecord(variant['renderPayload']),
    expectedResponseType: readString(variant['expectedResponseType']) ?? 'short_text',
    responseSchema: asRecord(variant['responseSchema']),
    variantSeed: readString(variant['variantSeed']) ?? `${conceptId}:generated`,
    generatorMetadata: {
      ...asRecord(variant['generatorMetadata']),
      agentRunId,
      guardianValidationId: readString(variant['guardianValidationId']),
      rationale: readString(variant['rationale']),
    },
    ttlAt:
      readString(variant['ttlAt']) ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null && !Array.isArray(item)
      )
    : [];
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function readStudyModes(value: unknown, fallback: StudyMode): StudyMode[] {
  const modes = readStringArray(value) as StudyMode[];
  return modes.length > 0 ? modes : [fallback];
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function formatStartSessionError(error: unknown): string {
  return formatApiErrorMessage(error, {
    action: 'start the session',
    fallback:
      'We could not start the session. Review the selected mode and available concept payloads, then try again.',
    fieldLabels: {
      deckQueryId: 'Session configuration',
      initialCardIds: 'Selected concept payloads',
      learningMode: 'Learning mode',
    },
    fieldHints: {
      initialCardIds: 'Keep at least one concept payload available before starting.',
    },
  });
}
