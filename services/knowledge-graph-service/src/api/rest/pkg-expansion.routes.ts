import type { UserId } from '@noema/types';
import type { FastifyInstance } from 'fastify';
import type { PkgExpansionApplicationService } from '../../application/knowledge-graph/pkg-expansion/service.js';
import type { createAuthMiddleware } from '../middleware/auth.middleware.js';
import {
  ApplyGraphAgentProposalSelectionRequestSchema,
  ApplyPkgExpansionSelectionRequestSchema,
  PkgExpansionRequestSchema,
} from '../schemas/pkg-expansion.schemas.js';
import {
  type IRouteOptions,
  UserIdParamSchema,
  assertUserAccess,
  attachStartTimeHook,
  buildContext,
  handleError,
  wrapResponse,
} from '../shared/route-helpers.js';

export function registerPkgExpansionRoutes(
  fastify: FastifyInstance,
  expansionService: PkgExpansionApplicationService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>,
  options?: IRouteOptions
): void {
  attachStartTimeHook(fastify);

  const writeRouteConfig = options?.rateLimit
    ? { rateLimit: { max: options.rateLimit.writeMax, timeWindow: options.rateLimit.timeWindow } }
    : {};

  fastify.post<{ Params: { userId: string }; Body: unknown }>(
    '/api/v1/users/:userId/pkg/expansion/proposals',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['PKG Expansion'],
        summary: 'Generate PKG expansion proposals',
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['scope'],
          properties: {
            scope: {
              type: 'object',
              required: ['scopeType'],
              properties: {
                scopeType: { type: 'string', enum: ['whole_pkg', 'node', 'domain'] },
                nodeIds: { type: 'array', items: { type: 'string' } },
                domain: { type: 'string' },
              },
            },
            studyMode: { type: 'string', enum: ['knowledge_gaining', 'language_learning'] },
            limit: { type: 'number', minimum: 1, maximum: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId } = UserIdParamSchema.parse(request.params);
        assertUserAccess(request, userId);
        const input = PkgExpansionRequestSchema.parse(request.body);
        const context = buildContext(request);
        const result = await expansionService.preview(userId as UserId, input, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  fastify.post<{ Params: { userId: string }; Body: unknown }>(
    '/api/v1/users/:userId/pkg/agent-proposals/apply',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['PKG Expansion'],
        summary: 'Apply approved graph-agent proposals',
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['selectedProposalIds', 'proposals'],
          properties: {
            selectedProposalIds: { type: 'array', items: { type: 'string' } },
            proposals: { type: 'array', items: { type: 'object' } },
            forwardCanonical: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId } = UserIdParamSchema.parse(request.params);
        assertUserAccess(request, userId);
        const input = ApplyGraphAgentProposalSelectionRequestSchema.parse(request.body);
        const context = buildContext(request);
        const result = await expansionService.applyGraphAgentProposals(
          userId as UserId,
          input,
          context
        );
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );

  fastify.post<{ Params: { userId: string }; Body: unknown }>(
    '/api/v1/users/:userId/pkg/expansion/apply',
    {
      preHandler: authMiddleware,
      config: writeRouteConfig,
      schema: {
        tags: ['PKG Expansion'],
        summary: 'Apply selected PKG expansion proposals',
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['scope', 'selectedProposalIds', 'proposals'],
          properties: {
            scope: {
              type: 'object',
              required: ['scopeType'],
              properties: {
                scopeType: { type: 'string', enum: ['whole_pkg', 'node', 'domain'] },
                nodeIds: { type: 'array', items: { type: 'string' } },
                domain: { type: 'string' },
              },
            },
            selectedProposalIds: { type: 'array', items: { type: 'string' } },
            proposals: { type: 'array', items: { type: 'object' } },
            forwardCanonical: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId } = UserIdParamSchema.parse(request.params);
        assertUserAccess(request, userId);
        const input = ApplyPkgExpansionSelectionRequestSchema.parse(request.body);
        const context = buildContext(request);
        const result = await expansionService.apply(userId as UserId, input, context);
        reply.send(wrapResponse(result.data, result.agentHints, request));
      } catch (error) {
        handleError(error, request, reply, fastify.log);
      }
    }
  );
}
