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
 * Provenance mode for a card's durable instructional content.
 */
export const CardOriginMode = {
  /** Human-authored content; metadata gate is required, Guardian is not. */
  AUTHORED: 'authored',
  /** Generated from uploaded documents; citations and Guardian validation are required. */
  RAG_GROUNDED: 'rag_grounded',
  /** Generated from CKG/metacognition context; anchors, factuality, and Guardian are required. */
  AGENT_AUTONOMOUS: 'agent_autonomous',
} as const;

export type CardOriginMode = (typeof CardOriginMode)[keyof typeof CardOriginMode];

/**
 * Review eligibility state for card use in sessions and indexing.
 */
export const CardReviewState = {
  ACTIVE: 'active',
  METADATA_INCOMPLETE: 'metadata_incomplete',
  PENDING_REVIEW: 'pending_review',
  REJECTED: 'rejected',
} as const;

export type CardReviewState = (typeof CardReviewState)[keyof typeof CardReviewState];

/**
 * Durable transformation lineage operation for card variants.
 */
export const CardTransformKind = {
  REPHRASE: 'rephrase',
  SIMPLIFY: 'simplify',
  INCREASE_DIFFICULTY: 'increase_difficulty',
  CHANGE_CARD_TYPE: 'change_card_type',
  REMEDIATION: 'remediation',
  REANCHOR: 'reanchor',
} as const;

export type CardTransformKind = (typeof CardTransformKind)[keyof typeof CardTransformKind];

/**
 * Lifecycle state for async content generation jobs.
 */
export const ContentGenerationJobStatus = {
  REQUESTED: 'requested',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type ContentGenerationJobStatus =
  (typeof ContentGenerationJobStatus)[keyof typeof ContentGenerationJobStatus];

// ============================================================================
// Environment & Deployment
// ============================================================================

/**
 * Deployment environments.
 */
export const Environment = {
  DEVELOPMENT: 'development',
  TEST: 'test',
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
 * Domain-oriented study modes used by the dual-use learning architecture.
 *
 * This is intentionally distinct from the strategy-oriented `LearningMode`
 * enum above, which models exploration and goal framing.
 */
export const StudyMode = {
  /** Language-focused study workflows, graph lenses, and card generation */
  LANGUAGE_LEARNING: 'language_learning',
  /** Facts, sciences, and concept-centric knowledge-building workflows */
  KNOWLEDGE_GAINING: 'knowledge_gaining',
} as const;

export type StudyMode = (typeof StudyMode)[keyof typeof StudyMode];

/**
 * Validation depth for LessonPlans.
 */
export const RigorLevel = {
  /** Structural validation for review/minimal plans */
  MINIMAL: 'minimal',
  /** Full objective/activity/assessment alignment validation */
  FULL: 'full',
} as const;

export type RigorLevel = (typeof RigorLevel)[keyof typeof RigorLevel];

/**
 * Goal type in a LessonPlan.
 */
export const GoalType = {
  DISCRIMINATION: 'discrimination',
  REASONING: 'reasoning',
  TRANSFER: 'transfer',
  ACQUISITION: 'acquisition',
  REINFORCEMENT: 'reinforcement',
} as const;

export type GoalType = (typeof GoalType)[keyof typeof GoalType];

/**
 * Goal state derived from concept stability.
 */
export const GoalState = {
  PENDING: 'pending',
  ACTIVE: 'active',
  STABLE: 'stable',
  UNSTABLE: 'unstable',
} as const;

export type GoalState = (typeof GoalState)[keyof typeof GoalState];

/**
 * Origin of a LessonPlan goal.
 */
export const GoalSource = {
  SYSTEM_PROPOSED: 'system_proposed',
  USER_ACCEPTED: 'user_accepted',
  USER_EDITED: 'user_edited',
} as const;

export type GoalSource = (typeof GoalSource)[keyof typeof GoalSource];

/**
 * LessonPlan lifecycle state owned by session-service.
 */
export const LessonPlanState = {
  DRAFT: 'draft',
  VALIDATED: 'validated',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned',
} as const;

export type LessonPlanState = (typeof LessonPlanState)[keyof typeof LessonPlanState];

/**
 * Eligibility group for epistemic mode routing.
 */
export const EligibilityGroup = {
  NEW_CONCEPT: 'new_concept',
  REINFORCEMENT: 'reinforcement',
  CONFUSION: 'confusion',
  WEAK_REASONING: 'weak_reasoning',
  TRANSFER: 'transfer',
  META: 'meta',
  PRESSURE: 'pressure',
} as const;

export type EligibilityGroup = (typeof EligibilityGroup)[keyof typeof EligibilityGroup];

/**
 * Cognitive transformation applied when revisiting a concept.
 */
export const TransformationType = {
  RECALL: 'recall',
  EXPLANATION: 'explanation',
  COMPARISON: 'comparison',
  APPLICATION: 'application',
  PERTURBATION: 'perturbation',
  ERROR_DETECTION: 'error_detection',
} as const;

export type TransformationType = (typeof TransformationType)[keyof typeof TransformationType];

/**
 * Step lifecycle state.
 */
export const StepStatus = {
  PLANNED: 'planned',
  QUEUED: 'queued',
  PRESENTED: 'presented',
  ANSWERED: 'answered',
  EVALUATED: 'evaluated',
  SUPERSEDED: 'superseded',
  SKIPPED: 'skipped',
} as const;

export type StepStatus = (typeof StepStatus)[keyof typeof StepStatus];

/**
 * Learner self-rating for a completed Step.
 */
export const StepSelfRating = {
  KNEW_IT: 'knew_it',
  HESITATED: 'hesitated',
  DIDNT_KNOW: 'didnt_know',
} as const;

export type StepSelfRating = (typeof StepSelfRating)[keyof typeof StepSelfRating];

/**
 * Confidence signal derived from StepSelfRating.
 */
export const SELF_RATING_TO_CONFIDENCE: Record<StepSelfRating, number> = {
  [StepSelfRating.KNEW_IT]: 1.0,
  [StepSelfRating.HESITATED]: 0.5,
  [StepSelfRating.DIDNT_KNOW]: 0.0,
};

/**
 * Revocable concept stability state.
 */
export const ConceptState = {
  STABLE: 'stable',
  UNSTABLE: 'unstable',
} as const;

export type ConceptState = (typeof ConceptState)[keyof typeof ConceptState];

/**
 * Session lifecycle states for the realignment Step loop.
 */
export const SessionLifecycleState = {
  PLANNING: 'planning',
  EXECUTION: 'execution',
  DIAGNOSIS: 'diagnosis',
  ADAPTATION: 'adaptation',
  EVALUATION: 'evaluation',
  COMPLETION: 'completion',
} as const;

export type SessionLifecycleState =
  (typeof SessionLifecycleState)[keyof typeof SessionLifecycleState];

/**
 * First-class trigger types emitted from metacognitive Evaluation.
 */
export const TriggerType = {
  FAILURE: 'failure',
  CONFUSION: 'confusion',
  SLOW_THINKING: 'slow_thinking',
  OVERCONFIDENCE: 'overconfidence',
  BOREDOM: 'boredom',
  PREREQUISITE_GAP: 'prerequisite_gap',
} as const;

export type TriggerType = (typeof TriggerType)[keyof typeof TriggerType];

/**
 * Trigger resolution state.
 */
export const TriggerStatus = {
  OPEN: 'open',
  ADDRESSED: 'addressed',
  RECURRING: 'recurring',
} as const;

export type TriggerStatus = (typeof TriggerStatus)[keyof typeof TriggerStatus];

/**
 * Intervention selected by the trigger-to-strategy loop.
 */
export const LearningInterventionType = {
  INSERT_REPAIR_STEP: 'insert_repair_step',
  INSERT_CONTRASTIVE_STEP: 'insert_contrastive_step',
  INSERT_CALIBRATION_STEP: 'insert_calibration_step',
  SWITCH_EPISTEMIC_MODE: 'switch_epistemic_mode',
  SWITCH_TRANSFORMATION: 'switch_transformation',
  CHANGE_ACTIVITY: 'change_activity',
  REDUCE_DIFFICULTY: 'reduce_difficulty',
  INCREASE_DIFFICULTY: 'increase_difficulty',
  TRANSITION_TO_TRANSFER: 'transition_to_transfer',
  BRANCH_TO_PREREQUISITE: 'branch_to_prerequisite',
} as const;

export type LearningInterventionType =
  (typeof LearningInterventionType)[keyof typeof LearningInterventionType];

/**
 * Scope of a strategy replan.
 */
export const ReplanScope = {
  LOCAL: 'local',
  STRUCTURAL: 'structural',
  FULL: 'full',
} as const;

export type ReplanScope = (typeof ReplanScope)[keyof typeof ReplanScope];

/**
 * Concept-first scheduler logical queue.
 */
export const SchedulerQueue = {
  REPAIR: 'repair',
  REINFORCEMENT: 'reinforcement',
  NEW_LEARNING: 'new_learning',
} as const;

export type SchedulerQueue = (typeof SchedulerQueue)[keyof typeof SchedulerQueue];

/**
 * Internal scheduler rating derived from combined score.
 */
export const SchedulerRating = {
  AGAIN: 'again',
  HARD: 'hard',
  GOOD: 'good',
  EASY: 'easy',
} as const;

export type SchedulerRating = (typeof SchedulerRating)[keyof typeof SchedulerRating];

// ============================================================================
// Curriculum
// ============================================================================

/** Lifecycle state of a user-owned curriculum. */
export const CurriculumState = {
  DRAFT: 'draft',
  FINALIZED: 'finalized',
  ARCHIVED: 'archived',
} as const;

export type CurriculumState = (typeof CurriculumState)[keyof typeof CurriculumState];

/** Lifecycle state of a concrete curriculum DAG version. */
export const CurriculumVersionState = {
  DRAFT: 'draft',
  VALIDATED: 'validated',
  ACTIVE: 'active',
  SUPERSEDED: 'superseded',
} as const;

export type CurriculumVersionState =
  (typeof CurriculumVersionState)[keyof typeof CurriculumVersionState];

/** Runtime traversal state of a stable curriculum node for one learner. */
export const CurriculumNodeRuntimeState = {
  LOCKED: 'locked',
  UNLOCKED: 'unlocked',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
  SKIPPED: 'skipped',
} as const;

export type CurriculumNodeRuntimeState =
  (typeof CurriculumNodeRuntimeState)[keyof typeof CurriculumNodeRuntimeState];

/** Edge semantics inside a curriculum DAG. */
export const CurriculumEdgeType = {
  PREREQUISITE: 'prerequisite',
  RECOMMENDED_BEFORE: 'recommended_before',
  REINFORCES: 'reinforces',
} as const;

export type CurriculumEdgeType = (typeof CurriculumEdgeType)[keyof typeof CurriculumEdgeType];

/** How a curriculum originated. */
export const CurriculumOriginMode = {
  AGENT_GENERATED: 'agent_generated',
  USER_AUTHORED: 'user_authored',
  DOCUMENT_DERIVED: 'document_derived',
} as const;

export type CurriculumOriginMode = (typeof CurriculumOriginMode)[keyof typeof CurriculumOriginMode];

/** Durable reason a curriculum revision was proposed. */
export const CurriculumRevisionReason = {
  PREREQUISITE_GAP: 'prerequisite_gap',
  MISCONCEPTION: 'misconception',
  CONFUSION: 'confusion',
  STRUCTURAL_INVALIDATION: 'structural_invalidation',
  USER_EDIT: 'user_edit',
  ZERO_RETENTION: 'zero_retention',
} as const;

export type CurriculumRevisionReason =
  (typeof CurriculumRevisionReason)[keyof typeof CurriculumRevisionReason];

/** Atomic structural operation inside a revision proposal. */
export const RevisionChangeKind = {
  INSERT_PREREQUISITE: 'insert_prerequisite',
  REORDER: 'reorder',
  ADD_NODE: 'add_node',
  REMOVE_EDGE: 'remove_edge',
  RETARGET_EDGE: 'retarget_edge',
  RELABEL_NODE: 'relabel_node',
  ADJUST_THRESHOLD: 'adjust_threshold',
  ADD_REMEDIATION_PATH: 'add_remediation_path',
  SPLIT_NODE: 'split_node',
  FLAG_FOR_SKIP: 'flag_for_skip',
} as const;

export type RevisionChangeKind = (typeof RevisionChangeKind)[keyof typeof RevisionChangeKind];

/** User decision state for a revision change. */
export const RevisionChangeState = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  APPLIED: 'applied',
} as const;

export type RevisionChangeState = (typeof RevisionChangeState)[keyof typeof RevisionChangeState];

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
  /** Skill or competency */
  SKILL: 'skill',
  /** Role or job family */
  OCCUPATION: 'occupation',
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
 *
 * 31 edge types organized into 6 ontological categories covering the
 * full spectrum of epistemological relations needed for a pedagogical
 * knowledge graph:
 *
 * - **Taxonomic**: is_a, exemplifies
 * - **Mereological**: part_of, constituted_by
 * - **Logical**: equivalent_to, entails, disjoint_with, contradicts
 * - **Causal/Temporal**: causes, precedes, depends_on
 * - **Associative**: related_to, analogous_to, contrasts_with, confusable_with,
 *   translation_equivalent, false_friend_of, minimal_pair_with, collocates_with
 * - **Structural/Pedagogical**: prerequisite, derived_from, has_property,
 *   governs, inflected_form_of, subskill_of, has_subskill, essential_for_occupation,
 *   occupation_requires_essential_skill, optional_for_occupation,
 *   occupation_benefits_from_optional_skill, transferable_to
 *
 * @see EdgeOntologicalCategory for the category groupings
 * @see EDGE_TYPE_POLICIES in knowledge-graph-service for per-type validation rules
 */
export const GraphEdgeType = {
  // ── Taxonomic ─────────────────────────────────────────────────────────
  /** Taxonomic subsumption: "A is a kind of B" (Aristotelian genus–species) */
  IS_A: 'is_a',
  /** Type-instance: "A exemplifies B" (example → concept/principle) */
  EXEMPLIFIES: 'exemplifies',

  // ── Mereological ──────────────────────────────────────────────────────
  /** Part-whole composition: "A is a component/part of B" */
  PART_OF: 'part_of',
  /** Material constitution without identity: "A is constituted by B" (statue/clay) */
  CONSTITUTED_BY: 'constituted_by',

  // ── Logical ───────────────────────────────────────────────────────────
  /** Mutual entailment / co-extensionality: "A ≡ B" (symmetric) */
  EQUIVALENT_TO: 'equivalent_to',
  /** Asymmetric entailment: "A necessarily implies B" */
  ENTAILS: 'entails',
  /** Mutual exclusion: "A and B cannot both hold" (stronger than contradicts) */
  DISJOINT_WITH: 'disjoint_with',
  /** Contradiction or tension between concepts (may be domain-contextual) */
  CONTRADICTS: 'contradicts',

  // ── Causal / Temporal ─────────────────────────────────────────────────
  /** Causal dependence: "A causes B" */
  CAUSES: 'causes',
  /** Temporal or logical ordering: "A precedes B" (historical/conceptual) */
  PRECEDES: 'precedes',
  /** Existential or generic dependence: "A depends on B for its existence/definition" */
  DEPENDS_ON: 'depends_on',

  // ── Associative ───────────────────────────────────────────────────────
  /** Generic associative link (weakest semantic commitment) */
  RELATED_TO: 'related_to',
  /** Structural or functional resemblance across domains (symmetric) */
  ANALOGOUS_TO: 'analogous_to',
  /** Opposition without contradiction: gradable antonymy (symmetric) */
  CONTRASTS_WITH: 'contrasts_with',
  /** Two skills are commonly mistaken for one another by learners (symmetric) */
  CONFUSABLE_WITH: 'confusable_with',
  /** Cross-language lexical or phrasal equivalence used for recall/transfer (symmetric) */
  TRANSLATION_EQUIVALENT: 'translation_equivalent',
  /** Surface similarity with divergent meaning across languages (symmetric) */
  FALSE_FRIEND_OF: 'false_friend_of',
  /** Phonological contrast where small changes matter for meaning (symmetric) */
  MINIMAL_PAIR_WITH: 'minimal_pair_with',
  /** Typical co-occurrence or lexical partnership in authentic usage */
  COLLOCATES_WITH: 'collocates_with',

  // ── Structural / Pedagogical ──────────────────────────────────────────
  /** Learning dependency: "A requires B to be learned first" */
  PREREQUISITE: 'prerequisite',
  /** Derivation chain: "A is logically/mathematically derived from B" */
  DERIVED_FROM: 'derived_from',
  /** Inherence: "A has property/quality B" (attribute inheres in bearer) */
  HAS_PROPERTY: 'has_property',
  /** Constructional or case governance: "A governs/frames B" */
  GOVERNS: 'governs',
  /** Inflectional relationship from a surface form back to its lemma */
  INFLECTED_FORM_OF: 'inflected_form_of',
  /** Skill hierarchy: "A is a narrower or more specific skill than B" */
  SUBSKILL_OF: 'subskill_of',
  /** Skill hierarchy inverse: "A contains B as a narrower skill" */
  HAS_SUBSKILL: 'has_subskill',
  /** Skill-to-occupation fit: "A skill is essential for an occupation" */
  ESSENTIAL_FOR_OCCUPATION: 'essential_for_occupation',
  /** Occupation-to-skill inverse: "An occupation requires this essential skill" */
  OCCUPATION_REQUIRES_ESSENTIAL_SKILL: 'occupation_requires_essential_skill',
  /** Skill-to-occupation fit: "A skill is optional but valuable for an occupation" */
  OPTIONAL_FOR_OCCUPATION: 'optional_for_occupation',
  /** Occupation-to-skill inverse: "An occupation benefits from this optional skill" */
  OCCUPATION_BENEFITS_FROM_OPTIONAL_SKILL: 'occupation_benefits_from_optional_skill',
  /** Skill transfer: "Stability of A transfers meaningfully to B" */
  TRANSFERABLE_TO: 'transferable_to',
} as const;

export type GraphEdgeType = (typeof GraphEdgeType)[keyof typeof GraphEdgeType];

/**
 * Ontological category grouping for edge types.
 *
 * Each `GraphEdgeType` belongs to exactly one category. Categories are used
 * for pedagogical guidance (teaching users which relation to pick), guardrail
 * conflict detection (e.g., IS_A vs PART_OF on the same pair), and metric
 * computation (hierarchical edge grouping).
 */
export const EdgeOntologicalCategory = {
  /** Classification / inheritance: is_a, exemplifies */
  TAXONOMIC: 'taxonomic',
  /** Part-whole / composition / constitution: part_of, constituted_by */
  MEREOLOGICAL: 'mereological',
  /** Formal logical relations: equivalent_to, entails, disjoint_with, contradicts */
  LOGICAL: 'logical',
  /** Causation, temporal ordering, existential dependence: causes, precedes, depends_on */
  CAUSAL_TEMPORAL: 'causal_temporal',
  /** Similarity, analogy, opposition, confusion, generic association */
  ASSOCIATIVE: 'associative',
  /** Learning-specific structural and skill-ontology relations */
  STRUCTURAL_PEDAGOGICAL: 'structural_pedagogical',
} as const;

export type EdgeOntologicalCategory =
  (typeof EdgeOntologicalCategory)[keyof typeof EdgeOntologicalCategory];

/**
 * Lifecycle / trust status for canonical CKG nodes.
 */
export const CkgNodeStatus = {
  /** Current canonical node, safe for normal retrieval and suggestions */
  ACTIVE: 'active',
  /** Historical or superseded node kept for lineage/reference */
  DEPRECATED: 'deprecated',
  /** Node has been merged into another canonical node */
  MERGED: 'merged',
  /** Node has been split into multiple canonical nodes */
  SPLIT: 'split',
  /** Node is present but under active semantic dispute/review */
  DISPUTED: 'disputed',
} as const;

export type CkgNodeStatus = (typeof CkgNodeStatus)[keyof typeof CkgNodeStatus];

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
  /** Proof generation in progress */
  PROVING: 'proving',
  /** Proof verified */
  PROVEN: 'proven',
  /** Commit in progress */
  COMMITTING: 'committing',
  /** Committed to graph */
  COMMITTED: 'committed',
  /** Rejected with reason */
  REJECTED: 'rejected',
  /** Escalated for human/admin review (ontological conflict) */
  PENDING_REVIEW: 'pending_review',
  /** Reviewer requested changes; awaiting submitter revision */
  REVISION_REQUESTED: 'revision_requested',
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
// Session Queue & Termination
// ============================================================================

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
// Epistemic modes (30 Epistemic Modes of Engagement)
// ============================================================================

/**
 * All 30 epistemic modes supported by Noema.
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
 * @see FEATURE_EPISTEMIC_MODES.md for detailed descriptions
 */
export const EpistemicMode = {
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

export type EpistemicMode = (typeof EpistemicMode)[keyof typeof EpistemicMode];

/**
 * Categories grouping the Epistemic modes into pedagogical families.
 */
export const EpistemicModeCategory = {
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

export type EpistemicModeCategory =
  (typeof EpistemicModeCategory)[keyof typeof EpistemicModeCategory];

// ============================================================================
// Knowledge Graph — Graph Type
// ============================================================================

/**
 * Distinguishes which graph a node or edge lives in.
 * The PKG (Personal Knowledge Graph) is per-user.
 * The CKG (Canonical Knowledge Graph) is the shared ground truth.
 */
export const GraphType = {
  /** Personal Knowledge Graph (per-user) */
  PKG: 'pkg',
  /** Canonical Knowledge Graph (shared) */
  CKG: 'ckg',
} as const;

export type GraphType = (typeof GraphType)[keyof typeof GraphType];

// ============================================================================
// Knowledge Graph — Misconception Taxonomy (ADR-004)
// ============================================================================

/**
 * The 27 misconception types organized into 5 families.
 * Different families are detected by different mechanisms:
 * structural → graph topology, semantic → vector similarity,
 * temporal → learning sequence, metacognitive → calibration data.
 */
export const MisconceptionType = {
  // ── Structural family ───────────────────────────────────────────────────
  /** Circular dependency between concepts */
  CIRCULAR_DEPENDENCY: 'circular_dependency',
  /** Concept with no connections (isolated) */
  ORPHAN_CONCEPT: 'orphan_concept',
  /** Concept applied too broadly */
  OVER_GENERALIZATION: 'over_generalization',
  /** Concept not specified precisely enough */
  UNDER_SPECIFICATION: 'under_specification',
  /** Incorrect hierarchical relationship */
  FALSE_HIERARCHY: 'false_hierarchy',
  /** Critical prerequisite link missing */
  MISSING_PREREQUISITE: 'missing_prerequisite',
  /** Edge to a non-existent or invalid concept */
  PHANTOM_LINK: 'phantom_link',

  // ── Relational family ──────────────────────────────────────────────────
  /** Two distinct concepts treated as equivalent */
  FALSE_EQUIVALENCE: 'false_equivalence',
  /** Dependency direction is reversed */
  INVERTED_DEPENDENCY: 'inverted_dependency',
  /** Two distinct concepts merged into one */
  CONFLATION: 'conflation',
  /** Important distinction between concepts not recognized */
  MISSING_DISTINCTION: 'missing_distinction',
  /** Analogy drawn between fundamentally different concepts */
  SPURIOUS_ANALOGY: 'spurious_analogy',
  /** Concept applied outside its valid scope */
  SCOPE_CONFUSION: 'scope_confusion',
  /** Concept boundary incorrectly drawn */
  BOUNDARY_ERROR: 'boundary_error',

  // ── Temporal family ────────────────────────────────────────────────────
  /** Concepts ordered incorrectly in learning sequence */
  ANACHRONISTIC_ORDERING: 'anachronistic_ordering',
  /** Abstract concept introduced before prerequisites stable */
  PREMATURE_ABSTRACTION: 'premature_abstraction',
  /** Related concepts not connected when they should be */
  DELAYED_INTEGRATION: 'delayed_integration',
  /** Refusal to update understanding despite new evidence */
  REVISION_RESISTANCE: 'revision_resistance',

  // ── Semantic family ────────────────────────────────────────────────────
  /** Focus on label rather than underlying concept */
  LABEL_FIXATION: 'label_fixation',
  /** Concepts confused due to surface-level similarity */
  SURFACE_SIMILARITY_BIAS: 'surface_similarity_bias',
  /** Definition of concept has drifted from correct meaning */
  DEFINITIONAL_DRIFT: 'definitional_drift',
  /** Context-dependent meaning collapsed into single meaning */
  CONTEXT_COLLAPSE: 'context_collapse',
  /** Multiple meanings of a term not recognized */
  POLYSEMY_BLINDNESS: 'polysemy_blindness',

  // ── Metacognitive family ───────────────────────────────────────────────
  /** Belief in stability without actual understanding */
  ILLUSORY_STABILITY: 'illusory_stability',
  /** Significant gap between perceived and actual performance */
  CALIBRATION_FAILURE: 'calibration_failure',
  /** Using wrong learning strategy for the material */
  STRATEGY_MISMATCH: 'strategy_mismatch',
  /** Inability to apply knowledge in new contexts */
  TRANSFER_BLINDNESS: 'transfer_blindness',
} as const;

export type MisconceptionType = (typeof MisconceptionType)[keyof typeof MisconceptionType];

// ============================================================================
// Knowledge Graph — Misconception Pattern Kind
// ============================================================================

/**
 * Categories of misconception detection patterns.
 * Each kind uses a different detection mechanism.
 */
export const MisconceptionPatternKind = {
  /** Analyzes graph topology (cycles, orphans, hierarchy) */
  STRUCTURAL: 'structural',
  /** Analyzes learning metrics across a population */
  STATISTICAL: 'statistical',
  /** Uses vector similarity on node content */
  SEMANTIC: 'semantic',
  /** Combines multiple detection signals */
  HYBRID: 'hybrid',
} as const;

export type MisconceptionPatternKind =
  (typeof MisconceptionPatternKind)[keyof typeof MisconceptionPatternKind];

// ============================================================================
// Knowledge Graph — Misconception Intervention Type
// ============================================================================

/**
 * Remediation action types the system can take in response to misconceptions.
 * Each maps to a content generation strategy.
 */
export const MisconceptionInterventionType = {
  /** Generate a counterexample to disprove the misconception */
  COUNTEREXAMPLE_CARD: 'counterexample_card',
  /** Exercise to distinguish confusable concepts */
  DISAMBIGUATION_EXERCISE: 'disambiguation_exercise',
  /** Review missing prerequisite material */
  PREREQUISITE_REVIEW: 'prerequisite_review',
  /** Visual representation of correct structure */
  STRUCTURAL_VISUALIZATION: 'structural_visualization',
  /** Side-by-side comparison of related concepts */
  GUIDED_COMPARISON: 'guided_comparison',
  /** Direct corrective feedback on the error */
  CORRECTIVE_FEEDBACK: 'corrective_feedback',
  /** Prompt to reorganize knowledge structure */
  REORGANIZATION_PROMPT: 'reorganization_prompt',
  /** Prompt for metacognitive reflection */
  METACOGNITIVE_PROMPT: 'metacognitive_prompt',
} as const;

export type MisconceptionInterventionType =
  (typeof MisconceptionInterventionType)[keyof typeof MisconceptionInterventionType];

// ============================================================================
// Knowledge Graph — Misconception Status
// ============================================================================

// ============================================================================
// Knowledge Graph — Misconception Severity
// ============================================================================

/**
 * Severity levels for detected misconceptions.
 * Indicates how harmful a misconception is for the learner's progress.
 */
export const MisconceptionSeverity = {
  /** Minor terminological confusion; self-corrects with exposure */
  LOW: 'low',
  /** Significant gap; will cause errors on related material */
  MODERATE: 'moderate',
  /** Fundamental misunderstanding; blocks learning in this topic */
  HIGH: 'high',
  /** Deeply entrenched; requires targeted intervention and propagates to neighbors */
  CRITICAL: 'critical',
} as const;

export type MisconceptionSeverity =
  (typeof MisconceptionSeverity)[keyof typeof MisconceptionSeverity];

export const MisconceptionStatus = {
  /** Pattern match detected the misconception */
  DETECTED: 'detected',
  /** Misconception confirmed after further analysis */
  CONFIRMED: 'confirmed',
  /** Intervention applied but not yet resolved */
  ADDRESSED: 'addressed',
  /** Misconception successfully remediated */
  RESOLVED: 'resolved',
  /** Previously resolved misconception re-emerged */
  RECURRING: 'recurring',
} as const;

export type MisconceptionStatus = (typeof MisconceptionStatus)[keyof typeof MisconceptionStatus];

// ============================================================================
// Knowledge Graph — Promotion Band (PKG→CKG Pipeline)
// ============================================================================

/**
 * Confidence levels for the PKG→CKG aggregation pipeline (ADR-005).
 * Determines how much evidence is required before promoting
 * a concept pattern from individual PKGs to the canonical CKG.
 */
export const PromotionBand = {
  /** No promotion signal */
  NONE: 'none',
  /** Weak evidence, insufficient for promotion */
  WEAK: 'weak',
  /** Moderate evidence, approaching threshold */
  MODERATE: 'moderate',
  /** Strong evidence, recommended for promotion */
  STRONG: 'strong',
  /** Definitive evidence, automatic promotion */
  DEFINITIVE: 'definitive',
} as const;

export type PromotionBand = (typeof PromotionBand)[keyof typeof PromotionBand];

// ============================================================================
// Knowledge Graph — Metacognitive Stage
// ============================================================================

/**
 * The 4-stage metacognitive progression model from FEATURE_OVERVIEW.
 * Determines how much structural scaffolding the system provides
 * vs. how much autonomy the user gets in each graph region.
 */
export const MetacognitiveStage = {
  /** System provides full scaffolding and guidance */
  SYSTEM_GUIDED: 'system_guided',
  /** User becomes aware of knowledge structure */
  STRUCTURE_SALIENT: 'structure_salient',
  /** User and system share control of learning path */
  SHARED_CONTROL: 'shared_control',
  /** User has full autonomy over learning structure */
  USER_OWNED: 'user_owned',
} as const;

export type MetacognitiveStage = (typeof MetacognitiveStage)[keyof typeof MetacognitiveStage];

// ============================================================================
// Knowledge Graph — Aggregation Stage
// ============================================================================

/**
 * The 7 stages of the PKG→CKG aggregation pipeline.
 * Tracks where in the pipeline an aggregation run currently is.
 */
export const AggregationStage = {
  /** Collecting signals from individual PKGs */
  SIGNAL_COLLECTION: 'signal_collection',
  /** Extracting patterns from collected signals */
  PATTERN_EXTRACTION: 'pattern_extraction',
  /** Detecting consensus across users */
  CONSENSUS_DETECTION: 'consensus_detection',
  /** Resolving conflicts between signals */
  CONFLICT_RESOLUTION: 'conflict_resolution',
  /** Proposing a CKG mutation from aggregated data */
  MUTATION_PROPOSAL: 'mutation_proposal',
  /** Validating the proposed mutation */
  VALIDATION: 'validation',
  /** Committing the validated mutation */
  COMMITMENT: 'commitment',
} as const;

export type AggregationStage = (typeof AggregationStage)[keyof typeof AggregationStage];

// ============================================================================
// Knowledge Graph — Structural Metric Type
// ============================================================================

/**
 * The 11 structural metrics measuring knowledge graph health.
 * These diagnostics feed the metacognitive engine and drive
 * stage transitions and intervention decisions.
 */
export const StructuralMetricType = {
  /** Drift between abstraction levels in the graph */
  ABSTRACTION_DRIFT: 'abstraction_drift',
  /** Gradient measuring depth calibration quality */
  DEPTH_CALIBRATION_GRADIENT: 'depth_calibration_gradient',
  /** Index measuring concept scope leakage across boundaries */
  SCOPE_LEAKAGE_INDEX: 'scope_leakage_index',
  /** Entropy of sibling confusion patterns */
  SIBLING_CONFUSION_ENTROPY: 'sibling_confusion_entropy',
  /** Strength of upward links in the hierarchy */
  UPWARD_LINK_STRENGTH: 'upward_link_strength',
  /** Breadth score for graph traversal patterns */
  TRAVERSAL_BREADTH_SCORE: 'traversal_breadth_score',
  /** Fit between learning strategy and graph depth */
  STRATEGY_DEPTH_FIT: 'strategy_depth_fit',
  /** Entropy of structural strategy alignment */
  STRUCTURAL_STRATEGY_ENTROPY: 'structural_strategy_entropy',
  /** Accuracy of structural attribution */
  STRUCTURAL_ATTRIBUTION_ACCURACY: 'structural_attribution_accuracy',
  /** Gain in structural stability over time */
  STRUCTURAL_STABILITY_GAIN: 'structural_stability_gain',
  /** Improvement in boundary detection sensitivity */
  BOUNDARY_SENSITIVITY_IMPROVEMENT: 'boundary_sensitivity_improvement',
} as const;

export type StructuralMetricType = (typeof StructuralMetricType)[keyof typeof StructuralMetricType];

// ============================================================================
// Knowledge Graph — Metric Health Status
// ============================================================================

/**
 * Per-metric health classification based on threshold tables.
 * Used in structural health reports to communicate metric state.
 */
export const MetricHealthStatus = {
  /** Metric is within healthy range */
  HEALTHY: 'healthy',
  /** Metric is in moderate/warning range */
  WARNING: 'warning',
  /** Metric is in concerning/critical range */
  CRITICAL: 'critical',
} as const;

export type MetricHealthStatus = (typeof MetricHealthStatus)[keyof typeof MetricHealthStatus];

// ============================================================================
// Knowledge Graph — Trend Direction
// ============================================================================

/**
 * Direction of change for a metric or aggregate score over time.
 * Computed from the last 3–5 metric snapshots.
 */
export const TrendDirection = {
  /** Metric is improving over recent snapshots */
  IMPROVING: 'improving',
  /** Metric is stable (no significant change) */
  STABLE: 'stable',
  /** Metric is declining over recent snapshots */
  DECLINING: 'declining',
} as const;

export type TrendDirection = (typeof TrendDirection)[keyof typeof TrendDirection];
