import { nanoid } from 'nanoid';
import type { Logger } from 'pino';

import {
  EligibilityGroup,
  EpistemicMode,
  ID_PREFIXES,
  LearningInterventionType,
  MODE_GROUPS,
  ReplanScope,
  StepStatus,
  TransformationType,
  TriggerType,
  type ActivityId,
  type ConceptId,
  type CorrelationId,
  type EventId,
  type LessonPlanId,
  type SessionId,
  type StepId,
  type TriggerId,
  type UserId,
} from '@noema/types';

import type { Prisma, PrismaClient } from '../../../generated/prisma/index.js';
import { BusinessRuleError } from '../session-service/errors/index.js';
import type { IOutboxEventInput, IOutboxRepository } from '../session-service/outbox.repository.js';
import type { IPedagogyGuardianPort } from '../session-service/pedagogy-guardian.port.js';
import type {
  ICreateStepRecord,
  ISessionRepository,
} from '../session-service/session.repository.js';
import {
  ActivityContentSourceType,
  type ILessonPlan,
  type ILessonPlanGoal,
  type ISession,
  type IStep,
} from '../../types/index.js';
import { applyLoadoutToStep } from './loadout.js';

export interface IMetacognitionTriggerInput {
  triggerId: TriggerId;
  userId: UserId;
  type: TriggerType;
  severity: number;
  conceptRefs: ConceptId[];
  stepId: StepId;
  sessionId: SessionId;
  recommendedIntervention?: LearningInterventionType;
}

export interface IStrategyExecutionContext {
  correlationId: CorrelationId;
  userId: UserId;
}

export interface IStrategyReplanResult {
  lessonPlanId: LessonPlanId;
  sessionId: SessionId;
  triggerIds: TriggerId[];
  scope: ReplanScope;
  interventionType: LearningInterventionType;
  supersededStepIds: StepId[];
  insertedStepIds: StepId[];
}

function newId(prefix: string): string {
  return `${prefix}${nanoid(21)}`;
}

export class StrategyService {
  private readonly logger: Logger;

  constructor(
    private readonly repository: ISessionRepository,
    private readonly outboxRepository: IOutboxRepository,
    private readonly prisma: PrismaClient,
    private readonly guardian: IPedagogyGuardianPort,
    logger: Logger
  ) {
    this.logger = logger.child({ component: 'StrategyService' });
  }

  async handleTrigger(
    trigger: IMetacognitionTriggerInput,
    ctx: IStrategyExecutionContext
  ): Promise<IStrategyReplanResult> {
    const session = await this.repository.getSessionById(trigger.sessionId);
    if (session.userId !== trigger.userId || session.userId !== ctx.userId) {
      throw new BusinessRuleError('Trigger user does not match session owner', {
        triggerId: trigger.triggerId,
        sessionId: trigger.sessionId,
      });
    }

    const lessonPlan = await this.repository.findLessonPlanBySessionId(session.id);
    if (!lessonPlan) {
      throw new BusinessRuleError('Cannot replan a session without an active LessonPlan', {
        sessionId: session.id,
        triggerId: trigger.triggerId,
      });
    }

    const [steps, goals] = await Promise.all([
      this.repository.findStepsBySessionId(session.id),
      this.repository.findGoalsByLessonPlanId(lessonPlan.id),
    ]);
    const failedStep = steps.find((step) => step.id === trigger.stepId);
    if (!failedStep) {
      throw new BusinessRuleError('Trigger references an unknown Step', {
        triggerId: trigger.triggerId,
        stepId: trigger.stepId,
      });
    }

    const interventionType =
      trigger.recommendedIntervention ?? this.defaultInterventionForTrigger(trigger);
    const scope = this.chooseScope(trigger, lessonPlan, steps);
    if (scope === ReplanScope.FULL) {
      throw new BusinessRuleError('Full LessonPlan replacement requires a generation agent', {
        triggerId: trigger.triggerId,
        lessonPlanId: lessonPlan.id,
      });
    }

    const insertedSteps = this.buildInsertedSteps({
      session,
      lessonPlan,
      failedStep,
      trigger,
      interventionType,
      scope,
    });
    const proposedSteps: (IStep | ICreateStepRecord)[] = [...steps, ...insertedSteps];
    const currentPlan = this.guardianPlan(lessonPlan, goals, steps);
    const proposedPlan = this.guardianPlan(lessonPlan, goals, proposedSteps);

    const replanValidation = await this.guardian.validateReplan(
      {
        current: currentPlan,
        proposed: proposedPlan,
        trigger: {
          type: trigger.type,
          severity: trigger.severity,
          recommendedIntervention: interventionType,
        },
        scope,
        triggeredBy: 'session-service.strategy',
      },
      ctx
    );
    if (replanValidation.blocking) {
      throw new BusinessRuleError('Pedagogy Guardian rejected strategy replan', {
        triggerId: trigger.triggerId,
        validationId: replanValidation.validationId,
        reasonCodes: replanValidation.reasonCodes,
      });
    }

    for (const step of insertedSteps) {
      const stepValidation = await this.guardian.validateStep(
        { step, triggeredBy: 'session-service.strategy.insertStep' },
        ctx
      );
      if (stepValidation.blocking) {
        throw new BusinessRuleError('Pedagogy Guardian rejected strategy Step', {
          triggerId: trigger.triggerId,
          stepId: step.id,
          validationId: stepValidation.validationId,
          reasonCodes: stepValidation.reasonCodes,
        });
      }
      step.guardianValidationId = stepValidation.validationId;
    }

    const result: IStrategyReplanResult = {
      lessonPlanId: lessonPlan.id,
      sessionId: session.id,
      triggerIds: [trigger.triggerId],
      scope,
      interventionType,
      supersededStepIds: [],
      insertedStepIds: insertedSteps.map((step) => step.id),
    };

    await this.prisma.$transaction(async (tx) => {
      await this.repository.createSteps(insertedSteps, tx);
      await this.enqueueStrategyEvents(result, ctx, tx);
    });

    this.logger.info(
      { triggerId: trigger.triggerId, scope, interventionType, inserted: result.insertedStepIds },
      'Strategy replan committed'
    );

    return result;
  }

  chooseScope(
    trigger: Pick<IMetacognitionTriggerInput, 'type' | 'severity' | 'conceptRefs'>,
    lessonPlan: ILessonPlan,
    steps: readonly IStep[]
  ): ReplanScope {
    if (this.planFundamentallyInvalidated(trigger, lessonPlan, steps)) return ReplanScope.FULL;
    if (trigger.type === TriggerType.PREREQUISITE_GAP) return ReplanScope.STRUCTURAL;
    if (trigger.type === TriggerType.FAILURE && trigger.severity > 0.8) {
      return ReplanScope.STRUCTURAL;
    }
    return ReplanScope.LOCAL;
  }

  defaultInterventionForTrigger(
    trigger: Pick<IMetacognitionTriggerInput, 'type'>
  ): LearningInterventionType {
    switch (trigger.type) {
      case TriggerType.FAILURE:
        return LearningInterventionType.INSERT_REPAIR_STEP;
      case TriggerType.CONFUSION:
        return LearningInterventionType.INSERT_CONTRASTIVE_STEP;
      case TriggerType.SLOW_THINKING:
        return LearningInterventionType.INSERT_CALIBRATION_STEP;
      case TriggerType.OVERCONFIDENCE:
        return LearningInterventionType.INSERT_CALIBRATION_STEP;
      case TriggerType.BOREDOM:
        return LearningInterventionType.INCREASE_DIFFICULTY;
      case TriggerType.PREREQUISITE_GAP:
        return LearningInterventionType.BRANCH_TO_PREREQUISITE;
    }
  }

  private planFundamentallyInvalidated(
    trigger: Pick<IMetacognitionTriggerInput, 'severity' | 'conceptRefs'>,
    lessonPlan: ILessonPlan,
    steps: readonly IStep[]
  ): boolean {
    return (
      trigger.severity >= 0.99 &&
      lessonPlan.rigorLevel === 'full' &&
      trigger.conceptRefs.length > Math.max(3, steps.length)
    );
  }

  private buildInsertedSteps(input: {
    session: ISession;
    lessonPlan: ILessonPlan;
    failedStep: IStep;
    trigger: IMetacognitionTriggerInput;
    interventionType: LearningInterventionType;
    scope: ReplanScope;
  }): ICreateStepRecord[] {
    const count =
      input.trigger.type === TriggerType.PREREQUISITE_GAP || input.scope === ReplanScope.STRUCTURAL
        ? input.trigger.type === TriggerType.PREREQUISITE_GAP
          ? 2
          : 1
        : 1;

    return Array.from({ length: count }, (_unused, index) =>
      applyLoadoutToStep(this.createInsertedStep(input, input.failedStep.position + index + 1), {
        ...optionalStringField('id', input.session.config['loadoutId']),
        ...optionalStringField('archetype', input.session.config['loadoutArchetype']),
      })
    );
  }

  private createInsertedStep(
    input: {
      session: ISession;
      lessonPlan: ILessonPlan;
      failedStep: IStep;
      trigger: IMetacognitionTriggerInput;
      interventionType: LearningInterventionType;
    },
    position: number
  ): ICreateStepRecord {
    const stepId = newId(ID_PREFIXES.StepId) as StepId;
    const activityId = newId(ID_PREFIXES.ActivityId) as ActivityId;
    const selectedMode = this.modeForIntervention(input.interventionType, input.failedStep);
    const transformationType = this.transformationForIntervention(
      input.interventionType,
      input.failedStep
    );
    const concepts =
      input.trigger.conceptRefs.length > 0
        ? input.trigger.conceptRefs
        : input.failedStep.conceptRefs;
    const difficulty = this.difficultyForIntervention(input.interventionType, input.failedStep);
    const variantSeed = `strategy-${input.trigger.triggerId}-${String(position)}`;

    return {
      id: stepId,
      lessonPlanId: input.lessonPlan.id,
      sessionId: input.session.id,
      userId: input.session.userId,
      studyMode: input.session.studyMode,
      position,
      objective: this.objectiveForIntervention(input.interventionType, input.failedStep),
      servesGoalIds: input.failedStep.servesGoalIds,
      eligibleModes: Array.from(new Set([selectedMode, ...input.failedStep.eligibleModes])),
      selectedMode,
      transformationType,
      expectedOutcome: 'Learner can repair the triggered weakness before continuing.',
      evaluationType: 'self_explanation',
      difficulty,
      isRepair: true,
      conceptRefs: concepts,
      variantSeed,
      status: StepStatus.PLANNED,
      evaluationId: null,
      guardianValidationId: null,
      presentedAt: null,
      answeredAt: null,
      evaluatedAt: null,
      supersededByStepId: null,
      version: 1,
      queueStatus: 'injected',
      activities: [
        {
          id: activityId,
          stepId,
          position: 0,
          contentSourceType: ActivityContentSourceType.GENERATED,
          cardId: null,
          templateId: null,
          generatedVariantId: `strategy_${activityId}`,
          prompt: this.promptForIntervention(input.interventionType, input.failedStep),
          renderPayload: {},
          expectedResponseType: 'free_text',
          responseSchema: { type: 'string' },
          variantSeed,
          generationFallbackReason: 'strategy_replan',
        },
      ],
    };
  }

  private modeForIntervention(
    intervention: LearningInterventionType,
    failedStep: IStep
  ): EpistemicMode {
    if (intervention === LearningInterventionType.INSERT_CONTRASTIVE_STEP) {
      return MODE_GROUPS[EligibilityGroup.CONFUSION][0] ?? EpistemicMode.LOOPHOLE_LEARNING;
    }
    if (intervention === LearningInterventionType.INSERT_CALIBRATION_STEP) {
      return MODE_GROUPS[EligibilityGroup.META][0] ?? EpistemicMode.CONFIDENCE_WEIGHTED;
    }
    if (intervention === LearningInterventionType.TRANSITION_TO_TRANSFER) {
      return MODE_GROUPS[EligibilityGroup.TRANSFER][0] ?? EpistemicMode.CONCEPT_RECOMBINATION;
    }
    return failedStep.selectedMode === EpistemicMode.TEACHING_TO_LEARN
      ? EpistemicMode.LOOPHOLE_LEARNING
      : EpistemicMode.TEACHING_TO_LEARN;
  }

  private transformationForIntervention(
    intervention: LearningInterventionType,
    failedStep: IStep
  ): TransformationType {
    if (intervention === LearningInterventionType.INSERT_CONTRASTIVE_STEP) {
      return TransformationType.COMPARISON;
    }
    if (intervention === LearningInterventionType.BRANCH_TO_PREREQUISITE) {
      return TransformationType.EXPLANATION;
    }
    if (intervention === LearningInterventionType.INCREASE_DIFFICULTY) {
      return TransformationType.APPLICATION;
    }
    return failedStep.transformationType === TransformationType.EXPLANATION
      ? TransformationType.ERROR_DETECTION
      : TransformationType.EXPLANATION;
  }

  private difficultyForIntervention(
    intervention: LearningInterventionType,
    failedStep: IStep
  ): number {
    if (intervention === LearningInterventionType.REDUCE_DIFFICULTY) {
      return Math.max(0, failedStep.difficulty - 0.1);
    }
    if (intervention === LearningInterventionType.INCREASE_DIFFICULTY) {
      return Math.min(1, failedStep.difficulty + 0.1);
    }
    return Math.max(0, failedStep.difficulty - 0.05);
  }

  private objectiveForIntervention(
    intervention: LearningInterventionType,
    failedStep: IStep
  ): string {
    if (intervention === LearningInterventionType.BRANCH_TO_PREREQUISITE) {
      return `Repair prerequisite for: ${failedStep.objective}`;
    }
    if (intervention === LearningInterventionType.INSERT_CONTRASTIVE_STEP) {
      return `Contrast the confusing cases behind: ${failedStep.objective}`;
    }
    return `Repair the reasoning path for: ${failedStep.objective}`;
  }

  private promptForIntervention(intervention: LearningInterventionType, failedStep: IStep): string {
    if (intervention === LearningInterventionType.INSERT_CONTRASTIVE_STEP) {
      return `Compare two plausible interpretations of "${failedStep.objective}" and explain which distinction resolves the confusion.`;
    }
    if (intervention === LearningInterventionType.BRANCH_TO_PREREQUISITE) {
      return `Explain the prerequisite idea needed before retrying "${failedStep.objective}".`;
    }
    return `Re-explain "${failedStep.objective}" using a different representation than your last attempt.`;
  }

  private guardianPlan(
    lessonPlan: ILessonPlan,
    goals: ILessonPlanGoal[],
    steps: readonly (IStep | ICreateStepRecord)[]
  ): Record<string, unknown> {
    return {
      ...lessonPlan,
      goals,
      steps,
    };
  }

  private async enqueueStrategyEvents(
    payload: IStrategyReplanResult,
    ctx: IStrategyExecutionContext,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const metadata = { correlationId: ctx.correlationId, userId: ctx.userId };
    const events: IOutboxEventInput[] = [
      {
        id: newId(ID_PREFIXES.EventId) as EventId,
        eventType: 'strategy.replan.proposed',
        aggregateType: 'Replan',
        aggregateId: payload.lessonPlanId,
        payload,
        metadata,
      },
      {
        id: newId(ID_PREFIXES.EventId) as EventId,
        eventType: 'strategy.replan.committed',
        aggregateType: 'Replan',
        aggregateId: payload.lessonPlanId,
        payload,
        metadata,
      },
    ];

    await this.outboxRepository.enqueueBatch(events, tx);
  }
}

function optionalStringField<K extends string>(key: K, value: unknown): Partial<Record<K, string>> {
  return typeof value === 'string' && value.trim().length > 0
    ? ({ [key]: value } as Partial<Record<K, string>>)
    : {};
}
