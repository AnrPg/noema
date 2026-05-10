/**
 * @noema/validation - Agent Kernel Schemas
 *
 * Runtime validation for shared agent kernel contracts.
 */

import {
  AgentOutputKind,
  AuthorityLabel,
  CapabilityClass,
  CapabilityConsistency,
  CapabilityCostClass,
  CapabilityTag,
  CommitOutcomeStatus,
  PolicyArea,
  PolicyDecisionDisposition,
  PrincipalType,
  ReviewedWriteStage,
  ReviewActor,
  RiskClassification,
  UncertaintyClassification,
  ValidationGate,
  VisibilityDisposition,
} from '@noema/types';
import { z } from 'zod';
import {
  AgentIdSchema,
  CausationIdSchema,
  CorrelationIdSchema,
  SessionIdSchema,
  StepIdSchema,
  ToolIdSchema,
  TraceIdSchema,
  UserIdSchema,
} from './ids.js';
import { IsoDateTimeSchema, JsonValueSchema, MetadataSchema } from './base.js';

function createEnumSchema(
  enumObj: Record<string, string>,
  description: string
): z.ZodEnum<[string, ...string[]]> {
  const values = Object.values(enumObj) as [string, ...string[]];
  return z.enum(values).describe(description);
}

export const CapabilityClassSchema = createEnumSchema(CapabilityClass, 'Capability class');
export const CapabilityTagSchema = createEnumSchema(CapabilityTag, 'Capability tag');
export const AuthorityLabelSchema = createEnumSchema(AuthorityLabel, 'Authority label');
export const RiskClassificationSchema = createEnumSchema(
  RiskClassification,
  'Risk classification'
);
export const UncertaintyClassificationSchema = createEnumSchema(
  UncertaintyClassification,
  'Uncertainty classification'
);
export const ReviewedWriteStageSchema = createEnumSchema(
  ReviewedWriteStage,
  'Reviewed write stage'
);
export const ValidationGateSchema = createEnumSchema(ValidationGate, 'Validation gate');
export const ReviewActorSchema = createEnumSchema(ReviewActor, 'Review actor');
export const PolicyAreaSchema = createEnumSchema(PolicyArea, 'Policy area');
export const PolicyDecisionDispositionSchema = createEnumSchema(
  PolicyDecisionDisposition,
  'Policy decision disposition'
);
export const VisibilityDispositionSchema = createEnumSchema(
  VisibilityDisposition,
  'Visibility disposition'
);
export const PrincipalTypeSchema = createEnumSchema(PrincipalType, 'Principal type');
export const CapabilityCostClassSchema = createEnumSchema(
  CapabilityCostClass,
  'Capability cost class'
);
export const CapabilityConsistencySchema = createEnumSchema(
  CapabilityConsistency,
  'Capability consistency'
);
export const AgentOutputKindSchema = createEnumSchema(AgentOutputKind, 'Agent output kind');
export const CommitOutcomeStatusSchema = createEnumSchema(
  CommitOutcomeStatus,
  'Commit outcome status'
);

export const FreshnessMetadataSchema = z.object({
  fetchedAt: IsoDateTimeSchema,
  sourceVersion: z.string().optional(),
  ttlMs: z.number().int().positive().optional(),
  expiresAt: IsoDateTimeSchema.optional(),
  replayable: z.boolean(),
  mayRefreshLive: z.boolean(),
});

export const ProvenanceReferenceSchema = z.object({
  type: z.enum([
    'service_fact',
    'event',
    'tool_call',
    'function_call',
    'prompt_template',
    'artifact',
    'review',
    'validation',
    'agent_run',
    'user_input',
  ]),
  id: z.string(),
  service: z.string().optional(),
  label: z.string().optional(),
  authority: AuthorityLabelSchema.optional(),
  capturedAt: IsoDateTimeSchema.optional(),
  metadata: MetadataSchema.optional(),
});

export const EvidenceReferenceSchema = z.object({
  id: z.string(),
  type: z.enum([
    'document',
    'chunk',
    'card',
    'step',
    'evaluation',
    'trigger',
    'graph_node',
    'graph_edge',
    'curriculum_node',
    'retrieval_result',
    'review_note',
  ]),
  label: z.string().optional(),
  sourceService: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  authority: AuthorityLabelSchema,
  provenanceRefs: z.array(ProvenanceReferenceSchema).optional(),
});

export const AgentIdentitySchema = z.object({
  agentId: AgentIdSchema,
  role: z.string().min(1),
  family: z.string().min(1),
  version: z.string().min(1),
  displayName: z.string().optional(),
  ownerService: z.string().optional(),
  toolBeltIds: z.array(z.string()).optional(),
});

export const AgentRunContextSchema = z.object({
  runId: z.string().min(1),
  correlationId: CorrelationIdSchema,
  causationId: CausationIdSchema.optional(),
  traceId: TraceIdSchema.optional(),
  principalType: PrincipalTypeSchema,
  initiatedByUserId: UserIdSchema.optional(),
  sessionId: SessionIdSchema.optional(),
  stepId: StepIdSchema.optional(),
  startedAt: IsoDateTimeSchema,
  deadlineMs: z.number().int().positive().optional(),
  metadata: MetadataSchema.optional(),
});

export const AgentContextSectionSchema: z.ZodType<unknown> = z.object({
  key: z.string().min(1),
  title: z.string().optional(),
  authority: AuthorityLabelSchema,
  sourceService: z.string().optional(),
  value: JsonValueSchema,
  freshness: FreshnessMetadataSchema.optional(),
  provenanceRefs: z.array(ProvenanceReferenceSchema).optional(),
  evidenceRefs: z.array(EvidenceReferenceSchema).optional(),
  reviewState: z.string().optional(),
  openQuestions: z.array(z.string()).optional(),
});

export const AgentRoleContractSchema = z.object({
  role: z.string().min(1),
  purpose: z.string().min(1),
  requiredContextSections: z.array(z.string()),
  allowedCapabilityTags: z.array(CapabilityTagSchema),
  forbiddenCapabilityNames: z.array(z.string()).optional(),
  outputContractId: z.string().min(1),
  writeAuthorityClass: z.enum([
    AuthorityLabel.AGENT_INFERENCE,
    AuthorityLabel.AGENT_PROPOSAL,
    AuthorityLabel.VALIDATION_RESULT,
  ]),
  reviewedWriteByDefault: z.boolean(),
});

export const AgentContextPackSchema = z.object({
  runContext: AgentContextSectionSchema,
  userContext: z.array(AgentContextSectionSchema),
  roleContext: z.array(AgentContextSectionSchema),
  learningContext: z.array(AgentContextSectionSchema),
  artifactContext: z.array(AgentContextSectionSchema),
  serviceFacts: z.array(AgentContextSectionSchema),
  detectedSignals: z.array(AgentContextSectionSchema),
  historyWindow: z.array(AgentContextSectionSchema),
  activeSurface: z.array(AgentContextSectionSchema),
  policyContext: z.array(AgentContextSectionSchema),
  allowedActions: AgentContextSectionSchema,
  forbiddenActions: AgentContextSectionSchema,
  outputContract: AgentContextSectionSchema,
  provenance: AgentContextSectionSchema,
  freshness: AgentContextSectionSchema,
  openQuestions: AgentContextSectionSchema,
  reviewState: AgentContextSectionSchema,
});

export const ValidationRequirementSchema = z.object({
  required: z.boolean(),
  gates: z.array(ValidationGateSchema),
  blocking: z.boolean(),
  notes: z.array(z.string()).optional(),
});

export const ReviewRequirementSchema = z.object({
  required: z.boolean(),
  reviewers: z.array(ReviewActorSchema),
  rationale: z.string().optional(),
  autoCommitAllowed: z.boolean(),
  decisionTtlMs: z.number().int().positive().optional(),
});

export const CapabilityDefinitionSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  service: z.string().min(1),
  capabilityClass: CapabilityClassSchema,
  priority: z.enum(['P0', 'P1', 'P2']),
  tags: z.array(CapabilityTagSchema),
  requiredScopes: z.array(z.string()),
  riskClassification: RiskClassificationSchema,
  reviewedWriteStages: z.array(ReviewedWriteStageSchema).optional(),
  validationRequirement: ValidationRequirementSchema.optional(),
  reviewRequirement: ReviewRequirementSchema.optional(),
  outputAuthorities: z.array(AuthorityLabelSchema).optional(),
  inputSchema: z.record(z.unknown()).optional(),
  outputSchema: z.record(z.unknown()).optional(),
  idempotent: z.boolean().optional(),
  sideEffects: z.boolean().optional(),
  timeoutMs: z.number().int().positive().optional(),
  costClass: CapabilityCostClassSchema.optional(),
  consistency: CapabilityConsistencySchema.optional(),
});

export const ToolDefinitionSchema = CapabilityDefinitionSchema.extend({
  capabilityClass: z.literal(CapabilityClass.TOOL),
  toolId: ToolIdSchema.optional(),
});

export const FunctionDefinitionSchema = CapabilityDefinitionSchema.extend({
  capabilityClass: z.literal(CapabilityClass.FUNCTION),
});

export const PolicyDecisionSchema = z.object({
  policyArea: PolicyAreaSchema,
  decision: PolicyDecisionDispositionSchema,
  reasonCodes: z.array(z.string()),
  decidedBy: z.string().min(1),
  decidedAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema.optional(),
  metadata: MetadataSchema.optional(),
});

export const VisibilityDecisionSchema = z.object({
  surface: z.string().min(1),
  disposition: VisibilityDispositionSchema,
  reasonCodes: z.array(z.string()),
  policyRefs: z.array(PolicyDecisionSchema).optional(),
  expiresAt: IsoDateTimeSchema.optional(),
});

export const ToolExecutionRequestSchema = z.object({
  toolName: z.string().min(1),
  input: JsonValueSchema,
  context: AgentRunContextSchema,
  dryRun: z.boolean().optional(),
});

const ExecutionErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: JsonValueSchema.optional(),
});

export const ToolExecutionResultSchema = z.object({
  success: z.boolean(),
  data: JsonValueSchema.optional(),
  error: ExecutionErrorSchema.optional(),
  authorityLabel: AuthorityLabelSchema,
  provenance: z.array(ProvenanceReferenceSchema),
  freshness: FreshnessMetadataSchema.optional(),
  validationRequirement: ValidationRequirementSchema.optional(),
  reviewRequirement: ReviewRequirementSchema.optional(),
  policyDecisions: z.array(PolicyDecisionSchema).optional(),
  uncertainty: UncertaintyClassificationSchema.optional(),
  metadata: MetadataSchema.optional(),
});

export const FunctionExecutionResultSchema = z.object({
  success: z.boolean(),
  data: JsonValueSchema.optional(),
  error: ExecutionErrorSchema.optional(),
  authorityLabel: AuthorityLabelSchema,
  provenance: z.array(ProvenanceReferenceSchema),
  freshness: FreshnessMetadataSchema.optional(),
  policyDecisions: z.array(PolicyDecisionSchema).optional(),
  uncertainty: UncertaintyClassificationSchema.optional(),
  metadata: MetadataSchema.optional(),
});

export const CommitIntentSchema = z.object({
  intentId: z.string().min(1),
  stage: ReviewedWriteStageSchema,
  artifactType: z.string().min(1),
  artifactId: z.string().optional(),
  action: z.string().min(1),
  ownerService: z.string().min(1),
  actor: AgentIdentitySchema,
  payload: JsonValueSchema,
  riskClassification: RiskClassificationSchema,
  validationRequirement: ValidationRequirementSchema,
  reviewRequirement: ReviewRequirementSchema,
  provenance: z.array(ProvenanceReferenceSchema),
  createdAt: IsoDateTimeSchema,
});

export const CommitOutcomeSchema = z.object({
  intentId: z.string().min(1),
  status: CommitOutcomeStatusSchema,
  committedArtifactId: z.string().optional(),
  validationResultIds: z.array(z.string()).optional(),
  reviewDecisionIds: z.array(z.string()).optional(),
  reasons: z.array(z.string()).optional(),
  committedAt: IsoDateTimeSchema.optional(),
  provenance: z.array(ProvenanceReferenceSchema).optional(),
});

export const ReplayReferenceSchema = z.object({
  replayId: z.string().min(1),
  runId: z.string().min(1),
  eventIds: z.array(z.string()).optional(),
  capabilityCallIds: z.array(z.string()).optional(),
  contextPackHash: z.string().optional(),
  startedAt: IsoDateTimeSchema.optional(),
  completedAt: IsoDateTimeSchema.optional(),
});

export const AgentOutputEnvelopeSchema = z.object({
  kind: AgentOutputKindSchema,
  authorityLabel: AuthorityLabelSchema,
  summary: z.string().min(1),
  payload: JsonValueSchema,
  agent: AgentIdentitySchema,
  runId: z.string().min(1),
  riskClassification: RiskClassificationSchema,
  uncertainty: UncertaintyClassificationSchema,
  provenance: z.array(ProvenanceReferenceSchema),
  evidence: z.array(EvidenceReferenceSchema),
  validationRequirement: ValidationRequirementSchema.optional(),
  reviewRequirement: ReviewRequirementSchema.optional(),
  generatedAt: IsoDateTimeSchema,
});

export const AgentProposalEnvelopeSchema = AgentOutputEnvelopeSchema.extend({
  kind: z.literal(AgentOutputKind.PROPOSAL),
});

export const AgentExplanationEnvelopeSchema = AgentOutputEnvelopeSchema.extend({
  kind: z.literal(AgentOutputKind.EXPLANATION),
  explains: z.string().min(1),
});

export type CapabilityDefinitionInput = z.input<typeof CapabilityDefinitionSchema>;
export type ToolDefinitionInput = z.input<typeof ToolDefinitionSchema>;
export type FunctionDefinitionInput = z.input<typeof FunctionDefinitionSchema>;
export type AgentRunContextInput = z.input<typeof AgentRunContextSchema>;
export type AgentContextPackInput = z.input<typeof AgentContextPackSchema>;
export type AgentOutputEnvelopeInput = z.input<typeof AgentOutputEnvelopeSchema>;
