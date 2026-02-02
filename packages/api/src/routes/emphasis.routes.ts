/**
 * Differential Emphasis Engine API Routes
 *
 * PARADIGM: Emphasis rules define how card content is visually and cognitively
 * emphasized or de-emphasized within a specific category lens. This creates
 * context-dependent "readings" of the same underlying card.
 *
 * Key features:
 * - Rule-based targeting (by card ID, semantic role, tags, content patterns)
 * - Visual styling (colors, sizes, opacity)
 * - Micro-prompt injection
 * - Conditional activation based on mastery, review count, learning mode
 * - Priority-based rule stacking
 */

import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../config/database";
import { authenticate } from "../middleware/auth";

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

const emphasisRuleTypeSchema = z.enum([
  "highlight",
  "de_emphasize",
  "collapse",
  "inject_prompt",
  "reorder",
  "annotate",
]);

const semanticRoleSchema = z.enum([
  "foundational",
  "application",
  "example",
  "edge_case",
  "counterexample",
  "concept",
]);

const promptPositionSchema = z.enum(["before", "after", "replace", "overlay"]);

const contentSelectorSchema = z.object({
  type: z.enum(["regex", "field", "tag", "semantic_role"]),
  pattern: z.string().optional(),
  fieldPath: z.string().optional(),
  tags: z.array(z.string()).optional(),
  roles: z.array(semanticRoleSchema).optional(),
});

const emphasisStyleSchema = z.object({
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
  fontSize: z.enum(["small", "normal", "large", "xlarge"]).optional(),
  fontWeight: z.enum(["normal", "bold", "light"]).optional(),
  border: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
});

const createEmphasisRuleSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  ruleType: emphasisRuleTypeSchema,
  targetCardIds: z.array(z.string()).optional().default([]),
  targetSemanticRoles: z.array(semanticRoleSchema).optional().default([]),
  targetTags: z.array(z.string()).optional().default([]),
  contentSelector: contentSelectorSchema.optional(),
  emphasisLevel: z.number().int().min(-2).max(2).optional().default(0),
  style: emphasisStyleSchema.optional(),
  injectedPrompt: z.string().max(500).optional(),
  promptPosition: promptPositionSchema.optional().default("after"),
  minReviewCount: z.number().int().min(0).optional(),
  minMastery: z.number().min(0).max(1).optional(),
  maxMastery: z.number().min(0).max(1).optional(),
  activeLearningModes: z.array(z.string()).optional().default([]),
  priority: z.number().int().min(0).max(100).optional().default(50),
});

const updateEmphasisRuleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  ruleType: emphasisRuleTypeSchema.optional(),
  targetCardIds: z.array(z.string()).optional(),
  targetSemanticRoles: z.array(semanticRoleSchema).optional(),
  targetTags: z.array(z.string()).optional(),
  contentSelector: contentSelectorSchema.optional().nullable(),
  emphasisLevel: z.number().int().min(-2).max(2).optional(),
  style: emphasisStyleSchema.optional().nullable(),
  injectedPrompt: z.string().max(500).optional().nullable(),
  promptPosition: promptPositionSchema.optional(),
  minReviewCount: z.number().int().min(0).optional().nullable(),
  minMastery: z.number().min(0).max(1).optional().nullable(),
  maxMastery: z.number().min(0).max(1).optional().nullable(),
  activeLearningModes: z.array(z.string()).optional(),
  isEnabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(100).optional(),
});

const emphasisQuerySchema = z.object({
  categoryId: z.string().optional(),
  ruleType: emphasisRuleTypeSchema.optional(),
  isEnabled: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const applyRulesSchema = z.object({
  cardId: z.string().min(1),
  categoryId: z.string().min(1),
  learningMode: z.string().optional(),
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Evaluate if an emphasis rule should apply to a card given current context
 */
async function shouldRuleApply(
  rule: {
    targetCardIds: string[];
    targetSemanticRoles: string[];
    targetTags: string[];
    contentSelector: unknown;
    minReviewCount: number | null;
    minMastery: number | null;
    maxMastery: number | null;
    activeLearningModes: string[];
  },
  cardId: string,
  categoryId: string,
  learningMode?: string,
): Promise<boolean> {
  // Check card ID targeting
  if (rule.targetCardIds.length > 0 && !rule.targetCardIds.includes(cardId)) {
    return false;
  }

  // Check learning mode
  if (
    rule.activeLearningModes.length > 0 &&
    learningMode &&
    !rule.activeLearningModes.includes(learningMode)
  ) {
    return false;
  }

  // Get participation for semantic role and mastery checks
  const participation = await prisma.cardCategoryParticipation.findFirst({
    where: { cardId, categoryId },
    select: {
      semanticRole: true,
      contextMastery: true,
      reviewCountInContext: true,
      card: { select: { tags: true } },
    },
  });

  if (!participation) return false;

  // Check semantic role targeting
  if (
    rule.targetSemanticRoles.length > 0 &&
    !rule.targetSemanticRoles.includes(participation.semanticRole)
  ) {
    return false;
  }

  // Check tag targeting
  if (
    rule.targetTags.length > 0 &&
    !rule.targetTags.some((tag) => participation.card.tags.includes(tag))
  ) {
    return false;
  }

  // Check review count threshold
  if (
    rule.minReviewCount !== null &&
    participation.reviewCountInContext < rule.minReviewCount
  ) {
    return false;
  }

  // Check mastery range
  if (
    rule.minMastery !== null &&
    participation.contextMastery < rule.minMastery
  ) {
    return false;
  }
  if (
    rule.maxMastery !== null &&
    participation.contextMastery > rule.maxMastery
  ) {
    return false;
  }

  return true;
}

/**
 * Apply content selector to check if rule matches card content
 */
function matchesContentSelector(
  content: unknown,
  selector: { type: string; pattern?: string; fieldPath?: string } | null,
): boolean {
  if (!selector) return true;

  const contentStr = JSON.stringify(content);

  switch (selector.type) {
    case "regex":
      if (selector.pattern) {
        try {
          const regex = new RegExp(selector.pattern, "gi");
          return regex.test(contentStr);
        } catch {
          return false;
        }
      }
      return false;

    case "field":
      if (selector.fieldPath) {
        // Simple field path check (e.g., "front.text")
        const parts = selector.fieldPath.split(".");
        let current: unknown = content;
        for (const part of parts) {
          if (current && typeof current === "object" && part in current) {
            current = (current as Record<string, unknown>)[part];
          } else {
            return false;
          }
        }
        return current !== undefined;
      }
      return false;

    default:
      return true;
  }
}

// =============================================================================
// ROUTES
// =============================================================================

const emphasisRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply authentication to all routes
  fastify.addHook("onRequest", authenticate);

  // ===========================================================================
  // GET /emphasis - List emphasis rules
  // ===========================================================================
  fastify.get<{
    Querystring: z.infer<typeof emphasisQuerySchema>;
  }>(
    "/",
    {
      schema: {
        tags: ["Emphasis"],
        summary: "List emphasis rules",
        description: "Retrieve emphasis rules with optional filters.",
        querystring: emphasisQuerySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { categoryId, ruleType, isEnabled, limit, offset } =
        emphasisQuerySchema.parse(request.query);

      const where: Record<string, unknown> = { userId };

      if (categoryId) where.categoryId = categoryId;
      if (ruleType) where.ruleType = ruleType;
      if (isEnabled !== undefined) where.isEnabled = isEnabled;

      const [rules, total] = await Promise.all([
        prisma.emphasisRule.findMany({
          where,
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
          orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
          skip: offset,
          take: limit,
        }),
        prisma.emphasisRule.count({ where }),
      ]);

      return reply.send({
        rules,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + rules.length < total,
        },
      });
    },
  );

  // ===========================================================================
  // GET /emphasis/:id - Get single emphasis rule
  // ===========================================================================
  fastify.get<{
    Params: { id: string };
  }>(
    "/:id",
    {
      schema: {
        tags: ["Emphasis"],
        summary: "Get emphasis rule by ID",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;

      const rule = await prisma.emphasisRule.findFirst({
        where: { id, userId },
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

      if (!rule) {
        return reply.status(404).send({ error: "Emphasis rule not found" });
      }

      return reply.send(rule);
    },
  );

  // ===========================================================================
  // POST /emphasis - Create emphasis rule
  // ===========================================================================
  fastify.post<{
    Body: z.infer<typeof createEmphasisRuleSchema>;
  }>(
    "/",
    {
      schema: {
        tags: ["Emphasis"],
        summary: "Create emphasis rule",
        description: "Create a new emphasis rule for a category lens.",
        body: createEmphasisRuleSchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const data = createEmphasisRuleSchema.parse(request.body);

      // Verify category exists and belongs to user
      const category = await prisma.category.findFirst({
        where: { id: data.categoryId, userId },
        select: { id: true },
      });

      if (!category) {
        return reply.status(404).send({ error: "Category not found" });
      }

      // Verify target cards exist if specified
      if (data.targetCardIds.length > 0) {
        const cardCount = await prisma.card.count({
          where: { id: { in: data.targetCardIds }, userId },
        });
        if (cardCount !== data.targetCardIds.length) {
          return reply
            .status(400)
            .send({ error: "One or more target cards not found" });
        }
      }

      const rule = await prisma.emphasisRule.create({
        data: {
          userId,
          categoryId: data.categoryId,
          name: data.name,
          description: data.description,
          ruleType: data.ruleType,
          targetCardIds: data.targetCardIds,
          targetSemanticRoles: data.targetSemanticRoles,
          targetTags: data.targetTags,
          contentSelector: data.contentSelector,
          emphasisLevel: data.emphasisLevel,
          style: data.style,
          injectedPrompt: data.injectedPrompt,
          promptPosition: data.promptPosition,
          minReviewCount: data.minReviewCount,
          minMastery: data.minMastery,
          maxMastery: data.maxMastery,
          activeLearningModes: data.activeLearningModes,
          priority: data.priority,
          isEnabled: true,
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

      return reply.status(201).send(rule);
    },
  );

  // ===========================================================================
  // PATCH /emphasis/:id - Update emphasis rule
  // ===========================================================================
  fastify.patch<{
    Params: { id: string };
    Body: z.infer<typeof updateEmphasisRuleSchema>;
  }>(
    "/:id",
    {
      schema: {
        tags: ["Emphasis"],
        summary: "Update emphasis rule",
        params: z.object({ id: z.string() }),
        body: updateEmphasisRuleSchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;
      const data = updateEmphasisRuleSchema.parse(request.body);

      const existing = await prisma.emphasisRule.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        return reply.status(404).send({ error: "Emphasis rule not found" });
      }

      // Verify target cards if updating
      if (data.targetCardIds && data.targetCardIds.length > 0) {
        const cardCount = await prisma.card.count({
          where: { id: { in: data.targetCardIds }, userId },
        });
        if (cardCount !== data.targetCardIds.length) {
          return reply
            .status(400)
            .send({ error: "One or more target cards not found" });
        }
      }

      const updateData: Record<string, unknown> = { ...data };

      // Handle nullable fields
      if (data.description === null) updateData.description = null;
      if (data.contentSelector === null) updateData.contentSelector = null;
      if (data.style === null) updateData.style = null;
      if (data.injectedPrompt === null) updateData.injectedPrompt = null;
      if (data.minReviewCount === null) updateData.minReviewCount = null;
      if (data.minMastery === null) updateData.minMastery = null;
      if (data.maxMastery === null) updateData.maxMastery = null;

      const rule = await prisma.emphasisRule.update({
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

      return reply.send(rule);
    },
  );

  // ===========================================================================
  // DELETE /emphasis/:id - Delete emphasis rule
  // ===========================================================================
  fastify.delete<{
    Params: { id: string };
  }>(
    "/:id",
    {
      schema: {
        tags: ["Emphasis"],
        summary: "Delete emphasis rule",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;

      const rule = await prisma.emphasisRule.findFirst({
        where: { id, userId },
      });

      if (!rule) {
        return reply.status(404).send({ error: "Emphasis rule not found" });
      }

      await prisma.emphasisRule.delete({ where: { id } });

      return reply.status(204).send();
    },
  );

  // ===========================================================================
  // POST /emphasis/:id/enable - Enable rule
  // ===========================================================================
  fastify.post<{
    Params: { id: string };
  }>(
    "/:id/enable",
    {
      schema: {
        tags: ["Emphasis"],
        summary: "Enable emphasis rule",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;

      const rule = await prisma.emphasisRule.findFirst({
        where: { id, userId },
      });

      if (!rule) {
        return reply.status(404).send({ error: "Emphasis rule not found" });
      }

      await prisma.emphasisRule.update({
        where: { id },
        data: { isEnabled: true },
      });

      return reply.send({ message: "Rule enabled" });
    },
  );

  // ===========================================================================
  // POST /emphasis/:id/disable - Disable rule
  // ===========================================================================
  fastify.post<{
    Params: { id: string };
  }>(
    "/:id/disable",
    {
      schema: {
        tags: ["Emphasis"],
        summary: "Disable emphasis rule",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;

      const rule = await prisma.emphasisRule.findFirst({
        where: { id, userId },
      });

      if (!rule) {
        return reply.status(404).send({ error: "Emphasis rule not found" });
      }

      await prisma.emphasisRule.update({
        where: { id },
        data: { isEnabled: false },
      });

      return reply.send({ message: "Rule disabled" });
    },
  );

  // ===========================================================================
  // POST /emphasis/apply - Apply rules to a card in context
  // ===========================================================================
  fastify.post<{
    Body: z.infer<typeof applyRulesSchema>;
  }>(
    "/apply",
    {
      schema: {
        tags: ["Emphasis"],
        summary: "Apply emphasis rules to a card",
        description:
          "Evaluate and return all applicable emphasis rules for a card in a category context.",
        body: applyRulesSchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { cardId, categoryId, learningMode } = applyRulesSchema.parse(
        request.body,
      );

      // Get card with content
      const card = await prisma.card.findFirst({
        where: { id: cardId, userId },
        select: { id: true, content: true },
      });

      if (!card) {
        return reply.status(404).send({ error: "Card not found" });
      }

      // Get all enabled rules for this category, ordered by priority
      const rules = await prisma.emphasisRule.findMany({
        where: { userId, categoryId, isEnabled: true },
        orderBy: { priority: "asc" }, // Lower priority first, higher priority applied last
      });

      // Evaluate each rule
      const applicableRules: typeof rules = [];

      for (const rule of rules) {
        const applies = await shouldRuleApply(
          rule,
          cardId,
          categoryId,
          learningMode,
        );

        if (applies) {
          // Check content selector if present
          const contentMatches = matchesContentSelector(
            card.content,
            rule.contentSelector as {
              type: string;
              pattern?: string;
              fieldPath?: string;
            } | null,
          );

          if (contentMatches) {
            applicableRules.push(rule);
          }
        }
      }

      // Compute final emphasis state by stacking rules
      let finalEmphasisLevel = 0;
      let finalStyle: Record<string, unknown> = {};
      const injectedPrompts: Array<{
        prompt: string;
        position: string;
        ruleName: string;
      }> = [];

      for (const rule of applicableRules) {
        // Stack emphasis levels (clamped to -2 to +2)
        finalEmphasisLevel = Math.max(
          -2,
          Math.min(2, finalEmphasisLevel + rule.emphasisLevel),
        );

        // Merge styles (later rules override earlier)
        if (rule.style) {
          finalStyle = {
            ...finalStyle,
            ...(rule.style as Record<string, unknown>),
          };
        }

        // Collect injected prompts
        if (rule.ruleType === "inject_prompt" && rule.injectedPrompt) {
          injectedPrompts.push({
            prompt: rule.injectedPrompt,
            position: rule.promptPosition,
            ruleName: rule.name,
          });
        }
      }

      return reply.send({
        cardId,
        categoryId,
        applicableRules: applicableRules.map((r) => ({
          id: r.id,
          name: r.name,
          ruleType: r.ruleType,
          emphasisLevel: r.emphasisLevel,
          priority: r.priority,
        })),
        computedEmphasis: {
          level: finalEmphasisLevel,
          style: finalStyle,
          injectedPrompts,
        },
      });
    },
  );

  // ===========================================================================
  // GET /emphasis/category/:categoryId - Get all rules for a category
  // ===========================================================================
  fastify.get<{
    Params: { categoryId: string };
  }>(
    "/category/:categoryId",
    {
      schema: {
        tags: ["Emphasis"],
        summary: "Get emphasis rules for a category",
        params: z.object({ categoryId: z.string() }),
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { categoryId } = request.params;

      const rules = await prisma.emphasisRule.findMany({
        where: { userId, categoryId },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      });

      // Group by rule type
      const byType = rules.reduce(
        (acc, rule) => {
          const key = rule.ruleType;
          if (!acc[key]) acc[key] = [];
          acc[key].push(rule);
          return acc;
        },
        {} as Record<string, typeof rules>,
      );

      return reply.send({
        rules,
        byType,
        total: rules.length,
        enabledCount: rules.filter((r) => r.isEnabled).length,
      });
    },
  );

  // ===========================================================================
  // POST /emphasis/duplicate/:id - Duplicate a rule
  // ===========================================================================
  fastify.post<{
    Params: { id: string };
    Body: { newCategoryId?: string; newName?: string };
  }>(
    "/duplicate/:id",
    {
      schema: {
        tags: ["Emphasis"],
        summary: "Duplicate emphasis rule",
        description:
          "Create a copy of an emphasis rule, optionally for a different category.",
        params: z.object({ id: z.string() }),
        body: z.object({
          newCategoryId: z.string().optional(),
          newName: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;
      const { newCategoryId, newName } = request.body;

      const original = await prisma.emphasisRule.findFirst({
        where: { id, userId },
      });

      if (!original) {
        return reply.status(404).send({ error: "Emphasis rule not found" });
      }

      const targetCategoryId = newCategoryId || original.categoryId;

      // Verify target category if different
      if (newCategoryId && newCategoryId !== original.categoryId) {
        const category = await prisma.category.findFirst({
          where: { id: newCategoryId, userId },
        });
        if (!category) {
          return reply.status(404).send({ error: "Target category not found" });
        }
      }

      const {
        id: _id,
        createdAt: _created,
        updatedAt: _updated,
        ...ruleData
      } = original;

      const newRule = await prisma.emphasisRule.create({
        data: {
          ...ruleData,
          categoryId: targetCategoryId,
          name: newName || `${original.name} (Copy)`,
          contentSelector: ruleData.contentSelector as any,
          style: ruleData.style as any,
        } as any,
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

      return reply.status(201).send(newRule);
    },
  );

  // ===========================================================================
  // POST /emphasis/bulk-reorder - Reorder rules by priority
  // ===========================================================================
  fastify.post<{
    Body: { rules: Array<{ id: string; priority: number }> };
  }>(
    "/bulk-reorder",
    {
      schema: {
        tags: ["Emphasis"],
        summary: "Bulk reorder emphasis rules",
        description: "Update priorities for multiple rules at once.",
        body: z.object({
          rules: z.array(
            z.object({
              id: z.string(),
              priority: z.number().int().min(0).max(100),
            }),
          ),
        }),
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { rules } = request.body;

      // Verify all rules belong to user
      const ruleIds = rules.map((r) => r.id);
      const existingRules = await prisma.emphasisRule.findMany({
        where: { id: { in: ruleIds }, userId },
        select: { id: true },
      });

      if (existingRules.length !== rules.length) {
        return reply.status(400).send({ error: "One or more rules not found" });
      }

      // Update priorities
      await prisma.$transaction(
        rules.map((r) =>
          prisma.emphasisRule.update({
            where: { id: r.id },
            data: { priority: r.priority },
          }),
        ),
      );

      return reply.send({ message: "Priorities updated", count: rules.length });
    },
  );
};

export { emphasisRoutes };
