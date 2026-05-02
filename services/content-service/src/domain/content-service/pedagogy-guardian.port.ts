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
  validateGeneratedVariant(
    input: { variant: unknown; triggeredBy?: string },
    ctx: IGuardianExecutionContext
  ): Promise<IGuardianValidationOutcome>;
}

export class NoopPedagogyGuardianClient implements IPedagogyGuardianPort {
  validateGeneratedVariant(): Promise<IGuardianValidationOutcome> {
    return Promise.resolve({
      result: 'accepted',
      reasonCodes: [],
      blocking: false,
      validationId: 'guardian_not_configured',
    });
  }
}
