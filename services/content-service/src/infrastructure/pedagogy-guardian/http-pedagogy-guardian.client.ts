import type { IApiResponse } from '@noema/contracts';

import type {
  IGuardianExecutionContext,
  IGuardianValidationOutcome,
  IPedagogyGuardianPort,
} from '../../domain/content-service/pedagogy-guardian.port.js';

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

  public async validateGeneratedVariant(
    input: { variant: unknown; triggeredBy?: string },
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

    const response = await fetch(`${this.baseUrl}/v1/validate/generated-variant`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        variant: toGuardianGeneratedVariant(input.variant),
        triggeredBy: input.triggeredBy ?? 'content-service',
      }),
    });
    const body = (await response.json()) as IApiResponse<IGuardianValidationOutcome>;
    if (!response.ok && !('data' in body)) {
      throw new Error(`Pedagogy Guardian request failed with status ${String(response.status)}`);
    }
    return body.data;
  }
}

function toGuardianGeneratedVariant(variant: unknown): Record<string, unknown> {
  const draft = variant as {
    id?: string;
    conceptId?: string;
    conceptIds?: string[];
    transformationType?: string;
    transformationKind?: string;
    content?: { front?: unknown; back?: unknown };
  };
  const conceptId = draft.conceptId ?? draft.conceptIds?.[0] ?? 'concept_unknown';
  return {
    id: draft.id ?? `generated_${conceptId}`,
    conceptId,
    transformationType: draft.transformationType ?? draft.transformationKind ?? 'recall',
    epistemicMode: 'generative_retrieval',
    difficultyBucket: 2,
    prompt: textOrDefault(draft.content?.front, 'Practice this concept.'),
    expectedResponseType: 'short_text',
    responseSchema: { type: 'string' },
    renderPayload: variant,
  };
}

function textOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}
