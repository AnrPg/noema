import { StepSelfRating, StudyMode } from '@noema/types';
import { StudyModeSchema, TransformationTypeSchema } from '@noema/validation';
import { z } from 'zod';

const values = <T extends Record<string, string>>(value: T): [T[keyof T], ...T[keyof T][]] =>
  Object.values(value) as [T[keyof T], ...T[keyof T][]];

export const ConceptIdSchema = z.string().min(1).max(100);
export const LessonPlanIdSchema = z.string().min(1).max(100);
export const StepIdSchema = z.string().min(1).max(100);
export const SessionIdSchema = z.string().min(1).max(100);
export const UserIdSchema = z.string().min(1).max(100);
export const StepSelfRatingSchema = z.enum(values(StepSelfRating));

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

export const RecordEvaluationInputSchema = z.object({
  evaluationId: z.string().min(1).max(50).optional(),
  stepId: StepIdSchema,
  lessonPlanId: LessonPlanIdSchema,
  sessionId: SessionIdSchema,
  userId: UserIdSchema.optional(),
  conceptRefs: z.array(ConceptIdSchema).min(1),
  correct: z.boolean(),
  selfRating: StepSelfRatingSchema,
  trace: SevenFrameTraceSchema,
  errorType: z.string().min(1).max(100).optional(),
  misconceptionRef: z.string().min(1).max(100).optional(),
  responseTimeMs: z.number().int().nonnegative().optional(),
  recentFailures: z.number().int().nonnegative().default(0),
  prerequisiteGapConceptIds: z.array(ConceptIdSchema).default([]),
  studyMode: StudyModeSchema.default(StudyMode.KNOWLEDGE_GAINING),
  transformation: TransformationTypeSchema.optional(),
});

export type RecordEvaluationInput = z.input<typeof RecordEvaluationInputSchema>;
