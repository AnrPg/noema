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
  /** Time ran out */
  TIMEOUT: 'timeout',
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
