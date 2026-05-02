import { SchedulerQueueSchema, StudyModeSchema, TransformationTypeSchema } from '@noema/validation';
import { z } from 'zod';

export const EvaluationRecordedInputSchema = z.object({
  evaluationId: z.string().min(1).max(100),
  stepId: z.string().min(1).max(100),
  sessionId: z.string().min(1).max(100),
  userId: z.string().min(1).max(100),
  conceptRefs: z.array(z.string().min(1).max(100)).min(1),
  reasoningQuality: z.number().min(0).max(1),
  confidenceSignal: z.number().min(0).max(1),
  combinedScore: z.number().min(0).max(1),
  correct: z.boolean(),
  studyMode: StudyModeSchema.optional(),
  transformation: TransformationTypeSchema.optional(),
  recordedAt: z.string().datetime().optional(),
});

export const GetDueConceptsQuerySchema = z.object({
  studyMode: StudyModeSchema.optional(),
  queue: SchedulerQueueSchema.optional(),
  asOf: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const GetTransformationHistoryQuerySchema = z.object({
  studyMode: StudyModeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
