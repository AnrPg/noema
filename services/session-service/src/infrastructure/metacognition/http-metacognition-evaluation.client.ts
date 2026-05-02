import type { IApiResponse } from '@noema/contracts';

import type {
  IMetacognitionEvaluationPort,
  IRecordStepEvaluationInput,
  IRecordStepEvaluationResult,
} from '../../domain/session-service/metacognition-evaluation.port.js';

interface IMetacognitionEvaluationResponse {
  evaluation: {
    id: string;
  };
}

export interface IHttpMetacognitionEvaluationClientConfig {
  baseUrl: string;
  serviceToken?: string;
}

export class HttpMetacognitionEvaluationClient implements IMetacognitionEvaluationPort {
  private readonly baseUrl: string;
  private readonly serviceToken: string | undefined;

  public constructor(config: IHttpMetacognitionEvaluationClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.serviceToken = config.serviceToken;
  }

  public async recordStepEvaluation(
    input: IRecordStepEvaluationInput
  ): Promise<IRecordStepEvaluationResult> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-user-id': input.userId,
    };
    if (this.serviceToken !== undefined && this.serviceToken.trim().length > 0) {
      headers['authorization'] = `Bearer ${this.serviceToken}`;
    }

    const response = await fetch(`${this.baseUrl}/v1/evaluations`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error(`Metacognition evaluation request failed with status ${response.status}`);
    }

    const body = (await response.json()) as IApiResponse<IMetacognitionEvaluationResponse>;
    return { evaluationId: body.data.evaluation.id as IRecordStepEvaluationResult['evaluationId'] };
  }
}
