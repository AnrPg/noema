import { describe, expect, it, vi } from 'vitest';
import {
  EpistemicMode,
  GoalSource,
  GoalState,
  GoalType,
  LearningMode,
  ReplanScope,
  RigorLevel,
  StepStatus,
  StudyMode,
  TransformationType,
  type ConceptId,
  type CorrelationId,
  type GoalId,
  type LessonPlanId,
  type SessionId,
  type StepId,
  type UserId,
} from '@noema/types';
import {
  GuardianArtifactType,
  GuardianResult,
  PedagogyGuardianService,
  type IGuardianLessonPlan,
  type IGuardianRepository,
  type IGuardianValidation,
  type IGuardianValidationInput,
  type IGuardianStep,
} from '../../../src/domain/pedagogy-guardian-service/index.js';

class FakeGuardianRepository implements IGuardianRepository {
  readonly validations: IGuardianValidation[] = [];

  createValidation(input: IGuardianValidationInput): Promise<IGuardianValidation> {
    const validation: IGuardianValidation = {
      id: `guard_${String(this.validations.length + 1).padStart(2, '0')}`,
      createdAt: new Date().toISOString(),
      ...input,
    };
    this.validations.push(validation);
    return Promise.resolve(validation);
  }
}

const ids = {
  userId: 'user_ABCDEFGHIJKLMNOPQRSTU' as UserId,
  sessionId: 'session_ABCDEFGHIJKLMNOPQRSTU' as SessionId,
  lessonPlanId: 'lesson_ABCDEFGHIJKLMNOPQRSTU' as LessonPlanId,
  goalId: 'goal_ABCDEFGHIJKLMNOPQRSTU' as GoalId,
  stepId: 'step_ABCDEFGHIJKLMNOPQRSTU' as StepId,
  stepId2: 'step_BBCDEFGHIJKLMNOPQRSTU' as StepId,
  conceptId: 'concept_ABCDEFGHIJKLMNOPQRSTU' as ConceptId,
  correlationId: 'correlation_ABCDEFGHIJ' as CorrelationId,
};

function makeService() {
  const repository = new FakeGuardianRepository();
  const publisher = {
    publish: vi.fn(() => Promise.resolve(undefined)),
    publishBatch: vi.fn(),
  };
  const logger = {
    child: () => logger,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  } as never;
  const service = new PedagogyGuardianService(repository, publisher, logger);
  return { service, repository, publisher };
}

function validStep(overrides: Partial<IGuardianStep> = {}): IGuardianStep {
  return {
    id: ids.stepId,
    lessonPlanId: ids.lessonPlanId,
    sessionId: ids.sessionId,
    userId: ids.userId,
    studyMode: StudyMode.KNOWLEDGE_GAINING,
    position: 0,
    objective: 'Explain conservation of energy.',
    servesGoalIds: [ids.goalId],
    eligibleModes: [EpistemicMode.GENERATIVE_RETRIEVAL, EpistemicMode.LOOPHOLE_LEARNING],
    selectedMode: EpistemicMode.GENERATIVE_RETRIEVAL,
    transformationType: TransformationType.EXPLANATION,
    expectedOutcome: 'Learner can reason about the principle.',
    evaluationType: 'self_explanation',
    difficulty: 0.5,
    isRepair: false,
    conceptRefs: [ids.conceptId],
    status: StepStatus.PLANNED,
    activities: [
      {
        id: 'activity_ABCDEFGHIJKLMNOP' as never,
        stepId: ids.stepId,
        contentSourceType: 'generated',
        generatedVariantId: 'variant_ABCDEFGHIJKLMNOP' as never,
        prompt: 'Explain the principle without naming the answer.',
        expectedResponseType: 'free_text',
        responseSchema: { type: 'string' },
      },
    ],
    ...overrides,
  };
}

function validPlan(overrides: Partial<IGuardianLessonPlan> = {}): IGuardianLessonPlan {
  return {
    id: ids.lessonPlanId,
    sessionId: ids.sessionId,
    userId: ids.userId,
    studyMode: StudyMode.KNOWLEDGE_GAINING,
    learningMode: LearningMode.GOAL_DRIVEN,
    rigorLevel: RigorLevel.FULL,
    topic: 'Physics',
    prerequisites: [],
    goals: [
      {
        id: ids.goalId,
        lessonPlanId: ids.lessonPlanId,
        description: 'Reason about conservation laws.',
        type: GoalType.REASONING,
        state: GoalState.ACTIVE,
        source: GoalSource.SYSTEM_PROPOSED,
        conceptRefs: [ids.conceptId],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as never,
    ],
    steps: [validStep()],
    ...overrides,
  };
}

describe('PedagogyGuardianService', () => {
  it('accepts a valid full LessonPlan', async () => {
    const { service } = makeService();
    const result = await service.validateLessonPlan(
      { lessonPlan: validPlan(), triggeredBy: 'unit-test' },
      { correlationId: ids.correlationId, userId: ids.userId }
    );

    expect(result.result).toBe(GuardianResult.ACCEPTED);
    expect(result.reasonCodes).toEqual([]);
  });

  it('rejects malformed LessonPlans with deterministic reason codes', async () => {
    const { service, publisher } = makeService();
    const badStep = validStep({
      servesGoalIds: [],
      conceptRefs: [],
      selectedMode: EpistemicMode.LOOPHOLE_LEARNING,
      eligibleModes: [EpistemicMode.GENERATIVE_RETRIEVAL],
    });
    const result = await service.validateLessonPlan(
      {
        lessonPlan: validPlan({
          goals: [
            ...validPlan().goals,
            {
              ...validPlan().goals[0],
              id: 'goal_BBCDEFGHIJKLMNOPQRSTU' as GoalId,
              type: GoalType.ACQUISITION,
            },
          ],
          steps: [badStep],
        }),
      },
      { correlationId: ids.correlationId, userId: ids.userId }
    );

    expect(result.result).toBe(GuardianResult.REJECTED);
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        'CONTRADICTORY_GOALS',
        'STEP_WITHOUT_GOAL',
        'EVALUATION_DOES_NOT_MEASURE_GOAL',
        'SELECTED_MODE_NOT_ELIGIBLE',
        'STEP_CONCEPT_REFS_EMPTY',
      ])
    );
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'pedagogy.validation.rejected',
        aggregateType: 'GuardianValidation',
      })
    );
  });

  it('rejects repair Steps that repeat the failed Step shape', async () => {
    const { service } = makeService();
    const failed = validStep({ status: StepStatus.EVALUATED });
    const repair = validStep({ isRepair: true });

    const result = await service.validateStep(
      { step: repair, previousFailedStep: failed },
      { correlationId: ids.correlationId }
    );

    expect(result.reasonCodes).toContain('REPAIR_STEP_NOT_TRANSFORMED');
  });

  it('rejects replans that mutate evaluated Steps and escalate scope', async () => {
    const { service } = makeService();
    const evaluated = validStep({ status: StepStatus.EVALUATED });
    const current = validPlan({ steps: [evaluated] });
    const proposed = validPlan({
      steps: [
        {
          ...evaluated,
          objective: 'Mutated completed Step.',
        },
      ],
    });

    const result = await service.validateReplan(
      {
        current,
        proposed,
        trigger: { type: 'failure' },
        scope: ReplanScope.FULL,
      },
      { correlationId: ids.correlationId }
    );

    expect(result.reasonCodes).toEqual(
      expect.arrayContaining(['EVALUATED_STEP_MUTATED', 'REPLAN_SCOPE_ESCALATED'])
    );
  });

  it('rejects generated variants that leak answers or mismatch response schemas', async () => {
    const { service } = makeService();
    const result = await service.validateGeneratedVariant(
      {
        variant: {
          id: 'variant_ABCDEFGHIJKLMNOP' as never,
          conceptId: ids.conceptId,
          transformationType: TransformationType.RECALL,
          epistemicMode: EpistemicMode.GENERATIVE_RETRIEVAL,
          difficultyBucket: 2,
          prompt: 'Correct answer: entropy.',
          expectedResponseType: 'multiple_choice',
          responseSchema: { type: 'string' },
          renderPayload: {},
        },
      },
      { correlationId: ids.correlationId }
    );

    expect(result.reasonCodes).toEqual(
      expect.arrayContaining(['PROMPT_LEAKS_ANSWER', 'RESPONSE_SCHEMA_MISMATCH'])
    );
  });

  it('persists artifact type and blocking result for activity validation', async () => {
    const { service, repository } = makeService();
    await service.validateActivity(
      {
        activity: {
          id: 'activity_ABCDEFGHIJKLMNOP' as never,
          contentSourceType: 'card',
          prompt: 'Answer briefly.',
          expectedResponseType: 'free_text',
          responseSchema: { type: 'string' },
        },
      },
      { correlationId: ids.correlationId }
    );

    expect(repository.validations.at(-1)).toEqual(
      expect.objectContaining({
        artifactType: GuardianArtifactType.ACTIVITY,
        result: GuardianResult.REJECTED,
        blocking: true,
        reasonCodes: ['CARD_SOURCE_ID_MISSING'],
      })
    );
  });
});
