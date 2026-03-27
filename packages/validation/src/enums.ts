/**
 * @noema/validation - Enum Schemas
 *
 * Zod schemas for all domain enumerations.
 * These provide runtime validation for enum values.
 */

import {
  AchievementRarity,
  AggregationStage,
  AttemptOutcome,
  CardLearningState,
  CardQueueStatus,
  CardState,
  CardType,
  CkgNodeStatus,
  CognitiveLoadLevel,
  DifficultyLevel,
  DocumentFormat,
  Environment,
  EventSource,
  FatigueLevel,
  ForceLevel,
  GraphEdgeType,
  GraphNodeType,
  GraphType,
  HintDepth,
  IngestionState,
  InterventionType,
  LearningMode,
  LoadoutArchetype,
  MetacognitiveStage,
  MisconceptionPatternKind,
  MisconceptionStatus,
  MisconceptionType,
  MotivationSignal,
  MutationState,
  PromotionBand,
  Rating,
  RemediationCardType,
  SchedulingAlgorithm,
  SessionState,
  SessionTerminationReason,
  StreakType,
  StructuralMetricType,
  TeachingApproach,
  TeachingApproachCategory,
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
export const SessionStateSchema = createEnumSchema(SessionState, 'Session state');
export const CardStateSchema = createEnumSchema(CardState, 'Card state');
export const AttemptOutcomeSchema = createEnumSchema(AttemptOutcome, 'Attempt outcome');
export const EnvironmentSchema = createEnumSchema(Environment, 'Environment');
export const LoadoutArchetypeSchema = createEnumSchema(LoadoutArchetype, 'Loadout archetype');
export const LearningModeSchema = createEnumSchema(LearningMode, 'Learning mode');
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
export const DifficultyLevelSchema = createEnumSchema(DifficultyLevel, 'Difficulty level');
export const RatingSchema = createEnumSchema(Rating, 'Review rating');
export const CardLearningStateSchema = createEnumSchema(CardLearningState, 'Card learning state');
export const CardQueueStatusSchema = createEnumSchema(CardQueueStatus, 'Card queue status');
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
export const TeachingApproachSchema = createEnumSchema(TeachingApproach, 'Teaching approach');
export const TeachingApproachCategorySchema = createEnumSchema(
  TeachingApproachCategory,
  'Teaching approach category'
);
export const GraphTypeSchema = createEnumSchema(GraphType, 'Graph type');
export const MisconceptionTypeSchema = createEnumSchema(MisconceptionType, 'Misconception type');
export const MisconceptionPatternKindSchema = createEnumSchema(
  MisconceptionPatternKind,
  'Misconception pattern kind'
);
export const InterventionTypeSchema = createEnumSchema(InterventionType, 'Intervention type');
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
export type SessionStateInput = z.input<typeof SessionStateSchema>;
export type CardStateInput = z.input<typeof CardStateSchema>;
export type AttemptOutcomeInput = z.input<typeof AttemptOutcomeSchema>;
export type EnvironmentInput = z.input<typeof EnvironmentSchema>;
export type LoadoutArchetypeInput = z.input<typeof LoadoutArchetypeSchema>;
export type LearningModeInput = z.input<typeof LearningModeSchema>;
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
export type RatingInput = z.input<typeof RatingSchema>;
export type CardLearningStateInput = z.input<typeof CardLearningStateSchema>;
export type CardQueueStatusInput = z.input<typeof CardQueueStatusSchema>;
export type SessionTerminationReasonInput = z.input<typeof SessionTerminationReasonSchema>;
export type CognitiveLoadLevelInput = z.input<typeof CognitiveLoadLevelSchema>;
export type FatigueLevelInput = z.input<typeof FatigueLevelSchema>;
export type MotivationSignalInput = z.input<typeof MotivationSignalSchema>;
export type HintDepthInput = z.input<typeof HintDepthSchema>;
export type TeachingApproachInput = z.input<typeof TeachingApproachSchema>;
export type TeachingApproachCategoryInput = z.input<typeof TeachingApproachCategorySchema>;
export type GraphTypeInput = z.input<typeof GraphTypeSchema>;
export type MisconceptionTypeInput = z.input<typeof MisconceptionTypeSchema>;
export type MisconceptionPatternKindInput = z.input<typeof MisconceptionPatternKindSchema>;
export type InterventionTypeInput = z.input<typeof InterventionTypeSchema>;
export type MisconceptionStatusInput = z.input<typeof MisconceptionStatusSchema>;
export type PromotionBandInput = z.input<typeof PromotionBandSchema>;
export type MetacognitiveStageInput = z.input<typeof MetacognitiveStageSchema>;
export type AggregationStageInput = z.input<typeof AggregationStageSchema>;
export type StructuralMetricTypeInput = z.input<typeof StructuralMetricTypeSchema>;
