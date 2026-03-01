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
import type { IMutationFilter } from '../../domain/knowledge-graph-service/ckg-mutation-dsl.js';
import type { IKnowledgeGraphService } from '../../domain/knowledge-graph-service/knowledge-graph.service.js';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import {
  ApproveMutationRequestSchema,
  MutationQueryParamsSchema,
  ProposeMutationRequestSchema,
  RejectMutationRequestSchema,
} from '../schemas/ckg-mutation.schemas.js';
import {
  type IRouteOptions,
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
          evidenceCount: 0,
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
            page: { type: 'number' },
            pageSize: { type: 'number' },
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
        reply.send(wrapResponse(result.data, result.agentHints, request));
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
        const { mutationId } = request.params;
        const context = buildContext(request);

        const result = await service.getMutation(mutationId as MutationId, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
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
        const { mutationId } = request.params;
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
        const { mutationId } = request.params;
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
        const { mutationId } = request.params;
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
        const { mutationId } = request.params;
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
        const { mutationId } = request.params;
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
}
