// =============================================================================
// LEARNING FLOW ROUTES - ECOSYSTEM NAVIGATION & STUDY MODES
// =============================================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "../config/database.js";
import { authenticate } from "../middleware/auth.js";

// =============================================================================
// SCHEMAS
// =============================================================================

const updateFlowSchema = z.object({
  currentMode: z
    .enum(["exploration", "goal_driven", "exam_oriented", "synthesis"])
    .optional(),
  goalCategoryId: z.string().nullable().optional(),
  goalDeadline: z.coerce.date().nullable().optional(),
  examCategoryIds: z.array(z.string()).optional(),
  examDate: z.coerce.date().nullable().optional(),
  examPriority: z.enum(["breadth", "depth", "mixed"]).optional(),
  synthesisCategoryIds: z.array(z.string()).optional(),
  activeLens: z.enum(["structure", "flow", "bridge", "progress"]).optional(),
  complexityLevel: z.number().int().min(1).max(5).optional(),
});

const createDynamicDeckSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  iconEmoji: z.string().max(10).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  queryType: z
    .enum(["category", "union", "intersection", "difference", "custom"])
    .default("category"),
  includeCategoryIds: z.array(z.string()).min(1),
  excludeCategoryIds: z.array(z.string()).optional(),
  includeSubcategories: z.boolean().default(true),
  stateFilter: z.array(z.string()).optional(),
  tagFilter: z.array(z.string()).optional(),
  difficultyRange: z
    .object({
      min: z.number().min(0).max(1),
      max: z.number().min(0).max(1),
    })
    .optional(),
  sortBy: z
    .enum(["due_date", "difficulty", "created", "mastery", "random"])
    .default("due_date"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  maxCards: z.number().int().min(1).optional(),
});

const suggestionResponseSchema = z.object({
  action: z.enum(["accept", "reject", "defer"]),
  modifications: z
    .object({
      name: z.string().optional(),
      description: z.string().optional(),
      cardIds: z.array(z.string()).optional(),
      parentId: z.string().optional(),
    })
    .optional(),
});

// =============================================================================
// ROUTES
// =============================================================================

export async function learningFlowRoutes(app: FastifyInstance) {
  // ===== LEARNING FLOW STATE =====

  // Get current learning flow
  app.get(
    "/flow",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Learning Flow"],
        summary: "Get current learning flow state",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      let flow = await prisma.userLearningFlow.findUnique({
        where: { userId: request.user!.id },
      });

      // Create default flow if doesn't exist
      if (!flow) {
        flow = await prisma.userLearningFlow.create({
          data: {
            userId: request.user!.id,
          },
        });
      }

      // Enrich with category info if needed
      const enriched: any = { ...flow };

      if (flow.goalCategoryId) {
        enriched.goalCategory = await prisma.category.findUnique({
          where: { id: flow.goalCategoryId },
          select: {
            id: true,
            name: true,
            iconEmoji: true,
            cardCount: true,
            masteryScore: true,
          },
        });
      }

      if (flow.examCategoryIds.length > 0) {
        enriched.examCategories = await prisma.category.findMany({
          where: { id: { in: flow.examCategoryIds } },
          select: { id: true, name: true, iconEmoji: true, cardCount: true },
        });
      }

      if (flow.synthesisCategoryIds.length > 0) {
        enriched.synthesisCategories = await prisma.category.findMany({
          where: { id: { in: flow.synthesisCategoryIds } },
          select: { id: true, name: true, iconEmoji: true },
        });
      }

      return reply.send(enriched);
    },
  );

  // Update learning flow
  app.patch(
    "/flow",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Learning Flow"],
        summary: "Update learning flow state",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = updateFlowSchema.parse(request.body);

      const flow = await prisma.userLearningFlow.upsert({
        where: { userId: request.user!.id },
        create: {
          userId: request.user!.id,
          ...body,
        },
        update: body,
      });

      return reply.send(flow);
    },
  );

  // Get study context for current flow
  app.get(
    "/flow/study-context",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Learning Flow"],
        summary: "Get study context based on current learning mode",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const flow = await prisma.userLearningFlow.findUnique({
        where: { userId: request.user!.id },
      });

      if (!flow) {
        return reply.send({
          mode: "exploration",
          suggestions: [],
        });
      }

      const context: any = {
        mode: flow.currentMode,
        activeLens: flow.activeLens,
      };

      switch (flow.currentMode) {
        case "goal_driven": {
          if (flow.goalCategoryId) {
            // Get prerequisite path
            const goalCategory = await prisma.category.findUnique({
              where: { id: flow.goalCategoryId },
              include: {
                incomingRelations: {
                  where: { relationType: "prepares_for" },
                  include: {
                    sourceCategory: {
                      select: {
                        id: true,
                        name: true,
                        masteryScore: true,
                        cardCount: true,
                      },
                    },
                  },
                },
              },
            });

            context.goalCategory = goalCategory;
            context.prerequisitePath = goalCategory?.incomingRelations.map(
              (r) => r.sourceCategory,
            );
            context.goalProgress = flow.goalProgress;
            context.goalDeadline = flow.goalDeadline;

            // Calculate what's missing
            const prerequisites =
              goalCategory?.incomingRelations
                .filter((r) => r.sourceCategory.masteryScore < 0.7)
                .map((r) => r.sourceCategory) || [];
            context.missingPrerequisites = prerequisites;
          }
          break;
        }

        case "exam_oriented": {
          if (flow.examCategoryIds.length > 0) {
            const examCategories = await prisma.category.findMany({
              where: { id: { in: flow.examCategoryIds } },
              select: {
                id: true,
                name: true,
                cardCount: true,
                masteryScore: true,
                lastStudiedAt: true,
              },
            });

            context.examCategories = examCategories;
            context.examDate = flow.examDate;
            context.examPriority = flow.examPriority;

            // Calculate coverage
            const totalCards = examCategories.reduce(
              (sum, c) => sum + c.cardCount,
              0,
            );
            const avgMastery =
              examCategories.reduce(
                (sum, c) => sum + c.masteryScore * c.cardCount,
                0,
              ) / (totalCards || 1);
            context.coverage = avgMastery;

            // Days until exam
            if (flow.examDate) {
              context.daysUntilExam = Math.ceil(
                (new Date(flow.examDate).getTime() - Date.now()) /
                  (1000 * 60 * 60 * 24),
              );
            }
          }
          break;
        }

        case "synthesis": {
          if (flow.synthesisCategoryIds.length > 0) {
            // Find cards that bridge the synthesis categories
            const bridgingCards =
              await prisma.cardCategoryParticipation.groupBy({
                by: ["cardId"],
                where: {
                  categoryId: { in: flow.synthesisCategoryIds },
                },
                having: {
                  cardId: {
                    _count: {
                      gte: 2,
                    },
                  },
                },
                _count: {
                  cardId: true,
                },
              });

            context.bridgingCardIds = bridgingCards.map((b) => b.cardId);
            context.synthesisCategoryIds = flow.synthesisCategoryIds;

            // Get synthesis categories with their relations
            const synthesisCategories = await prisma.category.findMany({
              where: { id: { in: flow.synthesisCategoryIds } },
              include: {
                outgoingRelations: {
                  where: {
                    targetCategoryId: { in: flow.synthesisCategoryIds },
                  },
                },
              },
            });
            context.synthesisCategories = synthesisCategories;
          }
          break;
        }

        case "exploration":
        default: {
          // Get neighboring categories based on recent activity
          const recentReviews = await prisma.reviewRecord.findMany({
            where: { userId: request.user!.id },
            orderBy: { createdAt: "desc" },
            take: 50,
            select: { cardId: true },
          });

          const recentCardIds = [
            ...new Set(recentReviews.map((r) => r.cardId)),
          ];

          if (recentCardIds.length > 0) {
            const recentParticipations =
              await prisma.cardCategoryParticipation.findMany({
                where: { cardId: { in: recentCardIds } },
                select: { categoryId: true },
              });

            const recentCategoryIds = [
              ...new Set(recentParticipations.map((p) => p.categoryId)),
            ];

            // Get related categories
            const relatedCategories = await prisma.categoryRelation.findMany({
              where: {
                OR: [
                  { sourceCategoryId: { in: recentCategoryIds } },
                  { targetCategoryId: { in: recentCategoryIds } },
                ],
                relationType: "weak_association",
              },
              include: {
                sourceCategory: {
                  select: {
                    id: true,
                    name: true,
                    iconEmoji: true,
                    masteryScore: true,
                  },
                },
                targetCategory: {
                  select: {
                    id: true,
                    name: true,
                    iconEmoji: true,
                    masteryScore: true,
                  },
                },
              },
              take: 10,
            });

            const neighbors = new Map();
            for (const rel of relatedCategories) {
              if (!recentCategoryIds.includes(rel.sourceCategoryId)) {
                neighbors.set(rel.sourceCategoryId, rel.sourceCategory);
              }
              if (!recentCategoryIds.includes(rel.targetCategoryId)) {
                neighbors.set(rel.targetCategoryId, rel.targetCategory);
              }
            }

            context.neighboringCategories = Array.from(neighbors.values());
          }
          break;
        }
      }

      return reply.send(context);
    },
  );

  // ===== DYNAMIC DECKS =====

  // List dynamic decks
  app.get(
    "/dynamic-decks",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Learning Flow"],
        summary: "List all dynamic decks",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const decks = await prisma.dynamicDeck.findMany({
        where: { userId: request.user!.id },
        orderBy: { updatedAt: "desc" },
      });

      return reply.send({ data: decks });
    },
  );

  // Create dynamic deck
  app.post(
    "/dynamic-decks",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Learning Flow"],
        summary: "Create a dynamic deck",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = createDynamicDeckSchema.parse(request.body);

      const deck = await prisma.dynamicDeck.create({
        data: {
          userId: request.user!.id,
          name: body.name,
          description: body.description,
          iconEmoji: body.iconEmoji,
          color: body.color,
          queryType: body.queryType,
          includeCategoryIds: body.includeCategoryIds,
          excludeCategoryIds: body.excludeCategoryIds || [],
          includeSubcategories: body.includeSubcategories,
          stateFilter: body.stateFilter || [],
          tagFilter: body.tagFilter || [],
          difficultyRange: body.difficultyRange,
          sortBy: body.sortBy,
          sortOrder: body.sortOrder,
          maxCards: body.maxCards,
        },
      });

      return reply.status(201).send(deck);
    },
  );

  // Get dynamic deck with resolved cards
  app.get<{ Params: { id: string } }>(
    "/dynamic-decks/:id",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Learning Flow"],
        summary: "Get dynamic deck with resolved cards",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const deck = await prisma.dynamicDeck.findFirst({
        where: { id, userId: request.user!.id },
      });

      if (!deck) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Dynamic deck not found",
        });
      }

      // Build category IDs list
      let categoryIds = [...deck.includeCategoryIds];

      if (deck.includeSubcategories) {
        const descendants = await prisma.category.findMany({
          where: {
            userId: request.user!.id,
            path: { hasSome: deck.includeCategoryIds },
          },
          select: { id: true },
        });
        categoryIds = categoryIds.concat(descendants.map((d) => d.id));
      }

      // Remove excluded
      categoryIds = categoryIds.filter(
        (id) => !deck.excludeCategoryIds.includes(id),
      );

      // Build where clause for cards
      const cardWhere: any = {};

      if (deck.stateFilter.length > 0) {
        cardWhere.state = { in: deck.stateFilter };
      }

      if (deck.tagFilter.length > 0) {
        cardWhere.tags = { hasSome: deck.tagFilter };
      }

      if (deck.difficultyRange) {
        const diffRange = deck.difficultyRange as {
          min?: number;
          max?: number;
        };
        cardWhere.difficulty = {
          gte: diffRange.min,
          lte: diffRange.max,
        };
      }

      // Build query based on query type
      let participations;

      switch (deck.queryType) {
        case "intersection": {
          // Cards must be in ALL included categories
          const cardCounts = await prisma.cardCategoryParticipation.groupBy({
            by: ["cardId"],
            where: { categoryId: { in: categoryIds } },
            _count: { categoryId: true },
          });
          const intersectionCardIds = cardCounts
            .filter(
              (c) => c._count.categoryId >= deck.includeCategoryIds.length,
            )
            .map((c) => c.cardId);

          participations = await prisma.cardCategoryParticipation.findMany({
            where: {
              cardId: { in: intersectionCardIds },
              card: cardWhere,
            },
            include: {
              card: true,
              category: { select: { id: true, name: true } },
            },
            take: deck.maxCards || 1000,
          });
          break;
        }

        case "difference": {
          // Cards in first category but not in second
          if (deck.includeCategoryIds.length >= 2) {
            const firstCatCards =
              await prisma.cardCategoryParticipation.findMany({
                where: { categoryId: deck.includeCategoryIds[0] },
                select: { cardId: true },
              });
            const secondCatCards =
              await prisma.cardCategoryParticipation.findMany({
                where: { categoryId: deck.includeCategoryIds[1] },
                select: { cardId: true },
              });
            const secondSet = new Set(secondCatCards.map((c) => c.cardId));
            const diffCardIds = firstCatCards
              .filter((c) => !secondSet.has(c.cardId))
              .map((c) => c.cardId);

            participations = await prisma.cardCategoryParticipation.findMany({
              where: {
                cardId: { in: diffCardIds },
                card: cardWhere,
              },
              include: {
                card: true,
                category: { select: { id: true, name: true } },
              },
              take: deck.maxCards || 1000,
            });
          }
          break;
        }

        case "union":
        case "category":
        default:
          participations = await prisma.cardCategoryParticipation.findMany({
            where: {
              categoryId: { in: categoryIds },
              card: cardWhere,
            },
            include: {
              card: true,
              category: { select: { id: true, name: true } },
            },
            take: deck.maxCards || 1000,
          });
          break;
      }

      // Deduplicate and sort
      const uniqueCards = new Map();
      for (const p of participations || []) {
        if (!uniqueCards.has(p.cardId)) {
          uniqueCards.set(p.cardId, {
            ...p.card,
            participations: [p],
          });
        } else {
          uniqueCards.get(p.cardId).participations.push(p);
        }
      }

      const cards = Array.from(uniqueCards.values());

      // Sort
      switch (deck.sortBy) {
        case "difficulty":
          cards.sort((a, b) =>
            deck.sortOrder === "asc"
              ? a.difficulty - b.difficulty
              : b.difficulty - a.difficulty,
          );
          break;
        case "created":
          cards.sort((a, b) =>
            deck.sortOrder === "asc"
              ? new Date(a.createdAt).getTime() -
                new Date(b.createdAt).getTime()
              : new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
          );
          break;
        case "random":
          cards.sort(() => Math.random() - 0.5);
          break;
        case "due_date":
        default:
          cards.sort((a, b) => {
            const aDate = a.nextReviewDate
              ? new Date(a.nextReviewDate).getTime()
              : Infinity;
            const bDate = b.nextReviewDate
              ? new Date(b.nextReviewDate).getTime()
              : Infinity;
            return deck.sortOrder === "asc" ? aDate - bDate : bDate - aDate;
          });
          break;
      }

      // Update cache
      await prisma.dynamicDeck.update({
        where: { id },
        data: {
          cachedCardCount: cards.length,
          cacheUpdatedAt: new Date(),
        },
      });

      return reply.send({
        ...deck,
        cards,
        totalCards: cards.length,
      });
    },
  );

  // Delete dynamic deck
  app.delete<{ Params: { id: string } }>(
    "/dynamic-decks/:id",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Learning Flow"],
        summary: "Delete a dynamic deck",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const deck = await prisma.dynamicDeck.findFirst({
        where: { id, userId: request.user!.id },
      });

      if (!deck) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Dynamic deck not found",
        });
      }

      await prisma.dynamicDeck.delete({ where: { id } });

      return reply.status(204).send();
    },
  );

  // ===== CATEGORY SUGGESTIONS =====

  // List pending suggestions
  app.get(
    "/suggestions",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Learning Flow"],
        summary: "List category suggestions",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = z
        .object({
          status: z
            .enum(["pending", "accepted", "rejected", "deferred"])
            .optional(),
        })
        .parse(request.query);

      const where: any = { userId: request.user!.id };
      if (query.status) {
        where.status = query.status;
      }

      const suggestions = await prisma.categorySuggestion.findMany({
        where,
        orderBy: [
          { status: "asc" },
          { confidence: "desc" },
          { createdAt: "desc" },
        ],
      });

      return reply.send({ data: suggestions });
    },
  );

  // Respond to suggestion
  app.post<{ Params: { id: string } }>(
    "/suggestions/:id/respond",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Learning Flow"],
        summary: "Respond to a category suggestion",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const body = suggestionResponseSchema.parse(request.body);

      const suggestion = await prisma.categorySuggestion.findFirst({
        where: { id, userId: request.user!.id, status: "pending" },
      });

      if (!suggestion) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Suggestion not found or already responded",
        });
      }

      if (body.action === "accept") {
        // Create the category
        const name = body.modifications?.name || suggestion.suggestedName;
        const description =
          body.modifications?.description || suggestion.suggestedDescription;
        const cardIds = body.modifications?.cardIds || suggestion.cardIds;

        const category = await prisma.category.create({
          data: {
            userId: request.user!.id,
            name,
            description,
            parentId: body.modifications?.parentId,
            path: body.modifications?.parentId
              ? await getPath(body.modifications.parentId, request.user!.id)
              : [],
            depth: body.modifications?.parentId
              ? (await getDepth(
                  body.modifications.parentId,
                  request.user!.id,
                )) + 1
              : 0,
          },
        });

        // Add cards to category
        if (cardIds.length > 0) {
          await prisma.cardCategoryParticipation.createMany({
            data: cardIds.map((cardId) => ({
              cardId,
              categoryId: category.id,
            })),
            skipDuplicates: true,
          });

          // Update card count
          await prisma.category.update({
            where: { id: category.id },
            data: { cardCount: cardIds.length },
          });
        }
      }

      // Update suggestion status
      await prisma.categorySuggestion.update({
        where: { id },
        data: {
          status:
            body.action === "accept"
              ? "accepted"
              : body.action === "reject"
                ? "rejected"
                : "deferred",
          respondedAt: new Date(),
        },
      });

      return reply.send({ success: true });
    },
  );

  // ===== LEARNING MODE MANAGEMENT =====

  // Set learning mode for a category
  app.post<{ Params: { categoryId: string } }>(
    "/categories/:categoryId/learning-modes",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Learning Flow"],
        summary: "Set learning mode for a category",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { categoryId } = request.params;
      const body = z
        .object({
          modeName: z.enum(["rigorous", "intuitive", "applied", "teaching"]),
          isActive: z.boolean().default(true),
          questionStyle: z
            .enum(["standard", "proof", "analogy", "problem", "explain"])
            .optional(),
          difficultyBias: z.number().min(-1).max(1).optional(),
        })
        .parse(request.body);

      // Verify category exists
      const category = await prisma.category.findFirst({
        where: { id: categoryId, userId: request.user!.id },
      });

      if (!category) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Category not found",
        });
      }

      // Deactivate other modes if this one is being activated
      if (body.isActive) {
        await prisma.categoryLearningMode.updateMany({
          where: { categoryId, isActive: true },
          data: { isActive: false },
        });
      }

      const mode = await prisma.categoryLearningMode.upsert({
        where: {
          categoryId_modeName: {
            categoryId,
            modeName: body.modeName,
          },
        },
        create: {
          categoryId,
          modeName: body.modeName,
          isActive: body.isActive,
          questionStyle: body.questionStyle || "standard",
          difficultyBias: body.difficultyBias || 0,
        },
        update: {
          isActive: body.isActive,
          questionStyle: body.questionStyle,
          difficultyBias: body.difficultyBias,
        },
      });

      return reply.send(mode);
    },
  );

  // Get learning modes for a category
  app.get<{ Params: { categoryId: string } }>(
    "/categories/:categoryId/learning-modes",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Learning Flow"],
        summary: "Get learning modes for a category",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { categoryId } = request.params;

      const modes = await prisma.categoryLearningMode.findMany({
        where: { categoryId },
      });

      return reply.send({ data: modes });
    },
  );
}

// Helper functions
async function getPath(parentId: string, userId: string): Promise<string[]> {
  const parent = await prisma.category.findFirst({
    where: { id: parentId, userId },
    select: { path: true, id: true },
  });
  return parent ? [...parent.path, parent.id] : [];
}

async function getDepth(parentId: string, userId: string): Promise<number> {
  const parent = await prisma.category.findFirst({
    where: { id: parentId, userId },
    select: { depth: true },
  });
  return parent?.depth ?? -1;
}
