/**
 * Contextual Annotations (Marginalia) API Routes
 *
 * PARADIGM: Annotations are context-specific margin notes that exist only
 * within a particular category lens. They are versioned, timestamped, and
 * survive card restructuring.
 *
 * Key features:
 * - Rich annotation types (note, insight, question, warning, connection, etc.)
 * - Target selectors for specific content segments
 * - Version control with content hash tracking
 * - AI augmentation hooks
 * - Bulk operations for efficiency
 */

import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../config/database";
import { authenticate } from "../middleware/auth";
import crypto from "crypto";

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

const annotationTypeSchema = z.enum([
  "note",
  "insight",
  "question",
  "warning",
  "connection",
  "correction",
  "elaboration",
]);

const targetSelectorSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text_range"),
    start: z.number().int().min(0),
    end: z.number().int().min(0),
  }),
  z.object({
    type: z.literal("field"),
    path: z.string().min(1),
  }),
  z.object({
    type: z.literal("regex"),
    pattern: z.string().min(1),
  }),
  z.object({
    type: z.literal("full_card"),
  }),
]);

const annotationStyleSchema = z.object({
  color: z.string().optional(),
  icon: z.string().optional(),
  highlight: z.boolean().optional(),
  borderStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
});

const createAnnotationSchema = z.object({
  cardId: z.string().min(1),
  categoryId: z.string().min(1),
  annotationType: annotationTypeSchema,
  content: z.string().min(1).max(10000),
  targetSelector: targetSelectorSchema.optional(),
  style: annotationStyleSchema.optional(),
  linkedCardIds: z.array(z.string()).optional().default([]),
  externalUrl: z.string().url().optional(),
  citationText: z.string().max(500).optional(),
  showDuringStudy: z.boolean().optional().default(true),
  importance: z.number().int().min(-2).max(2).optional().default(0),
});

const updateAnnotationSchema = z.object({
  annotationType: annotationTypeSchema.optional(),
  content: z.string().min(1).max(10000).optional(),
  targetSelector: targetSelectorSchema.optional().nullable(),
  style: annotationStyleSchema.optional().nullable(),
  linkedCardIds: z.array(z.string()).optional(),
  externalUrl: z.string().url().optional().nullable(),
  citationText: z.string().max(500).optional().nullable(),
  isVisible: z.boolean().optional(),
  showDuringStudy: z.boolean().optional(),
  importance: z.number().int().min(-2).max(2).optional(),
});

const bulkCreateAnnotationsSchema = z.object({
  annotations: z.array(createAnnotationSchema).min(1).max(100),
});

const annotationQuerySchema = z.object({
  categoryId: z.string().optional(),
  cardId: z.string().optional(),
  annotationType: annotationTypeSchema.optional(),
  importance: z.coerce.number().int().min(-2).max(2).optional(),
  showDuringStudy: z.coerce.boolean().optional(),
  includeStale: z.coerce.boolean().optional().default(false),
  includeHidden: z.coerce.boolean().optional().default(false),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate a hash of card content for staleness detection
 */
function generateContentHash(content: unknown): string {
  const serialized = JSON.stringify(content);
  return crypto
    .createHash("sha256")
    .update(serialized)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Check if a card's content has changed since annotation was created
 * @internal Reserved for future staleness notification features
 */
async function _checkAnnotationStaleness(
  annotationId: string,
  currentContentHash: string,
): Promise<boolean> {
  const annotation = await prisma.contextualAnnotation.findUnique({
    where: { id: annotationId },
    select: { cardContentHash: true },
  });

  if (!annotation || !annotation.cardContentHash) return false;
  return annotation.cardContentHash !== currentContentHash;
}

// =============================================================================
// ROUTES
// =============================================================================

const annotationRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply authentication to all routes
  fastify.addHook("onRequest", authenticate);

  // ===========================================================================
  // GET /annotations - List annotations with filters
  // ===========================================================================
  fastify.get<{
    Querystring: z.infer<typeof annotationQuerySchema>;
  }>(
    "/",
    {
      schema: {
        tags: ["Annotations"],
        summary: "List contextual annotations",
        description:
          "Retrieve annotations with various filters. At least one of categoryId or cardId is recommended.",
        querystring: annotationQuerySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const {
        categoryId,
        cardId,
        annotationType,
        importance,
        showDuringStudy,
        includeStale,
        includeHidden,
        limit,
        offset,
      } = annotationQuerySchema.parse(request.query);

      const where: Record<string, unknown> = { userId };

      if (categoryId) where.categoryId = categoryId;
      if (cardId) where.cardId = cardId;
      if (annotationType) where.annotationType = annotationType;
      if (importance !== undefined) where.importance = importance;
      if (showDuringStudy !== undefined)
        where.showDuringStudy = showDuringStudy;
      if (!includeStale) where.isStale = false;
      if (!includeHidden) where.isVisible = true;

      const [annotations, total] = await Promise.all([
        prisma.contextualAnnotation.findMany({
          where,
          include: {
            card: {
              select: {
                id: true,
                cardType: true,
                content: true,
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
          orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
          skip: offset,
          take: limit,
        }),
        prisma.contextualAnnotation.count({ where }),
      ]);

      return reply.send({
        annotations,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + annotations.length < total,
        },
      });
    },
  );

  // ===========================================================================
  // GET /annotations/:id - Get single annotation
  // ===========================================================================
  fastify.get<{
    Params: { id: string };
  }>(
    "/:id",
    {
      schema: {
        tags: ["Annotations"],
        summary: "Get annotation by ID",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;

      const annotation = await prisma.contextualAnnotation.findFirst({
        where: { id, userId },
        include: {
          card: {
            select: {
              id: true,
              cardType: true,
              content: true,
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
      });

      if (!annotation) {
        return reply.status(404).send({ error: "Annotation not found" });
      }

      // Check staleness
      const currentHash = generateContentHash(annotation.card.content);
      const isStale = annotation.cardContentHash !== currentHash;

      return reply.send({
        ...annotation,
        isCurrentlyStale: isStale,
      });
    },
  );

  // ===========================================================================
  // POST /annotations - Create annotation
  // ===========================================================================
  fastify.post<{
    Body: z.infer<typeof createAnnotationSchema>;
  }>(
    "/",
    {
      schema: {
        tags: ["Annotations"],
        summary: "Create contextual annotation",
        description:
          "Create a new annotation (marginalia) for a card within a specific category lens.",
        body: createAnnotationSchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const data = createAnnotationSchema.parse(request.body);

      // Verify card exists and belongs to user
      const card = await prisma.card.findFirst({
        where: { id: data.cardId, userId },
        select: { id: true, content: true },
      });

      if (!card) {
        return reply.status(404).send({ error: "Card not found" });
      }

      // Verify category exists and belongs to user
      const category = await prisma.category.findFirst({
        where: { id: data.categoryId, userId },
        select: { id: true },
      });

      if (!category) {
        return reply.status(404).send({ error: "Category not found" });
      }

      // Check if participation exists (card should be in category to annotate)
      const participation = await prisma.cardCategoryParticipation.findFirst({
        where: { cardId: data.cardId, categoryId: data.categoryId },
        select: { id: true },
      });

      // Generate content hash for staleness tracking
      const contentHash = generateContentHash(card.content);

      const annotation = await prisma.contextualAnnotation.create({
        data: {
          userId,
          cardId: data.cardId,
          categoryId: data.categoryId,
          participationId: participation?.id,
          annotationType: data.annotationType,
          content: data.content,
          targetSelector: data.targetSelector,
          style: data.style,
          linkedCardIds: data.linkedCardIds,
          externalUrl: data.externalUrl,
          citationText: data.citationText,
          showDuringStudy: data.showDuringStudy,
          importance: data.importance,
          cardContentHash: contentHash,
          version: 1,
        },
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

      return reply.status(201).send(annotation);
    },
  );

  // ===========================================================================
  // POST /annotations/bulk - Bulk create annotations
  // ===========================================================================
  fastify.post<{
    Body: z.infer<typeof bulkCreateAnnotationsSchema>;
  }>(
    "/bulk",
    {
      schema: {
        tags: ["Annotations"],
        summary: "Bulk create annotations",
        description: "Create multiple annotations in a single request.",
        body: bulkCreateAnnotationsSchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { annotations } = bulkCreateAnnotationsSchema.parse(request.body);

      // Collect unique card and category IDs
      const cardIds = [...new Set(annotations.map((a) => a.cardId))];
      const categoryIds = [...new Set(annotations.map((a) => a.categoryId))];

      // Verify all cards exist
      const cards = await prisma.card.findMany({
        where: { id: { in: cardIds }, userId },
        select: { id: true, content: true },
      });
      const cardMap = new Map(cards.map((c) => [c.id, c]));

      // Verify all categories exist
      const categories = await prisma.category.findMany({
        where: { id: { in: categoryIds }, userId },
        select: { id: true },
      });
      const categorySet = new Set(categories.map((c) => c.id));

      // Get participations
      const participations = await prisma.cardCategoryParticipation.findMany({
        where: {
          cardId: { in: cardIds },
          categoryId: { in: categoryIds },
        },
        select: { id: true, cardId: true, categoryId: true },
      });
      const participationMap = new Map(
        participations.map((p) => [`${p.cardId}:${p.categoryId}`, p.id]),
      );

      // Filter valid annotations and prepare data
      const validAnnotations: any[] = [];

      const errors: Array<{ index: number; error: string }> = [];

      for (let i = 0; i < annotations.length; i++) {
        const a = annotations[i];
        const card = cardMap.get(a.cardId);
        const categoryExists = categorySet.has(a.categoryId);

        if (!card) {
          errors.push({ index: i, error: `Card ${a.cardId} not found` });
          continue;
        }
        if (!categoryExists) {
          errors.push({
            index: i,
            error: `Category ${a.categoryId} not found`,
          });
          continue;
        }

        const participationId =
          participationMap.get(`${a.cardId}:${a.categoryId}`) || null;
        const contentHash = generateContentHash(card.content);

        validAnnotations.push({
          userId,
          cardId: a.cardId,
          categoryId: a.categoryId,
          participationId,
          annotationType: a.annotationType,
          content: a.content,
          targetSelector: (a.targetSelector || null) as any,
          style: (a.style || null) as any,
          linkedCardIds: a.linkedCardIds || [],
          externalUrl: a.externalUrl || null,
          citationText: a.citationText || null,
          showDuringStudy: a.showDuringStudy ?? true,
          importance: a.importance ?? 0,
          cardContentHash: contentHash,
          version: 1,
        });
      }

      // Create valid annotations
      const result = await prisma.contextualAnnotation.createMany({
        data: validAnnotations,
      });

      return reply.status(201).send({
        created: result.count,
        errors: errors.length > 0 ? errors : undefined,
      });
    },
  );

  // ===========================================================================
  // PATCH /annotations/:id - Update annotation
  // ===========================================================================
  fastify.patch<{
    Params: { id: string };
    Body: z.infer<typeof updateAnnotationSchema>;
  }>(
    "/:id",
    {
      schema: {
        tags: ["Annotations"],
        summary: "Update annotation",
        params: z.object({ id: z.string() }),
        body: updateAnnotationSchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;
      const data = updateAnnotationSchema.parse(request.body);

      const existing = await prisma.contextualAnnotation.findFirst({
        where: { id, userId },
        include: {
          card: { select: { content: true } },
        },
      });

      if (!existing) {
        return reply.status(404).send({ error: "Annotation not found" });
      }

      // If content is being updated, create a new version
      const isContentUpdate = data.content && data.content !== existing.content;

      const updateData: Record<string, unknown> = {
        ...data,
        updatedAt: new Date(),
      };

      // Handle nullable fields
      if (data.targetSelector === null) updateData.targetSelector = null;
      if (data.style === null) updateData.style = null;
      if (data.externalUrl === null) updateData.externalUrl = null;
      if (data.citationText === null) updateData.citationText = null;

      if (isContentUpdate) {
        // Increment version
        updateData.version = existing.version + 1;
        updateData.previousVersionId = existing.id;
      }

      // Update content hash if card content has changed
      const currentHash = generateContentHash(existing.card.content);
      if (existing.cardContentHash !== currentHash) {
        updateData.cardContentHash = currentHash;
        updateData.isStale = false; // Reset staleness since we're acknowledging the change
      }

      const annotation = await prisma.contextualAnnotation.update({
        where: { id },
        data: updateData,
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

      return reply.send(annotation);
    },
  );

  // ===========================================================================
  // DELETE /annotations/:id - Delete annotation
  // ===========================================================================
  fastify.delete<{
    Params: { id: string };
  }>(
    "/:id",
    {
      schema: {
        tags: ["Annotations"],
        summary: "Delete annotation",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;

      const annotation = await prisma.contextualAnnotation.findFirst({
        where: { id, userId },
      });

      if (!annotation) {
        return reply.status(404).send({ error: "Annotation not found" });
      }

      await prisma.contextualAnnotation.delete({ where: { id } });

      return reply.status(204).send();
    },
  );

  // ===========================================================================
  // POST /annotations/:id/hide - Soft hide annotation
  // ===========================================================================
  fastify.post<{
    Params: { id: string };
  }>(
    "/:id/hide",
    {
      schema: {
        tags: ["Annotations"],
        summary: "Hide annotation",
        description: "Soft-hide an annotation without deleting it.",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;

      const annotation = await prisma.contextualAnnotation.findFirst({
        where: { id, userId },
      });

      if (!annotation) {
        return reply.status(404).send({ error: "Annotation not found" });
      }

      await prisma.contextualAnnotation.update({
        where: { id },
        data: { isVisible: false },
      });

      return reply.send({ message: "Annotation hidden" });
    },
  );

  // ===========================================================================
  // POST /annotations/:id/show - Unhide annotation
  // ===========================================================================
  fastify.post<{
    Params: { id: string };
  }>(
    "/:id/show",
    {
      schema: {
        tags: ["Annotations"],
        summary: "Show annotation",
        description: "Unhide a previously hidden annotation.",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;

      const annotation = await prisma.contextualAnnotation.findFirst({
        where: { id, userId },
      });

      if (!annotation) {
        return reply.status(404).send({ error: "Annotation not found" });
      }

      await prisma.contextualAnnotation.update({
        where: { id },
        data: { isVisible: true },
      });

      return reply.send({ message: "Annotation visible" });
    },
  );

  // ===========================================================================
  // POST /annotations/:id/refresh-staleness - Check and update staleness
  // ===========================================================================
  fastify.post<{
    Params: { id: string };
  }>(
    "/:id/refresh-staleness",
    {
      schema: {
        tags: ["Annotations"],
        summary: "Refresh annotation staleness",
        description:
          "Check if the underlying card has changed and update staleness flag.",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;

      const annotation = await prisma.contextualAnnotation.findFirst({
        where: { id, userId },
        include: {
          card: { select: { content: true } },
        },
      });

      if (!annotation) {
        return reply.status(404).send({ error: "Annotation not found" });
      }

      const currentHash = generateContentHash(annotation.card.content);
      const isStale = annotation.cardContentHash !== currentHash;

      if (annotation.isStale !== isStale) {
        await prisma.contextualAnnotation.update({
          where: { id },
          data: { isStale },
        });
      }

      return reply.send({
        id,
        isStale,
        originalHash: annotation.cardContentHash,
        currentHash,
      });
    },
  );

  // ===========================================================================
  // POST /annotations/:id/acknowledge-change - Acknowledge card change
  // ===========================================================================
  fastify.post<{
    Params: { id: string };
  }>(
    "/:id/acknowledge-change",
    {
      schema: {
        tags: ["Annotations"],
        summary: "Acknowledge card change",
        description:
          "Update the content hash and reset staleness after reviewing changes.",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;

      const annotation = await prisma.contextualAnnotation.findFirst({
        where: { id, userId },
        include: {
          card: { select: { content: true } },
        },
      });

      if (!annotation) {
        return reply.status(404).send({ error: "Annotation not found" });
      }

      const currentHash = generateContentHash(annotation.card.content);

      await prisma.contextualAnnotation.update({
        where: { id },
        data: {
          cardContentHash: currentHash,
          isStale: false,
          version: annotation.version + 1,
        },
      });

      return reply.send({
        id,
        message: "Change acknowledged",
        newVersion: annotation.version + 1,
      });
    },
  );

  // ===========================================================================
  // GET /annotations/card/:cardId - Get all annotations for a card
  // ===========================================================================
  fastify.get<{
    Params: { cardId: string };
    Querystring: { categoryId?: string };
  }>(
    "/card/:cardId",
    {
      schema: {
        tags: ["Annotations"],
        summary: "Get annotations for a card",
        description:
          "Get all annotations for a card, optionally filtered by category.",
        params: z.object({ cardId: z.string() }),
        querystring: z.object({ categoryId: z.string().optional() }),
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { cardId } = request.params;
      const { categoryId } = request.query;

      const where: Record<string, unknown> = {
        userId,
        cardId,
        isVisible: true,
      };

      if (categoryId) where.categoryId = categoryId;

      const annotations = await prisma.contextualAnnotation.findMany({
        where,
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
        orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
      });

      // Group by category
      const byCategory = annotations.reduce(
        (acc, a) => {
          const key = a.categoryId;
          if (!acc[key]) acc[key] = [];
          acc[key].push(a);
          return acc;
        },
        {} as Record<string, typeof annotations>,
      );

      return reply.send({
        annotations,
        byCategory,
        total: annotations.length,
      });
    },
  );

  // ===========================================================================
  // GET /annotations/category/:categoryId - Get all annotations in a category
  // ===========================================================================
  fastify.get<{
    Params: { categoryId: string };
    Querystring: {
      annotationType?: z.infer<typeof annotationTypeSchema>;
      limit?: number;
      offset?: number;
    };
  }>(
    "/category/:categoryId",
    {
      schema: {
        tags: ["Annotations"],
        summary: "Get annotations in a category",
        description: "Get all annotations within a specific category lens.",
        params: z.object({ categoryId: z.string() }),
        querystring: z.object({
          annotationType: annotationTypeSchema.optional(),
          limit: z.coerce.number().int().min(1).max(200).optional().default(50),
          offset: z.coerce.number().int().min(0).optional().default(0),
        }),
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { categoryId } = request.params;
      const { annotationType, limit, offset } = request.query;

      const where: Record<string, unknown> = {
        userId,
        categoryId,
        isVisible: true,
      };

      if (annotationType) where.annotationType = annotationType;

      const [annotations, total] = await Promise.all([
        prisma.contextualAnnotation.findMany({
          where,
          include: {
            card: {
              select: {
                id: true,
                cardType: true,
                content: true,
              },
            },
          },
          orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
          skip: offset,
          take: limit,
        }),
        prisma.contextualAnnotation.count({ where }),
      ]);

      // Group by annotation type
      const byType = annotations.reduce(
        (acc, a) => {
          const key = a.annotationType;
          if (!acc[key]) acc[key] = [];
          acc[key].push(a);
          return acc;
        },
        {} as Record<string, typeof annotations>,
      );

      return reply.send({
        annotations,
        byType,
        pagination: {
          total,
          limit,
          offset: offset || 0,
          hasMore: (offset || 0) + annotations.length < total,
        },
      });
    },
  );

  // ===========================================================================
  // GET /annotations/stale - Get all stale annotations
  // ===========================================================================
  fastify.get(
    "/stale",
    {
      schema: {
        tags: ["Annotations"],
        summary: "Get stale annotations",
        description:
          "Get all annotations that may be outdated due to card content changes.",
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;

      const annotations = await prisma.contextualAnnotation.findMany({
        where: { userId, isStale: true, isVisible: true },
        include: {
          card: {
            select: {
              id: true,
              cardType: true,
              content: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              iconEmoji: true,
              color: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      });

      return reply.send({
        annotations,
        total: annotations.length,
      });
    },
  );

  // ===========================================================================
  // POST /annotations/ai-approve/:id - Approve AI-generated annotation
  // ===========================================================================
  fastify.post<{
    Params: { id: string };
  }>(
    "/ai-approve/:id",
    {
      schema: {
        tags: ["Annotations"],
        summary: "Approve AI-generated annotation",
        description: "Mark an AI-generated annotation as user-approved.",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;

      const annotation = await prisma.contextualAnnotation.findFirst({
        where: { id, userId, isAiGenerated: true },
      });

      if (!annotation) {
        return reply
          .status(404)
          .send({ error: "AI-generated annotation not found" });
      }

      await prisma.contextualAnnotation.update({
        where: { id },
        data: { isUserApproved: true },
      });

      return reply.send({ message: "Annotation approved" });
    },
  );
};

export { annotationRoutes };
