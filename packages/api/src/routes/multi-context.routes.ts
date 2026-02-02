/**
 * Multi-Context Awareness & Metacognition API Routes
 *
 * PARADIGM: Track how users perform on the same card across different category
 * lenses to detect context drift, support metacognition, and trigger multi-context
 * review moments.
 *
 * Key features:
 * - Context performance tracking per card/category pair
 * - Context drift detection with severity levels
 * - Multi-context review sessions
 * - Metacognition support (confidence tracking, overconfidence detection)
 * - Performance comparison across lenses
 */

import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../config/database";
import { authenticate } from "../middleware/auth";

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

const accuracyTrendSchema = z.enum([
  "improving",
  "declining",
  "stable",
  "volatile",
]);
const _driftSeveritySchema = z.enum(["mild", "moderate", "severe"]);
const sessionTypeSchema = z.enum([
  "drift_remediation",
  "context_comparison",
  "synthesis_check",
]);

const recordReviewSchema = z.object({
  cardId: z.string().min(1),
  categoryId: z.string().min(1),
  isCorrect: z.boolean(),
  responseTime: z.number().int().min(0),
  confidence: z.number().min(0).max(1).optional(),
});

const batchRecordReviewsSchema = z.object({
  reviews: z.array(recordReviewSchema).min(1).max(100),
});

const startMultiContextSessionSchema = z.object({
  sessionType: sessionTypeSchema,
  categoryIds: z.array(z.string()).min(2).max(10),
});

const endMultiContextSessionSchema = z.object({
  sessionId: z.string().min(1),
  cardsReviewed: z.number().int().min(0),
  overallAccuracy: z.number().min(0).max(1),
  contextSwitchAccuracy: z.number().min(0).max(1).optional(),
  driftResolved: z.number().int().min(0).optional().default(0),
  newDriftDetected: z.number().int().min(0).optional().default(0),
});

const contextPerformanceQuerySchema = z.object({
  cardId: z.string().optional(),
  categoryId: z.string().optional(),
  hasDriftWarning: z.coerce.boolean().optional(),
  accuracyTrend: accuracyTrendSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate accuracy trend based on recent vs historical performance
 */
function calculateAccuracyTrend(
  recentAccuracy: number,
  historicalAccuracy: number,
  reviewCount: number,
): "improving" | "declining" | "stable" | "volatile" {
  if (reviewCount < 5) return "stable"; // Not enough data

  const diff = recentAccuracy - historicalAccuracy;
  const threshold = 0.1;

  if (Math.abs(diff) < threshold) return "stable";
  if (diff > threshold) return "improving";
  if (diff < -threshold) return "declining";
  return "volatile";
}

/**
 * Determine drift severity based on performance deviation
 */
function determineDriftSeverity(
  performanceDeviation: number,
): "mild" | "moderate" | "severe" | null {
  if (performanceDeviation < 0.15) return null;
  if (performanceDeviation < 0.25) return "mild";
  if (performanceDeviation < 0.4) return "moderate";
  return "severe";
}

/**
 * Calculate performance deviation for a card across contexts
 */
async function calculatePerformanceDeviation(
  userId: string,
  cardId: string,
  excludeCategoryId?: string,
): Promise<{ mean: number; deviation: number; contexts: number }> {
  const performances = await prisma.contextPerformanceRecord.findMany({
    where: {
      userId,
      cardId,
      totalReviews: { gte: 3 },
      ...(excludeCategoryId ? { categoryId: { not: excludeCategoryId } } : {}),
    },
    select: { accuracy: true },
  });

  if (performances.length < 2) {
    return { mean: 0, deviation: 0, contexts: performances.length };
  }

  const accuracies = performances.map((p) => p.accuracy);
  const mean = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
  const variance =
    accuracies.reduce((sum, acc) => sum + Math.pow(acc - mean, 2), 0) /
    accuracies.length;
  const deviation = Math.sqrt(variance);

  return { mean, deviation, contexts: performances.length };
}

/**
 * Update drift detection for a performance record
 */
async function updateDriftDetection(
  recordId: string,
  userId: string,
  cardId: string,
  categoryId: string,
  currentAccuracy: number,
): Promise<void> {
  const stats = await calculatePerformanceDeviation(userId, cardId, categoryId);

  if (stats.contexts < 2) return; // Need multiple contexts to detect drift

  const performanceDeviation = Math.abs(currentAccuracy - stats.mean);
  const severity = determineDriftSeverity(performanceDeviation);
  const hasDrift = severity !== null;

  await prisma.contextPerformanceRecord.update({
    where: { id: recordId },
    data: {
      performanceDeviation,
      hasDriftWarning: hasDrift,
      driftSeverity: severity,
      driftDetectedAt: hasDrift ? new Date() : null,
    },
  });
}

// =============================================================================
// ROUTES
// =============================================================================

const multiContextRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply authentication to all routes
  fastify.addHook("onRequest", authenticate);

  // ===========================================================================
  // POST /context-performance/record - Record a review in context
  // ===========================================================================
  fastify.post<{
    Body: z.infer<typeof recordReviewSchema>;
  }>(
    "/record",
    {
      schema: {
        tags: ["Multi-Context"],
        summary: "Record review performance in context",
        description:
          "Record a card review result within a specific category context.",
        body: recordReviewSchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { cardId, categoryId, isCorrect, responseTime, confidence } =
        recordReviewSchema.parse(request.body);

      // Get or create performance record
      let record = await prisma.contextPerformanceRecord.findFirst({
        where: { userId, cardId, categoryId },
      });

      if (!record) {
        record = await prisma.contextPerformanceRecord.create({
          data: {
            userId,
            cardId,
            categoryId,
            totalReviews: 0,
            correctReviews: 0,
            accuracy: 0,
            avgResponseTime: 0,
            perceivedDifficulty: 0.5,
            currentStreak: 0,
            longestStreak: 0,
            recentAccuracy: 0,
            accuracyTrend: "stable",
            performanceDeviation: 0,
            hasOverconfidenceFlag: false,
            hasUnderconfidenceFlag: false,
            multiContextReviewCount: 0,
          },
        });
      }

      // Update basic stats
      const newTotalReviews = record.totalReviews + 1;
      const newCorrectReviews = record.correctReviews + (isCorrect ? 1 : 0);
      const newAccuracy = newCorrectReviews / newTotalReviews;

      // Update response time (rolling average)
      const newAvgResponseTime =
        (record.avgResponseTime * record.totalReviews + responseTime) /
        newTotalReviews;

      // Update streaks
      const newCurrentStreak = isCorrect ? record.currentStreak + 1 : 0;
      const newLongestStreak = Math.max(record.longestStreak, newCurrentStreak);

      // Calculate recent accuracy (last 5 reviews approximation)
      const recentWeight = Math.min(5, newTotalReviews);
      const recentAccuracy =
        (record.recentAccuracy * (recentWeight - 1) + (isCorrect ? 1 : 0)) /
        recentWeight;

      // Calculate accuracy trend
      const accuracyTrend = calculateAccuracyTrend(
        recentAccuracy,
        newAccuracy,
        newTotalReviews,
      );

      // Update perceived difficulty based on accuracy and response time
      const timeFactor = Math.min(1, responseTime / 10000); // Normalize to 10 seconds
      const perceivedDifficulty = (1 - newAccuracy) * 0.7 + timeFactor * 0.3;

      // Handle confidence tracking
      let avgConfidence = record.avgConfidence;
      const confidenceAccuracyCorrelation =
        record.confidenceAccuracyCorrelation;
      let hasOverconfidenceFlag = record.hasOverconfidenceFlag;
      let hasUnderconfidenceFlag = record.hasUnderconfidenceFlag;

      if (confidence !== undefined) {
        // Update average confidence
        avgConfidence =
          avgConfidence !== null
            ? (avgConfidence * record.totalReviews + confidence) /
              newTotalReviews
            : confidence;

        // Simple overconfidence/underconfidence detection
        if (confidence > 0.8 && !isCorrect) {
          hasOverconfidenceFlag = true;
        }
        if (confidence < 0.3 && isCorrect) {
          hasUnderconfidenceFlag = true;
        }
      }

      // Update the record
      const updatedRecord = await prisma.contextPerformanceRecord.update({
        where: { id: record.id },
        data: {
          totalReviews: newTotalReviews,
          correctReviews: newCorrectReviews,
          accuracy: newAccuracy,
          avgResponseTime: newAvgResponseTime,
          minResponseTime: record.minResponseTime
            ? Math.min(record.minResponseTime, responseTime)
            : responseTime,
          maxResponseTime: record.maxResponseTime
            ? Math.max(record.maxResponseTime, responseTime)
            : responseTime,
          perceivedDifficulty,
          lastReviewedAt: new Date(),
          currentStreak: newCurrentStreak,
          longestStreak: newLongestStreak,
          recentAccuracy,
          accuracyTrend,
          avgConfidence,
          confidenceAccuracyCorrelation,
          hasOverconfidenceFlag,
          hasUnderconfidenceFlag,
        },
      });

      // Update drift detection
      await updateDriftDetection(
        record.id,
        userId,
        cardId,
        categoryId,
        newAccuracy,
      );

      // Also update the participation record
      await prisma.cardCategoryParticipation.updateMany({
        where: { cardId, categoryId },
        data: {
          contextMastery: newAccuracy,
          reviewCountInContext: newTotalReviews,
          lastReviewedInContext: new Date(),
        },
      });

      return reply.send({
        record: updatedRecord,
        isCorrect,
        newStreak: newCurrentStreak,
      });
    },
  );

  // ===========================================================================
  // POST /context-performance/batch-record - Batch record reviews
  // ===========================================================================
  fastify.post<{
    Body: z.infer<typeof batchRecordReviewsSchema>;
  }>(
    "/batch-record",
    {
      schema: {
        tags: ["Multi-Context"],
        summary: "Batch record review performance",
        description: "Record multiple card reviews in a single request.",
        body: batchRecordReviewsSchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { reviews } = batchRecordReviewsSchema.parse(request.body);

      const results: Array<{
        cardId: string;
        categoryId: string;
        success: boolean;
        error?: string;
      }> = [];

      for (const review of reviews) {
        try {
          // Simplified version - in production, this would be optimized
          let record = await prisma.contextPerformanceRecord.findFirst({
            where: {
              userId,
              cardId: review.cardId,
              categoryId: review.categoryId,
            },
          });

          if (!record) {
            record = await prisma.contextPerformanceRecord.create({
              data: {
                userId,
                cardId: review.cardId,
                categoryId: review.categoryId,
                totalReviews: 0,
                correctReviews: 0,
                accuracy: 0,
                avgResponseTime: 0,
                perceivedDifficulty: 0.5,
                currentStreak: 0,
                longestStreak: 0,
                recentAccuracy: 0,
                accuracyTrend: "stable",
                performanceDeviation: 0,
                hasOverconfidenceFlag: false,
                hasUnderconfidenceFlag: false,
                multiContextReviewCount: 0,
              },
            });
          }

          const newTotal = record.totalReviews + 1;
          const newCorrect = record.correctReviews + (review.isCorrect ? 1 : 0);
          const newAccuracy = newCorrect / newTotal;

          await prisma.contextPerformanceRecord.update({
            where: { id: record.id },
            data: {
              totalReviews: newTotal,
              correctReviews: newCorrect,
              accuracy: newAccuracy,
              lastReviewedAt: new Date(),
            },
          });

          results.push({
            cardId: review.cardId,
            categoryId: review.categoryId,
            success: true,
          });
        } catch (error) {
          results.push({
            cardId: review.cardId,
            categoryId: review.categoryId,
            success: false,
            error: "Failed to record",
          });
        }
      }

      return reply.send({
        recorded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
      });
    },
  );

  // ===========================================================================
  // GET /context-performance - List performance records
  // ===========================================================================
  fastify.get<{
    Querystring: z.infer<typeof contextPerformanceQuerySchema>;
  }>(
    "/",
    {
      schema: {
        tags: ["Multi-Context"],
        summary: "List context performance records",
        querystring: contextPerformanceQuerySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const {
        cardId,
        categoryId,
        hasDriftWarning,
        accuracyTrend,
        limit,
        offset,
      } = contextPerformanceQuerySchema.parse(request.query);

      const where: Record<string, unknown> = { userId };
      if (cardId) where.cardId = cardId;
      if (categoryId) where.categoryId = categoryId;
      if (hasDriftWarning !== undefined)
        where.hasDriftWarning = hasDriftWarning;
      if (accuracyTrend) where.accuracyTrend = accuracyTrend;

      const [records, total] = await Promise.all([
        prisma.contextPerformanceRecord.findMany({
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
            card: {
              select: {
                id: true,
                cardType: true,
                content: true,
              },
            },
          },
          orderBy: [{ hasDriftWarning: "desc" }, { lastReviewedAt: "desc" }],
          skip: offset,
          take: limit,
        }),
        prisma.contextPerformanceRecord.count({ where }),
      ]);

      return reply.send({
        records,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + records.length < total,
        },
      });
    },
  );

  // ===========================================================================
  // GET /context-performance/card/:cardId - Get all context performance for a card
  // ===========================================================================
  fastify.get<{
    Params: { cardId: string };
  }>(
    "/card/:cardId",
    {
      schema: {
        tags: ["Multi-Context"],
        summary: "Get context performance for a card",
        description:
          "Get performance across all category contexts for a specific card.",
        params: z.object({ cardId: z.string() }),
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { cardId } = request.params;

      const records = await prisma.contextPerformanceRecord.findMany({
        where: { userId, cardId },
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
        orderBy: { accuracy: "desc" },
      });

      // Calculate drift summary
      const accuracies = records
        .filter((r) => r.totalReviews >= 3)
        .map((r) => r.accuracy);
      let hasSignificantDrift = false;
      let performanceSpread = 0;
      let worstPerformingContext: string | undefined;
      let bestPerformingContext: string | undefined;

      if (accuracies.length >= 2) {
        const maxAcc = Math.max(...accuracies);
        const minAcc = Math.min(...accuracies);
        performanceSpread = maxAcc - minAcc;
        hasSignificantDrift = performanceSpread > 0.2;

        const best = records.find((r) => r.accuracy === maxAcc);
        const worst = records.find((r) => r.accuracy === minAcc);
        bestPerformingContext = best?.categoryId;
        worstPerformingContext = worst?.categoryId;
      }

      return reply.send({
        cardId,
        contextPerformances: records,
        driftSummary: {
          hasSignificantDrift,
          performanceSpread,
          worstPerformingContext,
          bestPerformingContext,
          totalContexts: records.length,
          contextsWith3PlusReviews: accuracies.length,
        },
      });
    },
  );

  // ===========================================================================
  // GET /context-performance/drift-warnings - Get all cards with drift warnings
  // ===========================================================================
  fastify.get(
    "/drift-warnings",
    {
      schema: {
        tags: ["Multi-Context"],
        summary: "Get cards with drift warnings",
        description: "Get all cards that have context drift warnings.",
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;

      const records = await prisma.contextPerformanceRecord.findMany({
        where: { userId, hasDriftWarning: true },
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
        orderBy: [{ driftSeverity: "desc" }, { driftDetectedAt: "desc" }],
      });

      // Group by severity
      const bySeverity = records.reduce(
        (acc, r) => {
          const key = r.driftSeverity || "unknown";
          if (!acc[key]) acc[key] = [];
          acc[key].push(r);
          return acc;
        },
        {} as Record<string, typeof records>,
      );

      return reply.send({
        records,
        bySeverity,
        total: records.length,
        severe: bySeverity["severe"]?.length || 0,
        moderate: bySeverity["moderate"]?.length || 0,
        mild: bySeverity["mild"]?.length || 0,
      });
    },
  );

  // ===========================================================================
  // POST /context-performance/:id/resolve-drift - Resolve drift warning
  // ===========================================================================
  fastify.post<{
    Params: { id: string };
  }>(
    "/:id/resolve-drift",
    {
      schema: {
        tags: ["Multi-Context"],
        summary: "Resolve drift warning",
        description: "Mark a drift warning as resolved after remediation.",
        params: z.object({ id: z.string() }),
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { id } = request.params;

      const record = await prisma.contextPerformanceRecord.findFirst({
        where: { id, userId },
      });

      if (!record) {
        return reply
          .status(404)
          .send({ error: "Performance record not found" });
      }

      await prisma.contextPerformanceRecord.update({
        where: { id },
        data: {
          hasDriftWarning: false,
          driftSeverity: null,
          driftDetectedAt: null,
        },
      });

      return reply.send({ message: "Drift warning resolved" });
    },
  );

  // ===========================================================================
  // POST /multi-context-sessions/start - Start multi-context review session
  // ===========================================================================
  fastify.post<{
    Body: z.infer<typeof startMultiContextSessionSchema>;
  }>(
    "/sessions/start",
    {
      schema: {
        tags: ["Multi-Context"],
        summary: "Start multi-context review session",
        description:
          "Start a session specifically designed for multi-context awareness.",
        body: startMultiContextSessionSchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { sessionType, categoryIds } = startMultiContextSessionSchema.parse(
        request.body,
      );

      // Verify categories exist
      const categories = await prisma.category.findMany({
        where: { id: { in: categoryIds }, userId },
        select: { id: true, name: true },
      });

      if (categories.length !== categoryIds.length) {
        return reply
          .status(400)
          .send({ error: "One or more categories not found" });
      }

      const session = await prisma.multiContextReviewSession.create({
        data: {
          userId,
          sessionType,
          categoryIds,
          cardsReviewed: 0,
          overallAccuracy: 0,
          contextSwitchAccuracy: 0,
          driftResolved: 0,
          newDriftDetected: 0,
          durationMinutes: 0,
        },
      });

      return reply.status(201).send({
        session,
        categories,
      });
    },
  );

  // ===========================================================================
  // POST /multi-context-sessions/end - End multi-context review session
  // ===========================================================================
  fastify.post<{
    Body: z.infer<typeof endMultiContextSessionSchema>;
  }>(
    "/sessions/end",
    {
      schema: {
        tags: ["Multi-Context"],
        summary: "End multi-context review session",
        description:
          "Complete a multi-context review session with final stats.",
        body: endMultiContextSessionSchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const data = endMultiContextSessionSchema.parse(request.body);

      const session = await prisma.multiContextReviewSession.findFirst({
        where: { id: data.sessionId, userId },
      });

      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }

      if (session.completedAt) {
        return reply.status(400).send({ error: "Session already completed" });
      }

      const completedAt = new Date();
      const durationMinutes = Math.round(
        (completedAt.getTime() - session.startedAt.getTime()) / 60000,
      );

      const updatedSession = await prisma.multiContextReviewSession.update({
        where: { id: data.sessionId },
        data: {
          cardsReviewed: data.cardsReviewed,
          overallAccuracy: data.overallAccuracy,
          contextSwitchAccuracy: data.contextSwitchAccuracy || 0,
          driftResolved: data.driftResolved,
          newDriftDetected: data.newDriftDetected,
          completedAt,
          durationMinutes,
        },
      });

      return reply.send({
        session: updatedSession,
        summary: {
          cardsReviewed: data.cardsReviewed,
          overallAccuracy: data.overallAccuracy,
          contextSwitchAccuracy: data.contextSwitchAccuracy,
          driftResolved: data.driftResolved,
          newDriftDetected: data.newDriftDetected,
          durationMinutes,
        },
      });
    },
  );

  // ===========================================================================
  // GET /multi-context-sessions - List multi-context sessions
  // ===========================================================================
  fastify.get<{
    Querystring: {
      sessionType?: z.infer<typeof sessionTypeSchema>;
      limit?: number;
      offset?: number;
    };
  }>(
    "/sessions",
    {
      schema: {
        tags: ["Multi-Context"],
        summary: "List multi-context review sessions",
        querystring: z.object({
          sessionType: sessionTypeSchema.optional(),
          limit: z.coerce.number().int().min(1).max(100).optional().default(20),
          offset: z.coerce.number().int().min(0).optional().default(0),
        }),
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { sessionType, limit, offset } = request.query;

      const where: Record<string, unknown> = { userId };
      if (sessionType) where.sessionType = sessionType;

      const [sessions, total] = await Promise.all([
        prisma.multiContextReviewSession.findMany({
          where,
          orderBy: { startedAt: "desc" },
          skip: offset,
          take: limit,
        }),
        prisma.multiContextReviewSession.count({ where }),
      ]);

      return reply.send({
        sessions,
        pagination: {
          total,
          limit,
          offset: offset || 0,
          hasMore: (offset || 0) + sessions.length < total,
        },
      });
    },
  );

  // ===========================================================================
  // GET /multi-context-moments - Get cards needing multi-context review
  // ===========================================================================
  fastify.get<{
    Querystring: { limit?: number };
  }>(
    "/moments",
    {
      schema: {
        tags: ["Multi-Context"],
        summary: "Get multi-context review moments",
        description:
          "Get cards that should be reviewed in multiple contexts due to drift or synthesis opportunities.",
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(50).optional().default(10),
        }),
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const { limit } = request.query;

      // Get cards with drift warnings
      const driftCards = await prisma.contextPerformanceRecord.findMany({
        where: { userId, hasDriftWarning: true },
        select: {
          cardId: true,
          categoryId: true,
          driftSeverity: true,
          card: {
            select: {
              id: true,
              cardType: true,
              categoryParticipations: {
                select: {
                  categoryId: true,
                  category: {
                    select: {
                      id: true,
                      name: true,
                      framingQuestion: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { driftSeverity: "desc" },
        take: limit,
      });

      // Format as multi-context moments
      const moments = driftCards.map((dc) => {
        const otherContexts = dc.card.categoryParticipations
          .filter((p) => p.categoryId !== dc.categoryId)
          .map((p) => p.categoryId);

        return {
          cardId: dc.cardId,
          primaryContext: dc.categoryId,
          secondaryContexts: otherContexts,
          reason: "drift_detected" as const,
          driftSeverity: dc.driftSeverity,
          showFramingQuestions: true,
          showPerformanceComparison: true,
        };
      });

      return reply.send({
        moments,
        total: moments.length,
      });
    },
  );

  // ===========================================================================
  // GET /metacognition/summary - Get metacognition summary
  // ===========================================================================
  fastify.get(
    "/metacognition/summary",
    {
      schema: {
        tags: ["Multi-Context"],
        summary: "Get metacognition summary",
        description:
          "Get summary of metacognition indicators like overconfidence and underconfidence.",
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;

      const [overconfidentCount, underconfidentCount, totalWithConfidence] =
        await Promise.all([
          prisma.contextPerformanceRecord.count({
            where: { userId, hasOverconfidenceFlag: true },
          }),
          prisma.contextPerformanceRecord.count({
            where: { userId, hasUnderconfidenceFlag: true },
          }),
          prisma.contextPerformanceRecord.count({
            where: { userId, avgConfidence: { not: null } },
          }),
        ]);

      // Get average confidence-accuracy correlation
      const records = await prisma.contextPerformanceRecord.findMany({
        where: {
          userId,
          avgConfidence: { not: null },
          totalReviews: { gte: 5 },
        },
        select: {
          avgConfidence: true,
          accuracy: true,
        },
      });

      let avgConfidence: number | null = null;
      let avgAccuracy: number | null = null;

      if (records.length > 0) {
        avgConfidence =
          records.reduce((sum, r) => sum + (r.avgConfidence || 0), 0) /
          records.length;
        avgAccuracy =
          records.reduce((sum, r) => sum + r.accuracy, 0) / records.length;
      }

      return reply.send({
        summary: {
          overconfidentContexts: overconfidentCount,
          underconfidentContexts: underconfidentCount,
          totalContextsWithConfidence: totalWithConfidence,
          avgConfidence,
          avgAccuracy,
          calibrationGap:
            avgConfidence && avgAccuracy ? avgConfidence - avgAccuracy : null,
        },
        insights: {
          hasOverconfidenceTendency: overconfidentCount > 3,
          hasUnderconfidenceTendency: underconfidentCount > 3,
          isWellCalibrated:
            avgConfidence &&
            avgAccuracy &&
            Math.abs(avgConfidence - avgAccuracy) < 0.1,
        },
      });
    },
  );
};

export { multiContextRoutes };
