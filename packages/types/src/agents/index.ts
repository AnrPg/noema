/**
 * @noema/types - Agent Kernel and Capability Contracts
 *
 * Shared foundation contracts for Noema's agent-native platform.
 * These types are intentionally generic so every service and agent wrapper
 * can build on one consistent substrate.
 */

import type {
  AgentId,
  CorrelationId,
  CausationId,
  SessionId,
  StepId,
  ToolId,
  TraceId,
  UserId,
} from '../branded-ids/index.js';
import type { JsonValue, Metadata, Probability } from '../base/index.js';

// ============================================================================
// Core Enumerations
// ============================================================================

export const CapabilityClass = {
  FUNCTION: 'function',
  TOOL: 'tool',
} as const;

export type CapabilityClass = (typeof CapabilityClass)[keyof typeof CapabilityClass];

export const CapabilityTag = {
  READ: 'read',
  SEARCH: 'search',
  INSPECT: 'inspect',
  AGGREGATE: 'aggregate',
  EXPLAIN: 'explain',
  SIMULATE: 'simulate',
  PROPOSE: 'propose',
  VALIDATE: 'validate',
  REVIEW: 'review',
  COMMIT: 'commit',
  REPAIR: 'repair',
  DIFF: 'diff',
  AUDIT: 'audit',
  REPLAY: 'replay',
  GOVERN: 'govern',
  SURFACE: 'surface',
  PLAN: 'plan',
  RANK: 'rank',
  COMPARE: 'compare',
  FORECAST: 'forecast',
  RECOMMEND: 'recommend',
} as const;

export type CapabilityTag = (typeof CapabilityTag)[keyof typeof CapabilityTag];

export const AuthorityLabel = {
  RECORDED_FACT: 'recorded_fact',
  DETECTED_SIGNAL: 'detected_signal',
  AGENT_INFERENCE: 'agent_inference',
  AGENT_PROPOSAL: 'agent_proposal',
  VALIDATION_RESULT: 'validation_result',
  COMMITTED_ARTIFACT: 'committed_artifact',
} as const;

export type AuthorityLabel = (typeof AuthorityLabel)[keyof typeof AuthorityLabel];

export const RiskClassification = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

export type RiskClassification =
  (typeof RiskClassification)[keyof typeof RiskClassification];

export const UncertaintyClassification = {
  NONE: 'none',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  SPECULATIVE: 'speculative',
} as const;

export type UncertaintyClassification =
  (typeof UncertaintyClassification)[keyof typeof UncertaintyClassification];

export const ReviewedWriteStage = {
  SIMULATE: 'simulate',
  PROPOSE: 'propose',
  VALIDATE: 'validate',
  REVIEW: 'review',
  COMMIT: 'commit',
  REPAIR: 'repair',
  REVALIDATE: 'revalidate',
  RECOMMIT: 'recommit',
} as const;

export type ReviewedWriteStage =
  (typeof ReviewedWriteStage)[keyof typeof ReviewedWriteStage];

export const ValidationGate = {
  SCHEMA: 'schema',
  SERVICE_INVARIANT: 'service_invariant',
  PEDAGOGY_GUARDIAN: 'pedagogy_guardian',
  WATCHTOWER: 'watchtower',
  HUMAN_REVIEW: 'human_review',
} as const;

export type ValidationGate = (typeof ValidationGate)[keyof typeof ValidationGate];

export const ReviewActor = {
  NONE: 'none',
  HUMAN: 'human',
  LEARNER: 'learner',
  CURATOR: 'curator',
  ADMIN: 'admin',
  POLICY: 'policy',
} as const;

export type ReviewActor = (typeof ReviewActor)[keyof typeof ReviewActor];

export const PolicyArea = {
  VISIBILITY: 'visibility',
  PRIVACY: 'privacy',
  REVIEW: 'review',
  ACCESS: 'access',
  INTRUSIVENESS: 'intrusiveness',
  STALENESS: 'staleness',
} as const;

export type PolicyArea = (typeof PolicyArea)[keyof typeof PolicyArea];

export const PolicyDecisionDisposition = {
  ALLOW: 'allow',
  DENY: 'deny',
  DEFER: 'defer',
  REVIEW_REQUIRED: 'review_required',
  REDACT: 'redact',
} as const;

export type PolicyDecisionDisposition =
  (typeof PolicyDecisionDisposition)[keyof typeof PolicyDecisionDisposition];

export const VisibilityDisposition = {
  SHOW: 'show',
  HIDE: 'hide',
  GROUP: 'group',
  DEFER: 'defer',
  REDACT: 'redact',
} as const;

export type VisibilityDisposition =
  (typeof VisibilityDisposition)[keyof typeof VisibilityDisposition];

export const PrincipalType = {
  USER: 'user',
  AGENT: 'agent',
  SERVICE: 'service',
  SYSTEM: 'system',
} as const;

export type PrincipalType = (typeof PrincipalType)[keyof typeof PrincipalType];

export const CapabilityCostClass = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
} as const;

export type CapabilityCostClass =
  (typeof CapabilityCostClass)[keyof typeof CapabilityCostClass];

export const CapabilityConsistency = {
  EVENTUAL: 'eventual',
  STRONG: 'strong',
} as const;

export type CapabilityConsistency =
  (typeof CapabilityConsistency)[keyof typeof CapabilityConsistency];

export const AgentOutputKind = {
  ARTIFACT: 'artifact',
  PROPOSAL: 'proposal',
  EXPLANATION: 'explanation',
  RECOMMENDATION: 'recommendation',
  DECISION: 'decision',
} as const;

export type AgentOutputKind = (typeof AgentOutputKind)[keyof typeof AgentOutputKind];

export const CommitOutcomeStatus = {
  SIMULATED: 'simulated',
  PROPOSED: 'proposed',
  VALIDATED: 'validated',
  NEEDS_REVIEW: 'needs_review',
  NEEDS_REPAIR: 'needs_repair',
  COMMITTED: 'committed',
  REJECTED: 'rejected',
} as const;

export type CommitOutcomeStatus =
  (typeof CommitOutcomeStatus)[keyof typeof CommitOutcomeStatus];

// ============================================================================
// Agent Identity and Context
// ============================================================================

export interface AgentIdentity {
  agentId: AgentId;
  role: string;
  family: string;
  version: string;
  displayName?: string;
  ownerService?: string;
  toolBeltIds?: string[];
}

export interface FreshnessMetadata {
  fetchedAt: string;
  sourceVersion?: string;
  ttlMs?: number;
  expiresAt?: string;
  replayable: boolean;
  mayRefreshLive: boolean;
}

export interface ProvenanceReference {
  type:
    | 'service_fact'
    | 'event'
    | 'tool_call'
    | 'function_call'
    | 'prompt_template'
    | 'artifact'
    | 'review'
    | 'validation'
    | 'agent_run'
    | 'user_input';
  id: string;
  service?: string;
  label?: string;
  authority?: AuthorityLabel;
  capturedAt?: string;
  metadata?: Metadata;
}

export interface EvidenceReference {
  id: string;
  type:
    | 'document'
    | 'chunk'
    | 'card'
    | 'step'
    | 'evaluation'
    | 'trigger'
    | 'graph_node'
    | 'graph_edge'
    | 'curriculum_node'
    | 'retrieval_result'
    | 'review_note';
  label?: string;
  sourceService?: string;
  confidence?: Probability;
  authority: AuthorityLabel;
  provenanceRefs?: ProvenanceReference[];
}

export interface AgentRunContext {
  runId: string;
  correlationId: CorrelationId;
  causationId?: CausationId;
  traceId?: TraceId;
  principalType: PrincipalType;
  initiatedByUserId?: UserId;
  sessionId?: SessionId;
  stepId?: StepId;
  startedAt: string;
  deadlineMs?: number;
  metadata?: Metadata;
}

export interface AgentContextSection<TValue = JsonValue> {
  key: string;
  title?: string;
  authority: AuthorityLabel;
  sourceService?: string;
  value: TValue;
  freshness?: FreshnessMetadata;
  provenanceRefs?: ProvenanceReference[];
  evidenceRefs?: EvidenceReference[];
  reviewState?: string;
  openQuestions?: string[];
}

export interface AgentRoleContract {
  role: string;
  purpose: string;
  requiredContextSections: string[];
  allowedCapabilityTags: CapabilityTag[];
  forbiddenCapabilityNames?: string[];
  outputContractId: string;
  writeAuthorityClass: Extract<
    AuthorityLabel,
    'agent_inference' | 'agent_proposal' | 'validation_result'
  >;
  reviewedWriteByDefault: boolean;
}

export interface AgentContextPack {
  runContext: AgentContextSection<AgentRunContext>;
  userContext: AgentContextSection[];
  roleContext: AgentContextSection[];
  learningContext: AgentContextSection[];
  artifactContext: AgentContextSection[];
  serviceFacts: AgentContextSection[];
  detectedSignals: AgentContextSection[];
  historyWindow: AgentContextSection[];
  activeSurface: AgentContextSection[];
  policyContext: AgentContextSection[];
  allowedActions: AgentContextSection<string[]>;
  forbiddenActions: AgentContextSection<string[]>;
  outputContract: AgentContextSection<Metadata>;
  provenance: AgentContextSection<ProvenanceReference[]>;
  freshness: AgentContextSection<FreshnessMetadata[]>;
  openQuestions: AgentContextSection<string[]>;
  reviewState: AgentContextSection<Metadata>;
}

// ============================================================================
// Capability Definitions
// ============================================================================

export interface ValidationRequirement {
  required: boolean;
  gates: ValidationGate[];
  blocking: boolean;
  notes?: string[];
}

export interface ReviewRequirement {
  required: boolean;
  reviewers: ReviewActor[];
  rationale?: string;
  autoCommitAllowed: boolean;
  decisionTtlMs?: number;
}

export interface CapabilityDefinition {
  name: string;
  version: string;
  description: string;
  service: string;
  capabilityClass: CapabilityClass;
  priority: 'P0' | 'P1' | 'P2';
  tags: CapabilityTag[];
  requiredScopes: string[];
  riskClassification: RiskClassification;
  reviewedWriteStages?: ReviewedWriteStage[];
  validationRequirement?: ValidationRequirement;
  reviewRequirement?: ReviewRequirement;
  outputAuthorities?: AuthorityLabel[];
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  idempotent?: boolean;
  sideEffects?: boolean;
  timeoutMs?: number;
  costClass?: CapabilityCostClass;
  consistency?: CapabilityConsistency;
}

export interface ToolDefinition extends CapabilityDefinition {
  capabilityClass: typeof CapabilityClass.TOOL;
  toolId?: ToolId;
}

export interface FunctionDefinition extends CapabilityDefinition {
  capabilityClass: typeof CapabilityClass.FUNCTION;
}

// ============================================================================
// Execution and Write Protocol
// ============================================================================

export interface PolicyDecision {
  policyArea: PolicyArea;
  decision: PolicyDecisionDisposition;
  reasonCodes: string[];
  decidedBy: string;
  decidedAt: string;
  expiresAt?: string;
  metadata?: Metadata;
}

export interface VisibilityDecision {
  surface: string;
  disposition: VisibilityDisposition;
  reasonCodes: string[];
  policyRefs?: PolicyDecision[];
  expiresAt?: string;
}

export interface ToolExecutionRequest<TInput = JsonValue> {
  toolName: string;
  input: TInput;
  context: AgentRunContext;
  dryRun?: boolean;
}

export interface ToolExecutionResult<TResult = JsonValue> {
  success: boolean;
  data?: TResult;
  error?: {
    code: string;
    message: string;
    details?: JsonValue;
  };
  authorityLabel: AuthorityLabel;
  provenance: ProvenanceReference[];
  freshness?: FreshnessMetadata;
  validationRequirement?: ValidationRequirement;
  reviewRequirement?: ReviewRequirement;
  policyDecisions?: PolicyDecision[];
  uncertainty?: UncertaintyClassification;
  metadata?: Metadata;
}

export interface FunctionExecutionResult<TResult = JsonValue> {
  success: boolean;
  data?: TResult;
  error?: {
    code: string;
    message: string;
    details?: JsonValue;
  };
  authorityLabel: AuthorityLabel;
  provenance: ProvenanceReference[];
  freshness?: FreshnessMetadata;
  policyDecisions?: PolicyDecision[];
  uncertainty?: UncertaintyClassification;
  metadata?: Metadata;
}

export interface CommitIntent {
  intentId: string;
  stage: ReviewedWriteStage;
  artifactType: string;
  artifactId?: string;
  action: string;
  ownerService: string;
  actor: AgentIdentity;
  payload: JsonValue;
  riskClassification: RiskClassification;
  validationRequirement: ValidationRequirement;
  reviewRequirement: ReviewRequirement;
  provenance: ProvenanceReference[];
  createdAt: string;
}

export interface CommitOutcome {
  intentId: string;
  status: CommitOutcomeStatus;
  committedArtifactId?: string;
  validationResultIds?: string[];
  reviewDecisionIds?: string[];
  reasons?: string[];
  committedAt?: string;
  provenance?: ProvenanceReference[];
}

export interface ReplayReference {
  replayId: string;
  runId: string;
  eventIds?: string[];
  capabilityCallIds?: string[];
  contextPackHash?: string;
  startedAt?: string;
  completedAt?: string;
}

// ============================================================================
// Agent Outputs
// ============================================================================

export interface AgentOutputEnvelope<TPayload = JsonValue> {
  kind: AgentOutputKind;
  authorityLabel: AuthorityLabel;
  summary: string;
  payload: TPayload;
  agent: AgentIdentity;
  runId: string;
  riskClassification: RiskClassification;
  uncertainty: UncertaintyClassification;
  provenance: ProvenanceReference[];
  evidence: EvidenceReference[];
  validationRequirement?: ValidationRequirement;
  reviewRequirement?: ReviewRequirement;
  generatedAt: string;
}

export interface AgentProposalEnvelope<TPayload = JsonValue>
  extends AgentOutputEnvelope<TPayload> {
  kind: typeof AgentOutputKind.PROPOSAL;
}

export interface AgentExplanationEnvelope<TPayload = JsonValue>
  extends AgentOutputEnvelope<TPayload> {
  kind: typeof AgentOutputKind.EXPLANATION;
  explains: string;
}
