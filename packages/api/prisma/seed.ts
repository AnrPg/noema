// =============================================================================
// DATABASE SEED
// =============================================================================
// Seeds the database with initial data for development
// Run with: pnpm db:seed

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ACHIEVEMENTS, DEFAULT_SKILL_TREES, META_LEARNING_UNLOCKS } from '@manthanein/shared';

const prisma = new PrismaClient();

// Hash function alias for convenience
const hash = (password: string, saltRounds: number) => bcrypt.hash(password, saltRounds);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

async function main() {
  console.log('🌱 Starting database seed...\n');

  // ---------------------------------------------------------------------------
  // 1. CREATE DEMO USERS
  // ---------------------------------------------------------------------------
  console.log('👤 Creating users...');

  const passwordHash = await hash('demo123', 12);

  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@manthanein.app' },
    update: {},
    create: {
      email: 'demo@manthanein.app',
      passwordHash,
      displayName: 'Demo User',
      isEmailVerified: true,
      isActive: true,
      preferences: {
        create: {
          theme: 'system',
          language: 'en',
          dailyGoal: 50,
          sessionDuration: 20,
          newCardsPerDay: 20,
          schedulerType: 'fsrs',
        },
      },
      learningStats: {
        create: {
          totalReviews: 1250,
          totalCards: 450,
          masteredCards: 120,
          totalStudyTime: 2400,
          totalXP: 15000,
          level: 12,
          currentStreak: 15,
          longestStreak: 45,
          averageAccuracy: 0.85,
          avgResponseTime: 3500,
          retentionRate: 0.88,
          perfectSessions: 8,
          decksCreated: 5,
          cardsCreated: 450,
          calibrationScore: 0.72,
          memoryIntegrityScore: 78,
        },
      },
      cognitiveProfile: {
        create: {
          preferredModality: 'visual',
          optimalSessionLength: 25,
          peakPerformanceHours: [9, 10, 14, 15, 16],
          workingMemoryCapacity: 0.65,
          processingSpeed: 0.7,
          attentionSpan: 30,
          preferredDifficulty: 0.6,
        },
      },
    },
  });

  const testUser = await prisma.user.upsert({
    where: { email: 'test@manthanein.app' },
    update: {},
    create: {
      email: 'test@manthanein.app',
      passwordHash,
      displayName: 'Test User',
      isEmailVerified: true,
      isActive: true,
      preferences: {
        create: {
          theme: 'dark',
          language: 'en',
          dailyGoal: 30,
          sessionDuration: 15,
          newCardsPerDay: 15,
          schedulerType: 'fsrs',
        },
      },
      learningStats: {
        create: {
          totalReviews: 250,
          totalCards: 80,
          masteredCards: 15,
          totalStudyTime: 480,
          totalXP: 3000,
          level: 5,
          currentStreak: 3,
          longestStreak: 10,
          averageAccuracy: 0.75,
          retentionRate: 0.8,
        },
      },
    },
  });

  console.log(`   ✅ Created users: ${demoUser.displayName}, ${testUser.displayName}\n`);

  // ---------------------------------------------------------------------------
  // 2. CREATE SAMPLE DECKS
  // ---------------------------------------------------------------------------
  console.log('📚 Creating decks...');

  const languageDeck = await prisma.deck.upsert({
    where: { id: 'demo-spanish-deck' },
    update: {},
    create: {
      id: 'demo-spanish-deck',
      userId: demoUser.id,
      name: 'Spanish Vocabulary',
      description: 'Essential Spanish words and phrases for beginners',
      iconEmoji: '🇪🇸',
      color: '#FF6B6B',
      tags: ['language', 'spanish', 'vocabulary'],
      category: 'Languages',
      language: 'es',
      cardCount: 100,
      newCount: 30,
      learningCount: 25,
      reviewCount: 35,
      masteredCount: 10,
    },
  });

  const programmingDeck = await prisma.deck.upsert({
    where: { id: 'demo-typescript-deck' },
    update: {},
    create: {
      id: 'demo-typescript-deck',
      userId: demoUser.id,
      name: 'TypeScript Fundamentals',
      description: 'Core TypeScript concepts, types, and patterns',
      iconEmoji: '💻',
      color: '#3178C6',
      tags: ['programming', 'typescript', 'javascript'],
      category: 'Programming',
      language: 'en',
      cardCount: 75,
      newCount: 20,
      learningCount: 15,
      reviewCount: 30,
      masteredCount: 10,
    },
  });

  const historyDeck = await prisma.deck.upsert({
    where: { id: 'demo-history-deck' },
    update: {},
    create: {
      id: 'demo-history-deck',
      userId: demoUser.id,
      name: 'World History',
      description: 'Key events and figures in world history',
      iconEmoji: '🏛️',
      color: '#8B4513',
      tags: ['history', 'education'],
      category: 'History',
      language: 'en',
      cardCount: 50,
      newCount: 15,
      learningCount: 10,
      reviewCount: 20,
      masteredCount: 5,
    },
  });

  const mathDeck = await prisma.deck.upsert({
    where: { id: 'demo-math-deck' },
    update: {},
    create: {
      id: 'demo-math-deck',
      userId: demoUser.id,
      name: 'Calculus Formulas',
      description: 'Essential calculus formulas and theorems',
      iconEmoji: '📐',
      color: '#4ECDC4',
      tags: ['math', 'calculus', 'formulas'],
      category: 'Mathematics',
      language: 'en',
      isPublic: true,
      cardCount: 40,
      newCount: 10,
      learningCount: 8,
      reviewCount: 15,
      masteredCount: 7,
    },
  });

  console.log(`   ✅ Created 4 sample decks\n`);

  // ---------------------------------------------------------------------------
  // 3. CREATE SAMPLE CARDS
  // ---------------------------------------------------------------------------
  console.log('🃏 Creating cards...');

  // Spanish vocabulary cards
  const spanishCards = [
    { front: 'Hello', back: 'Hola', state: 'mastered', stability: 90, difficulty: 0.2 },
    { front: 'Goodbye', back: 'Adiós', state: 'review', stability: 30, difficulty: 0.25 },
    { front: 'Thank you', back: 'Gracias', state: 'review', stability: 45, difficulty: 0.2 },
    { front: 'Please', back: 'Por favor', state: 'learning', stability: 5, difficulty: 0.35 },
    { front: 'Good morning', back: 'Buenos días', state: 'learning', stability: 3, difficulty: 0.4 },
    { front: 'Good night', back: 'Buenas noches', state: 'new', stability: 0, difficulty: 0.3 },
    { front: 'How are you?', back: '¿Cómo estás?', state: 'new', stability: 0, difficulty: 0.3 },
    { front: 'Water', back: 'Agua', state: 'review', stability: 20, difficulty: 0.2 },
    { front: 'Food', back: 'Comida', state: 'review', stability: 15, difficulty: 0.25 },
    { front: 'House', back: 'Casa', state: 'mastered', stability: 100, difficulty: 0.15 },
  ];

  for (let i = 0; i < spanishCards.length; i++) {
    const card = spanishCards[i];
    await prisma.card.upsert({
      where: { id: `demo-spanish-card-${i}` },
      update: {},
      create: {
        id: `demo-spanish-card-${i}`,
        userId: demoUser.id,
        deckId: languageDeck.id,
        cardType: 'atomic_text',
        content: {
          front: { text: card.front },
          back: { text: card.back },
        },
        state: card.state,
        stability: card.stability,
        difficulty: card.difficulty,
        reps: card.state === 'mastered' ? randomInt(10, 20) : card.state === 'review' ? randomInt(3, 10) : randomInt(0, 3),
        position: i,
        nextReviewDate: card.state !== 'new' ? randomDate(new Date(), new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) : null,
        tags: ['vocabulary'],
      },
    });
  }

  // TypeScript concept cards
  const tsCards = [
    { front: 'What is a generic type?', back: 'A type that works with different data types while maintaining type safety. Example: Array<T>' },
    { front: 'Interface vs Type?', back: 'Interfaces can be extended/merged; types support unions/intersections and complex compositions.' },
    { front: 'What does readonly do?', back: 'Makes a property immutable after initialization, preventing reassignment.' },
    { front: 'What is a union type?', back: 'Allows a value to be one of several types, written with pipe (|). Example: string | number' },
    { front: 'What is keyof?', back: 'Produces a union type of all keys of an object type. keyof { a: number; b: string } → "a" | "b"' },
  ];

  for (let i = 0; i < tsCards.length; i++) {
    const card = tsCards[i];
    await prisma.card.upsert({
      where: { id: `demo-ts-card-${i}` },
      update: {},
      create: {
        id: `demo-ts-card-${i}`,
        userId: demoUser.id,
        deckId: programmingDeck.id,
        cardType: 'atomic_text',
        content: {
          front: { text: card.front },
          back: { text: card.back },
        },
        state: ['new', 'learning', 'review', 'mastered'][randomInt(0, 3)],
        stability: randomFloat(0, 60),
        difficulty: randomFloat(0.3, 0.6),
        position: i,
        tags: ['typescript', 'concepts'],
      },
    });
  }

  // Cloze deletion card example
  await prisma.card.upsert({
    where: { id: 'demo-cloze-card-1' },
    update: {},
    create: {
      id: 'demo-cloze-card-1',
      userId: demoUser.id,
      deckId: historyDeck.id,
      cardType: 'cloze',
      content: {
        text: 'The {{c1::French Revolution}} began in {{c2::1789}} and ended the monarchy of {{c3::Louis XVI}}.',
        clozes: [
          { id: 'c1', answer: 'French Revolution', hint: 'Major European revolution' },
          { id: 'c2', answer: '1789', hint: 'Year' },
          { id: 'c3', answer: 'Louis XVI', hint: 'French king' },
        ],
      },
      state: 'learning',
      stability: 5,
      difficulty: 0.45,
      position: 0,
      tags: ['french-revolution', 'europe'],
    },
  });

  // Math card
  await prisma.card.upsert({
    where: { id: 'demo-math-card-1' },
    update: {},
    create: {
      id: 'demo-math-card-1',
      userId: demoUser.id,
      deckId: mathDeck.id,
      cardType: 'atomic_text',
      content: {
        front: { text: 'What is the derivative of x²?' },
        back: { text: '2x', explanation: 'Using the power rule: d/dx(xⁿ) = nxⁿ⁻¹' },
      },
      state: 'mastered',
      stability: 120,
      difficulty: 0.15,
      position: 0,
      tags: ['derivatives', 'power-rule'],
    },
  });

  console.log(`   ✅ Created ${spanishCards.length + tsCards.length + 2} sample cards\n`);

  // ---------------------------------------------------------------------------
  // 4. CREATE STREAKS
  // ---------------------------------------------------------------------------
  console.log('🔥 Creating streaks...');

  await prisma.streak.upsert({
    where: { userId_streakType: { userId: demoUser.id, streakType: 'daily' } },
    update: {},
    create: {
      userId: demoUser.id,
      streakType: 'daily',
      currentCount: 15,
      longestStreak: 45,
      lastActivityDate: new Date(),
      freezeCount: 2,
    },
  });

  await prisma.streak.upsert({
    where: { userId_streakType: { userId: testUser.id, streakType: 'daily' } },
    update: {},
    create: {
      userId: testUser.id,
      streakType: 'daily',
      currentCount: 3,
      longestStreak: 10,
      lastActivityDate: new Date(),
      freezeCount: 1,
    },
  });

  console.log(`   ✅ Created streaks for users\n`);

  // ---------------------------------------------------------------------------
  // 5. CREATE ACHIEVEMENTS
  // ---------------------------------------------------------------------------
  console.log('🏆 Creating achievements...');

  const userAchievements = [
    { achievementId: 'first_review', xpAwarded: 50 },
    { achievementId: 'hundred_reviews', xpAwarded: 100 },
    { achievementId: 'thousand_reviews', xpAwarded: 500 },
    { achievementId: 'first_mastery', xpAwarded: 75 },
    { achievementId: 'week_streak', xpAwarded: 100 },
    { achievementId: 'first_deck', xpAwarded: 50 },
  ];

  for (const achievement of userAchievements) {
    await prisma.userAchievement.upsert({
      where: { userId_achievementId: { userId: demoUser.id, achievementId: achievement.achievementId } },
      update: {},
      create: {
        userId: demoUser.id,
        achievementId: achievement.achievementId,
        xpAwarded: achievement.xpAwarded,
        unlockedAt: randomDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), new Date()),
      },
    });
  }

  console.log(`   ✅ Created ${userAchievements.length} achievements for demo user\n`);

  // ---------------------------------------------------------------------------
  // 6. CREATE SAMPLE STUDY SESSIONS
  // ---------------------------------------------------------------------------
  console.log('📖 Creating study sessions...');

  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const sessionDate = new Date(today);
    sessionDate.setDate(today.getDate() - i);
    sessionDate.setHours(randomInt(8, 20), randomInt(0, 59), 0, 0);

    const cardsStudied = randomInt(15, 50);
    const correctCount = Math.floor(cardsStudied * randomFloat(0.7, 0.95));

    await prisma.studySession.create({
      data: {
        userId: demoUser.id,
        deckId: i % 2 === 0 ? languageDeck.id : programmingDeck.id,
        sessionType: 'normal',
        startTime: sessionDate,
        endTime: new Date(sessionDate.getTime() + randomInt(10, 30) * 60 * 1000),
        totalDuration: randomInt(10, 30),
        activeDuration: randomInt(8, 25),
        cardsStudied,
        cardsNew: randomInt(0, 10),
        cardsLearning: randomInt(5, 15),
        cardsReview: randomInt(10, 25),
        correctCount,
        accuracy: correctCount / cardsStudied,
        avgResponseTime: randomInt(2000, 5000),
        xpEarned: randomInt(50, 200),
      },
    });
  }

  console.log(`   ✅ Created 7 study sessions\n`);

  // ---------------------------------------------------------------------------
  // 7. CREATE PLUGINS
  // ---------------------------------------------------------------------------
  console.log('🔌 Creating plugins...');
  const plugins = [
    {
      name: 'Markdown Importer',
      slug: 'markdown-importer',
      version: '1.0.0',
      author: 'Manthanein',
      description: 'Import flashcards from Markdown files with frontmatter',
      category: 'importer',
      isOfficial: true,
      isVerified: true,
      permissions: ['storage:read', 'cards:create'],
      manifestUrl: 'https://plugins.manthanein.com/markdown-importer/manifest.json',
      bundleUrl: 'https://plugins.manthanein.com/markdown-importer/bundle.js',
    },
    {
      name: 'Anki Importer',
      slug: 'anki-importer',
      version: '1.0.0',
      author: 'Manthanein',
      description: 'Import decks from Anki (.apkg) files',
      category: 'importer',
      isOfficial: true,
      isVerified: true,
      permissions: ['storage:read', 'cards:create', 'decks:create'],
      manifestUrl: 'https://plugins.manthanein.com/anki-importer/manifest.json',
      bundleUrl: 'https://plugins.manthanein.com/anki-importer/bundle.js',
    },
    {
      name: 'AI Card Generator',
      slug: 'ai-card-generator',
      version: '1.0.0',
      author: 'Manthanein',
      description: 'Generate flashcards from text using AI',
      category: 'card_generation',
      isOfficial: true,
      isVerified: true,
      permissions: ['cards:create', 'ai:generate'],
      manifestUrl: 'https://plugins.manthanein.com/ai-card-generator/manifest.json',
      bundleUrl: 'https://plugins.manthanein.com/ai-card-generator/bundle.js',
    },
    {
      name: 'Medical Terminology',
      slug: 'medical-terminology',
      version: '1.0.0',
      author: 'Manthanein',
      description: 'Specialized card types and study modes for medical vocabulary',
      category: 'domain_specific',
      isOfficial: true,
      isVerified: true,
      permissions: ['cards:read'],
      manifestUrl: 'https://plugins.manthanein.com/medical-terminology/manifest.json',
      bundleUrl: 'https://plugins.manthanein.com/medical-terminology/bundle.js',
    },
    {
      name: 'Code Syntax Highlighter',
      slug: 'code-syntax-highlighter',
      version: '1.0.0',
      author: 'Manthanein',
      description: 'Syntax highlighting for code snippets in cards',
      category: 'visualization',
      isOfficial: true,
      isVerified: true,
      permissions: [],
      manifestUrl: 'https://plugins.manthanein.com/code-syntax-highlighter/manifest.json',
      bundleUrl: 'https://plugins.manthanein.com/code-syntax-highlighter/bundle.js',
    },
    {
      name: 'Latex Math Renderer',
      slug: 'latex-math-renderer',
      version: '1.0.0',
      author: 'Manthanein',
      description: 'Render LaTeX mathematical equations in cards',
      category: 'visualization',
      isOfficial: true,
      isVerified: true,
      permissions: [],
      manifestUrl: 'https://plugins.manthanein.com/latex-math-renderer/manifest.json',
      bundleUrl: 'https://plugins.manthanein.com/latex-math-renderer/bundle.js',
    },
  ];
  
  for (const plugin of plugins) {
    await prisma.plugin.upsert({
      where: { slug: plugin.slug },
      update: {},
      create: plugin,
    });
  }
  
  console.log(`   ✅ Created ${plugins.length} default plugins\n`);

  // ---------------------------------------------------------------------------
  // 8. CREATE SKILL PROGRESS
  // ---------------------------------------------------------------------------
  console.log('🌳 Creating skill progress...');

  const skills = [
    { treeId: 'learning_fundamentals', nodeId: 'active_recall', level: 3, xpInvested: 1100 },
    { treeId: 'learning_fundamentals', nodeId: 'spaced_repetition', level: 2, xpInvested: 550 },
    { treeId: 'learning_fundamentals', nodeId: 'interleaving', level: 1, xpInvested: 300 },
    { treeId: 'memory_mastery', nodeId: 'memory_palace', level: 2, xpInvested: 1500 },
  ];

  for (const skill of skills) {
    await prisma.userSkillProgress.upsert({
      where: {
        userId_treeId_nodeId: {
          userId: demoUser.id,
          treeId: skill.treeId,
          nodeId: skill.nodeId,
        },
      },
      update: {},
      create: {
        userId: demoUser.id,
        treeId: skill.treeId,
        nodeId: skill.nodeId,
        level: skill.level,
        xpInvested: skill.xpInvested,
        unlockedAt: randomDate(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), new Date()),
      },
    });
  }

  console.log(`   ✅ Created ${skills.length} skill progress entries\n`);

  // ---------------------------------------------------------------------------
  // 9. CREATE NOTIFICATIONS
  // ---------------------------------------------------------------------------
  console.log('🔔 Creating notifications...');

  await prisma.notification.createMany({
    data: [
      {
        userId: demoUser.id,
        type: 'achievement',
        title: 'Achievement Unlocked!',
        body: 'You earned "One Week Wonder" - Maintain a 7-day streak',
        data: { achievementId: 'week_streak' },
        isRead: false,
      },
      {
        userId: demoUser.id,
        type: 'reminder',
        title: 'Time to Study!',
        body: 'You have 45 cards due for review today',
        data: { cardsDue: 45 },
        isRead: true,
      },
      {
        userId: demoUser.id,
        type: 'streak_warning',
        title: 'Streak at Risk!',
        body: 'Complete a review session to maintain your 15-day streak',
        data: { streakDays: 15 },
        isRead: false,
      },
    ],
    skipDuplicates: true,
  });

  console.log(`   ✅ Created sample notifications\n`);

  // Log definitions from shared package
  console.log('📊 Shared package definitions:');
  console.log(`   ${ACHIEVEMENTS.length} achievements defined`);
  console.log(`   ${DEFAULT_SKILL_TREES.length} skill trees defined`);
  console.log(`   ${META_LEARNING_UNLOCKS.length} meta-learning unlocks defined\n`);

  // ---------------------------------------------------------------------------
  // DONE
  // ---------------------------------------------------------------------------
  console.log('✨ Database seeded successfully!\n');
  console.log('📧 Demo accounts:');
  console.log('   Email: demo@manthanein.app');
  console.log('   Password: demo123\n');
  console.log('   Email: test@manthanein.app');
  console.log('   Password: demo123\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
