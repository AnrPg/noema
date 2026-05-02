import type { CorrelationId, UserId } from '@noema/types';

export type GuardianValidationResult = 'accepted' | 'warning' | 'rejected';

export interface IGuardianValidationOutcome {
  result: GuardianValidationResult;
  reasonCodes: string[];
  blocking: boolean;
  validationId: string;
}

export interface IGuardianExecutionContext {
  userId: UserId;
  correlationId: CorrelationId;
}

export interface IPedagogyGuardianPort {
  validateLessonPlan(
    input: { lessonPlan: unknown; triggeredBy?: string },
    ctx: IGuardianExecutionContext
  ): Promise<IGuardianValidationOutcome>;

  validateStep(
    input: { step: unknown; triggeredBy?: string },
    ctx: IGuardianExecutionContext
  ): Promise<IGuardianValidationOutcome>;

  validateReplan(
    input: {
      current: unknown;
      proposed: unknown;
      trigger: unknown;
      scope: string;
      triggeredBy?: string;
    },
    ctx: IGuardianExecutionContext
  ): Promise<IGuardianValidationOutcome>;
}

export class NoopPedagogyGuardianClient implements IPedagogyGuardianPort {
  validateLessonPlan(): Promise<IGuardianValidationOutcome> {
    return Promise.resolve({
      result: 'accepted',
      reasonCodes: [],
      blocking: false,
      validationId: 'guardian_not_configured',
    });
  }

  validateStep(): Promise<IGuardianValidationOutcome> {
    return Promise.resolve({
      result: 'accepted',
      reasonCodes: [],
      blocking: false,
      validationId: 'guardian_not_configured',
    });
  }

  validateReplan(): Promise<IGuardianValidationOutcome> {
    return Promise.resolve({
      result: 'accepted',
      reasonCodes: [],
      blocking: false,
      validationId: 'guardian_not_configured',
    });
  }
}
