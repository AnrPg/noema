import type {
  IGuardianExecutionContext,
  IGuardianValidationOutcome,
  IPedagogyGuardianPort,
} from '../../domain/session-service/pedagogy-guardian.port.js';

export interface IHttpPedagogyGuardianClientConfig {
  baseUrl: string;
  serviceToken?: string;
}

export class HttpPedagogyGuardianClient implements IPedagogyGuardianPort {
  private readonly baseUrl: string;
  private readonly serviceToken: string | undefined;

  public constructor(config: IHttpPedagogyGuardianClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.serviceToken = config.serviceToken;
  }

  public async validateLessonPlan(
    input: { lessonPlan: unknown; triggeredBy?: string },
    ctx: IGuardianExecutionContext
  ): Promise<IGuardianValidationOutcome> {
    return this.post('/v1/validate/lesson-plan', input, ctx);
  }

  public async validateStep(
    input: { step: unknown; triggeredBy?: string },
    ctx: IGuardianExecutionContext
  ): Promise<IGuardianValidationOutcome> {
    return this.post('/v1/validate/step', input, ctx);
  }

  public async validateReplan(
    input: {
      current: unknown;
      proposed: unknown;
      trigger: unknown;
      scope: string;
      triggeredBy?: string;
    },
    ctx: IGuardianExecutionContext
  ): Promise<IGuardianValidationOutcome> {
    return this.post('/v1/validate/replan', input, ctx);
  }

  private async post(
    path: string,
    input: unknown,
    ctx: IGuardianExecutionContext
  ): Promise<IGuardianValidationOutcome> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-user-id': ctx.userId,
      'x-correlation-id': ctx.correlationId,
    };
    if (this.serviceToken !== undefined && this.serviceToken.trim().length > 0) {
      headers['authorization'] = `Bearer ${this.serviceToken}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    const body = (await response.json()) as { data?: IGuardianValidationOutcome };
    if (!response.ok && body.data === undefined) {
      throw new Error(`Pedagogy Guardian request failed with status ${String(response.status)}`);
    }
    if (body.data === undefined) {
      throw new Error('Pedagogy Guardian response did not include validation data');
    }
    return body.data;
  }
}
