import type { ConceptId } from '@noema/types';
import {
  EpistemicMode,
  GoalType,
  LearningMode,
  RigorLevel,
  StepStatus,
  StudyMode,
  TransformationType,
} from '@noema/types';

import type {
  ICurriculumDesignAgentClient,
  IKnowledgeGraphClient,
  IPedagogyGuardianClient,
  ISchedulerClient,
} from '../../domain/curriculum-service/external-ports.js';
import type {
  CurriculumNode,
  CurriculumVersionGraph,
  ScheduleSnapshot,
} from '../../domain/curriculum-service/index.js';

export interface IHttpClientConfig {
  baseUrl: string;
  serviceToken: string | undefined;
}

export class HttpSchedulerClient implements ISchedulerClient {
  private readonly baseUrl: string;
  private readonly serviceToken: string | undefined;

  constructor(config: IHttpClientConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.serviceToken = config.serviceToken;
  }

  async getConceptStates(userId: string, conceptIds: ConceptId[]): Promise<ScheduleSnapshot[]> {
    const uniqueConceptIds = Array.from(new Set(conceptIds));
    const snapshots = await Promise.all(
      uniqueConceptIds.map(async (conceptId) => {
        const response = await fetch(
          `${this.baseUrl}/v1/concepts/${encodeURIComponent(conceptId)}/schedule`,
          { headers: this.headers(userId) }
        );
        if (response.status === 404) return { conceptId };
        const body = await readJson<{ data?: IConceptScheduleResponse | null }>(response);
        if (!response.ok) {
          throw new Error(
            body.error?.message ?? `Scheduler request failed: ${String(response.status)}`
          );
        }
        const state = body.data ?? null;
        if (state === null) return { conceptId };
        return {
          conceptId,
          ...(typeof state.dueAt === 'string' ? { dueAt: new Date(state.dueAt) } : {}),
          ...(typeof state.stability === 'number' ? { stability: state.stability } : {}),
        };
      })
    );
    return snapshots;
  }

  private headers(userId: string): Record<string, string> {
    return buildHeaders(this.serviceToken, { 'x-user-id': userId });
  }
}

export class HttpKnowledgeGraphClient implements IKnowledgeGraphClient {
  private readonly baseUrl: string;
  private readonly serviceToken: string | undefined;

  constructor(config: IHttpClientConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.serviceToken = config.serviceToken;
  }

  async validateConceptAnchors(conceptIds: ConceptId[]): Promise<boolean> {
    const uniqueConceptIds = Array.from(new Set(conceptIds));
    const checks = await Promise.all(
      uniqueConceptIds.map(async (conceptId) => {
        const response = await fetch(
          `${this.baseUrl}/api/v1/ckg/nodes/${encodeURIComponent(conceptId)}`,
          { headers: buildHeaders(this.serviceToken) }
        );
        return response.ok;
      })
    );
    return checks.every(Boolean);
  }
}

export class HttpPedagogyGuardianClient implements IPedagogyGuardianClient {
  private readonly baseUrl: string;
  private readonly serviceToken: string | undefined;

  constructor(config: IHttpClientConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.serviceToken = config.serviceToken;
  }

  async validateCurriculumVersion(
    graph: CurriculumVersionGraph
  ): Promise<{ accepted: boolean; validationId: string }> {
    const response = await fetchJson<{ data?: IGuardianOutcome }>(
      `${this.baseUrl}/v1/validate/lesson-plan`,
      {
        method: 'POST',
        headers: buildHeaders(this.serviceToken),
        body: JSON.stringify({
          lessonPlan: toGuardianLessonPlan(graph),
          triggeredBy: 'curriculum-service.generateCurriculum',
        }),
      }
    );
    const outcome = response.data;
    return {
      accepted: outcome?.blocking !== true,
      validationId: outcome?.validationId ?? `guardian_${graph.id}`,
    };
  }
}

function toGuardianLessonPlan(graph: CurriculumVersionGraph): Record<string, unknown> {
  const goals = graph.nodes.map((node, index) => ({
    id: `goal_${node.id}`,
    type: GoalType.ACQUISITION,
    state: 'active',
    conceptRefs: [node.ckgConceptId ?? node.stableNodeKey],
    position: index,
  }));

  const steps = graph.nodes.map((node, index) => {
    const stepId = `step_${node.id}`;
    const conceptRefs = [node.ckgConceptId ?? node.stableNodeKey];
    return {
      id: stepId,
      lessonPlanId: graph.id,
      sessionId: `curriculum_${graph.id}`,
      userId: 'curriculum-service',
      studyMode: StudyMode.KNOWLEDGE_GAINING,
      position: index,
      objective: node.learningObjective,
      servesGoalIds: [goals[index]?.id],
      eligibleModes: [EpistemicMode.GENERATIVE_RETRIEVAL],
      selectedMode: EpistemicMode.GENERATIVE_RETRIEVAL,
      transformationType: TransformationType.EXPLANATION,
      expectedOutcome: node.learningObjective,
      evaluationType: 'self_explanation',
      difficulty: 0.5,
      isRepair: false,
      conceptRefs,
      status: StepStatus.PLANNED,
      activities: [
        {
          id: `activity_${node.id}`,
          stepId,
          contentSourceType: 'generated',
          generatedVariantId: `curriculum_variant_${node.id}`,
          prompt: node.learningObjective,
          expectedResponseType: 'free_text',
          responseSchema: { type: 'string' },
        },
      ],
    };
  });

  return {
    id: graph.id,
    sessionId: `curriculum_${graph.id}`,
    userId: 'curriculum-service',
    studyMode: StudyMode.KNOWLEDGE_GAINING,
    learningMode: LearningMode.GOAL_DRIVEN,
    rigorLevel: RigorLevel.MINIMAL,
    topic: `Curriculum ${graph.id}`,
    prerequisites: [],
    goals,
    steps,
  };
}

export class HttpCurriculumDesignAgentClient implements ICurriculumDesignAgentClient {
  private readonly baseUrl: string;
  private readonly serviceToken: string | undefined;

  constructor(config: IHttpClientConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.serviceToken = config.serviceToken;
  }

  async generateDraft(input: Record<string, unknown>): Promise<{
    agentRunId: string;
    nodes: CurriculumNode[];
    edges: CurriculumVersionGraph['edges'];
    rationale: string;
  }> {
    const response = await fetchJson<{
      data?: {
        agentRunId: string;
        nodes: CurriculumNode[];
        edges: CurriculumVersionGraph['edges'];
        rationale: string;
      };
    }>(`${this.baseUrl}/v1/curriculum/generate-draft`, {
      method: 'POST',
      headers: buildHeaders(this.serviceToken),
      body: JSON.stringify(input),
    });
    if (response.data === undefined) {
      throw new Error('Curriculum Design Agent returned no draft data.');
    }
    return response.data;
  }

  async proposeRevision(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await fetchJson<{ data?: Record<string, unknown> }>(
      `${this.baseUrl}/v1/curriculum/propose-revision`,
      {
        method: 'POST',
        headers: buildHeaders(this.serviceToken),
        body: JSON.stringify(input),
      }
    );
    return response.data ?? {};
  }
}

interface IConceptScheduleResponse {
  dueAt?: string | null;
  stability?: number | null;
}

interface IGuardianOutcome {
  blocking?: boolean;
  validationId?: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function buildHeaders(
  serviceToken: string | undefined,
  extra?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(extra ?? {}),
  };
  if (serviceToken !== undefined && serviceToken.trim().length > 0) {
    headers['authorization'] = `Bearer ${serviceToken}`;
  }
  return headers;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await readJson<T>(response);
  if (!response.ok) {
    throw new Error(body.error?.message ?? `HTTP request failed: ${String(response.status)}`);
  }
  return body;
}

async function readJson<T>(response: Response): Promise<{ error?: { message?: string } } & T> {
  return (await response.json().catch(() => ({}))) as { error?: { message?: string } } & T;
}
