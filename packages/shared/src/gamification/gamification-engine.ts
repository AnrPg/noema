// =============================================================================
// GAMIFICATION ENGINE
// =============================================================================
// Core gamification logic for XP, achievements, streaks, skill trees, etc.

import type {
  XPConfig,
  Level,
  Achievement,
  AchievementCategory,
  AchievementRarity,
  SkillTree,
  SkillNode,
  CalibrationBucket,
  MemoryIntegrityScore,
  StreakData,
  MasteryLevel,
} from "../types/gamification.types";
import type { AchievementId } from "../types/user.types";

// Helper to create achievement IDs
const achievementId = (id: string): AchievementId => id as AchievementId;

// =============================================================================
// XP CONFIGURATION
// =============================================================================

export const XP_CONFIG: XPConfig = {
  xpPerNewCard: 10,
  xpPerReview: 5,
  xpPerCorrectReview: 3,
  xpPerPerfectSession: 50,
  xpPerStreak: 25,
  difficultyMultiplier: 1.5,
  retentionMultiplier: 1.3,
  efficiencyMultiplier: 1.2,
  consistencyMultiplier: 1.4,
  dailyXPCap: 500,
  cramPenalty: 0.5,
  minimumSessionForXP: 5,
};

// =============================================================================
// LEVEL DEFINITIONS
// =============================================================================

const LEVELS: Level[] = [
  { level: 1, name: "Novice", minXP: 0, maxXP: 100, perks: [], badge: "🌱" },
  {
    level: 2,
    name: "Beginner",
    minXP: 100,
    maxXP: 250,
    perks: [],
    badge: "🌿",
  },
  {
    level: 3,
    name: "Apprentice",
    minXP: 250,
    maxXP: 500,
    perks: [],
    badge: "🌲",
  },
  { level: 4, name: "Learner", minXP: 500, maxXP: 850, perks: [], badge: "📚" },
  {
    level: 5,
    name: "Scholar",
    minXP: 850,
    maxXP: 1300,
    perks: [],
    badge: "🎓",
  },
  { level: 6, name: "Adept", minXP: 1300, maxXP: 1900, perks: [], badge: "⭐" },
  {
    level: 7,
    name: "Expert",
    minXP: 1900,
    maxXP: 2700,
    perks: [],
    badge: "🌟",
  },
  {
    level: 8,
    name: "Master",
    minXP: 2700,
    maxXP: 3800,
    perks: [],
    badge: "💫",
  },
  {
    level: 9,
    name: "Grandmaster",
    minXP: 3800,
    maxXP: 5200,
    perks: [],
    badge: "🔥",
  },
  {
    level: 10,
    name: "Legend",
    minXP: 5200,
    maxXP: 7000,
    perks: [],
    badge: "👑",
  },
  {
    level: 11,
    name: "Mythic",
    minXP: 7000,
    maxXP: 9500,
    perks: [],
    badge: "🏆",
  },
  {
    level: 12,
    name: "Transcendent",
    minXP: 9500,
    maxXP: 12500,
    perks: [],
    badge: "💎",
  },
  {
    level: 13,
    name: "Enlightened",
    minXP: 12500,
    maxXP: 16500,
    perks: [],
    badge: "✨",
  },
  {
    level: 14,
    name: "Sage",
    minXP: 16500,
    maxXP: 21500,
    perks: [],
    badge: "🧙",
  },
  {
    level: 15,
    name: "Polymath",
    minXP: 21500,
    maxXP: Infinity,
    perks: [],
    badge: "🌌",
  },
];

// =============================================================================
// ACHIEVEMENTS
// =============================================================================

// Helper type to allow string ids in definition, then cast to Achievement[]
type AchievementDef = Omit<Achievement, "id"> & { id: string };

const ACHIEVEMENTS_RAW: AchievementDef[] = [
  // Learning achievements
  {
    id: "first_card",
    name: "First Step",
    description: "Learn your first card",
    icon: "🎉",
    category: "learning",
    rarity: "common",
    requirement: { type: "cards_learned", count: 1 },
    xpReward: 10,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },
  {
    id: "cards_10",
    name: "Getting Started",
    description: "Learn 10 cards",
    icon: "📝",
    category: "learning",
    rarity: "common",
    requirement: { type: "cards_learned", count: 10 },
    xpReward: 25,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },
  {
    id: "cards_50",
    name: "Building Knowledge",
    description: "Learn 50 cards",
    icon: "📚",
    category: "learning",
    rarity: "common",
    requirement: { type: "cards_learned", count: 50 },
    xpReward: 50,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },
  {
    id: "cards_100",
    name: "Centurion",
    description: "Learn 100 cards",
    icon: "💯",
    category: "learning",
    rarity: "uncommon",
    requirement: { type: "cards_learned", count: 100 },
    xpReward: 100,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },
  {
    id: "cards_500",
    name: "Knowledge Collector",
    description: "Learn 500 cards",
    icon: "📖",
    category: "learning",
    rarity: "rare",
    requirement: { type: "cards_learned", count: 500 },
    xpReward: 250,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },
  {
    id: "cards_1000",
    name: "Scholar",
    description: "Learn 1000 cards",
    icon: "🎓",
    category: "learning",
    rarity: "epic",
    requirement: { type: "cards_learned", count: 1000 },
    xpReward: 500,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },

  // Mastery achievements
  {
    id: "mastered_10",
    name: "Memory Foundation",
    description: "Master 10 cards (90+ day stability)",
    icon: "🧠",
    category: "mastery",
    rarity: "uncommon",
    requirement: { type: "cards_mastered", count: 10 },
    xpReward: 75,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },
  {
    id: "mastered_50",
    name: "Memory Palace",
    description: "Master 50 cards",
    icon: "🏛️",
    category: "mastery",
    rarity: "rare",
    requirement: { type: "cards_mastered", count: 50 },
    xpReward: 200,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },
  {
    id: "mastered_100",
    name: "Memory Fortress",
    description: "Master 100 cards",
    icon: "🏰",
    category: "mastery",
    rarity: "epic",
    requirement: { type: "cards_mastered", count: 100 },
    xpReward: 400,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },

  // Streak achievements
  {
    id: "streak_3",
    name: "Getting Consistent",
    description: "Maintain a 3-day streak",
    icon: "🔥",
    category: "consistency",
    rarity: "common",
    requirement: { type: "streak", days: 3 },
    xpReward: 30,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },
  {
    id: "streak_7",
    name: "Week Warrior",
    description: "Maintain a 7-day streak",
    icon: "🔥🔥",
    category: "consistency",
    rarity: "common",
    requirement: { type: "streak", days: 7 },
    xpReward: 75,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },
  {
    id: "streak_30",
    name: "Month of Learning",
    description: "Maintain a 30-day streak",
    icon: "🔥🔥🔥",
    category: "consistency",
    rarity: "rare",
    requirement: { type: "streak", days: 30 },
    xpReward: 300,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },
  {
    id: "streak_100",
    name: "Dedicated Learner",
    description: "Maintain a 100-day streak",
    icon: "💪",
    category: "consistency",
    rarity: "epic",
    requirement: { type: "streak", days: 100 },
    xpReward: 1000,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },
  {
    id: "streak_365",
    name: "Year of Knowledge",
    description: "Maintain a 365-day streak",
    icon: "🏆",
    category: "consistency",
    rarity: "legendary",
    requirement: { type: "streak", days: 365 },
    xpReward: 5000,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },

  // Memory integrity achievements
  {
    id: "memory_integrity_70",
    name: "Solid Foundation",
    description: "Achieve 70% memory integrity score",
    icon: "📊",
    category: "mastery",
    rarity: "uncommon",
    requirement: { type: "memory_integrity", score: 70 },
    xpReward: 100,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },
  {
    id: "memory_integrity_90",
    name: "Iron Memory",
    description: "Achieve 90% memory integrity score",
    icon: "🧱",
    category: "mastery",
    rarity: "epic",
    requirement: { type: "memory_integrity", score: 90 },
    xpReward: 500,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },

  // Accuracy achievements
  {
    id: "accuracy_80",
    name: "Sharp Mind",
    description: "Maintain 80% accuracy over 100 reviews",
    icon: "🎯",
    category: "efficiency",
    rarity: "uncommon",
    requirement: { type: "accuracy", rate: 80, minReviews: 100 },
    xpReward: 100,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },
  {
    id: "accuracy_95",
    name: "Precision Master",
    description: "Maintain 95% accuracy over 200 reviews",
    icon: "🎯🎯",
    category: "efficiency",
    rarity: "epic",
    requirement: { type: "accuracy", rate: 95, minReviews: 200 },
    xpReward: 400,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },

  // Calibration achievements
  {
    id: "well_calibrated",
    name: "Self-Aware Learner",
    description: "Achieve 80% calibration score",
    icon: "🔮",
    category: "metacognition",
    rarity: "rare",
    requirement: { type: "calibration", score: 80 },
    xpReward: 200,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },

  // Review achievements
  {
    id: "reviews_100",
    name: "First Hundred",
    description: "Complete 100 reviews",
    icon: "✅",
    category: "learning",
    rarity: "common",
    requirement: { type: "total_reviews", count: 100 },
    xpReward: 50,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },
  {
    id: "reviews_1000",
    name: "Review Veteran",
    description: "Complete 1000 reviews",
    icon: "✅✅",
    category: "learning",
    rarity: "uncommon",
    requirement: { type: "total_reviews", count: 1000 },
    xpReward: 200,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },
  {
    id: "reviews_10000",
    name: "Review Legend",
    description: "Complete 10000 reviews",
    icon: "👑",
    category: "learning",
    rarity: "epic",
    requirement: { type: "total_reviews", count: 10000 },
    xpReward: 1000,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },

  // Exploration achievements
  {
    id: "first_deck",
    name: "Deck Creator",
    description: "Create your first deck",
    icon: "📦",
    category: "exploration",
    rarity: "common",
    requirement: { type: "decks_created", count: 1 },
    xpReward: 20,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },
  {
    id: "perfect_session",
    name: "Flawless",
    description: "Complete a perfect study session",
    icon: "💎",
    category: "efficiency",
    rarity: "uncommon",
    requirement: { type: "perfect_sessions", count: 1 },
    xpReward: 50,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },
  {
    id: "perfect_sessions_10",
    name: "Consistency Champion",
    description: "Complete 10 perfect study sessions",
    icon: "💎💎",
    category: "efficiency",
    rarity: "rare",
    requirement: { type: "perfect_sessions", count: 10 },
    xpReward: 250,
    unlocksFeature: null,
    isHidden: false,
    isRepeatable: false,
  },
];

// Export with proper type by casting
export const ACHIEVEMENTS: Achievement[] = ACHIEVEMENTS_RAW as Achievement[];

// =============================================================================
// DEFAULT SKILL TREES
// =============================================================================

export const DEFAULT_SKILL_TREES: SkillTree[] = [
  {
    id: "learning_mastery",
    name: "Learning Mastery",
    description: "Core skills for effective learning",
    domain: "general",
    nodes: [
      {
        id: "spaced_repetition_basics",
        name: "Spaced Repetition Basics",
        description: "Understand the fundamentals of spaced repetition",
        deckId: null,
        level: 0,
        position: { x: 0, y: 0 },
        cardsRequired: 0,
        masteryThreshold: 0,
        stabilityRequired: 0,
        progress: 0,
        isUnlocked: true,
        isMastered: false,
        masteredAt: null,
      },
      {
        id: "active_recall",
        name: "Active Recall",
        description: "Master the art of testing yourself",
        deckId: null,
        level: 1,
        position: { x: 0, y: 1 },
        cardsRequired: 50,
        masteryThreshold: 0.7,
        stabilityRequired: 7,
        progress: 0,
        isUnlocked: false,
        isMastered: false,
        masteredAt: null,
      },
      {
        id: "interleaving",
        name: "Interleaving",
        description: "Mix different topics for better retention",
        deckId: null,
        level: 2,
        position: { x: -1, y: 2 },
        cardsRequired: 100,
        masteryThreshold: 0.75,
        stabilityRequired: 14,
        progress: 0,
        isUnlocked: false,
        isMastered: false,
        masteredAt: null,
      },
      {
        id: "elaboration",
        name: "Elaboration",
        description: "Connect new knowledge to existing knowledge",
        deckId: null,
        level: 2,
        position: { x: 1, y: 2 },
        cardsRequired: 100,
        masteryThreshold: 0.75,
        stabilityRequired: 14,
        progress: 0,
        isUnlocked: false,
        isMastered: false,
        masteredAt: null,
      },
      {
        id: "metacognition",
        name: "Metacognition",
        description: "Think about your thinking",
        deckId: null,
        level: 3,
        position: { x: 0, y: 3 },
        cardsRequired: 200,
        masteryThreshold: 0.8,
        stabilityRequired: 30,
        progress: 0,
        isUnlocked: false,
        isMastered: false,
        masteredAt: null,
      },
    ],
    edges: [
      {
        fromNodeId: "spaced_repetition_basics",
        toNodeId: "active_recall",
        isRequired: true,
      },
      {
        fromNodeId: "active_recall",
        toNodeId: "interleaving",
        isRequired: true,
      },
      {
        fromNodeId: "active_recall",
        toNodeId: "elaboration",
        isRequired: true,
      },
      {
        fromNodeId: "interleaving",
        toNodeId: "metacognition",
        isRequired: false,
      },
      {
        fromNodeId: "elaboration",
        toNodeId: "metacognition",
        isRequired: false,
      },
    ],
  },
];

// =============================================================================
// META-LEARNING UNLOCKS
// =============================================================================

export interface MetaLearningUnlock {
  id: string;
  name: string;
  description: string;
  requirement: {
    type: "level" | "achievement" | "streak" | "mastered_cards";
    value: number | string;
  };
  feature: string;
  isUnlocked?: boolean;
}

export const META_LEARNING_UNLOCKS: MetaLearningUnlock[] = [
  {
    id: "custom_intervals",
    name: "Custom Intervals",
    description: "Customize your review intervals",
    requirement: { type: "level", value: 5 },
    feature: "settings.customIntervals",
  },
  {
    id: "advanced_stats",
    name: "Advanced Statistics",
    description: "Access detailed learning analytics",
    requirement: { type: "level", value: 3 },
    feature: "stats.advanced",
  },
  {
    id: "calibration_tracking",
    name: "Calibration Tracking",
    description: "Track your self-assessment accuracy",
    requirement: { type: "mastered_cards", value: 25 },
    feature: "stats.calibration",
  },
  {
    id: "memory_integrity",
    name: "Memory Integrity Score",
    description: "Access your memory integrity dashboard",
    requirement: { type: "mastered_cards", value: 50 },
    feature: "stats.memoryIntegrity",
  },
  {
    id: "learning_strategies",
    name: "Learning Strategies",
    description: "Unlock evidence-based learning strategy recommendations",
    requirement: { type: "streak", value: 7 },
    feature: "strategies",
  },
];

// =============================================================================
// XP ENGINE
// =============================================================================

interface LevelInfo {
  level: number;
  name: string;
  currentLevelXP: number;
  nextLevelXP: number;
  badge: string;
}

export class XPEngine {
  private config: XPConfig;

  constructor(config: XPConfig = XP_CONFIG) {
    this.config = config;
  }

  calculateLevel(totalXP: number): LevelInfo {
    let currentLevel = LEVELS[0];

    for (const level of LEVELS) {
      if (totalXP >= level.minXP) {
        currentLevel = level;
      } else {
        break;
      }
    }

    const xpIntoLevel = totalXP - currentLevel.minXP;
    const xpForNextLevel =
      currentLevel.maxXP === Infinity
        ? 10000 // Arbitrary large number for max level
        : currentLevel.maxXP - currentLevel.minXP;

    return {
      level: currentLevel.level,
      name: currentLevel.name,
      currentLevelXP: xpIntoLevel,
      nextLevelXP: xpForNextLevel,
      badge: currentLevel.badge,
    };
  }

  calculateReviewXP(params: {
    rating: number;
    cardDifficulty: number;
    responseTimeMs?: number;
    streakDays?: number;
    isNewCard?: boolean;
  }): number {
    const {
      rating,
      cardDifficulty,
      responseTimeMs,
      streakDays = 0,
      isNewCard = false,
    } = params;

    let xp = isNewCard ? this.config.xpPerNewCard : this.config.xpPerReview;

    // Bonus for correct answer (rating >= 3)
    if (rating >= 3) {
      xp += this.config.xpPerCorrectReview;
    }

    // Difficulty multiplier
    const difficultyBonus =
      1 + (cardDifficulty - 0.5) * (this.config.difficultyMultiplier - 1);
    xp *= difficultyBonus;

    // Efficiency multiplier (faster response = more XP, up to a point)
    if (responseTimeMs && responseTimeMs < 10000) {
      const efficiencyBonus =
        1 +
        (1 - responseTimeMs / 10000) * (this.config.efficiencyMultiplier - 1);
      xp *= efficiencyBonus;
    }

    // Streak bonus
    if (streakDays > 0) {
      const streakBonus = Math.min(streakDays * 0.01, 0.5); // Max 50% bonus
      xp *= 1 + streakBonus;
    }

    return Math.round(xp);
  }
}

// =============================================================================
// ACHIEVEMENT ENGINE
// =============================================================================

interface UserStats {
  totalCards?: number;
  masteredCards?: number;
  currentStreak?: number;
  totalReviews?: number;
  retentionRate?: number;
  decksCreated?: number;
  perfectSessions?: number;
  totalStudyMinutes?: number;
  memoryIntegrityScore?: number;
  calibrationScore?: number;
}

export interface AchievementProgress {
  percentComplete: number;
  currentValue: number;
  targetValue: number;
}

export class AchievementEngine {
  checkAchievements(
    stats: UserStats,
    unlockedAchievements: string[],
  ): Achievement[] {
    const newAchievements: Achievement[] = [];

    for (const achievement of ACHIEVEMENTS) {
      if (unlockedAchievements.includes(achievement.id)) {
        continue;
      }

      if (this.isAchievementMet(achievement, stats)) {
        newAchievements.push(achievement);
      }
    }

    return newAchievements;
  }

  getProgress(achievementId: string, stats: UserStats): AchievementProgress {
    const achievement = ACHIEVEMENTS.find((a) => a.id === achievementId);
    if (!achievement) {
      return { percentComplete: 0, currentValue: 0, targetValue: 0 };
    }

    const req = achievement.requirement;
    let current = 0;
    let target = 0;

    switch (req.type) {
      case "cards_learned":
        current = stats.totalCards || 0;
        target = req.count;
        break;
      case "cards_mastered":
        current = stats.masteredCards || 0;
        target = req.count;
        break;
      case "streak":
        current = stats.currentStreak || 0;
        target = req.days;
        break;
      case "total_reviews":
        current = stats.totalReviews || 0;
        target = req.count;
        break;
      case "decks_created":
        current = stats.decksCreated || 0;
        target = req.count;
        break;
      case "perfect_sessions":
        current = stats.perfectSessions || 0;
        target = req.count;
        break;
      case "memory_integrity":
        current = stats.memoryIntegrityScore || 0;
        target = req.score;
        break;
      case "accuracy":
        current = (stats.retentionRate || 0) * 100;
        target = req.rate;
        break;
      case "calibration":
        current = stats.calibrationScore || 0;
        target = req.score;
        break;
      default:
        break;
    }

    const percentComplete =
      target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

    return { percentComplete, currentValue: current, targetValue: target };
  }

  private isAchievementMet(
    achievement: Achievement,
    stats: UserStats,
  ): boolean {
    const req = achievement.requirement;

    switch (req.type) {
      case "cards_learned":
        return (stats.totalCards || 0) >= req.count;
      case "cards_mastered":
        return (stats.masteredCards || 0) >= req.count;
      case "streak":
        return (stats.currentStreak || 0) >= req.days;
      case "total_reviews":
        return (stats.totalReviews || 0) >= req.count;
      case "decks_created":
        return (stats.decksCreated || 0) >= req.count;
      case "perfect_sessions":
        return (stats.perfectSessions || 0) >= req.count;
      case "memory_integrity":
        return (stats.memoryIntegrityScore || 0) >= req.score;
      case "accuracy":
        return (
          (stats.retentionRate || 0) * 100 >= req.rate &&
          (stats.totalReviews || 0) >= req.minReviews
        );
      case "calibration":
        return (stats.calibrationScore || 0) >= req.score;
      default:
        return false;
    }
  }
}

// =============================================================================
// STREAK ENGINE
// =============================================================================

export class StreakEngine {
  calculateStreak(
    lastActivityDate: Date | null,
    currentStreak: number,
  ): {
    newStreak: number;
    streakBroken: boolean;
    streakExtended: boolean;
  } {
    if (!lastActivityDate) {
      return { newStreak: 1, streakBroken: false, streakExtended: true };
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastDate = new Date(lastActivityDate);
    const lastActivityDay = new Date(
      lastDate.getFullYear(),
      lastDate.getMonth(),
      lastDate.getDate(),
    );

    const diffDays = Math.floor(
      (today.getTime() - lastActivityDay.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays === 0) {
      // Same day - no change
      return {
        newStreak: currentStreak,
        streakBroken: false,
        streakExtended: false,
      };
    } else if (diffDays === 1) {
      // Next day - extend streak
      return {
        newStreak: currentStreak + 1,
        streakBroken: false,
        streakExtended: true,
      };
    } else {
      // Streak broken
      return { newStreak: 1, streakBroken: true, streakExtended: false };
    }
  }

  getStreakXPBonus(streakDays: number): number {
    if (streakDays < 3) return 0;
    if (streakDays < 7) return 10;
    if (streakDays < 30) return 25;
    if (streakDays < 100) return 50;
    return 100;
  }
}

// =============================================================================
// SKILL TREE ENGINE
// =============================================================================

type SkillNodeId = string;

export class SkillTreeEngine {
  upgradeNode(
    treeId: string,
    nodeId: SkillNodeId,
    userXP: number,
    unlockedNodes: SkillNodeId[],
  ): { success: boolean; xpSpent: number; effects: string[] } {
    const tree = DEFAULT_SKILL_TREES.find((t) => t.id === treeId);
    if (!tree) {
      return { success: false, xpSpent: 0, effects: [] };
    }

    const node = tree.nodes.find((n) => n.id === nodeId);
    if (!node) {
      return { success: false, xpSpent: 0, effects: [] };
    }

    // Check prerequisites
    const prerequisites = tree.edges
      .filter((e) => e.toNodeId === nodeId && e.isRequired)
      .map((e) => e.fromNodeId);

    const hasPrerequisites = prerequisites.every((prereq) =>
      unlockedNodes.includes(prereq),
    );
    if (!hasPrerequisites) {
      return { success: false, xpSpent: 0, effects: [] };
    }

    // Calculate XP cost (increases with level)
    const xpCost = 100 * (node.level + 1);
    if (userXP < xpCost) {
      return { success: false, xpSpent: 0, effects: [] };
    }

    return {
      success: true,
      xpSpent: xpCost,
      effects: [`Unlocked ${node.name}`, `${node.description}`],
    };
  }

  getAvailableNodes(treeId: string, unlockedNodes: SkillNodeId[]): SkillNode[] {
    const tree = DEFAULT_SKILL_TREES.find((t) => t.id === treeId);
    if (!tree) return [];

    return tree.nodes.filter((node) => {
      if (unlockedNodes.includes(node.id)) return false;

      const prerequisites = tree.edges
        .filter((e) => e.toNodeId === node.id && e.isRequired)
        .map((e) => e.fromNodeId);

      return prerequisites.every((prereq) => unlockedNodes.includes(prereq));
    });
  }
}

// =============================================================================
// CALIBRATION ENGINE
// =============================================================================

interface CalibrationData {
  confidenceBefore: number;
  recalled: boolean;
  cardDifficulty: number;
}

export interface CalibrationResult {
  score: number;
  buckets: CalibrationBucket[];
  overconfidenceBias: number;
  underconfidenceBias: number;
}

interface MemoryIntegrityInput {
  retentionRate: number;
  reviewConsistency: number;
  masteredRatio: number;
  avgStability: number;
  recallVariance: number;
}

interface MemoryIntegrityResult {
  score: number;
  trend: "improving" | "stable" | "declining";
  factors: Array<{ name: string; score: number; weight: number }>;
}

export class CalibrationEngine {
  calculateCalibrationScore(data: CalibrationData[]): CalibrationResult {
    if (data.length < 10) {
      return {
        score: 0,
        buckets: [],
        overconfidenceBias: 0,
        underconfidenceBias: 0,
      };
    }

    // Create confidence buckets (0-20, 20-40, 40-60, 60-80, 80-100)
    const buckets: Map<number, { correct: number; total: number }> = new Map();

    for (let i = 0; i <= 80; i += 20) {
      buckets.set(i, { correct: 0, total: 0 });
    }

    for (const item of data) {
      const bucket = Math.floor(item.confidenceBefore / 20) * 20;
      const key = Math.min(bucket, 80);
      const current = buckets.get(key) || { correct: 0, total: 0 };
      current.total++;
      if (item.recalled) current.correct++;
      buckets.set(key, current);
    }

    const calibrationBuckets: CalibrationBucket[] = [];
    let totalDeviation = 0;
    let overconfidence = 0;
    let underconfidence = 0;

    for (const [confidenceLevel, stats] of buckets) {
      if (stats.total === 0) continue;

      const actualAccuracy = (stats.correct / stats.total) * 100;
      const midpoint = confidenceLevel + 10; // Use midpoint of bucket
      const deviation = actualAccuracy - midpoint;

      totalDeviation += Math.abs(deviation);

      if (deviation < 0) overconfidence += Math.abs(deviation);
      if (deviation > 0) underconfidence += deviation;

      calibrationBuckets.push({
        confidenceLevel: midpoint,
        actualAccuracy: Math.round(actualAccuracy),
        sampleSize: stats.total,
        isCalibrated: Math.abs(deviation) <= 10,
      });
    }

    const avgDeviation = totalDeviation / calibrationBuckets.length;
    const score = Math.max(0, Math.round(100 - avgDeviation));

    return {
      score,
      buckets: calibrationBuckets,
      overconfidenceBias: Math.round(
        overconfidence / calibrationBuckets.length,
      ),
      underconfidenceBias: Math.round(
        underconfidence / calibrationBuckets.length,
      ),
    };
  }

  calculateMemoryIntegrity(input: MemoryIntegrityInput): MemoryIntegrityResult {
    const factors = [
      { name: "Retention Rate", score: input.retentionRate * 100, weight: 0.3 },
      {
        name: "Review Consistency",
        score: input.reviewConsistency * 100,
        weight: 0.2,
      },
      {
        name: "Mastery Progress",
        score: input.masteredRatio * 100,
        weight: 0.25,
      },
      {
        name: "Memory Stability",
        score: Math.min(100, input.avgStability * 2),
        weight: 0.15,
      },
      {
        name: "Recall Variance",
        score: Math.max(0, 100 - input.recallVariance * 100),
        weight: 0.1,
      },
    ];

    const score = factors.reduce((sum, f) => sum + f.score * f.weight, 0);

    // Determine trend (simplified - in reality would compare to historical data)
    let trend: "improving" | "stable" | "declining" = "stable";
    if (score > 70) trend = "improving";
    if (score < 40) trend = "declining";

    return {
      score: Math.round(score),
      trend,
      factors,
    };
  }
}

// =============================================================================
// CHALLENGE ENGINE
// =============================================================================

interface Challenge {
  id: string;
  type: "daily" | "weekly";
  name: string;
  description: string;
  target: number;
  xpReward: number;
  startDate: Date;
  endDate: Date;
}

export class ChallengeEngine {
  generateDailyChallenges(stats: UserStats, level: number): Challenge[] {
    const now = new Date();
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
    );

    const baseTarget = 20 + level * 5;

    return [
      {
        id: `daily_reviews_${now.toISOString().split("T")[0]}`,
        type: "daily",
        name: "Daily Reviews",
        description: `Complete ${baseTarget} reviews today`,
        target: baseTarget,
        xpReward: 50 + level * 10,
        startDate: now,
        endDate: endOfDay,
      },
      {
        id: `daily_accuracy_${now.toISOString().split("T")[0]}`,
        type: "daily",
        name: "Accuracy Challenge",
        description: "Maintain 85% accuracy in your reviews",
        target: 85,
        xpReward: 75,
        startDate: now,
        endDate: endOfDay,
      },
    ];
  }

  generateWeeklyChallenge(stats: UserStats, level: number): Challenge {
    const now = new Date();
    const endOfWeek = new Date(now);
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
    endOfWeek.setHours(23, 59, 59);

    const baseTarget = 100 + level * 25;

    return {
      id: `weekly_${now.toISOString().split("T")[0]}`,
      type: "weekly",
      name: "Weekly Review Goal",
      description: `Complete ${baseTarget} reviews this week`,
      target: baseTarget,
      xpReward: 200 + level * 25,
      startDate: now,
      endDate: endOfWeek,
    };
  }
}

// =============================================================================
// LEADERBOARD ENGINE
// =============================================================================

interface LeaderboardEntry {
  userId: string;
  displayName: string;
  score: number;
  rank: number;
}

export class LeaderboardEngine {
  calculateRank(userScore: number, allScores: number[]): number {
    const sortedScores = [...allScores].sort((a, b) => b - a);
    return sortedScores.findIndex((s) => s <= userScore) + 1;
  }

  getLeaderboardPosition(
    userId: string,
    entries: LeaderboardEntry[],
  ): {
    rank: number;
    percentile: number;
  } {
    const entry = entries.find((e) => e.userId === userId);
    if (!entry) {
      return { rank: -1, percentile: 0 };
    }

    const percentile = Math.round(
      (1 - (entry.rank - 1) / entries.length) * 100,
    );
    return { rank: entry.rank, percentile };
  }
}

// =============================================================================
// META-LEARNING ENGINE
// =============================================================================

export class MetaLearningEngine {
  checkUnlocks(
    stats: UserStats,
    level: number,
    currentUnlocks: string[],
  ): MetaLearningUnlock[] {
    const newUnlocks: MetaLearningUnlock[] = [];

    for (const unlock of META_LEARNING_UNLOCKS) {
      if (currentUnlocks.includes(unlock.id)) continue;

      let met = false;
      switch (unlock.requirement.type) {
        case "level":
          met = level >= (unlock.requirement.value as number);
          break;
        case "streak":
          met =
            (stats.currentStreak || 0) >= (unlock.requirement.value as number);
          break;
        case "mastered_cards":
          met =
            (stats.masteredCards || 0) >= (unlock.requirement.value as number);
          break;
      }

      if (met) {
        newUnlocks.push({ ...unlock, isUnlocked: true });
      }
    }

    return newUnlocks;
  }

  getAllUnlocks(currentUnlocks: string[]): MetaLearningUnlock[] {
    return META_LEARNING_UNLOCKS.map((unlock) => ({
      ...unlock,
      isUnlocked: currentUnlocks.includes(unlock.id),
    }));
  }
}

// =============================================================================
// GAMIFICATION MANAGER
// =============================================================================

interface ReviewInput {
  rating: number;
  cardDifficulty: number;
  responseTimeMs?: number;
  confidenceBefore?: number;
}

interface ReviewContext {
  currentCombo: number;
  streakDays: number;
  todayXP: number;
  stats: UserStats;
  unlockedAchievements: string[];
  metaLearningUnlocks: string[];
}

interface GamificationResult {
  xpTransaction: { amount: number; details: Record<string, any> } | null;
  newAchievements: Achievement[];
  newMetaLearningUnlocks: MetaLearningUnlock[];
  comboUpdate: { newCombo: number; comboLost: boolean };
  streakUpdate: { newStreak: number; streakExtended: boolean };
}

export class GamificationManager {
  private xpEngine: XPEngine;
  private achievementEngine: AchievementEngine;
  private streakEngine: StreakEngine;
  private metaLearningEngine: MetaLearningEngine;

  constructor() {
    this.xpEngine = new XPEngine();
    this.achievementEngine = new AchievementEngine();
    this.streakEngine = new StreakEngine();
    this.metaLearningEngine = new MetaLearningEngine();
  }

  processReview(
    input: ReviewInput,
    context: ReviewContext,
  ): GamificationResult {
    // Calculate XP
    const baseXP = this.xpEngine.calculateReviewXP({
      rating: input.rating,
      cardDifficulty: input.cardDifficulty,
      responseTimeMs: input.responseTimeMs,
      streakDays: context.streakDays,
    });

    // Combo logic
    const isCorrect = input.rating >= 3;
    const newCombo = isCorrect ? context.currentCombo + 1 : 0;
    const comboLost = !isCorrect && context.currentCombo > 0;

    // Combo bonus XP
    let comboBonus = 0;
    if (newCombo >= 5) {
      comboBonus = Math.min(newCombo, 25); // Max 25 bonus XP
    }

    const totalXP = baseXP + comboBonus;

    // Check for new achievements
    const updatedStats = {
      ...context.stats,
      totalReviews: (context.stats.totalReviews || 0) + 1,
    };
    const newAchievements = this.achievementEngine.checkAchievements(
      updatedStats,
      context.unlockedAchievements,
    );

    // Check for meta-learning unlocks
    const level = this.xpEngine.calculateLevel(context.todayXP + totalXP).level;
    const newMetaLearningUnlocks = this.metaLearningEngine.checkUnlocks(
      updatedStats,
      level,
      context.metaLearningUnlocks,
    );

    return {
      xpTransaction: {
        amount: totalXP,
        details: {
          baseXP,
          comboBonus,
          combo: newCombo,
          rating: input.rating,
        },
      },
      newAchievements,
      newMetaLearningUnlocks,
      comboUpdate: { newCombo, comboLost },
      streakUpdate: { newStreak: context.streakDays, streakExtended: false },
    };
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

export function createGamificationManager(): GamificationManager {
  return new GamificationManager();
}
