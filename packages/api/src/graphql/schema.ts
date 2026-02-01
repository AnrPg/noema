// =============================================================================
// GRAPHQL SCHEMA
// =============================================================================

export const schema = `
  scalar DateTime
  scalar JSON

  type Query {
    # User queries
    me: User
    
    # Deck queries
    decks(limit: Int, offset: Int, parentDeckId: ID): DeckConnection!
    deck(id: ID!): Deck
    
    # Card queries
    cards(deckId: ID, limit: Int, offset: Int, state: CardState): CardConnection!
    card(id: ID!): Card
    
    # Study queries
    studyQueue(deckId: ID, limit: Int): StudyQueue!
    todayProgress: TodayProgress!
    
    # Gamification queries
    xpInfo: XPInfo!
    achievements: AchievementsResult!
    streak: StreakInfo!
    skillTrees: [SkillTree!]!
    calibrationScore: CalibrationScore
    memoryIntegrity: MemoryIntegrityScore!
    leaderboard(type: LeaderboardType!, limit: Int): Leaderboard!
    
    # Plugin queries
    plugins(category: String, limit: Int, offset: Int): PluginConnection!
    installedPlugins: [InstalledPlugin!]!
  }

  type Mutation {
    # Auth mutations
    register(input: RegisterInput!): AuthPayload!
    login(input: LoginInput!): AuthPayload!
    refreshToken(refreshToken: String!): TokenPayload!
    
    # User mutations
    updateProfile(input: UpdateProfileInput!): User!
    updatePreferences(input: UpdatePreferencesInput!): UserPreferences!
    
    # Deck mutations
    createDeck(input: CreateDeckInput!): Deck!
    updateDeck(id: ID!, input: UpdateDeckInput!): Deck!
    deleteDeck(id: ID!): Boolean!
    shareDeck(id: ID!): ShareResult!
    cloneDeck(shareCode: String!): Deck!
    
    # Card mutations
    createCard(input: CreateCardInput!): Card!
    createCards(input: CreateCardsInput!): BulkCreateResult!
    updateCard(id: ID!, input: UpdateCardInput!): Card!
    deleteCard(id: ID!): Boolean!
    suspendCard(id: ID!): Card!
    unsuspendCard(id: ID!): Card!
    
    # Review mutations
    reviewCard(input: ReviewInput!): ReviewResult!
    
    # Study session mutations
    startStudySession(input: StartSessionInput!): StudySession!
    endStudySession(id: ID!): StudySession!
    
    # Gamification mutations
    useStreakFreeze: StreakInfo!
    upgradeSkill(treeId: ID!, nodeId: ID!): SkillUpgradeResult!
    
    # Plugin mutations
    installPlugin(pluginId: ID!): InstalledPlugin!
    uninstallPlugin(pluginId: ID!): Boolean!
    togglePlugin(pluginId: ID!): InstalledPlugin!
    updatePluginSettings(pluginId: ID!, settings: JSON!): InstalledPlugin!
  }

  # ==========================================================================
  # TYPES
  # ==========================================================================

  type User {
    id: ID!
    email: String!
    displayName: String!
    avatarUrl: String
    isEmailVerified: Boolean!
    createdAt: DateTime!
    preferences: UserPreferences
    learningStats: UserLearningStats
    cognitiveProfile: CognitiveProfile
  }

  type UserPreferences {
    theme: String!
    language: String!
    timezone: String!
    dailyGoal: Int!
    sessionDuration: Int!
    newCardsPerDay: Int!
    maxReviewsPerDay: Int!
    enableReminders: Boolean!
    reminderTime: String!
    schedulerType: String!
    audioEnabled: Boolean!
    animationsEnabled: Boolean!
  }

  type UserLearningStats {
    totalReviews: Int!
    totalCards: Int!
    masteredCards: Int!
    totalStudyTime: Int!
    totalXP: Int!
    level: Int!
    currentStreak: Int!
    longestStreak: Int!
    averageAccuracy: Float!
    retentionRate: Float!
  }

  type CognitiveProfile {
    preferredModality: String!
    optimalSessionLength: Int!
    peakPerformanceHours: [Int!]!
    workingMemoryCapacity: Float!
    processingSpeed: Float!
    attentionSpan: Int!
  }

  type Deck {
    id: ID!
    name: String!
    description: String
    coverImageUrl: String
    iconEmoji: String
    color: String
    parentDeck: Deck
    subDecks: [Deck!]!
    cardCount: Int!
    newCount: Int!
    learningCount: Int!
    reviewCount: Int!
    masteredCount: Int!
    dueCount: Int!
    tags: [String!]!
    category: String
    language: String!
    isPublic: Boolean!
    shareCode: String
    downloadCount: Int!
    createdAt: DateTime!
    updatedAt: DateTime!
    lastStudiedAt: DateTime
    cards(limit: Int, offset: Int): CardConnection!
  }

  type DeckConnection {
    data: [Deck!]!
    pagination: Pagination!
  }

  type Card {
    id: ID!
    deck: Deck!
    cardType: String!
    content: JSON!
    state: CardState!
    stability: Float!
    difficulty: Float!
    reps: Int!
    lapses: Int!
    lastReviewDate: DateTime
    nextReviewDate: DateTime
    tags: [String!]!
    flags: [String!]!
    notes: String
    source: String
    totalReviews: Int!
    correctReviews: Int!
    averageTime: Int!
    createdAt: DateTime!
    updatedAt: DateTime!
    media: [CardMedia!]!
    reviewHistory(limit: Int): [ReviewRecord!]!
  }

  type CardConnection {
    data: [Card!]!
    pagination: Pagination!
  }

  type CardMedia {
    id: ID!
    type: String!
    url: String!
    filename: String!
    mimeType: String!
    width: Int
    height: Int
    duration: Int
  }

  enum CardState {
    new
    learning
    review
    relearning
    mastered
  }

  type ReviewRecord {
    id: ID!
    rating: Int!
    responseTime: Int!
    previousState: String!
    newState: String!
    scheduledDays: Float!
    confidenceBefore: Float
    createdAt: DateTime!
  }

  type StudyQueue {
    queue: [Card!]!
    counts: StudyQueueCounts!
  }

  type StudyQueueCounts {
    new: Int!
    due: Int!
    total: Int!
  }

  type TodayProgress {
    reviewsCompleted: Int!
    dailyGoal: Int!
    goalProgress: Int!
    xpEarned: Int!
    remainingNew: Int!
    remainingDue: Int!
    totalRemaining: Int!
  }

  type StudySession {
    id: ID!
    deck: Deck
    sessionType: String!
    startTime: DateTime!
    endTime: DateTime
    totalDuration: Int!
    cardsStudied: Int!
    correctCount: Int!
    accuracy: Float!
    xpEarned: Int!
  }

  type ReviewResult {
    review: ReviewRecord!
    nextReview: NextReviewInfo!
    gamification: GamificationResult!
  }

  type NextReviewInfo {
    interval: Float!
    nextReviewDate: DateTime!
    stability: Float!
    difficulty: Float!
  }

  type GamificationResult {
    xpEarned: Int!
    newCombo: Int!
    comboLost: Boolean!
    newAchievements: [AchievementUnlock!]!
    newMetaLearningUnlocks: [MetaLearningUnlock!]!
  }

  type AchievementUnlock {
    id: ID!
    name: String!
    xpReward: Int!
  }

  type MetaLearningUnlock {
    id: ID!
    name: String!
  }

  # Gamification types
  type XPInfo {
    totalXP: Int!
    level: Int!
    currentLevelXP: Int!
    nextLevelXP: Int!
    progressPercent: Int!
  }

  type AchievementsResult {
    achievements: [Achievement!]!
    stats: AchievementStats!
  }

  type Achievement {
    id: ID!
    name: String!
    description: String!
    category: String!
    rarity: String!
    iconUrl: String!
    xpReward: Int!
    isUnlocked: Boolean!
    unlockedAt: DateTime
    progress: AchievementProgress
  }

  type AchievementProgress {
    currentValue: Int!
    targetValue: Int!
    percentComplete: Float!
  }

  type AchievementStats {
    total: Int!
    unlocked: Int!
    percentComplete: Int!
  }

  type StreakInfo {
    currentStreak: Int!
    longestStreak: Int!
    lastActivityDate: DateTime
    isAtRisk: Boolean!
    hoursRemaining: Float!
    freezeCount: Int!
  }

  type SkillTree {
    id: ID!
    name: String!
    description: String!
    category: String!
    iconUrl: String!
    nodes: [SkillNode!]!
    totalXPRequired: Int!
  }

  type SkillNode {
    id: ID!
    name: String!
    description: String!
    level: Int!
    maxLevel: Int!
    xpRequired: [Int!]!
    prerequisites: [ID!]!
    effects: [SkillEffect!]!
    iconUrl: String!
    unlockedAt: DateTime
  }

  type SkillEffect {
    type: String!
    value: JSON!
  }

  type SkillUpgradeResult {
    success: Boolean!
    xpSpent: Int!
    effects: [SkillEffect!]!
  }

  type CalibrationScore {
    score: Float!
    overconfidence: Float!
    underconfidence: Float!
    sampleSize: Int!
  }

  type MemoryIntegrityScore {
    score: Int!
    trend: String!
    factors: [MemoryFactor!]!
  }

  type MemoryFactor {
    name: String!
    impact: String!
    description: String!
  }

  enum LeaderboardType {
    xp
    streak
    mastery
    reviews
  }

  type Leaderboard {
    type: LeaderboardType!
    entries: [LeaderboardEntry!]!
    currentUser: LeaderboardPosition!
  }

  type LeaderboardEntry {
    rank: Int!
    userId: ID!
    displayName: String!
    avatarUrl: String
    score: Int!
  }

  type LeaderboardPosition {
    rank: Int!
    score: Int!
  }

  # Plugin types
  type Plugin {
    id: ID!
    name: String!
    slug: String!
    version: String!
    author: String!
    description: String
    category: String!
    iconUrl: String
    repository: String
    homepage: String
    downloadCount: Int!
    rating: Float!
    ratingCount: Int!
    isVerified: Boolean!
    isOfficial: Boolean!
    permissions: [String!]!
  }

  type PluginConnection {
    data: [Plugin!]!
    pagination: Pagination!
  }

  type InstalledPlugin {
    id: ID!
    plugin: Plugin!
    isEnabled: Boolean!
    settings: JSON!
    installedAt: DateTime!
  }

  # Common types
  type Pagination {
    total: Int!
    limit: Int!
    offset: Int!
    hasMore: Boolean!
  }

  type AuthPayload {
    user: User!
    accessToken: String!
    refreshToken: String!
  }

  type TokenPayload {
    accessToken: String!
    refreshToken: String!
  }

  type ShareResult {
    shareCode: String!
    shareUrl: String!
  }

  type BulkCreateResult {
    created: Int!
  }

  # ==========================================================================
  # INPUTS
  # ==========================================================================

  input RegisterInput {
    email: String!
    password: String!
    displayName: String!
  }

  input LoginInput {
    email: String!
    password: String!
  }

  input UpdateProfileInput {
    displayName: String
    avatarUrl: String
  }

  input UpdatePreferencesInput {
    theme: String
    language: String
    timezone: String
    dailyGoal: Int
    sessionDuration: Int
    newCardsPerDay: Int
    maxReviewsPerDay: Int
    enableReminders: Boolean
    reminderTime: String
    schedulerType: String
    audioEnabled: Boolean
    animationsEnabled: Boolean
  }

  input CreateDeckInput {
    name: String!
    description: String
    coverImageUrl: String
    iconEmoji: String
    color: String
    parentDeckId: ID
    tags: [String!]
    category: String
    language: String
  }

  input UpdateDeckInput {
    name: String
    description: String
    coverImageUrl: String
    iconEmoji: String
    color: String
    tags: [String!]
    category: String
  }

  input CreateCardInput {
    deckId: ID!
    cardType: String!
    content: JSON!
    tags: [String!]
    notes: String
    source: String
  }

  input CreateCardsInput {
    deckId: ID!
    cards: [CardInput!]!
  }

  input CardInput {
    cardType: String!
    content: JSON!
    tags: [String!]
    notes: String
    source: String
  }

  input UpdateCardInput {
    cardType: String
    content: JSON
    tags: [String!]
    notes: String
    flags: [String!]
  }

  input ReviewInput {
    cardId: ID!
    rating: Int!
    responseTimeMs: Int!
    confidenceBefore: Float
    studySessionId: ID
  }

  input StartSessionInput {
    deckId: ID
    sessionType: String
    limit: Int
  }
`;
