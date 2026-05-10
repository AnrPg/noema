/**
 * @noema/validation - Enum Schemas
 *
 * Zod schemas for all domain enumerations.
 * These provide runtime validation for enum values.
 */

import {
  AchievementRarity,
  AggregationStage,
  CardOriginMode,
  CardReviewState,
  CardState,
  CardTransformKind,
  CardType,
  CkgNodeStatus,
  CognitiveLoadLevel,
  ConceptCandidateState,
  CurriculumEdgeType,
  CurriculumBranchDriftState,
  CurriculumBranchEntryStrategy,
  CurriculumNodeRuntimeState,
  CurriculumOriginMode,
  CurriculumPathRole,
  CurriculumRevisionReason,
  CurriculumState,
  CurriculumVersionState,
  ConceptState,
  ContentGenerationJobStatus,
  DifficultyLevel,
  DocumentMimeKind,
  DocumentSourceKind,
  DocumentFormat,
  Environment,
  EventSource,
  FatigueLevel,
  ForceLevel,
  GoalSource,
  GoalState,
  GoalType,
  GraphEdgeType,
  GraphNodeType,
  GraphType,
  HintDepth,
  IngestionState,
  IngestionIntent,
  IngestionJobStage,
  EligibilityGroup,
  LearningInterventionType,
  LearningMode,
  LoadoutArchetype,
  MetacognitiveStage,
  MisconceptionInterventionType,
  MisconceptionPatternKind,
  MisconceptionStatus,
  MisconceptionType,
  MotivationSignal,
  MutationState,
  PromotionBand,
  ReplanScope,
  RemediationCardType,
  RevisionChangeKind,
  RevisionChangeState,
  RigorLevel,
  SchedulingAlgorithm,
  SchedulerQueue,
  SchedulerRating,
  SessionLifecycleState,
  SessionTerminationReason,
  StepSelfRating,
  StepStatus,
  StreakType,
  StudyMode,
  StructuralMetricType,
  EpistemicMode,
  EpistemicModeCategory,
  TransformationType,
  TriggerStatus,
  TriggerType,
  ToolCategory,
  ToolResponseTime,
} from '@noema/types';
import { z } from 'zod';

// ============================================================================
// Helper to create enum schema from const object
// ============================================================================

function createEnumSchema(
  enumObj: Record<string, string>,
  description: string
): z.ZodEnum<[string, ...string[]]> {
  const values = Object.values(enumObj) as [string, ...string[]];
  return z.enum(values).describe(description);
}

// ============================================================================
// Domain Enum Schemas
// ============================================================================

export const CardTypeSchema = createEnumSchema(CardType, 'Card type');
export const RemediationCardTypeSchema = createEnumSchema(
  RemediationCardType,
  'Remediation card type'
);
export const CardStateSchema = createEnumSchema(CardState, 'Card state');
export const CardOriginModeSchema = createEnumSchema(CardOriginMode, 'Card origin mode');
export const CardReviewStateSchema = createEnumSchema(CardReviewState, 'Card review state');
export const CardTransformKindSchema = createEnumSchema(CardTransformKind, 'Card transform kind');
export const ContentGenerationJobStatusSchema = createEnumSchema(
  ContentGenerationJobStatus,
  'Content generation job status'
);
export const EnvironmentSchema = createEnumSchema(Environment, 'Environment');
export const LoadoutArchetypeSchema = createEnumSchema(LoadoutArchetype, 'Loadout archetype');
export const LearningModeSchema = createEnumSchema(LearningMode, 'Learning mode');
export const StudyModeSchema = createEnumSchema(StudyMode, 'Study mode');
export const RigorLevelSchema = createEnumSchema(RigorLevel, 'Rigor level');
export const GoalTypeSchema = createEnumSchema(GoalType, 'Goal type');
export const GoalStateSchema = createEnumSchema(GoalState, 'Goal state');
export const GoalSourceSchema = createEnumSchema(GoalSource, 'Goal source');
export const EligibilityGroupSchema = createEnumSchema(EligibilityGroup, 'Eligibility group');
export const TransformationTypeSchema = createEnumSchema(TransformationType, 'Transformation type');
export const StepStatusSchema = createEnumSchema(StepStatus, 'Step status');
export const StepSelfRatingSchema = createEnumSchema(StepSelfRating, 'Step self-rating');
export const ConceptStateSchema = createEnumSchema(ConceptState, 'Concept state');
export const SessionLifecycleStateSchema = createEnumSchema(
  SessionLifecycleState,
  'Session lifecycle state'
);
export const TriggerTypeSchema = createEnumSchema(TriggerType, 'Trigger type');
export const TriggerStatusSchema = createEnumSchema(TriggerStatus, 'Trigger status');
export const LearningInterventionTypeSchema = createEnumSchema(
  LearningInterventionType,
  'Learning intervention type'
);
export const ReplanScopeSchema = createEnumSchema(ReplanScope, 'Replan scope');
export const SchedulerQueueSchema = createEnumSchema(SchedulerQueue, 'Scheduler queue');
export const SchedulerRatingSchema = createEnumSchema(SchedulerRating, 'Scheduler rating');
export const CurriculumStateSchema = createEnumSchema(CurriculumState, 'Curriculum state');
export const CurriculumVersionStateSchema = createEnumSchema(
  CurriculumVersionState,
  'Curriculum version state'
);
export const CurriculumNodeRuntimeStateSchema = createEnumSchema(
  CurriculumNodeRuntimeState,
  'Curriculum node runtime state'
);
export const CurriculumEdgeTypeSchema = createEnumSchema(
  CurriculumEdgeType,
  'Curriculum edge type'
);
export const CurriculumPathRoleSchema = createEnumSchema(
  CurriculumPathRole,
  'Curriculum path role'
);
export const CurriculumBranchEntryStrategySchema = createEnumSchema(
  CurriculumBranchEntryStrategy,
  'Curriculum branch entry strategy'
);
export const CurriculumBranchDriftStateSchema = createEnumSchema(
  CurriculumBranchDriftState,
  'Curriculum branch drift state'
);
export const CurriculumOriginModeSchema = createEnumSchema(
  CurriculumOriginMode,
  'Curriculum origin mode'
);
export const CurriculumRevisionReasonSchema = createEnumSchema(
  CurriculumRevisionReason,
  'Curriculum revision reason'
);
export const RevisionChangeKindSchema = createEnumSchema(
  RevisionChangeKind,
  'Revision change kind'
);
export const RevisionChangeStateSchema = createEnumSchema(
  RevisionChangeState,
  'Revision change state'
);
export const ForceLevelSchema = createEnumSchema(ForceLevel, 'Force level');
export const SchedulingAlgorithmSchema = createEnumSchema(
  SchedulingAlgorithm,
  'Scheduling algorithm'
);
export const GraphNodeTypeSchema = createEnumSchema(GraphNodeType, 'Graph node type');
export const GraphEdgeTypeSchema = createEnumSchema(GraphEdgeType, 'Graph edge type');
export const CkgNodeStatusSchema = createEnumSchema(CkgNodeStatus, 'CKG node status');
export const MutationStateSchema = createEnumSchema(MutationState, 'Mutation state');
export const ToolCategorySchema = createEnumSchema(ToolCategory, 'Tool category');
export const ToolResponseTimeSchema = createEnumSchema(ToolResponseTime, 'Tool response time');
export const EventSourceSchema = createEnumSchema(EventSource, 'Event source');
export const AchievementRaritySchema = createEnumSchema(AchievementRarity, 'Achievement rarity');
export const StreakTypeSchema = createEnumSchema(StreakType, 'Streak type');
export const DocumentFormatSchema = createEnumSchema(DocumentFormat, 'Document format');
export const IngestionStateSchema = createEnumSchema(IngestionState, 'Ingestion state');
export const DocumentSourceKindSchema = createEnumSchema(
  DocumentSourceKind,
  'Document source kind'
);
export const DocumentMimeKindSchema = createEnumSchema(DocumentMimeKind, 'Document MIME kind');
export const IngestionIntentSchema = createEnumSchema(IngestionIntent, 'Ingestion intent');
export const IngestionJobStageSchema = createEnumSchema(IngestionJobStage, 'Ingestion job stage');
export const ConceptCandidateStateSchema = createEnumSchema(
  ConceptCandidateState,
  'Concept candidate state'
);
export const DifficultyLevelSchema = createEnumSchema(DifficultyLevel, 'Difficulty level');
export const SessionTerminationReasonSchema = createEnumSchema(
  SessionTerminationReason,
  'Session termination reason'
);
export const CognitiveLoadLevelSchema = createEnumSchema(
  CognitiveLoadLevel,
  'Cognitive load level'
);
export const FatigueLevelSchema = createEnumSchema(FatigueLevel, 'Fatigue level');
export const MotivationSignalSchema = createEnumSchema(MotivationSignal, 'Motivation signal');
export const HintDepthSchema = createEnumSchema(HintDepth, 'Hint depth');
export const EpistemicModeSchema = createEnumSchema(EpistemicMode, 'Epistemic mode');
export const EpistemicModeCategorySchema = createEnumSchema(
  EpistemicModeCategory,
  'Epistemic mode category'
);
export const GraphTypeSchema = createEnumSchema(GraphType, 'Graph type');
export const MisconceptionTypeSchema = createEnumSchema(MisconceptionType, 'Misconception type');
export const MisconceptionPatternKindSchema = createEnumSchema(
  MisconceptionPatternKind,
  'Misconception pattern kind'
);
export const MisconceptionInterventionTypeSchema = createEnumSchema(
  MisconceptionInterventionType,
  'Misconception intervention type'
);
export const MisconceptionStatusSchema = createEnumSchema(
  MisconceptionStatus,
  'Misconception status'
);
export const PromotionBandSchema = createEnumSchema(PromotionBand, 'Promotion band');
export const MetacognitiveStageSchema = createEnumSchema(MetacognitiveStage, 'Metacognitive stage');
export const AggregationStageSchema = createEnumSchema(AggregationStage, 'Aggregation stage');
export const StructuralMetricTypeSchema = createEnumSchema(
  StructuralMetricType,
  'Structural metric type'
);

// ============================================================================
// Type Inference
// ============================================================================

export type CardTypeInput = z.input<typeof CardTypeSchema>;
export type RemediationCardTypeInput = z.input<typeof RemediationCardTypeSchema>;
export type CardStateInput = z.input<typeof CardStateSchema>;
export type CardOriginModeInput = z.input<typeof CardOriginModeSchema>;
export type CardReviewStateInput = z.input<typeof CardReviewStateSchema>;
export type CardTransformKindInput = z.input<typeof CardTransformKindSchema>;
export type ContentGenerationJobStatusInput = z.input<typeof ContentGenerationJobStatusSchema>;
export type EnvironmentInput = z.input<typeof EnvironmentSchema>;
export type LoadoutArchetypeInput = z.input<typeof LoadoutArchetypeSchema>;
export type LearningModeInput = z.input<typeof LearningModeSchema>;
export type StudyModeInput = z.input<typeof StudyModeSchema>;
export type RigorLevelInput = z.input<typeof RigorLevelSchema>;
export type GoalTypeInput = z.input<typeof GoalTypeSchema>;
export type GoalStateInput = z.input<typeof GoalStateSchema>;
export type GoalSourceInput = z.input<typeof GoalSourceSchema>;
export type EligibilityGroupInput = z.input<typeof EligibilityGroupSchema>;
export type TransformationTypeInput = z.input<typeof TransformationTypeSchema>;
export type StepStatusInput = z.input<typeof StepStatusSchema>;
export type StepSelfRatingInput = z.input<typeof StepSelfRatingSchema>;
export type ConceptStateInput = z.input<typeof ConceptStateSchema>;
export type SessionLifecycleStateInput = z.input<typeof SessionLifecycleStateSchema>;
export type TriggerTypeInput = z.input<typeof TriggerTypeSchema>;
export type TriggerStatusInput = z.input<typeof TriggerStatusSchema>;
export type LearningInterventionTypeInput = z.input<typeof LearningInterventionTypeSchema>;
export type ReplanScopeInput = z.input<typeof ReplanScopeSchema>;
export type SchedulerQueueInput = z.input<typeof SchedulerQueueSchema>;
export type SchedulerRatingInput = z.input<typeof SchedulerRatingSchema>;
export type CurriculumStateInput = z.input<typeof CurriculumStateSchema>;
export type CurriculumVersionStateInput = z.input<typeof CurriculumVersionStateSchema>;
export type CurriculumNodeRuntimeStateInput = z.input<typeof CurriculumNodeRuntimeStateSchema>;
export type CurriculumEdgeTypeInput = z.input<typeof CurriculumEdgeTypeSchema>;
export type CurriculumOriginModeInput = z.input<typeof CurriculumOriginModeSchema>;
export type CurriculumRevisionReasonInput = z.input<typeof CurriculumRevisionReasonSchema>;
export type RevisionChangeKindInput = z.input<typeof RevisionChangeKindSchema>;
export type RevisionChangeStateInput = z.input<typeof RevisionChangeStateSchema>;
export type ForceLevelInput = z.input<typeof ForceLevelSchema>;
export type SchedulingAlgorithmInput = z.input<typeof SchedulingAlgorithmSchema>;
export type GraphNodeTypeInput = z.input<typeof GraphNodeTypeSchema>;
export type GraphEdgeTypeInput = z.input<typeof GraphEdgeTypeSchema>;
export type CkgNodeStatusInput = z.input<typeof CkgNodeStatusSchema>;
export type MutationStateInput = z.input<typeof MutationStateSchema>;
export type ToolCategoryInput = z.input<typeof ToolCategorySchema>;
export type ToolResponseTimeInput = z.input<typeof ToolResponseTimeSchema>;
export type EventSourceInput = z.input<typeof EventSourceSchema>;
export type AchievementRarityInput = z.input<typeof AchievementRaritySchema>;
export type StreakTypeInput = z.input<typeof StreakTypeSchema>;
export type DocumentFormatInput = z.input<typeof DocumentFormatSchema>;
export type IngestionStateInput = z.input<typeof IngestionStateSchema>;
export type DifficultyLevelInput = z.input<typeof DifficultyLevelSchema>;
export type SessionTerminationReasonInput = z.input<typeof SessionTerminationReasonSchema>;
export type CognitiveLoadLevelInput = z.input<typeof CognitiveLoadLevelSchema>;
export type FatigueLevelInput = z.input<typeof FatigueLevelSchema>;
export type MotivationSignalInput = z.input<typeof MotivationSignalSchema>;
export type HintDepthInput = z.input<typeof HintDepthSchema>;
export type EpistemicModeInput = z.input<typeof EpistemicModeSchema>;
export type EpistemicModeCategoryInput = z.input<typeof EpistemicModeCategorySchema>;
export type GraphTypeInput = z.input<typeof GraphTypeSchema>;
export type MisconceptionTypeInput = z.input<typeof MisconceptionTypeSchema>;
export type MisconceptionPatternKindInput = z.input<typeof MisconceptionPatternKindSchema>;
export type MisconceptionInterventionTypeInput = z.input<
  typeof MisconceptionInterventionTypeSchema
>;
export type MisconceptionStatusInput = z.input<typeof MisconceptionStatusSchema>;
export type PromotionBandInput = z.input<typeof PromotionBandSchema>;
export type MetacognitiveStageInput = z.input<typeof MetacognitiveStageSchema>;
export type AggregationStageInput = z.input<typeof AggregationStageSchema>;
export type StructuralMetricTypeInput = z.input<typeof StructuralMetricTypeSchema>;
