/**
 * @noema/validation - Branded ID Schemas
 *
 * Zod schemas for validating all branded ID types.
 * These ensure IDs have correct format at runtime.
 */

import { ID_PREFIXES } from '@noema/types';
import { z } from 'zod';

// ============================================================================
// Base ID Schema Factory
// ============================================================================

/**
 * Create a Zod schema for a branded ID with a specific prefix.
 */
function createIdSchema(prefix: string, description: string) {
  // Nano ID defaults to a URL-safe alphabet that includes "_" and "-".
  const pattern = new RegExp(`^${prefix}[a-zA-Z0-9_-]{21}$`);
  return z
    .string()
    .regex(pattern, `Invalid ${description} format. Expected ${prefix}<21-char-nanoid>`)
    .describe(description);
}

// ============================================================================
// Individual ID Schemas
// ============================================================================

export const UserIdSchema = createIdSchema(ID_PREFIXES.UserId, 'User ID');
export const CardIdSchema = createIdSchema(ID_PREFIXES.CardId, 'Card ID');
export const DeckQueryLogIdSchema = createIdSchema(ID_PREFIXES.DeckQueryLogId, 'Deck Query Log ID');
export const CategoryIdSchema = createIdSchema(ID_PREFIXES.CategoryId, 'Category ID');
export const SessionIdSchema = createIdSchema(ID_PREFIXES.SessionId, 'Session ID');
export const LessonPlanIdSchema = createIdSchema(ID_PREFIXES.LessonPlanId, 'Lesson Plan ID');
export const GoalIdSchema = createIdSchema(ID_PREFIXES.GoalId, 'Goal ID');
export const StepIdSchema = createIdSchema(ID_PREFIXES.StepId, 'Step ID');
export const ActivityIdSchema = createIdSchema(ID_PREFIXES.ActivityId, 'Activity ID');
export const EvaluationIdSchema = createIdSchema(ID_PREFIXES.EvaluationId, 'Evaluation ID');
export const TriggerIdSchema = createIdSchema(ID_PREFIXES.TriggerId, 'Trigger ID');
export const ConceptIdSchema = createIdSchema(ID_PREFIXES.ConceptId, 'Concept ID');
export const GeneratedVariantIdSchema = createIdSchema(
  ID_PREFIXES.GeneratedVariantId,
  'Generated Variant ID'
);
export const ContentGenerationJobIdSchema = createIdSchema(
  ID_PREFIXES.ContentGenerationJobId,
  'Content Generation Job ID'
);
export const TraceIdSchema = createIdSchema(ID_PREFIXES.TraceId, 'Trace ID');
export const DiagnosisIdSchema = createIdSchema(ID_PREFIXES.DiagnosisId, 'Diagnosis ID');
export const PatchIdSchema = createIdSchema(ID_PREFIXES.PatchId, 'Patch ID');
export const LoadoutIdSchema = createIdSchema(ID_PREFIXES.LoadoutId, 'Loadout ID');
export const NodeIdSchema = createIdSchema(ID_PREFIXES.NodeId, 'Node ID');
export const EdgeIdSchema = createIdSchema(ID_PREFIXES.EdgeId, 'Edge ID');
export const AchievementIdSchema = createIdSchema(ID_PREFIXES.AchievementId, 'Achievement ID');
export const StreakIdSchema = createIdSchema(ID_PREFIXES.StreakId, 'Streak ID');
export const JobIdSchema = createIdSchema(ID_PREFIXES.JobId, 'Job ID');
export const EventIdSchema = createIdSchema(ID_PREFIXES.EventId, 'Event ID');
export const CorrelationIdSchema = createIdSchema(ID_PREFIXES.CorrelationId, 'Correlation ID');
export const CausationIdSchema = createIdSchema(ID_PREFIXES.CausationId, 'Causation ID');
export const ToolIdSchema = createIdSchema(ID_PREFIXES.ToolId, 'Tool ID');
export const AgentIdSchema = createIdSchema(ID_PREFIXES.AgentId, 'Agent ID');
export const TemplateIdSchema = createIdSchema(ID_PREFIXES.TemplateId, 'Template ID');
export const MediaIdSchema = createIdSchema(ID_PREFIXES.MediaId, 'Media ID');
export const NotificationIdSchema = createIdSchema(ID_PREFIXES.NotificationId, 'Notification ID');
export const RoomIdSchema = createIdSchema(ID_PREFIXES.RoomId, 'Room ID');
export const ScheduleIdSchema = createIdSchema(ID_PREFIXES.ScheduleId, 'Schedule ID');
export const ReviewLogIdSchema = createIdSchema(ID_PREFIXES.ReviewLogId, 'Review Log ID');
export const AlgorithmConfigIdSchema = createIdSchema(
  ID_PREFIXES.AlgorithmConfigId,
  'Algorithm Config ID'
);
export const MutationIdSchema = createIdSchema(ID_PREFIXES.MutationId, 'Mutation ID');
export const MisconceptionPatternIdSchema = createIdSchema(
  ID_PREFIXES.MisconceptionPatternId,
  'Misconception Pattern ID'
);
export const InterventionIdSchema = createIdSchema(ID_PREFIXES.InterventionId, 'Intervention ID');
export const CurriculumIdSchema = createIdSchema(ID_PREFIXES.CurriculumId, 'Curriculum ID');
export const CurriculumVersionIdSchema = createIdSchema(
  ID_PREFIXES.CurriculumVersionId,
  'Curriculum Version ID'
);
export const CurriculumNodeIdSchema = createIdSchema(
  ID_PREFIXES.CurriculumNodeId,
  'Curriculum Node ID'
);
export const CurriculumEdgeIdSchema = createIdSchema(
  ID_PREFIXES.CurriculumEdgeId,
  'Curriculum Edge ID'
);
export const RevisionProposalIdSchema = createIdSchema(
  ID_PREFIXES.RevisionProposalId,
  'Revision Proposal ID'
);
export const RevisionChangeIdSchema = createIdSchema(
  ID_PREFIXES.RevisionChangeId,
  'Revision Change ID'
);

// ============================================================================
// ID Schema Registry
// ============================================================================

/**
 * All ID schemas indexed by prefix.
 */
export const IdSchemas = {
  [ID_PREFIXES.UserId]: UserIdSchema,
  [ID_PREFIXES.CardId]: CardIdSchema,
  [ID_PREFIXES.DeckQueryLogId]: DeckQueryLogIdSchema,
  [ID_PREFIXES.CategoryId]: CategoryIdSchema,
  [ID_PREFIXES.SessionId]: SessionIdSchema,
  [ID_PREFIXES.LessonPlanId]: LessonPlanIdSchema,
  [ID_PREFIXES.GoalId]: GoalIdSchema,
  [ID_PREFIXES.StepId]: StepIdSchema,
  [ID_PREFIXES.ActivityId]: ActivityIdSchema,
  [ID_PREFIXES.EvaluationId]: EvaluationIdSchema,
  [ID_PREFIXES.TriggerId]: TriggerIdSchema,
  [ID_PREFIXES.ConceptId]: ConceptIdSchema,
  [ID_PREFIXES.GeneratedVariantId]: GeneratedVariantIdSchema,
  [ID_PREFIXES.ContentGenerationJobId]: ContentGenerationJobIdSchema,
  [ID_PREFIXES.TraceId]: TraceIdSchema,
  [ID_PREFIXES.DiagnosisId]: DiagnosisIdSchema,
  [ID_PREFIXES.PatchId]: PatchIdSchema,
  [ID_PREFIXES.LoadoutId]: LoadoutIdSchema,
  [ID_PREFIXES.NodeId]: NodeIdSchema,
  [ID_PREFIXES.EdgeId]: EdgeIdSchema,
  [ID_PREFIXES.AchievementId]: AchievementIdSchema,
  [ID_PREFIXES.StreakId]: StreakIdSchema,
  [ID_PREFIXES.JobId]: JobIdSchema,
  [ID_PREFIXES.EventId]: EventIdSchema,
  [ID_PREFIXES.CorrelationId]: CorrelationIdSchema,
  [ID_PREFIXES.CausationId]: CausationIdSchema,
  [ID_PREFIXES.ToolId]: ToolIdSchema,
  [ID_PREFIXES.AgentId]: AgentIdSchema,
  [ID_PREFIXES.TemplateId]: TemplateIdSchema,
  [ID_PREFIXES.MediaId]: MediaIdSchema,
  [ID_PREFIXES.NotificationId]: NotificationIdSchema,
  [ID_PREFIXES.RoomId]: RoomIdSchema,
  [ID_PREFIXES.ScheduleId]: ScheduleIdSchema,
  [ID_PREFIXES.ReviewLogId]: ReviewLogIdSchema,
  [ID_PREFIXES.AlgorithmConfigId]: AlgorithmConfigIdSchema,
  [ID_PREFIXES.MutationId]: MutationIdSchema,
  [ID_PREFIXES.MisconceptionPatternId]: MisconceptionPatternIdSchema,
  [ID_PREFIXES.InterventionId]: InterventionIdSchema,
  [ID_PREFIXES.CurriculumId]: CurriculumIdSchema,
  [ID_PREFIXES.CurriculumVersionId]: CurriculumVersionIdSchema,
  [ID_PREFIXES.CurriculumNodeId]: CurriculumNodeIdSchema,
  [ID_PREFIXES.CurriculumEdgeId]: CurriculumEdgeIdSchema,
  [ID_PREFIXES.RevisionProposalId]: RevisionProposalIdSchema,
  [ID_PREFIXES.RevisionChangeId]: RevisionChangeIdSchema,
} as const;

// ============================================================================
// Type Inference
// ============================================================================

export type UserIdInput = z.input<typeof UserIdSchema>;
export type CardIdInput = z.input<typeof CardIdSchema>;
export type DeckQueryLogIdInput = z.input<typeof DeckQueryLogIdSchema>;
export type CategoryIdInput = z.input<typeof CategoryIdSchema>;
export type SessionIdInput = z.input<typeof SessionIdSchema>;
export type LessonPlanIdInput = z.input<typeof LessonPlanIdSchema>;
export type GoalIdInput = z.input<typeof GoalIdSchema>;
export type StepIdInput = z.input<typeof StepIdSchema>;
export type ActivityIdInput = z.input<typeof ActivityIdSchema>;
export type EvaluationIdInput = z.input<typeof EvaluationIdSchema>;
export type TriggerIdInput = z.input<typeof TriggerIdSchema>;
export type ConceptIdInput = z.input<typeof ConceptIdSchema>;
export type GeneratedVariantIdInput = z.input<typeof GeneratedVariantIdSchema>;
export type ContentGenerationJobIdInput = z.input<typeof ContentGenerationJobIdSchema>;
export type TraceIdInput = z.input<typeof TraceIdSchema>;
export type DiagnosisIdInput = z.input<typeof DiagnosisIdSchema>;
export type PatchIdInput = z.input<typeof PatchIdSchema>;
export type LoadoutIdInput = z.input<typeof LoadoutIdSchema>;
export type NodeIdInput = z.input<typeof NodeIdSchema>;
export type EdgeIdInput = z.input<typeof EdgeIdSchema>;
export type AchievementIdInput = z.input<typeof AchievementIdSchema>;
export type StreakIdInput = z.input<typeof StreakIdSchema>;
export type JobIdInput = z.input<typeof JobIdSchema>;
export type EventIdInput = z.input<typeof EventIdSchema>;
export type CorrelationIdInput = z.input<typeof CorrelationIdSchema>;
export type CausationIdInput = z.input<typeof CausationIdSchema>;
export type ToolIdInput = z.input<typeof ToolIdSchema>;
export type AgentIdInput = z.input<typeof AgentIdSchema>;
export type TemplateIdInput = z.input<typeof TemplateIdSchema>;
export type MediaIdInput = z.input<typeof MediaIdSchema>;
export type NotificationIdInput = z.input<typeof NotificationIdSchema>;
export type RoomIdInput = z.input<typeof RoomIdSchema>;
export type ScheduleIdInput = z.input<typeof ScheduleIdSchema>;
export type ReviewLogIdInput = z.input<typeof ReviewLogIdSchema>;
export type AlgorithmConfigIdInput = z.input<typeof AlgorithmConfigIdSchema>;
export type MutationIdInput = z.input<typeof MutationIdSchema>;
export type MisconceptionPatternIdInput = z.input<typeof MisconceptionPatternIdSchema>;
export type InterventionIdInput = z.input<typeof InterventionIdSchema>;
export type CurriculumIdInput = z.input<typeof CurriculumIdSchema>;
export type CurriculumVersionIdInput = z.input<typeof CurriculumVersionIdSchema>;
export type CurriculumNodeIdInput = z.input<typeof CurriculumNodeIdSchema>;
export type CurriculumEdgeIdInput = z.input<typeof CurriculumEdgeIdSchema>;
export type RevisionProposalIdInput = z.input<typeof RevisionProposalIdSchema>;
export type RevisionChangeIdInput = z.input<typeof RevisionChangeIdSchema>;
