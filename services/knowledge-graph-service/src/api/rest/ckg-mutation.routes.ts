/**
 * @noema/knowledge-graph-service - CKG Mutation Routes
 *
 * Fastify route definitions for CKG mutation pipeline operations:
 * propose, list, get, cancel, retry, approve, reject, and audit log retrieval.
 *
 * Write operations (propose, cancel, retry) require admin/agent/service role.
 * Read operations require standard authentication.
 *
 * Prefix: /api/v1/ckg/mutations
 */

import type { MutationId, MutationState } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import type {
  CkgMutationOperation,
  IMutationFilter,
} from '../../domain/knowledge-graph-service/ckg-mutation-dsl.js';
import type { IKnowledgeGraphService } from '../../domain/knowledge-graph-service/knowledge-graph.service.js';
import {
  getOntologyImportReviewHints,
  getOntologyImportMutationContext,
  groupMutationsByOntologyImportRun,
} from '../../application/knowledge-graph/ontology-imports/mutation-generation/index.js';
import type { IOntologyImportBulkReviewResult } from '../../application/knowledge-graph/ontology-imports/review-workflows/index.js';
import { OntologyImportReviewWorkflowService as OntologyImportReviewWorkflowServiceImpl } from '../../application/knowledge-graph/ontology-imports/review-workflows/index.js';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import {
  ApproveMutationRequestSchema,
  BulkReviewMutationRequestSchema,
  MutationQueryParamsSchema,
  ProposeMutationRequestSchema,
  RecoverMutationRequestSchema,
  RejectMutationRequestSchema,
  RequestRevisionRequestSchema,
  ResubmitMutationRequestSchema,
} from '../schemas/ckg-mutation.schemas.js';
import {
  type IRouteOptions,
  MutationIdParamSchema,
  assertAdminOrAgent,
  attachStartTimeHook,
  buildContext,
  handleError,
  wrapResponse,
} from '../shared/route-helpers.js';

// ============================================================================
// Route Plugin
// ============================================================================

/**
 * Register CKG mutation routes.
 * Prefix: /api/v1/ckg/mutations
 */
export function registerCkgMutationRoutes(
  fastify: FastifyInstance,
  service: IKnowledgeGraphService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>,
  options?: IRouteOptions
): void {
  attachStartTimeHook(fastify);
  const reviewWorkflowService = new OntologyImportReviewWorkflowServiceImpl(service);

  const writeRouteConfig = options?.rateLimit
    ? { rateLimit: { max: options.rateLimit.writeMax, timeWindow: options.rateLimit.timeWindow } }
    : {};

  // ============================================================================
  // POST /api/v1/ckg/mutations — Propose a new CKG mutation
  // ============================================================================

  fastify.post<{ Body: unknown }>(
    '/api/v1/ckg/mutations',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['CKG Mutations'],
        summary: 'Propose a new CKG mutation',
        description:
          'Submit a proposal to mutate the Canonical Knowledge Graph. ' +
          'Requires admin/agent/service role. The mutation enters the typestate ' +
          'pipeline (PROPOSED → VALIDATED → PROVEN → COMMITTED or REJECTED).',
        body: {
          type: 'object',
          required: ['operations', 'rationale'],
          properties: {
            operations: {
              type: 'array',
              minItems: 1,
              maxItems: 50,
              items: { type: 'object' },
            },
            rationale: { type: 'string', minLength: 1, maxLength: 2000 },
            evidence: {
              type: 'object',
              properties: {
                aggregationId: { type: 'string' },
                sourceType: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);

        const parsed = ProposeMutationRequestSchema.parse(request.body);
        const context = buildContext(request);

        // Map API proposal → domain IMutationProposal
        const proposal = {
          operations: parsed.operations,
          rationale: parsed.rationale,
          evidenceCount: parsed.evidence !== undefined ? 1 : 0,
          priority: 0,
        };

        const result = await service.proposeMutation(proposal, context);
        reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // GET /api/v1/ckg/mutations — List CKG mutations
  // ============================================================================

  fastify.get<{ Querystring: Record<string, unknown> }>(
    '/api/v1/ckg/mutations',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['CKG Mutations'],
        summary: 'List CKG mutations',
        description: 'List CKG mutations with optional state and proposer filters.',
        querystring: {
          type: 'object',
          properties: {
            state: { type: 'string' },
            proposedBy: { type: 'string' },
            importRunId: { type: 'string' },
            includeImportRunAggregation: { type: 'boolean' },
            page: { type: 'number' },
            pageSize: { type: 'number', minimum: 1, maximum: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const query = MutationQueryParamsSchema.parse(request.query);
        const context = buildContext(request);

        const filter: IMutationFilter = {
          state: query.state as MutationState | undefined,
          proposedBy: query.proposedBy,
        };

        const result = await service.listMutations(filter, context);
        const filteredMutations =
          query.importRunId === undefined
            ? result.data
            : result.data.filter((mutation) => {
                const ontologyImportContext = getOntologyImportMutationContext(mutation);
                return ontologyImportContext.runId === query.importRunId;
              });
        const sortedMutations =
          query.includeImportRunAggregation || query.importRunId !== undefined
            ? [...filteredMutations].sort((left, right) => {
                const leftContext = getOntologyImportMutationContext(left);
                const rightContext = getOntologyImportMutationContext(right);
                const leftRunId = leftContext.runId ?? 'zzzz';
                const rightRunId = rightContext.runId ?? 'zzzz';
                if (leftRunId !== rightRunId) {
                  return leftRunId.localeCompare(rightRunId);
                }
                return left.createdAt.localeCompare(right.createdAt);
              })
            : filteredMutations;
        const responseMutations = sortedMutations.map((mutation) => ({
          ...mutation,
          ontologyImportContext: getOntologyImportMutationContext(mutation),
          reviewHints: getOntologyImportReviewHints(mutation),
        }));

        // Apply pagination at the API layer
        const { page, pageSize } = query;
        const start = (page - 1) * pageSize;
        const paginatedData = responseMutations.slice(start, start + pageSize);
        const additionalMetadata =
          query.includeImportRunAggregation || query.importRunId !== undefined
            ? {
                importRunGroups: groupMutationsByOntologyImportRun(sortedMutations).map(
                  (group) => ({
                    runId: group.runId,
                    sourceId: group.sourceId,
                    mutationCount: group.mutationCount,
                  })
                ),
              }
            : undefined;

        reply.send(
          wrapResponse(
            paginatedData,
            result.agentHints,
            request,
            {
              page,
              pageSize,
              total: responseMutations.length,
            },
            additionalMetadata
          )
        );
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  fastify.post<{ Body: unknown }>(
    '/api/v1/ckg/mutations/review/bulk',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['CKG Mutations'],
        summary: 'Bulk review ontology-import mutation proposals',
        description:
          'Approve, reject, or request revision for a selected ontology-import mutation set, ' +
          'either by explicit mutation ids or by import-run scope.',
        body: {
          type: 'object',
          required: ['action', 'note'],
          properties: {
            action: { type: 'string', enum: ['approve', 'reject', 'request_revision'] },
            mutationIds: {
              type: 'array',
              minItems: 1,
              maxItems: 200,
              items: { type: 'string' },
            },
            importRunId: { type: 'string' },
            note: { type: 'string', minLength: 1, maxLength: 4000 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const parsed = BulkReviewMutationRequestSchema.parse(request.body);
        const context = buildContext(request);
        const result = await reviewWorkflowService.executeBulkReview(
          {
            action: parsed.action,
            ...(parsed.mutationIds !== undefined
              ? { mutationIds: parsed.mutationIds as MutationId[] }
              : {}),
            ...(parsed.importRunId !== undefined ? { importRunId: parsed.importRunId } : {}),
            note: parsed.note,
          },
          context
        );
        reply.send(wrapResponse<IOntologyImportBulkReviewResult>(result, undefined, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // GET /api/v1/ckg/mutations/health — Get mutation pipeline health
  // ============================================================================

  fastify.get(
    '/api/v1/ckg/mutations/health',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['CKG Mutations'],
        summary: 'Get mutation pipeline health',
        description:
          'Return per-state counts for the CKG mutation pipeline, ' +
          'including a count of stuck mutations that may need attention.',
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const context = buildContext(request);

        const result = await service.getMutationPipelineHealth(context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // GET /api/v1/ckg/mutations/:mutationId — Get a CKG mutation
  // ============================================================================

  fastify.get<{ Params: { mutationId: string } }>(
    '/api/v1/ckg/mutations/:mutationId',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['CKG Mutations'],
        summary: 'Get a CKG mutation by ID',
        params: {
          type: 'object',
          required: ['mutationId'],
          properties: {
            mutationId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { mutationId } = MutationIdParamSchema.parse(request.params);
        const context = buildContext(request);

        const result = await service.getMutation(mutationId as MutationId, context);
        reply.send(
          wrapResponse(
            {
              ...result.data,
              ontologyImportContext: getOntologyImportMutationContext(result.data),
              reviewHints: getOntologyImportReviewHints(result.data),
            },
            result.agentHints,
            request
          )
        );
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // GET /api/v1/ckg/mutations/:mutationId/audit-log — Get audit log
  // ============================================================================

  fastify.get<{ Params: { mutationId: string } }>(
    '/api/v1/ckg/mutations/:mutationId/audit-log',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['CKG Mutations'],
        summary: 'Get the audit log for a CKG mutation',
        description: 'Return the full audit trail of state transitions for a mutation.',
        params: {
          type: 'object',
          required: ['mutationId'],
          properties: {
            mutationId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { mutationId } = MutationIdParamSchema.parse(request.params);
        const context = buildContext(request);

        const result = await service.getMutationAuditLog(mutationId as MutationId, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // POST /api/v1/ckg/mutations/:mutationId/cancel — Cancel a mutation
  // ============================================================================

  fastify.post<{ Params: { mutationId: string } }>(
    '/api/v1/ckg/mutations/:mutationId/cancel',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['CKG Mutations'],
        summary: 'Cancel a CKG mutation',
        description:
          'Cancel a mutation in PROPOSED or VALIDATING state. ' +
          'Transitions to REJECTED with "cancelled by proposer" reason.',
        params: {
          type: 'object',
          required: ['mutationId'],
          properties: {
            mutationId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const { mutationId } = MutationIdParamSchema.parse(request.params);
        const context = buildContext(request);

        const result = await service.cancelMutation(mutationId as MutationId, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // POST /api/v1/ckg/mutations/:mutationId/retry — Retry a rejected mutation
  // ============================================================================

  fastify.post<{ Params: { mutationId: string } }>(
    '/api/v1/ckg/mutations/:mutationId/retry',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['CKG Mutations'],
        summary: 'Retry a rejected CKG mutation',
        description:
          'Create a new mutation with the same operations as a REJECTED mutation. ' +
          'The original mutation remains REJECTED for audit purposes.',
        params: {
          type: 'object',
          required: ['mutationId'],
          properties: {
            mutationId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const { mutationId } = MutationIdParamSchema.parse(request.params);
        const context = buildContext(request);

        const result = await service.retryMutation(mutationId as MutationId, context);
        reply.status(201).send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // POST /api/v1/ckg/mutations/:mutationId/approve — Approve an escalated mutation (Phase 8e)
  // ============================================================================

  fastify.post<{ Params: { mutationId: string }; Body: unknown }>(
    '/api/v1/ckg/mutations/:mutationId/reconcile',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['CKG Mutations'],
        summary: 'Manually reconcile a stuck COMMITTING mutation',
        description:
          'Force a COMMITTING mutation to COMMITTED when an operator has verified that the graph write already landed.',
        params: {
          type: 'object',
          required: ['mutationId'],
          properties: {
            mutationId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['reason'],
          properties: {
            reason: { type: 'string', minLength: 1, maxLength: 2000 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const { mutationId } = MutationIdParamSchema.parse(request.params);
        const parsed = RecoverMutationRequestSchema.parse(request.body);
        const context = buildContext(request);

        const result = await service.reconcileMutationCommit(
          mutationId as MutationId,
          parsed.reason,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  fastify.get<{ Params: { mutationId: string } }>(
    '/api/v1/ckg/mutations/:mutationId/check-safe-retry',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['CKG Mutations'],
        summary: 'Check whether a stuck mutation is safe to reject and retry',
        description:
          'Inspect canonical graph state and report whether the mutation payload appears not to have landed.',
        params: {
          type: 'object',
          required: ['mutationId'],
          properties: {
            mutationId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const { mutationId } = MutationIdParamSchema.parse(request.params);
        const context = buildContext(request);

        const result = await service.checkMutationSafeRetry(mutationId as MutationId, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  fastify.get<{ Params: { mutationId: string } }>(
    '/api/v1/ckg/mutations/:mutationId/check-reconcile',
    {
      preHandler: authMiddleware,
      schema: {
        tags: ['CKG Mutations'],
        summary: 'Check whether a stuck COMMITTING mutation is ready to reconcile',
        description:
          'Inspect canonical graph state and report whether the graph write appears to have landed while Postgres state remains stuck.',
        params: {
          type: 'object',
          required: ['mutationId'],
          properties: {
            mutationId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const { mutationId } = MutationIdParamSchema.parse(request.params);
        const context = buildContext(request);

        const result = await service.checkMutationReconcileCommit(
          mutationId as MutationId,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  fastify.post<{ Params: { mutationId: string }; Body: unknown }>(
    '/api/v1/ckg/mutations/:mutationId/recover-reject',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['CKG Mutations'],
        summary: 'Manually reject a stuck mutation',
        description:
          'Force a stuck non-terminal mutation to REJECTED so it can be retried safely.',
        params: {
          type: 'object',
          required: ['mutationId'],
          properties: {
            mutationId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['reason'],
          properties: {
            reason: { type: 'string', minLength: 1, maxLength: 2000 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const { mutationId } = MutationIdParamSchema.parse(request.params);
        const parsed = RecoverMutationRequestSchema.parse(request.body);
        const context = buildContext(request);

        const result = await service.rejectStuckMutation(
          mutationId as MutationId,
          parsed.reason,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  fastify.post<{ Params: { mutationId: string }; Body: unknown }>(
    '/api/v1/ckg/mutations/:mutationId/approve',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['CKG Mutations'],
        summary: 'Approve an escalated CKG mutation',
        description:
          'Approve a mutation in PENDING_REVIEW state, overriding ontological ' +
          'conflict warnings. The mutation resumes its pipeline and proceeds ' +
          'through PROVEN → COMMITTED. Requires admin/agent role.',
        params: {
          type: 'object',
          required: ['mutationId'],
          properties: {
            mutationId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['reason'],
          properties: {
            reason: { type: 'string', minLength: 1, maxLength: 2000 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const { mutationId } = MutationIdParamSchema.parse(request.params);
        const parsed = ApproveMutationRequestSchema.parse(request.body);
        const context = buildContext(request);

        const result = await service.approveEscalatedMutation(
          mutationId as MutationId,
          parsed.reason,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // POST /api/v1/ckg/mutations/:mutationId/reject — Reject an escalated mutation (Phase 8e)
  // ============================================================================

  fastify.post<{ Params: { mutationId: string }; Body: unknown }>(
    '/api/v1/ckg/mutations/:mutationId/reject',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['CKG Mutations'],
        summary: 'Reject an escalated CKG mutation',
        description:
          'Reject a mutation in PENDING_REVIEW state, confirming ontological ' +
          'conflicts. The mutation transitions to REJECTED. Requires admin/agent role.',
        params: {
          type: 'object',
          required: ['mutationId'],
          properties: {
            mutationId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['reason'],
          properties: {
            reason: { type: 'string', minLength: 1, maxLength: 2000 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const { mutationId } = MutationIdParamSchema.parse(request.params);
        const parsed = RejectMutationRequestSchema.parse(request.body);
        const context = buildContext(request);

        const result = await service.rejectEscalatedMutation(
          mutationId as MutationId,
          parsed.reason,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // POST /api/v1/ckg/mutations/:mutationId/request-revision — Request revision (Phase 6)
  // ============================================================================

  fastify.post<{ Params: { mutationId: string }; Body: unknown }>(
    '/api/v1/ckg/mutations/:mutationId/request-revision',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['CKG Mutations'],
        summary: 'Request revision of an escalated CKG mutation',
        description:
          'Request changes to a mutation in PENDING_REVIEW state. The mutation ' +
          'transitions to REVISION_REQUESTED and awaits resubmission. Requires admin/agent role.',
        params: {
          type: 'object',
          required: ['mutationId'],
          properties: {
            mutationId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['feedback'],
          properties: {
            feedback: { type: 'string', minLength: 1, maxLength: 4000 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const { mutationId } = MutationIdParamSchema.parse(request.params);
        const parsed = RequestRevisionRequestSchema.parse(request.body);
        const context = buildContext(request);

        const result = await service.requestMutationRevision(
          mutationId as MutationId,
          parsed.feedback,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  // ============================================================================
  // PATCH /api/v1/ckg/mutations/:mutationId — Resubmit a revised mutation (Phase 6)
  // ============================================================================

  fastify.patch<{ Params: { mutationId: string }; Body: unknown }>(
    '/api/v1/ckg/mutations/:mutationId',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['CKG Mutations'],
        summary: 'Resubmit a CKG mutation after revision',
        description:
          'Resubmit a mutation in REVISION_REQUESTED state with updated operations. ' +
          'The mutation re-enters the pipeline from PROPOSED. Requires admin/agent role.',
        params: {
          type: 'object',
          required: ['mutationId'],
          properties: {
            mutationId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['operations'],
          properties: {
            operations: { type: 'array', minItems: 1, maxItems: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        assertAdminOrAgent(request);
        const { mutationId } = MutationIdParamSchema.parse(request.params);
        const parsed = ResubmitMutationRequestSchema.parse(request.body);
        const context = buildContext(request);

        const result = await service.resubmitMutation(
          mutationId as MutationId,
          parsed.operations as CkgMutationOperation[],
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
