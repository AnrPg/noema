// =============================================================================
// CATEGORY ROUTES - KNOWLEDGE ECOSYSTEM API
// =============================================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "../config/database.js";
import { authenticate } from "../middleware/auth.js";
import {
  syncCategoryOnCreate,
  syncCategoryOnUpdate,
  syncCategoryOnDelete,
  syncCategoryRelationOnCreate,
  syncCategoryRelationOnUpdate,
} from "../ecosystem-bridge/index.js";

// =============================================================================
// SCHEMAS
// =============================================================================

const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  framingQuestion: z.string().max(500).optional(),
  iconEmoji: z.string().max(10).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  parentId: z.string().optional(),
  learningIntent: z
    .enum(["foundational", "contextual", "reference"])
    .default("foundational"),
  depthGoal: z
    .enum(["recognition", "recall", "application", "synthesis"])
    .default("recall"),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).optional(),
  framingQuestion: z.string().max(500).optional(),
  iconEmoji: z.string().max(10).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  coverImageUrl: z.string().url().optional(),
  learningIntent: z
    .enum(["foundational", "contextual", "reference"])
    .optional(),
  depthGoal: z
    .enum(["recognition", "recall", "application", "synthesis"])
    .optional(),
  difficultyMultiplier: z.number().min(0.1).max(5).optional(),
  decayRateMultiplier: z.number().min(0.1).max(5).optional(),
  maturityStage: z
    .enum(["acquisition", "differentiation", "crystallization"])
    .optional(),
  isArchived: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

const moveCategorySchema = z.object({
  newParentId: z.string().nullable().optional(),
  position: z.number().int().min(0).optional(),
  reason: z.string().max(500).optional(),
});

const splitCategorySchema = z.object({
  childNames: z.array(z.string().min(1).max(100)).min(2),
  cardAssignments: z.record(z.array(z.string())),
  keepParent: z.boolean().default(false),
  reason: z.string().max(500).optional(),
});

const mergeCategoriesSchema = z.object({
  sourceIds: z.array(z.string()).min(2),
  targetName: z.string().min(1).max(100),
  targetDescription: z.string().max(2000).optional(),
  reason: z.string().max(500).optional(),
});

const categoryRelationSchema = z.object({
  sourceCategoryId: z.string(),
  targetCategoryId: z.string(),
  relationType: z.enum([
    "strong_containment",
    "weak_association",
    "prepares_for",
    "is_like",
    "contrasts_with",
  ]),
  strength: z.number().min(0).max(1).default(0.5),
  description: z.string().max(500).optional(),
});

const addCardToCategorySchema = z.object({
  cardId: z.string(),
  categoryId: z.string(),
  semanticRole: z
    .enum([
      "foundational",
      "application",
      "example",
      "edge_case",
      "counterexample",
      "concept",
    ])
    .default("concept"),
  isPrimary: z.boolean().default(false),
  contextNotes: z.string().max(2000).optional(),
  contextTags: z.array(z.string()).optional(),
  learningGoal: z.string().max(500).optional(),
});

const bulkAddCardsSchema = z.object({
  categoryId: z.string(),
  cardIds: z.array(z.string()).min(1),
  semanticRole: z
    .enum([
      "foundational",
      "application",
      "example",
      "edge_case",
      "counterexample",
      "concept",
    ])
    .default("concept"),
});

const contextFaceSchema = z.object({
  cardId: z.string(),
  categoryId: z.string(),
  frontOverride: z.record(z.any()).optional(),
  backOverride: z.record(z.any()).optional(),
  promptOverride: z.string().max(1000).optional(),
});

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().optional(),
  parentId: z.string().optional(),
  includeArchived: z.coerce.boolean().default(false),
  maturityStage: z
    .enum(["acquisition", "differentiation", "crystallization"])
    .optional(),
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate the materialized path for a category
 */
async function calculatePath(
  parentId: string | null,
  userId: string,
): Promise<string[]> {
  if (!parentId) return [];

  const parent = await prisma.category.findFirst({
    where: { id: parentId, userId },
    select: { path: true, id: true },
  });

  if (!parent) return [];
  return [...parent.path, parent.id];
}

/**
 * Calculate depth from path
 */
function calculateDepth(path: string[]): number {
  return path.length;
}

/**
 * Update stats for a category
 */
async function updateCategoryStats(categoryId: string) {
  const cardCount = await prisma.cardCategoryParticipation.count({
    where: { categoryId },
  });

  // Calculate average mastery
  const participations = await prisma.cardCategoryParticipation.findMany({
    where: { categoryId },
    select: { contextMastery: true },
  });

  const masteryScore =
    participations.length > 0
      ? participations.reduce((sum, p) => sum + p.contextMastery, 0) /
        participations.length
      : 0;

  await prisma.category.update({
    where: { id: categoryId },
    data: { cardCount, masteryScore },
  });
}

/**
 * Record an evolution event
 */
async function recordEvolution(
  categoryId: string,
  userId: string,
  eventType: string,
  previousState?: any,
  newState?: any,
  relatedCategoryIds: string[] = [],
  reason?: string,
) {
  await prisma.categoryEvolutionEvent.create({
    data: {
      categoryId,
      userId,
      eventType,
      previousState,
      newState,
      relatedCategoryIds,
      reason,
    },
  });
}

// =============================================================================
// ROUTES
// =============================================================================

export async function categoryRoutes(app: FastifyInstance) {
  // ===== CATEGORY CRUD =====

  // List categories
  app.get(
    "/",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Categories"],
        summary: "List all categories",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = querySchema.parse(request.query);

      const where: any = {
        userId: request.user!.id,
      };

      if (query.search) {
        where.OR = [
          { name: { contains: query.search, mode: "insensitive" } },
          { description: { contains: query.search, mode: "insensitive" } },
        ];
      }

      if (query.parentId !== undefined) {
        where.parentId = query.parentId || null;
      }

      if (!query.includeArchived) {
        where.isArchived = false;
      }

      if (query.maturityStage) {
        where.maturityStage = query.maturityStage;
      }

      const [categories, total] = await Promise.all([
        prisma.category.findMany({
          where,
          take: query.limit,
          skip: query.offset,
          orderBy: [{ isPinned: "desc" }, { position: "asc" }, { name: "asc" }],
          include: {
            children: {
              where: { isArchived: false },
              select: {
                id: true,
                name: true,
                cardCount: true,
                iconEmoji: true,
                color: true,
              },
            },
            _count: {
              select: {
                cardParticipations: true,
                outgoingRelations: true,
                incomingRelations: true,
              },
            },
          },
        }),
        prisma.category.count({ where }),
      ]);

      return reply.send({
        data: categories,
        pagination: {
          total,
          limit: query.limit,
          offset: query.offset,
          hasMore: query.offset + categories.length < total,
        },
      });
    },
  );

  // Get category tree (full hierarchy)
  app.get(
    "/tree",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Categories"],
        summary: "Get full category tree",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const categories = await prisma.category.findMany({
        where: {
          userId: request.user!.id,
          isArchived: false,
        },
        orderBy: [{ depth: "asc" }, { position: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          description: true,
          iconEmoji: true,
          color: true,
          parentId: true,
          depth: true,
          path: true,
          cardCount: true,
          masteryScore: true,
          maturityStage: true,
          learningIntent: true,
          isPinned: true,
        },
      });

      // Build tree structure
      const categoryMap = new Map<string, any>();
      const roots: any[] = [];

      // First pass: create all nodes
      for (const cat of categories) {
        categoryMap.set(cat.id, { ...cat, children: [] });
      }

      // Second pass: build tree
      for (const cat of categories) {
        const node = categoryMap.get(cat.id);
        if (cat.parentId && categoryMap.has(cat.parentId)) {
          categoryMap.get(cat.parentId).children.push(node);
        } else {
          roots.push(node);
        }
      }

      return reply.send({ data: roots });
    },
  );

  // Get category graph (with relationships)
  app.get(
    "/graph",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Categories"],
        summary: "Get category graph with relationships",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const [categories, relations] = await Promise.all([
        prisma.category.findMany({
          where: {
            userId: request.user!.id,
            isArchived: false,
          },
          select: {
            id: true,
            name: true,
            iconEmoji: true,
            color: true,
            cardCount: true,
            masteryScore: true,
            maturityStage: true,
            depth: true,
            parentId: true,
          },
        }),
        prisma.categoryRelation.findMany({
          where: {
            userId: request.user!.id,
          },
          select: {
            id: true,
            sourceCategoryId: true,
            targetCategoryId: true,
            relationType: true,
            strength: true,
            isDirectional: true,
          },
        }),
      ]);

      // Format as graph
      const nodes = categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        iconEmoji: cat.iconEmoji,
        color: cat.color,
        cardCount: cat.cardCount,
        masteryScore: cat.masteryScore,
        maturityStage: cat.maturityStage,
        depth: cat.depth,
        parentId: cat.parentId,
      }));

      const edges = relations.map((rel) => ({
        id: rel.id,
        sourceId: rel.sourceCategoryId,
        targetId: rel.targetCategoryId,
        relationType: rel.relationType,
        strength: rel.strength,
        isDirectional: rel.isDirectional,
      }));

      return reply.send({ nodes, edges });
    },
  );

  // Get single category with details
  app.get<{ Params: { id: string } }>(
    "/:id",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Categories"],
        summary: "Get category by ID",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const category = await prisma.category.findFirst({
        where: { id, userId: request.user!.id },
        include: {
          parent: {
            select: { id: true, name: true, iconEmoji: true, color: true },
          },
          children: {
            where: { isArchived: false },
            select: {
              id: true,
              name: true,
              iconEmoji: true,
              color: true,
              cardCount: true,
              masteryScore: true,
            },
            orderBy: [{ position: "asc" }, { name: "asc" }],
          },
          outgoingRelations: {
            include: {
              targetCategory: {
                select: { id: true, name: true, iconEmoji: true, color: true },
              },
            },
          },
          incomingRelations: {
            include: {
              sourceCategory: {
                select: { id: true, name: true, iconEmoji: true, color: true },
              },
            },
          },
          learningModes: true,
          _count: {
            select: { cardParticipations: true },
          },
        },
      });

      if (!category) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Category not found",
        });
      }

      return reply.send(category);
    },
  );

  // Create category
  app.post(
    "/",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Categories"],
        summary: "Create a new category",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = createCategorySchema.parse(request.body);

      // Validate parent exists if provided
      if (body.parentId) {
        const parent = await prisma.category.findFirst({
          where: { id: body.parentId, userId: request.user!.id },
        });
        if (!parent) {
          return reply.status(400).send({
            error: "Bad Request",
            message: "Parent category not found",
          });
        }
      }

      // Calculate path and depth
      const path = await calculatePath(body.parentId || null, request.user!.id);
      const depth = calculateDepth(path);

      // Get next position
      const lastCategory = await prisma.category.findFirst({
        where: {
          userId: request.user!.id,
          parentId: body.parentId || null,
        },
        orderBy: { position: "desc" },
        select: { position: true },
      });

      const category = await prisma.category.create({
        data: {
          userId: request.user!.id,
          name: body.name,
          description: body.description,
          framingQuestion: body.framingQuestion,
          iconEmoji: body.iconEmoji,
          color: body.color,
          parentId: body.parentId,
          path,
          depth,
          learningIntent: body.learningIntent,
          depthGoal: body.depthGoal,
          position: (lastCategory?.position ?? -1) + 1,
        },
        include: {
          parent: {
            select: { id: true, name: true },
          },
        },
      });

      // Record evolution
      await recordEvolution(category.id, request.user!.id, "created", null, {
        name: category.name,
        parentId: category.parentId,
      });

      // Sync to LKGC (non-blocking)
      syncCategoryOnCreate(category).catch(() => {});

      return reply.status(201).send(category);
    },
  );

  // Update category
  app.patch<{ Params: { id: string } }>(
    "/:id",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Categories"],
        summary: "Update a category",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const body = updateCategorySchema.parse(request.body);

      const existing = await prisma.category.findFirst({
        where: { id, userId: request.user!.id },
      });

      if (!existing) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Category not found",
        });
      }

      const previousState = { ...existing };

      const category = await prisma.category.update({
        where: { id },
        data: body,
      });

      // Record significant changes
      if (body.name && body.name !== existing.name) {
        await recordEvolution(id, request.user!.id, "renamed", previousState, {
          name: body.name,
        });
      }

      if (
        body.learningIntent &&
        body.learningIntent !== existing.learningIntent
      ) {
        await recordEvolution(
          id,
          request.user!.id,
          "intent_changed",
          previousState,
          {
            learningIntent: body.learningIntent,
          },
        );
      }

      return reply.send(category);
    },
  );

  // Delete category
  app.delete<{ Params: { id: string } }>(
    "/:id",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Categories"],
        summary: "Delete a category",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const existing = await prisma.category.findFirst({
        where: { id, userId: request.user!.id },
        include: {
          children: { select: { id: true } },
          cardParticipations: { select: { id: true } },
        },
      });

      if (!existing) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Category not found",
        });
      }

      // Move children to parent
      if (existing.children.length > 0) {
        await prisma.category.updateMany({
          where: { parentId: id },
          data: { parentId: existing.parentId },
        });

        // Recalculate paths for children
        for (const child of existing.children) {
          const newPath = await calculatePath(
            existing.parentId,
            request.user!.id,
          );
          await prisma.category.update({
            where: { id: child.id },
            data: { path: newPath, depth: calculateDepth(newPath) },
          });
        }
      }

      // Delete participations (cards are not deleted, just unlinked)
      await prisma.cardCategoryParticipation.deleteMany({
        where: { categoryId: id },
      });

      // Delete relations
      await prisma.categoryRelation.deleteMany({
        where: {
          OR: [{ sourceCategoryId: id }, { targetCategoryId: id }],
        },
      });

      // Delete the category
      await prisma.category.delete({
        where: { id },
      });

      await recordEvolution(id, request.user!.id, "archived", existing, null);

      return reply.status(204).send();
    },
  );

  // ===== CATEGORY OPERATIONS =====

  // Move category (re-parent)
  app.post<{ Params: { id: string } }>(
    "/:id/move",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Categories"],
        summary: "Move category to new parent",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const body = moveCategorySchema.parse(request.body);

      const existing = await prisma.category.findFirst({
        where: { id, userId: request.user!.id },
      });

      if (!existing) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Category not found",
        });
      }

      // Prevent moving to self or descendant
      if (body.newParentId) {
        const newParent = await prisma.category.findFirst({
          where: { id: body.newParentId, userId: request.user!.id },
        });

        if (!newParent) {
          return reply.status(400).send({
            error: "Bad Request",
            message: "New parent category not found",
          });
        }

        if (newParent.path.includes(id)) {
          return reply.status(400).send({
            error: "Bad Request",
            message: "Cannot move category to its own descendant",
          });
        }
      }

      const previousState = {
        parentId: existing.parentId,
        path: existing.path,
      };
      const newPath = await calculatePath(
        body.newParentId || null,
        request.user!.id,
      );

      // Update the category
      const category = await prisma.category.update({
        where: { id },
        data: {
          parentId: body.newParentId,
          path: newPath,
          depth: calculateDepth(newPath),
          position: body.position ?? existing.position,
        },
      });

      // Update all descendants' paths
      const descendants = await prisma.category.findMany({
        where: {
          userId: request.user!.id,
          path: { has: id },
        },
      });

      for (const desc of descendants) {
        const oldPrefix = existing.path.concat(id);
        const newPrefix = newPath.concat(id);
        const newDescPath = desc.path.map((p, i) =>
          i < oldPrefix.length ? newPrefix[i] : p,
        );
        newDescPath.splice(0, oldPrefix.length, ...newPrefix);

        await prisma.category.update({
          where: { id: desc.id },
          data: {
            path: newDescPath,
            depth: calculateDepth(newDescPath),
          },
        });
      }

      await recordEvolution(
        id,
        request.user!.id,
        "reparented",
        previousState,
        { parentId: body.newParentId, path: newPath },
        [],
        body.reason,
      );

      return reply.send(category);
    },
  );

  // Split category
  app.post<{ Params: { id: string } }>(
    "/:id/split",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Categories"],
        summary: "Split category into children",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const body = splitCategorySchema.parse(request.body);

      const existing = await prisma.category.findFirst({
        where: { id, userId: request.user!.id },
      });

      if (!existing) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Category not found",
        });
      }

      const newCategories: any[] = [];
      const newPath = [...existing.path, existing.id];

      // Create child categories
      for (let i = 0; i < body.childNames.length; i++) {
        const childName = body.childNames[i];
        const cardIds = body.cardAssignments[childName] || [];

        const child = await prisma.category.create({
          data: {
            userId: request.user!.id,
            name: childName,
            parentId: body.keepParent ? id : existing.parentId,
            path: body.keepParent ? newPath : existing.path,
            depth: body.keepParent ? existing.depth + 1 : existing.depth,
            learningIntent: existing.learningIntent,
            depthGoal: existing.depthGoal,
            iconEmoji: existing.iconEmoji,
            color: existing.color,
            position: i,
          },
        });

        newCategories.push(child);

        // Move cards to new category
        if (cardIds.length > 0) {
          await prisma.cardCategoryParticipation.updateMany({
            where: {
              categoryId: id,
              cardId: { in: cardIds },
            },
            data: {
              categoryId: child.id,
            },
          });
        }
      }

      // If not keeping parent, move remaining cards and delete
      if (!body.keepParent) {
        // Move any remaining participations to first child
        await prisma.cardCategoryParticipation.updateMany({
          where: { categoryId: id },
          data: { categoryId: newCategories[0].id },
        });

        // Move existing children
        await prisma.category.updateMany({
          where: { parentId: id },
          data: { parentId: existing.parentId },
        });

        // Delete the split category
        await prisma.category.delete({ where: { id } });
      }

      await recordEvolution(
        id,
        request.user!.id,
        "split",
        existing,
        { childNames: body.childNames, keepParent: body.keepParent },
        newCategories.map((c) => c.id),
        body.reason,
      );

      // Update stats
      for (const cat of newCategories) {
        await updateCategoryStats(cat.id);
      }

      return reply.send({
        message: "Category split successfully",
        newCategories,
        parentDeleted: !body.keepParent,
      });
    },
  );

  // Merge categories
  app.post(
    "/merge",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Categories"],
        summary: "Merge multiple categories into one",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = mergeCategoriesSchema.parse(request.body);

      // Verify all source categories exist
      const sources = await prisma.category.findMany({
        where: {
          id: { in: body.sourceIds },
          userId: request.user!.id,
        },
      });

      if (sources.length !== body.sourceIds.length) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "One or more source categories not found",
        });
      }

      // Use first category's parent
      const firstSource = sources[0];

      // Create merged category
      const merged = await prisma.category.create({
        data: {
          userId: request.user!.id,
          name: body.targetName,
          description: body.targetDescription,
          parentId: firstSource.parentId,
          path: firstSource.path,
          depth: firstSource.depth,
          learningIntent: firstSource.learningIntent,
          depthGoal: firstSource.depthGoal,
          position: firstSource.position,
        },
      });

      // Move all participations to merged category
      await prisma.cardCategoryParticipation.updateMany({
        where: {
          categoryId: { in: body.sourceIds },
        },
        data: {
          categoryId: merged.id,
        },
      });

      // Move all children to merged category
      await prisma.category.updateMany({
        where: {
          parentId: { in: body.sourceIds },
        },
        data: {
          parentId: merged.id,
        },
      });

      // Merge relations (combine all relations from sources)
      const relations = await prisma.categoryRelation.findMany({
        where: {
          OR: [
            { sourceCategoryId: { in: body.sourceIds } },
            { targetCategoryId: { in: body.sourceIds } },
          ],
        },
      });

      for (const rel of relations) {
        const newSourceId = body.sourceIds.includes(rel.sourceCategoryId)
          ? merged.id
          : rel.sourceCategoryId;
        const newTargetId = body.sourceIds.includes(rel.targetCategoryId)
          ? merged.id
          : rel.targetCategoryId;

        // Skip self-relations
        if (newSourceId === newTargetId) continue;

        // Create new relation if doesn't exist
        await prisma.categoryRelation.upsert({
          where: {
            sourceCategoryId_targetCategoryId_relationType: {
              sourceCategoryId: newSourceId,
              targetCategoryId: newTargetId,
              relationType: rel.relationType,
            },
          },
          create: {
            userId: request.user!.id,
            sourceCategoryId: newSourceId,
            targetCategoryId: newTargetId,
            relationType: rel.relationType,
            strength: rel.strength,
            description: rel.description,
          },
          update: {},
        });
      }

      // Delete source categories
      await prisma.categoryRelation.deleteMany({
        where: {
          OR: [
            { sourceCategoryId: { in: body.sourceIds } },
            { targetCategoryId: { in: body.sourceIds } },
          ],
        },
      });

      await prisma.category.deleteMany({
        where: { id: { in: body.sourceIds } },
      });

      await recordEvolution(
        merged.id,
        request.user!.id,
        "merged",
        { sourceIds: body.sourceIds },
        { name: body.targetName },
        body.sourceIds,
        body.reason,
      );

      await updateCategoryStats(merged.id);

      return reply.send({
        message: "Categories merged successfully",
        category: merged,
      });
    },
  );

  // ===== CATEGORY RELATIONSHIPS =====

  // Create relationship
  app.post(
    "/relations",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Categories"],
        summary: "Create relationship between categories",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = categoryRelationSchema.parse(request.body);

      // Verify both categories exist
      const [source, target] = await Promise.all([
        prisma.category.findFirst({
          where: { id: body.sourceCategoryId, userId: request.user!.id },
        }),
        prisma.category.findFirst({
          where: { id: body.targetCategoryId, userId: request.user!.id },
        }),
      ]);

      if (!source || !target) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "One or both categories not found",
        });
      }

      // Check for existing relation
      const existing = await prisma.categoryRelation.findFirst({
        where: {
          sourceCategoryId: body.sourceCategoryId,
          targetCategoryId: body.targetCategoryId,
          relationType: body.relationType,
        },
      });

      if (existing) {
        return reply.status(409).send({
          error: "Conflict",
          message: "Relationship already exists",
        });
      }

      const relation = await prisma.categoryRelation.create({
        data: {
          userId: request.user!.id,
          sourceCategoryId: body.sourceCategoryId,
          targetCategoryId: body.targetCategoryId,
          relationType: body.relationType,
          strength: body.strength,
          description: body.description,
          isDirectional:
            body.relationType !== "is_like" &&
            body.relationType !== "contrasts_with",
        },
        include: {
          sourceCategory: {
            select: { id: true, name: true, iconEmoji: true, color: true },
          },
          targetCategory: {
            select: { id: true, name: true, iconEmoji: true, color: true },
          },
        },
      });

      // Sync relation to LKGC (non-blocking)
      syncCategoryRelationOnCreate({
        id: relation.id,
        userId: request.user!.id,
        sourceCategoryId: relation.sourceCategoryId,
        targetCategoryId: relation.targetCategoryId,
        relationType: relation.relationType,
        strength: relation.strength,
        isUserConfirmed: true,
        isAutoSuggested: false,
      }).catch(() => {});

      return reply.status(201).send(relation);
    },
  );

  // List relations for a category
  app.get<{ Params: { id: string } }>(
    "/:id/relations",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Categories"],
        summary: "Get relationships for a category",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const relations = await prisma.categoryRelation.findMany({
        where: {
          userId: request.user!.id,
          OR: [{ sourceCategoryId: id }, { targetCategoryId: id }],
        },
        include: {
          sourceCategory: {
            select: { id: true, name: true, iconEmoji: true, color: true },
          },
          targetCategory: {
            select: { id: true, name: true, iconEmoji: true, color: true },
          },
        },
      });

      const outgoing = relations.filter((r) => r.sourceCategoryId === id);
      const incoming = relations.filter((r) => r.targetCategoryId === id);

      return reply.send({ outgoing, incoming });
    },
  );

  // Delete relationship
  app.delete<{ Params: { relationId: string } }>(
    "/relations/:relationId",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Categories"],
        summary: "Delete a category relationship",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { relationId } = request.params;

      const relation = await prisma.categoryRelation.findFirst({
        where: { id: relationId, userId: request.user!.id },
      });

      if (!relation) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Relationship not found",
        });
      }

      await prisma.categoryRelation.delete({
        where: { id: relationId },
      });

      return reply.status(204).send();
    },
  );

  // ===== CARD PARTICIPATION =====

  // Add card to category
  app.post(
    "/participations",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Categories"],
        summary: "Add a card to a category",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = addCardToCategorySchema.parse(request.body);

      // Verify card and category exist
      const [card, category] = await Promise.all([
        prisma.card.findFirst({
          where: { id: body.cardId, userId: request.user!.id },
        }),
        prisma.category.findFirst({
          where: { id: body.categoryId, userId: request.user!.id },
        }),
      ]);

      if (!card) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Card not found",
        });
      }

      if (!category) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Category not found",
        });
      }

      // If setting as primary, unset other primaries
      if (body.isPrimary) {
        await prisma.cardCategoryParticipation.updateMany({
          where: { cardId: body.cardId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      const participation = await prisma.cardCategoryParticipation.upsert({
        where: {
          cardId_categoryId: {
            cardId: body.cardId,
            categoryId: body.categoryId,
          },
        },
        create: {
          cardId: body.cardId,
          categoryId: body.categoryId,
          semanticRole: body.semanticRole,
          isPrimary: body.isPrimary,
          contextNotes: body.contextNotes,
          contextTags: body.contextTags || [],
          learningGoal: body.learningGoal,
        },
        update: {
          semanticRole: body.semanticRole,
          isPrimary: body.isPrimary,
          contextNotes: body.contextNotes,
          contextTags: body.contextTags || [],
          learningGoal: body.learningGoal,
        },
        include: {
          category: {
            select: { id: true, name: true, iconEmoji: true, color: true },
          },
        },
      });

      await updateCategoryStats(body.categoryId);

      return reply.status(201).send(participation);
    },
  );

  // Bulk add cards to category
  app.post(
    "/participations/bulk",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Categories"],
        summary: "Add multiple cards to a category",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = bulkAddCardsSchema.parse(request.body);

      // Verify category exists
      const category = await prisma.category.findFirst({
        where: { id: body.categoryId, userId: request.user!.id },
      });

      if (!category) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Category not found",
        });
      }

      // Verify all cards exist
      const cards = await prisma.card.findMany({
        where: {
          id: { in: body.cardIds },
          userId: request.user!.id,
        },
        select: { id: true },
      });

      const validCardIds = cards.map((c) => c.id);

      // Create participations
      const created = await prisma.cardCategoryParticipation.createMany({
        data: validCardIds.map((cardId) => ({
          cardId,
          categoryId: body.categoryId,
          semanticRole: body.semanticRole,
        })),
        skipDuplicates: true,
      });

      await updateCategoryStats(body.categoryId);

      return reply.status(201).send({
        added: created.count,
        skipped: body.cardIds.length - validCardIds.length,
      });
    },
  );

  // Get cards in category
  app.get<{ Params: { id: string } }>(
    "/:id/cards",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Categories"],
        summary: "Get cards in a category",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const query = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(20),
          offset: z.coerce.number().int().min(0).default(0),
          includeSubcategories: z.coerce.boolean().default(false),
        })
        .parse(request.query);

      // Build category IDs list
      let categoryIds = [id];

      if (query.includeSubcategories) {
        const descendants = await prisma.category.findMany({
          where: {
            userId: request.user!.id,
            path: { has: id },
          },
          select: { id: true },
        });
        categoryIds = categoryIds.concat(descendants.map((d) => d.id));
      }

      const [participations, total] = await Promise.all([
        prisma.cardCategoryParticipation.findMany({
          where: { categoryId: { in: categoryIds } },
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
                tags: true,
              },
            },
            category: {
              select: { id: true, name: true },
            },
          },
          orderBy: [{ isPrimary: "desc" }, { contextMastery: "desc" }],
        }),
        prisma.cardCategoryParticipation.count({
          where: { categoryId: { in: categoryIds } },
        }),
      ]);

      return reply.send({
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

  // Remove card from category
  app.delete<{ Params: { cardId: string; categoryId: string } }>(
    "/participations/:cardId/:categoryId",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Categories"],
        summary: "Remove a card from a category",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { cardId, categoryId } = request.params;

      const participation = await prisma.cardCategoryParticipation.findFirst({
        where: {
          cardId,
          categoryId,
          category: { userId: request.user!.id },
        },
      });

      if (!participation) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Participation not found",
        });
      }

      await prisma.cardCategoryParticipation.delete({
        where: { id: participation.id },
      });

      await updateCategoryStats(categoryId);

      return reply.status(204).send();
    },
  );

  // ===== CONTEXT FACES =====

  // Create/update context face
  app.post(
    "/context-faces",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Categories"],
        summary: "Create or update a context-specific card face",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = contextFaceSchema.parse(request.body);

      // Verify card and category
      const [card, category] = await Promise.all([
        prisma.card.findFirst({
          where: { id: body.cardId, userId: request.user!.id },
        }),
        prisma.category.findFirst({
          where: { id: body.categoryId, userId: request.user!.id },
        }),
      ]);

      if (!card || !category) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Card or category not found",
        });
      }

      const face = await prisma.cardContextFace.upsert({
        where: {
          cardId_categoryId: {
            cardId: body.cardId,
            categoryId: body.categoryId,
          },
        },
        create: {
          cardId: body.cardId,
          categoryId: body.categoryId,
          frontOverride: body.frontOverride,
          backOverride: body.backOverride,
          promptOverride: body.promptOverride,
        },
        update: {
          frontOverride: body.frontOverride,
          backOverride: body.backOverride,
          promptOverride: body.promptOverride,
        },
      });

      return reply.status(201).send(face);
    },
  );

  // Get context faces for a card
  app.get<{ Params: { cardId: string } }>(
    "/cards/:cardId/context-faces",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Categories"],
        summary: "Get all context faces for a card",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { cardId } = request.params;

      const faces = await prisma.cardContextFace.findMany({
        where: {
          cardId,
          card: { userId: request.user!.id },
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

      return reply.send(faces);
    },
  );

  // ===== EVOLUTION HISTORY =====

  // Get evolution history for a category
  app.get<{ Params: { id: string } }>(
    "/:id/history",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Categories"],
        summary: "Get evolution history for a category",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const history = await prisma.categoryEvolutionEvent.findMany({
        where: {
          categoryId: id,
          userId: request.user!.id,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      return reply.send(history);
    },
  );

  // Get user's category evolution timeline
  app.get(
    "/evolution/timeline",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Categories"],
        summary: "Get user's category evolution timeline",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        })
        .parse(request.query);

      const events = await prisma.categoryEvolutionEvent.findMany({
        where: { userId: request.user!.id },
        orderBy: { createdAt: "desc" },
        take: query.limit,
        skip: query.offset,
        include: {
          category: {
            select: { id: true, name: true, iconEmoji: true },
          },
        },
      });

      return reply.send(events);
    },
  );
}
