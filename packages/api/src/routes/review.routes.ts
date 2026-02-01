// =============================================================================
// REVIEW ROUTES
// =============================================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import {
  createScheduler,
  createGamificationManager,
  type Rating,
  type SchedulerType,
} from '@manthanein/shared';

// =============================================================================
// SCHEMAS
// =============================================================================

const reviewCardSchema = z.object({
  cardId: z.string(),
  rating: z.number().int().min(1).max(4) as z.ZodType<Rating>,
  responseTimeMs: z.number().int().min(0),
  confidenceBefore: z.number().min(0).max(1).optional(),
  studySessionId: z.string().optional(),
});

const previewIntervalsSchema = z.object({
  cardId: z.string(),
});

// =============================================================================
// ROUTES
// =============================================================================

export async function reviewRoutes(app: FastifyInstance) {
  // Review a card
  app.post('/', {
    onRequest: [authenticate],
    schema: {
      tags: ['Reviews'],
      summary: 'Submit a card review',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = reviewCardSchema.parse(request.body);
    const userId = request.user!.id;
    
    // Get card
    const card = await prisma.card.findFirst({
      where: { id: body.cardId, userId },
      include: { deck: true },
    });
    
    if (!card) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Card not found',
      });
    }
    
    // Get user preferences for scheduler type
    const preferences = await prisma.userPreferences.findUnique({
      where: { userId },
    });
    
    const schedulerType = (preferences?.schedulerType || 'fsrs') as SchedulerType;
    const schedulerConfig = preferences?.schedulerConfig || {};
    
    // Create scheduler
    const scheduler = createScheduler(schedulerType, schedulerConfig as any);
    
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
    
    const result = scheduler.schedule(currentState, body.rating);
    
    // Determine new state
    let newState = card.state;
    if (body.rating === 1) {
      newState = card.state === 'new' ? 'learning' : 'relearning';
    } else if (card.state === 'new' || card.state === 'learning') {
      newState = body.rating >= 3 ? 'review' : 'learning';
    } else if (card.state === 'relearning') {
      newState = body.rating >= 3 ? 'review' : 'relearning';
    } else if (result.interval > 21 && card.correctReviews > 5) {
      newState = 'mastered';
    }
    
    const now = new Date();
    const nextReviewDate = new Date(now.getTime() + result.interval * 24 * 60 * 60 * 1000);
    
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
        correctReviews: body.rating >= 3 ? card.correctReviews + 1 : card.correctReviews,
        averageTime: Math.round(
          (card.averageTime * card.totalReviews + body.responseTimeMs) / (card.totalReviews + 1)
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
    const currentCombo = parseInt(await redis.get(comboKey) || '0', 10);
    
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
      }
    );
    
    // Update combo
    if (gamificationResult.comboUpdate.comboLost) {
      await redis.del(comboKey);
    } else {
      await redis.setex(comboKey, 300, gamificationResult.comboUpdate.newCombo.toString()); // 5 min expiry
    }
    
    // Record XP if earned
    let xpEarned = 0;
    if (gamificationResult.xpTransaction) {
      xpEarned = gamificationResult.xpTransaction.amount;
      
      await prisma.xPTransaction.create({
        data: {
          userId,
          amount: xpEarned,
          source: 'card_review',
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
        newMetaLearningUnlocks: gamificationResult.newMetaLearningUnlocks.map((u) => ({
          id: u.id,
          name: u.name,
        })),
      },
    };
  });
  
  // Preview intervals for all ratings
  app.get('/preview/:cardId', {
    onRequest: [authenticate],
    schema: {
      tags: ['Reviews'],
      summary: 'Preview intervals for each rating option',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{ Params: { cardId: string } }>, reply: FastifyReply) => {
    const { cardId } = request.params;
    const userId = request.user!.id;
    
    const card = await prisma.card.findFirst({
      where: { id: cardId, userId },
    });
    
    if (!card) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Card not found',
      });
    }
    
    const preferences = await prisma.userPreferences.findUnique({
      where: { userId },
    });
    
    const schedulerType = (preferences?.schedulerType || 'fsrs') as SchedulerType;
    const scheduler = createScheduler(schedulerType, preferences?.schedulerConfig as any);
    
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
    const previews = [1, 2, 3, 4].map((rating) => {
      const result = scheduler.schedule(currentState, rating as Rating);
      return {
        rating,
        ratingName: ['Again', 'Hard', 'Good', 'Easy'][rating - 1],
        interval: result.interval,
        intervalFormatted: formatInterval(result.interval),
        retrievability: result.retrievability,
      };
    });
    
    return { previews };
  });
  
  // Get review statistics
  app.get('/stats', {
    onRequest: [authenticate],
    schema: {
      tags: ['Reviews'],
      summary: 'Get review statistics',
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
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
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    
    // Calculate accuracy
    const correctCount = recentReviews.filter((r) => r.rating >= 3).length;
    const recentAccuracy = recentReviews.length > 0 
      ? correctCount / recentReviews.length 
      : 0;
    
    // Calculate average response time
    const avgResponseTime = recentReviews.length > 0
      ? recentReviews.reduce((sum, r) => sum + r.responseTime, 0) / recentReviews.length
      : 0;
    
    return {
      todayReviews,
      totalReviews,
      recentAccuracy: Math.round(recentAccuracy * 100),
      avgResponseTime: Math.round(avgResponseTime),
    };
  });
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
  const years = Math.round(days / 365 * 10) / 10;
  return `${years}y`;
}
