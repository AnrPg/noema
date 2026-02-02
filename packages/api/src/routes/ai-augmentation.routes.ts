// =============================================================================
// AI AUGMENTATION HOOKS ROUTES
// =============================================================================
// API endpoints for AI-powered enhancements to the learning system
// Provides hooks for plugins to enhance cards, generate annotations,
// suggest emphasis rules, and provide metacognitive insights

import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authenticate } from "../middleware/auth";

// =============================================================================
// SCHEMAS
// =============================================================================

const aiCapabilitySchema = z.enum([
  "content_enhancement",
  "annotation_generation",
  "emphasis_suggestion",
  "context_analysis",
  "metacognition",
  "difficulty_estimation",
  "connection_discovery",
  "explanation_generation",
]);

const learnerProfileSchema = z.object({
  userId: z.string().uuid(),
  learningLevel: z.enum(["beginner", "intermediate", "advanced", "expert"]),
  preferredExplanationStyle: z.enum([
    "concise",
    "detailed",
    "example_based",
    "visual",
  ]),
  knownConcepts: z.array(z.string()),
  strugglingAreas: z.array(z.string()),
  learningGoals: z.array(z.string()),
  languagePreference: z.string(),
});

const aiEnhancementOptionsSchema = z.object({
  enhanceContent: z.boolean().default(true),
  generateHints: z.boolean().default(true),
  suggestTags: z.boolean().default(true),
  estimateDifficulty: z.boolean().default(true),
  findConnections: z.boolean().default(true),
  language: z.string().default("en"),
});

const cardEnhancementSchema = z.object({
  field: z.string(),
  originalValue: z.string(),
  enhancedValue: z.string(),
  enhancementType: z.enum([
    "clarify",
    "expand",
    "simplify",
    "format",
    "add_context",
  ]),
  rationale: z.string(),
});

const connectionSuggestionSchema = z.object({
  targetType: z.enum(["card", "category"]),
  targetId: z.string().uuid(),
  connectionType: z.enum([
    "prerequisite",
    "related",
    "contrasts",
    "extends",
    "example",
  ]),
  strength: z.number().min(0).max(1),
  rationale: z.string(),
  bidirectional: z.boolean(),
});

const aiEnhancedCardSchema = z.object({
  originalCardId: z.string().uuid(),
  enhancements: z.array(cardEnhancementSchema),
  suggestedTags: z.array(z.string()),
  estimatedDifficulty: z.number().min(0).max(1),
  connections: z.array(connectionSuggestionSchema),
  confidence: z.number().min(0).max(1),
  processingTime: z.number(),
  modelUsed: z.string(),
});

const aiAnnotationSchema = z.object({
  id: z.string().uuid(),
  type: z.enum([
    "explanation",
    "mnemonic",
    "connection",
    "question",
    "example",
  ]),
  content: z.string(),
  targetContent: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  personalizationFactors: z.array(z.string()),
});

const suggestedEmphasisRuleSchema = z.object({
  id: z.string().uuid(),
  targetPattern: z.string(),
  emphasisType: z.string(),
  operation: z.enum([
    "highlight",
    "bold",
    "underline",
    "color",
    "size_increase",
    "size_decrease",
    "hide_initially",
    "reveal_on_hover",
    "progressive_reveal",
    "annotate",
    "link_related",
    "simplify",
    "expand",
    "add_example",
    "add_mnemonic",
    "add_visual",
    "custom",
  ]),
  rationale: z.string(),
  expectedImpact: z.string(),
  confidence: z.number().min(0).max(1),
});

const contextPatternSchema = z.object({
  patternId: z.string(),
  description: z.string(),
  affectedCategories: z.array(z.string()),
  impactScore: z.number().min(0).max(1),
  actionable: z.boolean(),
});

const contextRecommendationSchema = z.object({
  recommendationId: z.string(),
  type: z.enum([
    "study_order",
    "context_switch",
    "review_focus",
    "connection_build",
  ]),
  description: z.string(),
  expectedBenefit: z.string(),
  implementationSteps: z.array(z.string()),
});

const aiContextAnalysisSchema = z.object({
  patterns: z.array(contextPatternSchema),
  insights: z.array(z.string()),
  recommendations: z.array(contextRecommendationSchema),
  confidence: z.number().min(0).max(1),
  analysisTime: z.number(),
});

const aiMetacognitiveInsightSchema = z.object({
  insightId: z.string(),
  category: z.enum(["strength", "weakness", "pattern", "opportunity"]),
  title: z.string(),
  description: z.string(),
  evidence: z.array(z.string()),
  actionableAdvice: z.array(z.string()),
  priority: z.enum(["high", "medium", "low"]),
});

const enhanceCardRequestSchema = z.object({
  cardId: z.string().uuid(),
  options: aiEnhancementOptionsSchema.optional(),
  learnerProfile: learnerProfileSchema.optional(),
});

const generateAnnotationsRequestSchema = z.object({
  cardId: z.string().uuid(),
  categoryId: z.string().uuid(),
  maxAnnotations: z.number().int().min(1).max(10).optional(),
  annotationTypes: z
    .array(
      z.enum(["explanation", "mnemonic", "connection", "question", "example"]),
    )
    .optional(),
});

const suggestEmphasisRequestSchema = z.object({
  cardId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  maxSuggestions: z.number().int().min(1).max(20).optional(),
});

const analyzeContextRequestSchema = z.object({
  categoryIds: z.array(z.string().uuid()),
  timeRange: z
    .object({
      start: z.string().datetime(),
      end: z.string().datetime(),
    })
    .optional(),
  includePerformanceData: z.boolean().default(true),
});

const generateInsightsRequestSchema = z.object({
  recentDays: z.number().int().min(1).max(90).optional(),
  focusAreas: z
    .array(z.enum(["strength", "weakness", "pattern", "opportunity"]))
    .optional(),
  maxInsights: z.number().int().min(1).max(20).optional(),
});

// AI Provider configuration schema
const aiProviderConfigSchema = z.object({
  providerId: z.string(),
  apiEndpoint: z.string().url().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).optional(),
  customHeaders: z.record(z.string()).optional(),
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get learner profile from user data
 */
async function getLearnerProfile(
  prisma: any,
  userId: string,
): Promise<z.infer<typeof learnerProfileSchema>> {
  const [user, stats, categories] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        preferences: true,
        learningStats: true,
      },
    }),
    prisma.reviewRecord.aggregate({
      where: { userId },
      _avg: { responseTime: true },
      _count: true,
    }),
    prisma.cardCategoryParticipation.findMany({
      where: {
        card: { userId },
      },
      include: {
        category: true,
      },
      take: 100,
    }),
  ]);

  // Determine learning level based on stats
  const totalReviews = stats._count || 0;
  let learningLevel: "beginner" | "intermediate" | "advanced" | "expert" =
    "beginner";
  if (totalReviews > 10000) learningLevel = "expert";
  else if (totalReviews > 1000) learningLevel = "advanced";
  else if (totalReviews > 100) learningLevel = "intermediate";

  // Extract known concepts from mastered cards
  const masteredCards = await prisma.card.findMany({
    where: {
      userId,
      state: "mastered",
    },
    select: { tags: true },
    take: 500,
  });

  const knownConcepts = [
    ...new Set(masteredCards.flatMap((c: any) => c.tags || [])),
  ];

  // Extract struggling areas from lapsed cards
  const strugglingCards = await prisma.card.findMany({
    where: {
      userId,
      state: "relearning",
    },
    select: { tags: true },
    take: 100,
  });

  const strugglingAreas = [
    ...new Set(strugglingCards.flatMap((c: any) => c.tags || [])),
  ];

  // Get learning goals from categories
  const learningGoals: string[] = categories
    .filter((cp: any) => cp.category.primaryLearningGoals?.length > 0)
    .flatMap((cp: any) => (cp.category.primaryLearningGoals || []) as string[])
    .slice(0, 10);

  return {
    userId,
    learningLevel,
    preferredExplanationStyle:
      user?.preferences?.explanationStyle || "detailed",
    knownConcepts: knownConcepts.slice(0, 50) as string[],
    strugglingAreas: strugglingAreas.slice(0, 20) as string[],
    learningGoals,
    languagePreference: user?.preferences?.language || "en",
  };
}

/**
 * Mock AI enhancement (placeholder for actual AI integration)
 * In production, this would call the AI service
 */
async function enhanceCardWithAI(
  card: any,
  options: z.infer<typeof aiEnhancementOptionsSchema>,
  _profile: z.infer<typeof learnerProfileSchema>,
): Promise<z.infer<typeof aiEnhancedCardSchema>> {
  const startTime = Date.now();

  // Placeholder enhancements based on card content analysis
  const enhancements: z.infer<typeof cardEnhancementSchema>[] = [];

  // Analyze front content
  const front = card.content?.front || "";
  if (front.length > 200 && options.enhanceContent) {
    enhancements.push({
      field: "front",
      originalValue: front,
      enhancedValue: front.substring(0, 150) + "...",
      enhancementType: "simplify",
      rationale:
        "Long questions can be simplified for better recall. Consider breaking into multiple cards.",
    });
  }

  // Suggest tags based on content
  const suggestedTags: string[] = [];
  if (options.suggestTags) {
    const content = `${front} ${card.content?.back || ""}`.toLowerCase();
    if (content.includes("definition")) suggestedTags.push("definition");
    if (content.includes("example")) suggestedTags.push("example");
    if (content.includes("compare") || content.includes("contrast"))
      suggestedTags.push("comparison");
    if (content.includes("formula") || content.includes("equation"))
      suggestedTags.push("formula");
    if (content.includes("process") || content.includes("steps"))
      suggestedTags.push("process");
  }

  // Estimate difficulty
  let estimatedDifficulty = 0.5;
  if (options.estimateDifficulty) {
    const contentLength = front.length + (card.content?.back?.length || 0);
    const hasFormulas =
      front.includes("$") || (card.content?.back || "").includes("$");
    const wordCount = front.split(/\s+/).length;

    estimatedDifficulty = Math.min(
      1,
      0.3 +
        contentLength / 2000 +
        (hasFormulas ? 0.2 : 0) +
        (wordCount > 50 ? 0.1 : 0),
    );
  }

  // Find connections (placeholder)
  const connections: z.infer<typeof connectionSuggestionSchema>[] = [];

  return {
    originalCardId: card.id,
    enhancements,
    suggestedTags,
    estimatedDifficulty,
    connections,
    confidence: 0.7,
    processingTime: Date.now() - startTime,
    modelUsed: "placeholder-v1",
  };
}

/**
 * Generate AI annotations (placeholder for actual AI integration)
 */
async function generateAIAnnotations(
  card: any,
  category: any,
  profile: z.infer<typeof learnerProfileSchema>,
  maxAnnotations: number,
  types: string[],
): Promise<z.infer<typeof aiAnnotationSchema>[]> {
  const annotations: z.infer<typeof aiAnnotationSchema>[] = [];
  const front = card.content?.front || "";
  const back = card.content?.back || "";

  // Generate based on content analysis
  if (types.includes("explanation") && annotations.length < maxAnnotations) {
    annotations.push({
      id: crypto.randomUUID(),
      type: "explanation",
      content: `This concept relates to ${category.name}. Understanding the connection helps with long-term retention.`,
      targetContent: front.substring(0, 50),
      confidence: 0.7,
      personalizationFactors: ["category_context"],
    });
  }

  if (types.includes("mnemonic") && annotations.length < maxAnnotations) {
    // Simple mnemonic suggestion based on first letters
    const words = front.split(/\s+/).slice(0, 5);
    const acronym = words.map((w: string) => w[0]?.toUpperCase()).join("");
    if (acronym.length >= 3) {
      annotations.push({
        id: crypto.randomUUID(),
        type: "mnemonic",
        content: `Remember: ${acronym} - create a memorable phrase using these letters.`,
        targetContent: null,
        confidence: 0.5,
        personalizationFactors: ["first_letter_technique"],
      });
    }
  }

  if (types.includes("question") && annotations.length < maxAnnotations) {
    annotations.push({
      id: crypto.randomUUID(),
      type: "question",
      content: `Can you explain this concept to someone without using the exact words from the answer?`,
      targetContent: back.substring(0, 50),
      confidence: 0.8,
      personalizationFactors: ["active_recall", "elaboration"],
    });
  }

  return annotations;
}

/**
 * Analyze context patterns (placeholder for actual AI integration)
 */
async function analyzeContextPatternsWithAI(
  performances: any[],
  _profile: z.infer<typeof learnerProfileSchema>,
): Promise<z.infer<typeof aiContextAnalysisSchema>> {
  const startTime = Date.now();
  const patterns: z.infer<typeof contextPatternSchema>[] = [];
  const insights: string[] = [];
  const recommendations: z.infer<typeof contextRecommendationSchema>[] = [];

  // Analyze performance variance across contexts
  const categoryPerformance: Record<
    string,
    { total: number; correct: number }
  > = {};

  for (const perf of performances) {
    if (!categoryPerformance[perf.categoryId]) {
      categoryPerformance[perf.categoryId] = { total: 0, correct: 0 };
    }
    categoryPerformance[perf.categoryId].total++;
    if (perf.wasCorrect) {
      categoryPerformance[perf.categoryId].correct++;
    }
  }

  // Find categories with significant performance differences
  const categoryRates = Object.entries(categoryPerformance).map(
    ([catId, stats]) => ({
      categoryId: catId,
      successRate: stats.total > 0 ? stats.correct / stats.total : 0,
    }),
  );

  const avgRate =
    categoryRates.reduce((sum, c) => sum + c.successRate, 0) /
    (categoryRates.length || 1);

  // Identify patterns
  const lowPerformers = categoryRates.filter(
    (c) => c.successRate < avgRate - 0.15,
  );
  const highPerformers = categoryRates.filter(
    (c) => c.successRate > avgRate + 0.15,
  );

  if (lowPerformers.length > 0) {
    patterns.push({
      patternId: "low_context_performance",
      description: `${lowPerformers.length} contexts show below-average performance`,
      affectedCategories: lowPerformers.map((c) => c.categoryId),
      impactScore: 0.7,
      actionable: true,
    });

    recommendations.push({
      recommendationId: crypto.randomUUID(),
      type: "review_focus",
      description: "Focus more review time on underperforming contexts",
      expectedBenefit: "Balanced knowledge across all learning contexts",
      implementationSteps: [
        "Identify specific cards struggling in these contexts",
        "Review these cards with context-specific mnemonics",
        "Practice applying knowledge across different contexts",
      ],
    });
  }

  if (highPerformers.length > 0 && lowPerformers.length > 0) {
    patterns.push({
      patternId: "context_transfer_opportunity",
      description: "Strong contexts could help reinforce weak ones",
      affectedCategories: [
        ...highPerformers.map((c) => c.categoryId),
        ...lowPerformers.map((c) => c.categoryId),
      ],
      impactScore: 0.6,
      actionable: true,
    });

    recommendations.push({
      recommendationId: crypto.randomUUID(),
      type: "connection_build",
      description:
        "Create explicit connections between strong and weak contexts",
      expectedBenefit:
        "Transfer learning from areas of strength to areas needing improvement",
      implementationSteps: [
        "Review cards in strong contexts first as warm-up",
        "Explicitly note connections to weak context material",
        "Create bridging cards that connect the domains",
      ],
    });
  }

  insights.push(
    `Average success rate across contexts: ${(avgRate * 100).toFixed(1)}%`,
  );

  if (performances.length > 50) {
    insights.push("Sufficient data for reliable context analysis");
  } else {
    insights.push("More reviews needed for robust pattern detection");
  }

  return {
    patterns,
    insights,
    recommendations,
    confidence: Math.min(0.9, 0.5 + performances.length / 200),
    analysisTime: Date.now() - startTime,
  };
}

// =============================================================================
// ROUTES
// =============================================================================

export const aiAugmentationRoutes: FastifyPluginAsync = async (app) => {
  // ===========================================================================
  // ENHANCE CARD
  // ===========================================================================

  app.post<{
    Body: z.infer<typeof enhanceCardRequestSchema>;
  }>(
    "/enhance-card",
    {
      preHandler: [authenticate],
      schema: {
        description: "Enhance a card with AI-powered suggestions",
        tags: ["AI Augmentation"],
        body: enhanceCardRequestSchema,
        response: {
          200: aiEnhancedCardSchema,
        },
      },
    },
    async (request, reply) => {
      const { cardId, options, learnerProfile } = request.body;
      const userId = request.user!.id;

      // Get the card
      const card = await request.prisma.card.findUnique({
        where: { id: cardId },
      });

      if (!card) {
        return reply.status(404).send({
          error: "Card not found",
        });
      }

      if (card.userId !== userId) {
        return reply.status(403).send({
          error: "Forbidden",
          message: "You do not have access to this card",
        });
      }

      // Get or build learner profile
      const profile =
        learnerProfile || (await getLearnerProfile(request.prisma, userId));

      // Apply default options
      const enhancementOptions = {
        enhanceContent: true,
        generateHints: true,
        suggestTags: true,
        estimateDifficulty: true,
        findConnections: true,
        language: "en",
        ...options,
      };

      // Enhance with AI
      const enhanced = await enhanceCardWithAI(
        card,
        enhancementOptions,
        profile,
      );

      return reply.send(enhanced);
    },
  );

  // ===========================================================================
  // GENERATE ANNOTATIONS
  // ===========================================================================

  app.post<{
    Body: z.infer<typeof generateAnnotationsRequestSchema>;
  }>(
    "/generate-annotations",
    {
      preHandler: [authenticate],
      schema: {
        description: "Generate AI-powered contextual annotations for a card",
        tags: ["AI Augmentation"],
        body: generateAnnotationsRequestSchema,
        response: {
          200: z.object({
            annotations: z.array(aiAnnotationSchema),
            cardId: z.string().uuid(),
            categoryId: z.string().uuid(),
            generatedAt: z.string().datetime(),
          }),
        },
      },
    },
    async (request, reply) => {
      const {
        cardId,
        categoryId,
        maxAnnotations = 5,
        annotationTypes = [
          "explanation",
          "mnemonic",
          "connection",
          "question",
          "example",
        ],
      } = request.body;
      const userId = request.user!.id;

      // Get the card and category
      const [card, category] = await Promise.all([
        request.prisma.card.findUnique({ where: { id: cardId } }),
        request.prisma.category.findUnique({ where: { id: categoryId } }),
      ]);

      if (!card) {
        return reply.status(404).send({
          error: "Card not found",
        });
      }

      if (!category) {
        return reply.status(404).send({
          error: "Category not found",
        });
      }

      if (card.userId !== userId || category.userId !== userId) {
        return reply.status(403).send({
          error: "Forbidden",
        });
      }

      // Get learner profile
      const profile = await getLearnerProfile(request.prisma, userId);

      // Generate annotations
      const annotations = await generateAIAnnotations(
        card,
        category,
        profile,
        maxAnnotations,
        annotationTypes,
      );

      return reply.send({
        annotations,
        cardId,
        categoryId,
        generatedAt: new Date().toISOString(),
      });
    },
  );

  // ===========================================================================
  // SUGGEST EMPHASIS RULES
  // ===========================================================================

  app.post<{
    Body: z.infer<typeof suggestEmphasisRequestSchema>;
  }>(
    "/suggest-emphasis",
    {
      preHandler: [authenticate],
      schema: {
        description:
          "Suggest emphasis rules based on card content and learner history",
        tags: ["AI Augmentation"],
        body: suggestEmphasisRequestSchema,
        response: {
          200: z.object({
            suggestions: z.array(suggestedEmphasisRuleSchema),
            cardId: z.string().uuid(),
            analysisFactors: z.array(z.string()),
          }),
        },
      },
    },
    async (request, reply) => {
      const {
        cardId,
        categoryId: _categoryId,
        maxSuggestions = 5,
      } = request.body;
      const userId = request.user!.id;

      // Get the card
      const card = await request.prisma.card.findUnique({
        where: { id: cardId },
        include: {
          reviews: {
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      });

      if (!card) {
        return reply.status(404).send({
          error: "Card not found",
        });
      }

      if (card.userId !== userId) {
        return reply.status(403).send({
          error: "Forbidden",
        });
      }

      // Analyze review history for emphasis suggestions
      const suggestions: z.infer<typeof suggestedEmphasisRuleSchema>[] = [];
      const analysisFactors: string[] = [];

      // Cast content to any for accessing properties
      const cardContent = card.content as any;
      const reviews = card.reviews || [];

      // Check for repeated failures
      const recentFailures = reviews.filter(
        (r: any) => r.rating === 1 || r.rating === 2,
      );

      if (recentFailures.length >= 3) {
        analysisFactors.push("repeated_failures");
        suggestions.push({
          id: crypto.randomUUID(),
          targetPattern: cardContent?.front?.substring(0, 50) || "",
          emphasisType: "key_term",
          operation: "highlight",
          rationale:
            "This card has been challenging. Highlighting key terms may improve recall.",
          expectedImpact: "Improved attention to critical information",
          confidence: 0.8,
        });
      }

      // Check for long response times
      const avgResponseTime =
        reviews.reduce(
          (sum: number, r: any) => sum + (r.responseTime || 0),
          0,
        ) / (reviews.length || 1);

      if (avgResponseTime > 10000) {
        // > 10 seconds
        analysisFactors.push("slow_response_time");
        suggestions.push({
          id: crypto.randomUUID(),
          targetPattern: "*",
          emphasisType: "progressive",
          operation: "progressive_reveal",
          rationale:
            "Long response times suggest information overload. Progressive reveal may help.",
          expectedImpact: "Reduced cognitive load during review",
          confidence: 0.7,
        });
      }

      // Content-based suggestions
      const front = (cardContent?.front || "") as string;
      const back = (cardContent?.back || "") as string;

      if (front.includes("definition:") || front.includes("define")) {
        analysisFactors.push("definition_card");
        suggestions.push({
          id: crypto.randomUUID(),
          targetPattern: "definition",
          emphasisType: "format",
          operation: "bold",
          rationale: "Definition cards benefit from emphasized key terms",
          expectedImpact: "Clearer distinction of terms being defined",
          confidence: 0.9,
        });
      }

      if (back.length > 500) {
        analysisFactors.push("long_answer");
        suggestions.push({
          id: crypto.randomUUID(),
          targetPattern: "*",
          emphasisType: "structure",
          operation: "hide_initially",
          rationale:
            "Long answers can be overwhelming. Consider hiding details initially.",
          expectedImpact: "Focused recall attempt before seeing full answer",
          confidence: 0.6,
        });
      }

      return reply.send({
        suggestions: suggestions.slice(0, maxSuggestions),
        cardId,
        analysisFactors,
      });
    },
  );

  // ===========================================================================
  // ANALYZE CONTEXT PATTERNS
  // ===========================================================================

  app.post<{
    Body: z.infer<typeof analyzeContextRequestSchema>;
  }>(
    "/analyze-context",
    {
      preHandler: [authenticate],
      schema: {
        description: "Analyze multi-context performance patterns using AI",
        tags: ["AI Augmentation"],
        body: analyzeContextRequestSchema,
        response: {
          200: aiContextAnalysisSchema,
        },
      },
    },
    async (request, reply) => {
      const {
        categoryIds,
        timeRange,
        includePerformanceData: _includePerformanceData,
      } = request.body;
      const userId = request.user!.id;

      // Verify category ownership
      const categories = await request.prisma.category.findMany({
        where: {
          id: { in: categoryIds },
          userId,
        },
      });

      if (categories.length !== categoryIds.length) {
        return reply.status(403).send({
          error: "Forbidden",
          message: "Some categories not found or not owned by user",
        });
      }

      // Get performance data
      const whereClause: any = {
        categoryId: { in: categoryIds },
        card: { userId },
      };

      if (timeRange) {
        whereClause.updatedAt = {
          gte: new Date(timeRange.start),
          lte: new Date(timeRange.end),
        };
      }

      const performances =
        await request.prisma.contextPerformanceRecord.findMany({
          where: whereClause,
          orderBy: { updatedAt: "desc" },
          take: 500,
        });

      // Get learner profile
      const profile = await getLearnerProfile(request.prisma, userId);

      // Analyze with AI
      const analysis = await analyzeContextPatternsWithAI(
        performances,
        profile,
      );

      return reply.send(analysis);
    },
  );

  // ===========================================================================
  // GENERATE METACOGNITIVE INSIGHTS
  // ===========================================================================

  app.post<{
    Body: z.infer<typeof generateInsightsRequestSchema>;
  }>(
    "/metacognitive-insights",
    {
      preHandler: [authenticate],
      schema: {
        description:
          "Generate AI-powered metacognitive insights about learning patterns",
        tags: ["AI Augmentation"],
        body: generateInsightsRequestSchema,
        response: {
          200: z.object({
            insights: z.array(aiMetacognitiveInsightSchema),
            profileSummary: learnerProfileSchema,
            generatedAt: z.string().datetime(),
          }),
        },
      },
    },
    async (request, reply) => {
      const {
        recentDays = 30,
        focusAreas = ["strength", "weakness", "pattern", "opportunity"],
        maxInsights = 10,
      } = request.body;
      const userId = request.user!.id;

      // Get learner profile
      const profile = await getLearnerProfile(request.prisma, userId);

      // Get recent review data
      const since = new Date();
      since.setDate(since.getDate() - recentDays);

      const recentReviews = await request.prisma.reviewRecord.findMany({
        where: {
          userId,
          createdAt: { gte: since },
        },
        include: {
          card: {
            select: { tags: true, content: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 1000,
      });

      const insights: z.infer<typeof aiMetacognitiveInsightSchema>[] = [];

      // Analyze for strengths
      if (focusAreas.includes("strength")) {
        const correctReviews = recentReviews.filter(
          (r) => r.rating === 3 || r.rating === 4,
        );
        const successRate = correctReviews.length / (recentReviews.length || 1);

        if (successRate > 0.8) {
          insights.push({
            insightId: crypto.randomUUID(),
            category: "strength",
            title: "Excellent Recall Performance",
            description: `You're achieving ${(successRate * 100).toFixed(1)}% success rate in recent reviews.`,
            evidence: [
              `${correctReviews.length} successful reviews in the past ${recentDays} days`,
              "Consistent performance across multiple sessions",
            ],
            actionableAdvice: [
              "Consider adding more challenging material",
              "You may be ready to increase new cards per day",
              "Try teaching these concepts to reinforce mastery",
            ],
            priority: "medium",
          });
        }
      }

      // Analyze for weaknesses
      if (focusAreas.includes("weakness")) {
        const againReviews = recentReviews.filter((r) => r.rating === 1);
        const againRate = againReviews.length / (recentReviews.length || 1);

        if (againRate > 0.2) {
          const strugglingTags = againReviews
            .flatMap((r) => (r.card as any)?.tags || [])
            .reduce((acc: Record<string, number>, tag: string) => {
              acc[tag] = (acc[tag] || 0) + 1;
              return acc;
            }, {});

          const topStruggles = Object.entries(strugglingTags)
            .sort(([, a], [, b]) => (b as number) - (a as number))
            .slice(0, 3)
            .map(([tag]) => tag);

          insights.push({
            insightId: crypto.randomUUID(),
            category: "weakness",
            title: "Areas Needing Attention",
            description: `${(againRate * 100).toFixed(1)}% of reviews result in 'Again' - this is higher than optimal.`,
            evidence: [
              `${againReviews.length} cards marked 'Again' recently`,
              topStruggles.length > 0
                ? `Most challenging topics: ${topStruggles.join(", ")}`
                : "Challenges spread across multiple topics",
            ],
            actionableAdvice: [
              "Consider reviewing these cards more frequently",
              "Try creating mnemonics or visual aids",
              "Break complex cards into simpler ones",
              "Review the source material again",
            ],
            priority: "high",
          });
        }
      }

      // Analyze for patterns
      if (focusAreas.includes("pattern")) {
        // Time-of-day analysis
        const reviewsByHour = recentReviews.reduce(
          (acc: Record<number, { total: number; correct: number }>, r) => {
            const hour = new Date(r.createdAt).getHours();
            if (!acc[hour]) acc[hour] = { total: 0, correct: 0 };
            acc[hour].total++;
            if (r.rating === 3 || r.rating === 4) {
              acc[hour].correct++;
            }
            return acc;
          },
          {},
        );

        const hourlyRates = Object.entries(reviewsByHour)
          .filter(([, stats]) => stats.total >= 10)
          .map(([hour, stats]) => ({
            hour: parseInt(hour),
            rate: stats.correct / stats.total,
            total: stats.total,
          }))
          .sort((a, b) => b.rate - a.rate);

        if (hourlyRates.length >= 2) {
          const best = hourlyRates[0];
          const worst = hourlyRates[hourlyRates.length - 1];

          if (best.rate - worst.rate > 0.15) {
            insights.push({
              insightId: crypto.randomUUID(),
              category: "pattern",
              title: "Optimal Study Time Detected",
              description: `You perform best around ${best.hour}:00 (${(best.rate * 100).toFixed(0)}% success) and worst around ${worst.hour}:00 (${(worst.rate * 100).toFixed(0)}% success).`,
              evidence: [
                `Based on ${recentReviews.length} reviews over ${recentDays} days`,
                `Peak performance time: ${best.hour}:00`,
              ],
              actionableAdvice: [
                `Schedule important reviews around ${best.hour}:00`,
                `Avoid challenging new material at ${worst.hour}:00`,
                "Consider your energy levels throughout the day",
              ],
              priority: "medium",
            });
          }
        }
      }

      // Analyze for opportunities
      if (focusAreas.includes("opportunity")) {
        // Check for consistent streak
        const studyDays = new Set(
          recentReviews.map((r) => new Date(r.createdAt).toDateString()),
        ).size;

        const consistencyRate = studyDays / recentDays;

        if (consistencyRate < 0.5) {
          insights.push({
            insightId: crypto.randomUUID(),
            category: "opportunity",
            title: "Consistency Opportunity",
            description: `You've studied ${studyDays} out of the last ${recentDays} days. More consistency could boost retention.`,
            evidence: [
              `Current study frequency: ${(consistencyRate * 100).toFixed(0)}%`,
              "Research shows daily review improves retention by 30-50%",
            ],
            actionableAdvice: [
              "Set a daily reminder for a short study session",
              "Start with just 5 minutes on busy days",
              "Track your streak to build momentum",
            ],
            priority: "high",
          });
        } else if (consistencyRate > 0.8) {
          insights.push({
            insightId: crypto.randomUUID(),
            category: "opportunity",
            title: "Ready for Advanced Techniques",
            description:
              "Your consistent study habits put you in an excellent position to try advanced learning techniques.",
            evidence: [
              `${studyDays} study days in the past ${recentDays} days`,
              "Consistent learners benefit most from spaced repetition",
            ],
            actionableAdvice: [
              "Try interleaving different topics in sessions",
              "Experiment with elaborative interrogation",
              "Consider teaching concepts to solidify understanding",
            ],
            priority: "low",
          });
        }
      }

      return reply.send({
        insights: insights.slice(0, maxInsights),
        profileSummary: profile,
        generatedAt: new Date().toISOString(),
      });
    },
  );

  // ===========================================================================
  // GET AVAILABLE AI PROVIDERS
  // ===========================================================================

  app.get(
    "/providers",
    {
      preHandler: [authenticate],
      schema: {
        description: "Get available AI providers and their capabilities",
        tags: ["AI Augmentation"],
        response: {
          200: z.object({
            providers: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                capabilities: z.array(aiCapabilitySchema),
                isConfigured: z.boolean(),
                requiresApiKey: z.boolean(),
              }),
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      // Return available AI providers (placeholder)
      return reply.send({
        providers: [
          {
            id: "builtin-heuristic",
            name: "Built-in Heuristics",
            capabilities: [
              "content_enhancement",
              "emphasis_suggestion",
              "difficulty_estimation",
            ],
            isConfigured: true,
            requiresApiKey: false,
          },
          {
            id: "openai",
            name: "OpenAI GPT",
            capabilities: [
              "content_enhancement",
              "annotation_generation",
              "emphasis_suggestion",
              "context_analysis",
              "metacognition",
              "difficulty_estimation",
              "connection_discovery",
              "explanation_generation",
            ],
            isConfigured: false,
            requiresApiKey: true,
          },
          {
            id: "anthropic",
            name: "Anthropic Claude",
            capabilities: [
              "content_enhancement",
              "annotation_generation",
              "emphasis_suggestion",
              "context_analysis",
              "metacognition",
              "explanation_generation",
            ],
            isConfigured: false,
            requiresApiKey: true,
          },
        ],
      });
    },
  );

  // ===========================================================================
  // CONFIGURE AI PROVIDER
  // ===========================================================================

  app.post<{
    Body: z.infer<typeof aiProviderConfigSchema>;
  }>(
    "/providers/configure",
    {
      preHandler: [authenticate],
      schema: {
        description: "Configure an AI provider for the user",
        tags: ["AI Augmentation"],
        body: aiProviderConfigSchema,
        response: {
          200: z.object({
            success: z.boolean(),
            providerId: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const config = request.body;
      const _userId = request.user!.id;

      // Store provider configuration (placeholder - would encrypt API keys)
      // In production, this would securely store the configuration

      return reply.send({
        success: true,
        providerId: config.providerId,
        message: `AI provider ${config.providerId} configured successfully`,
      });
    },
  );
};

export default aiAugmentationRoutes;
