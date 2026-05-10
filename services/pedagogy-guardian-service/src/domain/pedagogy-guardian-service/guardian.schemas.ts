import {
  ConceptIdSchema,
  GoalIdSchema,
  LessonPlanIdSchema,
  StepIdSchema,
} from '@noema/learning-kernel';
import {
  EpistemicMode,
  GoalType,
  LearningInterventionType,
  LearningMode,
  ReplanScope,
  RigorLevel,
  StepStatus,
  StudyMode,
  TransformationType,
} from '@noema/types';
import { z } from 'zod';

const values = <T extends Record<string, string>>(value: T): [T[keyof T], ...T[keyof T][]] =>
  Object.values(value) as [T[keyof T], ...T[keyof T][]];

export const JsonSchemaFragmentSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonSchemaFragmentSchema),
    z.record(JsonSchemaFragmentSchema),
  ])
);

export const GuardianActivitySchema = z.object({
  id: z.string().min(1).max(100),
  stepId: StepIdSchema.optional(),
  contentSourceType: z.enum(['card', 'template', 'generated']),
  cardId: z.string().min(1).max(100).nullable().optional(),
  templateId: z.string().min(1).max(100).nullable().optional(),
  generatedVariantId: z.string().min(1).max(100).nullable().optional(),
  prompt: z.string().min(1).max(8000),
  expectedResponseType: z.string().min(1).max(100),
  responseSchema: JsonSchemaFragmentSchema,
  compatibleTransformations: z.array(z.enum(values(TransformationType))).optional(),
  content: z.unknown().optional(),
});

export const GuardianStepSchema = z.object({
  id: StepIdSchema,
  lessonPlanId: LessonPlanIdSchema,
  sessionId: z.string().min(1).max(100),
  userId: z.string().min(1).max(100),
  studyMode: z.enum(values(StudyMode)),
  position: z.number().int().nonnegative(),
  objective: z.string().min(1).max(1000),
  servesGoalIds: z.array(GoalIdSchema).default([]),
  eligibleModes: z.array(z.enum(values(EpistemicMode))).min(1),
  selectedMode: z.enum(values(EpistemicMode)),
  transformationType: z.enum(values(TransformationType)),
  expectedOutcome: z.string().max(2000).optional(),
  evaluationType: z.string().min(1).max(100),
  difficulty: z.number().min(0).max(1),
  isRepair: z.boolean().default(false),
  conceptRefs: z.array(ConceptIdSchema).default([]),
  status: z.union([z.enum(values(StepStatus)), z.string().min(1)]),
  activities: z.array(GuardianActivitySchema).default([]),
  supersededByStepId: StepIdSchema.nullable().optional(),
});

export const GuardianLessonPlanSchema = z.object({
  id: LessonPlanIdSchema,
  sessionId: z.string().min(1).max(100),
  userId: z.string().min(1).max(100),
  studyMode: z.enum(values(StudyMode)),
  learningMode: z.enum(values(LearningMode)),
  rigorLevel: z.enum(values(RigorLevel)),
  topic: z.string().min(1).max(500),
  prerequisites: z.array(ConceptIdSchema).default([]),
  goals: z
    .array(
      z.object({
        id: GoalIdSchema,
        type: z.enum(values(GoalType)),
        state: z.string().optional(),
        conceptRefs: z.array(ConceptIdSchema).optional(),
      })
    )
    .default([]),
  steps: z.array(GuardianStepSchema).default([]),
});

export const ValidateStepInputSchema = z.object({
  step: GuardianStepSchema,
  previousFailedStep: GuardianStepSchema.optional(),
  triggeredBy: z.string().min(1).max(100).default('api'),
});

export const ValidateActivityInputSchema = z.object({
  activity: GuardianActivitySchema,
  step: GuardianStepSchema.optional(),
  triggeredBy: z.string().min(1).max(100).default('api'),
});

export const ValidateLessonPlanInputSchema = z.object({
  lessonPlan: GuardianLessonPlanSchema,
  triggeredBy: z.string().min(1).max(100).default('api'),
});

export const ValidateReplanInputSchema = z.object({
  current: GuardianLessonPlanSchema,
  proposed: GuardianLessonPlanSchema,
  trigger: z.object({
    type: z.string().min(1).max(100),
    severity: z.number().min(0).max(1).optional(),
    recommendedIntervention: z.enum(values(LearningInterventionType)).optional(),
  }),
  scope: z.enum(values(ReplanScope)),
  triggeredBy: z.string().min(1).max(100).default('api'),
});

export const GeneratedVariantSchema = z.object({
  id: z.string().min(1).max(100),
  conceptId: ConceptIdSchema,
  transformationType: z.enum(values(TransformationType)),
  epistemicMode: z.enum(values(EpistemicMode)),
  difficultyBucket: z.number().int().min(0).max(4),
  prompt: z.string().min(1).max(8000),
  expectedResponseType: z.string().min(1).max(100),
  responseSchema: JsonSchemaFragmentSchema,
  renderPayload: z.unknown(),
});

export const ValidateGeneratedVariantInputSchema = z.object({
  variant: GeneratedVariantSchema,
  triggeredBy: z.string().min(1).max(100).default('api'),
});
