// =============================================================================
// GAMIFICATION ROUTES
// =============================================================================

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "../config/database.js";
import { authenticate } from "../middleware/auth.js";
import {
  XPEngine,
  AchievementEngine,
  SkillTreeEngine,
  CalibrationEngine,
  ChallengeEngine,
  MetaLearningEngine,
  ACHIEVEMENTS,
  DEFAULT_SKILL_TREES,
  META_LEARNING_UNLOCKS,
} from "@manthanein/shared";

// =============================================================================
// ROUTES
// =============================================================================

export async function gamificationRoutes(app: FastifyInstance) {
  // Get XP and level info
  app.get(
    "/xp",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Gamification"],
        summary: "Get XP and level information",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      const stats = await prisma.userLearningStats.findUnique({
        where: { userId },
        select: { totalXP: true, level: true },
      });

      const xpEngine = new XPEngine();
      const levelInfo = xpEngine.calculateLevel(stats?.totalXP || 0);

      return {
        totalXP: stats?.totalXP || 0,
        level: levelInfo.level,
        currentLevelXP: levelInfo.currentLevelXP,
        nextLevelXP: levelInfo.nextLevelXP,
        progressPercent: Math.round(
          (levelInfo.currentLevelXP / levelInfo.nextLevelXP) * 100,
        ),
      };
    },
  );

  // Get XP transaction history
  app.get(
    "/xp/history",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Gamification"],
        summary: "Get XP transaction history",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;
      const { limit = 50, offset = 0 } = request.query as {
        limit?: number;
        offset?: number;
      };

      const [transactions, total] = await Promise.all([
        prisma.xPTransaction.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.xPTransaction.count({ where: { userId } }),
      ]);

      return {
        data: transactions,
        pagination: { total, limit, offset, hasMore: offset + limit < total },
      };
    },
  );

  // Get all achievements with progress
  app.get(
    "/achievements",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Gamification"],
        summary: "Get all achievements with progress",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      const [userAchievements, stats] = await Promise.all([
        prisma.userAchievement.findMany({
          where: { userId },
          select: { achievementId: true, unlockedAt: true },
        }),
        prisma.userLearningStats.findUnique({ where: { userId } }),
      ]);

      const unlockedMap = new Map(
        userAchievements.map((a) => [a.achievementId, a.unlockedAt]),
      );

      const achievementEngine = new AchievementEngine();

      const achievements = ACHIEVEMENTS.map((achievement) => {
        const unlocked = unlockedMap.has(achievement.id);
        const progress = unlocked
          ? { percentComplete: 100, currentValue: 0, targetValue: 0 }
          : achievementEngine.getProgress(achievement.id, stats as any);

        return {
          ...achievement,
          isUnlocked: unlocked,
          unlockedAt: unlockedMap.get(achievement.id) || null,
          progress,
        };
      });

      // Group by category
      const grouped = achievements.reduce(
        (acc, a) => {
          if (!acc[a.category]) acc[a.category] = [];
          acc[a.category].push(a);
          return acc;
        },
        {} as Record<string, typeof achievements>,
      );

      return {
        achievements,
        grouped,
        stats: {
          total: achievements.length,
          unlocked: userAchievements.length,
          percentComplete: Math.round(
            (userAchievements.length / achievements.length) * 100,
          ),
        },
      };
    },
  );

  // Get streak info
  app.get(
    "/streak",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Gamification"],
        summary: "Get streak information",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      const streak = await prisma.streak.findUnique({
        where: { userId_streakType: { userId, streakType: "daily" } },
      });

      if (!streak) {
        return {
          currentStreak: 0,
          longestStreak: 0,
          lastActivityDate: null,
          isAtRisk: false,
          hoursRemaining: 0,
          freezeCount: 0,
        };
      }

      // Check if at risk
      const lastDate = new Date(streak.lastActivityDate);
      const deadline = new Date(lastDate);
      deadline.setDate(deadline.getDate() + 1);
      deadline.setHours(12, 0, 0, 0); // Grace period until noon

      const now = new Date();
      const hoursRemaining = Math.max(
        0,
        (deadline.getTime() - now.getTime()) / (1000 * 60 * 60),
      );
      const isAtRisk = hoursRemaining > 0 && hoursRemaining <= 6;

      return {
        currentStreak: streak.currentCount,
        longestStreak: streak.longestStreak,
        lastActivityDate: streak.lastActivityDate,
        isAtRisk,
        hoursRemaining: Math.round(hoursRemaining * 10) / 10,
        freezeCount: streak.freezeCount,
      };
    },
  );

  // Use streak freeze
  app.post(
    "/streak/freeze",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Gamification"],
        summary: "Use a streak freeze",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      const streak = await prisma.streak.findUnique({
        where: { userId_streakType: { userId, streakType: "daily" } },
      });

      if (!streak || streak.freezeCount <= 0) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "No streak freezes available",
        });
      }

      await prisma.streak.update({
        where: { id: streak.id },
        data: {
          freezeCount: streak.freezeCount - 1,
          lastFreezeUsed: new Date(),
          lastActivityDate: new Date(), // Extend the streak
        },
      });

      return {
        message: "Streak freeze used",
        remainingFreezes: streak.freezeCount - 1,
      };
    },
  );

  // Get skill trees
  app.get(
    "/skills",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Gamification"],
        summary: "Get skill trees with progress",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      const userProgress = await prisma.userSkillProgress.findMany({
        where: { userId },
      });

      const progressMap = new Map(
        userProgress.map((p) => [`${p.treeId}:${p.nodeId}`, p]),
      );

      const skillTreeEngine = new SkillTreeEngine();

      const trees = DEFAULT_SKILL_TREES.map((tree) => ({
        ...tree,
        nodes: tree.nodes.map((node) => {
          const progress = progressMap.get(`${tree.id}:${node.id}`);
          return {
            ...node,
            level: progress?.level || 0,
            xpInvested: progress?.xpInvested || 0,
            unlockedAt: progress?.unlockedAt || null,
          };
        }),
      }));

      return { trees };
    },
  );

  // Upgrade a skill node
  app.post<{ Params: { treeId: string; nodeId: string } }>(
    "/skills/:treeId/:nodeId/upgrade",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Gamification"],
        summary: "Upgrade a skill node",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { treeId, nodeId } = request.params;
      const userId = request.user!.id;

      const stats = await prisma.userLearningStats.findUnique({
        where: { userId },
        select: { totalXP: true },
      });

      const userProgress = await prisma.userSkillProgress.findMany({
        where: { userId },
      });

      const skillTreeEngine = new SkillTreeEngine();
      const unlockedNodes = userProgress
        .filter((p) => p.level > 0)
        .map((p) => p.nodeId as any);

      const result = skillTreeEngine.upgradeNode(
        treeId,
        nodeId as any,
        stats?.totalXP || 0,
        unlockedNodes,
      );

      if (!result.success) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Cannot upgrade this skill",
        });
      }

      // Update or create skill progress
      await prisma.userSkillProgress.upsert({
        where: {
          userId_treeId_nodeId: { userId, treeId, nodeId },
        },
        update: {
          level: { increment: 1 },
          xpInvested: { increment: result.xpSpent },
          unlockedAt: new Date(),
        },
        create: {
          userId,
          treeId,
          nodeId,
          level: 1,
          xpInvested: result.xpSpent,
          unlockedAt: new Date(),
        },
      });

      // Deduct XP (skills cost XP to unlock)
      // Note: In some implementations, XP is not spent but used as a threshold

      return {
        success: true,
        xpSpent: result.xpSpent,
        effects: result.effects,
      };
    },
  );

  // Get daily challenges
  app.get(
    "/challenges",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Gamification"],
        summary: "Get active challenges",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      const now = new Date();

      const [activeChallenges, stats] = await Promise.all([
        prisma.userChallenge.findMany({
          where: {
            userId,
            endDate: { gte: now },
            isComplete: false,
          },
        }),
        prisma.userLearningStats.findUnique({ where: { userId } }),
      ]);

      // Generate new challenges if none exist for today
      if (activeChallenges.length === 0) {
        const challengeEngine = new ChallengeEngine();
        const xpEngine = new XPEngine();

        const levelInfo = xpEngine.calculateLevel(stats?.totalXP || 0);

        const dailyChallenges = challengeEngine.generateDailyChallenges(
          stats as any,
          levelInfo.level,
        );

        const weeklyChallenge = challengeEngine.generateWeeklyChallenge(
          stats as any,
          levelInfo.level,
        );

        // Store new challenges
        for (const challenge of [...dailyChallenges, weeklyChallenge]) {
          await prisma.userChallenge.create({
            data: {
              userId,
              challengeId: challenge.id,
              challengeData: challenge as any,
              startDate: challenge.startDate,
              endDate: challenge.endDate,
            },
          });
        }

        return {
          daily: dailyChallenges,
          weekly: weeklyChallenge,
        };
      }

      const daily = activeChallenges.filter(
        (c) => (c.challengeData as any).type === "daily",
      );
      const weekly = activeChallenges.find(
        (c) => (c.challengeData as any).type === "weekly",
      );

      return {
        daily: daily.map((c) => ({
          ...(c.challengeData as any),
          progress: c.progress,
          isComplete: c.isComplete,
        })),
        weekly: weekly
          ? {
              ...(weekly.challengeData as any),
              progress: weekly.progress,
              isComplete: weekly.isComplete,
            }
          : null,
      };
    },
  );

  // Get calibration score
  app.get(
    "/calibration",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Gamification"],
        summary: "Get calibration score (self-assessment accuracy)",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      // Get recent reviews with confidence ratings
      const reviews = await prisma.reviewRecord.findMany({
        where: {
          userId,
          confidenceBefore: { not: null },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          confidenceBefore: true,
          rating: true,
          card: { select: { difficulty: true } },
        },
      });

      if (reviews.length < 10) {
        return {
          score: null,
          message:
            "Need at least 10 confidence-rated reviews to calculate calibration",
          sampleSize: reviews.length,
        };
      }

      const calibrationEngine = new CalibrationEngine();

      const calibrationData = reviews.map((r) => ({
        confidenceBefore: r.confidenceBefore!,
        recalled: r.rating >= 3,
        cardDifficulty: r.card.difficulty,
      }));

      const calibrationScore =
        calibrationEngine.calculateCalibrationScore(calibrationData);

      return calibrationScore;
    },
  );

  // Get memory integrity score
  app.get(
    "/memory-integrity",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Gamification"],
        summary: "Get memory integrity score",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      const stats = await prisma.userLearningStats.findUnique({
        where: { userId },
      });

      if (!stats) {
        return { score: 50, trend: "stable", factors: [] };
      }

      // Calculate consistency from sessions
      const recentSessions = await prisma.studySession.findMany({
        where: {
          userId,
          endTime: { not: null },
        },
        orderBy: { startTime: "desc" },
        take: 30,
      });

      // Calculate review consistency (days with reviews / 30)
      const uniqueDays = new Set(
        recentSessions.map((s) => s.startTime.toISOString().split("T")[0]),
      ).size;
      const reviewConsistency = uniqueDays / 30;

      // Get average stability from cards
      const avgStability = await prisma.card.aggregate({
        where: { userId, state: { not: "new" } },
        _avg: { stability: true },
      });

      const calibrationEngine = new CalibrationEngine();

      const memoryIntegrity = calibrationEngine.calculateMemoryIntegrity({
        retentionRate: stats.retentionRate,
        reviewConsistency,
        masteredRatio:
          stats.totalCards > 0 ? stats.masteredCards / stats.totalCards : 0,
        avgStability: avgStability._avg.stability || 0,
        recallVariance: 0.1, // Would need to calculate from review variance
      });

      return memoryIntegrity;
    },
  );

  // Get meta-learning unlocks
  app.get(
    "/meta-learning",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Gamification"],
        summary: "Get meta-learning unlocks",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user!.id;

      const [userUnlocks, stats] = await Promise.all([
        prisma.userMetaLearningUnlock.findMany({
          where: { userId },
          select: { unlockId: true, unlockedAt: true },
        }),
        prisma.userLearningStats.findUnique({ where: { userId } }),
      ]);

      const unlockedIds = userUnlocks.map((u) => u.unlockId);
      const unlockedMap = new Map(
        userUnlocks.map((u) => [u.unlockId, u.unlockedAt]),
      );

      const metaLearningEngine = new MetaLearningEngine();
      const allUnlocks = metaLearningEngine.getAllUnlocks(unlockedIds);

      return {
        unlocks: allUnlocks.map((u) => ({
          ...u,
          unlockedAt: unlockedMap.get(u.id) || null,
        })),
        stats: {
          total: allUnlocks.length,
          unlocked: userUnlocks.length,
        },
      };
    },
  );

  // Get leaderboard
  app.get<{ Params: { type: string } }>(
    "/leaderboard/:type",
    {
      onRequest: [authenticate],
      schema: {
        tags: ["Gamification"],
        summary: "Get leaderboard",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { type } = request.params;
      const userId = request.user!.id;

      // Validate type
      const validTypes = ["xp", "streak", "mastery", "reviews"];
      if (!validTypes.includes(type)) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Invalid leaderboard type",
        });
      }

      const orderByField = {
        xp: "totalXP",
        streak: "currentStreak",
        mastery: "masteredCards",
        reviews: "totalReviews",
      }[type] as string;

      // Get top 100
      const topUsers = await prisma.userLearningStats.findMany({
        orderBy: { [orderByField]: "desc" },
        take: 100,
        include: {
          user: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
        },
      });

      // Get current user's rank
      const userStats = await prisma.userLearningStats.findUnique({
        where: { userId },
      });

      let userRank = -1;
      if (userStats) {
        const higherCount = await prisma.userLearningStats.count({
          where: {
            [orderByField]: { gt: (userStats as any)[orderByField] },
          },
        });
        userRank = higherCount + 1;
      }

      return {
        type,
        leaderboard: topUsers.map((stats, index) => ({
          rank: index + 1,
          userId: stats.user.id,
          displayName: stats.user.displayName,
          avatarUrl: stats.user.avatarUrl,
          score: (stats as any)[orderByField],
        })),
        currentUser: {
          rank: userRank,
          score: userStats ? (userStats as any)[orderByField] : 0,
        },
      };
    },
  );
}
