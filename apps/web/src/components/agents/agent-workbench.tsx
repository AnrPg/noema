'use client';

import * as React from 'react';
import {
  useAgent,
  useAgentPreflight,
  useAgents,
  useAgentRun,
  useAgentTools,
  type IAgentRunRequest,
  type IAgentRunResult,
  type IAgentWrapperDefinition,
  type IReviewRoutingDecision,
} from '@noema/api-client/agents';
import {
  useCards,
  useCurricula,
  useIngestionDocuments,
  useNextStep,
  useSessions,
} from '@noema/api-client';
import { useAuth } from '@noema/auth';
import { Button, Card, CardContent, CardHeader } from '@noema/ui';
import type { SessionId } from '@noema/types';
import { Bot, ChevronDown, ChevronRight, Play, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { formatApiErrorMessage } from '@/lib/api-errors';

interface IWorkbenchFormState {
  sessionId: string;
  curriculumId: string;
  stepId: string;
  conceptIds: string;
  selectedNodeIds: string;
  selectedCardIds: string;
  desiredCardTypes: string;
  documentIds: string;
  requestedTools: string;
  studyMode: string;
  allowFallback: boolean;
  payload: string;
}

const DEFAULT_AGENT = 'cognitive-copilot';

const CARD_TYPE_OPTIONS = ['definition', 'explanation', 'recall', 'application', 'comparison'];
const STUDY_MODE_OPTIONS = ['knowledge_gaining', 'language_learning'];
const REQUESTED_TOOL_OPTIONS = [
  'get-content-creator-brief',
  'content.get-coverage',
  'content.query-cards',
  'knowledge-graph.resolve-concept-reference',
  'knowledge-graph.get-concept-node',
  'scheduler.get-concept-schedule',
];

function parseCommaSeparated(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeOptional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatLabel(value: string): string {
  return value.replaceAll('-', ' ');
}

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values.filter((value): value is string => typeof value === 'string' && value.length > 0)
    )
  ).sort();
}

function arrayFromUnknown(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function curriculumNodes(curriculum: unknown): Record<string, unknown>[] {
  if (typeof curriculum !== 'object' || curriculum === null) {
    return [];
  }
  const activeVersion = (curriculum as { activeVersion?: unknown }).activeVersion;
  if (typeof activeVersion !== 'object' || activeVersion === null) {
    return [];
  }
  const nodes = (activeVersion as { nodes?: unknown }).nodes;
  return Array.isArray(nodes)
    ? nodes.filter(
        (node): node is Record<string, unknown> => typeof node === 'object' && node !== null
      )
    : [];
}

function fieldRequired(agent: IAgentWrapperDefinition | undefined, field: string): boolean {
  return agent?.requiredFields.includes(field) ?? false;
}

function FieldLabel(props: { children: React.ReactNode; required: boolean }): React.JSX.Element {
  return (
    <span className="text-muted-foreground">
      {props.children}
      {props.required ? <span className="ml-1 text-destructive">*</span> : null}
    </span>
  );
}

function CollapsibleCard(props: {
  title: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  defaultOpen?: boolean;
  icon?: LucideIcon;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}): React.JSX.Element {
  const [internalOpen, setInternalOpen] = React.useState(props.defaultOpen ?? true);
  const open = props.open ?? internalOpen;
  const ChevronIcon = open ? ChevronDown : ChevronRight;
  const Icon = props.icon;

  function setOpen(nextOpen: boolean): void {
    if (props.open === undefined) {
      setInternalOpen(nextOpen);
    }
    props.onOpenChange?.(nextOpen);
  }

  return (
    <Card className={props.className}>
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => {
            setOpen(!open);
          }}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="flex min-w-0 items-center gap-2 text-base font-semibold leading-none tracking-tight text-foreground">
            {Icon === undefined ? null : <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
            <span className="min-w-0 truncate">{props.title}</span>
          </span>
          <ChevronIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </CardHeader>
      {open ? <CardContent className={props.contentClassName}>{props.children}</CardContent> : null}
    </Card>
  );
}

function CollapsibleInsetPanel(props: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}): React.JSX.Element {
  const [open, setOpen] = React.useState(props.defaultOpen ?? true);
  const ChevronIcon = open ? ChevronDown : ChevronRight;

  return (
    <div className="rounded-xl border border-border/70 bg-background/70">
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
        }}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 truncate text-sm font-semibold text-foreground">
          {props.title}
        </span>
        <ChevronIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      {open ? <div className="px-4 pb-4">{props.children}</div> : null}
    </div>
  );
}

function WorkbenchDatalists(props: {
  agentNames: string[];
  compositeTools: string[];
  sessionIds: string[];
  curriculumIds: string[];
  stepIds: string[];
  conceptIds: string[];
  nodeIds: string[];
  cardIds: string[];
  documentIds: string[];
}): React.JSX.Element {
  const requestedToolOptions = Array.from(
    new Set([...REQUESTED_TOOL_OPTIONS, ...props.compositeTools])
  );

  const datalists: [string, string[]][] = [
    ['agent-options', props.agentNames],
    ['session-id-options', props.sessionIds],
    ['curriculum-id-options', props.curriculumIds],
    ['step-id-options', props.stepIds],
    ['concept-id-options', props.conceptIds],
    ['selected-node-id-options', props.nodeIds],
    ['selected-card-id-options', props.cardIds],
    ['desired-card-type-options', CARD_TYPE_OPTIONS],
    ['document-id-options', props.documentIds],
    ['study-mode-options', STUDY_MODE_OPTIONS],
    ['requested-tool-options', requestedToolOptions],
  ];

  return (
    <>
      {datalists.map(([id, options]) => (
        <datalist key={id} id={id}>
          {options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      ))}
    </>
  );
}

function toRunRequest(userId: string, state: IWorkbenchFormState): IAgentRunRequest {
  const payload =
    state.payload.trim() === '' ? {} : (JSON.parse(state.payload) as Record<string, unknown>);

  return {
    userId,
    sessionId: normalizeOptional(state.sessionId),
    curriculumId: normalizeOptional(state.curriculumId),
    stepId: normalizeOptional(state.stepId),
    conceptIds: parseCommaSeparated(state.conceptIds),
    selectedNodeIds: parseCommaSeparated(state.selectedNodeIds),
    selectedCardIds: parseCommaSeparated(state.selectedCardIds),
    desiredCardTypes: parseCommaSeparated(state.desiredCardTypes),
    documentIds: parseCommaSeparated(state.documentIds),
    requestedTools: parseCommaSeparated(state.requestedTools),
    studyMode: normalizeOptional(state.studyMode),
    executionPreference: 'realtime' as const,
    allowFallback: state.allowFallback,
    payload,
  };
}

function defaultFormFor(agentName: string): IWorkbenchFormState {
  if (agentName === 'graph-intervention-orchestrator' || agentName === 'knowledge-graph-agent') {
    return {
      sessionId: '',
      curriculumId: '',
      stepId: '',
      conceptIds: 'Bayes theorem',
      selectedNodeIds: '',
      selectedCardIds: '',
      desiredCardTypes: '',
      documentIds: '',
      requestedTools: '',
      studyMode: 'knowledge_gaining',
      allowFallback: true,
      payload: JSON.stringify(
        {
          operationName: 'content_readiness',
          proposalType: 'content_readiness',
          domain: 'statistics',
          sourcePolicy: { requiresSourceEvidence: false, sourceRefs: [] },
        },
        null,
        2
      ),
    };
  }

  if (agentName === 'content-creation-orchestrator') {
    return {
      sessionId: '',
      curriculumId: '',
      stepId: '',
      conceptIds: 'Bayes theorem',
      selectedNodeIds: '',
      selectedCardIds: '',
      desiredCardTypes: 'explanation, recall',
      documentIds: '',
      requestedTools: '',
      studyMode: 'knowledge_gaining',
      allowFallback: true,
      payload: JSON.stringify(
        {
          operationName: 'authoring_assistance',
          mode: 'agent_autonomous',
          budget: { maxDrafts: 3 },
        },
        null,
        2
      ),
    };
  }

  if (agentName === 'content-creator-agent') {
    return {
      sessionId: '',
      curriculumId: '',
      stepId: '',
      conceptIds: 'concept_1',
      selectedNodeIds: '',
      selectedCardIds: '',
      desiredCardTypes: 'explanation, recall',
      documentIds: '',
      requestedTools: '',
      studyMode: 'knowledge_gaining',
      allowFallback: true,
      payload: JSON.stringify(
        {
          operationName: 'authoring_assistance',
          mode: 'agent_autonomous',
          budget: { maxDrafts: 3 },
        },
        null,
        2
      ),
    };
  }

  if (agentName === 'lesson-plan-generator') {
    return {
      sessionId: 'session_demo',
      curriculumId: 'curriculum_demo',
      stepId: '',
      conceptIds: '',
      selectedNodeIds: 'node_frontier_1, node_frontier_2',
      selectedCardIds: '',
      desiredCardTypes: '',
      documentIds: '',
      requestedTools: '',
      studyMode: 'knowledge_gaining',
      allowFallback: true,
      payload: JSON.stringify({ lessonObjective: 'Reinforce unstable frontier concepts' }, null, 2),
    };
  }

  return {
    sessionId: 'session_demo',
    curriculumId: '',
    stepId: '',
    conceptIds: 'concept_stability',
    selectedNodeIds: '',
    selectedCardIds: '',
    desiredCardTypes: '',
    documentIds: '',
    requestedTools: '',
    studyMode: 'knowledge_gaining',
    allowFallback: true,
    payload: JSON.stringify({ explain: true }, null, 2),
  };
}

function reviewTone(decision: IReviewRoutingDecision | undefined): string {
  if (decision === undefined) {
    return 'border-border/70 bg-background/70';
  }

  if (!decision.allowed) {
    return 'border-destructive/40 bg-destructive/5';
  }

  if (decision.requiresReview) {
    return 'border-primary/30 bg-primary/5';
  }

  return 'border-emerald-500/30 bg-emerald-500/5';
}

function agentFamilySummary(agent: IAgentWrapperDefinition): string {
  return `${formatLabel(agent.family)} • ${agent.outputKind} • ${formatLabel(agent.executionMode)}`;
}

function ContextSummaryPreview(props: { result: IAgentRunResult | undefined }): React.JSX.Element {
  const result = props.result;

  if (result === undefined) {
    return (
      <p className="text-sm text-muted-foreground">
        Run an agent to inspect the context pack summary and any open questions.
      </p>
    );
  }

  const openQuestions = Array.isArray(result.contextPack['openQuestions'])
    ? (result.contextPack['openQuestions'] as string[])
    : [];

  const contextSummary = result.contextPack['summary'];
  const summaryText = typeof contextSummary === 'string' ? contextSummary : 'No summary available.';

  return (
    <div>
      <p className="text-sm text-muted-foreground">{summaryText}</p>
      {openQuestions.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Open questions
          </p>
          <ul className="mt-2 space-y-1 text-sm text-foreground">
            {openQuestions.map((question) => (
              <li key={question}>• {question}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ResultPreview(props: { result: IAgentRunResult | undefined }): React.JSX.Element {
  const result = props.result;

  if (result === undefined) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
        Run an agent to inspect the rendered prompt, execution envelope, and runtime metadata.
      </div>
    );
  }

  const sections = Array.isArray(result.contextPack['sections'])
    ? (result.contextPack['sections'] as Record<string, unknown>[])
    : [];
  const promptRecord =
    result.prompt !== null && result.prompt !== undefined
      ? (result.prompt as unknown as Record<string, unknown>)
      : null;
  const promptTemplateId = result.prompt?.templateId ?? 'No prompt';
  const promptOperationName =
    typeof promptRecord?.['operationName'] === 'string' ? promptRecord['operationName'] : '—';
  const promptProfileVersion =
    typeof promptRecord?.['promptProfileVersion'] === 'string'
      ? promptRecord['promptProfileVersion']
      : '—';
  const promptBuilderId =
    typeof promptRecord?.['promptBuilderId'] === 'string' ? promptRecord['promptBuilderId'] : '—';
  const outputSchemaId =
    typeof promptRecord?.['outputSchemaId'] === 'string' ? promptRecord['outputSchemaId'] : '—';
  const promptScope =
    promptRecord !== null && promptRecord['scope'] !== undefined && promptRecord['scope'] !== null
      ? JSON.stringify(promptRecord['scope'])
      : '—';
  const promptSlots = result.prompt?.slots ?? {};
  const modelRouting =
    typeof result.execution?.['modelRouting'] === 'object' &&
    result.execution['modelRouting'] !== null
      ? (result.execution['modelRouting'] as Record<string, unknown>)
      : null;
  const provider =
    typeof modelRouting?.['effectiveProvider'] === 'string'
      ? modelRouting['effectiveProvider']
      : result.provider;
  const model =
    typeof modelRouting?.['effectiveModel'] === 'string'
      ? modelRouting['effectiveModel']
      : result.model;
  const fallbackUsed = modelRouting?.['fallbackUsed'] === true;
  const executionResult =
    typeof result.execution?.['result'] === 'object' && result.execution['result'] !== null
      ? (result.execution['result'] as Record<string, unknown>)
      : {};
  const graphReadiness =
    typeof result.execution?.['graphReadiness'] === 'object' && result.execution['graphReadiness'] !== null
      ? (result.execution['graphReadiness'] as Record<string, unknown>)
      : executionResult;
  const graphPrompt =
    typeof graphReadiness['graphPrompt'] === 'object' && graphReadiness['graphPrompt'] !== null
      ? (graphReadiness['graphPrompt'] as Record<string, unknown>)
      : null;
  const graphPopulation =
    typeof graphPrompt?.['populationReport'] === 'object' && graphPrompt['populationReport'] !== null
      ? (graphPrompt['populationReport'] as Record<string, unknown>)
      : null;
  const missingGraphFields = Array.isArray(graphPopulation?.['missingRequiredFields'])
    ? (graphPopulation['missingRequiredFields'] as unknown[])
    : [];
  const rawGraphStatus = graphReadiness['status'];
  const graphStatus =
    typeof rawGraphStatus === 'string' || typeof rawGraphStatus === 'number'
      ? String(rawGraphStatus)
      : 'unknown';

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border/70 bg-background/70 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Template</p>
          <p className="mt-2 text-sm font-medium text-foreground">{promptTemplateId}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-background/70 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Context sections
          </p>
          <p className="mt-2 text-sm font-medium text-foreground">{sections.length}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-background/70 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Execution</p>
          <p className="mt-2 text-sm font-medium text-foreground">
            {result.execution === null ? 'Preview only' : 'Executed'}
          </p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border/70 bg-background/70 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Operation</p>
          <p className="mt-2 text-sm font-medium text-foreground">{promptOperationName}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-background/70 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Prompt profile</p>
          <p className="mt-2 text-sm font-medium text-foreground">{promptProfileVersion}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-background/70 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Prompt builder</p>
          <p className="mt-2 break-all text-sm font-medium text-foreground">{promptBuilderId}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-background/70 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Output schema</p>
          <p className="mt-2 break-all text-sm font-medium text-foreground">{outputSchemaId}</p>
        </div>
      </div>
      <div className="rounded-xl border border-border/70 bg-background/70 p-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Scope</p>
        <p className="mt-2 break-all font-mono text-xs text-foreground">{promptScope}</p>
      </div>
      <div className="rounded-xl border border-border/70 bg-background/70 p-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Provider / model
        </p>
        <p className="mt-2 text-sm font-medium text-foreground">
          {provider ?? 'None'} / {model ?? 'None'}
          {fallbackUsed ? ' (fallback)' : ''}
        </p>
      </div>

      {graphPrompt !== null && (
        <div className="rounded-xl border border-border/70 bg-background/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Graph readiness
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {graphStatus}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {missingGraphFields.length === 0
                ? 'All required graph prompt fields populated'
                : `${String(missingGraphFields.length)} missing field(s)`}
            </p>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <CollapsibleInsetPanel title="Human graph context">
              <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
                {JSON.stringify(graphPrompt['pedagogicalContext'], null, 2)}
              </pre>
            </CollapsibleInsetPanel>
            <CollapsibleInsetPanel title="Service contract">
              <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
                {JSON.stringify(graphPrompt['serviceContract'], null, 2)}
              </pre>
            </CollapsibleInsetPanel>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <CollapsibleInsetPanel title="Prompt slots">
          <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
            {JSON.stringify(promptSlots, null, 2)}
          </pre>
        </CollapsibleInsetPanel>
        <CollapsibleInsetPanel title="Execution envelope">
          <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
            {JSON.stringify(result.execution, null, 2)}
          </pre>
        </CollapsibleInsetPanel>
      </div>
    </div>
  );
}

export function AgentWorkbench(): React.JSX.Element | null {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const requestedAgent = searchParams.get('agent') ?? DEFAULT_AGENT;
  const [selectedAgentName, setSelectedAgentName] = React.useState(requestedAgent);
  const [formState, setFormState] = React.useState<IWorkbenchFormState>(() =>
    defaultFormFor(requestedAgent)
  );
  const [formError, setFormError] = React.useState<string | null>(null);
  const [latestRun, setLatestRun] = React.useState<IAgentRunResult | undefined>(undefined);
  const [catalogOpen, setCatalogOpen] = React.useState(true);
  const [contractOpen, setContractOpen] = React.useState(true);

  const agentsQuery = useAgents();
  const toolsQuery = useAgentTools();
  const loadOptionalContext = false;
  const sessionsQuery = useSessions({ limit: 100 }, { enabled: loadOptionalContext });
  const curriculaQuery = useCurricula({ enabled: loadOptionalContext });
  const cardsQuery = useCards({ limit: 100 }, { enabled: loadOptionalContext });
  const documentsQuery = useIngestionDocuments({ enabled: loadOptionalContext });
  const nextStepQuery = useNextStep(formState.sessionId as SessionId, {
    enabled: loadOptionalContext,
  });
  const selectedAgentQuery = useAgent(selectedAgentName, {
    enabled: selectedAgentName.trim().length > 0,
  });
  const preflightMutation = useAgentPreflight(selectedAgentName);
  const runMutation = useAgentRun(selectedAgentName, {
    onSuccess: (response) => {
      setLatestRun(response.data);
    },
  });

  React.useEffect(() => {
    setSelectedAgentName(requestedAgent);
    setFormState(defaultFormFor(requestedAgent));
    setFormError(null);
  }, [requestedAgent]);

  if (user === null) {
    return null;
  }

  const userId = user.id;

  const selectedAgent = selectedAgentQuery.data?.data;
  const catalog = agentsQuery.data?.data.agents ?? [];
  const compositeTools = toolsQuery.data?.data.tools ?? [];
  const compositeToolNames = compositeTools.map((tool) => tool.name);
  const sessions = sessionsQuery.data?.data.sessions ?? [];
  const curricula = curriculaQuery.data?.data ?? [];
  const cards = cardsQuery.data?.data.items ?? [];
  const documents = documentsQuery.data?.data ?? [];
  const curriculumNodeRows = curricula.flatMap(curriculumNodes);
  const nextStep = nextStepQuery.data?.data.nextStep;
  const sessionIds = uniqueStrings(sessions.map((session) => session.id));
  const curriculumIds = uniqueStrings(curricula.map((curriculum) => curriculum.id));
  const stepIds = uniqueStrings([nextStep?.id]);
  const cardIds = uniqueStrings(cards.map((card) => card.id));
  const documentIds = uniqueStrings(documents.map((document) => document.id));
  const conceptIds = uniqueStrings([
    ...cards.flatMap((card) => [
      ...arrayFromUnknown(card.primaryConceptId),
      ...arrayFromUnknown(card.relatedConceptIds),
      ...arrayFromUnknown(card.anchoredCkgNodeIds),
      ...arrayFromUnknown(card.anchoredPkgNodeIds),
      ...arrayFromUnknown(card.knowledgeNodeIds),
    ]),
    ...curriculumNodeRows.map((node) => node['ckgConceptId']),
  ]);
  const nodeIds = uniqueStrings([
    ...cards.flatMap((card) => [
      ...arrayFromUnknown(card.primaryConceptId),
      ...arrayFromUnknown(card.relatedConceptIds),
      ...arrayFromUnknown(card.anchoredCkgNodeIds),
      ...arrayFromUnknown(card.anchoredPkgNodeIds),
      ...arrayFromUnknown(card.knowledgeNodeIds),
    ]),
    ...curriculumNodeRows.map((node) => node['id']),
    ...curriculumNodeRows.map((node) => node['stableNodeKey']),
  ]);
  const latestDecision = preflightMutation.data?.data.decision ?? latestRun?.preflight;
  const workbenchShellColumns = catalogOpen
    ? 'xl:grid-cols-[320px_minmax(0,1fr)]'
    : 'xl:grid-cols-1';

  function updateField<Key extends keyof IWorkbenchFormState>(
    key: Key,
    value: IWorkbenchFormState[Key]
  ): void {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  function buildRequestOrError(): IAgentRunRequest | null {
    try {
      setFormError(null);
      const request = toRunRequest(userId, formState);
      const maxLatencySeconds = selectedAgent?.maxLatencySeconds;
      if (typeof maxLatencySeconds !== 'number' || maxLatencySeconds <= 0) {
        return request;
      }
      return { ...request, requestTimeoutMs: Math.ceil(maxLatencySeconds * 1000) };
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'The payload must be valid JSON before continuing.'
      );
      return null;
    }
  }

  async function handlePreflight(): Promise<void> {
    const request = buildRequestOrError();
    if (request === null) {
      return;
    }

    try {
      await preflightMutation.mutateAsync(request);
    } catch {
      // React Query keeps the error state for rendering below.
    }
  }

  async function handleRun(): Promise<void> {
    const request = buildRequestOrError();
    if (request === null) {
      return;
    }

    try {
      await runMutation.mutateAsync(request);
    } catch {
      // React Query keeps the error state for rendering below.
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <WorkbenchDatalists
        agentNames={catalog.map((agent) => agent.name)}
        compositeTools={compositeToolNames}
        sessionIds={sessionIds}
        curriculumIds={curriculumIds}
        stepIds={stepIds}
        conceptIds={conceptIds}
        nodeIds={nodeIds}
        cardIds={cardIds}
        documentIds={documentIds}
      />
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Agent Runtime
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            Agent Workbench
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Inspect wrapper contracts, preview review routing, and execute agent runs against the
            live app context without stepping outside the shared kernel.
          </p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Signed in as</p>
          <p className="mt-1 text-sm font-medium text-foreground">{user.email}</p>
        </div>
      </header>

      <div className="space-y-6">
        {!catalogOpen ? (
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCatalogOpen(true);
              }}
            >
              <ChevronRight className="mr-2 h-4 w-4" aria-hidden="true" />
              Wrapper Catalog
            </Button>
          </div>
        ) : null}

        <div className={['grid gap-6', workbenchShellColumns].join(' ')}>
          {catalogOpen ? (
            <CollapsibleCard
              title="Wrapper Catalog"
              icon={Bot}
              open={catalogOpen}
              onOpenChange={setCatalogOpen}
              className="min-w-0"
              contentClassName="space-y-3"
            >
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Agent</span>
                <input
                  list="agent-options"
                  value={selectedAgentName}
                  onChange={(event) => {
                    setSelectedAgentName(event.target.value);
                    setFormState(defaultFormFor(event.target.value));
                    setFormError(null);
                    setLatestRun(undefined);
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                />
              </label>
              {agentsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading registered wrappers…</p>
              ) : agentsQuery.isError ? (
                <p className="text-sm text-destructive">
                  {formatApiErrorMessage(agentsQuery.error, {
                    action: 'load the agent catalog',
                    fallback: 'The agent runtime catalog is currently unavailable.',
                  })}
                </p>
              ) : (
                catalog.map((agent) => {
                  const isSelected = agent.name === selectedAgentName;
                  return (
                    <button
                      key={agent.name}
                      type="button"
                      onClick={() => {
                        setSelectedAgentName(agent.name);
                        setFormState(defaultFormFor(agent.name));
                        setFormError(null);
                        setLatestRun(undefined);
                      }}
                      className={[
                        'w-full rounded-xl border px-3 py-3 text-left transition-colors',
                        isSelected
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-border/70 bg-background/70 hover:bg-muted/40',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{agent.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {agentFamilySummary(agent)}
                          </p>
                        </div>
                        <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {agent.executionMode.replaceAll('_', ' ')}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </CollapsibleCard>
          ) : null}

          <div className="min-w-0 space-y-6">
            {contractOpen ? (
              <CollapsibleCard
                title="Wrapper contract"
                open={contractOpen}
                onOpenChange={setContractOpen}
                className="min-w-0"
                contentClassName="space-y-4"
              >
                {selectedAgentQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading wrapper details…</p>
                ) : selectedAgentQuery.isError || selectedAgent === undefined ? (
                  <p className="text-sm text-destructive">
                    {formatApiErrorMessage(selectedAgentQuery.error, {
                      action: 'load this wrapper',
                      fallback: 'We could not load the selected wrapper contract.',
                    })}
                  </p>
                ) : (
                  <>
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                      <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Purpose
                        </p>
                        <p className="mt-2 text-sm text-foreground">{selectedAgent.purpose}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <span className="rounded-full border border-border/70 px-2 py-1 text-[11px] text-muted-foreground">
                            {formatLabel(selectedAgent.family)}
                          </span>
                          <span className="rounded-full border border-border/70 px-2 py-1 text-[11px] text-muted-foreground">
                            {selectedAgent.outputKind}
                          </span>
                          <span className="rounded-full border border-border/70 px-2 py-1 text-[11px] text-muted-foreground">
                            {selectedAgent.writeAuthority}
                          </span>
                        </div>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Review path
                        </p>
                        <ul className="mt-2 space-y-1 text-sm text-foreground">
                          {selectedAgent.reviewPath.map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                        <div className="flex items-center gap-2">
                          <Wrench className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          <h3 className="text-sm font-semibold text-foreground">Tool belt</h3>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {selectedAgent.toolBelt.description}
                        </p>
                        <div className="mt-4 grid gap-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              Read tools
                            </p>
                            <p className="mt-1 text-sm text-foreground">
                              {selectedAgent.toolBelt.readTools.length > 0
                                ? selectedAgent.toolBelt.readTools.join(', ')
                                : 'None'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              Composite tools
                            </p>
                            <p className="mt-1 text-sm text-foreground">
                              {selectedAgent.toolBelt.compositeTools.length > 0
                                ? selectedAgent.toolBelt.compositeTools.join(', ')
                                : 'None'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              Forbidden
                            </p>
                            <p className="mt-1 text-sm text-foreground">
                              {selectedAgent.toolBelt.forbiddenTools.length > 0
                                ? selectedAgent.toolBelt.forbiddenTools.join(', ')
                                : 'None'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          <h3 className="text-sm font-semibold text-foreground">
                            Runtime metadata
                          </h3>
                        </div>
                        <div className="mt-4 grid gap-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              Primary composite
                            </p>
                            <p className="mt-1 text-sm text-foreground">
                              {selectedAgent.primaryCompositeTool ?? 'None'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              Required fields
                            </p>
                            <p className="mt-1 text-sm text-foreground">
                              {selectedAgent.requiredFields.length > 0
                                ? selectedAgent.requiredFields.join(', ')
                                : 'None'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              Composite registry
                            </p>
                            <p className="mt-1 text-sm text-foreground">
                              {compositeTools.length} tools published
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CollapsibleCard>
            ) : (
              <div className="flex">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setContractOpen(true);
                  }}
                >
                  <ChevronRight className="mr-2 h-4 w-4" aria-hidden="true" />
                  Wrapper contract
                </Button>
              </div>
            )}

            <CollapsibleCard
              title="Workbench request"
              className="min-w-0"
              contentClassName="space-y-4"
            >
              <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Required for {selectedAgentName}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(selectedAgent?.requiredFields ?? []).map((field) => (
                    <span
                      key={field}
                      className="rounded-full border border-border/70 px-2 py-1 text-xs text-foreground"
                    >
                      {field}
                    </span>
                  ))}
                  {(selectedAgent?.requiredFields ?? []).length === 0 ? (
                    <span className="text-sm text-muted-foreground">No extra required fields.</span>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <FieldLabel required={fieldRequired(selectedAgent, 'sessionId')}>
                    Session ID
                  </FieldLabel>
                  <input
                    list="session-id-options"
                    value={formState.sessionId}
                    onChange={(event) => {
                      updateField('sessionId', event.target.value);
                    }}
                    required={fieldRequired(selectedAgent, 'sessionId')}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <FieldLabel required={fieldRequired(selectedAgent, 'curriculumId')}>
                    Curriculum ID
                  </FieldLabel>
                  <input
                    list="curriculum-id-options"
                    value={formState.curriculumId}
                    onChange={(event) => {
                      updateField('curriculumId', event.target.value);
                    }}
                    required={fieldRequired(selectedAgent, 'curriculumId')}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <FieldLabel required={fieldRequired(selectedAgent, 'stepId')}>Step ID</FieldLabel>
                  <input
                    list="step-id-options"
                    value={formState.stepId}
                    onChange={(event) => {
                      updateField('stepId', event.target.value);
                    }}
                    required={fieldRequired(selectedAgent, 'stepId')}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <FieldLabel required={fieldRequired(selectedAgent, 'conceptIds')}>
                    Concept IDs
                  </FieldLabel>
                  <input
                    list="concept-id-options"
                    value={formState.conceptIds}
                    onChange={(event) => {
                      updateField('conceptIds', event.target.value);
                    }}
                    required={fieldRequired(selectedAgent, 'conceptIds')}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <FieldLabel required={fieldRequired(selectedAgent, 'selectedNodeIds')}>
                    Selected node IDs
                  </FieldLabel>
                  <input
                    list="selected-node-id-options"
                    value={formState.selectedNodeIds}
                    onChange={(event) => {
                      updateField('selectedNodeIds', event.target.value);
                    }}
                    required={fieldRequired(selectedAgent, 'selectedNodeIds')}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <FieldLabel required={fieldRequired(selectedAgent, 'selectedCardIds')}>
                    Selected card IDs
                  </FieldLabel>
                  <input
                    list="selected-card-id-options"
                    value={formState.selectedCardIds}
                    onChange={(event) => {
                      updateField('selectedCardIds', event.target.value);
                    }}
                    required={fieldRequired(selectedAgent, 'selectedCardIds')}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Desired card types</span>
                  <input
                    list="desired-card-type-options"
                    value={formState.desiredCardTypes}
                    onChange={(event) => {
                      updateField('desiredCardTypes', event.target.value);
                    }}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <FieldLabel required={fieldRequired(selectedAgent, 'documentIds')}>
                    Document IDs
                  </FieldLabel>
                  <input
                    list="document-id-options"
                    value={formState.documentIds}
                    onChange={(event) => {
                      updateField('documentIds', event.target.value);
                    }}
                    required={fieldRequired(selectedAgent, 'documentIds')}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Study mode</span>
                  <input
                    list="study-mode-options"
                    value={formState.studyMode}
                    onChange={(event) => {
                      updateField('studyMode', event.target.value);
                    }}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                  />
                </label>
              </div>

              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Requested tools</span>
                <input
                  list="requested-tool-options"
                  value={formState.requestedTools}
                  onChange={(event) => {
                    updateField('requestedTools', event.target.value);
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                  placeholder="session.get-session, get-session-explanation-pack"
                />
              </label>

              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">Payload JSON</span>
                <textarea
                  value={formState.payload}
                  onChange={(event) => {
                    updateField('payload', event.target.value);
                  }}
                  className="min-h-[220px] w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-sm text-foreground"
                />
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={formState.allowFallback}
                  onChange={(event) => {
                    updateField('allowFallback', event.target.checked);
                  }}
                  className="h-4 w-4"
                />
                <span className="text-foreground">Allow fallback model on provider outage</span>
              </label>

              {formError !== null && <p className="text-sm text-destructive">{formError}</p>}

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void handlePreflight();
                  }}
                  disabled={preflightMutation.isPending || runMutation.isPending}
                >
                  <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                  {preflightMutation.isPending ? 'Checking…' : 'Run preflight'}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    void handleRun();
                  }}
                  disabled={preflightMutation.isPending || runMutation.isPending}
                >
                  <Play className="mr-2 h-4 w-4" aria-hidden="true" />
                  {runMutation.isPending ? 'Running…' : 'Execute agent'}
                </Button>
              </div>
            </CollapsibleCard>
          </div>
        </div>

        <div className="space-y-6">
          <CollapsibleCard title="Preflight and review routing">
            <div className={['rounded-xl border p-4', reviewTone(latestDecision)].join(' ')}>
              {latestDecision === undefined ? (
                <p className="text-sm text-muted-foreground">
                  Preflight will classify risk, review requirements, and denied actions here.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-border/70 px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      Risk: {latestDecision.riskLevel}
                    </span>
                    <span className="rounded-full border border-border/70 px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {latestDecision.requiresReview ? 'Review required' : 'Preview path'}
                    </span>
                    <span className="rounded-full border border-border/70 px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {latestDecision.allowed ? 'Allowed' : 'Blocked'}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Review queue
                    </p>
                    <p className="mt-1 text-sm text-foreground">
                      {latestDecision.reviewQueue ?? 'No queue required'}
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Review path
                      </p>
                      <ul className="mt-2 space-y-1 text-sm text-foreground">
                        {latestDecision.reviewPath.map((item) => (
                          <li key={item}>• {item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Blocked reasons
                      </p>
                      <ul className="mt-2 space-y-1 text-sm text-foreground">
                        {(latestDecision.blockedReasons.length > 0
                          ? latestDecision.blockedReasons
                          : ['None']
                        ).map((item) => (
                          <li key={item}>• {item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Allowed actions
                    </p>
                    <p className="mt-1 text-sm text-foreground">
                      {latestDecision.allowedActions.length > 0
                        ? latestDecision.allowedActions.join(', ')
                        : 'None'}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Reasons</p>
                    <ul className="mt-2 space-y-1 text-sm text-foreground">
                      {latestDecision.reasons.map((reason) => (
                        <li key={reason}>• {reason}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {(preflightMutation.isError || runMutation.isError) && (
              <p className="mt-4 text-sm text-destructive">
                {formatApiErrorMessage(preflightMutation.error ?? runMutation.error, {
                  action: 'run the agent workbench flow',
                  fallback: 'The agent runtime rejected this request.',
                })}
              </p>
            )}
          </CollapsibleCard>

          <CollapsibleCard title="Run artifact">
            <ResultPreview result={latestRun} />
          </CollapsibleCard>

          <CollapsibleCard title="Context summary">
            <ContextSummaryPreview result={latestRun} />
          </CollapsibleCard>
        </div>
      </div>
    </div>
  );
}
