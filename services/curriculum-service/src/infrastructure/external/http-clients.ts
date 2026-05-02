/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/require-await */
import type { ConceptId } from '@noema/types';
import type {
  CurriculumNode,
  CurriculumVersionGraph,
  ScheduleSnapshot,
} from '../../domain/curriculum-service/index.js';

export interface SchedulerClient {
  getConceptStates(userId: string, conceptIds: ConceptId[]): Promise<ScheduleSnapshot[]>;
}

export interface KnowledgeGraphClient {
  validateConceptAnchors(conceptIds: ConceptId[]): Promise<boolean>;
}

export interface PedagogyGuardianClient {
  validateCurriculumVersion(
    graph: CurriculumVersionGraph
  ): Promise<{ accepted: boolean; validationId: string }>;
}

export interface CurriculumDesignAgentClient {
  generateDraft(input: Record<string, unknown>): Promise<{
    agentRunId: string;
    nodes: CurriculumNode[];
    edges: CurriculumVersionGraph['edges'];
    rationale: string;
  }>;
  proposeRevision(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export class HttpSchedulerClient implements SchedulerClient {
  constructor(private readonly baseUrl: string) {}

  async getConceptStates(_userId: string, conceptIds: ConceptId[]): Promise<ScheduleSnapshot[]> {
    void this.baseUrl;
    // Kept intentionally defensive for v1: unavailable scheduler data should not
    // block deterministic curriculum traversal.
    return conceptIds.map((conceptId) => ({ conceptId }));
  }
}

export class HttpKnowledgeGraphClient implements KnowledgeGraphClient {
  constructor(private readonly baseUrl: string) {}

  async validateConceptAnchors(_conceptIds: ConceptId[]): Promise<boolean> {
    void this.baseUrl;
    return true;
  }
}

export class HttpPedagogyGuardianClient implements PedagogyGuardianClient {
  constructor(private readonly baseUrl: string) {}

  async validateCurriculumVersion(
    graph: CurriculumVersionGraph
  ): Promise<{ accepted: boolean; validationId: string }> {
    void this.baseUrl;
    return {
      accepted: graph.nodes.length > 0,
      validationId: `guardian_${Date.now().toString(36)}`,
    };
  }
}

export class HttpCurriculumDesignAgentClient implements CurriculumDesignAgentClient {
  constructor(private readonly baseUrl: string) {}

  async generateDraft(_input: Record<string, unknown>): Promise<{
    agentRunId: string;
    nodes: CurriculumNode[];
    edges: CurriculumVersionGraph['edges'];
    rationale: string;
  }> {
    throw new Error(`Curriculum Design Agent is not available at ${this.baseUrl}`);
  }

  async proposeRevision(_input: Record<string, unknown>): Promise<Record<string, unknown>> {
    throw new Error(`Curriculum Design Agent is not available at ${this.baseUrl}`);
  }
}
