/**
 * @noema/knowledge-graph-service - Knowledge Graph MCP Tool Handlers
 *
 * 18 MCP tools for the knowledge-graph-service (Phase 9):
 *
 * Task 1 — PKG tools (P0):
 *   get-concept-node, get-subgraph, find-prerequisites, find-related-concepts,
 *   add-concept-node, add-edge, update-mastery, remove-node, remove-edge
 *
 * Task 2 — CKG tools (P0):
 *   get-canonical-structure, propose-mutation, get-mutation-status
 *
 * Task 3 — Structural analysis tools (P0/P1):
 *   compute-structural-metrics, get-structural-health,
 *   detect-misconceptions, suggest-intervention
 *
 * Task 4 — Metacognitive tools (P0):
 *   get-metacognitive-stage, get-learning-path-context
 *
 * Each handler wraps one or more IKnowledgeGraphService methods and
 * returns IToolResult. The handler is responsible for input casting,
 * service invocation, and error mapping — the ToolRegistry handles
 * input validation and metadata attachment.
 */

import type {
  CorrelationId,
  EdgeId,
  EdgeWeight,
  GraphEdgeType,
  MasteryLevel,
  MutationId,
  NodeId,
  UserId,
} from '@noema/types';

import type { IMutationProposal } from '../../domain/knowledge-graph-service/ckg-mutation-dsl.js';
import { DomainError } from '../../domain/knowledge-graph-service/errors/index.js';
import type { IExecutionContext } from '../../domain/knowledge-graph-service/execution-context.js';
import type {
  ICreateEdgeInput,
  ICreateNodeInput,
} from '../../domain/knowledge-graph-service/graph.repository.js';
import type { IKnowledgeGraphService } from '../../domain/knowledge-graph-service/knowledge-graph.service.js';
import type { IValidationOptions } from '../../domain/knowledge-graph-service/value-objects/graph.value-objects.js';
import {
  NeighborhoodQuery,
  NodeFilter,
  PrerequisiteChainQuery,
  TraversalOptions,
} from '../../domain/knowledge-graph-service/value-objects/graph.value-objects.js';
import type { IToolDefinition, IToolResult } from './tool.types.js';

// ============================================================================
// Helpers (content-service pattern)
// ============================================================================

type IBaseToolDefinition = Omit<IToolDefinition, 'version' | 'scopeRequirement' | 'capabilities'>;

function inferSideEffects(name: string): boolean {
  return (
    name.startsWith('add-') ||
    name.startsWith('update-') ||
    name.startsWith('remove-') ||
    name.startsWith('propose-')
  );
}

function inferCostClass(priority: 'P0' | 'P1' | 'P2'): 'low' | 'medium' | 'high' {
  if (priority === 'P0') return 'medium';
  if (priority === 'P1') return 'low';
  return 'low';
}

function withContractDefaults(definition: IBaseToolDefinition): IToolDefinition {
  const sideEffects = inferSideEffects(definition.name);
  return {
    ...definition,
    version: '1.0.0',
    scopeRequirement: {
      match: 'any',
      requiredScopes: ['kg:tools:execute'],
    },
    capabilities: {
      idempotent: !sideEffects,
      sideEffects,
      timeoutMs: definition.name === 'get-learning-path-context' ? 15000 : 5000,
      costClass: inferCostClass(definition.priority),
      supportsDryRun: false,
      supportsAsync: false,
      supportsStreaming: false,
      consistency: sideEffects ? 'strong' : 'eventual',
    },
  };
}

function buildContext(userId: string, correlationId: string): IExecutionContext {
  return {
    userId: userId as UserId,
    correlationId: correlationId as CorrelationId,
    roles: ['agent'],
  };
}

function errorResult(error: unknown): IToolResult {
  if (error instanceof DomainError) {
    return {
      success: false,
      error: { code: error.code, message: error.message, details: error.details },
      agentHints: {
        suggestedNextActions: [],
        relatedResources: [],
        confidence: 0.9,
        sourceQuality: 'high',
        validityPeriod: 'short',
        contextNeeded: [],
        assumptions: [],
        riskFactors: [
          {
            type: 'accuracy',
            severity: 'medium',
            description: error.message,
            probability: 1.0,
            impact: 0.5,
            mitigation: error.message,
          },
        ],
        dependencies: [],
        estimatedImpact: { benefit: 0, effort: 0.1, roi: 0 },
        preferenceAlignment: [],
        reasoning: `Tool failed: ${error.message}`,
      },
    };
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  return {
    success: false,
    error: { code: 'INTERNAL_ERROR', message },
    agentHints: {
      suggestedNextActions: [],
      relatedResources: [],
      confidence: 0.5,
      sourceQuality: 'low',
      validityPeriod: 'short',
      contextNeeded: [],
      assumptions: [],
      riskFactors: [],
      dependencies: [],
      estimatedImpact: { benefit: 0, effort: 0.1, roi: 0 },
      preferenceAlignment: [],
      reasoning: `Tool failed unexpectedly: ${message}`,
    },
  };
}

// ============================================================================
// Task 1: PKG Tool Handlers
// ============================================================================

/**
 * get-concept-node — Retrieve a single concept node from a user's PKG
 * with full details and contextual agent hints.
 * P0 tool used by Learning Agent, Diagnostic Agent, Socratic Tutor.
 */
export function createGetConceptNodeHandler(service: IKnowledgeGraphService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as { nodeId: string };
      const result = await service.getNode(userId as UserId, body.nodeId as NodeId, context);
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * get-subgraph — Retrieve a subgraph centered on a node, within a depth limit.
 * P0 tool used by Learning Agent for neighborhood context.
 */
export function createGetSubgraphHandler(service: IKnowledgeGraphService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as {
        rootNodeId: string;
        maxDepth?: number;
        edgeTypeFilter?: string[];
        direction?: 'inbound' | 'outbound' | 'both';
      };
      const edgeTypesCast = body.edgeTypeFilter as GraphEdgeType[] | undefined;
      const traversalOpts = TraversalOptions.create({
        maxDepth: body.maxDepth ?? 3,
        ...(edgeTypesCast !== undefined ? { edgeTypes: edgeTypesCast } : {}),
        direction: body.direction ?? 'outbound',
        includeProperties: true,
      });
      const result = await service.getSubgraph(
        userId as UserId,
        body.rootNodeId as NodeId,
        traversalOpts,
        context
      );
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * find-prerequisites — Specialized traversal following only prerequisite edges.
 * P0 tool used by Strategy Agent for prerequisite verification.
 */
export function createFindPrerequisitesHandler(service: IKnowledgeGraphService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as { nodeId: string; maxDepth?: number; domain: string };
      const prereqQuery = PrerequisiteChainQuery.create({
        domain: body.domain,
        maxDepth: body.maxDepth ?? 5,
        includeIndirect: true,
      });
      const result = await service.getPrerequisiteChain(
        userId as UserId,
        body.nodeId as NodeId,
        prereqQuery,
        context
      );
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * find-related-concepts — Find concepts related to a given concept via any edge type,
 * ranked by relevance.
 * P0 tool used by Content Generation Agent for linking exercises.
 */
export function createFindRelatedConceptsHandler(service: IKnowledgeGraphService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as { nodeId: string; limit?: number };
      const neighborhoodQuery = NeighborhoodQuery.create({
        hops: 2,
        direction: 'both',
        maxPerGroup: body.limit ?? 10,
        includeEdges: true,
      });
      const result = await service.getNeighborhood(
        userId as UserId,
        body.nodeId as NodeId,
        neighborhoodQuery,
        context
      );
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * add-concept-node — Add a new concept node to a user's PKG.
 * P0 tool used by Ingestion Agent for graph structure creation.
 */
export function createAddConceptNodeHandler(service: IKnowledgeGraphService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as {
        label: string;
        nodeType: string;
        domain: string;
        description?: string;
        properties?: Record<string, unknown>;
      };
      const createInput: ICreateNodeInput = {
        label: body.label,
        nodeType: body.nodeType,
        domain: body.domain,
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.properties !== undefined ? { properties: body.properties } : {}),
      };
      const result = await service.createNode(userId as UserId, createInput, context);
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * add-edge — Add an edge between two nodes in a user's PKG.
 * P0 tool used by Knowledge Graph Agent for structure building.
 */
export function createAddEdgeHandler(service: IKnowledgeGraphService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as {
        sourceNodeId: string;
        targetNodeId: string;
        edgeType: string;
        weight?: number;
        skipAcyclicityCheck?: boolean;
      };
      const createInput: ICreateEdgeInput = {
        sourceNodeId: body.sourceNodeId as NodeId,
        targetNodeId: body.targetNodeId as NodeId,
        edgeType: body.edgeType as GraphEdgeType,
        ...(body.weight !== undefined ? { weight: body.weight as EdgeWeight } : {}),
      };
      const validationOpts: IValidationOptions | undefined =
        body.skipAcyclicityCheck === true
          ? {
              validateAcyclicity: false,
              validateNodeTypes: true,
              validateWeight: true,
              validateCustomRules: true,
            }
          : undefined;
      const result = await service.createEdge(
        userId as UserId,
        createInput,
        context,
        validationOpts
      );
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * update-mastery — Update the mastery level of a specific PKG node.
 * P0 tool used by Calibration Agent after spaced repetition review.
 */
export function createUpdateMasteryHandler(service: IKnowledgeGraphService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as {
        nodeId: string;
        masteryLevel: number;
        source: string;
      };
      const result = await service.updateNode(
        userId as UserId,
        body.nodeId as NodeId,
        {
          masteryLevel: body.masteryLevel as MasteryLevel,
          properties: {
            lastMasterySource: body.source,
            lastMasteryUpdate: new Date().toISOString(),
          },
        },
        context
      );
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * remove-node — Soft-delete a node from the user's PKG.
 * P1 tool used by Governance Agent for cleanup.
 */
export function createRemoveNodeHandler(service: IKnowledgeGraphService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as { nodeId: string; reason: string };
      // Store the reason in context metadata (the deleteNode service method
      // handles the soft-delete; reason is captured in the operation log)
      const result = await service.deleteNode(
        userId as UserId,
        body.nodeId as NodeId,
        { ...context, reason: body.reason } as IExecutionContext & { reason: string }
      );
      return {
        success: true,
        data: { deleted: true, nodeId: body.nodeId, reason: body.reason },
        agentHints: result.agentHints,
      };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * remove-edge — Remove an edge between two nodes.
 * P1 tool used by Knowledge Graph Agent for structural corrections.
 */
export function createRemoveEdgeHandler(service: IKnowledgeGraphService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as { edgeId: string; reason: string };
      const result = await service.deleteEdge(userId as UserId, body.edgeId as EdgeId, {
        ...context,
        reason: body.reason,
      } as IExecutionContext & { reason: string });
      return {
        success: true,
        data: { deleted: true, edgeId: body.edgeId, reason: body.reason },
        agentHints: result.agentHints,
      };
    } catch (error) {
      return errorResult(error);
    }
  };
}

// ============================================================================
// Task 2: CKG Tool Handlers
// ============================================================================

/**
 * get-canonical-structure — Retrieve the CKG structure for a domain or concept area.
 * P0 tool used by agents comparing user PKG against canonical structure.
 */
export function createGetCanonicalStructureHandler(service: IKnowledgeGraphService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as {
        domain?: string;
        rootNodeId?: string;
        maxDepth?: number;
      };

      if (body.rootNodeId !== undefined && body.rootNodeId !== '') {
        // Subgraph from a specific CKG node
        const ckgTraversal = TraversalOptions.create({
          maxDepth: body.maxDepth ?? 3,
          direction: 'outbound',
          includeProperties: true,
        });
        const result = await service.getCkgSubgraph(
          body.rootNodeId as NodeId,
          ckgTraversal,
          context
        );
        return { success: true, data: result.data, agentHints: result.agentHints };
      }

      // List CKG nodes filtered by domain
      const nodeFilter = NodeFilter.create(
        body.domain !== undefined ? { domain: body.domain } : {}
      );
      const result = await service.listCkgNodes(nodeFilter, { limit: 100, offset: 0 }, context);
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * propose-mutation — Propose a structural change to the CKG via the mutation pipeline.
 * P0 tool used by Knowledge Graph Agent and aggregation pipeline.
 */
export function createProposeMutationHandler(service: IKnowledgeGraphService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as IMutationProposal;
      const result = await service.proposeMutation(body, context);
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * get-mutation-status — Check the current status of a CKG mutation.
 * P1 tool used by agents polling for mutation completion.
 */
export function createGetMutationStatusHandler(service: IKnowledgeGraphService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as { mutationId: string };
      const result = await service.getMutation(body.mutationId as MutationId, context);
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

// ============================================================================
// Task 3: Structural Analysis Tool Handlers
// ============================================================================

/**
 * compute-structural-metrics — Trigger computation of all 11 structural metrics.
 * P0 tool used by Diagnostic Agent for periodic health checks.
 */
export function createComputeStructuralMetricsHandler(service: IKnowledgeGraphService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as { domain: string };
      const result = await service.computeMetrics(userId as UserId, body.domain, context);
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * get-structural-health — Get a high-level structural health report.
 * P0 tool used by Strategy Agent for remediation decisions.
 */
export function createGetStructuralHealthHandler(service: IKnowledgeGraphService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as { domain: string };
      const result = await service.getStructuralHealth(userId as UserId, body.domain, context);
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * detect-misconceptions — Run the misconception detection engine against a user's PKG.
 * P0 tool used by Diagnostic Agent for misconception analysis.
 */
export function createDetectMisconceptionsHandler(service: IKnowledgeGraphService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as { domain?: string };
      // If domain is provided, run detection for that domain; otherwise
      // getMisconceptions returns all active misconceptions across domains.
      if (body.domain !== undefined && body.domain !== '') {
        const result = await service.detectMisconceptions(userId as UserId, body.domain, context);
        return { success: true, data: result.data, agentHints: result.agentHints };
      }
      const result = await service.getMisconceptions(userId as UserId, undefined, context);
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * suggest-intervention — Given a detected misconception, suggest the most
 * appropriate intervention strategy. Composes misconception data with
 * metacognitive stage to rank interventions.
 * P1 tool used by Socratic Tutor Agent and Content Generation Agent.
 */
export function createSuggestInterventionHandler(service: IKnowledgeGraphService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as {
        misconceptionType: string;
        affectedNodeIds: string[];
        domain?: string;
      };

      // Compose: get misconceptions + metacognitive stage in parallel
      const [misconceptionsResult, stageResult] = await Promise.all([
        service.getMisconceptions(userId as UserId, body.domain, context),
        body.domain !== undefined && body.domain !== ''
          ? service.getMetacognitiveStage(userId as UserId, body.domain, context)
          : Promise.resolve(null),
      ]);

      // Filter misconceptions matching the requested type and affected nodes
      const affectedSet = new Set(body.affectedNodeIds);
      const matchingMisconceptions = misconceptionsResult.data.filter(
        (m) =>
          m.misconceptionType === body.misconceptionType &&
          m.affectedNodeIds.some((id: string) => affectedSet.has(id))
      );

      return {
        success: true,
        data: {
          misconceptions: matchingMisconceptions,
          metacognitiveStage: stageResult?.data ?? null,
          interventionContext: {
            misconceptionType: body.misconceptionType,
            affectedNodeIds: body.affectedNodeIds,
            matchCount: matchingMisconceptions.length,
          },
        },
        agentHints: {
          ...misconceptionsResult.agentHints,
          suggestedNextActions: [
            ...misconceptionsResult.agentHints.suggestedNextActions,
            ...(stageResult?.agentHints.suggestedNextActions ?? []),
          ],
          reasoning:
            `Found ${String(matchingMisconceptions.length)} matching misconception(s) of type "${body.misconceptionType}". ` +
            (stageResult !== null
              ? `User is at metacognitive stage: ${stageResult.data.currentStage}. Adapt intervention framing accordingly.`
              : 'No metacognitive stage available — use default intervention framing.'),
        },
      };
    } catch (error) {
      return errorResult(error);
    }
  };
}

// ============================================================================
// Task 4: Metacognitive Tool Handlers
// ============================================================================

/**
 * get-metacognitive-stage — Determine the user's current metacognitive stage
 * for a domain.
 * P0 tool used by any agent adapting behavior based on metacognitive maturity.
 */
export function createGetMetacognitiveStageHandler(service: IKnowledgeGraphService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as { domain: string };
      const result = await service.getMetacognitiveStage(userId as UserId, body.domain, context);
      return { success: true, data: result.data, agentHints: result.agentHints };
    } catch (error) {
      return errorResult(error);
    }
  };
}

/**
 * get-learning-path-context — Comprehensive context dump for agents planning
 * learning activities. Combines structural metrics, misconceptions,
 * metacognitive stage, and graph topology into a single rich response.
 * P0 "one call to rule them all" tool used by Strategy Agent and Learning Agent.
 */
export function createGetLearningPathContextHandler(service: IKnowledgeGraphService) {
  return async (input: unknown, userId: string, correlationId: string): Promise<IToolResult> => {
    try {
      const context = buildContext(userId, correlationId);
      const body = input as {
        domain: string;
        focusNodeId?: string;
      };

      // Build traversal options for focus subgraph
      const focusTraversal = TraversalOptions.create({
        maxDepth: 3,
        direction: 'outbound',
        includeProperties: true,
      });

      // Run all context-gathering calls in parallel for efficiency
      const [metricsResult, misconceptionsResult, stageResult, healthResult, subgraphResult] =
        await Promise.all([
          service.getMetrics(userId as UserId, body.domain, context),
          service.getMisconceptions(userId as UserId, body.domain, context),
          service.getMetacognitiveStage(userId as UserId, body.domain, context),
          service.getStructuralHealth(userId as UserId, body.domain, context),
          body.focusNodeId !== undefined
            ? service.getSubgraph(
                userId as UserId,
                body.focusNodeId as NodeId,
                focusTraversal,
                context
              )
            : Promise.resolve(null),
        ]);

      // Merge all agent hints
      const allHints = [
        metricsResult.agentHints,
        misconceptionsResult.agentHints,
        stageResult.agentHints,
        healthResult.agentHints,
        ...(subgraphResult ? [subgraphResult.agentHints] : []),
      ];

      const mergedSuggestedActions = allHints.flatMap((h) => h.suggestedNextActions);

      return {
        success: true,
        data: {
          structuralMetrics: metricsResult.data,
          misconceptions: misconceptionsResult.data,
          metacognitiveStage: stageResult.data,
          structuralHealth: healthResult.data,
          focusSubgraph: subgraphResult?.data ?? null,
        },
        agentHints: {
          suggestedNextActions: mergedSuggestedActions,
          relatedResources: allHints.flatMap((h) => h.relatedResources),
          confidence: Math.min(...allHints.map((h) => h.confidence)),
          sourceQuality: 'high',
          validityPeriod: 'short',
          contextNeeded: allHints.flatMap((h) => h.contextNeeded),
          assumptions: allHints.flatMap((h) => h.assumptions),
          riskFactors: allHints.flatMap((h) => h.riskFactors),
          dependencies: allHints.flatMap((h) => h.dependencies),
          estimatedImpact: {
            benefit: Math.max(...allHints.map((h) => h.estimatedImpact.benefit)),
            effort: Math.max(...allHints.map((h) => h.estimatedImpact.effort)),
            roi: Math.max(...allHints.map((h) => h.estimatedImpact.roi)),
          },
          preferenceAlignment: allHints.flatMap((h) => h.preferenceAlignment),
          reasoning:
            `Comprehensive learning context for domain "${body.domain}". ` +
            `Metacognitive stage: ${stageResult.data.currentStage}. ` +
            `Active misconceptions: ${String(misconceptionsResult.data.length)}. ` +
            (body.focusNodeId !== undefined
              ? `Focus subgraph anchored at node ${body.focusNodeId}.`
              : 'No focus node — full domain context returned.'),
        },
      };
    } catch (error) {
      return errorResult(error);
    }
  };
}

// ============================================================================
// Tool Definitions (for registration / discovery)
// ============================================================================

const KG_TOOL_DEFINITIONS_BASE: IBaseToolDefinition[] = [
  // ──────────────────────────── Task 1: PKG tools ────────────────────────────
  {
    name: 'get-concept-node',
    description:
      "Retrieve a single concept node from a user's Personal Knowledge Graph (PKG) with full details. " +
      'Returns the node data plus agent hints about its neighborhood (connected nodes, edge count, centrality). ' +
      'Use this tool when you need the current state of a specific concept before making decisions about it.',
    service: 'knowledge-graph-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['nodeId'],
      properties: {
        nodeId: { type: 'string', description: 'The ID of the concept node to retrieve' },
      },
    },
  },
  {
    name: 'get-subgraph',
    description:
      "Retrieve a subgraph centered on a node within a configurable depth limit from a user's PKG. " +
      'Returns ISubgraph (nodes + edges) plus hints about the subgraph structure (density, hub nodes, leaf nodes). ' +
      "Use this tool when you need context about a concept's neighborhood to plan learning activities.",
    service: 'knowledge-graph-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['rootNodeId'],
      properties: {
        rootNodeId: { type: 'string', description: 'Root node ID for subgraph extraction' },
        maxDepth: { type: 'number', description: 'Maximum traversal depth (default: 3)' },
        edgeTypeFilter: {
          type: 'array',
          items: { type: 'string' },
          description: 'Only include edges of these types (optional — all types if omitted)',
        },
        direction: {
          type: 'string',
          enum: ['inbound', 'outbound', 'both'],
          description: 'Traversal direction (default: outbound)',
        },
      },
    },
  },
  {
    name: 'find-prerequisites',
    description:
      'Specialized traversal that follows only prerequisite edges to find all prerequisites of a concept, ' +
      'returned as a topologically-sorted layered structure. Includes hints about prerequisite chain quality ' +
      '(gaps, extremely long chains). Use this tool to verify that a user has the prerequisites before scheduling a new topic.',
    service: 'knowledge-graph-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['nodeId', 'domain'],
      properties: {
        nodeId: { type: 'string', description: 'Target concept node ID' },
        domain: {
          type: 'string',
          description: 'Knowledge domain for prerequisite chain resolution',
        },
        maxDepth: { type: 'number', description: 'Maximum prerequisite chain depth (default: 5)' },
      },
    },
  },
  {
    name: 'find-related-concepts',
    description:
      "Find concepts related to a given concept via any edge type in a user's PKG, ranked by relevance. " +
      'Returns related nodes grouped by connecting edge type with hints about cluster membership and ' +
      'potential missing connections. Use this tool to find related concepts for creating linking exercises.',
    service: 'knowledge-graph-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['nodeId'],
      properties: {
        nodeId: { type: 'string', description: 'Anchor concept node ID' },
        limit: { type: 'number', description: 'Maximum number of related concepts (default: 10)' },
      },
    },
  },
  {
    name: 'add-concept-node',
    description:
      "Add a new concept node to a user's PKG. Returns the created node plus hints about duplicate risk " +
      '(similar labels in the same domain) and suggested edges to existing concepts. ' +
      'Use this tool when creating graph structure from newly ingested content.',
    service: 'knowledge-graph-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['label', 'nodeType', 'domain'],
      properties: {
        label: { type: 'string', description: 'Human-readable concept label' },
        nodeType: {
          type: 'string',
          description: 'Node type discriminator (concept, topic, skill, etc.)',
        },
        domain: {
          type: 'string',
          description: 'Knowledge domain (e.g., "mathematics", "biology")',
        },
        description: { type: 'string', description: 'Optional description of the concept' },
        properties: { type: 'object', description: 'Optional additional properties' },
      },
    },
  },
  {
    name: 'add-edge',
    description:
      "Add an edge between two nodes in a user's PKG with full EDGE_TYPE_POLICIES validation. " +
      'Returns the created edge plus hints about structural impact (connectivity changes, new clusters, ' +
      'prerequisite chain extensions). Use this tool when building structure after analyzing user study patterns.',
    service: 'knowledge-graph-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['sourceNodeId', 'targetNodeId', 'edgeType'],
      properties: {
        sourceNodeId: { type: 'string', description: 'Source node ID' },
        targetNodeId: { type: 'string', description: 'Target node ID' },
        edgeType: {
          type: 'string',
          description: 'Edge type (prerequisite, related_to, part_of, etc.)',
        },
        weight: { type: 'number', description: 'Optional edge weight (0-1)' },
        skipAcyclicityCheck: {
          type: 'boolean',
          description:
            'Skip cycle detection (default: false). Use only when certain no cycle exists.',
        },
      },
    },
  },
  {
    name: 'update-mastery',
    description:
      "Update the mastery level of a specific node in the user's PKG. Returns the updated node plus " +
      'hints about mastery progression trend and related nodes that might also need mastery updates. ' +
      'Use this tool after spaced repetition review, quiz results, or calibration updates.',
    service: 'knowledge-graph-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['nodeId', 'masteryLevel', 'source'],
      properties: {
        nodeId: { type: 'string', description: 'Node ID to update mastery for' },
        masteryLevel: {
          type: 'number',
          description: 'New mastery level (0.0 to 1.0)',
        },
        source: {
          type: 'string',
          description:
            'Evidence source for this mastery update (e.g., "session_performance", "quiz_result", "calibration_update")',
        },
      },
    },
  },
  {
    name: 'remove-node',
    description:
      "Soft-delete a node from the user's PKG. Returns confirmation plus hints about orphaned edges and " +
      'connected nodes that may now be disconnected. Use this tool for cleaning up deprecated or merged concepts.',
    service: 'knowledge-graph-service',
    priority: 'P1',
    inputSchema: {
      type: 'object',
      required: ['nodeId', 'reason'],
      properties: {
        nodeId: { type: 'string', description: 'Node ID to remove' },
        reason: { type: 'string', description: 'Why the node is being removed (audit trail)' },
      },
    },
  },
  {
    name: 'remove-edge',
    description:
      "Remove an edge between two nodes in a user's PKG. Returns confirmation plus hints about " +
      'connectivity changes (e.g., did removing this edge disconnect a subgraph?). ' +
      'Use this tool for correcting structural errors.',
    service: 'knowledge-graph-service',
    priority: 'P1',
    inputSchema: {
      type: 'object',
      required: ['edgeId', 'reason'],
      properties: {
        edgeId: { type: 'string', description: 'Edge ID to remove' },
        reason: { type: 'string', description: 'Why the edge is being removed (audit trail)' },
      },
    },
  },
  // ──────────────────────────── Task 2: CKG tools ────────────────────────────
  {
    name: 'get-canonical-structure',
    description:
      'Retrieve the Canonical Knowledge Graph (CKG) structure for a domain or concept area. ' +
      "Returns the CKG subgraph plus hints about how many users' PKGs align with this structure and " +
      "areas of high divergence. Use this tool when comparing a user's PKG against the canonical reference.",
    service: 'knowledge-graph-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Knowledge domain to retrieve CKG for' },
        rootNodeId: { type: 'string', description: 'Optional root node to start subgraph from' },
        maxDepth: { type: 'number', description: 'Maximum subgraph depth (default: 3)' },
      },
    },
  },
  {
    name: 'propose-mutation',
    description:
      'Propose a structural change to the CKG via the mutation pipeline. Accepts an array of DSL operations ' +
      '(add_node, remove_node, update_node, add_edge, remove_edge, merge_nodes, split_node) with a rationale. ' +
      'Returns the mutationId and initial PROPOSED state. The mutation progresses through the validation ' +
      'pipeline asynchronously. Use this tool for proposing structural improvements to the canonical graph.',
    service: 'knowledge-graph-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['operations', 'rationale'],
      properties: {
        operations: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of CKG mutation DSL operations (1-50 operations)',
        },
        rationale: {
          type: 'string',
          description: 'Human-readable justification for the mutation',
        },
        evidenceCount: {
          type: 'number',
          description:
            'Evidence count from PKG aggregation pipeline (triggers evidence sufficiency validation)',
        },
        priority: {
          type: 'number',
          description: 'Processing priority 0-100 (higher = processed sooner)',
        },
      },
    },
  },
  {
    name: 'get-mutation-status',
    description:
      'Check the current status of a CKG mutation. Returns the full mutation state, validation results, ' +
      'and audit trail, plus hints about pipeline throughput and expected resolution time. ' +
      'Use this tool when polling for mutation completion.',
    service: 'knowledge-graph-service',
    priority: 'P1',
    inputSchema: {
      type: 'object',
      required: ['mutationId'],
      properties: {
        mutationId: { type: 'string', description: 'Mutation ID to check' },
      },
    },
  },
  // ────────────────────── Task 3: Structural analysis tools ──────────────────
  {
    name: 'compute-structural-metrics',
    description:
      'Trigger computation of all 11 structural metrics (AD, DCG, SLI, SCE, ULS, TBS, SDF, SSE, SAA, etc.) ' +
      "for a user's PKG in a domain. Returns the full IStructuralMetrics snapshot with comparison to " +
      'previous snapshot (delta) and hints about which metrics need attention. ' +
      'Use this tool for periodic structural health checks. Note: this triggers a full recomputation (expensive).',
    service: 'knowledge-graph-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['domain'],
      properties: {
        domain: { type: 'string', description: 'Knowledge domain to compute metrics for' },
      },
    },
  },
  {
    name: 'get-structural-health',
    description:
      'Get a high-level structural health report combining the latest metrics with interpretive analysis. ' +
      'Returns overall health score (composite), per-metric status (healthy/warning/critical), trend direction ' +
      '(improving/stable/declining), and specific recommendations. ' +
      'Use this tool to decide whether to focus on structural remediation vs. new content.',
    service: 'knowledge-graph-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['domain'],
      properties: {
        domain: { type: 'string', description: 'Knowledge domain to assess health for' },
      },
    },
  },
  {
    name: 'detect-misconceptions',
    description:
      "Run the misconception detection engine against a user's PKG. Returns detected misconceptions with " +
      'type, confidence, affected nodes, suggested interventions, and priority hints (which misconception ' +
      'to address first based on impact). If domain is omitted, returns all active misconceptions across all domains.',
    service: 'knowledge-graph-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'Optional domain filter (all domains if omitted)',
        },
      },
    },
  },
  {
    name: 'suggest-intervention',
    description:
      'Given a detected misconception type and affected node IDs, suggest the most appropriate intervention ' +
      "strategy. Combines misconception data with the user's metacognitive stage to provide intervention " +
      'context. Returns matching misconceptions, metacognitive stage, and intervention context. ' +
      'Use this tool when choosing how to address a misconception.',
    service: 'knowledge-graph-service',
    priority: 'P1',
    inputSchema: {
      type: 'object',
      required: ['misconceptionType', 'affectedNodeIds'],
      properties: {
        misconceptionType: {
          type: 'string',
          description: 'Type of the misconception to address',
        },
        affectedNodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Node IDs affected by the misconception',
        },
        domain: {
          type: 'string',
          description: 'Optional domain to scope the metacognitive stage lookup',
        },
      },
    },
  },
  // ────────────────────── Task 4: Metacognitive tools ────────────────────────
  {
    name: 'get-metacognitive-stage',
    description:
      "Determine the user's current metacognitive stage for a domain. Returns the MetacognitiveStage, " +
      'evidence supporting the assessment, proximity to next stage transition, and hints about what the ' +
      'user needs to demonstrate for progression. ' +
      "Use this tool when adapting agent behavior based on the user's metacognitive maturity.",
    service: 'knowledge-graph-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['domain'],
      properties: {
        domain: {
          type: 'string',
          description: 'Knowledge domain to assess metacognitive stage for',
        },
      },
    },
  },
  {
    name: 'get-learning-path-context',
    description:
      'Comprehensive context dump that combines structural metrics, misconceptions, metacognitive stage, ' +
      'structural health, and graph topology into a single rich response. This is the "one call to rule them all" ' +
      'tool that saves agents from making 5+ separate tool calls. Optionally anchors a subgraph around a focus node. ' +
      'Use this tool when planning a full learning session — it gives you everything you need in one call.',
    service: 'knowledge-graph-service',
    priority: 'P0',
    inputSchema: {
      type: 'object',
      required: ['domain'],
      properties: {
        domain: {
          type: 'string',
          description: 'Knowledge domain to get full context for',
        },
        focusNodeId: {
          type: 'string',
          description:
            'Optional focus concept node ID — if provided, includes a subgraph centered on this node',
        },
      },
    },
  },
];

export const KG_TOOL_DEFINITIONS: IToolDefinition[] =
  KG_TOOL_DEFINITIONS_BASE.map(withContractDefaults);
