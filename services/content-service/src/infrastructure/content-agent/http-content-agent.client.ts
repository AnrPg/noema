import type {
  IContentAgentContext,
  IContentAgentPort,
  IGeneratedCardDraft,
  IGeneratedTransformDraft,
} from '../../domain/content-service/content-agent.port.js';
import type { IContentGenerationJob } from '../../types/content.types.js';

export interface IHttpContentAgentClientConfig {
  baseUrl: string;
  serviceToken?: string;
}

export class HttpContentAgentClient implements IContentAgentPort {
  private readonly baseUrl: string;
  private readonly serviceToken: string | undefined;

  constructor(config: IHttpContentAgentClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.serviceToken = config.serviceToken;
  }

  async generateContent(
    job: IContentGenerationJob,
    context: IContentAgentContext
  ): Promise<{ agentRunId: string; drafts: IGeneratedCardDraft[]; rejectedDrafts: unknown[] }> {
    const response = await fetch(`${this.baseUrl}/v1/content/generate`, {
      method: 'POST',
      headers: this.headers(context),
      body: JSON.stringify({ job }),
    });
    return readAgentResponse(response);
  }

  async transformCard(
    input: Parameters<IContentAgentPort['transformCard']>[0],
    context: IContentAgentContext
  ): Promise<{ agentRunId: string; draft: IGeneratedTransformDraft }> {
    const response = await fetch(`${this.baseUrl}/v1/content/transform`, {
      method: 'POST',
      headers: this.headers(context),
      body: JSON.stringify(input),
    });
    return readAgentResponse(response);
  }

  private headers(context: IContentAgentContext): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-user-id': context.userId,
      'x-correlation-id': context.correlationId,
    };
    if (this.serviceToken !== undefined && this.serviceToken.trim().length > 0) {
      headers['authorization'] = `Bearer ${this.serviceToken}`;
    }
    return headers;
  }
}

async function readAgentResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as { data?: T; error?: { message?: string } } & T;
  if (!response.ok) {
    throw new Error(body.error?.message ?? `Content agent request failed: ${String(response.status)}`);
  }
  return body.data ?? body;
}
