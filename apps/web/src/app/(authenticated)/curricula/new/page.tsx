'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import {
  curriculumKeys,
  useCKGNodes,
  useCreateCurriculum,
  useCreatePKGNode,
  useDomainSuggestions,
  usePKGNodes,
} from '@noema/api-client';
import { useAuth } from '@noema/auth';
import { Loader2, Search, Sparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { UserId } from '@noema/types';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@noema/ui';
import { ProposalJobStatusCard, useContextualAgent } from '@/features/agents';
import {
  extractCurriculumOutline,
  extractImportedCurriculumDraft,
  type ICurriculumOutlineConceptCandidate,
} from '@/features/curricula/helpers';
import { formatApiErrorMessage } from '@/lib/api-errors';
import { useActiveStudyMode } from '@/hooks/use-active-study-mode';

interface IApprovedConcept {
  key: string;
  label: string;
  whySuggested: string;
  clusterLabel: string;
  confidenceLabel: string;
  suggestedDomain: string | null;
  conceptId: string | null;
  graphSource: 'pending' | 'pkg' | 'ckg' | 'provisional_pkg';
}

function conceptKey(label: string): string {
  return label.trim().toLowerCase();
}

function toApprovedConcept(
  concept: ICurriculumOutlineConceptCandidate,
  index: number
): IApprovedConcept {
  return {
    key: `${conceptKey(concept.label)}:${index}`,
    label: concept.label,
    whySuggested: concept.whySuggested,
    clusterLabel: concept.clusterLabel,
    confidenceLabel: concept.confidenceLabel,
    suggestedDomain: concept.suggestedDomain ?? null,
    conceptId: concept.matchedConceptId ?? null,
    graphSource:
      concept.matchedGraphSource === 'pkg'
        ? 'pkg'
        : concept.matchedGraphSource === 'ckg'
          ? 'ckg'
          : 'pending',
  };
}

function dedupeApprovedConcepts(concepts: IApprovedConcept[]): IApprovedConcept[] {
  const seen = new Set<string>();
  const unique: IApprovedConcept[] = [];
  for (const concept of concepts) {
    const key = concept.conceptId ?? conceptKey(concept.label);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(concept);
  }
  return unique;
}

function resolveCreationDomain(input: string, resolvedDomain: string | null): string {
  if (resolvedDomain !== null && resolvedDomain.trim() !== '') {
    return resolvedDomain;
  }
  const firstHint = input
    .split(',')
    .map((value) => value.trim())
    .find((value) => value !== '');
  return firstHint ?? 'general';
}

function shouldResolveDomainSuggestions(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed === '') {
    return false;
  }

  // The helper endpoint is for canonicalizing one domain label at a time.
  // Composite prompts like "Biology, Neuroscience, ..." should bypass it.
  return !trimmed.includes(',');
}

function conceptStatusLabel(concept: IApprovedConcept): string {
  switch (concept.graphSource) {
    case 'ckg':
      return 'Existing canonical concept';
    case 'pkg':
      return 'Existing PKG concept';
    case 'provisional_pkg':
      return 'Provisional PKG anchor';
    case 'pending':
    default:
      return 'Will become a provisional PKG anchor';
  }
}

export default function NewCurriculumPage(): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = (user?.id ?? '') as UserId;
  const activeStudyMode = useActiveStudyMode();
  const createCurriculum = useCreateCurriculum();
  const createNode = useCreatePKGNode(userId);
  const [goal, setGoal] = React.useState('');
  const [domain, setDomain] = React.useState('');
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [approvedConcepts, setApprovedConcepts] = React.useState<IApprovedConcept[]>([]);
  const [conceptSearch, setConceptSearch] = React.useState('');
  const [confirmedConceptIds, setConfirmedConceptIds] = React.useState<string[]>([]);
  const [pendingDraftStart, setPendingDraftStart] = React.useState(false);
  const [isPreparingConcepts, setIsPreparingConcepts] = React.useState(false);
  const handledOutlineRunIdRef = React.useRef<string | null>(null);
  const handledDraftRunIdRef = React.useRef<string | null>(null);
  const deferredConceptSearch = React.useDeferredValue(conceptSearch.trim());

  const outlinePlanner = useContextualAgent({
    agentName: 'curriculum-outline-planner',
    context: {
      userId: user?.id ?? '',
      studyMode: activeStudyMode,
      payload: {
        surface: 'curriculum-new',
        goal,
        domain,
        draftPolicy: 'learner_review_required',
      },
    },
    executionPreference: 'realtime',
  });

  const draftPlanner = useContextualAgent({
    agentName: 'curriculum-planner',
    context: {
      userId: user?.id ?? '',
      studyMode: activeStudyMode,
      conceptIds: confirmedConceptIds,
      payload: {
        surface: 'curriculum-new',
        goal,
        domain,
        draftPolicy: 'learner_review_required',
        conceptAnchors: approvedConcepts.map((concept) => ({
          conceptId: concept.conceptId,
          label: concept.label,
          graphSource: concept.graphSource,
          suggestedDomain: concept.suggestedDomain,
        })),
      },
    },
    executionPreference: 'batch',
  });

  const domainResolution = useDomainSuggestions(
    {
      userId,
      label: domain,
      nodeType: 'notion',
      studyMode: activeStudyMode,
      limit: 5,
    },
    {
      enabled: user !== null && shouldResolveDomainSuggestions(domain),
      retry: false,
    }
  );

  const searchParams =
    deferredConceptSearch === ''
      ? undefined
      : {
          search: deferredConceptSearch,
          searchMode: 'fulltext' as const,
          sortBy: 'relevance' as const,
          pageSize: 6,
          studyMode: activeStudyMode,
        };

  const { data: pkgMatches = [] } = usePKGNodes(userId, {
    ...(searchParams ?? {}),
    enabled: user !== null && deferredConceptSearch !== '',
  });
  const { data: ckgMatches = [] } = useCKGNodes({
    ...(searchParams ?? {}),
    enabled: deferredConceptSearch !== '',
  });

  const trimmedGoal = goal.trim();
  const trimmedDomain = domain.trim();
  const creationDomain = resolveCreationDomain(trimmedDomain, domainResolution.data?.resolvedDomain ?? null);
  const outline = extractCurriculumOutline(outlinePlanner.latestRun);
  const canAnalyzeGoal = trimmedGoal.length > 0 && outlinePlanner.canRun;
  const canCreateDraft =
    approvedConcepts.length > 0 &&
    !isPreparingConcepts &&
    !draftPlanner.isRunning &&
    !outlinePlanner.isRunning;

  React.useEffect(() => {
    if (outlinePlanner.latestRun === undefined || outline === null) return;
    if (handledOutlineRunIdRef.current === outlinePlanner.latestRun.runId) return;

    handledOutlineRunIdRef.current = outlinePlanner.latestRun.runId;
    setApprovedConcepts(dedupeApprovedConcepts(outline.candidateConcepts.map(toApprovedConcept)));
    setConfirmedConceptIds([]);
    setStatusMessage(
      'Goal analysis is ready. Review the suggested concept anchors, remove what does not fit, and add anything missing before drafting the durable curriculum.'
    );
  }, [outline, outlinePlanner.latestRun]);

  React.useEffect(() => {
    const latestRun = draftPlanner.latestRun;
    if (latestRun === undefined) return;

    const importedDraft = extractImportedCurriculumDraft(latestRun);
    if (importedDraft === null) return;
    if (handledDraftRunIdRef.current === latestRun.runId) return;

    handledDraftRunIdRef.current = latestRun.runId;
    setStatusMessage('Curriculum draft imported. Opening the draft…');
    void queryClient.invalidateQueries({ queryKey: curriculumKeys.list() });
    void queryClient.invalidateQueries({
      queryKey: curriculumKeys.detail(importedDraft.curriculumId as never),
    });
    router.push(`/curricula/${encodeURIComponent(importedDraft.curriculumId)}`);
  }, [draftPlanner.latestRun, queryClient, router]);

  React.useEffect(() => {
    if (!pendingDraftStart || confirmedConceptIds.length === 0 || !draftPlanner.canRun) {
      return;
    }

    setPendingDraftStart(false);
    setStatusMessage('Creating the durable curriculum draft from the approved concept anchors.');
    void draftPlanner.run();
  }, [confirmedConceptIds, draftPlanner, pendingDraftStart]);

  React.useEffect(() => {
    if (outlinePlanner.proposalJobPhase === 'cancelled') {
      setStatusMessage('Goal analysis was cancelled before provider submission.');
    }
  }, [outlinePlanner.proposalJobPhase]);

  React.useEffect(() => {
    if (draftPlanner.proposalJobPhase === 'cancelled') {
      setStatusMessage('Curriculum drafting was cancelled before provider submission.');
    }
  }, [draftPlanner.proposalJobPhase]);

  async function handleAnalyzeGoal(): Promise<void> {
    setStatusMessage('Analyzing the goal and preparing candidate concept anchors.');
    handledOutlineRunIdRef.current = null;
    setApprovedConcepts([]);
    setConfirmedConceptIds([]);
    await outlinePlanner.run();
  }

  function removeApprovedConcept(key: string): void {
    setApprovedConcepts((current) => current.filter((concept) => concept.key !== key));
  }

  function addApprovedConcept(concept: IApprovedConcept): void {
    setApprovedConcepts((current) => dedupeApprovedConcepts([...current, concept]));
    setConceptSearch('');
  }

  async function handleCreateDraft(): Promise<void> {
    if (approvedConcepts.length === 0 || user === null) return;

    setIsPreparingConcepts(true);
    setStatusMessage('Preparing the approved concept anchors for the durable curriculum draft.');

    try {
      const resolvedConcepts: IApprovedConcept[] = [];
      for (const concept of approvedConcepts) {
        if (concept.conceptId !== null) {
          resolvedConcepts.push(concept);
          continue;
        }

        const response = await createNode.mutateAsync({
          label: concept.label,
          type: 'notion',
          domain: concept.suggestedDomain ?? creationDomain,
          supportedStudyModes: [activeStudyMode],
          metadata: {
            authoringSource: 'curriculum-new',
            authoringWorkflow: 'curriculum-concept-approval',
            plannerWhySuggested: concept.whySuggested,
            plannerClusterLabel: concept.clusterLabel,
            plannerConfidenceLabel: concept.confidenceLabel,
            provisionalAnchor: true,
            goal: trimmedGoal,
          },
        });

        resolvedConcepts.push({
          ...concept,
          conceptId: String(response.data.id),
          graphSource: 'provisional_pkg',
        });
      }

      const stableConceptIds = resolvedConcepts
        .map((concept) => concept.conceptId)
        .filter((value): value is string => value !== null && value.trim() !== '');

      setApprovedConcepts(resolvedConcepts);
      setConfirmedConceptIds(stableConceptIds);
      setPendingDraftStart(true);
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : 'The approved concept set could not be prepared for drafting.'
      );
    } finally {
      setIsPreparingConcepts(false);
    }
  }

  async function handleCreateBlankDraft(): Promise<void> {
    const response = await createCurriculum.mutateAsync({
      title: trimmedGoal.length > 0 ? trimmedGoal.slice(0, 120) : 'Untitled curriculum',
      goal: trimmedGoal.length > 0 ? trimmedGoal : undefined,
      domain: trimmedDomain.length > 0 ? trimmedDomain : undefined,
      originMode: 'user_authored',
    });
    router.push(`/curricula/${encodeURIComponent(response.data.id)}`);
  }

  const outlineError =
    outlinePlanner.runError !== null
      ? formatApiErrorMessage(outlinePlanner.runError, {
          action: 'analyze the goal',
          fallback: 'The goal analysis could not be completed.',
        })
      : null;
  const draftError =
    draftPlanner.runError !== null
      ? formatApiErrorMessage(draftPlanner.runError, {
          action: 'draft the curriculum',
          fallback: 'The durable curriculum draft could not be created.',
        })
      : null;
  const blankDraftError =
    createCurriculum.error !== null
      ? formatApiErrorMessage(createCurriculum.error, {
          action: 'create the curriculum',
          fallback: 'The blank curriculum draft could not be created.',
        })
      : null;

  const searchResults = [
    ...pkgMatches.map((node) => ({
      key: `pkg:${String(node.id)}`,
      label: node.label,
      description: node.description ?? 'Existing PKG concept',
      graphSource: 'pkg' as const,
      conceptId: String(node.id),
      suggestedDomain: node.domain ?? creationDomain,
    })),
    ...ckgMatches.map((node) => ({
      key: `ckg:${String(node.id)}`,
      label: node.label,
      description: node.description ?? 'Existing canonical concept',
      graphSource: 'ckg' as const,
      conceptId: String(node.id),
      suggestedDomain: node.domain ?? creationDomain,
    })),
  ].filter((result, index, items) => items.findIndex((item) => item.key === result.key) === index);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">New curriculum</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Start from a learner goal, review the concept anchors the system infers, and only then
            generate the durable curriculum DAG.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/curricula">Back to vault</Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Goal entry</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label className="grid gap-2 text-sm font-medium text-foreground">
            Goal
            <textarea
              className="min-h-32 rounded-md border border-border bg-background px-3 py-2 font-normal text-foreground"
              name="goal"
              value={goal}
              placeholder="Learn enough linear algebra to understand PCA."
              onChange={(event) => {
                setGoal(event.target.value);
              }}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-foreground">
            Domain hints
            <input
              className="rounded-md border border-border bg-background px-3 py-2 font-normal text-foreground"
              name="domain"
              value={domain}
              placeholder="linear algebra, eigenvectors, projection"
              onChange={(event) => {
                setDomain(event.target.value);
              }}
            />
          </label>
          <div className="rounded-lg border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
            The learner never needs to enter raw concept IDs here. The system infers candidate
            anchors from the goal, then you confirm, remove, or add concepts before the durable
            curriculum draft is generated.
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={!canAnalyzeGoal || outlinePlanner.isRunning}
              onClick={() => {
                void handleAnalyzeGoal();
              }}
            >
              {outlinePlanner.isRunning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {outlinePlanner.isRunning ? 'Analyzing…' : 'Analyze goal'}
            </Button>
            {outlinePlanner.canCancelJob && (
              <Button
                type="button"
                variant="outline"
                disabled={outlinePlanner.isCancelling}
                onClick={() => {
                  void outlinePlanner.cancelJob();
                }}
              >
                {outlinePlanner.isCancelling ? 'Cancelling…' : 'Cancel analysis'}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={createCurriculum.isPending}
              onClick={() => {
                void handleCreateBlankDraft();
              }}
            >
              {createCurriculum.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Create blank draft
            </Button>
          </div>
        </CardContent>
      </Card>

      {(statusMessage !== null ||
        outlineError !== null ||
        draftError !== null ||
        blankDraftError !== null ||
        outlinePlanner.batchJob !== null ||
        draftPlanner.batchJob !== null) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Flow status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {statusMessage !== null && (
              <p className="rounded-lg border border-border/70 bg-background/70 px-3 py-2 text-muted-foreground">
                {statusMessage}
              </p>
            )}
            {(outlinePlanner.batchJob !== null || outlinePlanner.isRunning) && (
              <ProposalJobStatusCard
                job={outlinePlanner.batchJob}
                phase={outlinePlanner.proposalJobPhase}
                canCancel={outlinePlanner.canCancelJob}
                isCancelling={outlinePlanner.isCancelling}
                onCancel={() => {
                  void outlinePlanner.cancelJob();
                }}
                title="Goal analysis request"
              />
            )}
            {(draftPlanner.batchJob !== null || draftPlanner.isRunning) && (
              <ProposalJobStatusCard
                job={draftPlanner.batchJob}
                phase={draftPlanner.proposalJobPhase}
                canCancel={draftPlanner.canCancelJob}
                isCancelling={draftPlanner.isCancelling}
                onCancel={() => {
                  void draftPlanner.cancelJob();
                }}
                title="Curriculum draft request"
              />
            )}
            {outlineError !== null && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">
                {outlineError}
              </p>
            )}
            {draftError !== null && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">
                {draftError}
              </p>
            )}
            {blankDraftError !== null && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">
                {blankDraftError}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {outline !== null && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Concept approval</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-lg border border-border/70 bg-background/70 p-4 text-sm">
                <p className="font-medium text-foreground">{outline.title ?? 'Goal analysis ready'}</p>
                <p className="mt-1 text-muted-foreground">{outline.goalSummary}</p>
                <p className="mt-3 text-muted-foreground">{outline.rationale}</p>
              </div>

              {outline.candidateGroups.length > 0 && (
                <div className="grid gap-3 md:grid-cols-2">
                  {outline.candidateGroups.map((group) => (
                    <div
                      key={group.label}
                      className="rounded-lg border border-border/70 bg-background/70 p-4 text-sm"
                    >
                      <p className="font-medium text-foreground">{group.label}</p>
                      <p className="mt-2 text-muted-foreground">
                        {group.conceptLabels.join(', ') || 'No grouped concepts yet.'}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                <div className="space-y-3">
                  <div className="rounded-lg border border-border/70 bg-background/70 p-4">
                    <p className="text-sm font-medium text-foreground">Approved concept set</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      These are the anchors that will drive the durable curriculum draft. Remove what
                      does not fit and add anything the system missed.
                    </p>
                    <div className="mt-4 grid gap-3">
                      {approvedConcepts.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No concept anchors are approved yet. Add at least one to create the draft.
                        </p>
                      ) : (
                        approvedConcepts.map((concept) => (
                          <div
                            key={concept.key}
                            className="rounded-lg border border-border/70 bg-background px-4 py-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-medium text-foreground">{concept.label}</p>
                                <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                                  {concept.clusterLabel} • {concept.confidenceLabel}
                                </p>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  removeApprovedConcept(concept.key);
                                }}
                              >
                                Remove
                              </Button>
                            </div>
                            <p className="mt-3 text-sm text-muted-foreground">{concept.whySuggested}</p>
                            <p className="mt-3 text-xs text-muted-foreground">
                              {conceptStatusLabel(concept)}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-background/70 p-4">
                    <p className="text-sm font-medium text-foreground">Add or resolve concepts</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Search for an existing PKG or canonical concept first. If nothing fits, add a
                      new concept and Noema will create a provisional PKG anchor before drafting.
                    </p>
                    <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
                      <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <input
                        className="w-full bg-transparent text-sm text-foreground outline-none"
                        value={conceptSearch}
                        placeholder="Add a missing concept"
                        onChange={(event) => {
                          setConceptSearch(event.target.value);
                        }}
                      />
                    </div>
                    <div className="mt-4 grid gap-3">
                      {searchResults.map((result) => (
                        <button
                          key={result.key}
                          type="button"
                          className="rounded-lg border border-border/70 bg-background px-4 py-3 text-left transition hover:border-primary/40"
                          onClick={() => {
                            addApprovedConcept({
                              key: result.key,
                              label: result.label,
                              whySuggested:
                                result.graphSource === 'pkg'
                                  ? 'Added from your existing PKG.'
                                  : 'Added from an existing canonical concept.',
                              clusterLabel: 'Manually added',
                              confidenceLabel: 'confirmed',
                              suggestedDomain: result.suggestedDomain,
                              conceptId: result.conceptId,
                              graphSource: result.graphSource,
                            });
                          }}
                        >
                          <p className="font-medium text-foreground">{result.label}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{result.description}</p>
                        </button>
                      ))}
                      {deferredConceptSearch !== '' && searchResults.length === 0 && (
                        <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                          No existing concept matches this label yet.
                        </div>
                      )}
                      {conceptSearch.trim() !== '' && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            addApprovedConcept({
                              key: `new:${conceptKey(conceptSearch)}`,
                              label: conceptSearch.trim(),
                              whySuggested:
                                'Added manually during concept approval because the existing graph suggestions did not fully cover the goal.',
                              clusterLabel: 'Manually added',
                              confidenceLabel: 'confirmed',
                              suggestedDomain: creationDomain,
                              conceptId: null,
                              graphSource: 'pending',
                            });
                          }}
                        >
                          Add as provisional concept
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg border border-border/70 bg-background/70 p-4">
                    <p className="text-sm font-medium text-foreground">Prerequisite themes</p>
                    <div className="mt-3 grid gap-3">
                      {outline.prerequisiteThemes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No prerequisite themes were identified yet.
                        </p>
                      ) : (
                        outline.prerequisiteThemes.map((theme) => (
                          <div key={theme.label} className="rounded-lg border border-border/70 bg-background px-3 py-3">
                            <p className="font-medium text-foreground">{theme.label}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{theme.whyItMatters}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-background/70 p-4">
                    <p className="text-sm font-medium text-foreground">Provisional outline</p>
                    <div className="mt-3 grid gap-3">
                      {outline.provisionalOutline.map((stage) => (
                        <div key={stage.title} className="rounded-lg border border-border/70 bg-background px-3 py-3">
                          <p className="font-medium text-foreground">{stage.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{stage.reason}</p>
                          {stage.conceptLabels.length > 0 && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              {stage.conceptLabels.join(', ')}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {outline.ambiguityNotes.length > 0 && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                      <p className="text-sm font-medium text-foreground">Ambiguities to watch</p>
                      <ul className="mt-2 grid gap-2 text-sm text-muted-foreground">
                        {outline.ambiguityNotes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  disabled={!canCreateDraft}
                  onClick={() => {
                    void handleCreateDraft();
                  }}
                >
                  {isPreparingConcepts || draftPlanner.isRunning ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  {isPreparingConcepts || draftPlanner.isRunning
                    ? 'Creating draft…'
                    : 'Create curriculum draft'}
                </Button>
                {draftPlanner.canCancelJob && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={draftPlanner.isCancelling}
                    onClick={() => {
                      void draftPlanner.cancelJob();
                    }}
                  >
                    {draftPlanner.isCancelling ? 'Cancelling…' : 'Cancel draft'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Review path</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            The exploratory pass never imports a curriculum draft. It only prepares a provisional
            concept-and-outline proposal for learner review.
          </p>
          <p>
            Only the second pass creates the durable curriculum draft, and any learner-added concept
            is first created as a provisional PKG anchor so the resulting path stays referenceable.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
