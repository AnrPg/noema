import {
  ConceptIdSchema,
  EvaluationIdSchema,
  SessionIdSchema,
  StepIdSchema,
  StudyModeSchema,
  UserIdSchema,
} from '@noema/learning-kernel';
import { SchedulerQueueSchema, TransformationTypeSchema } from '@noema/validation';
import { z } from 'zod';

export const EvaluationRecordedInputSchema = z.object({
  evaluationId: EvaluationIdSchema,
  stepId: StepIdSchema,
  sessionId: SessionIdSchema,
  userId: UserIdSchema,
  conceptRefs: z.array(ConceptIdSchema).min(1),
  reasoningQuality: z.number().min(0).max(1),
  confidenceSignal: z.number().min(0).max(1),
  combinedScore: z.number().min(0).max(1),
  correct: z.boolean(),
  studyMode: StudyModeSchema,
  transformation: TransformationTypeSchema.optional(),
  recordedAt: z.string().datetime().optional(),
});

export const GetDueConceptsQuerySchema = z.object({
  studyMode: StudyModeSchema.optional(),
  queue: SchedulerQueueSchema.optional(),
  asOf: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const GetConceptScheduleInputSchema = z.object({
  conceptId: ConceptIdSchema,
  studyMode: StudyModeSchema,
});

export const GetTransformationHistoryQuerySchema = z.object({
  studyMode: StudyModeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
