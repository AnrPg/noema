// =============================================================================
// STRUCTURAL REFACTORING ROUTES - SUBCATEGORIES AS COGNITIVE REFINEMENT
// =============================================================================
// Structural changes are LEARNING EVENTS, not admin edits.
// They reflect the evolution of understanding and must:
// 1. Never reset spaced repetition schedules or card histories
// 2. Maintain an append-only event log for timeline and rollback
// 3. Support offline-first conflict resolution
// 4. Provide AI hooks for suggestions and analysis
// =============================================================================

import {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
  RouteGenericInterface,
} from "fastify";
import { z } from "zod";
import { prisma } from "../config/database.js";
import { authenticate } from "../middleware/auth.js";
import { Prisma } from "@prisma/client";

// =============================================================================
// ROUTE GENERIC INTERFACES
// =============================================================================

interface EventIdParams extends RouteGenericInterface {
  Params: { eventId: string };
}

interface SnapshotIdParams extends RouteGenericInterface {
  Params: { snapshotId: string };
}

interface CategoryIdParams extends RouteGenericInterface {
  Params: { categoryId: string };
}

interface _SuggestionIdParams extends RouteGenericInterface {
  Params: { suggestionId: string };
}

interface SnapshotDiffQuery extends RouteGenericInterface {
  Querystring: { fromSnapshotId: string; toSnapshotId: string };
}

interface RollbackBody extends RouteGenericInterface {
  Params: { eventId: string };
  Body: { reason?: string };
}

interface SuggestionResponseBody extends RouteGenericInterface {
  Params: { suggestionId: string };
  Body: { action: "accept" | "reject" | "defer" };
}

// =============================================================================
// SCHEMAS - Comprehensive validation for refactoring operations
// =============================================================================

// Split child definition
const splitChildDefinitionSchema = z.object({
  tempId: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  framingQuestion: z.string().max(500).optional(),
  semanticIntent: z.string().max(200).optional(),
  iconEmoji: z.string().max(10).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  cardIds: z.array(z.string()),
  learningIntent: z
    .enum(["foundational", "contextual", "reference"])
    .optional(),
  depthGoal: z
    .enum(["recognition", "recall", "application", "synthesis"])
    .optional(),
});

// Split distinction articulation
const splitDistinctionSchema = z.object({
  distinctionStatement: z.string().min(1).max(1000),
  exemplarCardIds: z
    .array(
      z.object({
        childTempId: z.string(),
        cardId: z.string(),
      }),
    )
    .optional(),
  aiConfidence: z.number().min(0).max(1).optional(),
});

// Full split operation input
const splitCategoryInputSchema = z.object({
  categoryId: z.string(),
  children: z.array(splitChildDefinitionSchema).min(2),
  distinctions: z.array(splitDistinctionSchema).optional(),
  parentDisposition: z.enum([
    "keep_as_container",
    "archive",
    "convert_to_first_child",
  ]),
  reason: z.string().max(1000).optional(),
  requestAIAnalysis: z.boolean().default(false),
  clientTimestamp: z.coerce.date().optional(),
  clientId: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

// Merge operation input
const mergeCategoriesInputSchema = z.object({
  sourceCategoryIds: z.array(z.string()).min(2),
  target: z.object({
    existingCategoryId: z.string().optional(),
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(2000).optional(),
    framingQuestion: z.string().max(500).optional(),
    semanticIntent: z.string().max(200).optional(),
    iconEmoji: z.string().max(10).optional(),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
    parentId: z.string().optional(),
  }),
  duplicateHandling: z.enum([
    "keep_highest_mastery",
    "keep_all_participations",
    "merge_participations",
  ]),
  annotationHandling: z.enum(["keep_all", "keep_most_recent", "merge_by_type"]),
  emphasisHandling: z.enum(["keep_all", "keep_from_primary", "disable_all"]),
  rationale: z.string().max(1000).optional(),
  requestAIValidation: z.boolean().default(false),
  clientTimestamp: z.coerce.date().optional(),
  clientId: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

// Move operation input
const moveCategoryInputSchema = z.object({
  categoryId: z.string(),
  newParentId: z.string().nullable(),
  position: z.number().int().min(0).optional(),
  reason: z.string().max(1000).optional(),
  clientTimestamp: z.coerce.date().optional(),
  clientId: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

// Snapshot creation input
const createSnapshotInputSchema = z.object({
  name: z.string().min(1).max(100),
  categoryIds: z.array(z.string()).optional(), // If empty, snapshot all
});

// Timeline query
const timelineQuerySchema = z.object({
  categoryId: z.string().optional(),
  operationTypes: z
    .array(
      z.enum([
        "split",
        "merge",
        "move",
        "rename",
        "archive",
        "restore",
        "bulk_reassign",
      ]),
    )
    .optional(),
  includeRolledBack: z.coerce.boolean().default(false),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// Conflict resolution input
const resolveConflictInputSchema = z.object({
  eventId: z.string(),
  strategy: z.enum(["accept_local", "accept_remote", "merge_both", "manual"]),
  actions: z
    .array(
      z.object({
        actionType: z.enum(["keep", "discard", "rename", "reassign"]),
        targetType: z.enum(["category", "card", "relation", "annotation"]),
        targetId: z.string(),
        newValue: z.any().optional(),
      }),
    )
    .optional(),
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate a unique operation ID for tracking
 */
function _generateOperationId(): string {
  return `refactor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

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
 * Check for cycles in the category hierarchy
 */
async function wouldCreateCycle(
  categoryId: string,
  newParentId: string | null,
  userId: string,
): Promise<boolean> {
  if (!newParentId) return false;
  if (categoryId === newParentId) return true;

  // Get all descendants of the category
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
    select: { id: true },
  });

  if (!category) return false;

  // Check if newParentId is a descendant of categoryId
  const descendants = await prisma.category.findMany({
    where: {
      userId,
      path: { has: categoryId },
    },
    select: { id: true },
  });

  return descendants.some((d) => d.id === newParentId);
}

/**
 * Update paths for a category and all its descendants
 */
async function updateDescendantPaths(
  categoryId: string,
  newPath: string[],
  userId: string,
): Promise<number> {
  const descendants = await prisma.category.findMany({
    where: {
      userId,
      path: { has: categoryId },
    },
    select: { id: true, path: true },
  });

  let updateCount = 0;
  for (const descendant of descendants) {
    const categoryIndex = descendant.path.indexOf(categoryId);
    const relativePath = descendant.path.slice(categoryIndex);
    const updatedPath = [...newPath, ...relativePath];

    await prisma.category.update({
      where: { id: descendant.id },
      data: {
        path: updatedPath,
        depth: updatedPath.length,
      },
    });
    updateCount++;
  }

  return updateCount;
}

/**
 * Create a structural snapshot
 */
async function createSnapshot(
  userId: string,
  name: string | null,
  isAutomatic: boolean,
  refactorEventId?: string,
  categoryIds?: string[],
): Promise<string> {
  // Get all categories (or filtered)
  const whereClause: Prisma.CategoryWhereInput = { userId };
  if (categoryIds && categoryIds.length > 0) {
    whereClause.id = { in: categoryIds };
  }

  const categories = await prisma.category.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      description: true,
      framingQuestion: true,
      semanticIntent: true,
      iconEmoji: true,
      color: true,
      parentId: true,
      depth: true,
      path: true,
      learningIntent: true,
      depthGoal: true,
      maturityStage: true,
      cardCount: true,
      masteryScore: true,
      position: true,
      isArchived: true,
    },
  });

  // Get all relations
  const relations = await prisma.categoryRelation.findMany({
    where: { userId },
    select: {
      id: true,
      sourceCategoryId: true,
      targetCategoryId: true,
      relationType: true,
      strength: true,
      isDirectional: true,
    },
  });

  // Get all participations
  const participations = await prisma.cardCategoryParticipation.findMany({
    where: {
      category: { userId },
    },
    select: {
      cardId: true,
      categoryId: true,
      semanticRole: true,
      isPrimary: true,
      contextMastery: true,
    },
  });

  // Calculate stats
  const maxDepth = categories.reduce((max, c) => Math.max(max, c.depth), 0);

  const snapshot = await prisma.structuralSnapshot.create({
    data: {
      userId,
      name,
      isAutomatic,
      refactorEventId,
      categoryTree: categories as unknown as Prisma.JsonArray,
      relations: relations as unknown as Prisma.JsonArray,
      participations: participations as unknown as Prisma.JsonArray,
      totalCategories: categories.length,
      totalCards: new Set(participations.map((p) => p.cardId)).size,
      totalRelations: relations.length,
      maxDepth,
    },
  });

  return snapshot.id;
}

/**
 * Record a structural refactor event
 */
async function recordRefactorEvent(
  userId: string,
  operationType: string,
  primaryCategoryId: string,
  affectedCategoryIds: string[],
  affectedCardIds: string[],
  operationInput: Record<string, unknown>,
  userReason?: string,
  clientId?: string,
  clientTimestamp?: Date,
  beforeSnapshotId?: string,
): Promise<string> {
  const event = await prisma.structuralRefactorEvent.create({
    data: {
      userId,
      operationType,
      status: "in_progress",
      primaryCategoryId,
      affectedCategoryIds,
      affectedCardIds,
      operationInput: operationInput as Prisma.JsonObject,
      userReason,
      clientId,
      clientTimestamp,
      beforeSnapshotId,
      isRollbackable: true,
      wasRolledBack: false,
    },
  });

  return event.id;
}

/**
 * Complete a refactor event
 */
async function completeRefactorEvent(
  eventId: string,
  operationResult: Record<string, unknown>,
  afterSnapshotId?: string,
  aiSummary?: string,
) {
  await prisma.structuralRefactorEvent.update({
    where: { id: eventId },
    data: {
      status: "completed",
      operationResult: operationResult as Prisma.JsonObject,
      afterSnapshotId,
      aiSummary,
    },
  });
}

/**
 * Fail a refactor event
 */
async function failRefactorEvent(eventId: string, error: string) {
  await prisma.structuralRefactorEvent.update({
    where: { id: eventId },
    data: {
      status: "failed",
      operationResult: { error } as Prisma.JsonObject,
    },
  });
}

/**
 * Check for existing operation with same idempotency key
 */
async function checkIdempotency(
  userId: string,
  idempotencyKey: string,
): Promise<string | null> {
  const existing = await prisma.structuralRefactorEvent.findFirst({
    where: {
      userId,
      operationInput: {
        path: ["idempotencyKey"],
        equals: idempotencyKey,
      },
      status: "completed",
    },
    select: { id: true },
  });

  return existing?.id ?? null;
}

/**
 * Detect conflicts with concurrent operations
 */
async function detectConflicts(
  userId: string,
  affectedCategoryIds: string[],
  clientTimestamp?: Date,
): Promise<{
  hasConflict: boolean;
  conflictingEventId?: string;
  conflictType?: string;
}> {
  if (!clientTimestamp) {
    return { hasConflict: false };
  }

  // Find any operations affecting these categories since client timestamp
  const conflictingEvents = await prisma.structuralRefactorEvent.findFirst({
    where: {
      userId,
      status: "completed",
      serverTimestamp: { gt: clientTimestamp },
      OR: [
        { primaryCategoryId: { in: affectedCategoryIds } },
        {
          affectedCategoryIds: {
            hasSome: affectedCategoryIds,
          },
        },
      ],
    },
    select: { id: true, operationType: true },
    orderBy: { serverTimestamp: "desc" },
  });

  if (conflictingEvents) {
    return {
      hasConflict: true,
      conflictingEventId: conflictingEvents.id,
      conflictType: `concurrent_${conflictingEvents.operationType}`,
    };
  }

  return { hasConflict: false };
}

// =============================================================================
// PLUGIN EXTENSION POINTS
// =============================================================================

interface RefactorPlugin {
  name: string;
  // Pre-validation hooks
  preValidateSplit?: (
    input: z.infer<typeof splitCategoryInputSchema>,
    userId: string,
  ) => Promise<{ valid: boolean; errors?: string[] }>;
  preValidateMerge?: (
    input: z.infer<typeof mergeCategoriesInputSchema>,
    userId: string,
  ) => Promise<{ valid: boolean; errors?: string[] }>;
  preValidateMove?: (
    input: z.infer<typeof moveCategoryInputSchema>,
    userId: string,
  ) => Promise<{ valid: boolean; errors?: string[] }>;
  // Post-refactor hooks
  postSplit?: (result: SplitResult, userId: string) => Promise<void>;
  postMerge?: (result: MergeResult, userId: string) => Promise<void>;
  postMove?: (result: MoveResult, userId: string) => Promise<void>;
  // AI suggestion providers
  suggestSplitAssignments?: (
    categoryId: string,
    childDefinitions: z.infer<typeof splitChildDefinitionSchema>[],
    userId: string,
  ) => Promise<
    {
      cardId: string;
      suggestedChildTempId: string;
      confidence: number;
      reason: string;
    }[]
  >;
  suggestMergeTargets?: (
    categoryIds: string[],
    userId: string,
  ) => Promise<{ name: string; framingQuestion?: string; rationale: string }>;
}

// Registry for plugins
const refactorPlugins: RefactorPlugin[] = [];

/**
 * Register a refactor plugin
 */
export function registerRefactorPlugin(plugin: RefactorPlugin) {
  refactorPlugins.push(plugin);
}

/**
 * Run pre-validation hooks
 */
async function runPreValidation(
  operationType: "split" | "merge" | "move",
  input: unknown,
  userId: string,
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  for (const plugin of refactorPlugins) {
    let result: { valid: boolean; errors?: string[] } | undefined;

    switch (operationType) {
      case "split":
        result = await plugin.preValidateSplit?.(
          input as z.infer<typeof splitCategoryInputSchema>,
          userId,
        );
        break;
      case "merge":
        result = await plugin.preValidateMerge?.(
          input as z.infer<typeof mergeCategoriesInputSchema>,
          userId,
        );
        break;
      case "move":
        result = await plugin.preValidateMove?.(
          input as z.infer<typeof moveCategoryInputSchema>,
          userId,
        );
        break;
    }

    if (result && !result.valid && result.errors) {
      errors.push(...result.errors);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Run post-refactor hooks
 */
async function runPostHooks(
  operationType: "split" | "merge" | "move",
  result: SplitResult | MergeResult | MoveResult,
  userId: string,
): Promise<void> {
  for (const plugin of refactorPlugins) {
    switch (operationType) {
      case "split":
        await plugin.postSplit?.(result as SplitResult, userId);
        break;
      case "merge":
        await plugin.postMerge?.(result as MergeResult, userId);
        break;
      case "move":
        await plugin.postMove?.(result as MoveResult, userId);
        break;
    }
  }
}

// =============================================================================
// RESULT TYPES
// =============================================================================

interface SplitResult {
  operationId: string;
  originalCategoryId: string;
  createdChildren: Record<string, string>;
  updatedParent?: {
    id: string;
    name: string;
    isArchived: boolean;
  };
  cardReassignments: {
    cardId: string;
    fromCategoryId: string;
    toCategoryId: string;
  }[];
  evolutionEventId: string;
  beforeSnapshotId: string;
  afterSnapshotId: string;
}

interface MergeResult {
  operationId: string;
  mergedCategoryId: string;
  archivedSourceIds: string[];
  cardsMigrated: number;
  annotationsMigrated: number;
  relationsUpdated: number;
  evolutionEventIds: string[];
  beforeSnapshotId: string;
  afterSnapshotId: string;
}

interface MoveResult {
  operationId: string;
  movedCategory: {
    id: string;
    name: string;
    newPath: string[];
    newDepth: number;
  };
  previousParentId: string | null;
  updatedDescendantCount: number;
  relationsUpdated: number;
  evolutionEventId: string;
  beforeSnapshotId: string;
  afterSnapshotId: string;
}

// =============================================================================
// ROUTES
// =============================================================================

export async function refactorRoutes(app: FastifyInstance) {
  // =========================================================================
  // SPLIT OPERATION
  // =========================================================================

  /**
   * Split a category into multiple children
   * POST /refactor/split
   */
  app.post(
    "/split",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Refactoring"],
        summary: "Split a category into multiple children",
        description: `
          Implements the Differentiation Principle: subcategories represent
          increasing conceptual precision. This endpoint creates child categories
          from a parent, preserving all card learning state and history.
        `,
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const input = splitCategoryInputSchema.parse(request.body);
      const userId = request.user!.id;

      // Check idempotency
      if (input.idempotencyKey) {
        const existingId = await checkIdempotency(userId, input.idempotencyKey);
        if (existingId) {
          const existingEvent = await prisma.structuralRefactorEvent.findUnique(
            {
              where: { id: existingId },
              select: { operationResult: true },
            },
          );
          return reply.send({
            success: true,
            data: existingEvent?.operationResult,
            idempotent: true,
          });
        }
      }

      // Verify source category exists and belongs to user
      const sourceCategory = await prisma.category.findFirst({
        where: { id: input.categoryId, userId },
        include: {
          cardParticipations: {
            select: { cardId: true, id: true },
          },
        },
      });

      if (!sourceCategory) {
        return reply.status(404).send({
          error: "Category not found",
          code: "CATEGORY_NOT_FOUND",
        });
      }

      // Check for conflicts
      const conflictCheck = await detectConflicts(
        userId,
        [input.categoryId],
        input.clientTimestamp,
      );

      if (conflictCheck.hasConflict) {
        return reply.status(409).send({
          error: "Concurrent modification detected",
          code: "CONFLICT_DETECTED",
          conflictingEventId: conflictCheck.conflictingEventId,
          conflictType: conflictCheck.conflictType,
        });
      }

      // Run plugin pre-validation
      const validation = await runPreValidation("split", input, userId);
      if (!validation.valid) {
        return reply.status(400).send({
          error: "Validation failed",
          code: "VALIDATION_FAILED",
          details: validation.errors,
        });
      }

      // Validate card assignments - all cards must belong to source category
      const sourceCardIds = new Set(
        sourceCategory.cardParticipations.map((p) => p.cardId),
      );
      const allAssignedCards = new Set<string>();

      for (const child of input.children) {
        for (const cardId of child.cardIds) {
          if (!sourceCardIds.has(cardId)) {
            return reply.status(400).send({
              error: `Card ${cardId} is not in source category`,
              code: "INVALID_CARD_ASSIGNMENT",
            });
          }
          allAssignedCards.add(cardId);
        }
      }

      // Create before snapshot
      const beforeSnapshotId = await createSnapshot(
        userId,
        null,
        true,
        undefined,
        [input.categoryId],
      );

      // Start recording the refactor event
      const affectedCardIds = Array.from(allAssignedCards);
      const eventId = await recordRefactorEvent(
        userId,
        "split",
        input.categoryId,
        [input.categoryId], // Will be updated with child IDs
        affectedCardIds,
        input as unknown as Record<string, unknown>,
        input.reason,
        input.clientId,
        input.clientTimestamp,
        beforeSnapshotId,
      );

      try {
        // Execute the split in a transaction
        const result = await prisma.$transaction(async (tx) => {
          const createdChildren: Record<string, string> = {};
          const cardReassignments: {
            cardId: string;
            fromCategoryId: string;
            toCategoryId: string;
          }[] = [];

          // Create child categories
          for (const childDef of input.children) {
            const childPath = [...sourceCategory.path, sourceCategory.id];

            const child = await tx.category.create({
              data: {
                userId,
                name: childDef.name,
                description: childDef.description,
                framingQuestion: childDef.framingQuestion,
                semanticIntent: childDef.semanticIntent,
                iconEmoji: childDef.iconEmoji || sourceCategory.iconEmoji,
                color: childDef.color || sourceCategory.color,
                parentId: sourceCategory.id,
                depth: sourceCategory.depth + 1,
                path: childPath,
                learningIntent:
                  childDef.learningIntent || sourceCategory.learningIntent,
                depthGoal: childDef.depthGoal || sourceCategory.depthGoal,
                difficultyMultiplier: sourceCategory.difficultyMultiplier,
                decayRateMultiplier: sourceCategory.decayRateMultiplier,
                maturityStage: "acquisition",
                position: Object.keys(createdChildren).length,
              },
            });

            createdChildren[childDef.tempId] = child.id;

            // Reassign cards to this child
            for (const cardId of childDef.cardIds) {
              // Get the existing participation
              const existingParticipation =
                await tx.cardCategoryParticipation.findFirst({
                  where: {
                    cardId,
                    categoryId: sourceCategory.id,
                  },
                });

              if (existingParticipation) {
                // Create new participation in child category
                // IMPORTANT: Preserve all learning state!
                await tx.cardCategoryParticipation.create({
                  data: {
                    cardId,
                    categoryId: child.id,
                    semanticRole: existingParticipation.semanticRole,
                    isPrimary: existingParticipation.isPrimary,
                    contextDifficulty: existingParticipation.contextDifficulty,
                    contextMastery: existingParticipation.contextMastery,
                    reviewCountInContext:
                      existingParticipation.reviewCountInContext,
                    lastReviewedInContext:
                      existingParticipation.lastReviewedInContext,
                    contextNotes: existingParticipation.contextNotes,
                    contextTags: existingParticipation.contextTags,
                    learningGoal: existingParticipation.learningGoal,
                    targetMastery: existingParticipation.targetMastery,
                    emphasisLevel: existingParticipation.emphasisLevel,
                    isContextHighlighted:
                      existingParticipation.isContextHighlighted,
                  },
                });

                // Remove from source category (unless keeping parent)
                if (input.parentDisposition !== "keep_as_container") {
                  await tx.cardCategoryParticipation.delete({
                    where: { id: existingParticipation.id },
                  });
                }

                cardReassignments.push({
                  cardId,
                  fromCategoryId: sourceCategory.id,
                  toCategoryId: child.id,
                });

                // Move annotations to child category
                await tx.contextualAnnotation.updateMany({
                  where: {
                    cardId,
                    categoryId: sourceCategory.id,
                  },
                  data: {
                    categoryId: child.id,
                  },
                });

                // Move context faces
                await tx.cardContextFace.updateMany({
                  where: {
                    cardId,
                    categoryId: sourceCategory.id,
                  },
                  data: {
                    categoryId: child.id,
                  },
                });

                // Move emphasis rules (create copies for child)
                const emphasisRules = await tx.emphasisRule.findMany({
                  where: {
                    categoryId: sourceCategory.id,
                    targetCardIds: { has: cardId },
                  },
                });

                for (const rule of emphasisRules) {
                  await tx.emphasisRule.create({
                    data: {
                      userId,
                      categoryId: child.id,
                      name: rule.name,
                      description: rule.description,
                      ruleType: rule.ruleType,
                      targetCardIds: [cardId],
                      targetSemanticRoles: rule.targetSemanticRoles,
                      targetTags: rule.targetTags,
                      contentSelector:
                        (rule.contentSelector as Prisma.InputJsonValue) ??
                        Prisma.JsonNull,
                      emphasisLevel: rule.emphasisLevel,
                      style:
                        (rule.style as Prisma.InputJsonValue) ??
                        Prisma.JsonNull,
                      injectedPrompt: rule.injectedPrompt,
                      promptPosition: rule.promptPosition,
                      minReviewCount: rule.minReviewCount,
                      minMastery: rule.minMastery,
                      maxMastery: rule.maxMastery,
                      activeLearningModes: rule.activeLearningModes,
                      isEnabled: rule.isEnabled,
                      priority: rule.priority,
                    },
                  });
                }
              }
            }

            // Update card count
            await tx.category.update({
              where: { id: child.id },
              data: { cardCount: childDef.cardIds.length },
            });

            // Record evolution event for child
            await tx.categoryEvolutionEvent.create({
              data: {
                categoryId: child.id,
                userId,
                eventType: "created",
                newState: {
                  name: child.name,
                  parentId: sourceCategory.id,
                  createdViaSplit: true,
                  sourceCategory: sourceCategory.name,
                },
                relatedCategoryIds: [sourceCategory.id],
                reason: `Created via split from "${sourceCategory.name}"`,
              },
            });
          }

          // Handle parent disposition
          let updatedParent:
            | { id: string; name: string; isArchived: boolean }
            | undefined;

          if (input.parentDisposition === "archive") {
            await tx.category.update({
              where: { id: sourceCategory.id },
              data: { isArchived: true },
            });
            updatedParent = {
              id: sourceCategory.id,
              name: sourceCategory.name,
              isArchived: true,
            };
          } else if (input.parentDisposition === "convert_to_first_child") {
            // Move parent to become a sibling of the children
            // This is a more complex operation - for now, just archive
            await tx.category.update({
              where: { id: sourceCategory.id },
              data: { isArchived: true },
            });
            updatedParent = {
              id: sourceCategory.id,
              name: sourceCategory.name,
              isArchived: true,
            };
          } else {
            // keep_as_container - update card count
            const remainingCards = await tx.cardCategoryParticipation.count({
              where: { categoryId: sourceCategory.id },
            });
            await tx.category.update({
              where: { id: sourceCategory.id },
              data: { cardCount: remainingCards },
            });
            updatedParent = {
              id: sourceCategory.id,
              name: sourceCategory.name,
              isArchived: false,
            };
          }

          // Record evolution event for parent
          await tx.categoryEvolutionEvent.create({
            data: {
              categoryId: sourceCategory.id,
              userId,
              eventType: "split",
              previousState: {
                name: sourceCategory.name,
                cardCount: sourceCategory.cardCount,
              },
              newState: {
                disposition: input.parentDisposition,
                childCount: input.children.length,
                childNames: input.children.map((c) => c.name),
              },
              relatedCategoryIds: Object.values(createdChildren),
              reason: input.reason,
            },
          });

          // Store distinctions if provided
          if (input.distinctions && input.distinctions.length > 0) {
            // Store as part of the refactor event metadata
            // This could be expanded to a separate table if needed
          }

          return {
            createdChildren,
            cardReassignments,
            updatedParent,
          };
        });

        // Create after snapshot
        const afterSnapshotId = await createSnapshot(
          userId,
          null,
          true,
          eventId,
          [input.categoryId, ...Object.values(result.createdChildren)],
        );

        // Build final result
        const splitResult: SplitResult = {
          operationId: eventId,
          originalCategoryId: input.categoryId,
          createdChildren: result.createdChildren,
          updatedParent: result.updatedParent,
          cardReassignments: result.cardReassignments,
          evolutionEventId: eventId,
          beforeSnapshotId,
          afterSnapshotId,
        };

        // Complete the refactor event
        await completeRefactorEvent(
          eventId,
          splitResult as unknown as Record<string, unknown>,
          afterSnapshotId,
        );

        // Update affected category IDs
        await prisma.structuralRefactorEvent.update({
          where: { id: eventId },
          data: {
            affectedCategoryIds: [
              input.categoryId,
              ...Object.values(result.createdChildren),
            ],
          },
        });

        // Run post-split hooks
        await runPostHooks("split", splitResult, userId);

        return reply.send({
          success: true,
          data: splitResult,
        });
      } catch (error) {
        await failRefactorEvent(
          eventId,
          error instanceof Error ? error.message : "Unknown error",
        );
        throw error;
      }
    },
  );

  /**
   * Preview a split operation
   * POST /refactor/split/preview
   */
  app.post(
    "/split/preview",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Refactoring"],
        summary: "Preview a split operation without committing",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const input = splitCategoryInputSchema.parse(request.body);
      const userId = request.user!.id;

      // Verify source category exists
      const sourceCategory = await prisma.category.findFirst({
        where: { id: input.categoryId, userId },
        include: {
          cardParticipations: {
            include: {
              card: {
                select: { id: true, cardType: true, content: true },
              },
            },
          },
          children: {
            select: { id: true, name: true },
          },
        },
      });

      if (!sourceCategory) {
        return reply.status(404).send({
          error: "Category not found",
          code: "CATEGORY_NOT_FOUND",
        });
      }

      // Build preview
      const preview = {
        sourceCategory: {
          id: sourceCategory.id,
          name: sourceCategory.name,
          currentCardCount: sourceCategory.cardCount,
          currentChildren: sourceCategory.children,
        },
        proposedChanges: {
          newChildren: input.children.map((child) => ({
            tempId: child.tempId,
            name: child.name,
            description: child.description,
            framingQuestion: child.framingQuestion,
            cardCount: child.cardIds.length,
            cards: child.cardIds.map((cardId) => {
              const participation = sourceCategory.cardParticipations.find(
                (p) => p.cardId === cardId,
              );
              return {
                cardId,
                cardType: participation?.card?.cardType,
                willPreserveMastery: participation?.contextMastery ?? 0,
              };
            }),
          })),
          parentDisposition: input.parentDisposition,
          cardsRemainingInParent:
            input.parentDisposition === "keep_as_container"
              ? sourceCategory.cardParticipations.filter(
                  (p) =>
                    !input.children.some((c) => c.cardIds.includes(p.cardId)),
                ).length
              : 0,
        },
        navigationChanges: {
          currentPath: [...sourceCategory.path, sourceCategory.id],
          newPaths: input.children.map((child) => ({
            childName: child.name,
            path: [
              ...sourceCategory.path,
              sourceCategory.id,
              `<${child.tempId}>`,
            ],
          })),
        },
        warnings: [] as string[],
      };

      // Add warnings
      const unassignedCards = sourceCategory.cardParticipations.filter(
        (p) => !input.children.some((c) => c.cardIds.includes(p.cardId)),
      );

      if (
        unassignedCards.length > 0 &&
        input.parentDisposition !== "keep_as_container"
      ) {
        preview.warnings.push(
          `${unassignedCards.length} card(s) are not assigned to any child and parent will be archived. These cards will lose their category association.`,
        );
      }

      if (input.children.length > 5) {
        preview.warnings.push(
          `Splitting into ${input.children.length} children may create excessive fragmentation. Consider fewer, more meaningful distinctions.`,
        );
      }

      return reply.send({
        success: true,
        data: preview,
      });
    },
  );

  // =========================================================================
  // MERGE OPERATION
  // =========================================================================

  /**
   * Merge multiple categories into one
   * POST /refactor/merge
   */
  app.post(
    "/merge",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Refactoring"],
        summary: "Merge multiple categories into one",
        description: `
          Implements collapse of distinctions: when two categories turn out to
          represent the same conceptual territory. Preserves all learning state
          and provides options for handling duplicates.
        `,
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const input = mergeCategoriesInputSchema.parse(request.body);
      const userId = request.user!.id;

      // Check idempotency
      if (input.idempotencyKey) {
        const existingId = await checkIdempotency(userId, input.idempotencyKey);
        if (existingId) {
          const existingEvent = await prisma.structuralRefactorEvent.findUnique(
            {
              where: { id: existingId },
              select: { operationResult: true },
            },
          );
          return reply.send({
            success: true,
            data: existingEvent?.operationResult,
            idempotent: true,
          });
        }
      }

      // Verify all source categories exist and belong to user
      const sourceCategories = await prisma.category.findMany({
        where: {
          id: { in: input.sourceCategoryIds },
          userId,
        },
        include: {
          cardParticipations: true,
          outgoingRelations: true,
          incomingRelations: true,
          contextualAnnotations: true,
        },
      });

      if (sourceCategories.length !== input.sourceCategoryIds.length) {
        return reply.status(404).send({
          error: "One or more source categories not found",
          code: "CATEGORY_NOT_FOUND",
        });
      }

      // Check for conflicts
      const conflictCheck = await detectConflicts(
        userId,
        input.sourceCategoryIds,
        input.clientTimestamp,
      );

      if (conflictCheck.hasConflict) {
        return reply.status(409).send({
          error: "Concurrent modification detected",
          code: "CONFLICT_DETECTED",
          conflictingEventId: conflictCheck.conflictingEventId,
          conflictType: conflictCheck.conflictType,
        });
      }

      // Run plugin pre-validation
      const validation = await runPreValidation("merge", input, userId);
      if (!validation.valid) {
        return reply.status(400).send({
          error: "Validation failed",
          code: "VALIDATION_FAILED",
          details: validation.errors,
        });
      }

      // Create before snapshot
      const beforeSnapshotId = await createSnapshot(
        userId,
        null,
        true,
        undefined,
        input.sourceCategoryIds,
      );

      // Collect all affected card IDs
      const affectedCardIds = [
        ...new Set(
          sourceCategories.flatMap((c) =>
            c.cardParticipations.map((p) => p.cardId),
          ),
        ),
      ];

      // Start recording the refactor event
      const eventId = await recordRefactorEvent(
        userId,
        "merge",
        input.sourceCategoryIds[0],
        input.sourceCategoryIds,
        affectedCardIds,
        input as unknown as Record<string, unknown>,
        input.rationale,
        input.clientId,
        input.clientTimestamp,
        beforeSnapshotId,
      );

      try {
        const result = await prisma.$transaction(async (tx) => {
          let targetCategoryId: string;
          let isNewCategory = false;

          // Determine or create target category
          if (input.target.existingCategoryId) {
            // Verify target exists
            const existingTarget = await tx.category.findFirst({
              where: { id: input.target.existingCategoryId, userId },
            });
            if (!existingTarget) {
              throw new Error("Target category not found");
            }
            targetCategoryId = existingTarget.id;
          } else if (input.target.name) {
            // Create new target category
            const firstSource = sourceCategories[0];
            const newTarget = await tx.category.create({
              data: {
                userId,
                name: input.target.name,
                description:
                  input.target.description || firstSource.description,
                framingQuestion:
                  input.target.framingQuestion || firstSource.framingQuestion,
                semanticIntent:
                  input.target.semanticIntent || firstSource.semanticIntent,
                iconEmoji: input.target.iconEmoji || firstSource.iconEmoji,
                color: input.target.color || firstSource.color,
                parentId: input.target.parentId || firstSource.parentId,
                depth: firstSource.depth,
                path: firstSource.path,
                learningIntent: firstSource.learningIntent,
                depthGoal: firstSource.depthGoal,
                maturityStage: "acquisition",
              },
            });
            targetCategoryId = newTarget.id;
            isNewCategory = true;
          } else {
            throw new Error("Must specify either existingCategoryId or name");
          }

          let cardsMigrated = 0;
          let annotationsMigrated = 0;
          let relationsUpdated = 0;
          const evolutionEventIds: string[] = [];

          // Process each source category
          for (const source of sourceCategories) {
            // Skip if source is the target
            if (source.id === targetCategoryId) continue;

            // Migrate card participations
            for (const participation of source.cardParticipations) {
              // Check if card already participates in target
              const existingInTarget =
                await tx.cardCategoryParticipation.findFirst({
                  where: {
                    cardId: participation.cardId,
                    categoryId: targetCategoryId,
                  },
                });

              if (existingInTarget) {
                // Handle duplicate based on strategy
                switch (input.duplicateHandling) {
                  case "keep_highest_mastery":
                    if (
                      participation.contextMastery >
                      existingInTarget.contextMastery
                    ) {
                      await tx.cardCategoryParticipation.update({
                        where: { id: existingInTarget.id },
                        data: {
                          contextMastery: participation.contextMastery,
                          contextDifficulty: participation.contextDifficulty,
                          reviewCountInContext:
                            existingInTarget.reviewCountInContext +
                            participation.reviewCountInContext,
                        },
                      });
                    }
                    await tx.cardCategoryParticipation.delete({
                      where: { id: participation.id },
                    });
                    break;
                  case "keep_all_participations":
                    // Keep both - don't delete source participation
                    // Just update target to point to merged category
                    await tx.cardCategoryParticipation.update({
                      where: { id: participation.id },
                      data: { categoryId: targetCategoryId },
                    });
                    break;
                  case "merge_participations":
                    // Merge stats
                    await tx.cardCategoryParticipation.update({
                      where: { id: existingInTarget.id },
                      data: {
                        contextMastery: Math.max(
                          existingInTarget.contextMastery,
                          participation.contextMastery,
                        ),
                        reviewCountInContext:
                          existingInTarget.reviewCountInContext +
                          participation.reviewCountInContext,
                        contextNotes: existingInTarget.contextNotes
                          ? `${existingInTarget.contextNotes}\n\n---\n\n${participation.contextNotes || ""}`
                          : participation.contextNotes,
                      },
                    });
                    await tx.cardCategoryParticipation.delete({
                      where: { id: participation.id },
                    });
                    break;
                }
              } else {
                // Move participation to target
                await tx.cardCategoryParticipation.update({
                  where: { id: participation.id },
                  data: { categoryId: targetCategoryId },
                });
              }
              cardsMigrated++;
            }

            // Handle annotations
            for (const annotation of source.contextualAnnotations) {
              switch (input.annotationHandling) {
                case "keep_all":
                  await tx.contextualAnnotation.update({
                    where: { id: annotation.id },
                    data: { categoryId: targetCategoryId },
                  });
                  annotationsMigrated++;
                  break;
                case "keep_most_recent": {
                  // Check if there's a newer annotation in target
                  const existingAnnotation =
                    await tx.contextualAnnotation.findFirst({
                      where: {
                        cardId: annotation.cardId,
                        categoryId: targetCategoryId,
                        annotationType: annotation.annotationType,
                      },
                      orderBy: { updatedAt: "desc" },
                    });
                  if (
                    !existingAnnotation ||
                    annotation.updatedAt > existingAnnotation.updatedAt
                  ) {
                    await tx.contextualAnnotation.update({
                      where: { id: annotation.id },
                      data: { categoryId: targetCategoryId },
                    });
                    annotationsMigrated++;
                  } else {
                    await tx.contextualAnnotation.delete({
                      where: { id: annotation.id },
                    });
                  }
                  break;
                }
                case "merge_by_type":
                  await tx.contextualAnnotation.update({
                    where: { id: annotation.id },
                    data: { categoryId: targetCategoryId },
                  });
                  annotationsMigrated++;
                  break;
              }
            }

            // Migrate relations
            for (const relation of [
              ...source.outgoingRelations,
              ...source.incomingRelations,
            ]) {
              // Update relations to point to target
              if (relation.sourceCategoryId === source.id) {
                await tx.categoryRelation.update({
                  where: { id: relation.id },
                  data: { sourceCategoryId: targetCategoryId },
                });
              } else {
                await tx.categoryRelation.update({
                  where: { id: relation.id },
                  data: { targetCategoryId: targetCategoryId },
                });
              }
              relationsUpdated++;
            }

            // Record evolution event for source
            const evolutionEvent = await tx.categoryEvolutionEvent.create({
              data: {
                categoryId: source.id,
                userId,
                eventType: "merged",
                previousState: {
                  name: source.name,
                  cardCount: source.cardCount,
                },
                newState: {
                  mergedInto: targetCategoryId,
                  targetName: input.target.name,
                },
                relatedCategoryIds: [targetCategoryId],
                reason: input.rationale,
              },
            });
            evolutionEventIds.push(evolutionEvent.id);

            // Archive source category
            await tx.category.update({
              where: { id: source.id },
              data: { isArchived: true },
            });
          }

          // Update target category stats
          const finalCardCount = await tx.cardCategoryParticipation.count({
            where: { categoryId: targetCategoryId },
          });
          await tx.category.update({
            where: { id: targetCategoryId },
            data: { cardCount: finalCardCount },
          });

          // Record evolution event for target
          if (isNewCategory) {
            await tx.categoryEvolutionEvent.create({
              data: {
                categoryId: targetCategoryId,
                userId,
                eventType: "created",
                newState: {
                  name: input.target.name,
                  createdViaMerge: true,
                  mergedFrom: sourceCategories.map((c) => c.name),
                },
                relatedCategoryIds: input.sourceCategoryIds,
                reason: `Created via merge of ${sourceCategories.map((c) => `"${c.name}"`).join(", ")}`,
              },
            });
          }

          return {
            targetCategoryId,
            archivedSourceIds: sourceCategories
              .filter((c) => c.id !== targetCategoryId)
              .map((c) => c.id),
            cardsMigrated,
            annotationsMigrated,
            relationsUpdated,
            evolutionEventIds,
          };
        });

        // Create after snapshot
        const afterSnapshotId = await createSnapshot(
          userId,
          null,
          true,
          eventId,
          [result.targetCategoryId],
        );

        // Build final result
        const mergeResult: MergeResult = {
          operationId: eventId,
          mergedCategoryId: result.targetCategoryId,
          archivedSourceIds: result.archivedSourceIds,
          cardsMigrated: result.cardsMigrated,
          annotationsMigrated: result.annotationsMigrated,
          relationsUpdated: result.relationsUpdated,
          evolutionEventIds: result.evolutionEventIds,
          beforeSnapshotId,
          afterSnapshotId,
        };

        // Complete the refactor event
        await completeRefactorEvent(
          eventId,
          mergeResult as unknown as Record<string, unknown>,
          afterSnapshotId,
        );

        // Run post-merge hooks
        await runPostHooks("merge", mergeResult, userId);

        return reply.send({
          success: true,
          data: mergeResult,
        });
      } catch (error) {
        await failRefactorEvent(
          eventId,
          error instanceof Error ? error.message : "Unknown error",
        );
        throw error;
      }
    },
  );

  // =========================================================================
  // MOVE/RE-PARENT OPERATION
  // =========================================================================

  /**
   * Move a category to a new parent
   * POST /refactor/move
   */
  app.post(
    "/move",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Refactoring"],
        summary: "Move a category to a new parent",
        description: `
          Re-parenting is a learning event: "I realized this belongs elsewhere."
          Preserves all card participations, review state, annotation layers,
          and structural metadata.
        `,
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const input = moveCategoryInputSchema.parse(request.body);
      const userId = request.user!.id;

      // Check idempotency
      if (input.idempotencyKey) {
        const existingId = await checkIdempotency(userId, input.idempotencyKey);
        if (existingId) {
          const existingEvent = await prisma.structuralRefactorEvent.findUnique(
            {
              where: { id: existingId },
              select: { operationResult: true },
            },
          );
          return reply.send({
            success: true,
            data: existingEvent?.operationResult,
            idempotent: true,
          });
        }
      }

      // Verify category exists and belongs to user
      const category = await prisma.category.findFirst({
        where: { id: input.categoryId, userId },
        include: {
          cardParticipations: {
            select: { cardId: true },
          },
        },
      });

      if (!category) {
        return reply.status(404).send({
          error: "Category not found",
          code: "CATEGORY_NOT_FOUND",
        });
      }

      // Verify new parent exists (if specified)
      if (input.newParentId) {
        const newParent = await prisma.category.findFirst({
          where: { id: input.newParentId, userId },
        });
        if (!newParent) {
          return reply.status(404).send({
            error: "New parent category not found",
            code: "PARENT_NOT_FOUND",
          });
        }
      }

      // Check for cycles
      if (await wouldCreateCycle(input.categoryId, input.newParentId, userId)) {
        return reply.status(400).send({
          error: "Move would create a cycle in the category hierarchy",
          code: "CYCLE_DETECTED",
        });
      }

      // Check for conflicts
      const conflictCheck = await detectConflicts(
        userId,
        [input.categoryId],
        input.clientTimestamp,
      );

      if (conflictCheck.hasConflict) {
        return reply.status(409).send({
          error: "Concurrent modification detected",
          code: "CONFLICT_DETECTED",
          conflictingEventId: conflictCheck.conflictingEventId,
          conflictType: conflictCheck.conflictType,
        });
      }

      // Run plugin pre-validation
      const validation = await runPreValidation("move", input, userId);
      if (!validation.valid) {
        return reply.status(400).send({
          error: "Validation failed",
          code: "VALIDATION_FAILED",
          details: validation.errors,
        });
      }

      // Create before snapshot
      const beforeSnapshotId = await createSnapshot(
        userId,
        null,
        true,
        undefined,
        [input.categoryId],
      );

      // Start recording the refactor event
      const affectedCardIds = category.cardParticipations.map((p) => p.cardId);
      const eventId = await recordRefactorEvent(
        userId,
        "move",
        input.categoryId,
        [input.categoryId],
        affectedCardIds,
        input as unknown as Record<string, unknown>,
        input.reason,
        input.clientId,
        input.clientTimestamp,
        beforeSnapshotId,
      );

      try {
        const result = await prisma.$transaction(async (tx) => {
          const previousParentId = category.parentId;

          // Calculate new path
          const newPath = await calculatePath(input.newParentId, userId);
          const newDepth = newPath.length;

          // Update the category
          await tx.category.update({
            where: { id: input.categoryId },
            data: {
              parentId: input.newParentId,
              path: newPath,
              depth: newDepth,
              position: input.position ?? 0,
            },
          });

          // Update all descendants
          const descendantUpdateCount = await updateDescendantPaths(
            input.categoryId,
            [...newPath, input.categoryId],
            userId,
          );

          // Update relations that might be affected
          // (e.g., strong_containment relations might need review)
          const relationsUpdated = await tx.categoryRelation.count({
            where: {
              OR: [
                { sourceCategoryId: input.categoryId },
                { targetCategoryId: input.categoryId },
              ],
            },
          });

          // Record evolution event
          await tx.categoryEvolutionEvent.create({
            data: {
              categoryId: input.categoryId,
              userId,
              eventType: "reparented",
              previousState: {
                parentId: previousParentId,
                path: category.path,
                depth: category.depth,
              },
              newState: {
                parentId: input.newParentId,
                path: newPath,
                depth: newDepth,
              },
              relatedCategoryIds: [previousParentId, input.newParentId].filter(
                Boolean,
              ) as string[],
              reason: input.reason,
            },
          });

          return {
            previousParentId,
            newPath,
            newDepth,
            descendantUpdateCount,
            relationsUpdated,
          };
        });

        // Create after snapshot
        const afterSnapshotId = await createSnapshot(
          userId,
          null,
          true,
          eventId,
          [input.categoryId],
        );

        // Build final result
        const moveResult: MoveResult = {
          operationId: eventId,
          movedCategory: {
            id: input.categoryId,
            name: category.name,
            newPath: result.newPath,
            newDepth: result.newDepth,
          },
          previousParentId: result.previousParentId,
          updatedDescendantCount: result.descendantUpdateCount,
          relationsUpdated: result.relationsUpdated,
          evolutionEventId: eventId,
          beforeSnapshotId,
          afterSnapshotId,
        };

        // Complete the refactor event
        await completeRefactorEvent(
          eventId,
          moveResult as unknown as Record<string, unknown>,
          afterSnapshotId,
        );

        // Run post-move hooks
        await runPostHooks("move", moveResult, userId);

        return reply.send({
          success: true,
          data: moveResult,
        });
      } catch (error) {
        await failRefactorEvent(
          eventId,
          error instanceof Error ? error.message : "Unknown error",
        );
        throw error;
      }
    },
  );

  /**
   * Preview a move operation
   * POST /refactor/move/preview
   */
  app.post(
    "/move/preview",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Refactoring"],
        summary: "Preview a move operation without committing",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const input = moveCategoryInputSchema.parse(request.body);
      const userId = request.user!.id;

      // Verify category exists
      const category = await prisma.category.findFirst({
        where: { id: input.categoryId, userId },
        include: {
          children: { select: { id: true, name: true } },
          cardParticipations: { select: { cardId: true } },
        },
      });

      if (!category) {
        return reply.status(404).send({
          error: "Category not found",
          code: "CATEGORY_NOT_FOUND",
        });
      }

      // Get new parent info
      let newParentInfo = null;
      if (input.newParentId) {
        const newParent = await prisma.category.findFirst({
          where: { id: input.newParentId, userId },
          select: { id: true, name: true, path: true, depth: true },
        });
        newParentInfo = newParent;
      }

      // Calculate new path
      const newPath = newParentInfo
        ? [...newParentInfo.path, newParentInfo.id]
        : [];

      // Count descendants
      const descendantCount = await prisma.category.count({
        where: {
          userId,
          path: { has: input.categoryId },
        },
      });

      // Check for cycle
      const wouldCycle = await wouldCreateCycle(
        input.categoryId,
        input.newParentId,
        userId,
      );

      const preview = {
        category: {
          id: category.id,
          name: category.name,
          currentPath: category.path,
          currentDepth: category.depth,
        },
        proposedChanges: {
          newParent: newParentInfo
            ? { id: newParentInfo.id, name: newParentInfo.name }
            : null,
          newPath,
          newDepth: newPath.length,
          descendantsAffected: descendantCount,
          cardsAffected: category.cardParticipations.length,
        },
        breadcrumbChanges: {
          before: [...category.path, category.name],
          after: newParentInfo ? [...newPath, category.name] : [category.name],
        },
        warnings: [] as string[],
        errors: [] as string[],
      };

      if (wouldCycle) {
        preview.errors.push("This move would create a cycle in the hierarchy");
      }

      if (descendantCount > 10) {
        preview.warnings.push(
          `This move will affect ${descendantCount} descendant categories`,
        );
      }

      return reply.send({
        success: true,
        data: preview,
      });
    },
  );

  // =========================================================================
  // STRUCTURAL HISTORY & TIMELINE
  // =========================================================================

  /**
   * Get structural refactor timeline
   * GET /refactor/timeline
   */
  app.get(
    "/timeline",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Refactoring"],
        summary: "Get structural refactor timeline",
        description: `
          Returns an append-only log of all structural changes for
          reconstructing cognitive evolution over time.
        `,
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = timelineQuerySchema.parse(request.query);
      const userId = request.user!.id;

      const where: Prisma.StructuralRefactorEventWhereInput = {
        userId,
      };

      if (query.categoryId) {
        where.OR = [
          { primaryCategoryId: query.categoryId },
          { affectedCategoryIds: { has: query.categoryId } },
        ];
      }

      if (query.operationTypes && query.operationTypes.length > 0) {
        where.operationType = { in: query.operationTypes };
      }

      if (!query.includeRolledBack) {
        where.wasRolledBack = false;
      }

      if (query.fromDate) {
        where.createdAt = { gte: query.fromDate };
      }

      if (query.toDate) {
        where.createdAt = {
          ...(where.createdAt && typeof where.createdAt === "object"
            ? where.createdAt
            : {}),
          lte: query.toDate,
        };
      }

      const [events, total] = await Promise.all([
        prisma.structuralRefactorEvent.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: query.limit,
          skip: query.offset,
          select: {
            id: true,
            operationType: true,
            status: true,
            primaryCategoryId: true,
            affectedCategoryIds: true,
            affectedCardIds: true,
            userReason: true,
            aiSummary: true,
            isRollbackable: true,
            wasRolledBack: true,
            beforeSnapshotId: true,
            afterSnapshotId: true,
            createdAt: true,
          },
        }),
        prisma.structuralRefactorEvent.count({ where }),
      ]);

      // Enrich with category names
      const categoryIds = [
        ...new Set(
          events.flatMap((e) => [
            e.primaryCategoryId,
            ...e.affectedCategoryIds,
          ]),
        ),
      ];
      const categories = await prisma.category.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true },
      });
      const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

      const enrichedEvents = events.map((event) => ({
        ...event,
        primaryCategoryName:
          categoryMap.get(event.primaryCategoryId) || "Unknown",
        affectedCategoryNames: event.affectedCategoryIds.map(
          (id) => categoryMap.get(id) || "Unknown",
        ),
        summary: generateEventSummary(event, categoryMap),
        icon: getEventIcon(event.operationType),
        color: getEventColor(event.operationType),
      }));

      return reply.send({
        data: enrichedEvents,
        pagination: {
          total,
          limit: query.limit,
          offset: query.offset,
          hasMore: query.offset + events.length < total,
        },
      });
    },
  );

  /**
   * Get a specific refactor event detail
   * GET /refactor/events/:eventId
   */
  app.get<EventIdParams>(
    "/events/:eventId",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Refactoring"],
        summary: "Get detailed information about a refactor event",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { eventId } = request.params;
      const userId = request.user!.id;

      const event = await prisma.structuralRefactorEvent.findFirst({
        where: { id: eventId, userId },
        include: {
          beforeSnapshot: true,
          afterSnapshot: true,
        },
      });

      if (!event) {
        return reply.status(404).send({
          error: "Event not found",
          code: "EVENT_NOT_FOUND",
        });
      }

      return reply.send({
        success: true,
        data: event,
      });
    },
  );

  // =========================================================================
  // SNAPSHOTS
  // =========================================================================

  /**
   * Create a named snapshot
   * POST /refactor/snapshots
   */
  app.post(
    "/snapshots",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Refactoring"],
        summary: "Create a named structural snapshot",
        description: `
          Creates a point-in-time snapshot of the category structure
          that can be used for comparison or restoration.
        `,
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const input = createSnapshotInputSchema.parse(request.body);
      const userId = request.user!.id;

      const snapshotId = await createSnapshot(
        userId,
        input.name,
        false, // Not automatic
        undefined,
        input.categoryIds,
      );

      const snapshot = await prisma.structuralSnapshot.findUnique({
        where: { id: snapshotId },
      });

      return reply.send({
        success: true,
        data: snapshot,
      });
    },
  );

  /**
   * List snapshots
   * GET /refactor/snapshots
   */
  app.get(
    "/snapshots",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Refactoring"],
        summary: "List structural snapshots",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      const snapshots = await prisma.structuralSnapshot.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          isAutomatic: true,
          refactorEventId: true,
          totalCategories: true,
          totalCards: true,
          totalRelations: true,
          maxDepth: true,
          createdAt: true,
        },
      });

      return reply.send({
        success: true,
        data: snapshots,
      });
    },
  );

  /**
   * Get snapshot detail
   * GET /refactor/snapshots/:snapshotId
   */
  app.get<SnapshotIdParams>(
    "/snapshots/:snapshotId",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Refactoring"],
        summary: "Get detailed snapshot data",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { snapshotId } = request.params;
      const userId = request.user!.id;

      const snapshot = await prisma.structuralSnapshot.findFirst({
        where: { id: snapshotId, userId },
      });

      if (!snapshot) {
        return reply.status(404).send({
          error: "Snapshot not found",
          code: "SNAPSHOT_NOT_FOUND",
        });
      }

      return reply.send({
        success: true,
        data: snapshot,
      });
    },
  );

  /**
   * Compare two snapshots
   * GET /refactor/snapshots/diff
   */
  app.get<SnapshotDiffQuery>(
    "/snapshots/diff",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Refactoring"],
        summary: "Compare two snapshots and get diff",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { fromSnapshotId, toSnapshotId } = request.query;
      const userId = request.user!.id;

      const [fromSnapshot, toSnapshot] = await Promise.all([
        prisma.structuralSnapshot.findFirst({
          where: { id: fromSnapshotId, userId },
        }),
        prisma.structuralSnapshot.findFirst({
          where: { id: toSnapshotId, userId },
        }),
      ]);

      if (!fromSnapshot || !toSnapshot) {
        return reply.status(404).send({
          error: "One or both snapshots not found",
          code: "SNAPSHOT_NOT_FOUND",
        });
      }

      const diff = computeSnapshotDiff(fromSnapshot, toSnapshot);

      return reply.send({
        success: true,
        data: diff,
      });
    },
  );

  // =========================================================================
  // ROLLBACK
  // =========================================================================

  /**
   * Rollback a refactor operation
   * POST /refactor/rollback/:eventId
   */
  app.post<RollbackBody>(
    "/rollback/:eventId",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Refactoring"],
        summary: "Rollback a refactor operation",
        description: `
          Restores the category structure to its state before the specified
          refactor event. Creates a new "restore" event in the timeline.
        `,
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { eventId } = request.params;
      const reason = request.body?.reason;
      const userId = request.user!.id;

      // Get the event to rollback
      const event = await prisma.structuralRefactorEvent.findFirst({
        where: { id: eventId, userId },
        include: { beforeSnapshot: true },
      });

      if (!event) {
        return reply.status(404).send({
          error: "Event not found",
          code: "EVENT_NOT_FOUND",
        });
      }

      if (!event.isRollbackable) {
        return reply.status(400).send({
          error: "This event cannot be rolled back",
          code: "NOT_ROLLBACKABLE",
        });
      }

      if (event.wasRolledBack) {
        return reply.status(400).send({
          error: "This event has already been rolled back",
          code: "ALREADY_ROLLED_BACK",
        });
      }

      if (!event.beforeSnapshot) {
        return reply.status(400).send({
          error: "No before snapshot available for rollback",
          code: "NO_SNAPSHOT",
        });
      }

      // Create a rollback event
      const rollbackEventId = await recordRefactorEvent(
        userId,
        "restore",
        event.primaryCategoryId,
        event.affectedCategoryIds,
        event.affectedCardIds,
        { originalEventId: eventId, reason },
        reason,
      );

      try {
        // Restore from snapshot
        await restoreFromSnapshot(userId, event.beforeSnapshot);

        // Mark original event as rolled back
        await prisma.structuralRefactorEvent.update({
          where: { id: eventId },
          data: {
            wasRolledBack: true,
            rollbackEventId,
          },
        });

        // Complete rollback event
        const afterSnapshotId = await createSnapshot(
          userId,
          null,
          true,
          rollbackEventId,
        );

        await completeRefactorEvent(
          rollbackEventId,
          { restoredFromEventId: eventId },
          afterSnapshotId,
        );

        return reply.send({
          success: true,
          data: {
            rollbackEventId,
            restoredFromEventId: eventId,
            message: "Successfully rolled back to previous state",
          },
        });
      } catch (error) {
        await failRefactorEvent(
          rollbackEventId,
          error instanceof Error ? error.message : "Unknown error",
        );
        throw error;
      }
    },
  );

  // =========================================================================
  // CONFLICT RESOLUTION
  // =========================================================================

  /**
   * Get pending conflicts
   * GET /refactor/conflicts
   */
  app.get(
    "/conflicts",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Refactoring"],
        summary: "Get pending structural conflicts",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      const conflicts = await prisma.structuralRefactorEvent.findMany({
        where: {
          userId,
          status: "conflict",
        },
        orderBy: { createdAt: "desc" },
      });

      return reply.send({
        success: true,
        data: conflicts,
      });
    },
  );

  /**
   * Resolve a conflict
   * POST /refactor/conflicts/:eventId/resolve
   */
  app.post<EventIdParams>(
    "/conflicts/:eventId/resolve",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Refactoring"],
        summary: "Resolve a structural conflict",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { eventId } = request.params;
      const input = resolveConflictInputSchema.parse(request.body);
      const userId = request.user!.id;

      const event = await prisma.structuralRefactorEvent.findFirst({
        where: { id: eventId, userId, status: "conflict" },
      });

      if (!event) {
        return reply.status(404).send({
          error: "Conflict event not found",
          code: "EVENT_NOT_FOUND",
        });
      }

      // Apply resolution based on strategy
      const resolution = {
        strategy: input.strategy,
        actions: input.actions || [],
        resolvedBy: userId,
        resolvedAt: new Date().toISOString(),
      };

      await prisma.structuralRefactorEvent.update({
        where: { id: eventId },
        data: {
          status: "completed",
          conflictResolution: resolution as Prisma.InputJsonValue,
        },
      });

      return reply.send({
        success: true,
        data: {
          eventId,
          resolution,
        },
      });
    },
  );

  // =========================================================================
  // AI SUGGESTIONS (HOOKS)
  // =========================================================================

  /**
   * Get AI split suggestions for a category
   * GET /refactor/suggestions/split/:categoryId
   */
  app.get<CategoryIdParams>(
    "/suggestions/split/:categoryId",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Refactoring"],
        summary: "Get AI suggestions for splitting a category",
        description: "Hook point for AI-assisted split suggestions",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { categoryId } = request.params;
      const userId = request.user!.id;

      // Get existing AI suggestions
      const suggestions = await prisma.aISplitSuggestion.findMany({
        where: {
          userId,
          categoryId,
          status: "pending",
        },
        orderBy: { confidence: "desc" },
      });

      return reply.send({
        success: true,
        data: suggestions,
        message:
          suggestions.length === 0
            ? "No AI suggestions available. This is a hook point for future AI integration."
            : undefined,
      });
    },
  );

  /**
   * Get AI merge suggestions
   * GET /refactor/suggestions/merge
   */
  app.get(
    "/suggestions/merge",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Refactoring"],
        summary: "Get AI suggestions for merging categories",
        description: "Hook point for AI-assisted merge suggestions",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      const suggestions = await prisma.aIMergeSuggestion.findMany({
        where: {
          userId,
          status: "pending",
        },
        orderBy: { confidence: "desc" },
      });

      return reply.send({
        success: true,
        data: suggestions,
        message:
          suggestions.length === 0
            ? "No AI suggestions available. This is a hook point for future AI integration."
            : undefined,
      });
    },
  );

  /**
   * Respond to an AI suggestion
   * POST /refactor/suggestions/:suggestionId/respond
   */
  app.post<SuggestionResponseBody>(
    "/suggestions/:suggestionId/respond",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Refactoring"],
        summary: "Accept, reject, or defer an AI suggestion",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { suggestionId } = request.params;
      const { action } = request.body;
      const userId = request.user!.id;

      // Try split suggestion first
      const suggestion = await prisma.aISplitSuggestion.findFirst({
        where: { id: suggestionId, userId },
      });

      if (suggestion) {
        await prisma.aISplitSuggestion.update({
          where: { id: suggestionId },
          data: {
            status:
              action === "accept"
                ? "accepted"
                : action === "reject"
                  ? "rejected"
                  : "deferred",
            respondedAt: new Date(),
          },
        });
      } else {
        // Try merge suggestion
        const mergeSuggestion = await prisma.aIMergeSuggestion.findFirst({
          where: { id: suggestionId, userId },
        });

        if (mergeSuggestion) {
          await prisma.aIMergeSuggestion.update({
            where: { id: suggestionId },
            data: {
              status:
                action === "accept"
                  ? "accepted"
                  : action === "reject"
                    ? "rejected"
                    : "deferred",
              respondedAt: new Date(),
            },
          });
        } else {
          return reply.status(404).send({
            error: "Suggestion not found",
            code: "SUGGESTION_NOT_FOUND",
          });
        }
      }

      return reply.send({
        success: true,
        data: { suggestionId, action },
      });
    },
  );
}

// =============================================================================
// HELPER FUNCTIONS FOR EVENT DISPLAY
// =============================================================================

function generateEventSummary(
  event: {
    operationType: string;
    primaryCategoryId: string;
    affectedCategoryIds: string[];
    affectedCardIds: string[];
  },
  categoryMap: Map<string, string>,
): string {
  const primaryName = categoryMap.get(event.primaryCategoryId) || "Unknown";
  const cardCount = event.affectedCardIds.length;

  switch (event.operationType) {
    case "split":
      return `Split "${primaryName}" into ${event.affectedCategoryIds.length - 1} categories (${cardCount} cards reassigned)`;
    case "merge":
      return `Merged ${event.affectedCategoryIds.length} categories into "${primaryName}" (${cardCount} cards consolidated)`;
    case "move":
      return `Moved "${primaryName}" to new location (${cardCount} cards affected)`;
    case "rename":
      return `Renamed category to "${primaryName}"`;
    case "archive":
      return `Archived "${primaryName}" (${cardCount} cards affected)`;
    case "restore":
      return `Restored structure from previous state`;
    default:
      return `${event.operationType} operation on "${primaryName}"`;
  }
}

function getEventIcon(operationType: string): string {
  switch (operationType) {
    case "split":
      return "✂️";
    case "merge":
      return "🔗";
    case "move":
      return "📦";
    case "rename":
      return "✏️";
    case "archive":
      return "📁";
    case "restore":
      return "⏪";
    default:
      return "📋";
  }
}

function getEventColor(operationType: string): string {
  switch (operationType) {
    case "split":
      return "#4CAF50"; // Green
    case "merge":
      return "#2196F3"; // Blue
    case "move":
      return "#FF9800"; // Orange
    case "rename":
      return "#9C27B0"; // Purple
    case "archive":
      return "#607D8B"; // Gray
    case "restore":
      return "#F44336"; // Red
    default:
      return "#757575"; // Default gray
  }
}

// =============================================================================
// SNAPSHOT DIFF COMPUTATION
// =============================================================================

interface SnapshotData {
  categoryTree: unknown;
  relations: unknown;
  participations: unknown;
}

function computeSnapshotDiff(
  fromSnapshot: SnapshotData,
  toSnapshot: SnapshotData,
) {
  const fromCategories = fromSnapshot.categoryTree as Array<{
    id: string;
    name: string;
    [key: string]: unknown;
  }>;
  const toCategories = toSnapshot.categoryTree as Array<{
    id: string;
    name: string;
    [key: string]: unknown;
  }>;

  const fromIds = new Set(fromCategories.map((c) => c.id));
  const toIds = new Set(toCategories.map((c) => c.id));

  const addedCategories = toCategories.filter((c) => !fromIds.has(c.id));
  const removedCategories = fromCategories.filter((c) => !toIds.has(c.id));

  const modifiedCategories: {
    categoryId: string;
    changes: { field: string; oldValue: unknown; newValue: unknown }[];
  }[] = [];

  for (const toCategory of toCategories) {
    if (fromIds.has(toCategory.id)) {
      const fromCategory = fromCategories.find((c) => c.id === toCategory.id)!;
      const changes: { field: string; oldValue: unknown; newValue: unknown }[] =
        [];

      for (const key of Object.keys(toCategory)) {
        if (
          JSON.stringify(fromCategory[key]) !== JSON.stringify(toCategory[key])
        ) {
          changes.push({
            field: key,
            oldValue: fromCategory[key],
            newValue: toCategory[key],
          });
        }
      }

      if (changes.length > 0) {
        modifiedCategories.push({
          categoryId: toCategory.id,
          changes,
        });
      }
    }
  }

  // Relations diff
  const fromRelations = fromSnapshot.relations as Array<{ id: string }>;
  const toRelations = toSnapshot.relations as Array<{ id: string }>;

  const fromRelIds = new Set(fromRelations.map((r) => r.id));
  const toRelIds = new Set(toRelations.map((r) => r.id));

  const addedRelations = toRelations.filter((r) => !fromRelIds.has(r.id));
  const removedRelations = fromRelations.filter((r) => !toRelIds.has(r.id));

  // Participation diff
  const fromParticipations = fromSnapshot.participations as Array<{
    cardId: string;
    categoryId: string;
  }>;
  const toParticipations = toSnapshot.participations as Array<{
    cardId: string;
    categoryId: string;
  }>;

  const fromPartMap = new Map<string, Set<string>>();
  for (const p of fromParticipations) {
    if (!fromPartMap.has(p.cardId)) fromPartMap.set(p.cardId, new Set());
    fromPartMap.get(p.cardId)!.add(p.categoryId);
  }

  const toPartMap = new Map<string, Set<string>>();
  for (const p of toParticipations) {
    if (!toPartMap.has(p.cardId)) toPartMap.set(p.cardId, new Set());
    toPartMap.get(p.cardId)!.add(p.categoryId);
  }

  const cardMovements: {
    cardId: string;
    fromCategoryIds: string[];
    toCategoryIds: string[];
  }[] = [];

  const allCardIds = new Set([...fromPartMap.keys(), ...toPartMap.keys()]);
  for (const cardId of allCardIds) {
    const fromCats = fromPartMap.get(cardId) || new Set();
    const toCats = toPartMap.get(cardId) || new Set();

    const added = [...toCats].filter((c) => !fromCats.has(c));
    const removed = [...fromCats].filter((c) => !toCats.has(c));

    if (added.length > 0 || removed.length > 0) {
      cardMovements.push({
        cardId,
        fromCategoryIds: removed,
        toCategoryIds: added,
      });
    }
  }

  return {
    fromSnapshotId: (fromSnapshot as { id?: string }).id,
    toSnapshotId: (toSnapshot as { id?: string }).id,
    addedCategories,
    removedCategories,
    modifiedCategories,
    addedRelations,
    removedRelations,
    cardMovements,
    summary: {
      categoriesAdded: addedCategories.length,
      categoriesRemoved: removedCategories.length,
      categoriesModified: modifiedCategories.length,
      relationsAdded: addedRelations.length,
      relationsRemoved: removedRelations.length,
      cardsMoved: cardMovements.length,
    },
  };
}

// =============================================================================
// SNAPSHOT RESTORATION
// =============================================================================

async function restoreFromSnapshot(userId: string, snapshot: SnapshotData) {
  const categoryTree = snapshot.categoryTree as Array<{
    id: string;
    name: string;
    description?: string;
    framingQuestion?: string;
    semanticIntent?: string;
    iconEmoji?: string;
    color?: string;
    parentId?: string;
    depth: number;
    path: string[];
    learningIntent: string;
    depthGoal: string;
    maturityStage: string;
    cardCount: number;
    masteryScore: number;
    position: number;
    isArchived: boolean;
  }>;

  const participations = snapshot.participations as Array<{
    cardId: string;
    categoryId: string;
    semanticRole: string;
    isPrimary: boolean;
    contextMastery: number;
  }>;

  await prisma.$transaction(async (tx) => {
    // Restore category states
    for (const cat of categoryTree) {
      await tx.category.upsert({
        where: { id: cat.id },
        create: {
          id: cat.id,
          userId,
          name: cat.name,
          description: cat.description,
          framingQuestion: cat.framingQuestion,
          semanticIntent: cat.semanticIntent,
          iconEmoji: cat.iconEmoji,
          color: cat.color,
          parentId: cat.parentId,
          depth: cat.depth,
          path: cat.path,
          learningIntent: cat.learningIntent,
          depthGoal: cat.depthGoal,
          maturityStage: cat.maturityStage,
          cardCount: cat.cardCount,
          masteryScore: cat.masteryScore,
          position: cat.position,
          isArchived: cat.isArchived,
        },
        update: {
          name: cat.name,
          description: cat.description,
          framingQuestion: cat.framingQuestion,
          semanticIntent: cat.semanticIntent,
          iconEmoji: cat.iconEmoji,
          color: cat.color,
          parentId: cat.parentId,
          depth: cat.depth,
          path: cat.path,
          learningIntent: cat.learningIntent,
          depthGoal: cat.depthGoal,
          maturityStage: cat.maturityStage,
          cardCount: cat.cardCount,
          masteryScore: cat.masteryScore,
          position: cat.position,
          isArchived: cat.isArchived,
        },
      });
    }

    // Restore participations
    // First, get current participations to preserve learning state
    const currentParticipations = await tx.cardCategoryParticipation.findMany({
      where: {
        category: { userId },
      },
    });
    const currentPartMap = new Map(
      currentParticipations.map((p) => [`${p.cardId}-${p.categoryId}`, p]),
    );

    for (const part of participations) {
      const key = `${part.cardId}-${part.categoryId}`;
      const existing = currentPartMap.get(key);

      if (existing) {
        // Update but preserve learning state
        await tx.cardCategoryParticipation.update({
          where: { id: existing.id },
          data: {
            semanticRole: part.semanticRole,
            isPrimary: part.isPrimary,
            // Keep existing learning state
          },
        });
      } else {
        // Create new participation
        await tx.cardCategoryParticipation.create({
          data: {
            cardId: part.cardId,
            categoryId: part.categoryId,
            semanticRole: part.semanticRole,
            isPrimary: part.isPrimary,
            contextMastery: part.contextMastery,
          },
        });
      }
    }
  });
}

export default refactorRoutes;
