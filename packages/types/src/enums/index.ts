/**
 * @noema/types - Domain Enumerations
 *
 * All enums used across Noema services.
 * These are the canonical definitions - all services import from here.
 */

// ============================================================================
// Card Types (22+ types from spec)
// ============================================================================

/**
 * All supported card types in Noema.
 * Each type has specific content structure and rendering.
 */
export const CardType = {
  /** Basic question/answer card */
  ATOMIC: 'atomic',
  /** Fill-in-the-blank card */
  CLOZE: 'cloze',
  /** Image with masked regions */
  IMAGE_OCCLUSION: 'image_occlusion',
  /** Listen and recall */
  AUDIO: 'audio',
  /** Step-by-step sequences */
  PROCESS: 'process',
  /** Compare A vs B vs C */
  COMPARISON: 'comparison',
  /** Boundary conditions */
  EXCEPTION: 'exception',
  /** Find the mistake */
  ERROR_SPOTTING: 'error_spotting',
  /** Metacognition training */
  CONFIDENCE_RATED: 'confidence_rated',
  /** Relation mapping */
  CONCEPT_GRAPH: 'concept_graph',
  /** Vignette → decision */
  CASE_BASED: 'case_based',
  /** Text + image + audio */
  MULTIMODAL: 'multimodal',
  /** Novel contexts */
  TRANSFER: 'transfer',
  /** Layered complexity */
  PROGRESSIVE_DISCLOSURE: 'progressive_disclosure',
  /** Multiple choice */
  MULTIPLE_CHOICE: 'multiple_choice',
  /** True/false */
  TRUE_FALSE: 'true_false',
  /** Match items */
  MATCHING: 'matching',
  /** Order items */
  ORDERING: 'ordering',
  /** Definition recall */
  DEFINITION: 'definition',
  /** Cause-effect relationships */
  CAUSE_EFFECT: 'cause_effect',
  /** Timeline ordering */
  TIMELINE: 'timeline',
  /** Diagram labeling */
  DIAGRAM: 'diagram',
} as const;

export type CardType = (typeof CardType)[keyof typeof CardType];

// ============================================================================
// Remediation Card Types (20 special types from Mental Debugger spec)
// ============================================================================

/**
 * Special remediation card types used by the Mental Debugger
 * to address specific failure patterns.
 */
export const RemediationCardType = {
  /** Compare similar items side by side */
  CONTRASTIVE_PAIR: 'contrastive_pair',
  /** Minimal difference comparison */
  MINIMAL_PAIR: 'minimal_pair',
  /** Address linguistic false friends */
  FALSE_FRIEND: 'false_friend',
  /** Old vs new definition contrast */
  OLD_VS_NEW_DEFINITION: 'old_vs_new_definition',
  /** Edge case exploration */
  BOUNDARY_CASE: 'boundary_case',
  /** When rules apply/don't apply */
  RULE_SCOPE: 'rule_scope',
  /** Key distinguishing features */
  DISCRIMINANT_FEATURE: 'discriminant_feature',
  /** Surface hidden assumptions */
  ASSUMPTION_CHECK: 'assumption_check',
  /** Disprove overgeneralization */
  COUNTEREXAMPLE: 'counterexample',
  /** Switch between representations */
  REPRESENTATION_SWITCH: 'representation_switch',
  /** Improve retrieval cues */
  RETRIEVAL_CUE: 'retrieval_cue',
  /** Fix encoding issues */
  ENCODING_REPAIR: 'encoding_repair',
  /** Override incorrect memory */
  OVERWRITE_DRILL: 'overwrite_drill',
  /** Counter availability bias */
  AVAILABILITY_BIAS_DISCONFIRMATION: 'availability_bias_disconfirmation',
  /** Teach self-check rituals */
  SELF_CHECK_RITUAL: 'self_check_ritual',
  /** Confidence calibration training */
  CALIBRATION_TRAINING: 'calibration_training',
  /** Reframe attributions */
  ATTRIBUTION_REFRAMING: 'attribution_reframing',
  /** Strategy reminders */
  STRATEGY_REMINDER: 'strategy_reminder',
  /** Drill confusable sets */
  CONFUSABLE_SET_DRILL: 'confusable_set_drill',
  /** Decompose partial knowledge */
  PARTIAL_KNOWLEDGE_DECOMPOSITION: 'partial_knowledge_decomposition',
} as const;

export type RemediationCardType = (typeof RemediationCardType)[keyof typeof RemediationCardType];

// ============================================================================
// Session & State Management
// ============================================================================

/**
 * Learning session lifecycle states.
 */
export const SessionState = {
  /** Session created but not started */
  PLANNED: 'planned',
  /** Session in progress */
  ACTIVE: 'active',
  /** Session temporarily paused */
  PAUSED: 'paused',
  /** Session completed normally */
  COMPLETED: 'completed',
  /** Session abandoned before completion */
  ABANDONED: 'abandoned',
} as const;

export type SessionState = (typeof SessionState)[keyof typeof SessionState];

/**
 * Card lifecycle states.
 */
export const CardState = {
  /** Card is being created */
  DRAFT: 'draft',
  /** Card is available for review */
  ACTIVE: 'active',
  /** Card is suspended from reviews */
  SUSPENDED: 'suspended',
  /** Card is archived (soft deleted) */
  ARCHIVED: 'archived',
} as const;

export type CardState = (typeof CardState)[keyof typeof CardState];

/**
 * Attempt outcome states.
 */
export const AttemptOutcome = {
  /** Fully correct answer */
  CORRECT: 'correct',
  /** Wrong answer */
  INCORRECT: 'incorrect',
  /** Partially correct */
  PARTIAL: 'partial',
  /** User gave up */
  SKIPPED: 'skipped',
} as const;

export type AttemptOutcome = (typeof AttemptOutcome)[keyof typeof AttemptOutcome];

// ============================================================================
// Environment & Deployment
// ============================================================================

/**
 * Deployment environments.
 */
export const Environment = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
} as const;

export type Environment = (typeof Environment)[keyof typeof Environment];

// ============================================================================
// Strategy & Cognitive Control
// ============================================================================

/**
 * Strategy loadout archetypes from spec.
 */
export const LoadoutArchetype = {
  /** Speed + coverage */
  FAST_RECALL: 'fast_recall',
  /** Transfer + robustness */
  DEEP_UNDERSTANDING: 'deep_understanding',
  /** Accuracy under stress */
  EXAM_SURVIVAL: 'exam_survival',
  /** Confidence accuracy */
  CALIBRATION_TRAINING: 'calibration_training',
  /** Confusable control */
  DISCRIMINATION: 'discrimination',
  /** User-defined */
  CUSTOM: 'custom',
} as const;

export type LoadoutArchetype = (typeof LoadoutArchetype)[keyof typeof LoadoutArchetype];

/**
 * Learning mode types from spec.
 */
export const LearningMode = {
  /** Breadth, discovery, high serendipity */
  EXPLORATION: 'exploration',
  /** Specific targets, prerequisites, deadlines */
  GOAL_DRIVEN: 'goal_driven',
  /** Time-pressured, coverage-focused */
  EXAM_ORIENTED: 'exam_oriented',
  /** Cross-domain connections, bridge cards */
  SYNTHESIS: 'synthesis',
} as const;

export type LearningMode = (typeof LearningMode)[keyof typeof LearningMode];

/**
 * Intervention force levels (from Strategy spec).
 */
export const ForceLevel = {
  /** Just inform */
  INFORMATIONAL: 'informational',
  /** Suggest action */
  SUGGEST: 'suggest',
  /** Nudge toward action */
  NUDGE: 'nudge',
  /** Gate until acknowledged */
  GATE: 'gate',
  /** Force compliance */
  ENFORCE: 'enforce',
} as const;

export type ForceLevel = (typeof ForceLevel)[keyof typeof ForceLevel];

// ============================================================================
// Scheduling Algorithms
// ============================================================================

/**
 * Supported spaced repetition algorithms.
 */
export const SchedulingAlgorithm = {
  /** Free Spaced Repetition Scheduler v6.1.1 */
  FSRS: 'fsrs',
  /** Half-Life Regression (Duolingo) */
  HLR: 'hlr',
  /** SuperMemo 2 */
  SM2: 'sm2',
  /** Leitner box system */
  LEITNER: 'leitner',
} as const;

export type SchedulingAlgorithm = (typeof SchedulingAlgorithm)[keyof typeof SchedulingAlgorithm];

// ============================================================================
// Knowledge Graph
// ============================================================================

/**
 * Knowledge graph node types.
 */
export const GraphNodeType = {
  /** Abstract concept */
  CONCEPT: 'concept',
  /** Specific fact */
  FACT: 'fact',
  /** Procedural knowledge */
  PROCEDURE: 'procedure',
  /** Principle or rule */
  PRINCIPLE: 'principle',
  /** Example instance */
  EXAMPLE: 'example',
  /** Counterexample */
  COUNTEREXAMPLE: 'counterexample',
  /** Misconception to avoid */
  MISCONCEPTION: 'misconception',
} as const;

export type GraphNodeType = (typeof GraphNodeType)[keyof typeof GraphNodeType];

/**
 * Knowledge graph edge types.
 */
export const GraphEdgeType = {
  /** Prerequisite relationship */
  PREREQUISITE: 'prerequisite',
  /** Part-of relationship */
  PART_OF: 'part_of',
  /** Is-a (inheritance) */
  IS_A: 'is_a',
  /** Related concept */
  RELATED_TO: 'related_to',
  /** Contradicts */
  CONTRADICTS: 'contradicts',
  /** Exemplifies */
  EXEMPLIFIES: 'exemplifies',
  /** Causes */
  CAUSES: 'causes',
  /** Derived from */
  DERIVED_FROM: 'derived_from',
} as const;

export type GraphEdgeType = (typeof GraphEdgeType)[keyof typeof GraphEdgeType];

/**
 * CKG mutation typestate (from Knowledge Graph spec).
 */
export const MutationState = {
  /** Mutation proposed */
  PROPOSED: 'proposed',
  /** Validation in progress */
  VALIDATING: 'validating',
  /** Passed validation */
  VALIDATED: 'validated',
  /** Committed to graph */
  COMMITTED: 'committed',
  /** Rejected with reason */
  REJECTED: 'rejected',
} as const;

export type MutationState = (typeof MutationState)[keyof typeof MutationState];

// ============================================================================
// MCP Tool Categories
// ============================================================================

/**
 * Tool operation categories for MCP tools.
 */
export const ToolCategory = {
  /** Read-only queries */
  QUERY: 'query',
  /** State mutations */
  MUTATION: 'mutation',
  /** Analysis operations */
  ANALYSIS: 'analysis',
  /** Content generation */
  GENERATION: 'generation',
} as const;

export type ToolCategory = (typeof ToolCategory)[keyof typeof ToolCategory];

/**
 * Tool response time expectations.
 */
export const ToolResponseTime = {
  /** < 100ms */
  FAST: 'fast',
  /** 100ms - 1s */
  MEDIUM: 'medium',
  /** > 1s */
  SLOW: 'slow',
} as const;

export type ToolResponseTime = (typeof ToolResponseTime)[keyof typeof ToolResponseTime];

// ============================================================================
// Event Sources
// ============================================================================

/**
 * Source of an entity creation or event.
 */
export const EventSource = {
  /** User-initiated */
  USER: 'user',
  /** Agent-initiated */
  AGENT: 'agent',
  /** System-initiated (scheduled, etc.) */
  SYSTEM: 'system',
  /** Imported from external source */
  IMPORT: 'import',
} as const;

export type EventSource = (typeof EventSource)[keyof typeof EventSource];

// ============================================================================
// Gamification
// ============================================================================

/**
 * Achievement rarity tiers.
 */
export const AchievementRarity = {
  COMMON: 'common',
  UNCOMMON: 'uncommon',
  RARE: 'rare',
  EPIC: 'epic',
  LEGENDARY: 'legendary',
} as const;

export type AchievementRarity = (typeof AchievementRarity)[keyof typeof AchievementRarity];

/**
 * Streak types.
 */
export const StreakType = {
  /** Daily review streak */
  DAILY: 'daily',
  /** Weekly goal streak */
  WEEKLY: 'weekly',
  /** Consecutive correct answers */
  ACCURACY: 'accuracy',
} as const;

export type StreakType = (typeof StreakType)[keyof typeof StreakType];

// ============================================================================
// Content & Difficulty
// ============================================================================

/**
 * Difficulty levels for cards and knowledge graph nodes.
 * Maps to Bloom's taxonomy tiers and determines scheduling parameters.
 */
export const DifficultyLevel = {
  /** Foundational recall, pure recognition */
  BEGINNER: 'beginner',
  /** Basic comprehension, simple application */
  ELEMENTARY: 'elementary',
  /** Analysis, multi-step reasoning */
  INTERMEDIATE: 'intermediate',
  /** Synthesis, evaluation, near transfer */
  ADVANCED: 'advanced',
  /** Far transfer, novel contexts, metacognitive */
  EXPERT: 'expert',
} as const;

export type DifficultyLevel = (typeof DifficultyLevel)[keyof typeof DifficultyLevel];

// ============================================================================
// Ingestion
// ============================================================================

/**
 * Supported document formats for ingestion.
 */
export const DocumentFormat = {
  PDF: 'pdf',
  DOCX: 'docx',
  PPTX: 'pptx',
  MARKDOWN: 'markdown',
  HTML: 'html',
  PLAIN_TEXT: 'plain_text',
  EPUB: 'epub',
  LATEX: 'latex',
  CSV: 'csv',
  JSON: 'json',
  YAML: 'yaml',
  IMAGE: 'image',
  AUDIO: 'audio',
} as const;

export type DocumentFormat = (typeof DocumentFormat)[keyof typeof DocumentFormat];

/**
 * Ingestion job states.
 */
export const IngestionState = {
  /** Job created, waiting to start */
  PENDING: 'pending',
  /** Parsing documents */
  PARSING: 'parsing',
  /** Analyzing structure */
  ANALYZING: 'analyzing',
  /** Transforming to cards */
  TRANSFORMING: 'transforming',
  /** Awaiting user review */
  REVIEWING: 'reviewing',
  /** Committing cards to content service */
  COMMITTING: 'committing',
  /** Successfully completed */
  COMPLETED: 'completed',
  /** Failed with error */
  FAILED: 'failed',
} as const;

export type IngestionState = (typeof IngestionState)[keyof typeof IngestionState];

// ============================================================================
// Rating & Review
// ============================================================================

/**
 * User's self-assessment of recall quality during a review.
 * Maps directly to FSRS rating values 1-4.
 * Other algorithms derive their ratings from these canonical values.
 */
export const Rating = {
  /** Complete failure to recall — FSRS value: 1 */
  AGAIN: 'again',
  /** Recalled with significant difficulty — FSRS value: 2 */
  HARD: 'hard',
  /** Recalled with acceptable effort — FSRS value: 3 */
  GOOD: 'good',
  /** Recalled effortlessly — FSRS value: 4 */
  EASY: 'easy',
} as const;

export type Rating = (typeof Rating)[keyof typeof Rating];

/**
 * Numeric values for Rating, aligned with FSRS convention.
 * SM-2 quality (0-5), Leitner pass/fail, and HLR binary recall
 * should be derived from these canonical values by each algorithm's adapter.
 */
export const RATING_VALUES: Record<Rating, number> = {
  [Rating.AGAIN]: 1,
  [Rating.HARD]: 2,
  [Rating.GOOD]: 3,
  [Rating.EASY]: 4,
};

/**
 * Card learning states within the spaced repetition lifecycle.
 * Shared across all scheduling algorithms (FSRS, SM-2, Leitner, HLR).
 */
export const CardLearningState = {
  /** Card has never been reviewed */
  NEW: 'new',
  /** Card is in the initial learning phase (short-term memory) */
  LEARNING: 'learning',
  /** Card is in the long-term review cycle */
  REVIEW: 'review',
  /** Card lapsed (forgotten) and is being relearned */
  RELEARNING: 'relearning',
} as const;

export type CardLearningState = (typeof CardLearningState)[keyof typeof CardLearningState];

// ============================================================================
// Session Queue & Termination
// ============================================================================

/**
 * Status of a card within a session's review queue.
 */
export const CardQueueStatus = {
  /** Card is waiting to be presented */
  PENDING: 'pending',
  /** Card is currently being presented to the learner */
  PRESENTED: 'presented',
  /** Card has been reviewed and completed */
  COMPLETED: 'completed',
  /** Card was skipped by the learner */
  SKIPPED: 'skipped',
  /** Card was dynamically injected into the queue by an agent */
  INJECTED: 'injected',
} as const;

export type CardQueueStatus = (typeof CardQueueStatus)[keyof typeof CardQueueStatus];

/**
 * Reason a session was terminated.
 */
export const SessionTerminationReason = {
  /** All cards in the queue were reviewed */
  COMPLETED_NORMALLY: 'completed_normally',
  /** Session time limit (maxDurationMinutes) was reached */
  TIME_LIMIT_REACHED: 'time_limit_reached',
  /** Session card limit (maxCards) was reached */
  CARD_LIMIT_REACHED: 'card_limit_reached',
  /** User explicitly ended the session */
  USER_ENDED: 'user_ended',
  /** Session exceeded the auto-expiration timeout (default 24h) */
  AUTO_EXPIRED: 'auto_expired',
  /** Session terminated due to an error */
  ERROR: 'error',
} as const;

export type SessionTerminationReason =
  (typeof SessionTerminationReason)[keyof typeof SessionTerminationReason];

// ============================================================================
// Cognitive & Metacognitive States
// ============================================================================

/**
 * Estimated cognitive load level during a session.
 * Inferred from response patterns, error rates, and timing.
 */
export const CognitiveLoadLevel = {
  /** Learner is performing effortlessly */
  LOW: 'low',
  /** Normal cognitive engagement */
  MODERATE: 'moderate',
  /** Approaching cognitive capacity limits */
  HIGH: 'high',
  /** Exceeding capacity — performance degradation expected */
  OVERLOADED: 'overloaded',
} as const;

export type CognitiveLoadLevel = (typeof CognitiveLoadLevel)[keyof typeof CognitiveLoadLevel];

/**
 * Learner fatigue level during a session.
 * Inferred from response time degradation, error rate increase, and session duration.
 */
export const FatigueLevel = {
  /** Fully alert and engaged */
  FRESH: 'fresh',
  /** Slight fatigue, minimal impact on performance */
  MILD: 'mild',
  /** Noticeable fatigue, some performance degradation */
  MODERATE: 'moderate',
  /** Significant fatigue, recommended to pause */
  FATIGUED: 'fatigued',
  /** Severe fatigue, session should be ended */
  EXHAUSTED: 'exhausted',
} as const;

export type FatigueLevel = (typeof FatigueLevel)[keyof typeof FatigueLevel];

/**
 * Motivation signal from gamification and behavioral analysis.
 */
export const MotivationSignal = {
  /** Highly motivated, positive engagement indicators */
  HIGH: 'high',
  /** Normal motivation level */
  NORMAL: 'normal',
  /** Showing signs of declining motivation */
  DECLINING: 'declining',
  /** Low motivation, at risk of disengagement */
  LOW: 'low',
} as const;

export type MotivationSignal = (typeof MotivationSignal)[keyof typeof MotivationSignal];

/**
 * Hint depth levels for progressive hint delivery.
 * Each level reveals more information to the learner.
 */
export const HintDepth = {
  /** No hint used */
  NONE: 'none',
  /** Minimal cue — a nudge in the right direction */
  CUE: 'cue',
  /** Partial reveal — significant help without the full answer */
  PARTIAL: 'partial',
  /** Full explanation — complete answer revealed */
  FULL_EXPLANATION: 'full_explanation',
} as const;

export type HintDepth = (typeof HintDepth)[keyof typeof HintDepth];

// ============================================================================
// Teaching Approaches (31 Epistemic Modes of Engagement)
// ============================================================================

/**
 * All 31 teaching/learning approaches supported by Noema.
 * Each mode represents a distinct epistemic mode of engagement
 * with specific cognitive mechanisms and pedagogical goals.
 *
 * Formal Mode Definition: Mode = (E, T, R, M, C)
 *   E = Epistemic Operation (10 types)
 *   T = Tension Source (8 types)
 *   R = Representation Space (5 types)
 *   M = Metacognitive Activation (5 levels)
 *   C = Constraint Profile (6 types)
 *
 * @see FEATURE_teaching_approaches.md for detailed descriptions
 */
export const TeachingApproach = {
  /** Standard flashcard review — baseline mode with no special pedagogical framing */
  STANDARD: 'standard',

  // ── I. Inquiry & Discovery ──────────────────────────────────────────────

  /** Διερευνητική Μάθηση — hypothesis → experiment → reflection → revision */
  INQUIRY_BASED: 'inquiry_based',
  /** Real-world scenario → learner derives necessary knowledge */
  PROBLEM_BASED: 'problem_based',
  /** Analyze specific cases and extract general principles */
  CASE_BASED: 'case_based',

  // ── II. Error-Centered & Contradiction-Based ────────────────────────────

  /** Present plausible but flawed explanation — learner detects and corrects */
  LOOPHOLE_LEARNING: 'loophole_learning',
  /** AI intentionally misleads — learner cross-examines and demands justification */
  ADVERSARIAL: 'adversarial',
  /** Two "correct-looking" statements that can't both be true — resolve via higher-order principle */
  CONTRADICTION_EXPOSURE: 'contradiction_exposure',

  // ── III. Generative & Constructive ──────────────────────────────────────

  /** Generate answer before seeing options — recall > recognition */
  GENERATIVE_RETRIEVAL: 'generative_retrieval',
  /** Given the answer, reconstruct the question — strengthens structural understanding */
  REVERSE_LEARNING: 'reverse_learning',
  /** Explain concept in simpler language or different domain (Feynman technique) */
  TEACHING_TO_LEARN: 'teaching_to_learn',
  /** Connect two unrelated concepts — activate transfer learning and creative abstraction */
  CONCEPT_RECOMBINATION: 'concept_recombination',

  // ── IV. Meta-Cognitive ──────────────────────────────────────────────────

  /** Rate confidence after answering — track calibration gap and epistemic self-awareness */
  CONFIDENCE_WEIGHTED: 'confidence_weighted',
  /** Predict what concept means before learning — difference = learning signal */
  PREDICTION_BASED: 'prediction_based',
  /** Review error clusters and types, not individual answers — cognitive fingerprinting */
  ERROR_PATTERN_REFLECTION: 'error_pattern_reflection',

  // ── V. Constraint-Based ─────────────────────────────────────────────────

  /** Explain concept in minimal words — force compression → deeper understanding */
  MINIMAL_INFORMATION: 'minimal_information',
  /** Explain without using the main term — enforces conceptual modeling */
  NO_DEFINITION: 'no_definition',
  /** Translate between representations: equation ↔ diagram ↔ code ↔ text ↔ graph */
  DIMENSIONAL_TRANSLATION: 'dimensional_translation',

  // ── VI. Game-Theoretic & Dynamic ────────────────────────────────────────

  /** Correct → increase abstraction depth; wrong → foundational reconstruction */
  ESCALATION: 'escalation',
  /** Short response windows — measure automaticity vs reasoning depth */
  TIME_PRESSURE: 'time_pressure',
  /** Underspecified problems — learner must ask clarifying questions */
  AMBIGUITY_TOLERANCE: 'ambiguity_tolerance',

  // ── VII. Structural Knowledge ───────────────────────────────────────────

  /** Given partial knowledge graph, complete missing nodes and edges */
  GRAPH_COMPLETION: 'graph_completion',
  /** Given shuffled hierarchy, reconstruct correct taxonomic structure */
  HIERARCHY_RECONSTRUCTION: 'hierarchy_reconstruction',
  /** Given partial causal chain, fill in missing causal links */
  CAUSAL_CHAIN_COMPLETION: 'causal_chain_completion',

  // ── VIII. Dialectical & Philosophical ───────────────────────────────────

  /** Present thesis → generate antithesis → synthesize higher-order understanding */
  THESIS_ANTITHESIS_SYNTHESIS: 'thesis_antithesis_synthesis',
  /** "What if X were different?" — explore alternative worlds and counterfactual reasoning */
  COUNTERFACTUAL: 'counterfactual',

  // ── IX. Sensory & Representation ────────────────────────────────────────

  /** Same concept in multiple modalities simultaneously — multi-sensory encoding */
  MULTI_REPRESENTATION: 'multi_representation',
  /** Slightly alter a known concept — detect what changed and why it matters */
  PERTURBATION: 'perturbation',

  // ── X. Advanced Experimental ────────────────────────────────────────────

  /** Inject plausible misconceptions to build cognitive immunity */
  ADAPTIVE_MISCONCEPTION_INJECTION: 'adaptive_misconception_injection',
  /** Detect when learner's mental model is drifting from correct model */
  COGNITIVE_DRIFT_DETECTION: 'cognitive_drift_detection',
  /** Compress knowledge into minimal lossless representation */
  KNOWLEDGE_COMPRESSION: 'knowledge_compression',
  /** Explain the algorithm you used to solve this — metacognitive externalization */
  EXPLAIN_YOUR_ALGORITHM: 'explain_your_algorithm',
} as const;

export type TeachingApproach = (typeof TeachingApproach)[keyof typeof TeachingApproach];

/**
 * Categories grouping the teaching approaches into pedagogical families.
 */
export const TeachingApproachCategory = {
  /** Hypothesis-driven, scenario-based, case-analysis modes */
  INQUIRY_AND_DISCOVERY: 'inquiry_and_discovery',
  /** Mistake detection, adversarial reasoning, contradiction resolution */
  ERROR_CENTERED: 'error_centered',
  /** Active generation, reversal, teaching, recombination */
  GENERATIVE_AND_CONSTRUCTIVE: 'generative_and_constructive',
  /** Confidence calibration, prediction, error pattern analysis */
  META_COGNITIVE: 'meta_cognitive',
  /** Minimal information, no-definition, dimensional translation */
  CONSTRAINT_BASED: 'constraint_based',
  /** Escalation, time pressure, ambiguity tolerance */
  GAME_THEORETIC_AND_DYNAMIC: 'game_theoretic_and_dynamic',
  /** Graph completion, hierarchy reconstruction, causal chains */
  STRUCTURAL_KNOWLEDGE: 'structural_knowledge',
  /** Thesis-antithesis-synthesis, counterfactual reasoning */
  DIALECTICAL_AND_PHILOSOPHICAL: 'dialectical_and_philosophical',
  /** Multi-representation, perturbation detection */
  SENSORY_AND_REPRESENTATION: 'sensory_and_representation',
  /** Misconception injection, drift detection, compression, algorithm explanation */
  ADVANCED_EXPERIMENTAL: 'advanced_experimental',
} as const;

export type TeachingApproachCategory =
  (typeof TeachingApproachCategory)[keyof typeof TeachingApproachCategory];
