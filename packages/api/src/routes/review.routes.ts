// =============================================================================
// REVIEW ROUTES
// =============================================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "../config/database.js";
import { authenticate } from "../middleware/auth.js";
import {
  createScheduler,
  createGamificationManager,
  type Rating,
  type SchedulerType,
  type NumericRating,
  toRating,
} from "@manthanein/shared";
import {
  emitContextReviewOnSubmit,
  projectMasteryAfterReview,
} from "../ecosystem-bridge/index.js";

// =============================================================================
// SCHEMAS
// =============================================================================

const reviewCardSchema = z.object({
  cardId: z.string(),
  rating: z.number().int().min(1).max(4) as z.ZodType<NumericRating>,
  responseTimeMs: z.number().int().min(0),
  confidenceBefore: z.number().min(0).max(1).optional(),
  studySessionId: z.string().optional(),
  // Context-aware review tracking (Multi-Belonging integration)
  categoryId: z.string().optional(), // The active category lens during review
  contextConfidence: z.number().min(0).max(1).optional(), // Confidence in this context
});

const previewIntervalsSchema = z.object({
  cardId: z.string(),
});

// =============================================================================
// ROUTES
// =============================================================================

export async function reviewRoutes(app: FastifyInstance) {
  // Review a card
  app.post(
    "/",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Reviews"],
        summary: "Submit a card review",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = reviewCardSchema.parse(request.body);
      const userId = request.user!.id;

      // Get card
      const card = await prisma.card.findFirst({
        where: { id: body.cardId, userId },
        include: { deck: true },
      });

      if (!card) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Card not found",
        });
      }

      // Get user preferences for scheduler type
      const preferences = await prisma.userPreferences.findUnique({
        where: { userId },
      });

      const schedulerType = (preferences?.schedulerType ||
        "fsrs") as SchedulerType;
      const schedulerConfig = preferences?.schedulerConfig || {};

      // Create scheduler
      const scheduler = createScheduler(schedulerType, schedulerConfig as any);

      // Convert numeric rating to string Rating type
      const ratingStr = toRating(body.rating);

      // Calculate next review
      const currentState = {
        stability: card.stability,
        difficulty: card.difficulty,
        elapsedDays: card.elapsedDays,
        scheduledDays: card.scheduledDays,
        reps: card.reps,
        lapses: card.lapses,
        state: card.state as any,
        lastReviewDate: card.lastReviewDate,
      };

      const result = scheduler.scheduleRating(currentState, ratingStr);

      // Determine new state
      let newState = card.state;
      if (body.rating === 1) {
        newState = card.state === "new" ? "learning" : "relearning";
      } else if (card.state === "new" || card.state === "learning") {
        newState = body.rating >= 3 ? "review" : "learning";
      } else if (card.state === "relearning") {
        newState = body.rating >= 3 ? "review" : "relearning";
      } else if (result.interval > 21 && card.correctReviews > 5) {
        newState = "mastered";
      }

      const now = new Date();
      const nextReviewDate = new Date(
        now.getTime() + result.interval * 24 * 60 * 60 * 1000,
      );

      // Update card
      await prisma.card.update({
        where: { id: body.cardId },
        data: {
          state: newState,
          stability: result.stability,
          difficulty: result.difficulty,
          elapsedDays: 0,
          scheduledDays: result.interval,
          reps: card.reps + 1,
          lapses: body.rating === 1 ? card.lapses + 1 : card.lapses,
          lastReviewDate: now,
          nextReviewDate,
          totalReviews: card.totalReviews + 1,
          correctReviews:
            body.rating >= 3 ? card.correctReviews + 1 : card.correctReviews,
          averageTime: Math.round(
            (card.averageTime * card.totalReviews + body.responseTimeMs) /
              (card.totalReviews + 1),
          ),
        },
      });

      // Create review record
      const reviewRecord = await prisma.reviewRecord.create({
        data: {
          userId,
          cardId: body.cardId,
          studySessionId: body.studySessionId,
          rating: body.rating,
          responseTime: body.responseTimeMs,
          previousState: card.state,
          previousStability: card.stability,
          previousDifficulty: card.difficulty,
          newState,
          newStability: result.stability,
          newDifficulty: result.difficulty,
          scheduledDays: result.interval,
          confidenceBefore: body.confidenceBefore,
          schedulerUsed: schedulerType,
        },
      });

      // =======================================================================
      // MULTI-BELONGING: Update context-specific participation metrics
      // =======================================================================
      if (body.categoryId) {
        const isCorrect = body.rating >= 3;

        // Update the participation's context-specific metrics
        const participation = await prisma.cardCategoryParticipation.findUnique(
          {
            where: {
              cardId_categoryId: {
                cardId: body.cardId,
                categoryId: body.categoryId,
              },
            },
          },
        );

        if (participation) {
          const newReviewCount = participation.reviewCountInContext + 1;
          const correctInContext = isCorrect ? 1 : 0;

          // Calculate new running averages
          const oldSuccessRate = participation.contextSuccessRate || 0;
          const newSuccessRate =
            (oldSuccessRate * participation.reviewCountInContext +
              correctInContext) /
            newReviewCount;

          const oldAvgTime =
            participation.avgResponseTimeMs || body.responseTimeMs;
          const newAvgTime = Math.round(
            (oldAvgTime * participation.reviewCountInContext +
              body.responseTimeMs) /
              newReviewCount,
          );

          // Update lapse rate if this was a lapse
          const wasLapse = body.rating === 1;
          const oldLapseRate = participation.contextLapseRate || 0;
          const newLapseRate = wasLapse
            ? (oldLapseRate * participation.reviewCountInContext + 1) /
              newReviewCount
            : oldLapseRate;

          // Calculate context mastery score (weighted combination)
          const contextMasteryScore =
            newSuccessRate * 0.6 +
            (1 - newLapseRate) * 0.3 +
            Math.min(newReviewCount / 10, 1) * 0.1;

          await prisma.cardCategoryParticipation.update({
            where: { id: participation.id },
            data: {
              reviewCountInContext: newReviewCount,
              lastReviewedInContext: new Date(),
              contextSuccessRate: newSuccessRate,
              contextLapseRate: newLapseRate,
              avgResponseTimeMs: newAvgTime,
              contextMasteryScore,
              confidenceRating:
                body.contextConfidence ?? participation.confidenceRating,
            },
          });

          // Emit context review event to LKGC (non-blocking)
          emitContextReviewOnSubmit({
            cardId: body.cardId,
            categoryId: body.categoryId,
            userId,
            rating: body.rating,
            responseTimeMs: body.responseTimeMs,
            contextSuccessRate: newSuccessRate,
            contextMasteryScore,
            reviewCountInContext: newReviewCount,
          }).catch(() => {});

          // Project mastery from LKGC (non-blocking)
          projectMasteryAfterReview({
            participationId: participation.id,
            cardId: body.cardId,
            categoryId: body.categoryId,
            userId,
          }).catch(() => {});

          // Check for performance divergence after update
          await checkAndRecordDivergence(userId, body.cardId);

          // Check synthesis triggers
          await checkSynthesisTriggers(userId, body.cardId, body.categoryId);
        }
      }

      // Update deck counts if state changed
      if (card.state !== newState) {
        const stateFieldOld = `${card.state}Count`;
        const stateFieldNew = `${newState}Count`;

        await prisma.deck.update({
          where: { id: card.deckId },
          data: {
            [stateFieldOld]: { decrement: 1 },
            [stateFieldNew]: { increment: 1 },
          },
        });
      }

      // Process gamification
      const stats = await prisma.userLearningStats.findUnique({
        where: { userId },
      });

      const achievements = await prisma.userAchievement.findMany({
        where: { userId },
        select: { achievementId: true },
      });

      const metaUnlocks = await prisma.userMetaLearningUnlock.findMany({
        where: { userId },
        select: { unlockId: true },
      });

      const gamification = createGamificationManager();

      // Get current combo from Redis or session
      const redis = (request as any).redis;
      const comboKey = `combo:${userId}`;
      const currentCombo = parseInt((await redis.get(comboKey)) || "0", 10);

      const gamificationResult = gamification.processReview(
        {
          rating: body.rating,
          cardDifficulty: card.difficulty,
          responseTimeMs: body.responseTimeMs,
          confidenceBefore: body.confidenceBefore,
        },
        {
          currentCombo,
          streakDays: stats?.currentStreak || 0,
          todayXP: 0, // Would need to calculate from today's transactions
          stats: stats as any,
          unlockedAchievements: achievements.map((a) => a.achievementId) as any,
          metaLearningUnlocks: metaUnlocks.map((u) => u.unlockId),
        },
      );

      // Update combo
      if (gamificationResult.comboUpdate.comboLost) {
        await redis.del(comboKey);
      } else {
        await redis.setex(
          comboKey,
          300,
          gamificationResult.comboUpdate.newCombo.toString(),
        ); // 5 min expiry
      }

      // Record XP if earned
      let xpEarned = 0;
      if (gamificationResult.xpTransaction) {
        xpEarned = gamificationResult.xpTransaction.amount;

        await prisma.xPTransaction.create({
          data: {
            userId,
            amount: xpEarned,
            source: "card_review",
            details: gamificationResult.xpTransaction.details as any,
          },
        });

        await prisma.userLearningStats.update({
          where: { userId },
          data: {
            totalXP: { increment: xpEarned },
            totalReviews: { increment: 1 },
          },
        });
      }

      // Record new achievements
      for (const achievement of gamificationResult.newAchievements) {
        await prisma.userAchievement.create({
          data: {
            userId,
            achievementId: achievement.id,
            xpAwarded: achievement.xpReward,
          },
        });

        await prisma.userLearningStats.update({
          where: { userId },
          data: { totalXP: { increment: achievement.xpReward } },
        });
      }

      // Record new meta-learning unlocks
      for (const unlock of gamificationResult.newMetaLearningUnlocks) {
        await prisma.userMetaLearningUnlock.create({
          data: {
            userId,
            unlockId: unlock.id,
          },
        });
      }

      return {
        review: reviewRecord,
        nextReview: {
          interval: result.interval,
          nextReviewDate,
          stability: result.stability,
          difficulty: result.difficulty,
        },
        gamification: {
          xpEarned,
          newCombo: gamificationResult.comboUpdate.newCombo,
          comboLost: gamificationResult.comboUpdate.comboLost,
          newAchievements: gamificationResult.newAchievements.map((a) => ({
            id: a.id,
            name: a.name,
            xpReward: a.xpReward,
          })),
          newMetaLearningUnlocks: gamificationResult.newMetaLearningUnlocks.map(
            (u) => ({
              id: u.id,
              name: u.name,
            }),
          ),
        },
      };
    },
  );

  // Preview intervals for all ratings
  app.get<{ Params: { cardId: string } }>(
    "/preview/:cardId",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Reviews"],
        summary: "Preview intervals for each rating option",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { cardId } = request.params;
      const userId = request.user!.id;

      const card = await prisma.card.findFirst({
        where: { id: cardId, userId },
      });

      if (!card) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Card not found",
        });
      }

      const preferences = await prisma.userPreferences.findUnique({
        where: { userId },
      });

      const schedulerType = (preferences?.schedulerType ||
        "fsrs") as SchedulerType;
      const scheduler = createScheduler(
        schedulerType,
        preferences?.schedulerConfig as any,
      );

      const currentState = {
        stability: card.stability,
        difficulty: card.difficulty,
        elapsedDays: card.elapsedDays,
        scheduledDays: card.scheduledDays,
        reps: card.reps,
        lapses: card.lapses,
        state: card.state as any,
        lastReviewDate: card.lastReviewDate,
      };

      // Calculate for each rating
      const previews = ([1, 2, 3, 4] as NumericRating[]).map((numRating) => {
        const ratingStr = toRating(numRating);
        const result = scheduler.scheduleRating(currentState, ratingStr);
        return {
          rating: numRating,
          ratingName: ["Again", "Hard", "Good", "Easy"][numRating - 1],
          interval: result.interval,
          intervalFormatted: formatInterval(result.interval),
          retrievability: result.retrievability,
        };
      });

      return { previews };
    },
  );

  // Get review statistics
  app.get(
    "/stats",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Reviews"],
        summary: "Get review statistics",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [todayReviews, totalReviews, recentReviews] = await Promise.all([
        prisma.reviewRecord.count({
          where: {
            userId,
            createdAt: { gte: today },
          },
        }),
        prisma.reviewRecord.count({ where: { userId } }),
        prisma.reviewRecord.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      ]);

      // Calculate accuracy
      const correctCount = recentReviews.filter((r) => r.rating >= 3).length;
      const recentAccuracy =
        recentReviews.length > 0 ? correctCount / recentReviews.length : 0;

      // Calculate average response time
      const avgResponseTime =
        recentReviews.length > 0
          ? recentReviews.reduce((sum, r) => sum + r.responseTime, 0) /
            recentReviews.length
          : 0;

      return {
        todayReviews,
        totalReviews,
        recentAccuracy: Math.round(recentAccuracy * 100),
        avgResponseTime: Math.round(avgResponseTime),
      };
    },
  );
}

// =============================================================================
// HELPERS
// =============================================================================

function formatInterval(days: number): string {
  if (days < 1) {
    const minutes = Math.round(days * 24 * 60);
    return `${minutes}m`;
  }
  if (days < 30) {
    return `${Math.round(days)}d`;
  }
  if (days < 365) {
    const months = Math.round(days / 30);
    return `${months}mo`;
  }
  const years = Math.round((days / 365) * 10) / 10;
  return `${years}y`;
}

// =============================================================================
// MULTI-BELONGING INTEGRATION HELPERS
// =============================================================================

/**
 * Check for performance divergence across contexts and record if significant
 */
async function checkAndRecordDivergence(
  userId: string,
  cardId: string,
): Promise<void> {
  // Get all participations with their context performance
  const participations = await prisma.cardCategoryParticipation.findMany({
    where: { cardId },
    include: {
      category: { select: { id: true, name: true } },
    },
  });

  // Need at least 2 contexts with sufficient reviews to detect divergence
  const significantContexts = participations.filter(
    (p) => p.reviewCountInContext >= 3,
  );

  if (significantContexts.length < 2) return;

  // Find best and worst performing contexts
  const sorted = [...significantContexts].sort(
    (a, b) => (b.contextSuccessRate || 0) - (a.contextSuccessRate || 0),
  );

  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const spread =
    (best.contextSuccessRate || 0) - (worst.contextSuccessRate || 0);

  // Only record if spread is significant (> 20%)
  if (spread < 0.2) return;

  // Check if we already have an active divergence for this card
  const existingDivergence = await prisma.performanceDivergence.findFirst({
    where: { userId, cardId, status: "active" },
  });

  const severity =
    spread >= 0.5 ? "severe" : spread >= 0.35 ? "moderate" : "mild";

  const contextRankings = sorted.map((p, i) => ({
    categoryId: p.categoryId,
    accuracy: p.contextSuccessRate || 0,
    rank: i + 1,
  }));

  if (existingDivergence) {
    // Update existing divergence
    await prisma.performanceDivergence.update({
      where: { id: existingDivergence.id },
      data: {
        bestContextId: best.categoryId,
        bestAccuracy: best.contextSuccessRate || 0,
        worstContextId: worst.categoryId,
        worstAccuracy: worst.contextSuccessRate || 0,
        performanceSpread: spread,
        severity,
        contextRankings,
      },
    });
  } else {
    // Create new divergence record
    await prisma.performanceDivergence.create({
      data: {
        userId,
        cardId,
        bestContextId: best.categoryId,
        bestAccuracy: best.contextSuccessRate || 0,
        worstContextId: worst.categoryId,
        worstAccuracy: worst.contextSuccessRate || 0,
        performanceSpread: spread,
        severity,
        contextRankings,
        status: "active",
        possibleCauses: [
          "Different difficulty levels across contexts",
          "Varying prerequisite knowledge",
          "Context-specific terminology",
        ],
      },
    });
  }
}

/**
 * Check if synthesis prompts should be triggered after a review
 */
async function checkSynthesisTriggers(
  userId: string,
  cardId: string,
  categoryId: string,
): Promise<void> {
  // Get participation count
  const participationCount = await prisma.cardCategoryParticipation.count({
    where: { cardId },
  });

  // Check if divergence exists
  const divergence = await prisma.performanceDivergence.findFirst({
    where: { userId, cardId, status: "active" },
  });

  // Check for pending synthesis prompts
  const pendingPrompts = await prisma.synthesisPrompt.count({
    where: {
      userId,
      cardId,
      status: { in: ["pending", "shown"] },
    },
  });

  // Don't create more prompts if there are pending ones
  if (pendingPrompts > 0) return;

  // Trigger conditions
  const shouldTrigger =
    participationCount >= 3 || // High participation count
    (divergence && divergence.severity !== "mild"); // Significant divergence

  if (!shouldTrigger) return;

  // Determine trigger type and create appropriate prompt
  let triggerType: string;
  let promptType: string;
  let promptText: string;

  if (divergence && divergence.severity !== "mild") {
    triggerType = "performance_divergence";
    promptType = "context_comparison";

    const bestContext = await prisma.category.findUnique({
      where: { id: divergence.bestContextId },
      select: { name: true },
    });
    const worstContext = await prisma.category.findUnique({
      where: { id: divergence.worstContextId },
      select: { name: true },
    });

    promptText =
      `You perform differently on this card across contexts. ` +
      `Best: "${bestContext?.name}" (${Math.round((divergence.bestAccuracy || 0) * 100)}%), ` +
      `Needs work: "${worstContext?.name}" (${Math.round((divergence.worstAccuracy || 0) * 100)}%). ` +
      `What makes this concept harder in one context vs another?`;
  } else {
    triggerType = "high_participation_count";
    promptType = "connection";
    promptText =
      `This card appears in ${participationCount} different contexts. ` +
      `How do these different perspectives connect or build on each other?`;
  }

  // Get category IDs for this card
  const categoryIds = await prisma.cardCategoryParticipation.findMany({
    where: { cardId },
    select: { categoryId: true },
  });

  // Create synthesis prompt
  await prisma.synthesisPrompt.create({
    data: {
      userId,
      cardId,
      categoryIds: categoryIds.map((c) => c.categoryId),
      triggerType,
      promptType,
      promptText,
      triggerDetails: {
        participationCount,
        currentCategoryId: categoryId,
        divergenceId: divergence?.id,
        divergenceSeverity: divergence?.severity,
      },
      status: "pending",
      alternativePrompts: [],
      hints: [],
    },
  });
}
