// =============================================================================
// GRAPHQL RESOLVERS
// =============================================================================

import { prisma } from "../../config/database.js";
import { redis } from "../../config/redis.js";
import { env } from "../../config/env.js";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import {
  createScheduler,
  createGamificationManager,
  XPEngine,
  type Rating,
  type NumericRating,
  toRating,
} from "@manthanein/shared";

// Context type for resolvers
interface Context {
  user?: { id: string; email: string };
  prisma: typeof prisma;
  app?: any; // Fastify app for JWT signing
}

// Helper to require authentication
function requireAuth(context: Context) {
  if (!context.user) {
    throw new Error("Authentication required");
  }
  return context.user;
}

// Auth helpers
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function generateRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

export const resolvers = {
  // ==========================================================================
  // QUERY RESOLVERS
  // ==========================================================================
  Query: {
    // User
    me: async (_: any, __: any, context: Context) => {
      const user = requireAuth(context);
      return prisma.user.findUnique({
        where: { id: user.id },
        include: {
          preferences: true,
          learningStats: true,
          cognitiveProfile: true,
        },
      });
    },

    // Decks
    decks: async (
      _: any,
      args: { limit?: number; offset?: number; parentDeckId?: string },
      context: Context,
    ) => {
      const user = requireAuth(context);
      const { limit = 20, offset = 0, parentDeckId } = args;

      const where: any = { userId: user.id };
      if (parentDeckId !== undefined) {
        where.parentDeckId = parentDeckId || null;
      }

      const [data, total] = await Promise.all([
        prisma.deck.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { name: "asc" },
        }),
        prisma.deck.count({ where }),
      ]);

      return {
        data,
        pagination: { total, limit, offset, hasMore: offset + limit < total },
      };
    },

    deck: async (_: any, args: { id: string }, context: Context) => {
      const user = requireAuth(context);
      return prisma.deck.findFirst({
        where: { id: args.id, OR: [{ userId: user.id }, { isPublic: true }] },
      });
    },

    // Cards
    cards: async (
      _: any,
      args: {
        deckId?: string;
        limit?: number;
        offset?: number;
        state?: string;
      },
      context: Context,
    ) => {
      const user = requireAuth(context);
      const { deckId, limit = 20, offset = 0, state } = args;

      const where: any = { userId: user.id };
      if (deckId) where.deckId = deckId;
      if (state) where.state = state;

      const [data, total] = await Promise.all([
        prisma.card.findMany({ where, take: limit, skip: offset }),
        prisma.card.count({ where }),
      ]);

      return {
        data,
        pagination: { total, limit, offset, hasMore: offset + limit < total },
      };
    },

    card: async (_: any, args: { id: string }, context: Context) => {
      const user = requireAuth(context);
      return prisma.card.findFirst({
        where: { id: args.id, userId: user.id },
        include: { deck: true, media: true },
      });
    },

    // Study
    studyQueue: async (
      _: any,
      args: { deckId?: string; limit?: number },
      context: Context,
    ) => {
      const user = requireAuth(context);
      const { deckId, limit = 50 } = args;

      const where: any = { userId: user.id, flags: { isEmpty: true } };
      if (deckId) where.deckId = deckId;

      const [dueCards, newCards] = await Promise.all([
        prisma.card.findMany({
          where: {
            ...where,
            state: { in: ["review", "learning", "relearning"] },
            nextReviewDate: { lte: new Date() },
          },
          take: limit,
        }),
        prisma.card.findMany({
          where: { ...where, state: "new" },
          take: 20,
        }),
      ]);

      return {
        queue: [...dueCards, ...newCards].slice(0, limit),
        counts: {
          new: newCards.length,
          due: dueCards.length,
          total: dueCards.length + newCards.length,
        },
      };
    },

    todayProgress: async (_: any, __: any, context: Context) => {
      const user = requireAuth(context);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [reviewsCompleted, xpResult, preferences] = await Promise.all([
        prisma.reviewRecord.count({
          where: { userId: user.id, createdAt: { gte: today } },
        }),
        prisma.xPTransaction.aggregate({
          where: { userId: user.id, createdAt: { gte: today } },
          _sum: { amount: true },
        }),
        prisma.userPreferences.findUnique({ where: { userId: user.id } }),
      ]);

      const dailyGoal = preferences?.dailyGoal || 50;

      return {
        reviewsCompleted,
        dailyGoal,
        goalProgress: Math.min(
          100,
          Math.round((reviewsCompleted / dailyGoal) * 100),
        ),
        xpEarned: xpResult._sum.amount || 0,
        remainingNew: 0,
        remainingDue: 0,
        totalRemaining: 0,
      };
    },

    // Gamification
    xpInfo: async (_: any, __: any, context: Context) => {
      const user = requireAuth(context);
      const stats = await prisma.userLearningStats.findUnique({
        where: { userId: user.id },
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

    achievements: async (_: any, __: any, context: Context) => {
      const user = requireAuth(context);

      const [userAchievements, stats] = await Promise.all([
        prisma.userAchievement.findMany({ where: { userId: user.id } }),
        prisma.userLearningStats.findUnique({ where: { userId: user.id } }),
      ]);

      const { ACHIEVEMENTS, AchievementEngine } =
        await import("@manthanein/shared");
      const engine = new AchievementEngine();
      const unlockedIds = userAchievements.map((a) => a.achievementId);

      const achievements = ACHIEVEMENTS.map((a) => ({
        ...a,
        isUnlocked: unlockedIds.includes(a.id),
        unlockedAt:
          userAchievements.find((ua) => ua.achievementId === a.id)
            ?.unlockedAt || null,
        progress: unlockedIds.includes(a.id)
          ? null
          : engine.getProgress(a.id, stats as any),
      }));

      return {
        achievements,
        stats: {
          total: ACHIEVEMENTS.length,
          unlocked: userAchievements.length,
          percentComplete: Math.round(
            (userAchievements.length / ACHIEVEMENTS.length) * 100,
          ),
        },
      };
    },

    streak: async (_: any, __: any, context: Context) => {
      const user = requireAuth(context);
      const streak = await prisma.streak.findUnique({
        where: { userId_streakType: { userId: user.id, streakType: "daily" } },
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

      return {
        currentStreak: streak.currentCount,
        longestStreak: streak.longestStreak,
        lastActivityDate: streak.lastActivityDate,
        isAtRisk: false,
        hoursRemaining: 24,
        freezeCount: streak.freezeCount,
      };
    },

    skillTrees: async (_: any, __: any, context: Context) => {
      const user = requireAuth(context);
      const { DEFAULT_SKILL_TREES } = await import("@manthanein/shared");

      const progress = await prisma.userSkillProgress.findMany({
        where: { userId: user.id },
      });
      const progressMap = new Map(
        progress.map((p) => [`${p.treeId}:${p.nodeId}`, p]),
      );

      return DEFAULT_SKILL_TREES.map((tree) => ({
        ...tree,
        nodes: tree.nodes.map((node) => {
          const p = progressMap.get(`${tree.id}:${node.id}`);
          return {
            ...node,
            level: p?.level || 0,
            unlockedAt: p?.unlockedAt || null,
          };
        }),
      }));
    },

    calibrationScore: async (_: any, __: any, context: Context) => {
      const user = requireAuth(context);
      const reviews = await prisma.reviewRecord.findMany({
        where: { userId: user.id, confidenceBefore: { not: null } },
        take: 100,
        include: { card: { select: { difficulty: true } } },
      });

      if (reviews.length < 10) return null;

      const { CalibrationEngine } = await import("@manthanein/shared");
      const engine = new CalibrationEngine();

      return engine.calculateCalibrationScore(
        reviews.map((r) => ({
          confidenceBefore: r.confidenceBefore!,
          recalled: r.rating >= 3,
          cardDifficulty: r.card.difficulty,
        })),
      );
    },

    memoryIntegrity: async (_: any, __: any, context: Context) => {
      const user = requireAuth(context);
      const stats = await prisma.userLearningStats.findUnique({
        where: { userId: user.id },
      });

      return {
        score: stats?.memoryIntegrityScore || 50,
        trend: "stable",
        factors: [],
      };
    },

    leaderboard: async (
      _: any,
      args: { type: string; limit?: number },
      context: Context,
    ) => {
      requireAuth(context);
      const { type, limit = 100 } = args;

      const fieldMap: Record<string, string> = {
        xp: "totalXP",
        streak: "currentStreak",
        mastery: "masteredCards",
        reviews: "totalReviews",
      };

      const orderField = fieldMap[type] || "totalXP";

      const entries = await prisma.userLearningStats.findMany({
        orderBy: { [orderField]: "desc" },
        take: limit,
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      });

      return {
        type,
        entries: entries.map((e, i) => ({
          rank: i + 1,
          userId: e.user.id,
          displayName: e.user.displayName,
          avatarUrl: e.user.avatarUrl,
          score: (e as any)[orderField],
        })),
        currentUser: { rank: -1, score: 0 },
      };
    },

    // Plugins
    plugins: async (
      _: any,
      args: { category?: string; limit?: number; offset?: number },
    ) => {
      const { category, limit = 20, offset = 0 } = args;
      const where: any = {};
      if (category) where.category = category;

      const [data, total] = await Promise.all([
        prisma.plugin.findMany({ where, take: limit, skip: offset }),
        prisma.plugin.count({ where }),
      ]);

      return {
        data,
        pagination: { total, limit, offset, hasMore: offset + limit < total },
      };
    },

    installedPlugins: async (_: any, __: any, context: Context) => {
      const user = requireAuth(context);
      return prisma.userPlugin.findMany({
        where: { userId: user.id },
        include: { plugin: true },
      });
    },
  },

  // ==========================================================================
  // MUTATION RESOLVERS
  // ==========================================================================
  Mutation: {
    // Auth mutations
    register: async (
      _: any,
      args: { input: { email: string; password: string; displayName: string } },
      context: Context,
    ) => {
      const { email, password, displayName } = args.input;

      // Check if email exists
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        throw new Error("Email already registered");
      }

      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: await hashPassword(password),
          displayName,
          preferences: { create: {} },
          learningStats: { create: {} },
          cognitiveProfile: { create: {} },
          streaks: {
            create: {
              streakType: "daily",
              lastActivityDate: new Date(),
            },
          },
        },
        select: { id: true, email: true, displayName: true, avatarUrl: true },
      });

      // Generate tokens
      const accessToken = context.app.jwt.sign(
        { id: user.id, email: user.email },
        { expiresIn: env.JWT_EXPIRY },
      );
      const refreshToken = generateRefreshToken();

      // Store refresh token
      await redis.setex(`refresh:${refreshToken}`, 30 * 24 * 60 * 60, user.id);

      return { user, accessToken, refreshToken };
    },

    login: async (
      _: any,
      args: { input: { email: string; password: string } },
      context: Context,
    ) => {
      const { email, password } = args.input;

      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          passwordHash: true,
          isActive: true,
        },
      });

      if (!user || !user.passwordHash) {
        throw new Error("Invalid email or password");
      }

      if (!user.isActive) {
        throw new Error("Account is deactivated");
      }

      // Verify password
      if (!(await verifyPassword(password, user.passwordHash))) {
        throw new Error("Invalid email or password");
      }

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Generate tokens
      const accessToken = context.app.jwt.sign(
        { id: user.id, email: user.email },
        { expiresIn: env.JWT_EXPIRY },
      );
      const refreshToken = generateRefreshToken();

      // Store refresh token
      await redis.setex(`refresh:${refreshToken}`, 30 * 24 * 60 * 60, user.id);

      return {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        },
        accessToken,
        refreshToken,
      };
    },

    refreshToken: async (
      _: any,
      args: { refreshToken: string },
      context: Context,
    ) => {
      const { refreshToken } = args;

      // Verify refresh token
      const userId = await redis.get(`refresh:${refreshToken}`);
      if (!userId) {
        throw new Error("Invalid refresh token");
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Delete old refresh token
      await redis.del(`refresh:${refreshToken}`);

      // Generate new tokens
      const newAccessToken = context.app.jwt.sign(
        { id: user.id, email: user.email },
        { expiresIn: env.JWT_EXPIRY },
      );
      const newRefreshToken = generateRefreshToken();

      // Store new refresh token
      await redis.setex(
        `refresh:${newRefreshToken}`,
        30 * 24 * 60 * 60,
        user.id,
      );

      return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    },

    updateProfile: async (_: any, args: { input: any }, context: Context) => {
      const user = requireAuth(context);
      return prisma.user.update({ where: { id: user.id }, data: args.input });
    },

    updatePreferences: async (
      _: any,
      args: { input: any },
      context: Context,
    ) => {
      const user = requireAuth(context);
      return prisma.userPreferences.update({
        where: { userId: user.id },
        data: args.input,
      });
    },

    createDeck: async (_: any, args: { input: any }, context: Context) => {
      const user = requireAuth(context);
      return prisma.deck.create({ data: { ...args.input, userId: user.id } });
    },

    updateDeck: async (
      _: any,
      args: { id: string; input: any },
      context: Context,
    ) => {
      const user = requireAuth(context);
      const deck = await prisma.deck.findFirst({
        where: { id: args.id, userId: user.id },
      });
      if (!deck) throw new Error("Deck not found");
      return prisma.deck.update({ where: { id: args.id }, data: args.input });
    },

    deleteDeck: async (_: any, args: { id: string }, context: Context) => {
      const user = requireAuth(context);
      const deck = await prisma.deck.findFirst({
        where: { id: args.id, userId: user.id },
      });
      if (!deck) throw new Error("Deck not found");
      await prisma.deck.delete({ where: { id: args.id } });
      return true;
    },

    shareDeck: async (_: any, args: { id: string }, context: Context) => {
      const user = requireAuth(context);
      const deck = await prisma.deck.findFirst({
        where: { id: args.id, userId: user.id },
      });
      if (!deck) throw new Error("Deck not found");

      const shareCode = deck.shareCode || crypto.randomUUID().substring(0, 8);
      await prisma.deck.update({
        where: { id: args.id },
        data: { shareCode, isPublic: true },
      });

      return { shareCode, shareUrl: `/decks/shared/${shareCode}` };
    },

    cloneDeck: async (
      _: any,
      args: { shareCode: string },
      context: Context,
    ) => {
      const user = requireAuth(context);
      const source = await prisma.deck.findUnique({
        where: { shareCode: args.shareCode },
        include: { cards: true },
      });
      if (!source || !source.isPublic) throw new Error("Deck not found");

      return prisma.deck.create({
        data: {
          userId: user.id,
          name: source.name,
          description: source.description,
          tags: source.tags,
        },
      });
    },

    createCard: async (_: any, args: { input: any }, context: Context) => {
      const user = requireAuth(context);
      const deck = await prisma.deck.findFirst({
        where: { id: args.input.deckId, userId: user.id },
      });
      if (!deck) throw new Error("Deck not found");

      return prisma.card.create({ data: { ...args.input, userId: user.id } });
    },

    createCards: async (_: any, args: { input: any }, context: Context) => {
      const user = requireAuth(context);
      const { deckId, cards } = args.input;

      const deck = await prisma.deck.findFirst({
        where: { id: deckId, userId: user.id },
      });
      if (!deck) throw new Error("Deck not found");

      const result = await prisma.card.createMany({
        data: cards.map((c: any) => ({ ...c, deckId, userId: user.id })),
      });

      return { created: result.count };
    },

    updateCard: async (
      _: any,
      args: { id: string; input: any },
      context: Context,
    ) => {
      const user = requireAuth(context);
      const card = await prisma.card.findFirst({
        where: { id: args.id, userId: user.id },
      });
      if (!card) throw new Error("Card not found");

      return prisma.card.update({ where: { id: args.id }, data: args.input });
    },

    deleteCard: async (_: any, args: { id: string }, context: Context) => {
      const user = requireAuth(context);
      const card = await prisma.card.findFirst({
        where: { id: args.id, userId: user.id },
      });
      if (!card) throw new Error("Card not found");

      await prisma.card.delete({ where: { id: args.id } });
      return true;
    },

    suspendCard: async (_: any, args: { id: string }, context: Context) => {
      const user = requireAuth(context);
      const card = await prisma.card.findFirst({
        where: { id: args.id, userId: user.id },
      });
      if (!card) throw new Error("Card not found");

      return prisma.card.update({
        where: { id: args.id },
        data: { flags: { push: "suspended" } },
      });
    },

    unsuspendCard: async (_: any, args: { id: string }, context: Context) => {
      const user = requireAuth(context);
      const card = await prisma.card.findFirst({
        where: { id: args.id, userId: user.id },
      });
      if (!card) throw new Error("Card not found");

      return prisma.card.update({
        where: { id: args.id },
        data: { flags: card.flags.filter((f) => f !== "suspended") },
      });
    },

    reviewCard: async (_: any, args: { input: any }, context: Context) => {
      const user = requireAuth(context);
      const {
        cardId,
        rating,
        responseTimeMs,
        confidenceBefore,
        studySessionId,
      } = args.input;

      const card = await prisma.card.findFirst({
        where: { id: cardId, userId: user.id },
      });
      if (!card) throw new Error("Card not found");

      // Get scheduler preferences
      const preferences = await prisma.userPreferences.findUnique({
        where: { userId: user.id },
      });
      const schedulerType = (preferences?.schedulerType || "fsrs") as any;

      // Convert numeric rating to string Rating type
      const ratingStr = toRating(rating as NumericRating);

      const scheduler = createScheduler(schedulerType, {});
      const result = scheduler.scheduleRating(
        {
          stability: card.stability,
          difficulty: card.difficulty,
          elapsedDays: card.elapsedDays,
          scheduledDays: card.scheduledDays,
          reps: card.reps,
          lapses: card.lapses,
          state: card.state as any,
          lastReviewDate: card.lastReviewDate,
        },
        ratingStr,
      );

      const now = new Date();
      const nextReviewDate = new Date(
        now.getTime() + result.interval * 24 * 60 * 60 * 1000,
      );

      // Determine new state
      let newState = card.state;
      if (rating === 1) {
        newState = card.state === "new" ? "learning" : "relearning";
      } else if (["new", "learning"].includes(card.state)) {
        newState = rating >= 3 ? "review" : "learning";
      }

      // Update card
      await prisma.card.update({
        where: { id: cardId },
        data: {
          state: newState,
          stability: result.stability,
          difficulty: result.difficulty,
          scheduledDays: result.interval,
          reps: card.reps + 1,
          lapses: rating === 1 ? card.lapses + 1 : card.lapses,
          lastReviewDate: now,
          nextReviewDate,
          totalReviews: card.totalReviews + 1,
        },
      });

      // Create review record
      const review = await prisma.reviewRecord.create({
        data: {
          userId: user.id,
          cardId,
          studySessionId,
          rating,
          responseTime: responseTimeMs,
          previousState: card.state,
          newState,
          scheduledDays: result.interval,
          confidenceBefore,
          schedulerUsed: schedulerType,
        },
      });

      return {
        review,
        nextReview: {
          interval: result.interval,
          nextReviewDate,
          stability: result.stability,
          difficulty: result.difficulty,
        },
        gamification: {
          xpEarned: 10,
          newCombo: 1,
          comboLost: false,
          newAchievements: [],
          newMetaLearningUnlocks: [],
        },
      };
    },

    startStudySession: async (
      _: any,
      args: { input: any },
      context: Context,
    ) => {
      const user = requireAuth(context);
      return prisma.studySession.create({
        data: {
          userId: user.id,
          deckId: args.input.deckId,
          sessionType: args.input.sessionType || "normal",
          startTime: new Date(),
        },
      });
    },

    endStudySession: async (_: any, args: { id: string }, context: Context) => {
      const user = requireAuth(context);
      const session = await prisma.studySession.findFirst({
        where: { id: args.id, userId: user.id },
        include: { reviews: true },
      });
      if (!session) throw new Error("Session not found");

      const now = new Date();
      const duration = Math.round(
        (now.getTime() - session.startTime.getTime()) / (1000 * 60),
      );
      const cardsStudied = session.reviews.length;
      const correctCount = session.reviews.filter((r) => r.rating >= 3).length;

      return prisma.studySession.update({
        where: { id: args.id },
        data: {
          endTime: now,
          totalDuration: duration,
          cardsStudied,
          correctCount,
          accuracy: cardsStudied > 0 ? correctCount / cardsStudied : 0,
        },
      });
    },

    useStreakFreeze: async (_: any, __: any, context: Context) => {
      const user = requireAuth(context);
      const streak = await prisma.streak.findUnique({
        where: { userId_streakType: { userId: user.id, streakType: "daily" } },
      });
      if (!streak || streak.freezeCount <= 0)
        throw new Error("No streak freezes available");

      await prisma.streak.update({
        where: { id: streak.id },
        data: {
          freezeCount: streak.freezeCount - 1,
          lastActivityDate: new Date(),
        },
      });

      return {
        currentStreak: streak.currentCount,
        longestStreak: streak.longestStreak,
        lastActivityDate: new Date(),
        isAtRisk: false,
        hoursRemaining: 24,
        freezeCount: streak.freezeCount - 1,
      };
    },

    upgradeSkill: async (
      _: any,
      args: { treeId: string; nodeId: string },
      context: Context,
    ) => {
      const user = requireAuth(context);

      await prisma.userSkillProgress.upsert({
        where: {
          userId_treeId_nodeId: {
            userId: user.id,
            treeId: args.treeId,
            nodeId: args.nodeId,
          },
        },
        update: { level: { increment: 1 } },
        create: {
          userId: user.id,
          treeId: args.treeId,
          nodeId: args.nodeId,
          level: 1,
          unlockedAt: new Date(),
        },
      });

      return { success: true, xpSpent: 0, effects: [] };
    },

    installPlugin: async (
      _: any,
      args: { pluginId: string },
      context: Context,
    ) => {
      const user = requireAuth(context);

      const plugin = await prisma.plugin.findUnique({
        where: { id: args.pluginId },
      });
      if (!plugin) throw new Error("Plugin not found");

      return prisma.userPlugin.create({
        data: { userId: user.id, pluginId: args.pluginId },
        include: { plugin: true },
      });
    },

    uninstallPlugin: async (
      _: any,
      args: { pluginId: string },
      context: Context,
    ) => {
      const user = requireAuth(context);

      await prisma.userPlugin.deleteMany({
        where: { userId: user.id, pluginId: args.pluginId },
      });

      return true;
    },

    togglePlugin: async (
      _: any,
      args: { pluginId: string },
      context: Context,
    ) => {
      const user = requireAuth(context);

      const userPlugin = await prisma.userPlugin.findUnique({
        where: {
          userId_pluginId: { userId: user.id, pluginId: args.pluginId },
        },
      });
      if (!userPlugin) throw new Error("Plugin not installed");

      return prisma.userPlugin.update({
        where: { id: userPlugin.id },
        data: { isEnabled: !userPlugin.isEnabled },
        include: { plugin: true },
      });
    },

    updatePluginSettings: async (
      _: any,
      args: { pluginId: string; settings: any },
      context: Context,
    ) => {
      const user = requireAuth(context);

      const userPlugin = await prisma.userPlugin.findUnique({
        where: {
          userId_pluginId: { userId: user.id, pluginId: args.pluginId },
        },
      });
      if (!userPlugin) throw new Error("Plugin not installed");

      return prisma.userPlugin.update({
        where: { id: userPlugin.id },
        data: { settings: args.settings },
        include: { plugin: true },
      });
    },
  },

  // ==========================================================================
  // FIELD RESOLVERS
  // ==========================================================================
  Deck: {
    subDecks: (parent: any) =>
      prisma.deck.findMany({ where: { parentDeckId: parent.id } }),

    parentDeck: (parent: any) =>
      parent.parentDeckId
        ? prisma.deck.findUnique({ where: { id: parent.parentDeckId } })
        : null,

    cards: (parent: any, args: { limit?: number; offset?: number }) =>
      prisma.card
        .findMany({
          where: { deckId: parent.id },
          take: args.limit || 20,
          skip: args.offset || 0,
        })
        .then((data) => ({
          data,
          pagination: {
            total: 0,
            limit: args.limit || 20,
            offset: args.offset || 0,
            hasMore: false,
          },
        })),

    dueCount: (parent: any) =>
      prisma.card.count({
        where: { deckId: parent.id, nextReviewDate: { lte: new Date() } },
      }),
  },

  Card: {
    deck: (parent: any) =>
      prisma.deck.findUnique({ where: { id: parent.deckId } }),

    media: (parent: any) =>
      prisma.cardMedia.findMany({ where: { cardId: parent.id } }),

    reviewHistory: (parent: any, args: { limit?: number }) =>
      prisma.reviewRecord.findMany({
        where: { cardId: parent.id },
        orderBy: { createdAt: "desc" },
        take: args.limit || 10,
      }),
  },

  InstalledPlugin: {
    plugin: (parent: any) =>
      prisma.plugin.findUnique({ where: { id: parent.pluginId } }),
  },
};
