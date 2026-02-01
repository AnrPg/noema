// =============================================================================
// DECK ROUTES
// =============================================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';

// =============================================================================
// SCHEMAS
// =============================================================================

const createDeckSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  coverImageUrl: z.string().url().optional(),
  iconEmoji: z.string().max(10).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  parentDeckId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  language: z.string().default('en'),
  settings: z.record(z.any()).optional(),
});

const updateDeckSchema = createDeckSchema.partial();

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().optional(),
  parentDeckId: z.string().optional(),
  tags: z.string().optional(), // Comma-separated
  orderBy: z.enum(['name', 'createdAt', 'lastStudiedAt', 'cardCount']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

// =============================================================================
// ROUTES
// =============================================================================

export async function deckRoutes(app: FastifyInstance) {
  // List user's decks
  app.get('/', {
    onRequest: [authenticate],
    schema: {
      tags: ['Decks'],
      summary: 'List all decks',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = querySchema.parse(request.query);
    
    const where: any = {
      userId: request.user!.id,
    };
    
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    
    if (query.parentDeckId) {
      where.parentDeckId = query.parentDeckId;
    } else if (query.parentDeckId === undefined) {
      // Get root decks by default
      where.parentDeckId = null;
    }
    
    if (query.tags) {
      where.tags = { hasSome: query.tags.split(',') };
    }
    
    const [decks, total] = await Promise.all([
      prisma.deck.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: { [query.orderBy]: query.order },
        include: {
          subDecks: {
            select: { id: true, name: true, cardCount: true },
          },
          _count: { select: { cards: true } },
        },
      }),
      prisma.deck.count({ where }),
    ]);
    
    return {
      data: decks,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + query.limit < total,
      },
    };
  });
  
  // Get single deck
  app.get('/:id', {
    onRequest: [authenticate],
    schema: {
      tags: ['Decks'],
      summary: 'Get deck by ID',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    
    const deck = await prisma.deck.findFirst({
      where: {
        id,
        OR: [
          { userId: request.user!.id },
          { isPublic: true },
        ],
      },
      include: {
        subDecks: {
          select: { id: true, name: true, cardCount: true },
        },
        parentDeck: {
          select: { id: true, name: true },
        },
      },
    });
    
    if (!deck) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Deck not found',
      });
    }
    
    return deck;
  });
  
  // Create deck
  app.post('/', {
    onRequest: [authenticate],
    schema: {
      tags: ['Decks'],
      summary: 'Create a new deck',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createDeckSchema.parse(request.body);
    
    const deck = await prisma.deck.create({
      data: {
        ...body,
        userId: request.user!.id,
        settings: body.settings || {},
      },
    });
    
    // Update stats
    await prisma.userLearningStats.update({
      where: { userId: request.user!.id },
      data: { decksCreated: { increment: 1 } },
    });
    
    return reply.status(201).send(deck);
  });
  
  // Update deck
  app.patch('/:id', {
    onRequest: [authenticate],
    schema: {
      tags: ['Decks'],
      summary: 'Update deck',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const body = updateDeckSchema.parse(request.body);
    
    // Check ownership
    const existing = await prisma.deck.findFirst({
      where: { id, userId: request.user!.id },
    });
    
    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Deck not found',
      });
    }
    
    const deck = await prisma.deck.update({
      where: { id },
      data: body,
    });
    
    return deck;
  });
  
  // Delete deck
  app.delete('/:id', {
    onRequest: [authenticate],
    schema: {
      tags: ['Decks'],
      summary: 'Delete deck',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    
    // Check ownership
    const existing = await prisma.deck.findFirst({
      where: { id, userId: request.user!.id },
    });
    
    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Deck not found',
      });
    }
    
    await prisma.deck.delete({ where: { id } });
    
    return { message: 'Deck deleted successfully' };
  });
  
  // Get deck stats
  app.get('/:id/stats', {
    onRequest: [authenticate],
    schema: {
      tags: ['Decks'],
      summary: 'Get deck statistics',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    
    const deck = await prisma.deck.findFirst({
      where: { id, userId: request.user!.id },
      select: {
        cardCount: true,
        newCount: true,
        learningCount: true,
        reviewCount: true,
        masteredCount: true,
      },
    });
    
    if (!deck) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Deck not found',
      });
    }
    
    // Get due cards
    const dueCards = await prisma.card.count({
      where: {
        deckId: id,
        nextReviewDate: { lte: new Date() },
      },
    });
    
    return {
      ...deck,
      dueCards,
    };
  });
  
  // Share deck
  app.post('/:id/share', {
    onRequest: [authenticate],
    schema: {
      tags: ['Decks'],
      summary: 'Generate share link for deck',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    
    const deck = await prisma.deck.findFirst({
      where: { id, userId: request.user!.id },
    });
    
    if (!deck) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Deck not found',
      });
    }
    
    // Generate share code if not exists
    let shareCode = deck.shareCode;
    if (!shareCode) {
      shareCode = crypto.randomUUID().substring(0, 8);
      await prisma.deck.update({
        where: { id },
        data: { shareCode, isPublic: true },
      });
      
      // Update stats
      await prisma.userLearningStats.update({
        where: { userId: request.user!.id },
        data: { decksShared: { increment: 1 } },
      });
    }
    
    return { shareCode, shareUrl: `/decks/shared/${shareCode}` };
  });
  
  // Get shared deck
  app.get('/shared/:shareCode', {
    onRequest: [optionalAuth],
    schema: {
      tags: ['Decks'],
      summary: 'Get deck by share code',
    },
  }, async (request: FastifyRequest<{ Params: { shareCode: string } }>, reply: FastifyReply) => {
    const { shareCode } = request.params;
    
    const deck = await prisma.deck.findUnique({
      where: { shareCode },
      include: {
        user: {
          select: { displayName: true, avatarUrl: true },
        },
        _count: { select: { cards: true } },
      },
    });
    
    if (!deck || !deck.isPublic) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Deck not found',
      });
    }
    
    return deck;
  });
  
  // Clone shared deck
  app.post('/shared/:shareCode/clone', {
    onRequest: [authenticate],
    schema: {
      tags: ['Decks'],
      summary: 'Clone a shared deck to your library',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{ Params: { shareCode: string } }>, reply: FastifyReply) => {
    const { shareCode } = request.params;
    
    const sourceDeck = await prisma.deck.findUnique({
      where: { shareCode },
      include: { cards: true },
    });
    
    if (!sourceDeck || !sourceDeck.isPublic) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Deck not found',
      });
    }
    
    // Clone deck
    const newDeck = await prisma.deck.create({
      data: {
        userId: request.user!.id,
        name: sourceDeck.name,
        description: sourceDeck.description,
        coverImageUrl: sourceDeck.coverImageUrl,
        iconEmoji: sourceDeck.iconEmoji,
        color: sourceDeck.color,
        tags: sourceDeck.tags,
        category: sourceDeck.category,
        language: sourceDeck.language,
        settings: sourceDeck.settings as any,
        cardCount: sourceDeck.cards.length,
        newCount: sourceDeck.cards.length,
      },
    });
    
    // Clone cards
    if (sourceDeck.cards.length > 0) {
      await prisma.card.createMany({
        data: sourceDeck.cards.map((card) => ({
          userId: request.user!.id,
          deckId: newDeck.id,
          cardType: card.cardType,
          content: card.content as any,
          tags: card.tags,
          notes: card.notes,
          source: `Cloned from ${sourceDeck.name}`,
        })),
      });
    }
    
    // Increment download count on source
    await prisma.deck.update({
      where: { id: sourceDeck.id },
      data: { downloadCount: { increment: 1 } },
    });
    
    // Update source user stats
    await prisma.userLearningStats.update({
      where: { userId: sourceDeck.userId },
      data: { deckDownloads: { increment: 1 } },
    });
    
    return reply.status(201).send(newDeck);
  });
}
