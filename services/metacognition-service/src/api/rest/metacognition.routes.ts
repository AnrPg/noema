import { createEmptyAgentHints, type IApiResponse } from '@noema/contracts';
import { StudyMode, type ConceptId, type CorrelationId, type UserId } from '@noema/types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  EvaluationConflictError,
  MetacognitionError,
  ValidationError,
} from '../../domain/metacognition-service/index.js';
import type { MetacognitionService } from '../../domain/metacognition-service/index.js';
import type { createAuthMiddleware } from '../../middleware/auth.middleware.js';

interface IConceptIdParams {
  conceptId: string;
}

interface IReasoningAverageQuery {
  studyMode?: StudyMode;
}

export function registerMetacognitionRoutes(
  fastify: FastifyInstance,
  metacognitionService: MetacognitionService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>
): void {
  function buildMetadata(request: FastifyRequest): IApiResponse<unknown>['metadata'] {
    return {
      requestId: request.id,
      timestamp: new Date().toISOString(),
      serviceName: 'metacognition-service',
      serviceVersion: '0.1.0',
      executionTime: 0,
    };
  }

  function buildContext(request: FastifyRequest): { userId: UserId; correlationId: CorrelationId } {
    const user = request.user as { sub?: string } | undefined;
    return {
      userId: (user?.sub ?? request.headers['x-user-id'] ?? 'anonymous') as UserId,
      correlationId:
        request.id.length > 0
          ? (request.id as CorrelationId)
          : (`correlation_${String(Date.now())}` as CorrelationId),
    };
  }

  function wrapResponse<T>(data: T, request: FastifyRequest): IApiResponse<T> {
    return {
      data,
      agentHints: createEmptyAgentHints(),
      metadata: buildMetadata(request),
    };
  }

  function handleError(error: unknown, request: FastifyRequest, reply: FastifyReply): void {
    const metadata = buildMetadata(request);
    if (error instanceof ValidationError) {
      reply.status(400).send({
        error: { code: error.code, message: error.message, details: error.details },
        metadata,
      });
      return;
    }
    if (error instanceof EvaluationConflictError) {
      reply.status(409).send({ error: { code: error.code, message: error.message }, metadata });
      return;
    }
    if (error instanceof MetacognitionError) {
      reply.status(422).send({
        error: { code: error.code, message: error.message, details: error.details },
        metadata,
      });
      return;
    }
    fastify.log.error(error);
    reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      metadata,
    });
  }

  fastify.post<{ Body: unknown }>(
    '/v1/evaluations',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const result = await metacognitionService.recordEvaluation(
          request.body,
          buildContext(request)
        );
        reply.status(201).send(wrapResponse(result, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );

  fastify.get<{ Params: IConceptIdParams; Querystring: IReasoningAverageQuery }>(
    '/v1/concepts/:conceptId/reasoning-average',
    { preHandler: authMiddleware },
    async (request, reply) => {
      try {
        const context = buildContext(request);
        const result = await metacognitionService.getReasoningAverage(
          context.userId,
          request.params.conceptId as ConceptId,
          request.query.studyMode ?? StudyMode.KNOWLEDGE_GAINING
        );
        if (result === null) {
          reply.status(404).send({
            error: {
              code: 'REASONING_AVERAGE_NOT_FOUND',
              message: 'No reasoning average for concept',
            },
            metadata: buildMetadata(request),
          });
          return;
        }
        reply.send(wrapResponse(result, request));
      } catch (error) {
        handleError(error, request, reply);
      }
    }
  );
}
