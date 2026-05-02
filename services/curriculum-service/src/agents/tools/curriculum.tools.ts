import type { CurriculumId, RevisionProposalId, UserId } from '@noema/types';
import type { CurriculumService } from '../../domain/curriculum-service/curriculum.service.js';
import type { IToolDefinition, IToolResult, ToolHandler } from './tool.types.js';

const curriculumIdSchema = {
  type: 'object',
  required: ['curriculumId'],
  properties: {
    curriculumId: { type: 'string' },
  },
};

export const CURRICULUM_TOOL_DEFINITIONS: IToolDefinition[] = [
  ['get-curriculum-by-id', 'Read a curriculum vault record and active version summary.', false],
  ['get-active-version', 'Read the active durable curriculum DAG version.', false],
  ['get-frontier', 'Read the deterministic curriculum frontier.', false],
  ['get-progress', 'Read stable-node-key progress for a curriculum.', false],
  ['list-revision-proposals', 'List pending and historical revision proposals.', false],
  ['get-realignment-evidence', 'Read accumulated durable realignment evidence.', false],
  ['propose-curriculum-draft', 'Request an agent-authored curriculum draft proposal.', true],
  ['propose-revision', 'Record realignment evidence that may enqueue a revision proposal.', true],
].map(([name, description, sideEffects]) => ({
  name: name as string,
  version: '1.0.0',
  description: description as string,
  service: 'curriculum-service',
  priority: sideEffects === true ? 'P1' : 'P0',
  scopeRequirement: {
    match: 'all',
    requiredScopes: [sideEffects === true ? 'curriculum:agent' : 'curriculum:read'],
  },
  capabilities: {
    idempotent: sideEffects !== true,
    sideEffects: sideEffects === true,
    timeoutMs: sideEffects === true ? 15000 : 5000,
    costClass: sideEffects === true ? 'medium' : 'low',
    supportsAsync: sideEffects === true,
  },
  inputSchema: curriculumIdSchema,
}));

export function createCurriculumToolHandlers(service: CurriculumService): Record<string, ToolHandler> {
  return {
    'get-curriculum-by-id': async (input, userId) => {
      const curriculumId = readCurriculumId(input);
      return ok(await service.getCurriculum(userId as UserId, curriculumId));
    },
    'get-active-version': async (input, userId) => {
      const curriculumId = readCurriculumId(input);
      return ok(await service.getActiveVersion(userId as UserId, curriculumId));
    },
    'get-frontier': async (input, userId) => {
      const curriculumId = readCurriculumId(input);
      return ok(await service.getFrontier(userId as UserId, curriculumId));
    },
    'get-progress': async (input, userId) => {
      const curriculumId = readCurriculumId(input);
      return ok(await service.listProgress(userId as UserId, curriculumId));
    },
    'list-revision-proposals': async (input, userId) => {
      const curriculumId = readCurriculumId(input);
      return ok(await service.listRevisionProposals(userId as UserId, curriculumId));
    },
    'get-realignment-evidence': async (input, userId) => {
      const curriculumId = readCurriculumId(input);
      return ok(await service.listRealignmentEvidence(userId as UserId, curriculumId));
    },
    'propose-curriculum-draft': async (input, userId, correlationId) => {
      const curriculumId = readCurriculumId(input);
      await Promise.resolve();
      return ok({
        accepted: true,
        curriculumId,
        userId,
        correlationId,
        mode: 'draft_generation_requested',
      });
    },
    'propose-revision': async (input, userId) => {
      const body = input as Record<string, unknown>;
      const curriculumId = readCurriculumId(input);
      return ok(
        await service.recordRealignmentEvidence(userId as UserId, curriculumId, {
          stableNodeKey: readString(body, 'stableNodeKey'),
          triggerType: readString(body, 'triggerType'),
          sessionId: readString(body, 'sessionId') as never,
        })
      );
    },
  };
}

function readCurriculumId(input: unknown): CurriculumId {
  const body = input as Record<string, unknown>;
  return readString(body, 'curriculumId') as CurriculumId;
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value : '';
}

function ok(data: unknown): IToolResult {
  return {
    success: true,
    data,
    agentHints: {
      suggestedNextActions: [],
      relatedResources: [],
      confidence: 0.8,
      sourceQuality: 'high',
      validityPeriod: 'short',
      contextNeeded: [],
      assumptions: [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0.2, effort: 0.1, roi: 2 },
      preferenceAlignment: [],
      reasoning: 'Curriculum-service tool completed.',
    },
  };
}

export type CurriculumToolName = (typeof CURRICULUM_TOOL_DEFINITIONS)[number]['name'];
export interface ICurriculumProposalToolInput {
  curriculumId: CurriculumId;
  proposalId?: RevisionProposalId;
}
