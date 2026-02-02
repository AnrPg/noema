/**
 * Bridge Card Routes
 *
 * Enterprise-grade API endpoints for bridge cards that connect concepts across contexts.
 * Bridge cards are special review items that strengthen connections between
 * related concepts appearing in different categories/contexts.
 *
 * Key features:
 * 1. Create bridge cards manually or from synthesis responses
 * 2. AI-powered bridge card suggestions with confidence scoring
 * 3. Frequency-controlled appearance in reviews
 * 4. Bidirectional connections with reverse questions
 * 5. Effectiveness tracking via connection strength
 * 6. Context-specific surfacing triggers
 * 7. Full provenance tracking
 *
 * Schema Alignment:
 * - BridgeCard uses sourceCardId/targetCardId and sourceCategoryId/targetCategoryId
 * - Card uses userId (not ownerId) and content JSON (not front/back)
 * - Connection tracking via connectionStrength field
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { redis } from "../config/redis.js";
import { authenticate } from "../middleware/auth.js";

// ==============================================================================
// VALIDATION SCHEMAS - Aligned with Prisma Schema
// ==============================================================================

const BridgeTypeEnum = z.enum([
  "concept_to_concept",
  "context_to_context",
  "concept_context",
]);

const ConnectionTypeEnum = z.enum([
  "relates_to",
  "contrasts_with",
  "generalizes",
  "specializes",
  "enables",
  "depends_on",
  "transforms_into",
]);

const SurfaceTriggerEnum = z.enum([
  "related_card_review",
  "context_switch",
  "scheduled",
  "synthesis_session",
]);

const BridgeStatusEnum = z.enum(["draft", "active", "suspended", "archived"]);

const SuggestionStatusEnum = z.enum([
  "pending",
  "accepted",
  "rejected",
  "deferred",
]);

const SuggestionSourceEnum = z.enum([
  "performance_analysis",
  "semantic_similarity",
  "co_occurrence",
  "user_behavior",
]);

// Schema for creating a bridge card - aligned with Prisma BridgeCard model
const CreateBridgeCardSchema = z.object({
  // The main card this bridge is associated with
  cardId: z.string(),

  // Bridge type
  bridgeType: BridgeTypeEnum,

  // Source and target connections
  sourceCardId: z.string().optional(),
  sourceCategoryId: z.string().optional(),
  targetCardId: z.string().optional(),
  targetCategoryId: z.string().optional(),

  // Bridge content
  bridgeQuestion: z.string().min(5).max(500),
  bridgeAnswer: z.string().min(5).max(2000),

  // Bidirectional support
  isBidirectional: z.boolean().default(true),
  reverseQuestion: z.string().max(500).optional(),
  reverseAnswer: z.string().max(2000).optional(),

  // Connection metadata
  connectionType: ConnectionTypeEnum.default("relates_to"),
  connectionStrength: z.number().min(0).max(1).default(0.5),
  connectionDescription: z.string().max(1000).optional(),

  // Review behavior
  frequencyMultiplier: z.number().min(0).max(2).default(0.5),
  surfaceTrigger: SurfaceTriggerEnum.default("related_card_review"),
  minGapReviews: z.number().int().min(0).max(100).default(3),

  // Provenance
  createdFrom: z
    .enum(["manual", "synthesis_prompt", "ai_suggestion", "import"])
    .default("manual"),
  sourceId: z.string().optional(),

  // Status
  status: BridgeStatusEnum.default("active"),
});

// Schema for updating a bridge card
const UpdateBridgeCardSchema = z.object({
  bridgeQuestion: z.string().min(5).max(500).optional(),
  bridgeAnswer: z.string().min(5).max(2000).optional(),
  isBidirectional: z.boolean().optional(),
  reverseQuestion: z.string().max(500).optional().nullable(),
  reverseAnswer: z.string().max(2000).optional().nullable(),
  connectionType: ConnectionTypeEnum.optional(),
  connectionStrength: z.number().min(0).max(1).optional(),
  connectionDescription: z.string().max(1000).optional().nullable(),
  frequencyMultiplier: z.number().min(0).max(2).optional(),
  surfaceTrigger: SurfaceTriggerEnum.optional(),
  minGapReviews: z.number().int().min(0).max(100).optional(),
  status: BridgeStatusEnum.optional(),
  isUserConfirmed: z.boolean().optional(),
});

// Schema for recording a bridge card traversal/review
const RecordBridgeTraversalSchema = z.object({
  direction: z.enum(["forward", "reverse"]).default("forward"),
  reviewedInContext: z.string().optional(),
  wasHelpful: z.boolean().optional(),
  responseTimeMs: z.number().int().min(0).max(300000).optional(),
  feedback: z
    .object({
      rating: z.number().int().min(1).max(5).optional(),
      comment: z.string().max(500).optional(),
      suggestionForImprovement: z.string().max(500).optional(),
    })
    .optional(),
});

// Schema for creating a bridge card suggestion
const CreateSuggestionSchema = z.object({
  bridgeType: BridgeTypeEnum,
  sourceCardId: z.string().optional(),
  sourceCategoryId: z.string().optional(),
  targetCardId: z.string().optional(),
  targetCategoryId: z.string().optional(),
  suggestedQuestion: z.string().min(5).max(500),
  suggestedAnswer: z.string().min(5).max(2000),
  connectionType: ConnectionTypeEnum,
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(1000),
  suggestionSource: SuggestionSourceEnum,
  suggestionDetails: z.record(z.unknown()).optional(),
});

// Schema for responding to a suggestion
const RespondToSuggestionSchema = z.object({
  action: z.enum(["accept", "reject", "defer", "modify_accept"]),
  rejectionReason: z.string().max(500).optional(),
  deferUntil: z.coerce.date().optional(),
  modifications: z
    .object({
      bridgeQuestion: z.string().min(5).max(500).optional(),
      bridgeAnswer: z.string().min(5).max(2000).optional(),
      connectionType: ConnectionTypeEnum.optional(),
    })
    .optional(),
});

// Query schemas
const PaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const BridgeCardQuerySchema = PaginationSchema.extend({
  cardId: z.string().optional(),
  bridgeType: BridgeTypeEnum.optional(),
  connectionType: ConnectionTypeEnum.optional(),
  status: BridgeStatusEnum.optional(),
  sourceCategoryId: z.string().optional(),
  targetCategoryId: z.string().optional(),
  minConnectionStrength: z.coerce.number().min(0).max(1).optional(),
  searchTerm: z.string().max(100).optional(),
  includeAiSuggested: z.coerce.boolean().optional(),
  sortBy: z
    .enum(["createdAt", "connectionStrength", "frequencyMultiplier"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const SuggestionQuerySchema = PaginationSchema.extend({
  status: SuggestionStatusEnum.optional(),
  sourceCardId: z.string().optional(),
  targetCardId: z.string().optional(),
  sourceCategoryId: z.string().optional(),
  targetCategoryId: z.string().optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  suggestionSource: SuggestionSourceEnum.optional(),
});

// ==============================================================================
// TYPES
// ==============================================================================

interface CacheKeys {
  userBridgeCards: (userId: string) => string;
  cardBridgeCards: (cardId: string) => string;
  categoryBridgeCards: (categoryId: string) => string;
  userSuggestions: (userId: string) => string;
  bridgeCardStats: (bridgeCardId: string) => string;
  reviewQueue: (userId: string) => string;
}

interface CacheTTL {
  BRIDGE_CARDS: number;
  SUGGESTIONS: number;
  STATS: number;
  QUEUE: number;
}

interface BridgeCardWithRelations {
  id: string;
  userId: string;
  cardId: string;
  bridgeType: string;
  bridgeQuestion: string;
  bridgeAnswer: string;
  connectionType: string;
  connectionStrength: number;
  sourceCardId: string | null;
  targetCardId: string | null;
  sourceCategoryId: string | null;
  targetCategoryId: string | null;
  card: {
    id: string;
    content: Prisma.JsonValue;
  };
  sourceCard?: {
    id: string;
    content: Prisma.JsonValue;
  } | null;
  targetCard?: {
    id: string;
    content: Prisma.JsonValue;
  } | null;
  sourceCategory?: {
    id: string;
    name: string;
    iconEmoji: string | null;
    color: string | null;
  } | null;
  targetCategory?: {
    id: string;
    name: string;
    iconEmoji: string | null;
    color: string | null;
  } | null;
}

// ==============================================================================
// BRIDGE CARD ROUTES
// ==============================================================================

const bridgeCardRoutes: FastifyPluginAsync = async (fastify) => {
  const log = fastify.log;

  // Cache key generators
  const cacheKeys: CacheKeys = {
    userBridgeCards: (userId: string) => `bridge:cards:user:${userId}`,
    cardBridgeCards: (cardId: string) => `bridge:cards:card:${cardId}`,
    categoryBridgeCards: (categoryId: string) =>
      `bridge:cards:category:${categoryId}`,
    userSuggestions: (userId: string) => `bridge:suggestions:user:${userId}`,
    bridgeCardStats: (bridgeCardId: string) => `bridge:stats:${bridgeCardId}`,
    reviewQueue: (userId: string) => `bridge:queue:${userId}`,
  };

  // Cache TTLs (in seconds)
  const CACHE_TTL: CacheTTL = {
    BRIDGE_CARDS: 600, // 10 minutes
    SUGGESTIONS: 300, // 5 minutes
    STATS: 1800, // 30 minutes
    QUEUE: 180, // 3 minutes
  };

  // ===========================================================================
  // HELPER FUNCTIONS
  // ===========================================================================

  /**
   * Invalidate related caches when bridge card data changes
   */
  async function invalidateBridgeCache(params: {
    userId?: string;
    cardId?: string;
    categoryIds?: string[];
    bridgeCardId?: string;
  }): Promise<void> {
    if (!redis) return;

    const keysToDelete: string[] = [];

    if (params.userId) {
      keysToDelete.push(
        cacheKeys.userBridgeCards(params.userId),
        cacheKeys.userSuggestions(params.userId),
        cacheKeys.reviewQueue(params.userId),
      );
    }

    if (params.cardId) {
      keysToDelete.push(cacheKeys.cardBridgeCards(params.cardId));
    }

    if (params.categoryIds) {
      for (const categoryId of params.categoryIds) {
        keysToDelete.push(cacheKeys.categoryBridgeCards(categoryId));
      }
    }

    if (params.bridgeCardId) {
      keysToDelete.push(cacheKeys.bridgeCardStats(params.bridgeCardId));
    }

    if (keysToDelete.length > 0) {
      await redis.del(keysToDelete);
    }
  }

  /**
   * Extract card content summary for API responses
   */
  function extractCardSummary(content: Prisma.JsonValue): {
    front: string;
    back?: string;
  } {
    if (!content || typeof content !== "object") {
      return { front: "[No content]" };
    }

    const contentObj = content as Record<string, unknown>;

    // Handle different card content formats
    if (typeof contentObj.front === "string") {
      return {
        front: contentObj.front,
        back: typeof contentObj.back === "string" ? contentObj.back : undefined,
      };
    }

    if (typeof contentObj.question === "string") {
      return {
        front: contentObj.question,
        back:
          typeof contentObj.answer === "string" ? contentObj.answer : undefined,
      };
    }

    if (typeof contentObj.text === "string") {
      return { front: contentObj.text };
    }

    // Fallback: stringify first few properties
    const keys = Object.keys(contentObj).slice(0, 2);
    return {
      front: keys.map((k) => String(contentObj[k]).slice(0, 100)).join(" | "),
    };
  }

  /**
   * Build the standard include object for bridge card queries
   */
  function buildBridgeCardInclude() {
    return {
      card: {
        select: { id: true, content: true },
      },
      sourceCard: {
        select: { id: true, content: true },
      },
      targetCard: {
        select: { id: true, content: true },
      },
      sourceCategory: {
        select: { id: true, name: true, iconEmoji: true, color: true },
      },
      targetCategory: {
        select: { id: true, name: true, iconEmoji: true, color: true },
      },
      user: {
        select: { id: true, displayName: true },
      },
    };
  }

  /**
   * Transform bridge card for API response with extracted content summaries
   */
  function transformBridgeCardForResponse(bridgeCard: BridgeCardWithRelations) {
    return {
      ...bridgeCard,
      cardSummary: extractCardSummary(bridgeCard.card.content),
      sourceCardSummary: bridgeCard.sourceCard
        ? extractCardSummary(bridgeCard.sourceCard.content)
        : null,
      targetCardSummary: bridgeCard.targetCard
        ? extractCardSummary(bridgeCard.targetCard.content)
        : null,
    };
  }

  /**
   * Collect all category IDs from a bridge card for cache invalidation
   */
  function collectCategoryIds(params: {
    sourceCategoryId?: string | null;
    targetCategoryId?: string | null;
  }): string[] {
    const ids: string[] = [];
    if (params.sourceCategoryId) ids.push(params.sourceCategoryId);
    if (params.targetCategoryId) ids.push(params.targetCategoryId);
    return ids;
  }

  // ===========================================================================
  // BRIDGE CARDS CRUD
  // ===========================================================================

  /**
   * POST /bridge-cards
   * Create a new bridge card
   */
  fastify.post(
    "/",
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const validation = CreateBridgeCardSchema.safeParse(request.body);

      if (!validation.success) {
        return reply.status(400).send({
          error: "Validation failed",
          details: validation.error.issues,
        });
      }

      const data = validation.data;
      const userId = request.user!.id;

      // Verify the main card exists and user has access
      const card = await prisma.card.findUnique({
        where: { id: data.cardId },
        select: { id: true, userId: true, deckId: true },
      });

      if (!card) {
        return reply.status(404).send({ error: "Card not found" });
      }

      if (card.userId !== userId) {
        return reply.status(403).send({ error: "No access to this card" });
      }

      // Validate source/target cards and categories exist
      const validationPromises: Promise<unknown>[] = [];

      if (data.sourceCardId) {
        validationPromises.push(
          prisma.card
            .findUnique({ where: { id: data.sourceCardId } })
            .then((c) => {
              if (!c)
                throw new Error(`Source card ${data.sourceCardId} not found`);
            }),
        );
      }

      if (data.targetCardId) {
        validationPromises.push(
          prisma.card
            .findUnique({ where: { id: data.targetCardId } })
            .then((c) => {
              if (!c)
                throw new Error(`Target card ${data.targetCardId} not found`);
            }),
        );
      }

      if (data.sourceCategoryId) {
        validationPromises.push(
          prisma.category
            .findUnique({ where: { id: data.sourceCategoryId } })
            .then((c) => {
              if (!c)
                throw new Error(
                  `Source category ${data.sourceCategoryId} not found`,
                );
            }),
        );
      }

      if (data.targetCategoryId) {
        validationPromises.push(
          prisma.category
            .findUnique({ where: { id: data.targetCategoryId } })
            .then((c) => {
              if (!c)
                throw new Error(
                  `Target category ${data.targetCategoryId} not found`,
                );
            }),
        );
      }

      try {
        await Promise.all(validationPromises);
      } catch (err) {
        return reply.status(400).send({
          error: "Validation failed",
          message: err instanceof Error ? err.message : "Invalid reference",
        });
      }

      // Create the bridge card
      const bridgeCard = await prisma.bridgeCard.create({
        data: {
          userId,
          cardId: data.cardId,
          bridgeType: data.bridgeType,
          bridgeQuestion: data.bridgeQuestion,
          bridgeAnswer: data.bridgeAnswer,
          isBidirectional: data.isBidirectional,
          reverseQuestion: data.reverseQuestion,
          reverseAnswer: data.reverseAnswer,
          connectionType: data.connectionType,
          connectionStrength: data.connectionStrength,
          connectionDescription: data.connectionDescription,
          frequencyMultiplier: data.frequencyMultiplier,
          surfaceTrigger: data.surfaceTrigger,
          minGapReviews: data.minGapReviews,
          sourceCardId: data.sourceCardId,
          sourceCategoryId: data.sourceCategoryId,
          targetCardId: data.targetCardId,
          targetCategoryId: data.targetCategoryId,
          createdFrom: data.createdFrom,
          sourceId: data.sourceId,
          status: data.status,
          isUserConfirmed: true,
        },
        include: buildBridgeCardInclude(),
      });

      // Ensure card participations exist for linked categories
      const categoryIds = collectCategoryIds({
        sourceCategoryId: data.sourceCategoryId,
        targetCategoryId: data.targetCategoryId,
      });

      for (const categoryId of categoryIds) {
        const existingParticipation =
          await prisma.cardCategoryParticipation.findUnique({
            where: {
              cardId_categoryId: {
                cardId: data.cardId,
                categoryId,
              },
            },
          });

        if (!existingParticipation) {
          await prisma.cardCategoryParticipation.create({
            data: {
              cardId: data.cardId,
              categoryId,
              semanticRole: "bridge",
              provenanceType: "bridge_card",
              provenanceRef: bridgeCard.id,
              belongsBecause: "Created from bridge card linking",
            },
          });
        }
      }

      // Invalidate caches
      await invalidateBridgeCache({
        userId,
        cardId: data.cardId,
        categoryIds,
      });

      log.info(
        {
          bridgeCardId: bridgeCard.id,
          cardId: data.cardId,
          bridgeType: data.bridgeType,
        },
        "Bridge card created",
      );

      return reply.status(201).send({
        success: true,
        data: transformBridgeCardForResponse(
          bridgeCard as BridgeCardWithRelations,
        ),
      });
    },
  );

  /**
   * GET /bridge-cards
   * Query bridge cards with filtering and pagination
   */
  fastify.get(
    "/",
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;
      const validation = BridgeCardQuerySchema.safeParse(request.query);

      if (!validation.success) {
        return reply.status(400).send({
          error: "Invalid query parameters",
          details: validation.error.issues,
        });
      }

      const {
        cardId,
        bridgeType,
        connectionType,
        status,
        sourceCategoryId,
        targetCategoryId,
        minConnectionStrength,
        searchTerm,
        includeAiSuggested,
        sortBy,
        sortOrder,
        cursor,
        limit,
      } = validation.data;

      // Build where clause
      const where: Prisma.BridgeCardWhereInput = { userId };

      if (cardId) {
        where.OR = [
          { cardId },
          { sourceCardId: cardId },
          { targetCardId: cardId },
        ];
      }

      if (bridgeType) {
        where.bridgeType = bridgeType;
      }

      if (connectionType) {
        where.connectionType = connectionType;
      }

      if (status) {
        where.status = status;
      }

      if (sourceCategoryId) {
        where.sourceCategoryId = sourceCategoryId;
      }

      if (targetCategoryId) {
        where.targetCategoryId = targetCategoryId;
      }

      if (minConnectionStrength !== undefined) {
        where.connectionStrength = { gte: minConnectionStrength };
      }

      if (searchTerm) {
        where.AND = [
          {
            OR: [
              { bridgeQuestion: { contains: searchTerm, mode: "insensitive" } },
              { bridgeAnswer: { contains: searchTerm, mode: "insensitive" } },
              {
                connectionDescription: {
                  contains: searchTerm,
                  mode: "insensitive",
                },
              },
            ],
          },
        ];
      }

      if (includeAiSuggested === false) {
        where.aiSuggested = false;
      }

      // Build order by
      const orderBy: Prisma.BridgeCardOrderByWithRelationInput = {
        [sortBy]: sortOrder,
      };

      const bridgeCards = await prisma.bridgeCard.findMany({
        where,
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
        orderBy,
        include: buildBridgeCardInclude(),
      });

      const hasMore = bridgeCards.length > limit;
      const items = hasMore ? bridgeCards.slice(0, -1) : bridgeCards;

      return reply.send({
        success: true,
        data: {
          items: items.map((bc) =>
            transformBridgeCardForResponse(bc as BridgeCardWithRelations),
          ),
          pagination: {
            hasMore,
            nextCursor: hasMore ? items[items.length - 1]?.id : null,
            count: items.length,
          },
        },
      });
    },
  );

  /**
   * GET /bridge-cards/:bridgeCardId
   * Get a specific bridge card with full details
   */
  fastify.get(
    "/:bridgeCardId",
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;
      const { bridgeCardId } = request.params as { bridgeCardId: string };

      const bridgeCard = await prisma.bridgeCard.findFirst({
        where: { id: bridgeCardId, userId },
        include: {
          ...buildBridgeCardInclude(),
          // Additional details for single-card view
          card: {
            select: {
              id: true,
              content: true,
              cardType: true,
              categoryParticipations: {
                include: {
                  category: {
                    select: { id: true, name: true, iconEmoji: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!bridgeCard) {
        return reply.status(404).send({ error: "Bridge card not found" });
      }

      // Get statistics if available from cache
      let stats: Record<string, unknown> | null = null;
      if (redis) {
        const cachedStats = await redis.get(
          cacheKeys.bridgeCardStats(bridgeCardId),
        );
        if (cachedStats) {
          stats = JSON.parse(cachedStats);
        }
      }

      return reply.send({
        success: true,
        data: {
          ...transformBridgeCardForResponse(
            bridgeCard as unknown as BridgeCardWithRelations,
          ),
          stats,
        },
      });
    },
  );

  /**
   * PATCH /bridge-cards/:bridgeCardId
   * Update a bridge card
   */
  fastify.patch(
    "/:bridgeCardId",
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;
      const { bridgeCardId } = request.params as { bridgeCardId: string };
      const validation = UpdateBridgeCardSchema.safeParse(request.body);

      if (!validation.success) {
        return reply.status(400).send({
          error: "Validation failed",
          details: validation.error.issues,
        });
      }

      const existing = await prisma.bridgeCard.findFirst({
        where: { id: bridgeCardId, userId },
        select: {
          id: true,
          userId: true,
          cardId: true,
          sourceCategoryId: true,
          targetCategoryId: true,
        },
      });

      if (!existing) {
        return reply.status(404).send({ error: "Bridge card not found" });
      }

      const bridgeCard = await prisma.bridgeCard.update({
        where: { id: bridgeCardId },
        data: validation.data,
        include: buildBridgeCardInclude(),
      });

      // Invalidate caches
      await invalidateBridgeCache({
        userId,
        cardId: existing.cardId,
        categoryIds: collectCategoryIds({
          sourceCategoryId: existing.sourceCategoryId,
          targetCategoryId: existing.targetCategoryId,
        }),
        bridgeCardId,
      });

      log.info({ bridgeCardId }, "Bridge card updated");

      return reply.send({
        success: true,
        data: transformBridgeCardForResponse(
          bridgeCard as BridgeCardWithRelations,
        ),
      });
    },
  );

  /**
   * DELETE /bridge-cards/:bridgeCardId
   * Delete a bridge card
   */
  fastify.delete(
    "/:bridgeCardId",
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;
      const { bridgeCardId } = request.params as { bridgeCardId: string };

      const existing = await prisma.bridgeCard.findFirst({
        where: { id: bridgeCardId, userId },
        select: {
          id: true,
          userId: true,
          cardId: true,
          sourceCategoryId: true,
          targetCategoryId: true,
        },
      });

      if (!existing) {
        return reply.status(404).send({ error: "Bridge card not found" });
      }

      await prisma.bridgeCard.delete({
        where: { id: bridgeCardId },
      });

      // Invalidate caches
      await invalidateBridgeCache({
        userId,
        cardId: existing.cardId,
        categoryIds: collectCategoryIds({
          sourceCategoryId: existing.sourceCategoryId,
          targetCategoryId: existing.targetCategoryId,
        }),
        bridgeCardId,
      });

      log.info({ bridgeCardId }, "Bridge card deleted");

      return reply.send({
        success: true,
        message: "Bridge card deleted",
      });
    },
  );

  // ===========================================================================
  // BRIDGE CARD TRAVERSAL & REVIEW
  // ===========================================================================

  /**
   * POST /bridge-cards/:bridgeCardId/traverse
   * Record a bridge card traversal/review
   */
  fastify.post(
    "/:bridgeCardId/traverse",
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;
      const { bridgeCardId } = request.params as { bridgeCardId: string };
      const validation = RecordBridgeTraversalSchema.safeParse(request.body);

      if (!validation.success) {
        return reply.status(400).send({
          error: "Validation failed",
          details: validation.error.issues,
        });
      }

      const data = validation.data;

      const bridgeCard = await prisma.bridgeCard.findFirst({
        where: { id: bridgeCardId, userId },
        select: {
          id: true,
          cardId: true,
          sourceCategoryId: true,
          targetCategoryId: true,
          connectionStrength: true,
        },
      });

      if (!bridgeCard) {
        return reply.status(404).send({ error: "Bridge card not found" });
      }

      // Update connection strength based on feedback
      let newConnectionStrength = bridgeCard.connectionStrength;
      if (data.wasHelpful !== undefined) {
        const delta = data.wasHelpful ? 0.05 : -0.03;
        newConnectionStrength = Math.max(
          0,
          Math.min(1, bridgeCard.connectionStrength + delta),
        );
      }

      if (data.feedback?.rating) {
        const ratingDelta = (data.feedback.rating - 3) / 10;
        newConnectionStrength = Math.max(
          0,
          Math.min(1, newConnectionStrength + ratingDelta),
        );
      }

      // Update the bridge card
      const updatedBridgeCard = await prisma.bridgeCard.update({
        where: { id: bridgeCardId },
        data: {
          connectionStrength: newConnectionStrength,
          isUserConfirmed: true,
        },
        include: buildBridgeCardInclude(),
      });

      // If reviewed in a specific context, update context-specific metrics
      if (data.reviewedInContext) {
        const participation = await prisma.cardCategoryParticipation.findUnique(
          {
            where: {
              cardId_categoryId: {
                cardId: bridgeCard.cardId,
                categoryId: data.reviewedInContext,
              },
            },
          },
        );

        if (participation) {
          // Update context mastery based on bridge traversal success
          const masteryDelta = data.wasHelpful ? 0.02 : -0.01;
          await prisma.cardCategoryParticipation.update({
            where: { id: participation.id },
            data: {
              contextMastery: Math.max(
                0,
                Math.min(1, participation.contextMastery + masteryDelta),
              ),
              reviewCountInContext: { increment: 1 },
              lastReviewedInContext: new Date(),
            },
          });
        }
      }

      // Invalidate caches
      await invalidateBridgeCache({
        userId,
        bridgeCardId,
      });

      log.info(
        {
          bridgeCardId,
          direction: data.direction,
          wasHelpful: data.wasHelpful,
          newConnectionStrength,
        },
        "Bridge card traversal recorded",
      );

      return reply.send({
        success: true,
        data: {
          bridgeCard: transformBridgeCardForResponse(
            updatedBridgeCard as BridgeCardWithRelations,
          ),
          connectionStrengthDelta:
            newConnectionStrength - bridgeCard.connectionStrength,
        },
      });
    },
  );

  // ===========================================================================
  // BRIDGE CARDS BY CONTEXT
  // ===========================================================================

  /**
   * GET /bridge-cards/card/:cardId
   * Get all bridge cards connected to a specific card
   */
  fastify.get(
    "/card/:cardId",
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;
      const { cardId } = request.params as { cardId: string };

      // Check cache first
      if (redis) {
        const cached = await redis.get(cacheKeys.cardBridgeCards(cardId));
        if (cached) {
          return reply.send(JSON.parse(cached));
        }
      }

      const bridgeCards = await prisma.bridgeCard.findMany({
        where: {
          userId,
          OR: [{ cardId }, { sourceCardId: cardId }, { targetCardId: cardId }],
          status: "active",
        },
        include: buildBridgeCardInclude(),
        orderBy: { connectionStrength: "desc" },
      });

      const response = {
        success: true,
        data: {
          items: bridgeCards.map((bc) =>
            transformBridgeCardForResponse(bc as BridgeCardWithRelations),
          ),
          count: bridgeCards.length,
        },
      };

      // Cache the result
      if (redis) {
        await redis.setex(
          cacheKeys.cardBridgeCards(cardId),
          CACHE_TTL.BRIDGE_CARDS,
          JSON.stringify(response),
        );
      }

      return reply.send(response);
    },
  );

  /**
   * GET /bridge-cards/category/:categoryId
   * Get all bridge cards connected to a specific category
   */
  fastify.get(
    "/category/:categoryId",
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;
      const { categoryId } = request.params as { categoryId: string };

      // Check cache first
      if (redis) {
        const cached = await redis.get(
          cacheKeys.categoryBridgeCards(categoryId),
        );
        if (cached) {
          return reply.send(JSON.parse(cached));
        }
      }

      const bridgeCards = await prisma.bridgeCard.findMany({
        where: {
          userId,
          OR: [
            { sourceCategoryId: categoryId },
            { targetCategoryId: categoryId },
          ],
          status: "active",
        },
        include: buildBridgeCardInclude(),
        orderBy: { connectionStrength: "desc" },
      });

      const response = {
        success: true,
        data: {
          items: bridgeCards.map((bc) =>
            transformBridgeCardForResponse(bc as BridgeCardWithRelations),
          ),
          count: bridgeCards.length,
        },
      };

      // Cache the result
      if (redis) {
        await redis.setex(
          cacheKeys.categoryBridgeCards(categoryId),
          CACHE_TTL.BRIDGE_CARDS,
          JSON.stringify(response),
        );
      }

      return reply.send(response);
    },
  );

  /**
   * GET /bridge-cards/between
   * Get bridge cards connecting two specific contexts
   */
  fastify.get(
    "/between",
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;
      const querySchema = z.object({
        sourceCardId: z.string().optional(),
        targetCardId: z.string().optional(),
        sourceCategoryId: z.string().optional(),
        targetCategoryId: z.string().optional(),
      });

      const validation = querySchema.safeParse(request.query);
      if (!validation.success) {
        return reply.status(400).send({
          error: "Invalid query parameters",
          details: validation.error.issues,
        });
      }

      const { sourceCardId, targetCardId, sourceCategoryId, targetCategoryId } =
        validation.data;

      // Build where clause for bidirectional matching
      const where: Prisma.BridgeCardWhereInput = {
        userId,
        status: "active",
        OR: [
          // Forward direction
          {
            ...(sourceCardId && { sourceCardId }),
            ...(targetCardId && { targetCardId }),
            ...(sourceCategoryId && { sourceCategoryId }),
            ...(targetCategoryId && { targetCategoryId }),
          },
          // Reverse direction (for bidirectional bridges)
          {
            isBidirectional: true,
            ...(sourceCardId && { targetCardId: sourceCardId }),
            ...(targetCardId && { sourceCardId: targetCardId }),
            ...(sourceCategoryId && { targetCategoryId: sourceCategoryId }),
            ...(targetCategoryId && { sourceCategoryId: targetCategoryId }),
          },
        ],
      };

      const bridgeCards = await prisma.bridgeCard.findMany({
        where,
        include: buildBridgeCardInclude(),
        orderBy: { connectionStrength: "desc" },
      });

      return reply.send({
        success: true,
        data: {
          items: bridgeCards.map((bc) =>
            transformBridgeCardForResponse(bc as BridgeCardWithRelations),
          ),
          count: bridgeCards.length,
        },
      });
    },
  );

  // ===========================================================================
  // REVIEW QUEUE
  // ===========================================================================

  /**
   * GET /bridge-cards/review-queue
   * Get bridge cards that should be shown during review
   */
  fastify.get(
    "/review-queue",
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;
      const querySchema = z.object({
        contextCategoryId: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(50).default(10),
        excludeRecentHours: z.coerce.number().int().min(0).max(168).default(24),
      });

      const validation = querySchema.safeParse(request.query);
      if (!validation.success) {
        return reply.status(400).send({
          error: "Invalid query parameters",
          details: validation.error.issues,
        });
      }

      const {
        contextCategoryId,
        limit,
        excludeRecentHours: _excludeRecentHours,
      } = validation.data;

      // Build where clause
      const where: Prisma.BridgeCardWhereInput = {
        userId,
        status: "active",
      };

      if (contextCategoryId) {
        where.OR = [
          { sourceCategoryId: contextCategoryId },
          { targetCategoryId: contextCategoryId },
        ];
      }

      // Get all eligible bridge cards
      const bridgeCards = await prisma.bridgeCard.findMany({
        where,
        include: buildBridgeCardInclude(),
        orderBy: [
          { frequencyMultiplier: "desc" },
          { connectionStrength: "asc" }, // Prioritize weaker connections
          { createdAt: "asc" },
        ],
      });

      // Filter and score bridge cards for review
      const scoredBridgeCards = bridgeCards
        .map((bc) => {
          // Calculate review score
          let score = bc.frequencyMultiplier;

          // Boost cards with lower connection strength (need more practice)
          score += (1 - bc.connectionStrength) * 0.3;

          // Consider user confirmation status
          if (!bc.isUserConfirmed) {
            score += 0.2; // Boost unconfirmed cards
          }

          return { bridgeCard: bc, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return reply.send({
        success: true,
        data: {
          items: scoredBridgeCards.map(({ bridgeCard, score }) => ({
            ...transformBridgeCardForResponse(
              bridgeCard as BridgeCardWithRelations,
            ),
            reviewScore: score,
          })),
          count: scoredBridgeCards.length,
        },
      });
    },
  );

  // ===========================================================================
  // BRIDGE CARD SUGGESTIONS
  // ===========================================================================

  /**
   * GET /bridge-cards/suggestions
   * Get pending bridge card suggestions for the user
   */
  fastify.get(
    "/suggestions",
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;
      const validation = SuggestionQuerySchema.safeParse(request.query);

      if (!validation.success) {
        return reply.status(400).send({
          error: "Invalid query parameters",
          details: validation.error.issues,
        });
      }

      const {
        status,
        sourceCardId,
        targetCardId,
        sourceCategoryId,
        targetCategoryId,
        minConfidence,
        suggestionSource,
        cursor,
        limit,
      } = validation.data;

      // Build where clause
      const where: Prisma.BridgeCardSuggestionWhereInput = { userId };

      if (status) {
        where.status = status;
      } else {
        where.status = "pending"; // Default to pending
      }

      if (sourceCardId) where.sourceCardId = sourceCardId;
      if (targetCardId) where.targetCardId = targetCardId;
      if (sourceCategoryId) where.sourceCategoryId = sourceCategoryId;
      if (targetCategoryId) where.targetCategoryId = targetCategoryId;
      if (minConfidence !== undefined) {
        where.confidence = { gte: minConfidence };
      }
      if (suggestionSource) where.suggestionSource = suggestionSource;

      const suggestions = await prisma.bridgeCardSuggestion.findMany({
        where,
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
        orderBy: { confidence: "desc" },
        include: {
          sourceCard: {
            select: { id: true, content: true },
          },
          targetCard: {
            select: { id: true, content: true },
          },
          sourceCategory: {
            select: { id: true, name: true, iconEmoji: true },
          },
          targetCategory: {
            select: { id: true, name: true, iconEmoji: true },
          },
        },
      });

      const hasMore = suggestions.length > limit;
      const items = hasMore ? suggestions.slice(0, -1) : suggestions;

      return reply.send({
        success: true,
        data: {
          items: items.map((s) => ({
            ...s,
            sourceCardSummary: s.sourceCard
              ? extractCardSummary(s.sourceCard.content)
              : null,
            targetCardSummary: s.targetCard
              ? extractCardSummary(s.targetCard.content)
              : null,
          })),
          pagination: {
            hasMore,
            nextCursor: hasMore ? items[items.length - 1]?.id : null,
            count: items.length,
          },
        },
      });
    },
  );

  /**
   * POST /bridge-cards/suggestions
   * Create a new bridge card suggestion (typically from AI service)
   */
  fastify.post(
    "/suggestions",
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;
      const validation = CreateSuggestionSchema.safeParse(request.body);

      if (!validation.success) {
        return reply.status(400).send({
          error: "Validation failed",
          details: validation.error.issues,
        });
      }

      const data = validation.data;

      // Check for duplicate suggestions
      const existing = await prisma.bridgeCardSuggestion.findFirst({
        where: {
          userId,
          status: "pending",
          sourceCardId: data.sourceCardId,
          targetCardId: data.targetCardId,
          sourceCategoryId: data.sourceCategoryId,
          targetCategoryId: data.targetCategoryId,
        },
      });

      if (existing) {
        return reply.status(409).send({
          error: "A similar suggestion already exists",
          existingId: existing.id,
        });
      }

      const suggestion = await prisma.bridgeCardSuggestion.create({
        data: {
          userId,
          bridgeType: data.bridgeType,
          sourceCardId: data.sourceCardId,
          sourceCategoryId: data.sourceCategoryId,
          targetCardId: data.targetCardId,
          targetCategoryId: data.targetCategoryId,
          suggestedQuestion: data.suggestedQuestion,
          suggestedAnswer: data.suggestedAnswer,
          connectionType: data.connectionType,
          confidence: data.confidence,
          rationale: data.rationale,
          suggestionSource: data.suggestionSource,
          suggestionDetails: data.suggestionDetails as
            | Prisma.InputJsonValue
            | undefined,
          status: "pending",
        },
        include: {
          sourceCard: {
            select: { id: true, content: true },
          },
          targetCard: {
            select: { id: true, content: true },
          },
          sourceCategory: {
            select: { id: true, name: true },
          },
          targetCategory: {
            select: { id: true, name: true },
          },
        },
      });

      // Invalidate suggestions cache
      await invalidateBridgeCache({ userId });

      log.info(
        {
          suggestionId: suggestion.id,
          confidence: data.confidence,
          source: data.suggestionSource,
        },
        "Bridge card suggestion created",
      );

      return reply.status(201).send({
        success: true,
        data: suggestion,
      });
    },
  );

  /**
   * POST /bridge-cards/suggestions/:suggestionId/respond
   * Respond to a bridge card suggestion (accept, reject, defer, modify)
   */
  fastify.post(
    "/suggestions/:suggestionId/respond",
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;
      const { suggestionId } = request.params as { suggestionId: string };
      const validation = RespondToSuggestionSchema.safeParse(request.body);

      if (!validation.success) {
        return reply.status(400).send({
          error: "Validation failed",
          details: validation.error.issues,
        });
      }

      const { action, rejectionReason, deferUntil, modifications } =
        validation.data;

      const suggestion = await prisma.bridgeCardSuggestion.findFirst({
        where: { id: suggestionId, userId, status: "pending" },
      });

      if (!suggestion) {
        return reply
          .status(404)
          .send({ error: "Suggestion not found or already processed" });
      }

      let createdBridgeCard = null;

      if (action === "accept" || action === "modify_accept") {
        // We need a cardId. Use sourceCardId if available, otherwise find one
        const cardId = suggestion.sourceCardId;
        if (!cardId) {
          return reply.status(400).send({
            error: "Cannot create bridge card without a source card reference",
          });
        }

        // Verify the card belongs to the user
        const card = await prisma.card.findFirst({
          where: { id: cardId, userId },
        });

        if (!card) {
          return reply.status(403).send({
            error: "No access to the source card",
          });
        }

        // Create the bridge card from suggestion
        createdBridgeCard = await prisma.bridgeCard.create({
          data: {
            userId,
            cardId,
            bridgeType: suggestion.bridgeType,
            bridgeQuestion:
              modifications?.bridgeQuestion ?? suggestion.suggestedQuestion,
            bridgeAnswer:
              modifications?.bridgeAnswer ?? suggestion.suggestedAnswer,
            connectionType:
              modifications?.connectionType ?? suggestion.connectionType,
            connectionStrength: suggestion.confidence,
            sourceCardId: suggestion.sourceCardId,
            sourceCategoryId: suggestion.sourceCategoryId,
            targetCardId: suggestion.targetCardId,
            targetCategoryId: suggestion.targetCategoryId,
            status: "active",
            isUserConfirmed: true,
            aiSuggested: true,
            aiConfidence: suggestion.confidence,
            createdFrom: "ai_suggestion",
            sourceId: suggestionId,
          },
          include: buildBridgeCardInclude(),
        });

        // Update suggestion
        await prisma.bridgeCardSuggestion.update({
          where: { id: suggestionId },
          data: {
            status: action === "modify_accept" ? "accepted" : "accepted",
            respondedAt: new Date(),
            createdBridgeId: createdBridgeCard.id,
          },
        });

        log.info(
          {
            suggestionId,
            bridgeCardId: createdBridgeCard.id,
            action,
          },
          "Bridge card suggestion accepted",
        );
      } else if (action === "reject") {
        await prisma.bridgeCardSuggestion.update({
          where: { id: suggestionId },
          data: {
            status: "rejected",
            respondedAt: new Date(),
            // Store rejection reason in suggestionDetails
            suggestionDetails: {
              ...((suggestion.suggestionDetails as Record<string, unknown>) ||
                {}),
              rejectionReason,
            },
          },
        });

        log.info(
          { suggestionId, reason: rejectionReason },
          "Suggestion rejected",
        );
      } else if (action === "defer") {
        await prisma.bridgeCardSuggestion.update({
          where: { id: suggestionId },
          data: {
            status: "deferred",
            // Store defer info - will be reset to pending by a scheduled job
            suggestionDetails: {
              ...((suggestion.suggestionDetails as Record<string, unknown>) ||
                {}),
              deferredAt: new Date().toISOString(),
              deferUntil: deferUntil?.toISOString(),
            },
          },
        });

        log.info({ suggestionId, deferUntil }, "Suggestion deferred");
      }

      // Invalidate caches
      await invalidateBridgeCache({ userId });

      return reply.send({
        success: true,
        message: `Suggestion ${action}ed`,
        data: createdBridgeCard
          ? transformBridgeCardForResponse(
              createdBridgeCard as BridgeCardWithRelations,
            )
          : null,
      });
    },
  );

  /**
   * DELETE /bridge-cards/suggestions/:suggestionId
   * Delete a suggestion (admin/cleanup)
   */
  fastify.delete(
    "/suggestions/:suggestionId",
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;
      const { suggestionId } = request.params as { suggestionId: string };

      const suggestion = await prisma.bridgeCardSuggestion.findFirst({
        where: { id: suggestionId, userId },
      });

      if (!suggestion) {
        return reply.status(404).send({ error: "Suggestion not found" });
      }

      await prisma.bridgeCardSuggestion.delete({
        where: { id: suggestionId },
      });

      await invalidateBridgeCache({ userId });

      return reply.send({
        success: true,
        message: "Suggestion deleted",
      });
    },
  );

  // ===========================================================================
  // ANALYTICS & STATISTICS
  // ===========================================================================

  /**
   * GET /bridge-cards/stats
   * Get bridge card statistics for the user
   */
  fastify.get(
    "/stats",
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      const [
        totalCount,
        activeCount,
        avgConnectionStrength,
        byBridgeType,
        byConnectionType,
        suggestionsCount,
      ] = await Promise.all([
        prisma.bridgeCard.count({ where: { userId } }),
        prisma.bridgeCard.count({ where: { userId, status: "active" } }),
        prisma.bridgeCard.aggregate({
          where: { userId, status: "active" },
          _avg: { connectionStrength: true },
        }),
        prisma.bridgeCard.groupBy({
          by: ["bridgeType"],
          where: { userId },
          _count: { id: true },
        }),
        prisma.bridgeCard.groupBy({
          by: ["connectionType"],
          where: { userId },
          _count: { id: true },
        }),
        prisma.bridgeCardSuggestion.count({
          where: { userId, status: "pending" },
        }),
      ]);

      return reply.send({
        success: true,
        data: {
          total: totalCount,
          active: activeCount,
          averageConnectionStrength:
            avgConnectionStrength._avg.connectionStrength ?? 0,
          byBridgeType: byBridgeType.reduce(
            (acc, item) => {
              acc[item.bridgeType] = item._count.id;
              return acc;
            },
            {} as Record<string, number>,
          ),
          byConnectionType: byConnectionType.reduce(
            (acc, item) => {
              acc[item.connectionType] = item._count.id;
              return acc;
            },
            {} as Record<string, number>,
          ),
          pendingSuggestions: suggestionsCount,
        },
      });
    },
  );

  /**
   * GET /bridge-cards/effectiveness
   * Get effectiveness analysis of bridge cards
   */
  fastify.get(
    "/effectiveness",
    { onRequest: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;
      const querySchema = z.object({
        minTraversals: z.coerce.number().int().min(0).default(3),
      });

      const validation = querySchema.safeParse(request.query);
      if (!validation.success) {
        return reply.status(400).send({
          error: "Invalid query parameters",
        });
      }

      // Get bridge cards with their connection strengths
      const bridgeCards = await prisma.bridgeCard.findMany({
        where: { userId, status: "active" },
        select: {
          id: true,
          bridgeQuestion: true,
          connectionType: true,
          connectionStrength: true,
          isUserConfirmed: true,
          createdAt: true,
        },
        orderBy: { connectionStrength: "desc" },
      });

      // Categorize by effectiveness
      const categories = {
        highEffectiveness: bridgeCards.filter(
          (bc) => bc.connectionStrength >= 0.7,
        ),
        mediumEffectiveness: bridgeCards.filter(
          (bc) => bc.connectionStrength >= 0.4 && bc.connectionStrength < 0.7,
        ),
        lowEffectiveness: bridgeCards.filter(
          (bc) => bc.connectionStrength < 0.4,
        ),
      };

      return reply.send({
        success: true,
        data: {
          summary: {
            total: bridgeCards.length,
            highEffectiveness: categories.highEffectiveness.length,
            mediumEffectiveness: categories.mediumEffectiveness.length,
            lowEffectiveness: categories.lowEffectiveness.length,
            averageStrength:
              bridgeCards.reduce((sum, bc) => sum + bc.connectionStrength, 0) /
              (bridgeCards.length || 1),
          },
          topPerformers: categories.highEffectiveness.slice(0, 5),
          needsImprovement: categories.lowEffectiveness.slice(0, 5),
        },
      });
    },
  );
};

export default bridgeCardRoutes;
