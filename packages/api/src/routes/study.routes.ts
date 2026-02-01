// =============================================================================
// STUDY SESSION ROUTES
// =============================================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "../config/database.js";
import { authenticate } from "../middleware/auth.js";

// =============================================================================
// SCHEMAS
// =============================================================================

const startSessionSchema = z.object({
  deckId: z.string().optional(),
  sessionType: z
    .enum(["normal", "cram", "filtered", "challenge"])
    .default("normal"),
  limit: z.number().int().min(1).max(200).optional(),
});

const endSessionSchema = z.object({
  sessionId: z.string(),
});

// =============================================================================
// ROUTES
// =============================================================================

export async function studyRoutes(app: FastifyInstance) {
  // Get study queue
  app.get(
    "/queue",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Study"],
        summary: "Get cards due for review",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;
      const { deckId, limit = 50 } = request.query as {
        deckId?: string;
        limit?: number;
      };

      const preferences = await prisma.userPreferences.findUnique({
        where: { userId },
      });

      const now = new Date();

      // Get due cards (reviews)
      const whereBase: any = {
        userId,
        flags: { isEmpty: true }, // Not suspended
      };

      if (deckId) {
        whereBase.deckId = deckId;
      }

      const [dueCards, newCards] = await Promise.all([
        // Due reviews
        prisma.card.findMany({
          where: {
            ...whereBase,
            state: { in: ["review", "relearning", "learning"] },
            nextReviewDate: { lte: now },
          },
          orderBy: { nextReviewDate: "asc" },
          take: Math.min(limit, preferences?.maxReviewsPerDay || 200),
          include: {
            deck: { select: { id: true, name: true } },
          },
        }),
        // New cards
        prisma.card.findMany({
          where: {
            ...whereBase,
            state: "new",
          },
          orderBy: { position: "asc" },
          take: Math.min(20, preferences?.newCardsPerDay || 20),
          include: {
            deck: { select: { id: true, name: true } },
          },
        }),
      ]);

      // Interleave new cards with reviews
      const queue: typeof dueCards = [];
      const newCardsToAdd = [...newCards];
      const dueCardsToAdd = [...dueCards];

      // Add 1 new card every 5 due cards
      while (dueCardsToAdd.length > 0 || newCardsToAdd.length > 0) {
        // Add up to 5 due cards
        for (let i = 0; i < 5 && dueCardsToAdd.length > 0; i++) {
          queue.push(dueCardsToAdd.shift()!);
        }

        // Add 1 new card
        if (newCardsToAdd.length > 0) {
          queue.push(newCardsToAdd.shift()!);
        }
      }

      return {
        queue: queue.slice(0, limit),
        counts: {
          new: newCards.length,
          due: dueCards.length,
          total: queue.length,
        },
      };
    },
  );

  // Start a study session
  app.post(
    "/sessions",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Study"],
        summary: "Start a new study session",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = startSessionSchema.parse(request.body);
      const userId = request.user!.id;

      const session = await prisma.studySession.create({
        data: {
          userId,
          deckId: body.deckId,
          sessionType: body.sessionType,
          startTime: new Date(),
        },
      });

      return reply.status(201).send(session);
    },
  );

  // End a study session
  app.patch<{ Params: { id: string } }>(
    "/sessions/:id/end",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Study"],
        summary: "End a study session",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.user!.id;

      const session = await prisma.studySession.findFirst({
        where: { id, userId },
        include: {
          reviews: true,
        },
      });

      if (!session) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Session not found",
        });
      }

      const now = new Date();
      const totalDuration = Math.round(
        (now.getTime() - session.startTime.getTime()) / (1000 * 60),
      );

      // Calculate stats
      const cardsStudied = session.reviews.length;
      const correctCount = session.reviews.filter((r) => r.rating >= 3).length;
      const accuracy = cardsStudied > 0 ? correctCount / cardsStudied : 0;
      const avgResponseTime =
        cardsStudied > 0
          ? Math.round(
              session.reviews.reduce((sum, r) => sum + r.responseTime, 0) /
                cardsStudied,
            )
          : 0;

      // Update session
      const updatedSession = await prisma.studySession.update({
        where: { id },
        data: {
          endTime: now,
          totalDuration,
          activeDuration: totalDuration, // Could be more precise with pause tracking
          cardsStudied,
          correctCount,
          accuracy,
          avgResponseTime,
        },
      });

      // Update user stats
      await prisma.userLearningStats.update({
        where: { userId },
        data: {
          totalStudyTime: { increment: totalDuration },
          averageAccuracy: accuracy, // Should be rolling average
          avgResponseTime,
        },
      });

      // Update streak
      const streak = await prisma.streak.findUnique({
        where: { userId_streakType: { userId, streakType: "daily" } },
      });

      if (streak) {
        const lastDate = new Date(streak.lastActivityDate);
        lastDate.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const diffDays = Math.floor(
          (today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (diffDays === 0) {
          // Same day, no update needed
        } else if (diffDays === 1) {
          // Consecutive day
          await prisma.streak.update({
            where: { id: streak.id },
            data: {
              currentCount: streak.currentCount + 1,
              longestStreak: Math.max(
                streak.longestStreak,
                streak.currentCount + 1,
              ),
              lastActivityDate: now,
            },
          });

          await prisma.userLearningStats.update({
            where: { userId },
            data: {
              currentStreak: streak.currentCount + 1,
              longestStreak: Math.max(
                streak.longestStreak,
                streak.currentCount + 1,
              ),
            },
          });
        } else {
          // Streak broken
          await prisma.streak.update({
            where: { id: streak.id },
            data: {
              currentCount: 1,
              lastActivityDate: now,
            },
          });

          await prisma.userLearningStats.update({
            where: { userId },
            data: { currentStreak: 1 },
          });
        }
      }

      // Check for perfect session achievement
      if (accuracy === 1 && cardsStudied >= 20) {
        await prisma.userLearningStats.update({
          where: { userId },
          data: { perfectSessions: { increment: 1 } },
        });
      }

      return updatedSession;
    },
  );

  // Get session history
  app.get(
    "/sessions",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Study"],
        summary: "Get study session history",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;
      const { limit = 20, offset = 0 } = request.query as {
        limit?: number;
        offset?: number;
      };

      const [sessions, total] = await Promise.all([
        prisma.studySession.findMany({
          where: { userId },
          orderBy: { startTime: "desc" },
          take: limit,
          skip: offset,
          include: {
            deck: { select: { id: true, name: true } },
          },
        }),
        prisma.studySession.count({ where: { userId } }),
      ]);

      return {
        data: sessions,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      };
    },
  );

  // Get today's progress
  app.get(
    "/today",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Study"],
        summary: "Get today's study progress",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const preferences = await prisma.userPreferences.findUnique({
        where: { userId },
      });

      const [todayReviews, todayXP, remainingNew, remainingDue] =
        await Promise.all([
          prisma.reviewRecord.count({
            where: {
              userId,
              createdAt: { gte: today },
            },
          }),
          prisma.xPTransaction.aggregate({
            where: {
              userId,
              createdAt: { gte: today },
            },
            _sum: { amount: true },
          }),
          prisma.card.count({
            where: {
              userId,
              state: "new",
              flags: { isEmpty: true },
            },
          }),
          prisma.card.count({
            where: {
              userId,
              state: { in: ["review", "learning", "relearning"] },
              nextReviewDate: { lte: new Date() },
              flags: { isEmpty: true },
            },
          }),
        ]);

      const dailyGoal = preferences?.dailyGoal || 50;
      const goalProgress = Math.min(
        100,
        Math.round((todayReviews / dailyGoal) * 100),
      );

      return {
        reviewsCompleted: todayReviews,
        dailyGoal,
        goalProgress,
        xpEarned: todayXP._sum.amount || 0,
        remainingNew,
        remainingDue,
        totalRemaining: remainingNew + remainingDue,
      };
    },
  );
}
