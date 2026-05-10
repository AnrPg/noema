export type AgentExecutionMode =
  | 'preview'
  | 'ingestion_concept_extraction'
  | 'content_creation_orchestrator'
  | 'content_intent_normalizer'
  | 'learner_state_summarizer'
  | 'content_pedagogy_planner'
  | 'content_creator'
  | 'content_transform'
  | 'lesson_plan'
  | 'graph_intervention_orchestrator'
  | 'graph_proposal'
  | 'curriculum_outline'
  | 'curriculum_draft'
  | 'curriculum_revision'
  | 'calibration_coach'
  | 'mental_debugger'
  | 'patch_planner'
  | 'strategy_replanning'
  | 'cognitive_copilot'
  | 'watchtower_governance'
  | 'mode_preference'
  | 'taxonomy_curator'
  | 'pedagogy_guardian';
export type AgentRiskLevel = 'low' | 'medium' | 'high';

export interface ICompositeToolDefinition {
  name: string;
  version: string;
  description: string;
  priority: string;
  tags: string[];
  inputSchema: Record<string, unknown>;
}

export interface IToolBeltDefinition {
  id: string;
  description: string;
  readTools: string[];
  writeTools: string[];
  compositeTools: string[];
  forbiddenTools: string[];
  reviewedWriteByDefault: boolean;
  maxLatencyMs: number;
}

export interface IAgentWrapperDefinition {
  name: string;
  family: string;
  purpose: string;
  executionMode: AgentExecutionMode;
  toolBeltId: string;
  primaryCompositeTool: string | null;
  outputKind: string;
  writeAuthority: string;
  reviewPath: string[];
  instructions: string[];
  requiredFields: string[];
  provider?: string | null;
  model?: string | null;
  enabled?: boolean;
  maxLatencySeconds?: number | null;
  budget?: Record<string, unknown>;
  displayName?: string | null;
  configVersionId?: string | null;
  toolBelt: IToolBeltDefinition;
}

export interface IAgentRunRequest {
  sessionId?: string | null;
  userId: string;
  curriculumId?: string | null;
  stepId?: string | null;
  conceptIds?: string[];
  selectedNodeIds?: string[];
  selectedCardIds?: string[];
  desiredCardTypes?: string[];
  documentIds?: string[];
  requestedTools?: string[];
  operationName?: string | null;
  promptProfileVersion?: string | null;
  graphExpansionScope?: {
    scopeType: 'whole_pkg' | 'node' | 'domain';
    nodeIds?: string[];
    domain?: string | null;
  } | null;
  studyMode?: string | null;
  executionPreference?: 'auto' | 'realtime' | 'batch';
  allowFallback?: boolean;
  requestTimeoutMs?: number;
  payload?: Record<string, unknown>;
}

export interface IAgentExecutionPlan {
  strategy: 'realtime' | 'batch';
  provider?: string | null;
  model?: string | null;
  batchAllowed?: boolean;
  batchPreferred?: boolean;
  mode?: string | null;
  maxLatencySeconds?: number | null;
}

export interface IReviewRoutingDecision {
  allowed: boolean;
  riskLevel: AgentRiskLevel;
  requiresReview: boolean;
  reviewQueue: string | null;
  reviewPath: string[];
  reasons: string[];
  blockedReasons: string[];
  allowedActions: string[];
  deniedActions: string[];
}

export interface IAgentPreflightResult {
  agent: IAgentWrapperDefinition;
  request: IAgentRunRequest;
  decision: IReviewRoutingDecision;
  executionPlan: IAgentExecutionPlan;
}

export interface IPromptEnvelope {
  templateId: string;
  systemInstructions: string[];
  operationName?: string | null;
  promptProfileVersion?: string | null;
  promptBuilderId?: string | null;
  outputSchemaId?: string | null;
  scope?: Record<string, unknown> | null;
  slots: Record<string, unknown>;
}

export interface IAgentRunResult {
  runId: string;
  jobId?: string | null;
  agent: IAgentWrapperDefinition;
  request: IAgentRunRequest;
  preflight: IReviewRoutingDecision;
  executionPlan?: IAgentExecutionPlan;
  status?: string;
  provider?: string | null;
  model?: string | null;
  providerBatchId?: string | null;
  pollAfterSeconds?: number | null;
  contextPack: Record<string, unknown>;
  prompt: IPromptEnvelope | null;
  execution: Record<string, unknown> | null;
}

export interface IAgentListResponse {
  data: {
    agents: IAgentWrapperDefinition[];
    count: number;
  };
}

export interface IAgentDetailResponse {
  data: IAgentWrapperDefinition;
}

export interface IAgentPreflightResponse {
  data: IAgentPreflightResult;
}

export interface IAgentRunResponse {
  data: IAgentRunResult;
}

export interface IAgentAsyncRunResponse {
  data: IAgentRunResult;
}

export interface IAgentBatchAttempt {
  attemptId: string;
  jobId: string;
  attemptKind: string;
  status: string;
  request?: Record<string, unknown> | null;
  response?: Record<string, unknown> | null;
  errorMessage?: string | null;
  startedAt: string;
  finishedAt?: string | null;
}

export interface IAgentBatchEvent {
  eventId: string;
  topic: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  status: string;
  createdAt: string;
  publishedAt?: string | null;
}

export interface IAgentBatchJob {
  jobId: string;
  runId: string;
  agentName: string;
  provider: string;
  model: string;
  executionStrategy: string;
  status: string;
  providerBatchId?: string | null;
  providerStatus?: string | null;
  request: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  errorMessage?: string | null;
  submittedAt?: string | null;
  providerSubmittedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  isCancellable: boolean;
  cancellationWindow: 'pre_submit_only' | 'none';
}

export interface IAgentBatchJobDetailResponse {
  data: {
    job: IAgentBatchJob;
    attempts: IAgentBatchAttempt[];
    events: IAgentBatchEvent[];
  };
}

export interface IAgentBatchJobListResponse {
  data: {
    items: IAgentBatchJob[];
    count: number;
  };
}

export interface ICompositeToolListResponse {
  data: {
    tools: ICompositeToolDefinition[];
    count: number;
  };
}

export interface IAgentRunListItem {
  runId: string;
  agentName: string;
  family: string;
  executionMode: string;
  provider?: string | null;
  model?: string | null;
  userId: string;
  status: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  costUsd?: number | null;
  latencyMs?: number | null;
  createdAt: string;
  completedAt?: string | null;
  errorMessage?: string | null;
  configVersionId?: string | null;
}

export interface IAgentToolCallDetail {
  seq: number;
  sourceKind: string;
  service: string;
  toolName: string;
  latencyMs: number;
  success: boolean;
  request: Record<string, unknown>;
  response?: Record<string, unknown> | null;
  errorMessage?: string | null;
  occurredAt: string;
}

export interface IAgentRunEventDetail {
  seq: number;
  eventType: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface IAgentRunDetail extends IAgentRunListItem {
  outputKind: string;
  writeAuthority: string;
  enabled: boolean;
  sessionId?: string | null;
  curriculumId?: string | null;
  stepId?: string | null;
  request: Record<string, unknown>;
  preflight: Record<string, unknown>;
  contextPack: Record<string, unknown>;
  prompt: Record<string, unknown>;
  execution?: Record<string, unknown> | null;
  transcript: Record<string, unknown>;
  errorCode?: string | null;
  startedAt: string;
  events: IAgentRunEventDetail[];
  toolCalls: IAgentToolCallDetail[];
}

export interface IAgentStatsBucket {
  key: string;
  runCount: number;
  totalTokens: number;
  totalCostUsd: number;
  averageLatencyMs: number;
  successRuns: number;
  failedRuns: number;
}

export interface IAgentStatsResponse {
  data: {
    totals: {
      totalRuns: number;
      successRuns: number;
      failedRuns: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      totalTokens: number;
      totalCostUsd: number;
      averageLatencyMs: number;
    };
    byAgent: IAgentStatsBucket[];
    byUser: IAgentStatsBucket[];
  };
}

export interface IAgentRunListResponse {
  data: {
    items: IAgentRunListItem[];
    total: number;
    limit: number;
    offset: number;
  };
}

export interface IAgentRunDetailResponse {
  data: IAgentRunDetail;
}

export interface IAgentToolStatsItem {
  agentName: string;
  sourceKind: string;
  service: string;
  toolName: string;
  callCount: number;
  averageLatencyMs: number;
  successCount: number;
  failureCount: number;
}

export interface IAgentToolStatsResponse {
  data: {
    items: IAgentToolStatsItem[];
  };
}

export interface IAgentUserStatsResponse {
  data: {
    items: IAgentStatsBucket[];
    count: number;
  };
}

export interface IAgentConfigVersion {
  versionId: string;
  agentName: string;
  versionNumber: number;
  status: string;
  actorUserId?: string | null;
  notes?: string | null;
  wrapper: Record<string, unknown>;
  toolBelt: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  activatedAt?: string | null;
}

export interface IAgentConfigDetailResponse {
  data: {
    agentName: string;
    active: IAgentConfigVersion | null;
    drafts: IAgentConfigVersion[];
    history: IAgentConfigVersion[];
  };
}

export interface IAgentConfigListResponse {
  data: {
    items: IAgentConfigVersion[];
    count: number;
  };
}

export interface IAgentConfigDraftRequest {
  actorUserId: string;
  notes?: string | null;
  wrapper: Record<string, unknown>;
  toolBelt: Record<string, unknown>;
}

export interface IAgentConfigVersionResponse {
  data: IAgentConfigVersion;
}

export interface IAgentMonitorEvent {
  eventId: number;
  runId: string;
  eventType: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  agentName: string;
  userId: string;
  status: string;
  provider?: string | null;
  model?: string | null;
  latencyMs?: number | null;
  totalTokens?: number | null;
  costUsd?: number | null;
}
