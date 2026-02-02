/**
 * Synthesis Engine Routes
 *
 * API endpoints for the anti-fragmentation synthesis engine.
 * Manages synthesis prompts, responses, notes, and cross-context learning.
 *
 * The synthesis engine prevents knowledge fragmentation by:
 * 1. Detecting when cards appear in multiple contexts with divergent performance
 * 2. Triggering metacognitive prompts asking users to synthesize
 * 3. Storing synthesis responses as valuable learning artifacts
 * 4. Creating bridge cards from synthesis insights
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "../config/database.js";
import { redis } from "../config/redis.js";
import { authenticate } from "../middleware/auth.js";

// ==============================================================================
// VALIDATION SCHEMAS
// ==============================================================================

const PromptTypeEnum = z.enum([
  "SYNTHESIS",
  "BRIDGE",
  "UNIFICATION",
  "METACOGNITION",
  "DIVERGENCE_REFLECTION",
  "CROSS_CONTEXT",
  "INSIGHT_CAPTURE",
]);

const TriggerTypeEnum = z.enum([
  "PERFORMANCE_DIVERGENCE",
  "CONTEXT_SWITCH",
  "MULTI_CATEGORY_REVIEW",
  "MILESTONE_REACHED",
  "MANUAL",
  "AI_SUGGESTED",
  "SCHEDULED",
  "RETENTION_DROP",
]);

const PromptStatusEnum = z.enum([
  "PENDING",
  "SHOWN",
  "dismissed",
  "responded",
  "EXPIRED",
]);

const SynthesisNoteTypeEnum = z.enum([
  "INSIGHT",
  "CONNECTION",
  "MNEMONIC",
  "EXAMPLE",
  "QUESTION",
  "ELABORATION",
]);

// Schema for creating a synthesis prompt
const CreatePromptSchema = z.object({
  cardId: z.string().uuid(),
  userId: z.string().uuid(),
  promptType: PromptTypeEnum,
  triggerType: TriggerTypeEnum,
  promptText: z.string().min(10).max(2000),
  triggerContextA: z.string().uuid().optional(),
  triggerContextB: z.string().uuid().optional(),
  metadata: z
    .object({
      performanceGapPercent: z.number().optional(),
      contextAName: z.string().optional(),
      contextBName: z.string().optional(),
      relatedCardIds: z.array(z.string().uuid()).optional(),
      suggestedBridgeType: z.string().optional(),
      aiConfidenceScore: z.number().min(0).max(1).optional(),
    })
    .optional(),
  expiresAt: z.string().datetime().optional(),
});

// Schema for batch prompt creation
const CreateBatchPromptsSchema = z.object({
  prompts: z.array(CreatePromptSchema).min(1).max(50),
});

// Schema for updating prompt status
const UpdatePromptStatusSchema = z.object({
  status: PromptStatusEnum,
  dismissReason: z.string().max(500).optional(),
});

// Schema for submitting a synthesis response
const SubmitResponseSchema = z.object({
  promptId: z.string().uuid(),
  userId: z.string().uuid(),
  responseText: z.string().min(10).max(5000),
  selfRating: z.number().int().min(1).max(5).optional(),
  createBridgeCard: z.boolean().default(false),
  bridgeCardData: z
    .object({
      bridgeQuestion: z.string().min(5).max(500),
      bridgeAnswer: z.string().min(5).max(2000),
      connectionType: z.enum([
        "CONCEPTUAL_SIMILARITY",
        "CAUSAL_RELATIONSHIP",
        "TEMPORAL_SEQUENCE",
        "HIERARCHICAL",
        "ANALOGICAL",
        "CONTRASTING",
        "APPLICATION",
        "PREREQUISITE",
        "SYNTHESIS",
        "ELABORATION",
      ]),
      linkedCategoryIds: z.array(z.string().uuid()).min(2).max(10),
    })
    .optional(),
});

// Schema for creating a synthesis note
const CreateNoteSchema = z.object({
  cardId: z.string().uuid(),
  userId: z.string().uuid(),
  noteType: SynthesisNoteTypeEnum,
  content: z.string().min(5).max(5000),
  sourcePromptId: z.string().uuid().optional(),
  sourceResponseId: z.string().uuid().optional(),
  linkedCardIds: z.array(z.string().uuid()).max(20).optional(),
  linkedCategoryIds: z.array(z.string().uuid()).max(10).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  isVisible: z.boolean().default(false),
});

// Schema for updating a synthesis note
const UpdateNoteSchema = z.object({
  content: z.string().min(5).max(5000).optional(),
  noteType: SynthesisNoteTypeEnum.optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  linkedCardIds: z.array(z.string().uuid()).max(20).optional(),
  linkedCategoryIds: z.array(z.string().uuid()).max(10).optional(),
  isVisible: z.boolean().optional(),
});

// Schema for divergence analysis request
const AnalyzeDivergenceSchema = z.object({
  cardId: z.string().uuid(),
  userId: z.string().uuid(),
  minPerformanceGap: z.number().min(0).max(100).default(20),
  minReviewsPerContext: z.number().int().min(3).max(100).default(5),
});

// Schema for cross-context quiz creation
const CreateCrossContextQuizSchema = z.object({
  cardId: z.string().uuid(),
  userId: z.string().uuid(),
  questionText: z.string().min(10).max(1000),
  correctAnswer: z.string().min(1).max(2000),
  distractors: z.array(z.string().max(500)).min(1).max(5),
  involvedContextIds: z.array(z.string().uuid()).min(2).max(10),
  difficulty: z.number().int().min(1).max(5).default(3),
});

// Schema for recording cross-context quiz attempt
const RecordQuizAttemptSchema = z.object({
  quizId: z.string().uuid(),
  userId: z.string().uuid(),
  selectedAnswer: z.string().max(2000),
  isCorrect: z.boolean(),
  responseTimeMs: z.number().int().min(0).max(300000),
});

// Query schemas
const PaginationSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const PromptQuerySchema = PaginationSchema.extend({
  userId: z.string().uuid(),
  status: PromptStatusEnum.optional(),
  promptType: PromptTypeEnum.optional(),
  triggerType: TriggerTypeEnum.optional(),
  cardId: z.string().uuid().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  includeExpired: z.coerce.boolean().default(false),
});

const NoteQuerySchema = PaginationSchema.extend({
  cardId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  noteType: SynthesisNoteTypeEnum.optional(),
  includePublic: z.coerce.boolean().default(false),
  tags: z.string().optional(), // Comma-separated
  searchTerm: z.string().max(100).optional(),
});

// ==============================================================================
// SYNTHESIS ENGINE ROUTES
// ==============================================================================

const synthesisRoutes: FastifyPluginAsync = async (fastify) => {
  const log = fastify.log;

  // Cache key generators
  const cacheKeys = {
    userPendingPrompts: (userId: string) =>
      `synthesis:prompts:pending:${userId}`,
    cardNotes: (cardId: string) => `synthesis:notes:card:${cardId}`,
    userNotes: (userId: string) => `synthesis:notes:user:${userId}`,
    divergenceAnalysis: (cardId: string, userId: string) =>
      `synthesis:divergence:${cardId}:${userId}`,
    crossContextQuizzes: (cardId: string) => `synthesis:quizzes:${cardId}`,
  };

  // Cache TTLs
  const CACHE_TTL = {
    PENDING_PROMPTS: 300, // 5 minutes
    NOTES: 600, // 10 minutes
    DIVERGENCE: 1800, // 30 minutes
    QUIZZES: 900, // 15 minutes
  };

  // Helper to invalidate related caches
  async function invalidateSynthesisCache(params: {
    userId?: string;
    cardId?: string;
  }) {
    if (!redis) return;

    const keysToDelete: string[] = [];

    if (params.userId) {
      keysToDelete.push(
        cacheKeys.userPendingPrompts(params.userId),
        cacheKeys.userNotes(params.userId),
      );
    }

    if (params.cardId) {
      keysToDelete.push(
        cacheKeys.cardNotes(params.cardId),
        cacheKeys.crossContextQuizzes(params.cardId),
      );

      if (params.userId) {
        keysToDelete.push(
          cacheKeys.divergenceAnalysis(params.cardId, params.userId),
        );
      }
    }

    if (keysToDelete.length > 0) {
      await redis.del(keysToDelete);
    }
  }

  // ===========================================================================
  // SYNTHESIS PROMPTS
  // ===========================================================================

  /**
   * POST /synthesis/prompts
   * Create a new synthesis prompt
   */
  fastify.post("/prompts", async (request, reply) => {
    const validation = CreatePromptSchema.safeParse(request.body);

    if (!validation.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: validation.error.issues,
      });
    }

    const data = validation.data;

    // Verify card exists
    const card = await prisma.card.findUnique({
      where: { id: data.cardId },
      select: { id: true, userId: true, deckId: true },
    });

    if (!card) {
      return reply.status(404).send({ error: "Card not found" });
    }

    // Verify user has access to card
    if (card.userId !== data.userId) {
      // Check if user has access through shared deck
      const deck = await prisma.deck.findFirst({
        where: {
          id: card.deckId,
          OR: [{ userId: data.userId }, { isPublic: true }],
        },
      });

      if (!deck) {
        return reply.status(403).send({
          error: "No access to this card",
        });
      }
    }

    // Create the prompt
    const prompt = await prisma.synthesisPrompt.create({
      data: {
        cardId: data.cardId,
        userId: data.userId,
        promptType: data.promptType,
        triggerType: data.triggerType,
        promptText: data.promptText,
        categoryIds:
          data.triggerContextA && data.triggerContextB
            ? [data.triggerContextA, data.triggerContextB]
            : data.triggerContextA
              ? [data.triggerContextA]
              : [],
        triggerDetails: data.metadata || {},
        status: "pending",
        deferredUntil: data.expiresAt ? new Date(data.expiresAt) : null,
      },
      include: {
        card: {
          select: {
            id: true,
            content: true,
          },
        },
      },
    });

    // Invalidate cache
    await invalidateSynthesisCache({
      userId: data.userId,
      cardId: data.cardId,
    });

    log.info(
      { promptId: prompt.id, userId: data.userId },
      "Synthesis prompt created",
    );

    return reply.status(201).send({
      success: true,
      data: prompt,
    });
  });

  /**
   * POST /synthesis/prompts/batch
   * Create multiple synthesis prompts at once
   */
  fastify.post("/prompts/batch", async (request, reply) => {
    const validation = CreateBatchPromptsSchema.safeParse(request.body);

    if (!validation.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: validation.error.issues,
      });
    }

    const { prompts: promptsData } = validation.data;

    // Verify all cards exist and user has access
    const cardIds = [...new Set(promptsData.map((p) => p.cardId))];
    const userId = promptsData[0].userId;

    // Ensure all prompts are for the same user
    if (!promptsData.every((p) => p.userId === userId)) {
      return reply.status(400).send({
        error: "Batch prompts must all be for the same user",
      });
    }

    const cards = await prisma.card.findMany({
      where: {
        id: { in: cardIds },
        OR: [
          { userId: userId },
          {
            deck: {
              isPublic: true,
            },
          },
        ],
      },
      select: { id: true },
    });

    const accessibleCardIds = new Set(cards.map((c) => c.id));
    const inaccessibleCards = cardIds.filter(
      (id) => !accessibleCardIds.has(id),
    );

    if (inaccessibleCards.length > 0) {
      return reply.status(403).send({
        error: "Some cards are not accessible",
        inaccessibleCardIds: inaccessibleCards,
      });
    }

    // Create all prompts in a transaction
    const prompts = await prisma.$transaction(
      promptsData.map((data) =>
        prisma.synthesisPrompt.create({
          data: {
            cardId: data.cardId,
            userId: data.userId,
            promptType: data.promptType,
            triggerType: data.triggerType,
            promptText: data.promptText,
            categoryIds:
              data.triggerContextA && data.triggerContextB
                ? [data.triggerContextA, data.triggerContextB]
                : data.triggerContextA
                  ? [data.triggerContextA]
                  : [],
            triggerDetails: data.metadata || {},
            status: "pending",
            deferredUntil: data.expiresAt ? new Date(data.expiresAt) : null,
          },
        }),
      ),
    );

    // Invalidate cache
    await invalidateSynthesisCache({ userId });
    for (const cardId of cardIds) {
      await invalidateSynthesisCache({ cardId });
    }

    log.info(
      { count: prompts.length, userId },
      "Batch synthesis prompts created",
    );

    return reply.status(201).send({
      success: true,
      data: {
        created: prompts.length,
        prompts,
      },
    });
  });

  /**
   * GET /synthesis/prompts
   * Query synthesis prompts with filtering
   */
  fastify.get("/prompts", async (request, reply) => {
    const validation = PromptQuerySchema.safeParse(request.query);

    if (!validation.success) {
      return reply.status(400).send({
        error: "Invalid query parameters",
        details: validation.error.issues,
      });
    }

    const {
      userId,
      status,
      promptType,
      triggerType,
      cardId,
      fromDate,
      toDate,
      includeExpired,
      cursor,
      limit,
    } = validation.data;

    // Build where clause
    const where: Record<string, unknown> = {
      userId,
    };

    if (status) {
      where.status = status;
    }

    if (promptType) {
      where.promptType = promptType;
    }

    if (triggerType) {
      where.triggerType = triggerType;
    }

    if (cardId) {
      where.cardId = cardId;
    }

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        (where.createdAt as Record<string, Date>).gte = new Date(fromDate);
      }
      if (toDate) {
        (where.createdAt as Record<string, Date>).lte = new Date(toDate);
      }
    }

    if (!includeExpired) {
      where.OR = [
        { deferredUntil: null },
        { deferredUntil: { gt: new Date() } },
      ];
    }

    // Apply cursor pagination
    if (cursor) {
      where.id = { lt: cursor };
    }

    const prompts = await prisma.synthesisPrompt.findMany({
      where,
      take: limit + 1,
      orderBy: { createdAt: "desc" },
      include: {
        card: {
          select: {
            id: true,
            content: true,
          },
        },
        responses: {
          select: {
            id: true,
            responseText: true,
            selfRating: true,
            createdAt: true,
          },
        },
      },
    });

    const hasMore = prompts.length > limit;
    const items = hasMore ? prompts.slice(0, -1) : prompts;

    return reply.send({
      success: true,
      data: {
        items,
        pagination: {
          hasMore,
          nextCursor: hasMore ? items[items.length - 1].id : null,
          count: items.length,
        },
      },
    });
  });

  /**
   * GET /synthesis/prompts/pending
   * Get pending prompts for a user (optimized for mobile)
   */
  fastify.get("/prompts/pending", async (request, reply) => {
    const querySchema = z.object({
      userId: z.string().uuid(),
      limit: z.coerce.number().int().min(1).max(50).default(10),
    });

    const validation = querySchema.safeParse(request.query);

    if (!validation.success) {
      return reply.status(400).send({
        error: "Invalid query parameters",
        details: validation.error.issues,
      });
    }

    const { userId, limit } = validation.data;

    // Try cache first
    if (redis) {
      const cached = await redis.get(cacheKeys.userPendingPrompts(userId));
      if (cached) {
        const parsed = JSON.parse(cached);
        return reply.send({
          success: true,
          data: {
            items: parsed.slice(0, limit),
            fromCache: true,
          },
        });
      }
    }

    const prompts = await prisma.synthesisPrompt.findMany({
      where: {
        userId,
        status: "PENDING",
        OR: [{ deferredUntil: null }, { deferredUntil: { gt: new Date() } }],
      },
      take: 50, // Cache more than requested
      orderBy: [
        { triggerType: "asc" }, // Prioritize certain trigger types
        { createdAt: "asc" }, // Oldest first
      ],
      include: {
        card: {
          select: {
            id: true,
            content: true,
            categoryParticipations: {
              select: {
                category: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                semanticRole: true,
              },
            },
          },
        },
      },
    });

    // Cache the results
    if (redis && prompts.length > 0) {
      await redis.setex(
        cacheKeys.userPendingPrompts(userId),
        CACHE_TTL.PENDING_PROMPTS,
        JSON.stringify(prompts),
      );
    }

    return reply.send({
      success: true,
      data: {
        items: prompts.slice(0, limit),
        totalPending: prompts.length,
        fromCache: false,
      },
    });
  });

  /**
   * GET /synthesis/prompts/:promptId
   * Get a specific synthesis prompt
   */
  fastify.get("/prompts/:promptId", async (request, reply) => {
    const params = z
      .object({ promptId: z.string().uuid() })
      .safeParse(request.params);

    if (!params.success) {
      return reply.status(400).send({ error: "Invalid prompt ID" });
    }

    const prompt = await prisma.synthesisPrompt.findUnique({
      where: { id: params.data.promptId },
      include: {
        card: {
          select: {
            id: true,
            content: true,
            categoryParticipations: {
              include: {
                category: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
        user: {
          select: { id: true, displayName: true },
        },
        responses: true,
      },
    });

    if (!prompt) {
      return reply.status(404).send({ error: "Synthesis prompt not found" });
    }

    return reply.send({
      success: true,
      data: prompt,
    });
  });

  /**
   * PATCH /synthesis/prompts/:promptId/status
   * Update a prompt's status
   */
  fastify.patch("/prompts/:promptId/status", async (request, reply) => {
    const params = z
      .object({ promptId: z.string().uuid() })
      .safeParse(request.params);
    const validation = UpdatePromptStatusSchema.safeParse(request.body);

    if (!params.success) {
      return reply.status(400).send({ error: "Invalid prompt ID" });
    }

    if (!validation.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: validation.error.issues,
      });
    }

    const { status, dismissReason } = validation.data;

    const existing = await prisma.synthesisPrompt.findUnique({
      where: { id: params.data.promptId },
      select: { id: true, userId: true, cardId: true, status: true },
    });

    if (!existing) {
      return reply.status(404).send({ error: "Synthesis prompt not found" });
    }

    // Update with status change details
    const updateData: Record<string, unknown> = { status };

    if (status.toLowerCase() === "shown") {
      updateData.shownAt = new Date();
      updateData.timesShown = { increment: 1 };
    } else if (status.toLowerCase() === "skipped" || status === "dismissed") {
      updateData.skippedAt = new Date();
    } else if (status.toLowerCase() === "responded" || status === "responded") {
      updateData.respondedAt = new Date();
    }

    const prompt = await prisma.synthesisPrompt.update({
      where: { id: params.data.promptId },
      data: updateData as any,
    });

    // Invalidate cache
    await invalidateSynthesisCache({
      userId: existing.userId,
      cardId: existing.cardId,
    });

    log.info(
      {
        promptId: prompt.id,
        previousStatus: existing.status,
        newStatus: status,
      },
      "Synthesis prompt status updated",
    );

    return reply.send({
      success: true,
      data: prompt,
    });
  });

  /**
   * DELETE /synthesis/prompts/:promptId
   * Delete a synthesis prompt
   */
  fastify.delete("/prompts/:promptId", async (request, reply) => {
    const params = z
      .object({ promptId: z.string().uuid() })
      .safeParse(request.params);

    if (!params.success) {
      return reply.status(400).send({ error: "Invalid prompt ID" });
    }

    const existing = await prisma.synthesisPrompt.findUnique({
      where: { id: params.data.promptId },
      select: { id: true, userId: true, cardId: true },
    });

    if (!existing) {
      return reply.status(404).send({ error: "Synthesis prompt not found" });
    }

    await prisma.synthesisPrompt.delete({
      where: { id: params.data.promptId },
    });

    // Invalidate cache
    await invalidateSynthesisCache({
      userId: existing.userId,
      cardId: existing.cardId,
    });

    log.info({ promptId: params.data.promptId }, "Synthesis prompt deleted");

    return reply.send({
      success: true,
      message: "Synthesis prompt deleted",
    });
  });

  // ===========================================================================
  // SYNTHESIS RESPONSES
  // ===========================================================================

  /**
   * POST /synthesis/responses
   * Submit a synthesis response (optionally creating a bridge card)
   */
  fastify.post("/responses", async (request, reply) => {
    const validation = SubmitResponseSchema.safeParse(request.body);

    if (!validation.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: validation.error.issues,
      });
    }

    const data = validation.data;

    // Verify prompt exists and belongs to user
    const prompt = await prisma.synthesisPrompt.findUnique({
      where: { id: data.promptId },
      include: {
        card: {
          select: { id: true, content: true },
        },
      },
    });

    if (!prompt) {
      return reply.status(404).send({ error: "Synthesis prompt not found" });
    }

    if (prompt.userId !== data.userId) {
      return reply.status(403).send({
        error: "Cannot respond to another user's prompt",
      });
    }

    if (prompt.status === "responded") {
      return reply.status(409).send({
        error: "This prompt has already been responded to",
      });
    }

    // If creating bridge card, validate the data
    if (data.createBridgeCard && !data.bridgeCardData) {
      return reply.status(400).send({
        error: "Bridge card data required when createBridgeCard is true",
      });
    }

    // Perform in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the response
      const response = await tx.synthesisResponse.create({
        data: {
          promptId: data.promptId,
          userId: data.userId,
          responseText: data.responseText,
          selfRating: data.selfRating || null,
        },
      });

      // Update prompt status
      await tx.synthesisPrompt.update({
        where: { id: data.promptId },
        data: { status: "responded" },
      });

      let bridgeCard = null;

      // Create bridge card if requested
      if (data.createBridgeCard && data.bridgeCardData) {
        // Get category IDs for source and target
        const categoryIds = data.bridgeCardData.linkedCategoryIds;
        const sourceCategoryId = categoryIds[0] || null;
        const targetCategoryId = categoryIds[1] || null;

        bridgeCard = await tx.bridgeCard.create({
          data: {
            cardId: prompt.cardId,
            userId: data.userId,
            bridgeType: "context_to_context",
            bridgeQuestion: data.bridgeCardData.bridgeQuestion,
            bridgeAnswer: data.bridgeCardData.bridgeAnswer,
            connectionType: data.bridgeCardData.connectionType
              .toLowerCase()
              .replace(/_/g, "_") as string,
            sourceCategoryId,
            targetCategoryId,
            createdFrom: "synthesis_prompt",
            sourceId: data.promptId,
            frequencyMultiplier: 0.3, // Default to showing 30% of the time
            status: "active",
            isUserConfirmed: true,
          },
        });

        // Update response with bridge card reference
        await tx.synthesisResponse.update({
          where: { id: response.id },
          data: { createdBridgeCardDraftId: bridgeCard.id },
        });

        // Create participations for the bridge card's source card
        // in all the linked categories if they don't exist
        for (const categoryId of data.bridgeCardData.linkedCategoryIds) {
          const existingParticipation =
            await tx.cardCategoryParticipation.findFirst({
              where: {
                cardId: prompt.cardId,
                categoryId,
              },
            });

          if (!existingParticipation) {
            await tx.cardCategoryParticipation.create({
              data: {
                cardId: prompt.cardId,
                categoryId,
                semanticRole: "bridge",
                provenanceType: "synthesis_generated",
                provenanceRef: response.id,
                belongsBecause: "Created from synthesis response bridge card",
              },
            });
          }
        }
      }

      return { response, bridgeCard };
    });

    // Invalidate cache
    await invalidateSynthesisCache({
      userId: data.userId,
      cardId: prompt.cardId,
    });

    log.info(
      {
        responseId: result.response.id,
        promptId: data.promptId,
        bridgeCardCreated: !!result.bridgeCard,
      },
      "Synthesis response submitted",
    );

    return reply.status(201).send({
      success: true,
      data: result,
    });
  });

  /**
   * GET /synthesis/responses/:responseId
   * Get a specific synthesis response
   */
  fastify.get("/responses/:responseId", async (request, reply) => {
    const params = z
      .object({ responseId: z.string().uuid() })
      .safeParse(request.params);

    if (!params.success) {
      return reply.status(400).send({ error: "Invalid response ID" });
    }

    const response = await prisma.synthesisResponse.findUnique({
      where: { id: params.data.responseId },
      include: {
        prompt: {
          include: {
            card: {
              select: { id: true, content: true },
            },
          },
        },
        user: {
          select: { id: true, displayName: true },
        },
      },
    });

    if (!response) {
      return reply.status(404).send({ error: "Synthesis response not found" });
    }

    return reply.send({
      success: true,
      data: response,
    });
  });

  /**
   * GET /synthesis/responses/user/:userId
   * Get all synthesis responses for a user
   */
  fastify.get("/responses/user/:userId", async (request, reply) => {
    const params = z
      .object({ userId: z.string().uuid() })
      .safeParse(request.params);
    const queryValidation = PaginationSchema.extend({
      promptType: PromptTypeEnum.optional(),
      hasQualityRating: z.coerce.boolean().optional(),
      createdBridgeCard: z.coerce.boolean().optional(),
    }).safeParse(request.query);

    if (!params.success) {
      return reply.status(400).send({ error: "Invalid user ID" });
    }

    if (!queryValidation.success) {
      return reply.status(400).send({
        error: "Invalid query parameters",
        details: queryValidation.error.issues,
      });
    }

    const { cursor, limit, promptType, hasQualityRating, createdBridgeCard } =
      queryValidation.data;

    const where: Record<string, unknown> = {
      userId: params.data.userId,
    };

    if (promptType) {
      where.prompt = { promptType };
    }

    if (hasQualityRating !== undefined) {
      where.selfRating = hasQualityRating ? { not: null } : null;
    }

    if (createdBridgeCard !== undefined) {
      where.createdBridgeCardDraftId = createdBridgeCard ? { not: null } : null;
    }

    if (cursor) {
      where.id = { lt: cursor };
    }

    const responses = await prisma.synthesisResponse.findMany({
      where,
      take: limit + 1,
      orderBy: { createdAt: "desc" },
      include: {
        prompt: {
          select: {
            id: true,
            promptType: true,
            triggerType: true,
            promptText: true,
            card: {
              select: { id: true, content: true },
            },
          },
        },
      },
    });

    const hasMore = responses.length > limit;
    const items = hasMore ? responses.slice(0, -1) : responses;

    return reply.send({
      success: true,
      data: {
        items,
        pagination: {
          hasMore,
          nextCursor: hasMore ? items[items.length - 1].id : null,
          count: items.length,
        },
      },
    });
  });

  /**
   * PATCH /synthesis/responses/:responseId/rating
   * Update quality rating for a synthesis response
   */
  fastify.patch("/responses/:responseId/rating", async (request, reply) => {
    const params = z
      .object({ responseId: z.string().uuid() })
      .safeParse(request.params);
    const validation = z
      .object({
        selfRating: z.number().int().min(1).max(5),
      })
      .safeParse(request.body);

    if (!params.success) {
      return reply.status(400).send({ error: "Invalid response ID" });
    }

    if (!validation.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: validation.error.issues,
      });
    }

    const response = await prisma.synthesisResponse.update({
      where: { id: params.data.responseId },
      data: { selfRating: validation.data.selfRating },
    });

    log.info(
      {
        responseId: params.data.responseId,
        rating: validation.data.selfRating,
      },
      "Synthesis response rating updated",
    );

    return reply.send({
      success: true,
      data: response,
    });
  });

  // ===========================================================================
  // SYNTHESIS NOTES
  // ===========================================================================

  /**
   * POST /synthesis/notes
   * Create a synthesis note
   */
  fastify.post("/notes", async (request, reply) => {
    const validation = CreateNoteSchema.safeParse(request.body);

    if (!validation.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: validation.error.issues,
      });
    }

    const data = validation.data;

    // Verify card exists and user has access
    const card = await prisma.card.findUnique({
      where: { id: data.cardId },
      select: { id: true, userId: true, deckId: true },
    });

    if (!card) {
      return reply.status(404).send({ error: "Card not found" });
    }

    if (card.userId !== data.userId) {
      const deck = await prisma.deck.findFirst({
        where: {
          id: card.deckId,
          OR: [{ userId: data.userId }, { isPublic: true }],
        },
      });

      if (!deck) {
        return reply.status(403).send({ error: "No access to this card" });
      }
    }

    const note = await prisma.synthesisNote.create({
      data: {
        cardId: data.cardId,
        userId: data.userId,
        noteType: data.noteType,
        content: data.content,
        sourceType: data.sourcePromptId ? "synthesis_prompt" : "manual",
        sourceId: data.sourcePromptId || data.sourceResponseId || null,
        referencedCardIds: data.linkedCardIds || [],
        categoryIds: data.linkedCategoryIds || [],
        keyTerms: data.tags || [],
        isVisible: true,
        showDuringReview: true,
      },
      include: {
        card: {
          select: { id: true, content: true },
        },
      },
    });

    // Invalidate cache
    await invalidateSynthesisCache({
      userId: data.userId,
      cardId: data.cardId,
    });

    log.info(
      { noteId: note.id, cardId: data.cardId },
      "Synthesis note created",
    );

    return reply.status(201).send({
      success: true,
      data: note,
    });
  });

  /**
   * GET /synthesis/notes
   * Query synthesis notes
   */
  fastify.get("/notes", async (request, reply) => {
    const validation = NoteQuerySchema.safeParse(request.query);

    if (!validation.success) {
      return reply.status(400).send({
        error: "Invalid query parameters",
        details: validation.error.issues,
      });
    }

    const {
      cardId,
      userId,
      noteType,
      includePublic,
      tags,
      searchTerm,
      cursor,
      limit,
    } = validation.data;

    // Must provide either cardId or userId
    if (!cardId && !userId) {
      return reply.status(400).send({
        error: "Either cardId or userId is required",
      });
    }

    const where: Record<string, unknown> = {};

    if (cardId) {
      where.cardId = cardId;
    }

    if (userId) {
      if (includePublic) {
        where.OR = [{ userId }, { isPublic: true }];
      } else {
        where.userId = userId;
      }
    }

    if (noteType) {
      where.noteType = noteType;
    }

    if (tags) {
      const tagList = tags.split(",").map((t) => t.trim());
      where.tags = { hasSome: tagList };
    }

    if (searchTerm) {
      where.content = {
        contains: searchTerm,
        mode: "insensitive",
      };
    }

    if (cursor) {
      where.id = { lt: cursor };
    }

    const notes = await prisma.synthesisNote.findMany({
      where,
      take: limit + 1,
      orderBy: { createdAt: "desc" },
      include: {
        card: {
          select: { id: true, content: true },
        },
        user: {
          select: { id: true, displayName: true },
        },
      },
    });

    const hasMore = notes.length > limit;
    const items = hasMore ? notes.slice(0, -1) : notes;

    return reply.send({
      success: true,
      data: {
        items,
        pagination: {
          hasMore,
          nextCursor: hasMore ? items[items.length - 1].id : null,
          count: items.length,
        },
      },
    });
  });

  /**
   * GET /synthesis/notes/card/:cardId
   * Get all notes for a card (optimized with caching)
   */
  fastify.get("/notes/card/:cardId", async (request, reply) => {
    const params = z
      .object({ cardId: z.string().uuid() })
      .safeParse(request.params);
    const querySchema = z.object({
      userId: z.string().uuid().optional(),
      includePublic: z.coerce.boolean().default(true),
    });
    const queryValidation = querySchema.safeParse(request.query);

    if (!params.success) {
      return reply.status(400).send({ error: "Invalid card ID" });
    }

    if (!queryValidation.success) {
      return reply.status(400).send({
        error: "Invalid query parameters",
      });
    }

    const { userId, includePublic } = queryValidation.data;
    const cardId = params.data.cardId;

    // Try cache first
    if (redis) {
      const cached = await redis.get(cacheKeys.cardNotes(cardId));
      if (cached) {
        const allNotes = JSON.parse(cached);
        // Filter based on user and public visibility
        const filteredNotes = allNotes.filter(
          (note: { userId: string; isVisible: boolean }) => {
            if (userId && note.userId === userId) return true;
            if (includePublic && note.isVisible) return true;
            return false;
          },
        );
        return reply.send({
          success: true,
          data: {
            items: filteredNotes,
            fromCache: true,
          },
        });
      }
    }

    const notes = await prisma.synthesisNote.findMany({
      where: { cardId },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { id: true, displayName: true },
        },
      },
    });

    // Cache all notes for the card
    if (redis) {
      await redis.setex(
        cacheKeys.cardNotes(cardId),
        CACHE_TTL.NOTES,
        JSON.stringify(notes),
      );
    }

    // Filter based on user and public visibility
    const filteredNotes = notes.filter((note) => {
      if (userId && note.userId === userId) return true;
      if (includePublic && note.isVisible) return true;
      return false;
    });

    return reply.send({
      success: true,
      data: {
        items: filteredNotes,
        fromCache: false,
      },
    });
  });

  /**
   * GET /synthesis/notes/:noteId
   * Get a specific note
   */
  fastify.get("/notes/:noteId", async (request, reply) => {
    const params = z
      .object({ noteId: z.string().uuid() })
      .safeParse(request.params);

    if (!params.success) {
      return reply.status(400).send({ error: "Invalid note ID" });
    }

    const note = await prisma.synthesisNote.findUnique({
      where: { id: params.data.noteId },
      include: {
        card: {
          select: { id: true, content: true },
        },
        user: {
          select: { id: true, displayName: true },
        },
      },
    });

    if (!note) {
      return reply.status(404).send({ error: "Synthesis note not found" });
    }

    return reply.send({
      success: true,
      data: note,
    });
  });

  /**
   * PATCH /synthesis/notes/:noteId
   * Update a synthesis note
   */
  fastify.patch("/notes/:noteId", async (request, reply) => {
    const params = z
      .object({ noteId: z.string().uuid() })
      .safeParse(request.params);
    const validation = UpdateNoteSchema.safeParse(request.body);

    if (!params.success) {
      return reply.status(400).send({ error: "Invalid note ID" });
    }

    if (!validation.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: validation.error.issues,
      });
    }

    const existing = await prisma.synthesisNote.findUnique({
      where: { id: params.data.noteId },
      select: { id: true, userId: true, cardId: true },
    });

    if (!existing) {
      return reply.status(404).send({ error: "Synthesis note not found" });
    }

    const note = await prisma.synthesisNote.update({
      where: { id: params.data.noteId },
      data: validation.data,
      include: {
        card: {
          select: { id: true, content: true },
        },
      },
    });

    // Invalidate cache
    await invalidateSynthesisCache({
      userId: existing.userId,
      cardId: existing.cardId,
    });

    log.info({ noteId: params.data.noteId }, "Synthesis note updated");

    return reply.send({
      success: true,
      data: note,
    });
  });

  /**
   * DELETE /synthesis/notes/:noteId
   * Delete a synthesis note
   */
  fastify.delete("/notes/:noteId", async (request, reply) => {
    const params = z
      .object({ noteId: z.string().uuid() })
      .safeParse(request.params);

    if (!params.success) {
      return reply.status(400).send({ error: "Invalid note ID" });
    }

    const existing = await prisma.synthesisNote.findUnique({
      where: { id: params.data.noteId },
      select: { id: true, userId: true, cardId: true },
    });

    if (!existing) {
      return reply.status(404).send({ error: "Synthesis note not found" });
    }

    await prisma.synthesisNote.delete({
      where: { id: params.data.noteId },
    });

    // Invalidate cache
    await invalidateSynthesisCache({
      userId: existing.userId,
      cardId: existing.cardId,
    });

    log.info({ noteId: params.data.noteId }, "Synthesis note deleted");

    return reply.send({
      success: true,
      message: "Synthesis note deleted",
    });
  });

  // ===========================================================================
  // DIVERGENCE ANALYSIS
  // ===========================================================================

  /**
   * POST /synthesis/divergence/analyze
   * Analyze performance divergence for a card across contexts
   */
  fastify.post("/divergence/analyze", async (request, reply) => {
    const validation = AnalyzeDivergenceSchema.safeParse(request.body);

    if (!validation.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: validation.error.issues,
      });
    }

    const { cardId, userId, minPerformanceGap, minReviewsPerContext } =
      validation.data;

    // Try cache first
    if (redis) {
      const cached = await redis.get(
        cacheKeys.divergenceAnalysis(cardId, userId),
      );
      if (cached) {
        return reply.send({
          success: true,
          data: JSON.parse(cached),
          fromCache: true,
        });
      }
    }

    // Get all participations with their context-specific performance
    const participations = await prisma.cardCategoryParticipation.findMany({
      where: { cardId },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });

    if (participations.length < 2) {
      return reply.send({
        success: true,
        data: {
          hasDivergence: false,
          reason: "Card exists in fewer than 2 contexts",
          contexts: participations.length,
        },
      });
    }

    // Calculate performance metrics per context
    // Get reviews grouped by category context
    const reviews = await prisma.reviewRecord.findMany({
      where: {
        cardId,
        userId,
      },
      select: {
        rating: true,
        createdAt: true,
        responseTime: true,
        reviewType: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500, // Limit to recent reviews
    });

    // For each participation, calculate performance metrics
    const contextPerformance = participations.map((p) => {
      // Get context-specific difficulty from participation
      const contextDifficulty = p.contextDifficulty ?? 0.5;
      const reviewCount = p.reviewCountInContext ?? 0;
      const correctCount = p.contextSuccessRate ?? 0;

      const accuracy = reviewCount > 0 ? (correctCount / reviewCount) * 100 : 0;

      return {
        categoryId: p.categoryId,
        categoryName: p.category.name,
        difficulty: contextDifficulty,
        reviewCount,
        correctCount,
        accuracy,
        meetsMinReviews: reviewCount >= minReviewsPerContext,
      };
    });

    // Filter to only contexts with enough reviews
    const validContexts = contextPerformance.filter((c) => c.meetsMinReviews);

    if (validContexts.length < 2) {
      return reply.send({
        success: true,
        data: {
          hasDivergence: false,
          reason: "Not enough contexts with sufficient review data",
          contextsWithEnoughData: validContexts.length,
          requiredContexts: 2,
          minReviewsPerContext,
        },
      });
    }

    // Calculate divergence
    const accuracies = validContexts.map((c) => c.accuracy);
    const maxAccuracy = Math.max(...accuracies);
    const minAccuracy = Math.min(...accuracies);
    const accuracySpread = maxAccuracy - minAccuracy;

    const difficulties = validContexts.map((c) => c.difficulty);
    const maxDifficulty = Math.max(...difficulties);
    const minDifficulty = Math.min(...difficulties);
    const difficultySpread = (maxDifficulty - minDifficulty) * 100;

    const hasDivergence =
      accuracySpread >= minPerformanceGap ||
      difficultySpread >= minPerformanceGap;

    const analysisResult = {
      hasDivergence,
      metrics: {
        accuracySpread,
        difficultySpread,
        threshold: minPerformanceGap,
      },
      contexts: validContexts.sort((a, b) => b.accuracy - a.accuracy),
      bestContext: validContexts.reduce((best, c) =>
        c.accuracy > best.accuracy ? c : best,
      ),
      worstContext: validContexts.reduce((worst, c) =>
        c.accuracy < worst.accuracy ? c : worst,
      ),
      suggestedAction: hasDivergence
        ? "Consider creating a bridge card or synthesis prompt"
        : "Performance is consistent across contexts",
      analyzedAt: new Date().toISOString(),
    };

    // Cache the result
    if (redis) {
      await redis.setex(
        cacheKeys.divergenceAnalysis(cardId, userId),
        CACHE_TTL.DIVERGENCE,
        JSON.stringify(analysisResult),
      );
    }

    // If significant divergence, optionally record it
    if (hasDivergence && accuracySpread >= minPerformanceGap * 1.5) {
      await prisma.performanceDivergence.create({
        data: {
          cardId,
          userId,
          performanceSpread: accuracySpread,
          bestContextId: analysisResult.bestContext.categoryId,
          bestAccuracy: analysisResult.bestContext.accuracy,
          worstContextId: analysisResult.worstContext.categoryId,
          worstAccuracy: analysisResult.worstContext.accuracy,
          possibleCauses: ["performance_gap", "context_specific_difficulty"],
          severity:
            accuracySpread >= 40
              ? "severe"
              : accuracySpread >= 25
                ? "moderate"
                : "mild",
          contextRankings: validContexts.map((c, i) => ({
            categoryId: c.categoryId,
            accuracy: c.accuracy,
            rank: i + 1,
          })),
          status: "active",
        },
      });
    }

    return reply.send({
      success: true,
      data: analysisResult,
      fromCache: false,
    });
  });

  /**
   * GET /synthesis/divergence/user/:userId
   * Get recorded divergences for a user
   */
  fastify.get("/divergence/user/:userId", async (request, reply) => {
    const params = z
      .object({ userId: z.string().uuid() })
      .safeParse(request.params);
    const queryValidation = PaginationSchema.extend({
      minSpread: z.coerce.number().min(0).max(100).optional(),
      resolved: z.coerce.boolean().optional(),
    }).safeParse(request.query);

    if (!params.success) {
      return reply.status(400).send({ error: "Invalid user ID" });
    }

    if (!queryValidation.success) {
      return reply.status(400).send({
        error: "Invalid query parameters",
      });
    }

    const { cursor, limit, minSpread, resolved } = queryValidation.data;

    const where: Record<string, unknown> = {
      userId: params.data.userId,
    };

    if (minSpread !== undefined) {
      where.performanceSpread = { gte: minSpread };
    }

    if (resolved !== undefined) {
      where.resolvedAt = resolved ? { not: null } : null;
    }

    if (cursor) {
      where.id = { lt: cursor };
    }

    const divergences = await prisma.performanceDivergence.findMany({
      where,
      take: limit + 1,
      orderBy: { detectedAt: "desc" },
      include: {
        card: {
          select: { id: true, content: true },
        },
        bestContext: {
          select: { id: true, name: true },
        },
        worstContext: {
          select: { id: true, name: true },
        },
      },
    });

    const hasMore = divergences.length > limit;
    const items = hasMore ? divergences.slice(0, -1) : divergences;

    return reply.send({
      success: true,
      data: {
        items,
        pagination: {
          hasMore,
          nextCursor: hasMore ? items[items.length - 1].id : null,
          count: items.length,
        },
      },
    });
  });

  /**
   * PATCH /synthesis/divergence/:divergenceId/resolve
   * Mark a divergence as resolved
   */
  fastify.patch("/divergence/:divergenceId/resolve", async (request, reply) => {
    const params = z
      .object({ divergenceId: z.string().uuid() })
      .safeParse(request.params);
    const validation = z
      .object({
        resolutionType: z.enum([
          "BRIDGE_CARD_CREATED",
          "SYNTHESIS_COMPLETED",
          "MANUAL_DISMISSED",
          "PERFORMANCE_NORMALIZED",
        ]),
        resolutionNotes: z.string().max(1000).optional(),
        relatedBridgeCardId: z.string().uuid().optional(),
        relatedResponseId: z.string().uuid().optional(),
      })
      .safeParse(request.body);

    if (!params.success) {
      return reply.status(400).send({ error: "Invalid divergence ID" });
    }

    if (!validation.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: validation.error.issues,
      });
    }

    const existing = await prisma.performanceDivergence.findUnique({
      where: { id: params.data.divergenceId },
    });

    if (!existing) {
      return reply
        .status(404)
        .send({ error: "Performance divergence not found" });
    }

    const divergence = await prisma.performanceDivergence.update({
      where: { id: params.data.divergenceId },
      data: {
        resolvedAt: new Date(),
        status: "resolved",
        actionsTaken: validation.data,
      },
    });

    // Invalidate cache
    if (redis) {
      await redis.del(
        cacheKeys.divergenceAnalysis(existing.cardId, existing.userId),
      );
    }

    log.info(
      {
        divergenceId: params.data.divergenceId,
        resolutionType: validation.data.resolutionType,
      },
      "Performance divergence resolved",
    );

    return reply.send({
      success: true,
      data: divergence,
    });
  });

  // ===========================================================================
  // CROSS-CONTEXT QUIZZES
  // ===========================================================================

  /**
   * POST /synthesis/quizzes
   * Create a cross-context quiz
   */
  fastify.post("/quizzes", async (request, reply) => {
    const validation = CreateCrossContextQuizSchema.safeParse(request.body);

    if (!validation.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: validation.error.issues,
      });
    }

    const data = validation.data;

    // Verify card exists
    const card = await prisma.card.findUnique({
      where: { id: data.cardId },
      select: { id: true },
    });

    if (!card) {
      return reply.status(404).send({ error: "Card not found" });
    }

    // Verify all involved contexts exist
    const categories = await prisma.category.findMany({
      where: { id: { in: data.involvedContextIds } },
      select: { id: true },
    });

    if (categories.length !== data.involvedContextIds.length) {
      return reply.status(400).send({
        error: "One or more context IDs are invalid",
      });
    }

    const quiz = await prisma.crossContextQuiz.create({
      data: {
        cardId: data.cardId,
        userId: data.userId,
        quizType: "context_comparison",
        questionText: data.questionText,
        correctAnswers: [data.correctAnswer],
        options: data.distractors.map((d, i) => ({ id: `d${i}`, text: d })),
        categoryIds: data.involvedContextIds,
      },
      include: {
        card: {
          select: { id: true, content: true },
        },
      },
    });

    // Invalidate cache
    if (redis) {
      await redis.del(cacheKeys.crossContextQuizzes(data.cardId));
    }

    log.info(
      { quizId: quiz.id, cardId: data.cardId },
      "Cross-context quiz created",
    );

    return reply.status(201).send({
      success: true,
      data: quiz,
    });
  });

  /**
   * GET /synthesis/quizzes/card/:cardId
   * Get quizzes for a card
   */
  fastify.get("/quizzes/card/:cardId", async (request, reply) => {
    const params = z
      .object({ cardId: z.string().uuid() })
      .safeParse(request.params);
    const querySchema = z.object({
      activeOnly: z.coerce.boolean().default(true),
      minDifficulty: z.coerce.number().int().min(1).max(5).optional(),
      maxDifficulty: z.coerce.number().int().min(1).max(5).optional(),
    });
    const queryValidation = querySchema.safeParse(request.query);

    if (!params.success) {
      return reply.status(400).send({ error: "Invalid card ID" });
    }

    if (!queryValidation.success) {
      return reply.status(400).send({
        error: "Invalid query parameters",
      });
    }

    const { activeOnly, minDifficulty, maxDifficulty } = queryValidation.data;
    const cardId = params.data.cardId;

    // Try cache first
    if (redis && activeOnly && !minDifficulty && !maxDifficulty) {
      const cached = await redis.get(cacheKeys.crossContextQuizzes(cardId));
      if (cached) {
        return reply.send({
          success: true,
          data: {
            items: JSON.parse(cached),
            fromCache: true,
          },
        });
      }
    }

    const where: Record<string, unknown> = { cardId };

    if (activeOnly) {
      where.isActive = true;
    }

    if (minDifficulty !== undefined) {
      where.difficulty = {
        ...((where.difficulty as Record<string, number>) || {}),
        gte: minDifficulty,
      };
    }

    if (maxDifficulty !== undefined) {
      where.difficulty = {
        ...((where.difficulty as Record<string, number>) || {}),
        lte: maxDifficulty,
      };
    }

    const quizzes = await prisma.crossContextQuiz.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        card: {
          select: { id: true, content: true },
        },
      },
    });

    // Cache if this is the default query
    if (redis && activeOnly && !minDifficulty && !maxDifficulty) {
      await redis.setex(
        cacheKeys.crossContextQuizzes(cardId),
        CACHE_TTL.QUIZZES,
        JSON.stringify(quizzes),
      );
    }

    return reply.send({
      success: true,
      data: {
        items: quizzes,
        fromCache: false,
      },
    });
  });

  /**
   * POST /synthesis/quizzes/:quizId/attempt
   * Record a quiz attempt
   */
  fastify.post("/quizzes/:quizId/attempt", async (request, reply) => {
    const params = z
      .object({ quizId: z.string().uuid() })
      .safeParse(request.params);
    const validation = RecordQuizAttemptSchema.safeParse(request.body);

    if (!params.success) {
      return reply.status(400).send({ error: "Invalid quiz ID" });
    }

    if (!validation.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: validation.error.issues,
      });
    }

    const { userId, isCorrect, responseTimeMs } = validation.data;
    const selectedAnswer =
      ((validation.data as Record<string, unknown>).selectedAnswer as string) ||
      "";

    const quiz = await prisma.crossContextQuiz.findUnique({
      where: { id: params.data.quizId },
    });

    if (!quiz) {
      return reply.status(404).send({ error: "Quiz not found" });
    }

    // Update quiz with the response
    const updatedQuiz = await prisma.crossContextQuiz.update({
      where: { id: params.data.quizId },
      data: {
        userAnswer: selectedAnswer,
        isCorrect,
        responseTimeMs,
        answeredAt: new Date(),
        insightType: isCorrect ? "calibration_correct" : "needs_review",
      },
    });

    // Invalidate cache
    if (redis) {
      await redis.del(cacheKeys.crossContextQuizzes(quiz.cardId));
    }

    log.info(
      {
        quizId: params.data.quizId,
        isCorrect,
        responseTimeMs,
      },
      "Quiz attempt recorded",
    );

    return reply.send({
      success: true,
      data: {
        quiz: updatedQuiz,
        attemptResult: {
          wasCorrect: isCorrect,
          responseTimeMs,
        },
      },
    });
  });

  /**
   * PATCH /synthesis/quizzes/:quizId
   * Update a quiz
   */
  fastify.patch("/quizzes/:quizId", async (request, reply) => {
    const params = z
      .object({ quizId: z.string().uuid() })
      .safeParse(request.params);
    const validation = z
      .object({
        questionText: z.string().min(10).max(1000).optional(),
        correctAnswer: z.string().min(1).max(2000).optional(),
        distractors: z.array(z.string().max(500)).min(1).max(5).optional(),
        difficulty: z.number().int().min(1).max(5).optional(),
        isActive: z.boolean().optional(),
      })
      .safeParse(request.body);

    if (!params.success) {
      return reply.status(400).send({ error: "Invalid quiz ID" });
    }

    if (!validation.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: validation.error.issues,
      });
    }

    const existing = await prisma.crossContextQuiz.findUnique({
      where: { id: params.data.quizId },
      select: { id: true, cardId: true },
    });

    if (!existing) {
      return reply.status(404).send({ error: "Quiz not found" });
    }

    const quiz = await prisma.crossContextQuiz.update({
      where: { id: params.data.quizId },
      data: validation.data,
    });

    // Invalidate cache
    if (redis) {
      await redis.del(cacheKeys.crossContextQuizzes(existing.cardId));
    }

    log.info({ quizId: params.data.quizId }, "Quiz updated");

    return reply.send({
      success: true,
      data: quiz,
    });
  });

  /**
   * DELETE /synthesis/quizzes/:quizId
   * Delete a quiz
   */
  fastify.delete("/quizzes/:quizId", async (request, reply) => {
    const params = z
      .object({ quizId: z.string().uuid() })
      .safeParse(request.params);

    if (!params.success) {
      return reply.status(400).send({ error: "Invalid quiz ID" });
    }

    const existing = await prisma.crossContextQuiz.findUnique({
      where: { id: params.data.quizId },
      select: { id: true, cardId: true },
    });

    if (!existing) {
      return reply.status(404).send({ error: "Quiz not found" });
    }

    await prisma.crossContextQuiz.delete({
      where: { id: params.data.quizId },
    });

    // Invalidate cache
    if (redis) {
      await redis.del(cacheKeys.crossContextQuizzes(existing.cardId));
    }

    log.info({ quizId: params.data.quizId }, "Quiz deleted");

    return reply.send({
      success: true,
      message: "Quiz deleted",
    });
  });

  // ===========================================================================
  // SYNTHESIS TRIGGERS (for automatic prompt generation)
  // ===========================================================================

  /**
   * POST /synthesis/triggers/check
   * Check if any synthesis triggers should fire for a user
   * Called after reviews or at session boundaries
   */
  fastify.post("/triggers/check", async (request, reply) => {
    const validation = z
      .object({
        userId: z.string().uuid(),
        recentCardIds: z.array(z.string().uuid()).max(100).optional(),
        sessionType: z
          .enum(["STUDY_SESSION_END", "REVIEW_MILESTONE", "MANUAL_CHECK"])
          .optional(),
      })
      .safeParse(request.body);

    if (!validation.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: validation.error.issues,
      });
    }

    const { userId, recentCardIds, sessionType } = validation.data;

    const triggeredPrompts: Array<{
      cardId: string;
      triggerType: string;
      reason: string;
    }> = [];

    // Check for cards with performance divergence
    const cardsToCheck = recentCardIds || [];

    if (cardsToCheck.length === 0) {
      // Get cards the user has reviewed in multiple contexts recently
      const recentParticipations =
        await prisma.cardCategoryParticipation.findMany({
          where: {
            card: {
              userId,
            },
            reviewCountInContext: { gte: 3 },
          },
          select: {
            cardId: true,
          },
          take: 50,
        });

      cardsToCheck.push(...recentParticipations.map((p) => p.cardId));
    }

    // Deduplicate
    const uniqueCardIds = [...new Set(cardsToCheck)];

    // For each card, check if divergence threshold is met
    for (const cardId of uniqueCardIds.slice(0, 20)) {
      // Limit checks
      const participations = await prisma.cardCategoryParticipation.findMany({
        where: {
          cardId,
          reviewCountInContext: { gte: 5 },
        },
        select: {
          categoryId: true,
          contextDifficulty: true,
          reviewCountInContext: true,
          contextSuccessRate: true,
          category: {
            select: { name: true },
          },
        },
      });

      if (participations.length < 2) continue;

      // Calculate accuracy per context
      const contextAccuracies = participations.map((p) => ({
        categoryId: p.categoryId,
        categoryName: p.category.name,
        accuracy:
          p.reviewCountInContext && p.reviewCountInContext > 0
            ? ((p.contextSuccessRate ?? 0) / p.reviewCountInContext) * 100
            : 0,
      }));

      const accuracies = contextAccuracies.map((c) => c.accuracy);
      const spread = Math.max(...accuracies) - Math.min(...accuracies);

      if (spread >= 25) {
        // Significant divergence threshold
        // Check if there's already a pending prompt for this card
        const existingPrompt = await prisma.synthesisPrompt.findFirst({
          where: {
            cardId,
            userId,
            status: "PENDING",
            triggerType: "PERFORMANCE_DIVERGENCE",
          },
        });

        if (!existingPrompt) {
          const best = contextAccuracies.reduce((a, b) =>
            a.accuracy > b.accuracy ? a : b,
          );
          const worst = contextAccuracies.reduce((a, b) =>
            a.accuracy < b.accuracy ? a : b,
          );

          triggeredPrompts.push({
            cardId,
            triggerType: "PERFORMANCE_DIVERGENCE",
            reason: `Performance differs by ${spread.toFixed(1)}% between "${best.categoryName}" (${best.accuracy.toFixed(0)}%) and "${worst.categoryName}" (${worst.accuracy.toFixed(0)}%)`,
          });
        }
      }
    }

    // Check for context switches (if session type indicates)
    if (
      sessionType === "STUDY_SESSION_END" &&
      recentCardIds &&
      recentCardIds.length > 0
    ) {
      // Check if user studied same cards in different contexts
      const multiContextCards = await prisma.cardCategoryParticipation.groupBy({
        by: ["cardId"],
        where: {
          cardId: { in: recentCardIds },
        },
        _count: {
          cardId: true,
        },
        having: {
          cardId: {
            _count: { gte: 2 },
          },
        },
      });

      for (const mc of multiContextCards.slice(0, 5)) {
        const existingPrompt = await prisma.synthesisPrompt.findFirst({
          where: {
            cardId: mc.cardId,
            userId,
            status: "PENDING",
            triggerType: "MULTI_CATEGORY_REVIEW",
          },
        });

        if (!existingPrompt) {
          triggeredPrompts.push({
            cardId: mc.cardId,
            triggerType: "MULTI_CATEGORY_REVIEW",
            reason: `Card appears in ${mc._count.cardId} different contexts`,
          });
        }
      }
    }

    log.info(
      {
        userId,
        cardsChecked: uniqueCardIds.length,
        triggersFound: triggeredPrompts.length,
      },
      "Synthesis triggers checked",
    );

    return reply.send({
      success: true,
      data: {
        triggeredPrompts,
        summary: {
          cardsChecked: uniqueCardIds.length,
          triggersFound: triggeredPrompts.length,
        },
      },
    });
  });

  /**
   * POST /synthesis/triggers/generate-prompts
   * Generate synthesis prompts from triggered conditions
   */
  fastify.post("/triggers/generate-prompts", async (request, reply) => {
    const validation = z
      .object({
        userId: z.string().uuid(),
        triggers: z
          .array(
            z.object({
              cardId: z.string().uuid(),
              triggerType: TriggerTypeEnum,
              reason: z.string().max(500),
              contextAId: z.string().uuid().optional(),
              contextBId: z.string().uuid().optional(),
            }),
          )
          .min(1)
          .max(20),
      })
      .safeParse(request.body);

    if (!validation.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: validation.error.issues,
      });
    }

    const { userId, triggers } = validation.data;

    // Generate prompts for each trigger
    const createdPrompts = await prisma.$transaction(async (tx) => {
      const prompts = [];

      for (const trigger of triggers) {
        // Get card info for prompt text generation
        const card = await tx.card.findUnique({
          where: { id: trigger.cardId },
          select: {
            id: true,
            content: true,
            categoryParticipations: {
              include: {
                category: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        });

        if (!card) continue;

        // Generate appropriate prompt text based on trigger type
        let promptText = "";
        let promptType: z.infer<typeof PromptTypeEnum> = "SYNTHESIS";

        switch (trigger.triggerType) {
          case "PERFORMANCE_DIVERGENCE":
            promptType = "DIVERGENCE_REFLECTION";
            promptText = `You've been reviewing this concept in different contexts with varying success. ${trigger.reason}\n\nReflect: Why might you find this easier in one context than another? What connects these different perspectives?`;
            break;

          case "MULTI_CATEGORY_REVIEW":
            promptType = "CROSS_CONTEXT";
            promptText = `This concept appears across multiple categories in your learning. Take a moment to consider: How do these different contexts relate? What's the common thread that makes this concept relevant in each?`;
            break;

          case "CONTEXT_SWITCH":
            promptType = "BRIDGE";
            promptText = `You've just switched contexts while studying this concept. Can you articulate how the understanding from your previous context applies (or differs) here?`;
            break;

          case "MILESTONE_REACHED":
            promptType = "METACOGNITION";
            promptText = `Congratulations on your progress with this concept! Now that you've reached this milestone, can you explain this concept as if teaching it to someone encountering it for the first time?`;
            break;

          default:
            promptType = "SYNTHESIS";
            promptText = `Take a moment to reflect on this concept and how it connects to other things you've learned. What insights can you synthesize?`;
        }

        const prompt = await tx.synthesisPrompt.create({
          data: {
            cardId: trigger.cardId,
            userId,
            promptType,
            triggerType: trigger.triggerType,
            promptText,
            status: "PENDING",
            categoryIds: [trigger.contextAId, trigger.contextBId].filter(
              Boolean,
            ) as string[],
            triggerDetails: {
              generatedFrom: "automatic_trigger",
              triggerReason: trigger.reason,
              triggerContextA: trigger.contextAId || null,
              triggerContextB: trigger.contextBId || null,
              cardContentPreview:
                typeof (card.content as Record<string, unknown>)?.front ===
                "string"
                  ? (
                      (card.content as Record<string, unknown>).front as string
                    ).substring(0, 200)
                  : "",
              participationCount: card.categoryParticipations.length,
            },
            deferredUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          },
        });

        prompts.push(prompt);
      }

      return prompts;
    });

    // Invalidate cache
    await invalidateSynthesisCache({ userId });

    log.info(
      {
        userId,
        triggersProcessed: triggers.length,
        promptsCreated: createdPrompts.length,
      },
      "Synthesis prompts generated from triggers",
    );

    return reply.status(201).send({
      success: true,
      data: {
        created: createdPrompts.length,
        prompts: createdPrompts,
      },
    });
  });

  // ===========================================================================
  // SYNTHESIS STATISTICS
  // ===========================================================================

  /**
   * GET /synthesis/stats/:userId
   * Get synthesis statistics for a user
   */
  fastify.get("/stats/:userId", async (request, reply) => {
    const params = z
      .object({ userId: z.string().uuid() })
      .safeParse(request.params);

    if (!params.success) {
      return reply.status(400).send({ error: "Invalid user ID" });
    }

    const userId = params.data.userId;

    // Gather statistics
    const [
      promptStats,
      responseStats,
      noteStats,
      divergenceStats,
      quizTotalCount,
      quizCorrectCount,
      quizAggregateStats,
    ] = await Promise.all([
      // Prompt statistics
      prisma.synthesisPrompt.groupBy({
        by: ["status"],
        where: { userId },
        _count: true,
      }),

      // Response statistics
      prisma.synthesisResponse.aggregate({
        where: { userId },
        _count: true,
        _avg: { selfRating: true },
      }),

      // Note statistics
      prisma.synthesisNote.groupBy({
        by: ["noteType"],
        where: { userId },
        _count: true,
      }),

      // Divergence statistics
      prisma.performanceDivergence.aggregate({
        where: { userId },
        _count: true,
        _avg: { performanceSpread: true },
      }),

      // Quiz statistics - count total and correct separately
      prisma.crossContextQuiz.count({
        where: { userId },
      }),
      prisma.crossContextQuiz.count({
        where: { userId, isCorrect: true },
      }),
      prisma.crossContextQuiz.aggregate({
        where: { userId },
        _sum: {
          responseTimeMs: true,
        },
      }),
    ]);

    // Format prompt stats
    const promptStatusCounts = Object.fromEntries(
      promptStats.map((s) => [s.status, s._count]),
    );

    // Format note stats
    const noteTypeCounts = Object.fromEntries(
      noteStats.map((s) => [s.noteType, s._count]),
    );

    // Calculate quiz success rate
    const quizSuccessRate =
      quizTotalCount > 0 ? (quizCorrectCount / quizTotalCount) * 100 : 0;

    return reply.send({
      success: true,
      data: {
        prompts: {
          total: Object.values(promptStatusCounts).reduce(
            (a: number, b) => a + (b as number),
            0,
          ),
          byStatus: promptStatusCounts,
        },
        responses: {
          total: responseStats._count,
          averageQualityRating: responseStats._avg.selfRating,
        },
        notes: {
          total: Object.values(noteTypeCounts).reduce(
            (a: number, b) => a + (b as number),
            0,
          ),
          byType: noteTypeCounts,
        },
        divergences: {
          total: divergenceStats._count,
          averageSpread: divergenceStats._avg.performanceSpread,
        },
        quizzes: {
          total: quizTotalCount,
          totalCorrect: quizCorrectCount,
          successRate: quizSuccessRate,
          totalResponseTimeMs: quizAggregateStats._sum?.responseTimeMs || 0,
        },
      },
    });
  });
};

export default synthesisRoutes;
