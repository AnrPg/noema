// =============================================================================
// CARD ROUTES
// =============================================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "../config/database.js";
import { authenticate } from "../middleware/auth.js";

// =============================================================================
// SCHEMAS
// =============================================================================

const createCardSchema = z.object({
  deckId: z.string(),
  cardType: z.string(),
  content: z.record(z.any()),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  source: z.string().optional(),
});

const updateCardSchema = z.object({
  cardType: z.string().optional(),
  content: z.record(z.any()).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  flags: z.array(z.string()).optional(),
});

const bulkCreateSchema = z.object({
  deckId: z.string(),
  cards: z.array(
    z.object({
      cardType: z.string(),
      content: z.record(z.any()),
      tags: z.array(z.string()).optional(),
      notes: z.string().optional(),
      source: z.string().optional(),
    }),
  ),
});

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  deckId: z.string().optional(),
  cardType: z.string().optional(),
  state: z
    .enum(["new", "learning", "review", "relearning", "mastered"])
    .optional(),
  tags: z.string().optional(),
  search: z.string().optional(),
  dueBefore: z.string().datetime().optional(),
  orderBy: z
    .enum(["createdAt", "nextReviewDate", "difficulty", "position"])
    .default("position"),
  order: z.enum(["asc", "desc"]).default("asc"),
});

// =============================================================================
// ROUTES
// =============================================================================

export async function cardRoutes(app: FastifyInstance) {
  // List cards
  app.get(
    "/",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Cards"],
        summary: "List cards with filters",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = querySchema.parse(request.query);

      const where: any = {
        userId: request.user!.id,
      };

      if (query.deckId) where.deckId = query.deckId;
      if (query.cardType) where.cardType = query.cardType;
      if (query.state) where.state = query.state;
      if (query.tags) where.tags = { hasSome: query.tags.split(",") };
      if (query.dueBefore)
        where.nextReviewDate = { lte: new Date(query.dueBefore) };

      if (query.search) {
        // Search in JSON content - PostgreSQL specific
        where.OR = [
          { content: { path: ["front"], string_contains: query.search } },
          { content: { path: ["back"], string_contains: query.search } },
          { tags: { has: query.search } },
        ];
      }

      const [cards, total] = await Promise.all([
        prisma.card.findMany({
          where,
          take: query.limit,
          skip: query.offset,
          orderBy: { [query.orderBy]: query.order },
          include: {
            deck: { select: { id: true, name: true } },
            media: true,
          },
        }),
        prisma.card.count({ where }),
      ]);

      return {
        data: cards,
        pagination: {
          total,
          limit: query.limit,
          offset: query.offset,
          hasMore: query.offset + query.limit < total,
        },
      };
    },
  );

  // Get single card
  app.get<{ Params: { id: string } }>(
    "/:id",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Cards"],
        summary: "Get card by ID",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const card = await prisma.card.findFirst({
        where: { id, userId: request.user!.id },
        include: {
          deck: { select: { id: true, name: true } },
          media: true,
          relatedCards: {
            include: {
              targetCard: {
                select: { id: true, cardType: true, content: true },
              },
            },
          },
        },
      });

      if (!card) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Card not found",
        });
      }

      return card;
    },
  );

  // Create card
  app.post(
    "/",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Cards"],
        summary: "Create a new card",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = createCardSchema.parse(request.body);

      // Verify deck ownership
      const deck = await prisma.deck.findFirst({
        where: { id: body.deckId, userId: request.user!.id },
      });

      if (!deck) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Deck not found",
        });
      }

      // Get next position
      const lastCard = await prisma.card.findFirst({
        where: { deckId: body.deckId },
        orderBy: { position: "desc" },
        select: { position: true },
      });

      const card = await prisma.card.create({
        data: {
          userId: request.user!.id,
          deckId: body.deckId,
          cardType: body.cardType,
          content: body.content,
          tags: body.tags || [],
          notes: body.notes,
          source: body.source,
          position: (lastCard?.position || 0) + 1,
        },
        include: {
          deck: { select: { id: true, name: true } },
        },
      });

      // Update deck counts
      await prisma.deck.update({
        where: { id: body.deckId },
        data: {
          cardCount: { increment: 1 },
          newCount: { increment: 1 },
        },
      });

      // Update user stats
      await prisma.userLearningStats.update({
        where: { userId: request.user!.id },
        data: {
          cardsCreated: { increment: 1 },
          totalCards: { increment: 1 },
        },
      });

      return reply.status(201).send(card);
    },
  );

  // Bulk create cards
  app.post(
    "/bulk",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Cards"],
        summary: "Create multiple cards at once",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = bulkCreateSchema.parse(request.body);

      // Verify deck ownership
      const deck = await prisma.deck.findFirst({
        where: { id: body.deckId, userId: request.user!.id },
      });

      if (!deck) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Deck not found",
        });
      }

      // Get last position
      const lastCard = await prisma.card.findFirst({
        where: { deckId: body.deckId },
        orderBy: { position: "desc" },
        select: { position: true },
      });

      let position = lastCard?.position || 0;

      // Create cards
      const cards = await prisma.card.createMany({
        data: body.cards.map((card) => ({
          userId: request.user!.id,
          deckId: body.deckId,
          cardType: card.cardType,
          content: card.content,
          tags: card.tags || [],
          notes: card.notes,
          source: card.source,
          position: ++position,
        })),
      });

      // Update counts
      await prisma.deck.update({
        where: { id: body.deckId },
        data: {
          cardCount: { increment: body.cards.length },
          newCount: { increment: body.cards.length },
        },
      });

      await prisma.userLearningStats.update({
        where: { userId: request.user!.id },
        data: {
          cardsCreated: { increment: body.cards.length },
          totalCards: { increment: body.cards.length },
        },
      });

      return reply.status(201).send({ created: cards.count });
    },
  );

  // Update card
  app.patch<{ Params: { id: string } }>(
    "/:id",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Cards"],
        summary: "Update card",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const body = updateCardSchema.parse(request.body);

      const existing = await prisma.card.findFirst({
        where: { id, userId: request.user!.id },
      });

      if (!existing) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Card not found",
        });
      }

      const card = await prisma.card.update({
        where: { id },
        data: body,
      });

      return card;
    },
  );

  // Delete card
  app.delete<{ Params: { id: string } }>(
    "/:id",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Cards"],
        summary: "Delete card",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const card = await prisma.card.findFirst({
        where: { id, userId: request.user!.id },
        select: { deckId: true, state: true },
      });

      if (!card) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Card not found",
        });
      }

      await prisma.card.delete({ where: { id } });

      // Update deck counts
      const stateField = `${card.state}Count`;
      await prisma.deck.update({
        where: { id: card.deckId },
        data: {
          cardCount: { decrement: 1 },
          [stateField]: { decrement: 1 },
        },
      });

      await prisma.userLearningStats.update({
        where: { userId: request.user!.id },
        data: { totalCards: { decrement: 1 } },
      });

      return { message: "Card deleted successfully" };
    },
  );

  // Get card review history
  app.get<{ Params: { id: string } }>(
    "/:id/history",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Cards"],
        summary: "Get card review history",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const reviews = await prisma.reviewRecord.findMany({
        where: { cardId: id, userId: request.user!.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      return reviews;
    },
  );

  // Suspend card
  app.post<{ Params: { id: string } }>(
    "/:id/suspend",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Cards"],
        summary: "Suspend card from reviews",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const card = await prisma.card.findFirst({
        where: { id, userId: request.user!.id },
      });

      if (!card) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Card not found",
        });
      }

      await prisma.card.update({
        where: { id },
        data: {
          flags: { push: "suspended" },
        },
      });

      return { message: "Card suspended" };
    },
  );

  // Unsuspend card
  app.post<{ Params: { id: string } }>(
    "/:id/unsuspend",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Cards"],
        summary: "Unsuspend card",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const card = await prisma.card.findFirst({
        where: { id, userId: request.user!.id },
        select: { flags: true },
      });

      if (!card) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Card not found",
        });
      }

      await prisma.card.update({
        where: { id },
        data: {
          flags: card.flags.filter((f) => f !== "suspended"),
        },
      });

      return { message: "Card unsuspended" };
    },
  );
}
