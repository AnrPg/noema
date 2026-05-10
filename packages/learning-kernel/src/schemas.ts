import { z } from 'zod';
import {
  CardIdSchema,
  CausationIdSchema,
  ConceptIdSchema,
  ContentGenerationJobIdSchema,
  CorrelationIdSchema,
  CurriculumEdgeIdSchema,
  CurriculumIdSchema,
  CurriculumNodeIdSchema,
  CurriculumVersionIdSchema,
  EvaluationIdSchema,
  EventIdSchema,
  GeneratedVariantIdSchema,
  GoalIdSchema,
  LessonPlanIdSchema,
  RevisionChangeIdSchema,
  RevisionProposalIdSchema,
  SessionIdSchema,
  StepIdSchema,
  TriggerIdSchema,
  UserIdSchema,
} from './ids.js';
import {
  CardOriginModeSchema,
  CardReviewStateSchema,
  ConceptStateSchema,
  CurriculumEdgeTypeSchema,
  CurriculumNodeRuntimeStateSchema,
  CurriculumOriginModeSchema,
  CurriculumStateSchema,
  CurriculumVersionStateSchema,
  EpistemicModeSchema,
  GoalSourceSchema,
  GoalStateSchema,
  GoalTypeSchema,
  LearningInterventionTypeSchema,
  LearningModeSchema,
  ReplanScopeSchema,
  RevisionChangeKindSchema,
  RevisionChangeStateSchema,
  RigorLevelSchema,
  SchedulerQueueSchema,
  StepSelfRatingSchema,
  StudyModeSchema,
  TransformationTypeSchema,
  TriggerTypeSchema,
} from './enums.js';

export const EventMetadataSchema = z.object({
  correlationId: CorrelationIdSchema,
  userId: UserIdSchema.nullable().optional(),
  causationId: CausationIdSchema.or(EventIdSchema).nullable().optional(),
});

export const BaseEventSchema = z.object({
  eventId: EventIdSchema,
  eventType: z.string().min(1),
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  version: z.number().int().positive(),
  timestamp: z.string().datetime(),
  metadata: EventMetadataSchema,
  payload: z.unknown(),
});

export function createEventSchema<TPayload extends z.ZodTypeAny>(
  eventType: string,
  aggregateType: string,
  payloadSchema: TPayload
): z.ZodObject<{
  eventId: typeof EventIdSchema;
  eventType: z.ZodLiteral<string>;
  aggregateType: z.ZodLiteral<string>;
  aggregateId: z.ZodString;
  version: z.ZodNumber;
  timestamp: z.ZodString;
  metadata: typeof EventMetadataSchema;
  payload: TPayload;
}> {
  return BaseEventSchema.extend({
    eventType: z.literal(eventType),
    aggregateType: z.literal(aggregateType),
    payload: payloadSchema,
  });
}

export const LessonPlanEventPayloadSchema = z.object({
  lessonPlanId: LessonPlanIdSchema,
  sessionId: SessionIdSchema,
  userId: UserIdSchema,
});

export const StepEventPayloadSchema = LessonPlanEventPayloadSchema.extend({
  stepId: StepIdSchema,
});

const SevenFrameTraceFrameSchema = z.object({
  score: z.number().min(0).max(1),
  notes: z.string(),
});

export const SevenFrameTraceSchema = z.object({
  frames: z.object({
    f0: SevenFrameTraceFrameSchema,
    f1: SevenFrameTraceFrameSchema,
    f2: SevenFrameTraceFrameSchema,
    f3: SevenFrameTraceFrameSchema,
    f4: SevenFrameTraceFrameSchema,
    f5: SevenFrameTraceFrameSchema,
    f6: SevenFrameTraceFrameSchema,
  }),
});

export const StepAnsweredEventPayloadSchema = StepEventPayloadSchema.extend({
  evaluationId: EvaluationIdSchema,
  conceptRefs: z.array(ConceptIdSchema).min(1),
  selectedNodeIds: z.array(CurriculumNodeIdSchema).min(1),
  correct: z.boolean(),
  selfRating: StepSelfRatingSchema,
  trace: SevenFrameTraceSchema,
  responseTimeMs: z.number().int().nonnegative().optional(),
  studyMode: StudyModeSchema,
  epistemicMode: EpistemicModeSchema,
  transformation: TransformationTypeSchema.optional(),
});

export const MetacognitionEvaluationRecordedPayloadSchema = z.object({
  evaluationId: EvaluationIdSchema,
  stepId: StepIdSchema,
  sessionId: SessionIdSchema,
  userId: UserIdSchema,
  conceptRefs: z.array(ConceptIdSchema).min(1),
  selectedNodeIds: z.array(CurriculumNodeIdSchema).min(1),
  reasoningQuality: z.number().min(0).max(1),
  confidenceSignal: z.number().min(0).max(1),
  combinedScore: z.number().min(0).max(1),
  correct: z.boolean(),
  studyMode: StudyModeSchema,
  epistemicMode: EpistemicModeSchema,
  transformation: TransformationTypeSchema.optional(),
});

export const MetacognitionTriggerFiredPayloadSchema = z.object({
  triggerId: TriggerIdSchema,
  userId: UserIdSchema,
  type: TriggerTypeSchema,
  severity: z.number().min(0).max(1),
  conceptRefs: z.array(ConceptIdSchema).min(1),
  selectedNodeIds: z.array(CurriculumNodeIdSchema).min(1),
  stepId: StepIdSchema,
  sessionId: SessionIdSchema,
  studyMode: StudyModeSchema,
  recommendedIntervention: LearningInterventionTypeSchema,
});

export const SchedulerConceptStateUpdatedPayloadSchema = z.object({
  userId: UserIdSchema,
  conceptId: ConceptIdSchema,
  studyMode: StudyModeSchema,
  previousQueue: SchedulerQueueSchema,
  queue: SchedulerQueueSchema,
  dueAt: z.string().datetime(),
  evaluationId: EvaluationIdSchema,
  stepId: StepIdSchema,
  reviewCount: z.number().int().nonnegative(),
  intervalDays: z.number().nonnegative(),
  stability: z.number().positive().optional(),
  halfLife: z.number().positive().optional(),
});

export const ConceptStateChangedPayloadSchema = z.object({
  userId: UserIdSchema,
  conceptId: ConceptIdSchema,
  studyMode: StudyModeSchema,
  fromState: ConceptStateSchema,
  toState: ConceptStateSchema,
  triggeredBy: z.enum(['evaluation', 'recompute', 'manual']),
  changedAt: z.string().datetime(),
});

export const StrategyReplanPayloadSchema = z.object({
  lessonPlanId: LessonPlanIdSchema,
  sessionId: SessionIdSchema,
  userId: UserIdSchema,
  triggerIds: z.array(TriggerIdSchema),
  scope: ReplanScopeSchema,
  interventionType: LearningInterventionTypeSchema,
  supersededStepIds: z.array(StepIdSchema),
  insertedStepIds: z.array(StepIdSchema),
});

export const CurriculumNodeSchema = z.object({
  id: CurriculumNodeIdSchema,
  curriculumVersionId: CurriculumVersionIdSchema,
  stableNodeKey: z.string().min(1).max(200),
  ckgConceptId: ConceptIdSchema.optional(),
  proposedConcept: z.record(z.unknown()).optional(),
  label: z.string().min(1).max(300),
  learningObjective: z.string().max(1000).optional(),
  stabilityThreshold: z.number().gt(0).lte(1),
  estimatedSessions: z.number().int().positive(),
  traversalWeight: z.number().positive().default(1),
  metadata: z.record(z.unknown()).default({}),
});

export const CurriculumEdgeSchema = z.object({
  id: CurriculumEdgeIdSchema,
  curriculumVersionId: CurriculumVersionIdSchema,
  fromNodeId: CurriculumNodeIdSchema,
  toNodeId: CurriculumNodeIdSchema,
  type: CurriculumEdgeTypeSchema,
  rationale: z.string().max(2000).optional(),
  orderingWeight: z.number().default(0),
});

export const CurriculumVersionSchema = z.object({
  id: CurriculumVersionIdSchema,
  curriculumId: CurriculumIdSchema,
  versionNumber: z.number().int().positive(),
  state: CurriculumVersionStateSchema,
  parentVersionId: CurriculumVersionIdSchema.optional(),
  agentRunId: z.string().optional(),
  guardianValidationId: z.string().optional(),
  createdAt: z.string().datetime(),
  finalizedAt: z.string().datetime().optional(),
  supersededAt: z.string().datetime().optional(),
  nodes: z.array(CurriculumNodeSchema),
  edges: z.array(CurriculumEdgeSchema),
});

export const CurriculumProgressUpdatedPayloadSchema = z.object({
  curriculumId: CurriculumIdSchema,
  curriculumVersionId: CurriculumVersionIdSchema,
  userId: UserIdSchema,
  stableNodeKey: z.string().min(1),
  evaluationCount: z.number().int().nonnegative(),
  correctStreak: z.number().int().nonnegative(),
  stabilitySnapshot: z.number().nonnegative().optional(),
});

export const CurriculumNodeRuntimePayloadSchema = z.object({
  curriculumId: CurriculumIdSchema,
  curriculumVersionId: CurriculumVersionIdSchema,
  userId: UserIdSchema,
  nodeId: CurriculumNodeIdSchema,
  stableNodeKey: z.string().min(1),
  runtimeState: CurriculumNodeRuntimeStateSchema,
});

export const CurriculumFrontierUpdatedPayloadSchema = z.object({
  curriculumId: CurriculumIdSchema,
  curriculumVersionId: CurriculumVersionIdSchema,
  userId: UserIdSchema,
  frontierNodeIds: z.array(CurriculumNodeIdSchema),
});

export const CurriculumLifecyclePayloadSchema = z.object({
  curriculumId: CurriculumIdSchema,
  userId: UserIdSchema,
  curriculumVersionId: CurriculumVersionIdSchema.optional(),
});

export const CurriculumEvidenceAccumulatedPayloadSchema = z.object({
  curriculumId: CurriculumIdSchema,
  userId: UserIdSchema,
  stableNodeKey: z.string().min(1),
  triggerType: z.string().min(1),
  accumulatedWeight: z.number().nonnegative(),
  threshold: z.number().positive(),
});

export const CurriculumRevisionPayloadSchema = z.object({
  curriculumId: CurriculumIdSchema,
  proposalId: RevisionProposalIdSchema,
  userId: UserIdSchema,
  appliedVersionId: CurriculumVersionIdSchema.optional(),
});

export const CurriculumRevisionChangePayloadSchema = z.object({
  curriculumId: CurriculumIdSchema,
  proposalId: RevisionProposalIdSchema,
  changeId: RevisionChangeIdSchema,
  userId: UserIdSchema,
});

export const SessionCurriculumSliceSelectedPayloadSchema = z.object({
  sessionId: SessionIdSchema,
  curriculumId: CurriculumIdSchema,
  curriculumVersionId: CurriculumVersionIdSchema,
  userId: UserIdSchema,
  selectedNodeIds: z.array(CurriculumNodeIdSchema).min(1),
  conceptIds: z.array(ConceptIdSchema).min(1),
});

export const ContentCoverageUpdatedPayloadSchema = z.object({
  userId: UserIdSchema,
  conceptId: ConceptIdSchema,
  activeCardCount: z.number().int().nonnegative(),
  distinctActiveCardTypes: z.number().int().nonnegative(),
  pendingReviewCount: z.number().int().nonnegative(),
  metadataIncompleteCount: z.number().int().nonnegative(),
});

export const GamificationProjectionUpdatedPayloadSchema = z.object({
  userId: UserIdSchema,
  studyMode: StudyModeSchema,
  sourceEventId: EventIdSchema.optional(),
});

export const GoalSchema = z.object({
  id: GoalIdSchema,
  lessonPlanId: LessonPlanIdSchema,
  description: z.string().min(1),
  type: GoalTypeSchema,
  parentGoalId: GoalIdSchema.nullable().optional(),
  state: GoalStateSchema,
  source: GoalSourceSchema,
  conceptRefs: z.array(ConceptIdSchema),
});

export const LessonPlanSchema = z.object({
  id: LessonPlanIdSchema,
  sessionId: SessionIdSchema,
  userId: UserIdSchema,
  curriculumId: CurriculumIdSchema,
  curriculumVersionId: CurriculumVersionIdSchema,
  selectedNodeIds: z.array(CurriculumNodeIdSchema).min(1),
  studyMode: StudyModeSchema,
  learningMode: LearningModeSchema,
  rigorLevel: RigorLevelSchema,
  topic: z.string().min(1),
});

export const RevisionChangeSchema = z.object({
  id: RevisionChangeIdSchema,
  proposalId: RevisionProposalIdSchema,
  kind: RevisionChangeKindSchema,
  payload: z.record(z.unknown()),
  state: RevisionChangeStateSchema,
});

export const CurriculumSchema = z.object({
  id: CurriculumIdSchema,
  userId: UserIdSchema,
  title: z.string().min(1),
  originMode: CurriculumOriginModeSchema,
  state: CurriculumStateSchema,
});

export const CardProvenanceSchema = z.object({
  originMode: CardOriginModeSchema,
  reviewState: CardReviewStateSchema,
  anchoredCkgNodeIds: z.array(ConceptIdSchema),
  generationJobId: ContentGenerationJobIdSchema.nullable().optional(),
  generatedVariantId: GeneratedVariantIdSchema.nullable().optional(),
  sourceCardIds: z.array(CardIdSchema).default([]),
});
