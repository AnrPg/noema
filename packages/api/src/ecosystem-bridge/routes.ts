// =============================================================================
// ECOSYSTEM BRIDGE ROUTES
// =============================================================================
// API endpoints for the EcosystemBridge service

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { getEcosystemBridge } from "./index.js";

// =============================================================================
// SCHEMAS
// =============================================================================

const syncCategorySchema = z.object({
  categoryId: z.string(),
});

const syncCategoryRelationSchema = z.object({
  categoryRelationId: z.string(),
});

const syncParticipationSchema = z.object({
  participationId: z.string(),
});

const contextReviewSchema = z.object({
  cardId: z.string(),
  categoryId: z.string(),
  rating: z.number().min(1).max(4),
  responseTimeMs: z.number().min(0),
  contextSuccessRate: z.number().min(0).max(1),
  contextMasteryScore: z.number().min(0).max(1),
  reviewCountInContext: z.number().min(0),
});

const decisionContextSchema = z.object({
  activeCategoryId: z.string().optional(),
  filterToActiveCategory: z.boolean().optional(),
  emphasisMultiplier: z.number().min(0.1).max(5).optional(),
  deEmphasisMultiplier: z.number().min(0.1).max(5).optional(),
});

const masteryProjectionSchema = z.object({
  participationId: z.string(),
  cardId: z.string(),
  categoryId: z.string(),
});

// =============================================================================
// ROUTES
// =============================================================================

export async function ecosystemBridgeRoutes(app: FastifyInstance) {
  const bridge = getEcosystemBridge();

  // ---------------------------------------------------------------------------
  // SYNC OPERATIONS
  // ---------------------------------------------------------------------------

  /**
   * Sync a single category to LKGC
   */
  app.post(
    "/ecosystem-bridge/sync/category",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { categoryId } = syncCategorySchema.parse(request.body);
      const userId = (request as any).userId;

      // Get category details
      const { prisma } = await import("../config/database.js");
      const category = await prisma.category.findFirst({
        where: { id: categoryId, userId },
      });

      if (!category) {
        return reply.status(404).send({ error: "Category not found" });
      }

      const result = await bridge.syncCategoryToLkgcNode({
        categoryId: category.id,
        userId,
        name: category.name,
        description: category.description || undefined,
        framingQuestion: category.framingQuestion || undefined,
      });

      return reply.send(result);
    },
  );

  /**
   * Sync a single category relation to LKGC
   */
  app.post(
    "/ecosystem-bridge/sync/category-relation",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { categoryRelationId } = syncCategoryRelationSchema.parse(
        request.body,
      );
      const userId = (request as any).userId;

      const { prisma } = await import("../config/database.js");
      const relation = await prisma.categoryRelation.findFirst({
        where: { id: categoryRelationId, userId },
      });

      if (!relation) {
        return reply.status(404).send({ error: "Category relation not found" });
      }

      const result = await bridge.syncCategoryRelationToLkgcEdge({
        categoryRelationId: relation.id,
        userId,
        sourceCategoryId: relation.sourceCategoryId,
        targetCategoryId: relation.targetCategoryId,
        relationType: relation.relationType,
        strength: relation.strength,
        isUserConfirmed: relation.isUserConfirmed,
        isAutoSuggested: relation.isAutoSuggested,
      });

      return reply.send(result);
    },
  );

  /**
   * Sync a single card category participation to LKGC
   */
  app.post(
    "/ecosystem-bridge/sync/participation",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { participationId } = syncParticipationSchema.parse(request.body);
      const userId = (request as any).userId;

      const { prisma } = await import("../config/database.js");
      const participation = await prisma.cardCategoryParticipation.findFirst({
        where: {
          id: participationId,
          category: { userId },
        },
        include: {
          category: { select: { userId: true } },
        },
      });

      if (!participation) {
        return reply.status(404).send({ error: "Participation not found" });
      }

      const result = await bridge.syncParticipationToLkgcEdge({
        participationId: participation.id,
        userId,
        cardId: participation.cardId,
        categoryId: participation.categoryId,
        semanticRole: participation.semanticRole,
        isPrimary: participation.isPrimary,
      });

      return reply.send(result);
    },
  );

  // ---------------------------------------------------------------------------
  // BATCH SYNC OPERATIONS
  // ---------------------------------------------------------------------------

  /**
   * Sync all categories for the current user
   */
  app.post(
    "/ecosystem-bridge/sync/all-categories",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).userId;
      const result = await bridge.syncAllCategories(userId);
      return reply.send(result);
    },
  );

  /**
   * Sync all category relations for the current user
   */
  app.post(
    "/ecosystem-bridge/sync/all-relations",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).userId;
      const result = await bridge.syncAllCategoryRelations(userId);
      return reply.send(result);
    },
  );

  /**
   * Sync all participations for the current user
   */
  app.post(
    "/ecosystem-bridge/sync/all-participations",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).userId;
      const result = await bridge.syncAllParticipations(userId);
      return reply.send(result);
    },
  );

  /**
   * Full sync: categories, relations, and participations
   */
  app.post(
    "/ecosystem-bridge/sync/full",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).userId;

      const [categoriesResult, relationsResult, participationsResult] =
        await Promise.all([
          bridge.syncAllCategories(userId),
          bridge.syncAllCategoryRelations(userId),
          bridge.syncAllParticipations(userId),
        ]);

      return reply.send({
        success:
          categoriesResult.success &&
          relationsResult.success &&
          participationsResult.success,
        categories: categoriesResult,
        relations: relationsResult,
        participations: participationsResult,
      });
    },
  );

  // ---------------------------------------------------------------------------
  // CONTEXT REVIEW EVENT
  // ---------------------------------------------------------------------------

  /**
   * Emit a context-aware review event to LKGC
   */
  app.post(
    "/ecosystem-bridge/review/context",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = contextReviewSchema.parse(request.body);
      const userId = (request as any).userId;

      const result = await bridge.emitContextReviewEvent({
        ...data,
        userId,
      });

      return reply.send(result);
    },
  );

  // ---------------------------------------------------------------------------
  // MASTERY PROJECTION
  // ---------------------------------------------------------------------------

  /**
   * Project LKGC mastery to a participation
   */
  app.post(
    "/ecosystem-bridge/mastery/project",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = masteryProjectionSchema.parse(request.body);
      const userId = (request as any).userId;

      const result = await bridge.projectMasteryToParticipation({
        ...data,
        userId,
      });

      return reply.send(result);
    },
  );

  // ---------------------------------------------------------------------------
  // DECISION ENGINE CONTEXT
  // ---------------------------------------------------------------------------

  /**
   * Build active lens context for decision engine
   */
  app.post(
    "/ecosystem-bridge/decision/context",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = decisionContextSchema.parse(request.body);
      const userId = (request as any).userId;

      const result = await bridge.buildDecisionEngineContext({
        ...data,
        userId,
      });

      return reply.send(result);
    },
  );

  // ---------------------------------------------------------------------------
  // STATISTICS
  // ---------------------------------------------------------------------------

  /**
   * Get bridge statistics for the current user
   */
  app.get(
    "/ecosystem-bridge/statistics",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).userId;
      const stats = await bridge.getStatistics(userId);
      return reply.send(stats);
    },
  );
}

export default ecosystemBridgeRoutes;
