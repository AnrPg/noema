import type { GraphEdgeType, NodeId, StudyMode, UserId } from '@noema/types';
import type {
  ApplyPkgExpansionSelectionRequestInput,
  PkgExpansionRequestInput,
} from '@noema/validation';
import { AgentHintsBuilder } from '../../../domain/knowledge-graph-service/agent-hints.factory.js';
import type {
  ICreateEdgeInput,
  ICreateNodeInput,
  IUpdateNodeInput,
} from '../../../domain/knowledge-graph-service/graph.repository.js';
import type {
  IExecutionContext,
  IKnowledgeGraphService,
  IServiceResult,
} from '../../../domain/knowledge-graph-service/knowledge-graph.service.js';
import {
  UpstreamServiceProtocolError,
  UpstreamServiceTimeoutError,
  UpstreamServiceUnavailableError,
} from '../../../domain/knowledge-graph-service/errors/base.errors.js';
import { NodeFilter } from '../../../domain/knowledge-graph-service/value-objects/graph.value-objects.js';

interface IAgentRunEnvelope {
  data?: {
    runId?: string;
    jobId?: string | null;
    status?: string;
    pollAfterSeconds?: number | null;
    execution?: { result?: Record<string, unknown> | null } | null;
  };
  error?: { message?: string };
}

interface IBatchJobEnvelope {
  data?: {
    job?: {
      status?: string;
      result?: Record<string, unknown> | null;
      errorMessage?: string | null;
    };
  };
  error?: { message?: string };
}

export interface IKnowledgeGraphExpansionAgentClient {
  generateExpansion(
    request: {
      userId: string;
      conceptIds: string[];
      selectedNodeIds: string[];
      studyMode?: StudyMode | null;
      scope: PkgExpansionRequestInput['scope'];
      domain?: string | null;
      correlationId: string;
    }
  ): Promise<Record<string, unknown>>;
}

export interface IHttpKnowledgeGraphExpansionAgentClientConfig {
  baseUrl: string;
  serviceToken?: string;
  pollIntervalMs?: number;
  batchTimeoutMs?: number;
}

export interface IGraphAgentReviewProposalInput {
  proposalId: string;
  conceptId?: string | null | undefined;
  proposalType?: string | null | undefined;
  operation: Record<string, unknown>;
  rationale?: string | null | undefined;
  confidenceScore?: number | null | undefined;
  reviewState?: string | null | undefined;
  sourceDocumentIds?: string[] | undefined;
  candidateLabel?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
  ckgOperations?: Record<string, unknown>[] | undefined;
}

export interface IApplyGraphAgentProposalSelectionRequestInput {
  selectedProposalIds: string[];
  proposals: IGraphAgentReviewProposalInput[];
  forwardCanonical?: boolean;
}

export interface IAppliedGraphProposalResult {
  appliedProposalIds: string[];
  createdNodeIds: string[];
  createdEdgeIds: string[];
  updatedNodeIds: string[];
  canonicalMutationIds: string[];
  skippedProposalIds: string[];
  message: string;
}

export class HttpKnowledgeGraphExpansionAgentClient
  implements IKnowledgeGraphExpansionAgentClient
{
  private static readonly SERVICE_NAME = 'knowledge-graph-agent';
  private readonly baseUrl: string;
  private readonly serviceToken: string | undefined;
  private readonly pollIntervalMs: number;
  private readonly batchTimeoutMs: number;

  constructor(config: IHttpKnowledgeGraphExpansionAgentClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.serviceToken = config.serviceToken;
    this.pollIntervalMs = config.pollIntervalMs ?? 1000;
    this.batchTimeoutMs = config.batchTimeoutMs ?? 60_000;
  }

  async generateExpansion(request: {
    userId: string;
    conceptIds: string[];
    selectedNodeIds: string[];
    studyMode?: StudyMode | null;
      scope: PkgExpansionRequestInput['scope'];
    domain?: string | null;
    correlationId: string;
  }): Promise<Record<string, unknown>> {
    const envelope = await this.requestJson(
      `${this.baseUrl}/v1/agents/knowledge-graph-agent/run`,
      {
        method: 'POST',
        headers: this.headers(request.userId, request.correlationId),
        body: JSON.stringify({
          userId: request.userId,
          conceptIds: request.conceptIds,
          selectedNodeIds: request.selectedNodeIds,
          operationName: 'expand_pkg',
          graphExpansionScope: request.scope,
          studyMode: request.studyMode ?? null,
          payload: {
            operationName: 'expand_pkg',
            proposalType: 'expand_pkg',
            operationType: 'expand_pkg',
            domain: request.domain ?? request.scope.domain ?? null,
            graphExpansionScope: request.scope,
          },
        }),
      },
      request.correlationId
    );
    const response = envelope.response;
    const data = envelope.body as IAgentRunEnvelope;
    if (!response.ok) {
      throw new Error(
        data.error?.message ??
          `Knowledge-graph agent request failed: ${String(response.status)}`
      );
    }
    const run = data.data ?? {};
    if (run.status === 'queued' && typeof run.jobId === 'string' && run.jobId.length > 0) {
      return await this.waitForBatchResult(
        run.jobId,
        request.userId,
        request.correlationId,
        run.pollAfterSeconds ?? null
      );
    }
    const result = run.execution?.result;
    const finalResult =
      result !== null &&
      typeof result === 'object' &&
      'result' in result &&
      typeof result['result'] === 'object' &&
      result['result'] !== null
        ? (result['result'] as Record<string, unknown>)
        : result;
    if (!finalResult || typeof finalResult !== 'object') {
      throw new Error('Knowledge-graph agent did not return an expansion proposal bundle.');
    }
    return finalResult;
  }

  private async waitForBatchResult(
    jobId: string,
    userId: string,
    correlationId: string,
    pollAfterSeconds: number | null
  ): Promise<Record<string, unknown>> {
    const timeoutAt = Date.now() + this.batchTimeoutMs;
    const initialDelay = (pollAfterSeconds ?? 0) * 1000;
    if (initialDelay > 0) {
      await delay(initialDelay);
    }
    while (Date.now() < timeoutAt) {
      const envelope = await this.requestJson(
        `${this.baseUrl}/v1/batch-jobs/${jobId}`,
        {
          method: 'GET',
          headers: this.headers(userId, correlationId),
        },
        correlationId
      );
      const response = envelope.response;
      const body = envelope.body as IBatchJobEnvelope;
      if (!response.ok) {
        throw new Error(
          body.error?.message ??
            `Failed to poll knowledge-graph agent batch job ${jobId}: ${String(response.status)}`
        );
      }
      const job = body.data?.job;
      if (job?.status === 'completed' && job.result && typeof job.result === 'object') {
        const payload =
          'result' in job.result &&
          typeof job.result['result'] === 'object' &&
          job.result['result'] !== null
            ? (job.result['result'] as Record<string, unknown>)
            : job.result;
        return payload;
      }
      if (job?.status === 'failed' || job?.status === 'cancelled') {
        throw new Error(
          job.errorMessage ??
            `Knowledge-graph agent batch job ${jobId} failed with status ${job.status}`
        );
      }
      await delay(this.pollIntervalMs);
    }
    throw new UpstreamServiceTimeoutError(
      HttpKnowledgeGraphExpansionAgentClient.SERVICE_NAME,
      `Timed out waiting for knowledge-graph agent batch job ${jobId}`,
      { correlationId, jobId, timeoutMs: this.batchTimeoutMs }
    );
  }

  private headers(userId: string, correlationId: string): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-user-id': userId,
      'x-correlation-id': correlationId,
    };
    if (this.serviceToken !== undefined && this.serviceToken.trim().length > 0) {
      headers['authorization'] = `Bearer ${this.serviceToken}`;
    }
    return headers;
  }

  private async requestJson(
    url: string,
    init: RequestInit,
    correlationId: string
  ): Promise<{ response: Response; body: Record<string, unknown> }> {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      throw this.mapFetchFailure(error, correlationId, url);
    }

    const text = await response.text();
    if (text.trim() === '') {
      throw new UpstreamServiceProtocolError(
        HttpKnowledgeGraphExpansionAgentClient.SERVICE_NAME,
        `${HttpKnowledgeGraphExpansionAgentClient.SERVICE_NAME} returned an empty response`,
        { correlationId, status: response.status, url }
      );
    }

    try {
      return {
        response,
        body: JSON.parse(text) as Record<string, unknown>,
      };
    } catch (error) {
      throw new UpstreamServiceProtocolError(
        HttpKnowledgeGraphExpansionAgentClient.SERVICE_NAME,
        `${HttpKnowledgeGraphExpansionAgentClient.SERVICE_NAME} returned malformed JSON`,
        {
          correlationId,
          status: response.status,
          url,
          cause: error instanceof Error ? error.message : 'Unknown JSON parse failure',
          bodyPreview: text.slice(0, 500),
        }
      );
    }
  }

  private mapFetchFailure(error: unknown, correlationId: string, url: string): Error {
    if (error instanceof Error && error.name === 'AbortError') {
      return new UpstreamServiceTimeoutError(
        HttpKnowledgeGraphExpansionAgentClient.SERVICE_NAME,
        `${HttpKnowledgeGraphExpansionAgentClient.SERVICE_NAME} timed out`,
        { correlationId, url }
      );
    }

    return new UpstreamServiceUnavailableError(
      HttpKnowledgeGraphExpansionAgentClient.SERVICE_NAME,
      `Could not reach ${HttpKnowledgeGraphExpansionAgentClient.SERVICE_NAME}`,
      {
        correlationId,
        url,
        cause: error instanceof Error ? error.message : 'Unknown upstream fetch failure',
      }
    );
  }
}

export class PkgExpansionApplicationService {
  constructor(
    private readonly graphService: IKnowledgeGraphService,
    private readonly agentClient: IKnowledgeGraphExpansionAgentClient
  ) {}

  async preview(
    userId: UserId,
    input: PkgExpansionRequestInput,
    context: IExecutionContext
  ): Promise<IServiceResult<Record<string, unknown>>> {
    const conceptIds = await this.scopeConceptLabels(userId, input, context);
    if (conceptIds.length === 0) {
      return {
        data: buildEmptyProposalBundle(input),
        agentHints: AgentHintsBuilder.create()
          .withReasoning(
            'No scoped PKG concepts were available for expansion, so an empty proposal bundle was returned.'
          )
          .build(),
      };
    }
    const scopeNodeIds = Array.isArray(input.scope.nodeIds) ? input.scope.nodeIds : [];
    const result = await this.agentClient.generateExpansion({
      userId,
      conceptIds,
      selectedNodeIds: scopeNodeIds,
      studyMode: input.studyMode ?? null,
      scope: input.scope,
      domain: input.scope.domain ?? null,
      correlationId: context.correlationId,
    });
    return {
      data: result,
      agentHints: AgentHintsBuilder.create()
        .withReasoning('Generated a scope-aware PKG expansion proposal bundle for learner review.')
        .build(),
    };
  }

  async apply(
    userId: UserId,
    input: ApplyPkgExpansionSelectionRequestInput,
    context: IExecutionContext
  ): Promise<IServiceResult<IAppliedGraphProposalResult>> {
    const selected = new Set(input.selectedProposalIds);
    const proposals = (input.proposals ?? []).filter(
      (proposal: (typeof input.proposals)[number]) => selected.has(proposal.proposalId)
    );
    const tempRefs = new Map<string, string>();
    const appliedProposalIds: string[] = [];
    const createdNodeIds: string[] = [];
    const createdEdgeIds: string[] = [];
    const updatedNodeIds: string[] = [];
    const canonicalMutationIds: string[] = [];
    const skippedProposalIds = input.selectedProposalIds.filter(
      (proposalId: string) =>
        !proposals.some(
          (proposal: (typeof proposals)[number]) => proposal.proposalId === proposalId
        )
    );

    for (const proposal of proposals) {
      const pkgOperations = Array.isArray(proposal.pkgOperations)
        ? (proposal.pkgOperations as Array<Record<string, unknown>>)
        : [];
      for (const operation of pkgOperations) {
        await applyPkgOperation({
          graphService: this.graphService,
          userId,
          context,
          operation,
          defaultDomain: input.scope.domain ?? 'general',
          tempRefs,
          createdNodeIds,
          createdEdgeIds,
          updatedNodeIds,
        });
      }

      const ckgOperations = Array.isArray(proposal.ckgOperations)
        ? (proposal.ckgOperations as Array<Record<string, unknown>>)
        : [];
      if (input.forwardCanonical !== false && ckgOperations.length > 0) {
        const mutation = await this.graphService.proposeMutation(
          {
            operations: ckgOperations as never[],
            rationale: proposal.whatWillChange,
            evidenceCount: 1,
            priority: 20,
          },
          context
        );
        canonicalMutationIds.push(String((mutation.data as { mutationId?: string }).mutationId ?? ''));
      }

      appliedProposalIds.push(proposal.proposalId);
    }

    return {
      data: {
        appliedProposalIds,
        createdNodeIds,
        createdEdgeIds,
        updatedNodeIds,
        canonicalMutationIds: canonicalMutationIds.filter((id) => id !== ''),
        skippedProposalIds,
        message:
          appliedProposalIds.length === 0
            ? 'No expansion proposals were applied.'
            : `Applied ${String(appliedProposalIds.length)} expansion proposal(s).`,
      },
      agentHints: AgentHintsBuilder.create()
        .withReasoning('Applied learner-selected PKG expansion proposals and forwarded canonical candidates when requested.')
        .build(),
    };
  }

  async applyGraphAgentProposals(
    userId: UserId,
    input: IApplyGraphAgentProposalSelectionRequestInput,
    context: IExecutionContext
  ): Promise<IServiceResult<IAppliedGraphProposalResult>> {
    const selected = new Set(input.selectedProposalIds);
    const selectedProposals = (input.proposals ?? []).filter((proposal) =>
      selected.has(proposal.proposalId)
    );
    const skippedProposalIds = input.selectedProposalIds.filter(
      (proposalId) => !selectedProposals.some((proposal) => proposal.proposalId === proposalId)
    );
    const appliedProposalIds: string[] = [];
    const createdNodeIds: string[] = [];
    const createdEdgeIds: string[] = [];
    const updatedNodeIds: string[] = [];
    const canonicalMutationIds: string[] = [];
    const createdNodeRefs = new Map<string, string>();
    const appliedProposalIdSet = new Set<string>();
    const applyingProposalIds = new Set<string>();
    const proposalByConceptOrLabel = new Map<string, IGraphAgentReviewProposalInput[]>();

    for (const proposal of input.proposals ?? []) {
      for (const ref of proposalReferenceKeys(proposal)) {
        const current = proposalByConceptOrLabel.get(ref) ?? [];
        current.push(proposal);
        proposalByConceptOrLabel.set(ref, current);
      }
    }

    const applySingleProposal = async (proposal: IGraphAgentReviewProposalInput): Promise<void> => {
      if (appliedProposalIdSet.has(proposal.proposalId) || applyingProposalIds.has(proposal.proposalId)) {
        return;
      }
      applyingProposalIds.add(proposal.proposalId);
      try {
        const operation = proposal.operation;
        const legacyEdgeOperation =
          operation['type'] === 'add_node' ? buildEdgeOperationFromLegacyNodeProposal(proposal) : null;
        const effectiveOperation = legacyEdgeOperation ?? operation;
        const operationType = String(effectiveOperation['type'] ?? '');

        if (operationType === 'add_node') {
          const existingId = await findExistingNodeIdForGraphAgentProposal(
            this.graphService,
            userId,
            proposal,
            context
          );
          let createdId = existingId;
          if (createdId === null) {
            const result = await this.graphService.createNode(
              userId,
              buildNodeCreateInputFromOperation(effectiveOperation, 'general'),
              context
            );
            createdId = extractEntityId(result.data, ['nodeId', 'id']);
          }
          if (typeof createdId === 'string' && createdId !== '') {
            if (existingId === null) {
              createdNodeIds.push(createdId);
            }
            for (const ref of proposalReferenceKeys(proposal)) {
              createdNodeRefs.set(ref, createdId);
            }
          }
        } else if (operationType === 'add_edge') {
          const sourceNodeId = await resolveGraphAgentNodeReference({
            reference: edgeEndpointReference(effectiveOperation, 'source'),
            graphService: this.graphService,
            userId,
            context,
            defaultDomain: 'general',
            createdNodeRefs,
            createdNodeIds,
            proposalByConceptOrLabel,
            applySingleProposal,
          });
          const targetNodeId = await resolveGraphAgentNodeReference({
            reference: edgeEndpointReference(effectiveOperation, 'target'),
            graphService: this.graphService,
            userId,
            context,
            defaultDomain: 'general',
            createdNodeRefs,
            createdNodeIds,
            proposalByConceptOrLabel,
            applySingleProposal,
          });
          if (sourceNodeId === null || targetNodeId === null) {
            throw new Error(
              `This graph suggestion depends on an unresolved edge endpoint: ${[
                sourceNodeId === null ? describeEdgeEndpointFailure(effectiveOperation, 'source') : null,
                targetNodeId === null ? describeEdgeEndpointFailure(effectiveOperation, 'target') : null,
              ]
                .filter((reason): reason is string => reason !== null)
                .join(' and ')}.`
            );
          }
          const result = await this.graphService.createEdge(
            userId,
            buildEdgeCreateInputFromOperation(effectiveOperation, sourceNodeId, targetNodeId),
            context
          );
          const createdId = extractEntityId(result.data, ['edgeId', 'id']);
          if (createdId !== '') {
            createdEdgeIds.push(createdId);
          }
        } else if (operationType === 'update_node' && typeof effectiveOperation['nodeId'] === 'string') {
          await this.graphService.updateNode(
            userId,
            effectiveOperation['nodeId'] as NodeId,
            buildNodeUpdateInputFromOperation(effectiveOperation),
            context
          );
          updatedNodeIds.push(effectiveOperation['nodeId']);
        } else {
          throw new Error(`Unsupported graph-agent operation: ${operationType || 'unknown'}`);
        }

        const ckgOperations = Array.isArray(proposal.ckgOperations)
          ? proposal.ckgOperations
          : [];
        if (input.forwardCanonical !== false && ckgOperations.length > 0) {
          const mutation = await this.graphService.proposeMutation(
            {
              operations: ckgOperations as never[],
              rationale: proposal.rationale ?? 'Approved from graph review workspace.',
              evidenceCount: 1,
              priority: 20,
            },
            context
          );
          canonicalMutationIds.push(
            String((mutation.data as { mutationId?: string }).mutationId ?? '')
          );
        }

        appliedProposalIds.push(proposal.proposalId);
        appliedProposalIdSet.add(proposal.proposalId);
      } finally {
        applyingProposalIds.delete(proposal.proposalId);
      }
    };

    for (const proposal of selectedProposals) {
      await applySingleProposal(proposal);
    }

    return {
      data: {
        appliedProposalIds,
        createdNodeIds,
        createdEdgeIds,
        updatedNodeIds,
        canonicalMutationIds: canonicalMutationIds.filter((id) => id !== ''),
        skippedProposalIds,
        message:
          appliedProposalIds.length === 0
            ? 'No graph suggestions were applied.'
            : `Applied ${String(appliedProposalIds.length)} graph suggestion(s).`,
      },
      agentHints: AgentHintsBuilder.create()
        .withReasoning(
          'Applied approved graph-agent suggestions and preserved the agent-authored operation payload.'
        )
        .build(),
    };
  }

  private async scopeConceptLabels(
    userId: UserId,
    input: PkgExpansionRequestInput,
    context: IExecutionContext
  ): Promise<string[]> {
    if (input.scope.scopeType === 'node') {
      const labels: string[] = [];
      const nodeIds = Array.isArray(input.scope.nodeIds) ? input.scope.nodeIds : [];
      for (const nodeId of nodeIds) {
        const node = await this.graphService.getNode(userId, nodeId as NodeId, context);
        labels.push(node.data.label);
      }
      return labels;
    }

    const filter = NodeFilter.create({
      ...(input.scope.domain !== undefined && input.scope.domain !== null
        ? { domain: input.scope.domain }
        : {}),
      ...(input.studyMode !== undefined && input.studyMode !== null
        ? { studyMode: input.studyMode }
        : {}),
      userId,
      graphType: 'pkg',
    });
    const result = await this.graphService.listNodes(
      userId,
      filter,
      { limit: input.limit ?? 50, offset: 0 },
      context
    );
    return result.data.items.map((node) => node.label);
  }
}

async function resolvePkgOperationNodeId(input: {
  directNodeId: unknown;
  tempRef: unknown;
  tempRefs: Map<string, string>;
  graphService: IKnowledgeGraphService;
  userId: UserId;
  context: IExecutionContext;
}): Promise<string | null> {
  const { directNodeId, tempRef, tempRefs, graphService, userId, context } = input;
  if (typeof directNodeId === 'string' && directNodeId !== '') {
    if (directNodeId.startsWith('node_')) {
      return directNodeId;
    }
    const cached = tempRefs.get(directNodeId);
    if (cached !== undefined) {
      return cached;
    }
    const existing = await findExistingPkgNodeIdByLabel(graphService, userId, directNodeId, context);
    if (existing !== null) {
      tempRefs.set(directNodeId, existing);
      return existing;
    }
    return null;
  }
  if (typeof tempRef === 'string' && tempRef !== '') {
    return tempRefs.get(tempRef) ?? null;
  }
  return null;
}

function firstStringValue(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }
  return null;
}

function edgeEndpointReference(
  operation: Record<string, unknown>,
  role: 'source' | 'target'
): string | null {
  return role === 'source'
    ? firstStringValue(operation, [
        'sourceNodeId',
        'sourceId',
        'fromNodeId',
        'fromId',
        'sourceNodeLabel',
        'sourceLabel',
        'fromNodeLabel',
        'fromLabel',
        'sourceConceptId',
        'fromConceptId',
        'sourceConceptRef',
        'fromConceptRef',
      ])
    : firstStringValue(operation, [
        'targetNodeId',
        'targetId',
        'toNodeId',
        'toId',
        'targetNodeLabel',
        'targetLabel',
        'toNodeLabel',
        'toLabel',
        'targetConceptId',
        'toConceptId',
        'targetConceptRef',
        'toConceptRef',
      ]);
}

function edgeTempReference(
  operation: Record<string, unknown>,
  role: 'source' | 'target'
): string | null {
  return role === 'source'
    ? firstStringValue(operation, ['sourceTempRef', 'fromTempRef'])
    : firstStringValue(operation, ['targetTempRef', 'toTempRef']);
}

function describeEdgeEndpointFailure(
  operation: Record<string, unknown>,
  role: 'source' | 'target'
): string {
  const reference = edgeEndpointReference(operation, role) ?? edgeTempReference(operation, role);
  return reference === null ? `${role} endpoint was missing` : `${role} endpoint "${reference}" was not found`;
}

function normalizeProposalType(value: unknown): string {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

function isEdgeLikeGraphAgentProposal(proposal: IGraphAgentReviewProposalInput): boolean {
  const normalized = normalizeProposalType(proposal.proposalType);
  return [
    'EDGE',
    'STRUCTURAL',
    'PREREQUISITE',
    'RELATION',
    'ADD_NODE_AND_EDGE',
    'CREATE_CONCEPT_AND_EDGE',
  ].some((marker) => normalized.includes(marker));
}

function normalizeEdgeType(value: unknown): GraphEdgeType {
  const raw = String(value ?? 'prerequisite').trim().toLowerCase().replaceAll('-', '_');
  const aliases: Record<string, GraphEdgeType> = {
    is_a_type_of: 'is_a' as GraphEdgeType,
    type_of: 'is_a' as GraphEdgeType,
    kind_of: 'is_a' as GraphEdgeType,
    includes_study_of: 'related_to' as GraphEdgeType,
    studies: 'related_to' as GraphEdgeType,
    contrast: 'contrasts_with' as GraphEdgeType,
    contrasts: 'contrasts_with' as GraphEdgeType,
    requires: 'prerequisite' as GraphEdgeType,
    prerequisite_for: 'prerequisite' as GraphEdgeType,
  };
  return (aliases[raw] ?? raw) as GraphEdgeType;
}

function buildEdgeOperationFromLegacyNodeProposal(
  proposal: IGraphAgentReviewProposalInput
): Record<string, unknown> | null {
  if (!isEdgeLikeGraphAgentProposal(proposal)) {
    return null;
  }
  const label =
    typeof proposal.operation['label'] === 'string' && proposal.operation['label'].trim() !== ''
      ? proposal.operation['label']
      : proposal.candidateLabel;
  const target = proposal.conceptId;
  if (
    typeof label !== 'string' ||
    label.trim() === '' ||
    typeof target !== 'string' ||
    target.trim() === ''
  ) {
    return null;
  }
  if (label.trim().toLowerCase() === target.trim().toLowerCase()) {
    return null;
  }
  return {
    type: 'add_edge',
    edgeType: normalizeEdgeType(proposal.operation['edgeType'] ?? proposal.operation['relationKind']),
    sourceNodeId: label,
    targetNodeId: target,
    weight:
      typeof proposal.confidenceScore === 'number'
        ? proposal.confidenceScore
        : proposal.operation['weight'],
    properties: {
      ...(asRecord(proposal.operation['properties']) ?? {}),
      source: 'knowledge-graph-agent',
      proposalType: proposal.proposalType ?? 'STRUCTURAL',
      synthesizedFromLegacyNodeProposal: true,
    },
  };
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.filter((item): item is string => typeof item === 'string' && item !== '');
  return items.length > 0 ? items : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function buildNodeCreateInputFromOperation(
  operation: Record<string, unknown>,
  defaultDomain: string
): ICreateNodeInput {
  const input: {
    label: string;
    nodeType: string;
    domain: string;
    description?: string;
    status?: ICreateNodeInput['status'];
    aliases?: string[];
    languages?: string[];
    tags?: string[];
    semanticHints?: string[];
    supportedStudyModes?: ICreateNodeInput['supportedStudyModes'];
    canonicalExternalRefs?: ICreateNodeInput['canonicalExternalRefs'];
    ontologyMappings?: ICreateNodeInput['ontologyMappings'];
    provenance?: ICreateNodeInput['provenance'];
    reviewMetadata?: ICreateNodeInput['reviewMetadata'];
    sourceCoverage?: ICreateNodeInput['sourceCoverage'];
    properties?: Record<string, unknown>;
    stabilityLevel?: number;
  } = {
    label: String(operation['label']),
    nodeType: String(operation['nodeType'] ?? 'notion'),
    domain: String(operation['domain'] ?? defaultDomain),
  };

  if (typeof operation['description'] === 'string') input.description = operation['description'];
  if (typeof operation['status'] === 'string') {
    input.status = operation['status'] as ICreateNodeInput['status'];
  }
  if (Array.isArray(operation['canonicalExternalRefs'])) {
    input.canonicalExternalRefs = operation['canonicalExternalRefs'].filter(
      (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null
    ) as unknown as ICreateNodeInput['canonicalExternalRefs'];
  }
  if (Array.isArray(operation['ontologyMappings'])) {
    input.ontologyMappings = operation['ontologyMappings'].filter(
      (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null
    ) as unknown as ICreateNodeInput['ontologyMappings'];
  }
  if (Array.isArray(operation['provenance'])) {
    input.provenance = operation['provenance'].filter(
      (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null
    ) as unknown as ICreateNodeInput['provenance'];
  }
  if (typeof operation['reviewMetadata'] === 'object' || operation['reviewMetadata'] === null) {
    const reviewMetadata =
      operation['reviewMetadata'] === null ? null : asRecord(operation['reviewMetadata']);
    if (reviewMetadata !== undefined || operation['reviewMetadata'] === null) {
      input.reviewMetadata = reviewMetadata as ICreateNodeInput['reviewMetadata'];
    }
  }
  if (typeof operation['sourceCoverage'] === 'object' || operation['sourceCoverage'] === null) {
    const sourceCoverage =
      operation['sourceCoverage'] === null ? null : asRecord(operation['sourceCoverage']);
    if (sourceCoverage !== undefined || operation['sourceCoverage'] === null) {
      input.sourceCoverage = sourceCoverage as ICreateNodeInput['sourceCoverage'];
    }
  }
  if (typeof operation['stabilityLevel'] === 'number') input.stabilityLevel = operation['stabilityLevel'];

  const aliases = asStringArray(operation['aliases']);
  if (aliases !== undefined) input.aliases = aliases;
  const languages = asStringArray(operation['languages']);
  if (languages !== undefined) input.languages = languages;
  const tags = asStringArray(operation['tags']);
  if (tags !== undefined) input.tags = tags;
  const semanticHints = asStringArray(operation['semanticHints']);
  if (semanticHints !== undefined) input.semanticHints = semanticHints;
  const supportedStudyModes = asStringArray(operation['supportedStudyModes']);
  if (supportedStudyModes !== undefined) {
    input.supportedStudyModes = supportedStudyModes as ICreateNodeInput['supportedStudyModes'];
  }

  const properties = asRecord(operation['properties']);
  if (properties !== undefined) input.properties = properties;
  return input as ICreateNodeInput;
}

function buildNodeUpdateInputFromOperation(operation: Record<string, unknown>): IUpdateNodeInput {
  const updates = asRecord(operation['updates']);
  return (updates ?? {}) as IUpdateNodeInput;
}

function buildEdgeCreateInputFromOperation(
  operation: Record<string, unknown>,
  sourceNodeId: string,
  targetNodeId: string
): ICreateEdgeInput {
  const input: {
    sourceNodeId: NodeId;
    targetNodeId: NodeId;
    edgeType: GraphEdgeType;
    weight?: ICreateEdgeInput['weight'];
    properties?: Record<string, unknown>;
  } = {
    sourceNodeId: sourceNodeId as NodeId,
    targetNodeId: targetNodeId as NodeId,
    edgeType: String(operation['edgeType'] ?? operation['typeLabel'] ?? 'related_to') as GraphEdgeType,
  };
  if (typeof operation['weight'] === 'number') {
    input.weight = operation['weight'] as ICreateEdgeInput['weight'];
  }
  const properties = asRecord(operation['properties']);
  if (properties !== undefined) {
    input.properties = properties;
  }
  return input as ICreateEdgeInput;
}

async function applyPkgOperation(input: {
  graphService: IKnowledgeGraphService;
  userId: UserId;
  context: IExecutionContext;
  operation: Record<string, unknown>;
  defaultDomain: string;
  tempRefs: Map<string, string>;
  createdNodeIds: string[];
  createdEdgeIds: string[];
  updatedNodeIds: string[];
}): Promise<void> {
  const { graphService, userId, context, operation, defaultDomain, tempRefs } = input;
  if (operation['type'] === 'add_node') {
    const result = await graphService.createNode(
      userId,
      buildNodeCreateInputFromOperation(operation, defaultDomain),
      context
    );
    const createdId = extractEntityId(result.data, ['nodeId', 'id']);
    if (createdId !== '') {
      input.createdNodeIds.push(createdId);
      if (typeof operation['tempNodeRef'] === 'string' && operation['tempNodeRef'] !== '') {
        tempRefs.set(operation['tempNodeRef'], createdId);
      }
      if (typeof operation['label'] === 'string' && operation['label'].trim() !== '') {
        tempRefs.set(operation['label'], createdId);
      }
    }
    return;
  }
  if (operation['type'] === 'add_edge') {
    const sourceNodeId = await resolvePkgOperationNodeId({
      directNodeId: edgeEndpointReference(operation, 'source'),
      tempRef: edgeTempReference(operation, 'source'),
      tempRefs,
      graphService,
      userId,
      context,
    });
    const targetNodeId = await resolvePkgOperationNodeId({
      directNodeId: edgeEndpointReference(operation, 'target'),
      tempRef: edgeTempReference(operation, 'target'),
      tempRefs,
      graphService,
      userId,
      context,
    });
    if (sourceNodeId === null || targetNodeId === null) {
      throw new Error(
        `Could not apply edge proposal because ${[
          sourceNodeId === null ? describeEdgeEndpointFailure(operation, 'source') : null,
          targetNodeId === null ? describeEdgeEndpointFailure(operation, 'target') : null,
        ]
          .filter((reason): reason is string => reason !== null)
          .join(' and ')}.`
      );
    }
    const result = await graphService.createEdge(
      userId,
      buildEdgeCreateInputFromOperation(operation, sourceNodeId, targetNodeId),
      context
    );
    const createdId = extractEntityId(result.data, ['edgeId', 'id']);
    if (createdId !== '') {
      input.createdEdgeIds.push(createdId);
    }
    return;
  }
  if (operation['type'] === 'update_node' && typeof operation['nodeId'] === 'string') {
    await graphService.updateNode(
      userId,
      operation['nodeId'] as NodeId,
      buildNodeUpdateInputFromOperation(operation),
      context
    );
    input.updatedNodeIds.push(operation['nodeId']);
  }
}

async function resolveGraphAgentNodeReference(input: {
  reference: unknown;
  graphService: IKnowledgeGraphService;
  userId: UserId;
  context: IExecutionContext;
  defaultDomain: string;
  createdNodeRefs: Map<string, string>;
  createdNodeIds: string[];
  proposalByConceptOrLabel: Map<string, IGraphAgentReviewProposalInput[]>;
  applySingleProposal: (proposal: IGraphAgentReviewProposalInput) => Promise<void>;
}): Promise<string | null> {
  if (typeof input.reference !== 'string' || input.reference === '') {
    return null;
  }
  if (input.reference.startsWith('node_')) {
    return input.reference;
  }
  const cached = input.createdNodeRefs.get(input.reference);
  if (cached !== undefined) {
    return cached;
  }
  const supportingProposal = pickSupportingNodeProposal(
    input.proposalByConceptOrLabel.get(input.reference)
  );
  if (supportingProposal !== undefined) {
    await input.applySingleProposal(supportingProposal);
    const resolvedFromProposal = input.createdNodeRefs.get(input.reference);
    if (resolvedFromProposal !== undefined) {
      return resolvedFromProposal;
    }
  }
  const existing = await findExistingPkgNodeIdByLabel(
    input.graphService,
    input.userId,
    input.reference,
    input.context
  );
  if (existing !== null) {
    input.createdNodeRefs.set(input.reference, existing);
    return existing;
  }
  const created = await input.graphService.createNode(
    input.userId,
    {
      label: input.reference,
      nodeType: 'notion',
      domain: input.defaultDomain,
      properties: {
        source: 'knowledge-graph-agent',
        synthesizedFromGraphReviewReference: true,
      },
    },
    input.context
  );
  const createdNodeId = extractEntityId(created.data, ['nodeId', 'id']);
  if (createdNodeId !== '') {
    input.createdNodeIds.push(createdNodeId);
    input.createdNodeRefs.set(input.reference, createdNodeId);
    return createdNodeId;
  }
  return null;
}

function proposalReferenceKeys(proposal: IGraphAgentReviewProposalInput): string[] {
  const refs = [
    proposal.conceptId,
    proposal.candidateLabel,
    typeof proposal.operation?.['label'] === 'string' ? String(proposal.operation['label']) : null,
  ];
  return [...new Set(refs.filter((ref): ref is string => typeof ref === 'string' && ref !== ''))];
}

function pickSupportingNodeProposal(
  proposals: IGraphAgentReviewProposalInput[] | undefined
): IGraphAgentReviewProposalInput | undefined {
  return proposals?.find(
    (proposal) =>
      typeof proposal.operation === 'object' &&
      proposal.operation !== null &&
      proposal.operation['type'] === 'add_node'
  );
}

async function findExistingNodeIdForGraphAgentProposal(
  graphService: IKnowledgeGraphService,
  userId: UserId,
  proposal: IGraphAgentReviewProposalInput,
  context: IExecutionContext
): Promise<string | null> {
  for (const ref of proposalReferenceKeys(proposal)) {
    const existing = await findExistingPkgNodeIdByLabel(graphService, userId, ref, context);
    if (existing !== null) {
      return existing;
    }
  }
  return null;
}

async function findExistingPkgNodeIdByLabel(
  graphService: IKnowledgeGraphService,
  userId: UserId,
  label: string,
  context: IExecutionContext
): Promise<string | null> {
  const trimmedLabel = label.trim();
  if (trimmedLabel === '') {
    return null;
  }
  if (typeof graphService.listNodes !== 'function') {
    return null;
  }
  const result = await graphService.listNodes(
    userId,
    NodeFilter.create({
      userId,
      graphType: 'pkg',
      labelContains: trimmedLabel,
      searchMode: 'substring',
    }),
    { limit: 20, offset: 0 },
    context
  );
  const exact = result.data.items.find(
    (node) => node.label.trim().toLowerCase() === trimmedLabel.toLowerCase()
  );
  return exact !== undefined ? String(exact.nodeId) : null;
}

function extractEntityId(value: unknown, keys: readonly string[]): string {
  if (typeof value !== 'object' || value === null) {
    return '';
  }
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (typeof record[key] === 'string' && record[key] !== '') {
      return String(record[key]);
    }
  }
  return '';
}

function buildEmptyProposalBundle(input: PkgExpansionRequestInput): Record<string, unknown> {
  return {
    artifactKind: 'pkg_expansion_proposal_bundle',
    scope: {
      scopeType: input.scope.scopeType,
      nodeIds: Array.isArray(input.scope.nodeIds) ? input.scope.nodeIds : [],
      ...(input.scope.domain !== undefined ? { domain: input.scope.domain } : {}),
    },
    generatedAt: new Date().toISOString(),
    summary: {
      proposalCount: 0,
      nodeProposalCount: 0,
      edgeProposalCount: 0,
      wordingProposalCount: 0,
      canonicalCandidateCount: 0,
    },
    proposals: [],
  };
}
