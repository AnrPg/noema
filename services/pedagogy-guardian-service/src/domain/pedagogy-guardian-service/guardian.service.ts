import { PedagogyEventType } from '@noema/events';
import {
  GoalType,
  ReplanScope,
  RigorLevel,
  StepStatus,
  type CorrelationId,
  type GoalId,
  type UserId,
} from '@noema/types';
import { createHash } from 'node:crypto';
import type { Logger } from 'pino';

import type { IEventPublisher } from '@noema/events/publisher';
import { GuardianValidationError } from './errors.js';
import {
  GuardianArtifactType,
  GuardianResult,
  type IConceptStateLookup,
  type IGeneratedActivityVariant,
  type IGuardianLessonPlan,
  type IGuardianRepository,
  type IGuardianStep,
  type IGuardianValidationOutcome,
  type IValidateActivityInput,
  type IValidateReplanInput,
  type IValidateStepInput,
} from './guardian.types.js';
import {
  ValidateActivityInputSchema,
  ValidateGeneratedVariantInputSchema,
  ValidateLessonPlanInputSchema,
  ValidateReplanInputSchema,
  ValidateStepInputSchema,
} from './guardian.schemas.js';

export interface IGuardianExecutionContext {
  userId?: UserId;
  correlationId: CorrelationId;
}

const evaluationTypeByGoal: Record<GoalType, readonly string[]> = {
  [GoalType.DISCRIMINATION]: ['comparison', 'contrast', 'classification', 'self_explanation'],
  [GoalType.REASONING]: ['self_explanation', 'proof', 'causal_explanation', 'free_text'],
  [GoalType.TRANSFER]: ['application', 'case_analysis', 'transfer', 'free_text'],
  [GoalType.ACQUISITION]: ['recall', 'definition', 'self_explanation', 'free_text'],
  [GoalType.REINFORCEMENT]: ['recall', 'retrieval', 'self_explanation', 'free_text'],
};

const contradictoryGoalPairs = new Set([
  keyPair(GoalType.REASONING, GoalType.ACQUISITION),
  keyPair(GoalType.ACQUISITION, GoalType.TRANSFER),
  keyPair(GoalType.REINFORCEMENT, GoalType.TRANSFER),
]);

const minimalScopeByTrigger: Record<string, ReplanScope> = {
  failure: ReplanScope.LOCAL,
  confusion: ReplanScope.LOCAL,
  slow_thinking: ReplanScope.LOCAL,
  overconfidence: ReplanScope.LOCAL,
  boredom: ReplanScope.LOCAL,
  prerequisite_gap: ReplanScope.STRUCTURAL,
  plan_fundamentally_invalidated: ReplanScope.FULL,
};

export class PedagogyGuardianService {
  private readonly logger: Logger;

  constructor(
    private readonly repository: IGuardianRepository,
    private readonly eventPublisher: IEventPublisher,
    logger: Logger,
    private readonly conceptStateLookup?: IConceptStateLookup
  ) {
    this.logger = logger.child({ component: 'PedagogyGuardianService' });
  }

  async validateLessonPlan(
    input: unknown,
    context: IGuardianExecutionContext
  ): Promise<IGuardianValidationOutcome> {
    const parsed = ValidateLessonPlanInputSchema.safeParse(input);
    if (!parsed.success)
      throw new GuardianValidationError('Invalid LessonPlan payload', parsed.error.flatten());
    const { triggeredBy } = parsed.data;
    const lessonPlan = parsed.data.lessonPlan as IGuardianLessonPlan;
    const reasonCodes = await this.evaluateLessonPlan(lessonPlan);
    return this.persistOutcome({
      artifactType: GuardianArtifactType.LESSON_PLAN,
      artifactId: lessonPlan.id,
      artifact: lessonPlan,
      reasonCodes,
      triggeredBy,
      context,
    });
  }

  async validateStep(
    input: unknown,
    context: IGuardianExecutionContext
  ): Promise<IGuardianValidationOutcome> {
    const parsed = ValidateStepInputSchema.safeParse(input);
    if (!parsed.success)
      throw new GuardianValidationError('Invalid Step payload', parsed.error.flatten());
    const { step, previousFailedStep, triggeredBy } = parsed.data;
    const stepInput: IValidateStepInput =
      previousFailedStep === undefined
        ? { step: step as IGuardianStep }
        : { step: step as IGuardianStep, previousFailedStep: previousFailedStep as IGuardianStep };
    const reasonCodes = this.evaluateStep(stepInput);
    return this.persistOutcome({
      artifactType: GuardianArtifactType.STEP,
      artifactId: step.id,
      artifact: step,
      reasonCodes,
      triggeredBy,
      context,
    });
  }

  async validateActivity(
    input: unknown,
    context: IGuardianExecutionContext
  ): Promise<IGuardianValidationOutcome> {
    const parsed = ValidateActivityInputSchema.safeParse(input);
    if (!parsed.success)
      throw new GuardianValidationError('Invalid Activity payload', parsed.error.flatten());
    const { activity, step, triggeredBy } = parsed.data;
    const validatedActivity = activity as IValidateActivityInput['activity'];
    const activityInput: IValidateActivityInput =
      step === undefined
        ? { activity: validatedActivity }
        : { activity: validatedActivity, step: step as IGuardianStep };
    const reasonCodes = this.evaluateActivity(activityInput);
    return this.persistOutcome({
      artifactType: GuardianArtifactType.ACTIVITY,
      artifactId: activity.id,
      artifact: activity,
      reasonCodes,
      triggeredBy,
      context,
    });
  }

  async validateReplan(
    input: unknown,
    context: IGuardianExecutionContext
  ): Promise<IGuardianValidationOutcome> {
    const parsed = ValidateReplanInputSchema.safeParse(input);
    if (!parsed.success)
      throw new GuardianValidationError('Invalid Replan payload', parsed.error.flatten());
    const { current, proposed, trigger, scope, triggeredBy } = parsed.data;
    const replanInput: IValidateReplanInput = {
      current: current as IGuardianLessonPlan,
      proposed: proposed as IGuardianLessonPlan,
      trigger: {
        type: trigger.type,
        ...(trigger.severity !== undefined ? { severity: trigger.severity } : {}),
        ...(trigger.recommendedIntervention !== undefined
          ? { recommendedIntervention: trigger.recommendedIntervention }
          : {}),
      },
      scope,
    };
    const reasonCodes = await this.evaluateReplan(replanInput);
    return this.persistOutcome({
      artifactType: GuardianArtifactType.REPLAN,
      artifactId: proposed.id,
      artifact: { current, proposed, trigger, scope },
      reasonCodes,
      triggeredBy,
      context,
    });
  }

  async validateGeneratedVariant(
    input: unknown,
    context: IGuardianExecutionContext
  ): Promise<IGuardianValidationOutcome> {
    const parsed = ValidateGeneratedVariantInputSchema.safeParse(input);
    if (!parsed.success)
      throw new GuardianValidationError(
        'Invalid generated variant payload',
        parsed.error.flatten()
      );
    const { variant, triggeredBy } = parsed.data;
    const reasonCodes = this.evaluateGeneratedVariant(variant as IGeneratedActivityVariant);
    return this.persistOutcome({
      artifactType: GuardianArtifactType.GENERATED_VARIANT,
      artifactId: variant.id,
      artifact: variant,
      reasonCodes,
      triggeredBy,
      context,
    });
  }

  private async evaluateLessonPlan(plan: IGuardianLessonPlan): Promise<string[]> {
    const reasonCodes: string[] = [];
    const activeGoals = plan.goals.filter((goal) => goal.state !== 'completed');
    if (activeGoals.length > 4) reasonCodes.push('GOAL_CAP_EXCEEDED');

    const stepIds = new Set(plan.steps.map((step) => step.id));
    if (stepIds.size !== plan.steps.length) reasonCodes.push('DUPLICATE_STEP_IDS');

    if (plan.rigorLevel === RigorLevel.FULL) {
      for (const pair of pairs(activeGoals.map((goal) => goal.type))) {
        if (contradictoryGoalPairs.has(keyPair(pair[0], pair[1]))) {
          reasonCodes.push('CONTRADICTORY_GOALS');
          break;
        }
      }
    }

    for (const step of plan.steps) {
      if (step.lessonPlanId !== plan.id) reasonCodes.push('ORPHAN_STEP');
      if (plan.rigorLevel === RigorLevel.FULL) {
        if (step.servesGoalIds.length === 0) reasonCodes.push('STEP_WITHOUT_GOAL');
        if (!this.stepEvaluationMeasuresGoal(step, activeGoals)) {
          reasonCodes.push('EVALUATION_DOES_NOT_MEASURE_GOAL');
        }
      }
      reasonCodes.push(...this.evaluateStep({ step }));
    }

    if (plan.rigorLevel === RigorLevel.FULL && this.conceptStateLookup !== undefined) {
      for (const prerequisite of plan.prerequisites) {
        const stable = await this.conceptStateLookup.isConceptStable({
          userId: plan.userId,
          conceptId: prerequisite,
          studyMode: plan.studyMode,
        });
        const repaired = plan.steps.some(
          (step) => step.isRepair && step.conceptRefs.includes(prerequisite)
        );
        if (!stable && !repaired) reasonCodes.push('UNSTABLE_PREREQUISITE_WITHOUT_REPAIR_BRANCH');
      }
    }

    return unique(reasonCodes);
  }

  private evaluateStep(input: IValidateStepInput): string[] {
    const { step, previousFailedStep } = input;
    const reasonCodes: string[] = [];
    if (step.objective.trim().length === 0) reasonCodes.push('STEP_OBJECTIVE_EMPTY');
    if (step.evaluationType.trim().length === 0) reasonCodes.push('STEP_EVALUATION_TYPE_MISSING');
    if (!step.eligibleModes.includes(step.selectedMode))
      reasonCodes.push('SELECTED_MODE_NOT_ELIGIBLE');
    if (step.conceptRefs.length === 0) reasonCodes.push('STEP_CONCEPT_REFS_EMPTY');
    if (step.activities.length === 0) reasonCodes.push('STEP_HAS_NO_ACTIVITIES');

    for (const activity of step.activities) {
      reasonCodes.push(...this.evaluateActivity({ activity, step }));
      if (
        activity.contentSourceType === 'card' &&
        activity.compatibleTransformations !== undefined &&
        !activity.compatibleTransformations.includes(step.transformationType)
      ) {
        reasonCodes.push('CARD_TRANSFORMATION_INCOMPATIBLE');
      }
    }

    if (step.isRepair && previousFailedStep !== undefined) {
      const activityChanged =
        JSON.stringify(step.activities.map((activity) => activity.id)) !==
        JSON.stringify(previousFailedStep.activities.map((activity) => activity.id));
      const conceptChanged = hasDifferentMember(step.conceptRefs, previousFailedStep.conceptRefs);
      const differs =
        step.selectedMode !== previousFailedStep.selectedMode ||
        step.transformationType !== previousFailedStep.transformationType ||
        activityChanged ||
        step.difficulty !== previousFailedStep.difficulty ||
        conceptChanged;
      if (!differs) reasonCodes.push('REPAIR_STEP_NOT_TRANSFORMED');
    }

    return unique(reasonCodes);
  }

  private evaluateActivity(input: IValidateActivityInput): string[] {
    const { activity } = input;
    const reasonCodes: string[] = [];
    if (activity.contentSourceType === 'card' && (activity.cardId ?? '').trim().length === 0)
      reasonCodes.push('CARD_SOURCE_ID_MISSING');
    if (
      activity.contentSourceType === 'template' &&
      (activity.templateId ?? '').trim().length === 0
    )
      reasonCodes.push('TEMPLATE_SOURCE_ID_MISSING');
    if (
      activity.contentSourceType === 'generated' &&
      (activity.generatedVariantId ?? '').trim().length === 0
    )
      reasonCodes.push('GENERATED_VARIANT_ID_MISSING');
    if (!isJsonSchemaFragment(activity.responseSchema)) reasonCodes.push('INVALID_RESPONSE_SCHEMA');
    return reasonCodes;
  }

  private async evaluateReplan(input: IValidateReplanInput): Promise<string[]> {
    const reasonCodes: string[] = [];
    const expectedScope = minimalScopeByTrigger[input.trigger.type] ?? ReplanScope.LOCAL;
    if (scopeRank(input.scope) > scopeRank(expectedScope))
      reasonCodes.push('REPLAN_SCOPE_ESCALATED');

    const currentSteps = new Map(input.current.steps.map((step) => [step.id, step]));
    for (const proposedStep of input.proposed.steps) {
      const current = currentSteps.get(proposedStep.id);
      if (
        current?.status === StepStatus.EVALUATED &&
        stableStringify(current) !== stableStringify(proposedStep)
      ) {
        reasonCodes.push('EVALUATED_STEP_MUTATED');
      }
    }

    reasonCodes.push(...(await this.evaluateLessonPlan(input.proposed)));
    return unique(reasonCodes);
  }

  private evaluateGeneratedVariant(variant: IGeneratedActivityVariant): string[] {
    const reasonCodes: string[] = [];
    const prompt = variant.prompt.toLowerCase();
    if (containsUnsafeContent(prompt)) reasonCodes.push('CONTENT_SAFETY_BLOCKED');
    if (prompt.includes('answer:') || prompt.includes('correct answer')) {
      reasonCodes.push('PROMPT_LEAKS_ANSWER');
    }
    if (!isJsonSchemaFragment(variant.responseSchema)) reasonCodes.push('INVALID_RESPONSE_SCHEMA');
    if (!schemaMatchesExpectedResponseType(variant.expectedResponseType, variant.responseSchema)) {
      reasonCodes.push('RESPONSE_SCHEMA_MISMATCH');
    }
    return unique(reasonCodes);
  }

  private stepEvaluationMeasuresGoal(
    step: IGuardianStep,
    goals: readonly { id: GoalId; type: GoalType }[]
  ): boolean {
    const servedGoals = goals.filter((goal) => step.servesGoalIds.includes(goal.id));
    if (servedGoals.length === 0) return false;
    const evaluationType = step.evaluationType.toLowerCase();
    return servedGoals.some((goal) =>
      evaluationTypeByGoal[goal.type].some((allowed) => evaluationType.includes(allowed))
    );
  }

  private async persistOutcome(input: {
    artifactType: GuardianArtifactType;
    artifactId: string;
    artifact: unknown;
    reasonCodes: string[];
    triggeredBy: string;
    context: IGuardianExecutionContext;
  }): Promise<IGuardianValidationOutcome> {
    const result =
      input.reasonCodes.length === 0
        ? GuardianResult.ACCEPTED
        : input.reasonCodes.some((code) => code.endsWith('_WARNING'))
          ? GuardianResult.WARNING
          : GuardianResult.REJECTED;
    const blocking = result === GuardianResult.REJECTED;
    const validation = await this.repository.createValidation({
      artifactType: input.artifactType,
      artifactId: input.artifactId,
      artifactHash: sha256(input.artifact),
      result,
      reasonCodes: input.reasonCodes,
      blocking,
      evaluatedRules: {
        deterministic: true,
        ruleVersion: '2026-05-02',
        reasonCodes: input.reasonCodes,
      },
      triggeredBy: input.triggeredBy,
    });

    if (blocking) {
      await this.eventPublisher.publish({
        eventType: PedagogyEventType.PEDAGOGY_VALIDATION_REJECTED,
        aggregateType: 'GuardianValidation',
        aggregateId: validation.id,
        payload: {
          validationId: validation.id,
          targetType: input.artifactType,
          targetId: input.artifactId,
          reasonCodes: input.reasonCodes,
        },
        metadata: {
          correlationId: input.context.correlationId,
          userId: input.context.userId ?? null,
        },
      });
      this.logger.warn(
        {
          validationId: validation.id,
          artifactType: input.artifactType,
          reasonCodes: input.reasonCodes,
        },
        'Pedagogy Guardian rejected artifact'
      );
    }

    return {
      result,
      reasonCodes: input.reasonCodes,
      blocking,
      validationId: validation.id,
    };
  }
}

function keyPair(a: GoalType, b: GoalType): string {
  return [a, b].sort().join(':');
}

function pairs<T>(items: readonly T[]): [T, T][] {
  const result: [T, T][] = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const first = items[i];
      const second = items[j];
      if (first !== undefined && second !== undefined) result.push([first, second]);
    }
  }
  return result;
}

function unique(items: readonly string[]): string[] {
  return [...new Set(items)];
}

function hasDifferentMember(a: readonly string[], b: readonly string[]): boolean {
  const bSet = new Set(b);
  return a.some((item) => !bSet.has(item));
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, current: unknown) => {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) return current;
    return Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
  });
}

function scopeRank(scope: ReplanScope): number {
  if (scope === ReplanScope.LOCAL) return 0;
  if (scope === ReplanScope.STRUCTURAL) return 1;
  return 2;
}

function isJsonSchemaFragment(schema: unknown): boolean {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) return false;
  const record = schema as Record<string, unknown>;
  if (typeof record['type'] === 'string') return true;
  if (
    Array.isArray(record['oneOf']) ||
    Array.isArray(record['anyOf']) ||
    Array.isArray(record['allOf'])
  ) {
    return true;
  }
  if (typeof record['properties'] === 'object' && record['properties'] !== null) return true;
  return Object.keys(record).length === 0;
}

function containsUnsafeContent(text: string): boolean {
  return ['self-harm', 'hate speech', 'sexual content involving minors'].some((term) =>
    text.includes(term)
  );
}

function schemaMatchesExpectedResponseType(expected: string, schema: unknown): boolean {
  if (schema === null || typeof schema !== 'object') return false;
  const type = (schema as Record<string, unknown>)['type'];
  if (expected.includes('text') || expected.includes('explanation'))
    return type === 'string' || type === undefined;
  if (expected.includes('number')) return type === 'number' || type === 'integer';
  if (expected.includes('choice'))
    return Array.isArray((schema as Record<string, unknown>)['enum']);
  return true;
}
