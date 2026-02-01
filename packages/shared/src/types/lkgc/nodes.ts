// =============================================================================
// LKGC NODES - Typed Property Graph Node Types
// =============================================================================
// Defines all node types in the LKGC knowledge graph.
// Organized by domain: Knowledge, Pedagogy, Metacognition, Gamification, System
//
// Each node type is explicit and extensible, supporting the full provenance,
// privacy, and sync requirements from the foundation.
// =============================================================================

import type {
  LKGCEntity,
  EntityId,
  NodeId,
  UserId,
  Timestamp,
  Duration,
  Confidence,
  NormalizedValue,
} from "./foundation";

// =============================================================================
// NODE TYPE DISCRIMINATOR
// =============================================================================

/**
 * All possible node types in the LKGC graph
 */
export type NodeType =
  // Knowledge & learning content
  | "card"
  | "note"
  | "concept"
  | "term"
  | "fact"
  | "formula"
  | "procedure"
  | "example"
  | "counterexample"
  | "question"
  | "resource"
  | "chunk"
  // Pedagogy & curriculum
  | "goal"
  | "learning_path"
  | "milestone"
  | "assessment"
  | "rubric"
  // Metacognition
  | "strategy"
  | "reflection"
  | "prediction"
  | "error_pattern"
  // Gamification
  | "quest"
  | "challenge"
  | "badge"
  | "streak_rule"
  | "boss"
  | "reward"
  // Social / plugin / system
  | "plugin_module"
  | "experiment"
  | "notification_template";

// =============================================================================
// BASE NODE - Common structure for all nodes
// =============================================================================

/**
 * Base interface for all graph nodes
 */
export interface BaseNode extends LKGCEntity<NodeId> {
  readonly id: NodeId;
  readonly nodeType: NodeType;

  /** Human-readable title/name */
  readonly title: string;

  /** Optional description */
  readonly description?: string;

  /** Creation source (Obsidian file path, import, etc.) */
  readonly sourcePath?: string;

  /** Obsidian frontmatter (for compatibility) */
  readonly frontmatter?: Readonly<Record<string, unknown>>;

  /** Aliases/synonyms for this node */
  readonly aliases?: readonly string[];

  /** Archived state (hidden but preserved) */
  readonly archivedAt?: Timestamp;
}

// =============================================================================
// KNOWLEDGE & LEARNING CONTENT NODES
// =============================================================================

/**
 * Media type for content
 */
export type MediaType =
  | "text"
  | "markdown"
  | "latex"
  | "html"
  | "audio"
  | "image"
  | "video";

/**
 * Card - The primary learning unit (flashcard/prompt)
 */
export interface CardNode extends BaseNode {
  readonly nodeType: "card";

  /** Front of card (question/prompt) */
  readonly front: ContentBlock;

  /** Back of card (answer) */
  readonly back: ContentBlock;

  /** Optional hints (progressive disclosure) */
  readonly hints?: readonly ContentBlock[];

  /** Optional extended explanation */
  readonly explanation?: ContentBlock;

  /** Card model type */
  readonly cardModel: CardModel;

  /** Scheduling state (FSRS/HLR parameters) */
  readonly scheduling: SchedulingState;

  /** Deck membership (can belong to multiple) */
  readonly deckIds: readonly EntityId[];

  /** Suspended state (excluded from review) */
  readonly suspendedAt?: Timestamp;
  readonly suspendReason?: string;

  /** Leech state (problematic card) */
  readonly isLeech: boolean;
  readonly leechCount: number;
}

/**
 * Content block with media type
 */
export interface ContentBlock {
  readonly content: string;
  readonly mediaType: MediaType;
  readonly audioUrl?: string;
  readonly imageUrls?: readonly string[];
}

/**
 * Card model types
 */
export type CardModel =
  | "basic" // Simple front/back
  | "basic_reversed" // Both directions
  | "cloze" // Fill in the blank
  | "type_answer" // Type the answer
  | "image_occlusion" // Hidden regions on image
  | "listening" // Audio comprehension
  | "speaking"; // Pronunciation

/**
 * Scheduling state for spaced repetition
 */
export interface SchedulingState {
  /** FSRS difficulty parameter */
  readonly difficulty: NormalizedValue;

  /** FSRS stability (days until R drops to 90%) */
  readonly stability: number;

  /** Current retrievability estimate */
  readonly retrievability: NormalizedValue;

  /** Number of successful reviews */
  readonly reps: number;

  /** Number of lapses (forgotten after learned) */
  readonly lapses: number;

  /** Current learning state */
  readonly state: "new" | "learning" | "review" | "relearning";

  /** Next scheduled review date */
  readonly due: Timestamp;

  /** Last review date */
  readonly lastReview?: Timestamp;

  /** Elapsed days since introduced */
  readonly elapsedDays: number;

  /** Scheduled days (interval) */
  readonly scheduledDays: number;
}

/**
 * Note - Obsidian-like longform content
 */
export interface NoteNode extends BaseNode {
  readonly nodeType: "note";

  /** Full markdown content */
  readonly content: string;

  /** Extracted wikilinks [[target]] */
  readonly outgoingLinks: readonly string[];

  /** Computed backlinks (populated by graph) */
  readonly incomingLinks?: readonly NodeId[];

  /** Word count */
  readonly wordCount: number;

  /** Reading time estimate (minutes) */
  readonly readingTime: Duration;

  /** Last edit position (for resuming) */
  readonly lastEditPosition?: number;
}

/**
 * Concept - Abstract semantic unit
 */
export interface ConceptNode extends BaseNode {
  readonly nodeType: "concept";

  /** Formal definition */
  readonly definition: string;

  /** Intuitive explanation */
  readonly intuition?: string;

  /** Domain/subject area */
  readonly domain: string;

  /** Abstraction level (1=concrete, 5=highly abstract) */
  readonly abstractionLevel: 1 | 2 | 3 | 4 | 5;

  /** Prerequisites confidence (how well prereqs are known) */
  readonly prerequisitesMastery?: NormalizedValue;
}

/**
 * Term - Vocabulary token
 */
export interface TermNode extends BaseNode {
  readonly nodeType: "term";

  /** The term itself */
  readonly term: string;

  /** Definition(s) */
  readonly definitions: readonly string[];

  /** Part of speech */
  readonly partOfSpeech?: string;

  /** Language code */
  readonly language: string;

  /** Pronunciation (IPA) */
  readonly pronunciation?: string;

  /** Audio pronunciation URL */
  readonly audioUrl?: string;

  /** Example sentences */
  readonly examples?: readonly string[];

  /** Etymology */
  readonly etymology?: string;

  /** Frequency rank (if known) */
  readonly frequencyRank?: number;
}

/**
 * Fact - Atomic assertion
 */
export interface FactNode extends BaseNode {
  readonly nodeType: "fact";

  /** The factual claim */
  readonly claim: string;

  /** Evidence/source for the fact */
  readonly evidence?: string;

  /** Citation */
  readonly citation?: string;

  /** Verification status */
  readonly verified: boolean;

  /** Confidence in accuracy */
  readonly factConfidence: Confidence;
}

/**
 * Formula - Mathematical or scientific formula
 */
export interface FormulaNode extends BaseNode {
  readonly nodeType: "formula";

  /** LaTeX representation */
  readonly latex: string;

  /** Plain text representation */
  readonly plainText?: string;

  /** Variables and their meanings */
  readonly variables: readonly FormulaVariable[];

  /** Domain of applicability */
  readonly domain: string;

  /** Derivation/proof (optional) */
  readonly derivation?: string;
}

export interface FormulaVariable {
  readonly symbol: string;
  readonly meaning: string;
  readonly unit?: string;
  readonly constraints?: string;
}

/**
 * Procedure - Step-by-step process
 */
export interface ProcedureNode extends BaseNode {
  readonly nodeType: "procedure";

  /** Ordered steps */
  readonly steps: readonly ProcedureStep[];

  /** Prerequisites */
  readonly prerequisites?: readonly string[];

  /** Expected outcome */
  readonly outcome: string;

  /** Estimated time to complete */
  readonly estimatedTime?: Duration;

  /** Common mistakes */
  readonly commonMistakes?: readonly string[];
}

export interface ProcedureStep {
  readonly order: number;
  readonly instruction: string;
  readonly explanation?: string;
  readonly imageUrl?: string;
  readonly checkpoints?: readonly string[];
}

/**
 * Example - Illustrative instance
 */
export interface ExampleNode extends BaseNode {
  readonly nodeType: "example";

  /** The example content */
  readonly content: string;

  /** What concept/principle this exemplifies */
  readonly illustrates: string;

  /** Explanation of how it illustrates the concept */
  readonly explanation?: string;

  /** Difficulty level */
  readonly difficulty: NormalizedValue;
}

/**
 * Counterexample - Shows where a rule doesn't apply
 */
export interface CounterexampleNode extends BaseNode {
  readonly nodeType: "counterexample";

  /** The counterexample */
  readonly content: string;

  /** What claim/rule this counters */
  readonly counters: string;

  /** Why it's a counterexample */
  readonly explanation: string;

  /** Conditions under which the original rule fails */
  readonly failureConditions?: string;
}

/**
 * Question - Open-ended question (not a flashcard)
 */
export interface QuestionNode extends BaseNode {
  readonly nodeType: "question";

  /** The question */
  readonly question: string;

  /** Type of question */
  readonly questionType:
    | "conceptual"
    | "application"
    | "analysis"
    | "synthesis"
    | "evaluation";

  /** Possible answers/perspectives */
  readonly possibleAnswers?: readonly string[];

  /** User's current answer */
  readonly userAnswer?: string;

  /** Discussion/exploration notes */
  readonly discussion?: string;
}

/**
 * Resource - External material (PDF, video, URL)
 */
export interface ResourceNode extends BaseNode {
  readonly nodeType: "resource";

  /** Resource type */
  readonly resourceType:
    | "pdf"
    | "video"
    | "audio"
    | "webpage"
    | "book"
    | "article"
    | "other";

  /** URL or file path */
  readonly url: string;

  /** Local file path (if downloaded) */
  readonly localPath?: string;

  /** File size in bytes */
  readonly fileSize?: number;

  /** Duration (for video/audio) */
  readonly duration?: Duration;

  /** Page count (for documents) */
  readonly pageCount?: number;

  /** Author/creator */
  readonly author?: string;

  /** Publication date */
  readonly publishedAt?: Timestamp;

  /** User's progress through resource */
  readonly progress?: NormalizedValue;

  /** Highlights and annotations */
  readonly highlights?: readonly ResourceHighlight[];
}

export interface ResourceHighlight {
  readonly id: EntityId;
  readonly content: string;
  readonly position: string; // Page/timestamp/etc.
  readonly note?: string;
  readonly createdAt: Timestamp;
}

/**
 * Chunk - Extracted segment from a resource
 */
export interface ChunkNode extends BaseNode {
  readonly nodeType: "chunk";

  /** Source resource ID */
  readonly sourceResourceId: NodeId;

  /** The extracted content */
  readonly content: string;

  /** Position in source (page, timestamp, etc.) */
  readonly position: string;

  /** Embedding vector (for semantic search) */
  readonly embedding?: readonly number[];

  /** Extraction method */
  readonly extractionMethod: "manual" | "ocr" | "transcription" | "ai_summary";
}

// =============================================================================
// PEDAGOGY & CURRICULUM NODES
// =============================================================================

/**
 * Goal - Learning objective
 */
export interface GoalNode extends BaseNode {
  readonly nodeType: "goal";

  /** Goal type */
  readonly goalType: "mastery" | "completion" | "streak" | "time" | "custom";

  /** Target metrics */
  readonly target: GoalTarget;

  /** Current progress */
  readonly progress: NormalizedValue;

  /** Deadline (if any) */
  readonly deadline?: Timestamp;

  /** Status */
  readonly status: "active" | "completed" | "abandoned" | "paused";

  /** Completion timestamp */
  readonly completedAt?: Timestamp;

  /** Parent goal (for hierarchical goals) */
  readonly parentGoalId?: NodeId;

  /** Reward on completion */
  readonly rewardId?: NodeId;
}

export interface GoalTarget {
  readonly metric: string;
  readonly value: number;
  readonly unit: string;
}

/**
 * LearningPath - Curated sequence of learning
 */
export interface LearningPathNode extends BaseNode {
  readonly nodeType: "learning_path";

  /** Ordered steps in the path */
  readonly steps: readonly LearningPathStep[];

  /** Estimated total time */
  readonly estimatedTime: Duration;

  /** Difficulty level */
  readonly difficulty: "beginner" | "intermediate" | "advanced" | "expert";

  /** Prerequisites for starting */
  readonly prerequisites?: readonly NodeId[];

  /** Current step (for user progress) */
  readonly currentStep?: number;

  /** Completion percentage */
  readonly completion: NormalizedValue;
}

export interface LearningPathStep {
  readonly order: number;
  readonly title: string;
  readonly description?: string;
  readonly targetNodeIds: readonly NodeId[];
  readonly estimatedTime?: Duration;
  readonly assessmentId?: NodeId;
  readonly completed: boolean;
}

/**
 * Milestone - Achievement point in learning
 */
export interface MilestoneNode extends BaseNode {
  readonly nodeType: "milestone";

  /** What achieving this signifies */
  readonly significance: string;

  /** Criteria for completion */
  readonly criteria: readonly MilestoneCriterion[];

  /** Status */
  readonly achieved: boolean;

  /** Achievement timestamp */
  readonly achievedAt?: Timestamp;

  /** Celebration message */
  readonly celebration?: string;
}

export interface MilestoneCriterion {
  readonly description: string;
  readonly metric: string;
  readonly threshold: number;
  readonly current: number;
  readonly met: boolean;
}

/**
 * Assessment - Formal evaluation
 */
export interface AssessmentNode extends BaseNode {
  readonly nodeType: "assessment";

  /** Assessment type */
  readonly assessmentType:
    | "quiz"
    | "test"
    | "exam"
    | "self_assessment"
    | "peer_review";

  /** Questions/tasks */
  readonly items: readonly AssessmentItem[];

  /** Time limit (if any) */
  readonly timeLimit?: Duration;

  /** Passing score */
  readonly passingScore: NormalizedValue;

  /** Most recent attempt */
  readonly lastAttempt?: AssessmentAttempt;

  /** All attempts */
  readonly attempts: readonly AssessmentAttempt[];

  /** Rubric for grading */
  readonly rubricId?: NodeId;
}

export interface AssessmentItem {
  readonly id: EntityId;
  readonly question: string;
  readonly type: "multiple_choice" | "short_answer" | "essay" | "practical";
  readonly points: number;
  readonly correctAnswer?: string;
  readonly options?: readonly string[];
}

export interface AssessmentAttempt {
  readonly id: EntityId;
  readonly startedAt: Timestamp;
  readonly completedAt?: Timestamp;
  readonly score: NormalizedValue;
  readonly passed: boolean;
  readonly answers: readonly AssessmentAnswer[];
}

export interface AssessmentAnswer {
  readonly itemId: EntityId;
  readonly answer: string;
  readonly correct: boolean;
  readonly points: number;
  readonly feedback?: string;
}

/**
 * Rubric - Grading criteria
 */
export interface RubricNode extends BaseNode {
  readonly nodeType: "rubric";

  /** Criteria for evaluation */
  readonly criteria: readonly RubricCriterion[];

  /** Total possible points */
  readonly totalPoints: number;

  /** Holistic description of each level */
  readonly levelDescriptions?: Readonly<Record<string, string>>;
}

export interface RubricCriterion {
  readonly name: string;
  readonly description: string;
  readonly weight: NormalizedValue;
  readonly levels: readonly RubricLevel[];
}

export interface RubricLevel {
  readonly score: number;
  readonly label: string;
  readonly description: string;
}

// =============================================================================
// METACOGNITION NODES
// =============================================================================

/**
 * Strategy - Learning/study strategy
 */
export interface StrategyNode extends BaseNode {
  readonly nodeType: "strategy";

  /** Strategy category */
  readonly category:
    | "imagery"
    | "elaboration"
    | "retrieval_practice"
    | "spaced_practice"
    | "interleaving"
    | "dual_coding"
    | "self_explanation"
    | "summarization"
    | "mnemonics"
    | "chunking"
    | "other";

  /** How to apply this strategy */
  readonly instructions: string;

  /** When this strategy is most effective */
  readonly bestFor: readonly string[];

  /** When to avoid this strategy */
  readonly avoidFor?: readonly string[];

  /** Research evidence for effectiveness */
  readonly evidenceStrength: "strong" | "moderate" | "weak" | "anecdotal";

  /** User's personal efficacy with this strategy */
  readonly personalEfficacy?: NormalizedValue;

  /** Times used */
  readonly usageCount: number;
}

/**
 * Reflection - Metacognitive journal entry
 */
export interface ReflectionNode extends BaseNode {
  readonly nodeType: "reflection";

  /** Reflection type */
  readonly reflectionType:
    | "session"
    | "daily"
    | "weekly"
    | "topic"
    | "strategy"
    | "goal";

  /** What the reflection is about */
  readonly subject?: NodeId;

  /** Structured reflection content */
  readonly content: ReflectionContent;

  /** Overall sentiment */
  readonly sentiment: "positive" | "neutral" | "negative" | "mixed";

  /** Quality score (self or rubric-assessed) */
  readonly qualityScore?: NormalizedValue;

  /** Action items generated */
  readonly actionItems?: readonly string[];

  /** Follow-up scheduled */
  readonly followUpAt?: Timestamp;
}

export interface ReflectionContent {
  /** What worked well */
  readonly whatWorked?: string;

  /** What didn't work */
  readonly whatDidntWork?: string;

  /** Key insights */
  readonly insights?: string;

  /** Planned adjustments */
  readonly plannedAdjustments?: string;

  /** Free-form notes */
  readonly notes?: string;

  /** Audio reflection URL */
  readonly audioUrl?: string;
}

/**
 * Prediction - Metacognitive forecast
 */
export interface PredictionNode extends BaseNode {
  readonly nodeType: "prediction";

  /** What is being predicted */
  readonly predictionType:
    | "recall" // Will I remember this?
    | "performance" // How will I do on X?
    | "time_to_mastery" // How long until I master X?
    | "difficulty" // How hard will X be?
    | "retention"; // How long will I retain X?

  /** Subject of prediction */
  readonly subjectId: NodeId;

  /** Predicted value */
  readonly predictedValue: number;

  /** Confidence in prediction */
  readonly confidence: Confidence;

  /** When prediction was made */
  readonly predictedAt: Timestamp;

  /** Actual outcome (once known) */
  readonly actualValue?: number;

  /** When outcome was observed */
  readonly observedAt?: Timestamp;

  /** Calibration error (predicted - actual) */
  readonly calibrationError?: number;
}

/**
 * ErrorPattern - Recurring mistake pattern
 */
export interface ErrorPatternNode extends BaseNode {
  readonly nodeType: "error_pattern";

  /** Type of error */
  readonly errorType:
    | "memory_failure" // Simply forgot
    | "misunderstanding" // Conceptual error
    | "misreading" // Careless reading error
    | "interference" // Confused with similar
    | "partial_knowledge" // Knew part of it
    | "procedural" // Execution error
    | "time_pressure"; // Knew it but too slow

  /** Pattern description */
  readonly pattern: string;

  /** Triggering conditions */
  readonly triggers?: readonly string[];

  /** Affected nodes */
  readonly affectedNodeIds: readonly NodeId[];

  /** Occurrence count */
  readonly occurrenceCount: number;

  /** Last occurrence */
  readonly lastOccurrence: Timestamp;

  /** Remediation strategies */
  readonly remediationStrategies?: readonly NodeId[];

  /** Is this pattern resolved? */
  readonly resolved: boolean;
  readonly resolvedAt?: Timestamp;
}

// =============================================================================
// GAMIFICATION NODES
// =============================================================================

/**
 * Quest - Extended learning challenge
 */
export interface QuestNode extends BaseNode {
  readonly nodeType: "quest";

  /** Quest narrative */
  readonly narrative: string;

  /** Quest type */
  readonly questType: "main" | "side" | "daily" | "weekly" | "event";

  /** Objectives to complete */
  readonly objectives: readonly QuestObjective[];

  /** Rewards on completion */
  readonly rewards: readonly NodeId[];

  /** Status */
  readonly status: "available" | "active" | "completed" | "failed" | "expired";

  /** Time limit */
  readonly deadline?: Timestamp;

  /** Required level/XP to start */
  readonly requirements?: QuestRequirements;

  /** Accepted timestamp */
  readonly acceptedAt?: Timestamp;

  /** Completion timestamp */
  readonly completedAt?: Timestamp;
}

export interface QuestObjective {
  readonly id: EntityId;
  readonly description: string;
  readonly target: number;
  readonly current: number;
  readonly completed: boolean;
}

export interface QuestRequirements {
  readonly minLevel?: number;
  readonly minXp?: number;
  readonly prerequisiteQuests?: readonly NodeId[];
  readonly prerequisiteBadges?: readonly NodeId[];
}

/**
 * Challenge - Short-term competitive task
 */
export interface ChallengeNode extends BaseNode {
  readonly nodeType: "challenge";

  /** Challenge type */
  readonly challengeType:
    | "speed"
    | "accuracy"
    | "streak"
    | "volume"
    | "consistency";

  /** Difficulty level */
  readonly difficulty: "easy" | "medium" | "hard" | "extreme";

  /** Target metric */
  readonly target: GoalTarget;

  /** Time window */
  readonly duration: Duration;

  /** Status */
  readonly status: "available" | "active" | "completed" | "failed";

  /** Rewards */
  readonly rewards: readonly NodeId[];

  /** Leaderboard position (if competitive) */
  readonly leaderboardPosition?: number;
}

/**
 * Badge - Achievement marker
 */
export interface BadgeNode extends BaseNode {
  readonly nodeType: "badge";

  /** Badge category */
  readonly category:
    | "milestone"
    | "streak"
    | "mastery"
    | "exploration"
    | "consistency"
    | "special"
    | "community";

  /** Rarity */
  readonly rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";

  /** Icon/image URL */
  readonly iconUrl: string;

  /** Criteria for earning */
  readonly criteria: string;

  /** Is this badge earned? */
  readonly earned: boolean;

  /** When earned */
  readonly earnedAt?: Timestamp;

  /** Progress toward earning (if not yet earned) */
  readonly progress?: NormalizedValue;

  /** XP bonus on earning */
  readonly xpReward: number;
}

/**
 * StreakRule - Defines streak mechanics
 */
export interface StreakRuleNode extends BaseNode {
  readonly nodeType: "streak_rule";

  /** What counts toward the streak */
  readonly requirement: StreakRequirement;

  /** Current streak count */
  readonly currentStreak: number;

  /** Longest streak achieved */
  readonly longestStreak: number;

  /** Last activity timestamp */
  readonly lastActivity?: Timestamp;

  /** Freeze protection remaining */
  readonly freezesRemaining: number;

  /** Rewards at milestones */
  readonly milestoneRewards?: Readonly<Record<number, NodeId>>;
}

export interface StreakRequirement {
  readonly metric: "reviews" | "time" | "cards_learned" | "sessions";
  readonly threshold: number;
  readonly period: "daily" | "weekly";
  readonly timezone: string;
}

/**
 * Boss - Major challenge/test
 */
export interface BossNode extends BaseNode {
  readonly nodeType: "boss";

  /** Boss narrative */
  readonly narrative: string;

  /** Required concepts/skills to defeat */
  readonly requiredMastery: readonly NodeId[];

  /** Minimum mastery level required */
  readonly masteryThreshold: NormalizedValue;

  /** Time limit for attempt */
  readonly timeLimit: Duration;

  /** Number of attempts allowed */
  readonly maxAttempts: number;

  /** Current attempt count */
  readonly attempts: number;

  /** Defeated? */
  readonly defeated: boolean;

  /** Defeat timestamp */
  readonly defeatedAt?: Timestamp;

  /** Rewards */
  readonly rewards: readonly NodeId[];

  /** Boss health/phases */
  readonly phases?: readonly BossPhase[];
}

export interface BossPhase {
  readonly order: number;
  readonly name: string;
  readonly description: string;
  readonly requiredScore: NormalizedValue;
  readonly completed: boolean;
}

/**
 * Reward - Earned benefit
 */
export interface RewardNode extends BaseNode {
  readonly nodeType: "reward";

  /** Reward type */
  readonly rewardType: "cosmetic" | "functional" | "xp" | "currency" | "unlock";

  /** Specific reward */
  readonly reward: RewardContent;

  /** Is reward claimed? */
  readonly claimed: boolean;

  /** Claim timestamp */
  readonly claimedAt?: Timestamp;

  /** Expiration */
  readonly expiresAt?: Timestamp;
}

export type RewardContent =
  | { type: "xp"; amount: number }
  | { type: "currency"; amount: number; currency: string }
  | {
      type: "cosmetic";
      itemId: string;
      itemType: "theme" | "avatar" | "badge_frame";
    }
  | { type: "functional"; feature: string; duration?: Duration }
  | { type: "unlock"; nodeId: NodeId };

// =============================================================================
// SOCIAL / PLUGIN / SYSTEM NODES
// =============================================================================

/**
 * PluginModule - Extension/plugin definition
 */
export interface PluginModuleNode extends BaseNode {
  readonly nodeType: "plugin_module";

  /** Plugin identifier */
  readonly pluginId: string;

  /** Version */
  readonly version: string;

  /** Author */
  readonly author: string;

  /** Plugin capabilities */
  readonly capabilities: readonly PluginCapability[];

  /** Is plugin enabled? */
  readonly enabled: boolean;

  /** Plugin configuration */
  readonly config?: Readonly<Record<string, unknown>>;

  /** Last error (if any) */
  readonly lastError?: string;
}

export type PluginCapability =
  | "import_parser"
  | "export_format"
  | "scheduling_algorithm"
  | "ai_provider"
  | "theme"
  | "gamification"
  | "analytics"
  | "sync_provider";

/**
 * Experiment - A/B test definition
 */
export interface ExperimentNode extends BaseNode {
  readonly nodeType: "experiment";

  /** Experiment hypothesis */
  readonly hypothesis: string;

  /** Variants */
  readonly variants: readonly ExperimentVariant[];

  /** Current assignment */
  readonly assignedVariant?: string;

  /** Metrics to measure */
  readonly metrics: readonly string[];

  /** Start date */
  readonly startDate: Timestamp;

  /** End date */
  readonly endDate?: Timestamp;

  /** Status */
  readonly status: "draft" | "running" | "paused" | "completed" | "cancelled";

  /** Results (once completed) */
  readonly results?: ExperimentResults;
}

export interface ExperimentVariant {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly weight: NormalizedValue;
  readonly config: Readonly<Record<string, unknown>>;
}

export interface ExperimentResults {
  readonly winningVariant?: string;
  readonly significance: number;
  readonly metrics: Readonly<Record<string, number>>;
}

/**
 * NotificationTemplate - Coaching/reminder template
 */
export interface NotificationTemplateNode extends BaseNode {
  readonly nodeType: "notification_template";

  /** Template category */
  readonly category:
    | "reminder"
    | "encouragement"
    | "warning"
    | "achievement"
    | "coaching";

  /** Template content (with placeholders) */
  readonly template: string;

  /** Required placeholders */
  readonly placeholders: readonly string[];

  /** Trigger conditions */
  readonly triggers: readonly NotificationTrigger[];

  /** Priority */
  readonly priority: "low" | "medium" | "high" | "urgent";

  /** Cooldown between sends */
  readonly cooldown: Duration;

  /** Is template active? */
  readonly active: boolean;
}

export interface NotificationTrigger {
  readonly condition: string;
  readonly threshold?: number;
  readonly metric?: string;
}

// =============================================================================
// NODE UNION TYPE
// =============================================================================

/**
 * Union of all node types for type-safe graph operations
 */
export type LKGCNode =
  // Knowledge & learning content
  | CardNode
  | NoteNode
  | ConceptNode
  | TermNode
  | FactNode
  | FormulaNode
  | ProcedureNode
  | ExampleNode
  | CounterexampleNode
  | QuestionNode
  | ResourceNode
  | ChunkNode
  // Pedagogy & curriculum
  | GoalNode
  | LearningPathNode
  | MilestoneNode
  | AssessmentNode
  | RubricNode
  // Metacognition
  | StrategyNode
  | ReflectionNode
  | PredictionNode
  | ErrorPatternNode
  // Gamification
  | QuestNode
  | ChallengeNode
  | BadgeNode
  | StreakRuleNode
  | BossNode
  | RewardNode
  // Social / plugin / system
  | PluginModuleNode
  | ExperimentNode
  | NotificationTemplateNode;

/**
 * Type guard for node types
 */
export function isNodeType<T extends NodeType>(
  node: LKGCNode,
  type: T,
): node is Extract<LKGCNode, { nodeType: T }> {
  return node.nodeType === type;
}

/**
 * Get node by type (type-safe)
 */
export type NodeOfType<T extends NodeType> = Extract<LKGCNode, { nodeType: T }>;
