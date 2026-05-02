import {
  CreateIngestionJobInputSchema,
  DocumentIdSchema,
  DocumentUploadInputSchema,
  IngestionJobIdSchema,
  IngestionJobStageSchema,
  RetrievalQueryInputSchema,
} from '@noema/validation';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type {
  DocumentId,
  IngestionIntent,
  IngestionJobId,
  IngestionJobStage,
  UserId,
} from '@noema/types';
import type { IDocumentUploadInputDto, IRetrievalQueryInputDto } from '@noema/contracts';
import type { IngestionService } from '../../domain/ingestion-service/ingestion.service.js';
import { createAuthMiddleware } from '../../middleware/auth.middleware.js';

export function registerIngestionRoutes(
  fastify: FastifyInstance,
  ingestionService: IngestionService
): void {
  const readAuth = createAuthMiddleware('ingestion:read');
  const writeAuth = createAuthMiddleware('ingestion:write');
  const agentAuth = createAuthMiddleware('ingestion:agent');

  fastify.post('/v1/documents', { preHandler: writeAuth }, async (request, reply) => {
    const input = DocumentUploadInputSchema.parse(request.body);
    await reply.status(201).send({
      data: await ingestionService.uploadDocument(
        input as IDocumentUploadInputDto,
        contextFromRequest(request)
      ),
    });
  });

  fastify.get('/v1/documents', { preHandler: readAuth }, async (request, reply) => {
    await reply.send({ data: await ingestionService.listDocuments(contextFromRequest(request)) });
  });

  fastify.get('/v1/documents/:id', { preHandler: readAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const detail = await ingestionService.getDocument(
      DocumentIdSchema.parse(id) as DocumentId,
      contextFromRequest(request)
    );
    if (detail === undefined) {
      await reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
      return;
    }
    await reply.send({ data: detail });
  });

  fastify.delete('/v1/documents/:id', { preHandler: writeAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await ingestionService.deleteDocument(
      DocumentIdSchema.parse(id) as DocumentId,
      contextFromRequest(request)
    );
    await reply.status(204).send();
  });

  fastify.post('/v1/ingestion/jobs', { preHandler: writeAuth }, async (request, reply) => {
    const input = CreateIngestionJobInputSchema.parse(request.body);
    await reply.status(201).send({
      data: await ingestionService.createJob(
        { documentId: input.documentId as DocumentId, intent: input.intent as IngestionIntent },
        contextFromRequest(request)
      ),
    });
  });

  fastify.get('/v1/ingestion/jobs', { preHandler: readAuth }, async (request, reply) => {
    const query = request.query as { documentId?: string; stage?: string };
    const documentId =
      query.documentId !== undefined
        ? (DocumentIdSchema.parse(query.documentId) as DocumentId)
        : undefined;
    const stage =
      query.stage !== undefined
        ? (IngestionJobStageSchema.parse(query.stage) as IngestionJobStage)
        : undefined;
    await reply.send({
      data: await ingestionService.listJobs(contextFromRequest(request), documentId, stage),
    });
  });

  fastify.post('/v1/ingestion/jobs/:id/run', { preHandler: agentAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await reply.status(202).send({
      data: await ingestionService.runJob(
        IngestionJobIdSchema.parse(id) as IngestionJobId,
        contextFromRequest(request)
      ),
    });
  });

  fastify.post(
    '/v1/ingestion/jobs/:id/retry',
    { preHandler: writeAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await reply.status(202).send({
        data: await ingestionService.retryJob(
          IngestionJobIdSchema.parse(id) as IngestionJobId,
          contextFromRequest(request)
        ),
      });
    }
  );

  fastify.post(
    '/v1/ingestion/jobs/:id/cancel',
    { preHandler: writeAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await reply.send({
        data: await ingestionService.cancelJob(
          IngestionJobIdSchema.parse(id) as IngestionJobId,
          contextFromRequest(request)
        ),
      });
    }
  );

  fastify.post('/v1/retrieval/query', { preHandler: readAuth }, async (request, reply) => {
    const input = RetrievalQueryInputSchema.parse(request.body);
    await reply.send({
      data: await ingestionService.retrievalQuery(
        input as IRetrievalQueryInputDto,
        contextFromRequest(request)
      ),
    });
  });
}

function contextFromRequest(request: FastifyRequest): {
  userId: UserId | null;
  correlationId: never;
  roles: string[];
} {
  return {
    userId: (request.user?.sub ?? null) as UserId | null,
    correlationId: `cor_${'0'.repeat(21)}` as never,
    roles: request.user?.scopes ?? [],
  };
}
