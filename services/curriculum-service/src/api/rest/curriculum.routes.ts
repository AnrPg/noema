import {
  ApplyRevisionProposalInputSchema,
  CreateCurriculumInputSchema,
  DecideRevisionChangeInputSchema,
  FreezeNodeInputSchema,
  RecordCurriculumEvaluationInputSchema,
  RecordRealignmentEvidenceInputSchema,
  SessionSliceRequestSchema,
} from '@noema/validation';
import type { FastifyInstance } from 'fastify';
import type {
  CurriculumId,
  CurriculumOriginMode,
  RevisionChangeId,
  RevisionProposalId,
  SessionId,
  UserId,
} from '@noema/types';
import type { CurriculumService } from '../../domain/curriculum-service/curriculum.service.js';
import { createAuthMiddleware } from '../../middleware/auth.middleware.js';

export function registerCurriculumRoutes(
  fastify: FastifyInstance,
  curriculumService: CurriculumService
): void {
  const readAuth = createAuthMiddleware('curriculum:read');
  const writeAuth = createAuthMiddleware('curriculum:write');
  const agentAuth = createAuthMiddleware('curriculum:agent');

  fastify.get('/v1/curricula', { preHandler: readAuth }, async (request, reply) => {
    const userId = request.user?.sub as UserId;
    await reply.send({ data: await curriculumService.listCurricula(userId) });
  });

  fastify.post('/v1/curricula', { preHandler: writeAuth }, async (request, reply) => {
    const userId = request.user?.sub as UserId;
    const input = CreateCurriculumInputSchema.parse(request.body);
    const curriculum = await curriculumService.createCurriculum(userId, {
      ...input,
      originMode: input.originMode as CurriculumOriginMode | undefined,
    });
    await reply.status(201).send({ data: curriculum });
  });

  fastify.get('/v1/curricula/:id', { preHandler: readAuth }, async (request, reply) => {
    const userId = request.user?.sub as UserId;
    const { id } = request.params as { id: CurriculumId };
    const curriculum = await curriculumService.getCurriculum(userId, id);
    if (curriculum === undefined) {
      await reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Curriculum not found' } });
      return;
    }
    await reply.send({ data: curriculum });
  });

  fastify.get('/v1/curricula/:id/frontier', { preHandler: readAuth }, async (request, reply) => {
    const userId = request.user?.sub as UserId;
    const { id } = request.params as { id: CurriculumId };
    await reply.send({ data: await curriculumService.getFrontier(userId, id) });
  });

  fastify.get(
    '/v1/curricula/:id/active-version',
    { preHandler: readAuth },
    async (request, reply) => {
      const userId = request.user?.sub as UserId;
      const { id } = request.params as { id: CurriculumId };
      const activeVersion = await curriculumService.getActiveVersion(userId, id);
      if (activeVersion === undefined) {
        await reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Active curriculum version not found' } });
        return;
      }
      await reply.send({ data: activeVersion });
    }
  );

  fastify.get('/v1/curricula/:id/progress', { preHandler: readAuth }, async (request, reply) => {
    const userId = request.user?.sub as UserId;
    const { id } = request.params as { id: CurriculumId };
    await reply.send({ data: await curriculumService.listProgress(userId, id) });
  });

  fastify.post(
    '/v1/curricula/:id/progress/evaluations',
    { preHandler: agentAuth },
    async (request, reply) => {
      const userId = request.user?.sub as UserId;
      const { id } = request.params as { id: CurriculumId };
      const body = RecordCurriculumEvaluationInputSchema.parse(request.body);
      await reply.send({
        data: await curriculumService.recordEvaluation(userId, id, {
          ...body,
          sessionId: body.sessionId as SessionId,
        }),
      });
    }
  );

  fastify.post(
    '/v1/curricula/:id/session-slice',
    { preHandler: writeAuth },
    async (request, reply) => {
      const userId = request.user?.sub as UserId;
      const { id } = request.params as { id: CurriculumId };
      const body = SessionSliceRequestSchema.parse(request.body ?? {});
      await reply.send({ data: await curriculumService.getSessionSlice(userId, id, body) });
    }
  );

  fastify.get(
    '/v1/curricula/:id/revision-proposals',
    { preHandler: readAuth },
    async (request, reply) => {
      const userId = request.user?.sub as UserId;
      const { id } = request.params as { id: CurriculumId };
      await reply.send({ data: await curriculumService.listRevisionProposals(userId, id) });
    }
  );

  fastify.patch(
    '/v1/curricula/:id/revision-proposals/:proposalId/changes/:changeId',
    { preHandler: writeAuth },
    async (request, reply) => {
      const userId = request.user?.sub as UserId;
      const { id, proposalId, changeId } = request.params as {
        id: CurriculumId;
        proposalId: RevisionProposalId;
        changeId: RevisionChangeId;
      };
      const body = DecideRevisionChangeInputSchema.parse(request.body);
      await reply.send({
        data: await curriculumService.decideRevisionChange({
          userId,
          curriculumId: id,
          proposalId,
          changeId,
          state: body.state,
        }),
      });
    }
  );

  fastify.post(
    '/v1/curricula/:id/revision-proposals/:proposalId/apply',
    { preHandler: writeAuth },
    async (request, reply) => {
      const userId = request.user?.sub as UserId;
      const { id, proposalId } = request.params as {
        id: CurriculumId;
        proposalId: RevisionProposalId;
      };
      const body = ApplyRevisionProposalInputSchema.parse(request.body ?? {});
      const applyInput: Parameters<CurriculumService['applyRevisionProposal']>[0] = {
        userId,
        curriculumId: id,
        proposalId,
      };
      if (body.guardianValidationId !== undefined) {
        applyInput.guardianValidationId = body.guardianValidationId;
      }
      await reply.send({ data: await curriculumService.applyRevisionProposal(applyInput) });
    }
  );

  fastify.post(
    '/v1/curricula/:id/freeze-node',
    { preHandler: writeAuth },
    async (request, reply) => {
      const userId = request.user?.sub as UserId;
      const { id } = request.params as { id: CurriculumId };
      const body = FreezeNodeInputSchema.parse(request.body);
      await curriculumService.freezeNode(userId, id, body.stableNodeKey);
      await reply.status(204).send();
    }
  );

  fastify.post(
    '/v1/curricula/:id/unfreeze-node',
    { preHandler: writeAuth },
    async (request, reply) => {
      const userId = request.user?.sub as UserId;
      const { id } = request.params as { id: CurriculumId };
      const body = FreezeNodeInputSchema.parse(request.body);
      await curriculumService.unfreezeNode(userId, id, body.stableNodeKey);
      await reply.status(204).send();
    }
  );

  fastify.get(
    '/v1/curricula/:id/realignment-evidence',
    { preHandler: readAuth },
    async (request, reply) => {
      const userId = request.user?.sub as UserId;
      const { id } = request.params as { id: CurriculumId };
      await reply.send({ data: await curriculumService.listRealignmentEvidence(userId, id) });
    }
  );

  fastify.post(
    '/v1/curricula/:id/realignment-evidence',
    { preHandler: agentAuth },
    async (request, reply) => {
      const userId = request.user?.sub as UserId;
      const { id } = request.params as { id: CurriculumId };
      const body = RecordRealignmentEvidenceInputSchema.parse(request.body);
      await reply.status(202).send({
        data: await curriculumService.recordRealignmentEvidence(userId, id, {
          ...body,
          sessionId: body.sessionId as SessionId,
        }),
      });
    }
  );
}
