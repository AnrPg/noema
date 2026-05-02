import { describe, expect, expectTypeOf, it } from 'vitest';
import { ConceptId, GoalId, LessonPlanId, SessionId, StepId, UserId } from '@noema/types';
import type { ILessonPlanDto, IReplanDto, IStepDto } from './learning-loop.js';

describe('learning-loop contracts', () => {
  it('models a Step-first lesson plan with embedded steps and replan DTOs', () => {
    expectTypeOf<ILessonPlanDto['steps'][number]>().toEqualTypeOf<IStepDto>();
    expectTypeOf<IReplanDto['insertedSteps'][number]>().toEqualTypeOf<IStepDto>();

    const step = {
      id: StepId.create('step_ABCDEFGHIJKLMNOPQRSTU'),
      lessonPlanId: LessonPlanId.create('lesson_ABCDEFGHIJKLMNOPQRSTU'),
      sessionId: SessionId.create('session_ABCDEFGHIJKLMNOPQRSTU'),
      userId: UserId.create('user_ABCDEFGHIJKLMNOPQRSTU'),
      studyMode: 'knowledge_gaining',
      position: 1,
      objective: 'Explain the principle in your own words.',
      servesGoalIds: [GoalId.create('goal_ABCDEFGHIJKLMNOPQRSTU')],
      eligibleModes: ['generative_retrieval'],
      selectedMode: 'generative_retrieval',
      transformationType: 'explanation',
      expectedOutcome: 'Learner gives a causal explanation.',
      evaluationType: 'reasoning_trace',
      difficulty: 0.4,
      isRepair: false,
      conceptRefs: [ConceptId.create('concept_ABCDEFGHIJKLMNOPQRSTU')],
      variantSeed: 'seed-1',
      status: 'planned',
      activities: [],
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
      version: 1,
    } satisfies IStepDto;

    expect(step.selectedMode).toBe('generative_retrieval');
  });
});
