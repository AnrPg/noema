import { ID_PREFIXES } from '@noema/types';
import { z } from 'zod';

function createIdSchema(prefix: string, description: string): z.ZodString {
  const pattern = new RegExp(`^${prefix}[a-zA-Z0-9_-]{21}$`);
  return z
    .string()
    .regex(pattern, `Invalid ${description} format. Expected ${prefix}<21-char-nanoid>`)
    .describe(description);
}

function createUnionIdSchema(
  prefixes: readonly string[],
  description: string,
  expectedPrefixes: readonly string[]
): z.ZodString {
  const pattern = new RegExp(`^(?:${prefixes.join('|')})[a-zA-Z0-9_-]{21}$`);
  return z
    .string()
    .regex(
      pattern,
      `Invalid ${description} format. Expected ${expectedPrefixes.join(' or ')}<21-char-nanoid>`
    )
    .describe(description);
}

export const UserIdSchema = createIdSchema(ID_PREFIXES.UserId, 'User ID');
export const SessionIdSchema = createIdSchema(ID_PREFIXES.SessionId, 'Session ID');
export const LessonPlanIdSchema = createIdSchema(ID_PREFIXES.LessonPlanId, 'Lesson Plan ID');
export const GoalIdSchema = createIdSchema(ID_PREFIXES.GoalId, 'Goal ID');
export const StepIdSchema = createIdSchema(ID_PREFIXES.StepId, 'Step ID');
export const ActivityIdSchema = createIdSchema(ID_PREFIXES.ActivityId, 'Activity ID');
export const EvaluationIdSchema = createIdSchema(ID_PREFIXES.EvaluationId, 'Evaluation ID');
export const TriggerIdSchema = createIdSchema(ID_PREFIXES.TriggerId, 'Trigger ID');
export const ConceptIdSchema = createUnionIdSchema(
  [ID_PREFIXES.ConceptId, ID_PREFIXES.NodeId],
  'Concept ID',
  [ID_PREFIXES.ConceptId, ID_PREFIXES.NodeId]
);
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
export const CardIdSchema = createIdSchema(ID_PREFIXES.CardId, 'Card ID');
export const GeneratedVariantIdSchema = createIdSchema(
  ID_PREFIXES.GeneratedVariantId,
  'Generated Variant ID'
);
export const ContentGenerationJobIdSchema = createIdSchema(
  ID_PREFIXES.ContentGenerationJobId,
  'Content Generation Job ID'
);
export const EventIdSchema = createIdSchema(ID_PREFIXES.EventId, 'Event ID');
export const CorrelationIdSchema = createIdSchema(ID_PREFIXES.CorrelationId, 'Correlation ID');
export const CausationIdSchema = createIdSchema(ID_PREFIXES.CausationId, 'Causation ID');

export const IdSchemas = {
  [ID_PREFIXES.UserId]: UserIdSchema,
  [ID_PREFIXES.SessionId]: SessionIdSchema,
  [ID_PREFIXES.LessonPlanId]: LessonPlanIdSchema,
  [ID_PREFIXES.GoalId]: GoalIdSchema,
  [ID_PREFIXES.StepId]: StepIdSchema,
  [ID_PREFIXES.ActivityId]: ActivityIdSchema,
  [ID_PREFIXES.EvaluationId]: EvaluationIdSchema,
  [ID_PREFIXES.TriggerId]: TriggerIdSchema,
  [ID_PREFIXES.ConceptId]: ConceptIdSchema,
  [ID_PREFIXES.CurriculumId]: CurriculumIdSchema,
  [ID_PREFIXES.CurriculumVersionId]: CurriculumVersionIdSchema,
  [ID_PREFIXES.CurriculumNodeId]: CurriculumNodeIdSchema,
  [ID_PREFIXES.CurriculumEdgeId]: CurriculumEdgeIdSchema,
  [ID_PREFIXES.RevisionProposalId]: RevisionProposalIdSchema,
  [ID_PREFIXES.RevisionChangeId]: RevisionChangeIdSchema,
  [ID_PREFIXES.CardId]: CardIdSchema,
  [ID_PREFIXES.GeneratedVariantId]: GeneratedVariantIdSchema,
  [ID_PREFIXES.ContentGenerationJobId]: ContentGenerationJobIdSchema,
  [ID_PREFIXES.EventId]: EventIdSchema,
  [ID_PREFIXES.CorrelationId]: CorrelationIdSchema,
  [ID_PREFIXES.CausationId]: CausationIdSchema,
} as const;

export type UserIdInput = z.input<typeof UserIdSchema>;
export type ConceptIdInput = z.input<typeof ConceptIdSchema>;
export type CurriculumNodeIdInput = z.input<typeof CurriculumNodeIdSchema>;
