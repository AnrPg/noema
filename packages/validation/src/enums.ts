/**
 * @noema/validation - Enum Schemas
 *
 * Zod schemas for all domain enumerations.
 * These provide runtime validation for enum values.
 */

import {
  AchievementRarity,
  AttemptOutcome,
  CardState,
  CardType,
  DocumentFormat,
  Environment,
  EventSource,
  ForceLevel,
  GraphEdgeType,
  GraphNodeType,
  IngestionState,
  LearningMode,
  LoadoutArchetype,
  MutationState,
  RemediationCardType,
  SchedulingAlgorithm,
  SessionState,
  StreakType,
  ToolCategory,
  ToolResponseTime,
} from '@noema/types';
import { z } from 'zod';

// ============================================================================
// Helper to create enum schema from const object
// ============================================================================

function createEnumSchema<T extends Record<string, string>>(enumObj: T, description: string) {
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
export const MutationStateSchema = createEnumSchema(MutationState, 'Mutation state');
export const ToolCategorySchema = createEnumSchema(ToolCategory, 'Tool category');
export const ToolResponseTimeSchema = createEnumSchema(ToolResponseTime, 'Tool response time');
export const EventSourceSchema = createEnumSchema(EventSource, 'Event source');
export const AchievementRaritySchema = createEnumSchema(AchievementRarity, 'Achievement rarity');
export const StreakTypeSchema = createEnumSchema(StreakType, 'Streak type');
export const DocumentFormatSchema = createEnumSchema(DocumentFormat, 'Document format');
export const IngestionStateSchema = createEnumSchema(IngestionState, 'Ingestion state');

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
export type MutationStateInput = z.input<typeof MutationStateSchema>;
export type ToolCategoryInput = z.input<typeof ToolCategorySchema>;
export type ToolResponseTimeInput = z.input<typeof ToolResponseTimeSchema>;
export type EventSourceInput = z.input<typeof EventSourceSchema>;
export type AchievementRarityInput = z.input<typeof AchievementRaritySchema>;
export type StreakTypeInput = z.input<typeof StreakTypeSchema>;
export type DocumentFormatInput = z.input<typeof DocumentFormatSchema>;
export type IngestionStateInput = z.input<typeof IngestionStateSchema>;
