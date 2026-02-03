// =============================================================================
// PARTICIPATION ROUTES - MULTI-BELONGING API
// =============================================================================
// Core API for the participation model. Every card can participate in multiple
// categories with context-specific properties, performance tracking, and
// synthesis mechanics.
//
// Design principles:
// - Idempotent operations for offline sync
// - Event emission for AI integration
// - Plugin hooks for extensibility
// - Efficient bulk operations
// =============================================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma, Prisma } from "../config/database.js";
import { authenticate } from "../middleware/auth.js";
import {
  syncParticipationOnCreate,
  syncParticipationOnUpdate,
} from "../ecosystem-bridge/index.js";

// =============================================================================
// SCHEMAS
// =============================================================================

const semanticRoleEnum = z.enum([
  "foundational",
  "application",
  "example",
  "edge_case",
  "counterexample",
  "concept",
  "prerequisite",
  "bridge",
  "synthesis",
  "anchor",
  "peripheral",
  "contested",
]);

const provenanceTypeEnum = z.enum([
  "manual",
  "import",
  "split",
  "merge",
  "ai_suggested",
  "clone",
  "bulk_operation",
]);

// Add participation
const addParticipationSchema = z.object({
  cardId: z.string(),
  categoryId: z.string(),
  semanticRole: semanticRoleEnum.default("concept"),
  isPrimary: z.boolean().default(false),
  contextNotes: z.string().max(5000).optional(),
  contextTags: z.array(z.string()).default([]),
  learningGoal: z.string().max(1000).optional(),
  targetMastery: z.number().min(0).max(1).default(0.8),
  intentOverride: z.string().optional(),
  positionInCategory: z.number().int().min(0).optional(),
  priorityWeight: z.number().min(0).max(10).default(1.0),
  belongsBecause: z.string().max(1000).optional(),
  emphasisLevel: z.number().int().min(-2).max(2).default(0),
  scaffoldingLevel: z.number().int().min(0).max(3).default(0),
  customPrompts: z.array(z.string()).default([]),
  provenanceType: provenanceTypeEnum.default("manual"),
  provenanceRef: z.string().optional(),
});

// Update participation
const updateParticipationSchema = z.object({
  semanticRole: semanticRoleEnum.optional(),
  isPrimary: z.boolean().optional(),
  contextDifficulty: z.number().min(0).max(1).nullable().optional(),
  contextNotes: z.string().max(5000).nullable().optional(),
  contextTags: z.array(z.string()).optional(),
  learningGoal: z.string().max(1000).nullable().optional(),
  targetMastery: z.number().min(0).max(1).optional(),
  intentOverride: z.string().nullable().optional(),
  positionInCategory: z.number().int().min(0).optional(),
  priorityWeight: z.number().min(0).max(10).optional(),
  belongsBecause: z.string().max(1000).nullable().optional(),
  emphasisLevel: z.number().int().min(-2).max(2).optional(),
  isContextHighlighted: z.boolean().optional(),
  scaffoldingLevel: z.number().int().min(0).max(3).optional(),
  customPrompts: z.array(z.string()).optional(),
});

// Bulk operations
const bulkAddParticipationsSchema = z.object({
  cardIds: z.array(z.string()).min(1).max(500),
  categoryId: z.string(),
  semanticRole: semanticRoleEnum.default("concept"),
  provenanceType: provenanceTypeEnum.default("bulk_operation"),
});

const bulkRemoveParticipationsSchema = z.object({
  participationIds: z.array(z.string()).min(1).max(500),
});

const bulkUpdateParticipationsSchema = z.object({
  participationIds: z.array(z.string()).min(1).max(500),
  updates: updateParticipationSchema,
});

// Query schemas
const participationQuerySchema = z.object({
  cardId: z.string().optional(),
  categoryId: z.string().optional(),
  semanticRole: semanticRoleEnum.optional(),
  isPrimary: z.coerce.boolean().optional(),
  minParticipationCount: z.coerce.number().int().min(1).optional(),
  hasDriftWarning: z.coerce.boolean().optional(),
  minMastery: z.coerce.number().min(0).max(1).optional(),
  maxMastery: z.coerce.number().min(0).max(1).optional(),
  provenanceType: provenanceTypeEnum.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sortBy: z
    .enum(["mastery", "position", "addedAt", "lastReviewed"])
    .default("position"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

// Context-aware card resolution
const contextualCardQuerySchema = z.object({
  categoryId: z.string(),
  includeAnnotations: z.coerce.boolean().default(true),
  includeEmphasis: z.coerce.boolean().default(true),
  includeAllParticipations: z.coerce.boolean().default(true),
});

// Bridge candidates query
const bridgeCandidatesQuerySchema = z.object({
  cardId: z.string().optional(),
  categoryId: z.string().optional(),
  minDivergence: z.coerce.number().min(0).max(1).default(0.2),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Divergence query
const divergenceQuerySchema = z.object({
  minSpread: z.coerce.number().min(0).max(1).default(0.2),
  severity: z.enum(["mild", "moderate", "severe"]).optional(),
  status: z.enum(["active", "addressed", "dismissed", "resolved"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// Record context performance
const recordContextPerformanceSchema = z.object({
  participationId: z.string(),
  isCorrect: z.boolean(),
  responseTimeMs: z.number().int().min(0).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate next position in category
 */
async function getNextPositionInCategory(categoryId: string): Promise<number> {
  const maxPosition = await prisma.cardCategoryParticipation.aggregate({
    where: { categoryId },
    _max: { positionInCategory: true },
  });
  return (maxPosition._max.positionInCategory ?? -1) + 1;
}

/**
 * Update category stats after participation changes
 */
async function updateCategoryStats(categoryId: string) {
  const stats = await prisma.cardCategoryParticipation.aggregate({
    where: { categoryId },
    _count: { id: true },
    _avg: { contextMasteryScore: true },
  });

  await prisma.category.update({
    where: { id: categoryId },
    data: {
      cardCount: stats._count.id,
      masteryScore: stats._avg.contextMasteryScore ?? 0,
    },
  });
}

/**
 * Check for performance divergence and create/update divergence records
 */
async function checkPerformanceDivergence(
  userId: string,
  cardId: string,
): Promise<void> {
  // Get all participations with sufficient reviews
  const participations = await prisma.cardCategoryParticipation.findMany({
    where: {
      cardId,
      reviewCountInContext: { gte: 5 },
    },
    include: {
      category: {
        select: { id: true, name: true },
      },
    },
  });

  if (participations.length < 2) return;

  // Calculate accuracy for each context
  const contextPerformances = participations.map((p) => ({
    categoryId: p.categoryId,
    categoryName: p.category.name,
    accuracy: p.contextSuccessRate,
  }));

  // Sort by accuracy
  contextPerformances.sort((a, b) => b.accuracy - a.accuracy);

  const best = contextPerformances[0];
  const worst = contextPerformances[contextPerformances.length - 1];
  const spread = best.accuracy - worst.accuracy;

  // Determine severity
  let severity: "mild" | "moderate" | "severe" | null = null;
  if (spread >= 0.5) severity = "severe";
  else if (spread >= 0.35) severity = "moderate";
  else if (spread >= 0.2) severity = "mild";

  // Get existing divergence record
  const existingDivergence = await prisma.performanceDivergence.findFirst({
    where: {
      userId,
      cardId,
      status: { in: ["active", "addressed"] },
    },
  });

  if (severity) {
    // Create or update divergence record
    if (existingDivergence) {
      await prisma.performanceDivergence.update({
        where: { id: existingDivergence.id },
        data: {
          bestContextId: best.categoryId,
          bestAccuracy: best.accuracy,
          worstContextId: worst.categoryId,
          worstAccuracy: worst.accuracy,
          performanceSpread: spread,
          severity,
          contextRankings: contextPerformances.map((cp, i) => ({
            ...cp,
            rank: i + 1,
          })),
        },
      });
    } else {
      await prisma.performanceDivergence.create({
        data: {
          userId,
          cardId,
          bestContextId: best.categoryId,
          bestAccuracy: best.accuracy,
          worstContextId: worst.categoryId,
          worstAccuracy: worst.accuracy,
          performanceSpread: spread,
          severity,
          contextRankings: contextPerformances.map((cp, i) => ({
            ...cp,
            rank: i + 1,
          })),
          status: "active",
        },
      });
    }
  } else if (existingDivergence) {
    // Divergence resolved
    await prisma.performanceDivergence.update({
      where: { id: existingDivergence.id },
      data: {
        status: "resolved",
        resolvedAt: new Date(),
      },
    });
  }
}

/**
 * Check if synthesis prompt should be triggered
 */
async function checkSynthesisTriggers(
  userId: string,
  cardId: string,
): Promise<void> {
  // Get participation count
  const participationCount = await prisma.cardCategoryParticipation.count({
    where: { cardId },
  });

  // Check for existing pending prompts
  const pendingPrompts = await prisma.synthesisPrompt.count({
    where: {
      userId,
      cardId,
      status: "pending",
    },
  });

  if (pendingPrompts >= 2) return; // Max 2 pending prompts per card

  // Trigger if high participation count
  if (participationCount >= 3) {
    const existingHighPartPrompt = await prisma.synthesisPrompt.findFirst({
      where: {
        userId,
        cardId,
        triggerType: "high_participation_count",
        status: { in: ["pending", "shown"] },
      },
    });

    if (!existingHighPartPrompt) {
      const participations = await prisma.cardCategoryParticipation.findMany({
        where: { cardId },
        include: { category: { select: { id: true, name: true } } },
      });

      await prisma.synthesisPrompt.create({
        data: {
          userId,
          cardId,
          categoryIds: participations.map((p) => p.categoryId),
          triggerType: "high_participation_count",
          triggerDetails: { participationCount },
          promptType: "connection",
          promptText: `This concept appears in ${participationCount} different contexts: ${participations
            .map((p) => p.category.name)
            .join(
              ", ",
            )}. How does this concept connect or transform across these contexts?`,
          alternativePrompts: [
            "Which of these contexts is most fundamental for understanding this concept?",
            "Write a brief explanation that bridges these different perspectives.",
          ],
          hints: [
            "Consider what's common across all contexts",
            "Think about what's unique to each context",
          ],
          status: "pending",
        },
      });
    }
  }

  // Check for performance divergence trigger
  const divergence = await prisma.performanceDivergence.findFirst({
    where: {
      userId,
      cardId,
      status: "active",
      severity: { in: ["moderate", "severe"] },
    },
    include: {
      bestContext: { select: { name: true } },
      worstContext: { select: { name: true } },
    },
  });

  if (divergence) {
    const existingDivergencePrompt = await prisma.synthesisPrompt.findFirst({
      where: {
        userId,
        cardId,
        triggerType: "performance_divergence",
        status: { in: ["pending", "shown"] },
      },
    });

    if (!existingDivergencePrompt) {
      await prisma.synthesisPrompt.create({
        data: {
          userId,
          cardId,
          categoryIds: [divergence.bestContextId, divergence.worstContextId],
          triggerType: "performance_divergence",
          triggerDetails: {
            bestContextId: divergence.bestContextId,
            worstContextId: divergence.worstContextId,
            spread: divergence.performanceSpread,
          },
          promptType: "context_comparison",
          promptText: `You understand this concept better in "${divergence.bestContext.name}" than in "${divergence.worstContext.name}". What makes it harder in the second context?`,
          alternativePrompts: [
            `How would you explain the "${divergence.worstContext.name}" perspective to someone who understands the "${divergence.bestContext.name}" perspective?`,
            "What knowledge gap might explain this difference?",
          ],
          hints: [
            "Consider terminology differences",
            "Think about prerequisite knowledge",
          ],
          status: "pending",
        },
      });
    }
  }
}

/**
 * Emit participation event for AI integration
 */
async function emitParticipationEvent(
  eventType: string,
  data: Record<string, unknown>,
): Promise<void> {
  // In a production system, this would emit to a message queue or event bus
  // For now, we log and could store in an events table
  console.log(`[ParticipationEvent] ${eventType}:`, JSON.stringify(data));

  // TODO: Emit to Redis pub/sub or message queue for AI service consumption
}

// =============================================================================
// ROUTES
// =============================================================================

export async function participationRoutes(app: FastifyInstance) {
  // ===========================================================================
  // PARTICIPATION CRUD
  // ===========================================================================

  /**
   * Add a participation (card → category relationship)
   */
  app.post(
    "/",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Participations"],
        summary: "Add a card participation to a category",
        description:
          "Creates a participation relationship between a card and a category with optional context-specific properties.",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const input = addParticipationSchema.parse(request.body);
      const userId = request.user!.id;

      // Verify card and category exist and belong to user
      const [card, category] = await Promise.all([
        prisma.card.findFirst({
          where: { id: input.cardId, userId },
        }),
        prisma.category.findFirst({
          where: { id: input.categoryId, userId },
        }),
      ]);

      if (!card) {
        return reply.status(404).send({
          success: false,
          error: "Card not found",
        });
      }

      if (!category) {
        return reply.status(404).send({
          success: false,
          error: "Category not found",
        });
      }

      // Check if participation already exists (idempotent)
      const existing = await prisma.cardCategoryParticipation.findUnique({
        where: {
          cardId_categoryId: {
            cardId: input.cardId,
            categoryId: input.categoryId,
          },
        },
      });

      if (existing) {
        return reply.status(200).send({
          success: true,
          data: existing,
          message: "Participation already exists",
        });
      }

      // Get position if not specified
      const position =
        input.positionInCategory ??
        (await getNextPositionInCategory(input.categoryId));

      // If setting as primary, unset other primaries for this card
      if (input.isPrimary) {
        await prisma.cardCategoryParticipation.updateMany({
          where: { cardId: input.cardId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      // Create participation
      const participation = await prisma.cardCategoryParticipation.create({
        data: {
          cardId: input.cardId,
          categoryId: input.categoryId,
          semanticRole: input.semanticRole,
          isPrimary: input.isPrimary,
          contextNotes: input.contextNotes,
          contextTags: input.contextTags,
          learningGoal: input.learningGoal,
          targetMastery: input.targetMastery,
          intentOverride: input.intentOverride,
          positionInCategory: position,
          priorityWeight: input.priorityWeight,
          belongsBecause: input.belongsBecause,
          emphasisLevel: input.emphasisLevel,
          scaffoldingLevel: input.scaffoldingLevel,
          customPrompts: input.customPrompts,
          provenanceType: input.provenanceType,
          provenanceRef: input.provenanceRef,
          addedAt: new Date(),
        },
        include: {
          category: {
            select: {
              id: true,
              name: true,
              iconEmoji: true,
              color: true,
              framingQuestion: true,
            },
          },
        },
      });

      // Update category stats
      await updateCategoryStats(input.categoryId);

      // Check synthesis triggers
      await checkSynthesisTriggers(userId, input.cardId);

      // Emit event
      await emitParticipationEvent("participation_added", {
        userId,
        cardId: input.cardId,
        categoryId: input.categoryId,
        participationId: participation.id,
        semanticRole: input.semanticRole,
        provenance: input.provenanceType,
      });

      // Sync participation to LKGC (non-blocking)
      syncParticipationOnCreate({
        id: participation.id,
        cardId: participation.cardId,
        categoryId: participation.categoryId,
        semanticRole: participation.semanticRole,
        isPrimary: participation.isPrimary,
        category: { userId },
      }).catch(() => {});

      return reply.status(201).send({
        success: true,
        data: participation,
      });
    },
  );

  /**
   * Get participation by ID
   */
  app.get(
    "/:participationId",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Participations"],
        summary: "Get a participation by ID",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { participationId } = request.params as { participationId: string };
      const userId = request.user!.id;

      const participation = await prisma.cardCategoryParticipation.findFirst({
        where: {
          id: participationId,
          card: { userId },
        },
        include: {
          card: {
            select: {
              id: true,
              cardType: true,
              content: true,
              state: true,
              nextReviewDate: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              iconEmoji: true,
              color: true,
              framingQuestion: true,
              semanticIntent: true,
            },
          },
          annotations: {
            where: { isVisible: true },
            orderBy: { importance: "desc" },
            take: 10,
          },
        },
      });

      if (!participation) {
        return reply.status(404).send({
          success: false,
          error: "Participation not found",
        });
      }

      return reply.send({
        success: true,
        data: participation,
      });
    },
  );

  /**
   * Update a participation
   */
  app.patch(
    "/:participationId",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Participations"],
        summary: "Update a participation",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { participationId } = request.params as { participationId: string };
      const input = updateParticipationSchema.parse(request.body);
      const userId = request.user!.id;

      // Find existing participation
      const existing = await prisma.cardCategoryParticipation.findFirst({
        where: {
          id: participationId,
          card: { userId },
        },
      });

      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: "Participation not found",
        });
      }

      // If setting as primary, unset other primaries
      if (input.isPrimary && !existing.isPrimary) {
        await prisma.cardCategoryParticipation.updateMany({
          where: { cardId: existing.cardId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      // Track role change for event
      const previousRole = existing.semanticRole;
      const roleChanged =
        input.semanticRole && input.semanticRole !== previousRole;

      // Update participation
      const updated = await prisma.cardCategoryParticipation.update({
        where: { id: participationId },
        data: input,
        include: {
          category: {
            select: {
              id: true,
              name: true,
              iconEmoji: true,
              color: true,
            },
          },
        },
      });

      // Emit events
      await emitParticipationEvent("participation_updated", {
        userId,
        participationId,
        changes: input,
      });

      if (roleChanged) {
        await emitParticipationEvent("role_changed", {
          userId,
          participationId,
          previousRole,
          newRole: input.semanticRole,
        });
      }

      return reply.send({
        success: true,
        data: updated,
      });
    },
  );

  /**
   * Remove a participation
   */
  app.delete(
    "/:participationId",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Participations"],
        summary: "Remove a participation",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { participationId } = request.params as { participationId: string };
      const reason = (request.query as { reason?: string }).reason;
      const userId = request.user!.id;

      // Find existing participation
      const existing = await prisma.cardCategoryParticipation.findFirst({
        where: {
          id: participationId,
          card: { userId },
        },
      });

      if (!existing) {
        return reply.status(404).send({
          success: false,
          error: "Participation not found",
        });
      }

      // Get count of participations for this card
      const participationCount = await prisma.cardCategoryParticipation.count({
        where: { cardId: existing.cardId },
      });

      // Prevent removing last participation (card must be in at least one category)
      if (participationCount <= 1) {
        return reply.status(400).send({
          success: false,
          error:
            "Cannot remove last participation. Card must be in at least one category.",
        });
      }

      // Delete participation
      await prisma.cardCategoryParticipation.delete({
        where: { id: participationId },
      });

      // Update category stats
      await updateCategoryStats(existing.categoryId);

      // Emit event
      await emitParticipationEvent("participation_removed", {
        userId,
        cardId: existing.cardId,
        categoryId: existing.categoryId,
        participationId,
        reason,
      });

      return reply.send({
        success: true,
        message: "Participation removed",
      });
    },
  );

  // ===========================================================================
  // QUERY OPERATIONS
  // ===========================================================================

  /**
   * List participations with filters
   */
  app.get(
    "/",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Participations"],
        summary: "List participations with filters",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = participationQuerySchema.parse(request.query);
      const userId = request.user!.id;

      // Build where clause
      const where: Prisma.CardCategoryParticipationWhereInput = {
        card: { userId },
      };

      if (query.cardId) where.cardId = query.cardId;
      if (query.categoryId) where.categoryId = query.categoryId;
      if (query.semanticRole) where.semanticRole = query.semanticRole;
      if (query.isPrimary !== undefined) where.isPrimary = query.isPrimary;
      if (query.provenanceType) where.provenanceType = query.provenanceType;

      if (query.minMastery !== undefined || query.maxMastery !== undefined) {
        where.contextMasteryScore = {};
        if (query.minMastery !== undefined)
          where.contextMasteryScore.gte = query.minMastery;
        if (query.maxMastery !== undefined)
          where.contextMasteryScore.lte = query.maxMastery;
      }

      // Build order by
      const orderBy: Prisma.CardCategoryParticipationOrderByWithRelationInput =
        {};
      switch (query.sortBy) {
        case "mastery":
          orderBy.contextMasteryScore = query.sortOrder;
          break;
        case "position":
          orderBy.positionInCategory = query.sortOrder;
          break;
        case "addedAt":
          orderBy.addedAt = query.sortOrder;
          break;
        case "lastReviewed":
          orderBy.lastReviewedInContext = query.sortOrder;
          break;
      }

      const [participations, total] = await Promise.all([
        prisma.cardCategoryParticipation.findMany({
          where,
          orderBy,
          take: query.limit,
          skip: query.offset,
          include: {
            card: {
              select: {
                id: true,
                cardType: true,
                content: true,
                state: true,
                nextReviewDate: true,
              },
            },
            category: {
              select: {
                id: true,
                name: true,
                iconEmoji: true,
                color: true,
                framingQuestion: true,
              },
            },
          },
        }),
        prisma.cardCategoryParticipation.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: participations,
        pagination: {
          total,
          limit: query.limit,
          offset: query.offset,
          hasMore: query.offset + participations.length < total,
        },
      });
    },
  );

  /**
   * Get cards with multiple participations
   */
  app.get(
    "/multi-participation-cards",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Participations"],
        summary: "Get cards with multiple participations",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const queryParams = request.query as {
        minCount?: string;
        limit?: string;
        offset?: string;
      };
      const minCount = parseInt(queryParams.minCount || "2");
      const limit = parseInt(queryParams.limit || "50");
      const offset = parseInt(queryParams.offset || "0");
      const userId = request.user!.id;

      // Group by cardId and filter by count
      const cardCounts = await prisma.cardCategoryParticipation.groupBy({
        by: ["cardId"],
        where: {
          card: { userId },
        },
        _count: { id: true },
        having: {
          id: { _count: { gte: minCount } },
        },
        orderBy: {
          _count: { id: "desc" },
        },
        take: limit,
        skip: offset,
      });

      // Get full card data with participations
      const cardIds = cardCounts.map((c) => c.cardId);
      const cards = await prisma.card.findMany({
        where: { id: { in: cardIds } },
        include: {
          categoryParticipations: {
            include: {
              category: {
                select: {
                  id: true,
                  name: true,
                  iconEmoji: true,
                  color: true,
                },
              },
            },
          },
        },
      });

      // Sort by participation count
      cards.sort(
        (a, b) =>
          b.categoryParticipations.length - a.categoryParticipations.length,
      );

      return reply.send({
        success: true,
        data: cards.map((card) => ({
          card: {
            id: card.id,
            cardType: card.cardType,
            content: card.content,
            state: card.state,
          },
          participationCount: card.categoryParticipations.length,
          participations: card.categoryParticipations,
        })),
      });
    },
  );

  // ===========================================================================
  // CONTEXT-AWARE CARD RESOLUTION
  // ===========================================================================

  /**
   * Get a card as viewed through a specific category lens
   */
  app.get(
    "/card/:cardId/context",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Participations"],
        summary: "Get a card through a category lens",
        description:
          "Returns canonical card data + participation overlay + context-specific additions",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { cardId } = request.params as { cardId: string };
      const query = contextualCardQuerySchema.parse(request.query);
      const userId = request.user!.id;

      // Get card with participation for this context
      const card = await prisma.card.findFirst({
        where: { id: cardId, userId },
        include: {
          categoryParticipations: {
            include: {
              category: {
                select: {
                  id: true,
                  name: true,
                  iconEmoji: true,
                  color: true,
                  framingQuestion: true,
                },
              },
              annotations: query.includeAnnotations
                ? {
                    where: { isVisible: true, showDuringStudy: true },
                    orderBy: { importance: "desc" },
                  }
                : false,
            },
          },
          contextFaces: {
            where: { categoryId: query.categoryId },
          },
        },
      });

      if (!card) {
        return reply.status(404).send({
          success: false,
          error: "Card not found",
        });
      }

      // Find the active participation
      const activeParticipation = card.categoryParticipations.find(
        (p) => p.categoryId === query.categoryId,
      );

      if (!activeParticipation) {
        return reply.status(404).send({
          success: false,
          error: "Card does not participate in this category",
        });
      }

      // Get applied emphasis rules if requested
      let appliedEmphasis: Prisma.EmphasisRuleGetPayload<object>[] = [];
      if (query.includeEmphasis) {
        appliedEmphasis = await prisma.emphasisRule.findMany({
          where: {
            categoryId: query.categoryId,
            isEnabled: true,
            OR: [
              { targetCardIds: { has: cardId } },
              {
                targetSemanticRoles: { has: activeParticipation.semanticRole },
              },
              {
                targetCardIds: { isEmpty: true },
                targetSemanticRoles: { isEmpty: true },
              },
            ],
          },
          orderBy: { priority: "asc" },
        });
      }

      // Check for drift warning
      const divergence = await prisma.performanceDivergence.findFirst({
        where: {
          userId,
          cardId,
          status: "active",
        },
        include: {
          bestContext: { select: { name: true } },
          worstContext: { select: { name: true } },
        },
      });

      // Build response
      const response = {
        // Canonical card data
        cardId: card.id,
        cardType: card.cardType,
        content: card.content,
        state: card.state,
        nextReviewDate: card.nextReviewDate,

        // Global SRS state
        stability: card.stability,
        difficulty: card.difficulty,
        reps: card.reps,
        lapses: card.lapses,

        // Active context
        activeCategoryId: query.categoryId,
        activeCategoryName: activeParticipation.category.name,
        framingQuestion: activeParticipation.category.framingQuestion,

        // Participation overlay
        participation: activeParticipation,

        // Context-specific face overrides
        contextFace: card.contextFaces[0] || null,

        // Annotations
        annotations: activeParticipation.annotations || [],

        // Applied emphasis
        appliedEmphasis: appliedEmphasis.map((rule) => ({
          ruleId: rule.id,
          ruleName: rule.name,
          emphasisLevel: rule.emphasisLevel,
          injectedPrompt: rule.injectedPrompt,
          style: rule.style,
        })),

        // All participations summary
        allParticipations: query.includeAllParticipations
          ? card.categoryParticipations.map((p) => ({
              id: p.id,
              categoryId: p.categoryId,
              categoryName: p.category.name,
              categoryEmoji: p.category.iconEmoji,
              categoryColor: p.category.color,
              semanticRole: p.semanticRole,
              isPrimary: p.isPrimary,
              contextMasteryScore: p.contextMasteryScore,
              hasDriftWarning: divergence?.worstContextId === p.categoryId,
            }))
          : [],

        // Drift info
        hasDriftWarning: !!divergence,
        driftInfo: divergence
          ? {
              hasSignificantDrift: true,
              bestContextId: divergence.bestContextId,
              bestContextName: divergence.bestContext.name,
              bestAccuracy: divergence.bestAccuracy,
              worstContextId: divergence.worstContextId,
              worstContextName: divergence.worstContext.name,
              worstAccuracy: divergence.worstAccuracy,
              performanceSpread: divergence.performanceSpread,
              severity: divergence.severity,
            }
          : null,
      };

      return reply.send({
        success: true,
        data: response,
      });
    },
  );

  // ===========================================================================
  // BULK OPERATIONS
  // ===========================================================================

  /**
   * Bulk add participations
   */
  app.post(
    "/bulk/add",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Participations"],
        summary: "Bulk add cards to a category",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const input = bulkAddParticipationsSchema.parse(request.body);
      const userId = request.user!.id;

      // Verify category exists
      const category = await prisma.category.findFirst({
        where: { id: input.categoryId, userId },
      });

      if (!category) {
        return reply.status(404).send({
          success: false,
          error: "Category not found",
        });
      }

      // Verify cards exist and belong to user
      const cards = await prisma.card.findMany({
        where: { id: { in: input.cardIds }, userId },
        select: { id: true },
      });

      const validCardIds = cards.map((c) => c.id);
      const invalidCardIds = input.cardIds.filter(
        (id) => !validCardIds.includes(id),
      );

      // Get existing participations to make this idempotent
      const existingParticipations =
        await prisma.cardCategoryParticipation.findMany({
          where: {
            cardId: { in: validCardIds },
            categoryId: input.categoryId,
          },
          select: { cardId: true },
        });

      const existingCardIds = existingParticipations.map((p) => p.cardId);
      const newCardIds = validCardIds.filter(
        (id) => !existingCardIds.includes(id),
      );

      // Get next position
      const startPosition = await getNextPositionInCategory(input.categoryId);

      // Create new participations
      const participationsData = newCardIds.map((cardId, index) => ({
        cardId,
        categoryId: input.categoryId,
        semanticRole: input.semanticRole,
        positionInCategory: startPosition + index,
        provenanceType: input.provenanceType,
      }));

      await prisma.cardCategoryParticipation.createMany({
        data: participationsData,
      });

      // Update category stats
      await updateCategoryStats(input.categoryId);

      // Emit events for each new participation
      for (const cardId of newCardIds) {
        await emitParticipationEvent("participation_added", {
          userId,
          cardId,
          categoryId: input.categoryId,
          semanticRole: input.semanticRole,
          provenance: input.provenanceType,
        });

        // Check synthesis triggers
        await checkSynthesisTriggers(userId, cardId);
      }

      return reply.send({
        success: true,
        data: {
          added: newCardIds.length,
          alreadyExisted: existingCardIds.length,
          invalid: invalidCardIds,
        },
      });
    },
  );

  /**
   * Bulk remove participations
   */
  app.post(
    "/bulk/remove",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Participations"],
        summary: "Bulk remove participations",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const input = bulkRemoveParticipationsSchema.parse(request.body);
      const userId = request.user!.id;

      // Get participations that belong to user
      const participations = await prisma.cardCategoryParticipation.findMany({
        where: {
          id: { in: input.participationIds },
          card: { userId },
        },
        select: { id: true, cardId: true, categoryId: true },
      });

      // Check that no card will be left without participations
      const cardIds = [...new Set(participations.map((p) => p.cardId))];
      const cardsWithCounts = await prisma.cardCategoryParticipation.groupBy({
        by: ["cardId"],
        where: { cardId: { in: cardIds } },
        _count: { id: true },
      });

      // Count how many participations we're removing per card
      const removalCounts: Record<string, number> = {};
      for (const p of participations) {
        removalCounts[p.cardId] = (removalCounts[p.cardId] || 0) + 1;
      }

      // Check for cards that would be left with 0 participations
      const invalidRemovals: string[] = [];
      for (const { cardId, _count } of cardsWithCounts) {
        const remaining = _count.id - (removalCounts[cardId] || 0);
        if (remaining < 1) {
          invalidRemovals.push(cardId);
        }
      }

      if (invalidRemovals.length > 0) {
        return reply.status(400).send({
          success: false,
          error: "Cannot remove all participations from cards",
          data: { cardsThatWouldBeOrphaned: invalidRemovals },
        });
      }

      // Delete participations
      const validIds = participations.map((p) => p.id);
      await prisma.cardCategoryParticipation.deleteMany({
        where: { id: { in: validIds } },
      });

      // Update category stats
      const categoryIds = [...new Set(participations.map((p) => p.categoryId))];
      for (const categoryId of categoryIds) {
        await updateCategoryStats(categoryId);
      }

      // Emit events
      for (const p of participations) {
        await emitParticipationEvent("participation_removed", {
          userId,
          cardId: p.cardId,
          categoryId: p.categoryId,
          participationId: p.id,
        });
      }

      return reply.send({
        success: true,
        data: {
          removed: validIds.length,
        },
      });
    },
  );

  /**
   * Bulk update participations
   */
  app.post(
    "/bulk/update",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Participations"],
        summary: "Bulk update participations",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const input = bulkUpdateParticipationsSchema.parse(request.body);
      const userId = request.user!.id;

      // Verify participations belong to user
      const participations = await prisma.cardCategoryParticipation.findMany({
        where: {
          id: { in: input.participationIds },
          card: { userId },
        },
        select: { id: true },
      });

      const validIds = participations.map((p) => p.id);

      // Update
      await prisma.cardCategoryParticipation.updateMany({
        where: { id: { in: validIds } },
        data: input.updates,
      });

      // Emit events
      for (const id of validIds) {
        await emitParticipationEvent("participation_updated", {
          userId,
          participationId: id,
          changes: input.updates,
        });
      }

      return reply.send({
        success: true,
        data: {
          updated: validIds.length,
          notFound: input.participationIds.length - validIds.length,
        },
      });
    },
  );

  // ===========================================================================
  // PERFORMANCE & DIVERGENCE
  // ===========================================================================

  /**
   * Record context-specific performance
   */
  app.post(
    "/:participationId/performance",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Participations"],
        summary: "Record context-specific performance",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { participationId } = request.params as { participationId: string };
      const input = recordContextPerformanceSchema.parse(request.body);
      const userId = request.user!.id;

      // Find participation
      const participation = await prisma.cardCategoryParticipation.findFirst({
        where: {
          id: participationId,
          card: { userId },
        },
      });

      if (!participation) {
        return reply.status(404).send({
          success: false,
          error: "Participation not found",
        });
      }

      // Update participation stats
      const newReviewCount = participation.reviewCountInContext + 1;
      const correctCount = Math.round(
        participation.contextSuccessRate * participation.reviewCountInContext,
      );
      const newCorrectCount = correctCount + (input.isCorrect ? 1 : 0);
      const newSuccessRate = newCorrectCount / newReviewCount;

      // Calculate new mastery score (simple exponential moving average)
      const alpha = 0.2;
      const performanceSignal = input.isCorrect ? 1 : 0;
      const newMasteryScore =
        alpha * performanceSignal +
        (1 - alpha) * participation.contextMasteryScore;

      // Update average response time
      let newAvgResponseTime = participation.avgResponseTimeMs;
      if (input.responseTimeMs !== undefined) {
        if (newAvgResponseTime === null) {
          newAvgResponseTime = input.responseTimeMs;
        } else {
          newAvgResponseTime = Math.round(
            0.2 * input.responseTimeMs + 0.8 * newAvgResponseTime,
          );
        }
      }

      // Update participation
      await prisma.cardCategoryParticipation.update({
        where: { id: participationId },
        data: {
          reviewCountInContext: newReviewCount,
          contextSuccessRate: newSuccessRate,
          contextMasteryScore: newMasteryScore,
          avgResponseTimeMs: newAvgResponseTime,
          confidenceRating: input.confidence ?? participation.confidenceRating,
          lastReviewedInContext: new Date(),
          contextLapseRate: input.isCorrect
            ? participation.contextLapseRate
            : participation.contextLapseRate * 0.9 + 0.1,
        },
      });

      // Check for divergence
      await checkPerformanceDivergence(userId, participation.cardId);

      // Check synthesis triggers
      await checkSynthesisTriggers(userId, participation.cardId);

      return reply.send({
        success: true,
        data: {
          newMasteryScore,
          newSuccessRate,
          reviewCount: newReviewCount,
        },
      });
    },
  );

  /**
   * Get performance divergences
   */
  app.get(
    "/divergences",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Participations"],
        summary: "Get cards with performance divergence across contexts",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = divergenceQuerySchema.parse(request.query);
      const userId = request.user!.id;

      const where: Prisma.PerformanceDivergenceWhereInput = {
        userId,
        performanceSpread: { gte: query.minSpread },
      };

      if (query.severity) where.severity = query.severity;
      if (query.status) where.status = query.status;

      const [divergences, total] = await Promise.all([
        prisma.performanceDivergence.findMany({
          where,
          orderBy: { performanceSpread: "desc" },
          take: query.limit,
          skip: query.offset,
          include: {
            card: {
              select: {
                id: true,
                cardType: true,
                content: true,
              },
            },
            bestContext: {
              select: { id: true, name: true, iconEmoji: true },
            },
            worstContext: {
              select: { id: true, name: true, iconEmoji: true },
            },
          },
        }),
        prisma.performanceDivergence.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: divergences,
        pagination: {
          total,
          limit: query.limit,
          offset: query.offset,
          hasMore: query.offset + divergences.length < total,
        },
      });
    },
  );

  /**
   * Get bridge candidates (cards/categories that might benefit from bridging)
   */
  app.get(
    "/bridge-candidates",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Participations"],
        summary: "Get bridge card candidates",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = bridgeCandidatesQuerySchema.parse(request.query);
      const userId = request.user!.id;

      // Find cards with divergent performance
      const divergences = await prisma.performanceDivergence.findMany({
        where: {
          userId,
          status: "active",
          performanceSpread: { gte: query.minDivergence },
        },
        orderBy: { performanceSpread: "desc" },
        take: query.limit,
        include: {
          card: {
            select: {
              id: true,
              cardType: true,
              content: true,
            },
          },
          bestContext: {
            select: {
              id: true,
              name: true,
              iconEmoji: true,
              framingQuestion: true,
            },
          },
          worstContext: {
            select: {
              id: true,
              name: true,
              iconEmoji: true,
              framingQuestion: true,
            },
          },
        },
      });

      // Generate bridge suggestions
      const candidates = divergences.map((d) => ({
        cardId: d.cardId,
        card: d.card,
        bridgeType: "context_to_context" as const,
        sourceContext: d.bestContext,
        targetContext: d.worstContext,
        performanceSpread: d.performanceSpread,
        suggestedQuestion: `How does understanding "${d.bestContext.name}" help you understand "${d.worstContext.name}" for this concept?`,
        rationale: `Performance divergence of ${Math.round(d.performanceSpread * 100)}% between these contexts suggests a bridging card could help integrate understanding.`,
      }));

      return reply.send({
        success: true,
        data: candidates,
      });
    },
  );
}

export default participationRoutes;
