/**
 * @noema/session-service - Step-loop validation schemas.
 */

import {
  EpistemicMode,
  GoalSource,
  GoalState,
  GoalType,
  LearningMode,
  RigorLevel,
  SessionLifecycleState,
  StepSelfRating,
  StudyMode,
  TransformationType,
} from '@noema/types';
import { z } from 'zod';

import { ActivityContentSourceType } from '../../types/index.js';

const values = <T extends Record<string, string>>(value: T): [T[keyof T], ...T[keyof T][]] =>
  Object.values(value) as [T[keyof T], ...T[keyof T][]];

export const StudyModeSchema = z.enum(values(StudyMode));
export const LearningModeSchema = z.enum(values(LearningMode));
export const RigorLevelSchema = z.enum(values(RigorLevel));
export const GoalTypeSchema = z.enum(values(GoalType));
export const GoalStateSchema = z.enum(values(GoalState));
export const GoalSourceSchema = z.enum(values(GoalSource));
export const SessionLifecycleStateSchema = z.enum(values(SessionLifecycleState));
export const EpistemicModeSchema = z.enum(values(EpistemicMode));
export const TransformationTypeSchema = z.enum(values(TransformationType));
export const StepSelfRatingSchema = z.enum(values(StepSelfRating));
export const ActivityContentSourceTypeSchema = z.enum(values(ActivityContentSourceType));

const ConceptIdSchema = z.string().min(1).max(100);
const CurriculumIdSchema = z.string().min(1).max(100);
const CurriculumVersionIdSchema = z.string().min(1).max(100);
const CurriculumNodeIdSchema = z.string().min(1).max(100);
const GoalIdSchema = z.string().min(1).max(100);

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

export const SessionConfigSchema = z
  .object({
    topic: z.string().min(1).max(500).optional(),
    sourceDecks: z.array(z.string().min(1)).optional(),
    sourceCategories: z.array(z.string().min(1)).optional(),
    maxSteps: z.number().int().positive().max(200).optional(),
    maxDurationMinutes: z.number().int().positive().max(1440).optional(),
    sessionTimeoutHours: z.number().positive().max(168).optional(),
  })
  .catchall(z.unknown());

export const StartSessionInputSchema = z.object({
  curriculumId: CurriculumIdSchema,
  curriculumVersionId: CurriculumVersionIdSchema.optional(),
  studyMode: StudyModeSchema.default(StudyMode.KNOWLEDGE_GAINING),
  learningMode: LearningModeSchema.default(LearningMode.EXPLORATION),
  config: SessionConfigSchema.default({}),
  topic: z.string().min(1).max(500).optional(),
  sourceDecks: z.array(z.string().min(1)).default([]),
  sourceCategories: z.array(z.string().min(1)).default([]),
  offlineIntentToken: z.string().min(1).optional(),
});

export type StartSessionInput = z.input<typeof StartSessionInputSchema>;

export const PlannedActivityInputSchema = z.object({
  contentSourceType: ActivityContentSourceTypeSchema.default(ActivityContentSourceType.GENERATED),
  cardId: z.string().min(1).max(50).optional(),
  templateId: z.string().min(1).max(50).optional(),
  generatedVariantId: z.string().min(1).max(50).optional(),
  prompt: z.string().min(1).max(8000),
  renderPayload: z.record(z.unknown()).default({}),
  expectedResponseType: z.string().min(1).max(100).default('free_text'),
  responseSchema: z.record(z.unknown()).default({}),
  variantSeed: z.string().min(1).max(100).optional(),
  generationFallbackReason: z.string().min(1).max(500).optional(),
});

export const PlannedStepInputSchema = z.object({
  objective: z.string().min(1).max(1000),
  servesGoalIds: z.array(GoalIdSchema).default([]),
  eligibleModes: z.array(EpistemicModeSchema).min(1).optional(),
  selectedMode: EpistemicModeSchema.optional(),
  transformationType: TransformationTypeSchema.default(TransformationType.RECALL),
  expectedOutcome: z.string().min(1).max(2000),
  evaluationType: z.string().min(1).max(100).default('self_explanation'),
  difficulty: z.number().min(0).max(1).default(0.5),
  isRepair: z.boolean().default(false),
  conceptRefs: z.array(ConceptIdSchema).default([]),
  variantSeed: z.string().min(1).max(100).optional(),
  activities: z.array(PlannedActivityInputSchema).optional(),
});

export const CreateLessonPlanInputSchema = z.object({
  curriculumId: CurriculumIdSchema.optional(),
  curriculumVersionId: CurriculumVersionIdSchema.optional(),
  selectedNodeIds: z.array(CurriculumNodeIdSchema).default([]),
  rigorLevel: RigorLevelSchema.default(RigorLevel.MINIMAL),
  topic: z.string().min(1).max(500).optional(),
  prerequisites: z.array(ConceptIdSchema).default([]),
  sourceDecks: z.array(z.string().min(1)).default([]),
  sourceCategories: z.array(z.string().min(1)).default([]),
  assessmentStrategy: z.string().min(1).max(2000).optional(),
  adaptationRules: z.string().min(1).max(2000).optional(),
  steps: z.array(PlannedStepInputSchema).optional(),
});

export type CreateLessonPlanInput = z.input<typeof CreateLessonPlanInputSchema>;

export const CreateGoalInputSchema = z.object({
  description: z.string().min(1).max(1000),
  type: GoalTypeSchema,
  parentGoalId: GoalIdSchema.optional(),
  state: GoalStateSchema.default(GoalState.PENDING),
  source: GoalSourceSchema.default(GoalSource.USER_ACCEPTED),
  conceptRefs: z.array(ConceptIdSchema).default([]),
});

export type CreateGoalInput = z.input<typeof CreateGoalInputSchema>;

export const AnswerStepInputSchema = z.object({
  response: z.unknown().optional(),
  correct: z.boolean(),
  selfRating: StepSelfRatingSchema,
  evaluationId: z.string().min(1).max(50).optional(),
  trace: SevenFrameTraceSchema,
  responseTimeMs: z.number().int().nonnegative().optional(),
});

export type AnswerStepInput = z.input<typeof AnswerStepInputSchema>;

export const SkipStepInputSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
  skippedBy: z.string().min(1).max(100).optional(),
});

export type SkipStepInput = z.input<typeof SkipStepInputSchema>;

export const SessionListQuerySchema = z.object({
  lifecycleState: SessionLifecycleStateSchema.optional(),
  learningMode: LearningModeSchema.optional(),
  studyMode: StudyModeSchema.optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  completedAfter: z.string().datetime().optional(),
  completedBefore: z.string().datetime().optional(),
});

export type SessionListQuery = z.input<typeof SessionListQuerySchema>;

export const IssueOfflineIntentTokenInputSchema = z.object({
  userId: z.string().min(1),
  sessionBlueprint: z.unknown(),
  expiresInSeconds: z
    .number()
    .int()
    .min(60)
    .max(60 * 60 * 24),
});

export type IssueOfflineIntentTokenInput = z.input<typeof IssueOfflineIntentTokenInputSchema>;

export const VerifyOfflineIntentTokenInputSchema = z.object({
  token: z.string().min(1),
});

export type VerifyOfflineIntentTokenInput = z.input<typeof VerifyOfflineIntentTokenInputSchema>;
