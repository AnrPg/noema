import { describe, expect, it } from 'vitest';
import {
  ConceptStateSchema,
  EligibilityGroupSchema,
  EpistemicModeSchema,
  LearningInterventionTypeSchema,
  LessonPlanIdSchema,
  RigorLevelSchema,
  SchedulerQueueSchema,
  SchedulerRatingSchema,
  StepSelfRatingSchema,
  TransformationTypeSchema,
  TriggerTypeSchema,
} from './index.js';

const nanoidSuffix = 'ABCDEFGHIJKLMNOPQRSTU';

describe('realignment vocabulary schemas', () => {
  it('accepts canonical Batch 1 enum values', () => {
    expect(EpistemicModeSchema.parse('generative_retrieval')).toBe('generative_retrieval');
    expect(TransformationTypeSchema.parse('explanation')).toBe('explanation');
    expect(ConceptStateSchema.parse('stable')).toBe('stable');
    expect(StepSelfRatingSchema.parse('hesitated')).toBe('hesitated');
    expect(TriggerTypeSchema.parse('overconfidence')).toBe('overconfidence');
    expect(LearningInterventionTypeSchema.parse('insert_repair_step')).toBe('insert_repair_step');
    expect(EligibilityGroupSchema.parse('reinforcement')).toBe('reinforcement');
    expect(RigorLevelSchema.parse('full')).toBe('full');
    expect(SchedulerQueueSchema.parse('new_learning')).toBe('new_learning');
    expect(SchedulerRatingSchema.parse('good')).toBe('good');
  });

  it('rejects removed stale vocabulary', () => {
    expect(EpistemicModeSchema.safeParse('standard').success).toBe(false);
    expect(EpistemicModeSchema.safeParse('STANDARD').success).toBe(false);
  });

  it('validates new branded ID prefixes', () => {
    expect(LessonPlanIdSchema.parse(`lesson_${nanoidSuffix}`)).toBe(`lesson_${nanoidSuffix}`);
    expect(LessonPlanIdSchema.safeParse(`plan_${nanoidSuffix}`).success).toBe(false);
  });
});
