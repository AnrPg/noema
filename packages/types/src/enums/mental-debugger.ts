/**
 * @noema/types - Mental Debugger Enumerations
 *
 * Failure taxonomy and diagnostic types for the Mental Debugger.
 * Based on the 7-frame cognitive stack trace model.
 */

// ============================================================================
// Thinking Trace Frames
// ============================================================================

/**
 * The 7 frames of a thinking trace (stack trace of thinking).
 */
export const TraceFrame = {
  /** F0: Why am I doing this right now? */
  CONTEXT_INTENT: 'context_intent',
  /** F1: What is being asked of me? */
  TASK_PARSING: 'task_parsing',
  /** F2: What did I latch onto? */
  CUE_SELECTION: 'cue_selection',
  /** F3: How did I produce a candidate answer? */
  RETRIEVAL_GENERATION: 'retrieval_generation',
  /** F4: What did I do with that candidate? */
  REASONING_TRANSFORMATION: 'reasoning_transformation',
  /** F5: Did I stop at the right time? */
  COMMITMENT_MONITORING: 'commitment_monitoring',
  /** F6: Why did this happen, and what changes next time? */
  OUTCOME_ATTRIBUTION: 'outcome_attribution',
} as const;

export type TraceFrame = (typeof TraceFrame)[keyof typeof TraceFrame];

// ============================================================================
// Frame 0: Context & Intent Fields
// ============================================================================

/**
 * Goal types for Frame 0.
 */
export const GoalType = {
  RECALL: 'recall',
  RECOGNIZE: 'recognize',
  DISCRIMINATE: 'discriminate',
  EXPLAIN: 'explain',
  APPLY: 'apply',
  TRANSFER: 'transfer',
  DERIVE: 'derive',
  CREATE: 'create',
  EVALUATE: 'evaluate',
} as const;

export type GoalType = (typeof GoalType)[keyof typeof GoalType];

/**
 * Stakes modes for Frame 0.
 */
export const StakesMode = {
  PRACTICE: 'practice',
  EXAM_SIM: 'exam_sim',
  SPEEDRUN: 'speedrun',
  DEEP_WORK: 'deep_work',
  REVIEW_ONLY: 'review_only',
  REHAB_AFTER_ERROR: 'rehab_after_error',
} as const;

export type StakesMode = (typeof StakesMode)[keyof typeof StakesMode];

/**
 * Motivation states (optional).
 */
export const MotivationState = {
  CURIOUS: 'curious',
  NEUTRAL: 'neutral',
  PRESSURED: 'pressured',
  BORED: 'bored',
  AVOIDANT: 'avoidant',
} as const;

export type MotivationState = (typeof MotivationState)[keyof typeof MotivationState];

/**
 * Energy states (optional).
 */
export const EnergyState = {
  FRESH: 'fresh',
  OK: 'ok',
  TIRED: 'tired',
  EXHAUSTED: 'exhausted',
} as const;

export type EnergyState = (typeof EnergyState)[keyof typeof EnergyState];

// ============================================================================
// Frame 1: Task Parsing Fields
// ============================================================================

/**
 * Prompt focus types for Frame 1.
 */
export const PromptFocus = {
  DEFINITION: 'definition',
  EXAMPLE: 'example',
  MECHANISM: 'mechanism',
  COMPARISON: 'comparison',
  PROCEDURE: 'procedure',
  MAPPING: 'mapping',
  EQUATION: 'equation',
  TRANSLATION: 'translation',
  LABEL: 'label',
  DIAGNOSIS: 'diagnosis',
} as const;

export type PromptFocus = (typeof PromptFocus)[keyof typeof PromptFocus];

/**
 * Instruction features detected in prompt.
 */
export const InstructionFeature = {
  NEGATION_PRESENT: 'negation_present',
  QUANTIFIERS_PRESENT: 'quantifiers_present',
  CONDITIONALS_PRESENT: 'conditionals_present',
  MULTI_CONSTRAINTS: 'multi_constraints',
  UNITS_PRESENT: 'units_present',
  DIRECTIONALITY_PRESENT: 'directionality_present',
  MULTI_STEP: 'multi_step',
} as const;

export type InstructionFeature = (typeof InstructionFeature)[keyof typeof InstructionFeature];

// ============================================================================
// Frame 2: Cue Selection Fields
// ============================================================================

/**
 * Primary cue types for Frame 2.
 */
export const CueType = {
  KEYWORD: 'keyword',
  PHRASE: 'phrase',
  VISUAL_REGION: 'visual_region',
  PRIOR_ITEM: 'prior_item',
  MNEMONIC: 'mnemonic',
  SCHEMA_SLOT: 'schema_slot',
  EMOTIONAL_TAG: 'emotional_tag',
  PHONETIC: 'phonetic',
  LAYOUT: 'layout',
  NUMBER_UNIT: 'number_unit',
  LOOKS_FAMILIAR: 'looks_familiar',
} as const;

export type CueType = (typeof CueType)[keyof typeof CueType];

/**
 * Cue diagnosticity levels.
 */
export const CueDiagnosticity = {
  /** Cue correctly identifies the answer */
  DIAGNOSTIC: 'diagnostic',
  /** Cue partially helps */
  SEMI_DIAGNOSTIC: 'semi_diagnostic',
  /** Cue is superficial/misleading */
  SUPERFICIAL: 'superficial',
  /** Unknown diagnosticity */
  UNKNOWN: 'unknown',
} as const;

export type CueDiagnosticity = (typeof CueDiagnosticity)[keyof typeof CueDiagnosticity];

// ============================================================================
// Frame 3: Retrieval/Generation Fields
// ============================================================================

/**
 * Retrieval modes for Frame 3.
 */
export const RetrievalMode = {
  DIRECT_RECALL: 'direct_recall',
  RECONSTRUCT: 'reconstruct',
  RECOGNITION: 'recognition',
  ELIMINATION: 'elimination',
  ANALOGY: 'analogy',
  GUESS: 'guess',
  COMPUTE: 'compute',
  TRANSLATE: 'translate',
  SEARCH_MEMORY_PATH: 'search_memory_path',
} as const;

export type RetrievalMode = (typeof RetrievalMode)[keyof typeof RetrievalMode];

/**
 * Interference markers.
 */
export const InterferenceMarker = {
  NONE: 'none',
  PROACTIVE: 'proactive',
  RETROACTIVE: 'retroactive',
  MIXED: 'mixed',
  UNKNOWN: 'unknown',
} as const;

export type InterferenceMarker = (typeof InterferenceMarker)[keyof typeof InterferenceMarker];

/**
 * Partial knowledge types.
 */
export const PartialKnowledge = {
  NONE: 'none',
  GIST_ONLY: 'gist_only',
  DEFINITION_ONLY: 'definition_only',
  PROCEDURE_ONLY: 'procedure_only',
  EXAMPLE_ONLY: 'example_only',
} as const;

export type PartialKnowledge = (typeof PartialKnowledge)[keyof typeof PartialKnowledge];

// ============================================================================
// Frame 4: Reasoning/Transformation Fields
// ============================================================================

/**
 * Operation types for Frame 4.
 */
export const OperationType = {
  COMPARE: 'compare',
  MAP: 'map',
  INFER: 'infer',
  CALCULATE: 'calculate',
  TRANSLATE: 'translate',
  GENERALIZE: 'generalize',
  SPECIALIZE: 'specialize',
  SIMULATE: 'simulate',
  EXPLAIN_CAUSALLY: 'explain_causally',
  PROVE_STEP: 'prove_step',
  CLASSIFY: 'classify',
} as const;

export type OperationType = (typeof OperationType)[keyof typeof OperationType];

/**
 * Representation types used.
 */
export const RepresentationType = {
  VERBAL: 'verbal',
  SYMBOLIC: 'symbolic',
  DIAGRAM: 'diagram',
  MENTAL_IMAGE: 'mental_image',
  FORMULA: 'formula',
  CODE: 'code',
  MIXED: 'mixed',
} as const;

export type RepresentationType = (typeof RepresentationType)[keyof typeof RepresentationType];

// ============================================================================
// Frame 5: Selection/Commitment Fields
// ============================================================================

/**
 * Decision policies for Frame 5.
 */
export const DecisionPolicy = {
  BEST_MATCH: 'best_match',
  FAMILIARITY: 'familiarity',
  SPEED: 'speed',
  ELIMINATION_THEN_PICK: 'elimination_then_pick',
  RISK_AVERSE: 'risk_averse',
  RISK_SEEKING: 'risk_seeking',
  RANDOM_GUESS: 'random_guess',
} as const;

export type DecisionPolicy = (typeof DecisionPolicy)[keyof typeof DecisionPolicy];

// ============================================================================
// Frame 6: Verification/Monitoring Fields
// ============================================================================

/**
 * Self-check types performed.
 */
export const SelfCheckType = {
  NONE: 'none',
  REREAD_PROMPT: 'reread_prompt',
  UNIT_CHECK: 'unit_check',
  POLARITY_CHECK: 'polarity_check',
  SANITY_CHECK: 'sanity_check',
  COUNTEREXAMPLE_CHECK: 'counterexample_check',
  DEFINITION_REDERIVE: 'definition_rederive',
  BACKTRANSLATE: 'backtranslate',
  BOUNDARY_CASE: 'boundary_case',
  EXPLAIN_OUT_LOUD: 'explain_out_loud',
} as const;

export type SelfCheckType = (typeof SelfCheckType)[keyof typeof SelfCheckType];

/**
 * Stop condition for committing answer.
 */
export const StopCondition = {
  TIME_LIMIT: 'time_limit',
  CERTAINTY_THRESHOLD: 'certainty_threshold',
  FATIGUE: 'fatigue',
  GOOD_ENOUGH: 'good_enough',
  FORCED_NEXT: 'forced_next',
} as const;

export type StopCondition = (typeof StopCondition)[keyof typeof StopCondition];

// ============================================================================
// Failure Taxonomy - 10 Families
// ============================================================================

/**
 * The 10 failure families from the Mental Debugger taxonomy.
 * Each family contains multiple subtypes.
 */
export const FailureFamily = {
  /** Task Parsing & Instruction Interpretation failures */
  PARSING: 'parsing',
  /** Attention / Perception / Input Processing failures */
  ATTENTION: 'attention',
  /** Cue Selection failures */
  CUE_SELECTION: 'cue_selection',
  /** Retrieval & Memory Interference failures */
  RETRIEVAL: 'retrieval',
  /** Similarity Confusion (Discrimination) failures */
  DISCRIMINATION: 'discrimination',
  /** Reasoning / Rule Application failures */
  REASONING: 'reasoning',
  /** Verification / Monitoring failures */
  MONITORING: 'monitoring',
  /** Commitment / Decision Policy failures */
  COMMITMENT: 'commitment',
  /** Calibration failures (metacognition core) */
  CALIBRATION: 'calibration',
  /** Attribution failures (meta-failure) */
  ATTRIBUTION: 'attribution',
} as const;

export type FailureFamily = (typeof FailureFamily)[keyof typeof FailureFamily];

// ============================================================================
// Failure Subtypes by Family
// ============================================================================

/**
 * Family 1: Task Parsing failures.
 */
export const ParsingFailureSubtype = {
  /** Missed NOT/EXCEPT */
  NEGATION_BLINDNESS: 'negation_blindness',
  /** all/some/most confusion */
  QUANTIFIER_SLIP: 'quantifier_slip',
  /** if/only-if confusion */
  CONDITION_MISREAD: 'condition_misread',
  /** Missed units, direction, etc. */
  CONSTRAINT_OMISSION: 'constraint_omission',
  /** Answered wrong task type */
  GOAL_MISMATCH: 'goal_mismatch',
  /** Ignored sub-question */
  MULTI_PART_COLLAPSE: 'multi_part_collapse',
  /** Name vs description confusion */
  LABEL_DEFINITION_CONFUSION: 'label_definition_confusion',
  /** Pronoun/reference ambiguity */
  REFERENCE_RESOLUTION_ERROR: 'reference_resolution_error',
  /** L1↔L2 direction mistake */
  LANGUAGE_DIRECTION_MISTAKE: 'language_direction_mistake',
} as const;

export type ParsingFailureSubtype =
  (typeof ParsingFailureSubtype)[keyof typeof ParsingFailureSubtype];

/**
 * Family 2: Attention/Perception failures.
 */
export const AttentionFailureSubtype = {
  /** Skipped token while reading */
  SKIMMING: 'skimming',
  /** Looked at wrong image area */
  VISUAL_MISLOCALIZATION: 'visual_mislocalization',
  /** 12 vs 21 */
  NUMBER_TRANSPOSITION: 'number_transposition',
  /** +/- mistake */
  SIGN_POLARITY_SLIP: 'sign_polarity_slip',
  /** l/1, O/0 confusion */
  SIMILAR_GLYPH_CONFUSION: 'similar_glyph_confusion',
  /** Context switch interrupted */
  DISTRACTION_INTERRUPTION: 'distraction_interruption',
  /** Tired mistake */
  FATIGUE_LAPSE: 'fatigue_lapse',
  /** Lost constraint mid-task */
  WORKING_MEMORY_OVERFLOW: 'working_memory_overflow',
} as const;

export type AttentionFailureSubtype =
  (typeof AttentionFailureSubtype)[keyof typeof AttentionFailureSubtype];

/**
 * Family 3: Cue Selection failures.
 */
export const CueSelectionFailureSubtype = {
  /** Latched onto keyword/shape */
  SURFACE_FEATURE_ANCHORING: 'surface_feature_anchoring',
  /** Learned non-causal cue */
  SPURIOUS_CUE_LEARNING: 'spurious_cue_learning',
  /** Cognate/translation confusion */
  FALSE_FRIEND_CUE: 'false_friend_cue',
  /** Previous item primed answer */
  CONTEXT_LEAKAGE: 'context_leakage',
  /** Mnemonic was wrong */
  MNEMONIC_OVER_TRUST: 'mnemonic_over_trust',
  /** Wrong category frame */
  SCHEMA_SLOT_MISCUE: 'schema_slot_miscue',
  /** Chose "sounds formal" */
  AUTHORITY_CUE_BIAS: 'authority_cue_bias',
  /** Feels known → chosen */
  FAMILIARITY_BIAS: 'familiarity_bias',
} as const;

export type CueSelectionFailureSubtype =
  (typeof CueSelectionFailureSubtype)[keyof typeof CueSelectionFailureSubtype];

/**
 * Family 4: Retrieval failures.
 */
export const RetrievalFailureSubtype = {
  /** Knows it, can't retrieve */
  TIP_OF_TONGUE: 'tip_of_tongue',
  /** Recent retrieval harmed others */
  RETRIEVAL_INDUCED_FORGETTING: 'retrieval_induced_forgetting',
  /** Old blocks new */
  PROACTIVE_INTERFERENCE: 'proactive_interference',
  /** New corrupts old */
  RETROACTIVE_INTERFERENCE: 'retroactive_interference',
  /** Recently seen feels right */
  AVAILABILITY_BIAS: 'availability_bias',
  /** Needs original context */
  CONTEXT_DEPENDENT_FAILURE: 'context_dependent_failure',
  /** Never formed good trace */
  WEAK_ENCODING: 'weak_encoding',
  /** Pieces exist, can't assemble */
  FRAGMENTED_KNOWLEDGE: 'fragmented_knowledge',
  /** Gist retained, discriminants lost */
  OVERCOMPRESSION: 'overcompression',
} as const;

export type RetrievalFailureSubtype =
  (typeof RetrievalFailureSubtype)[keyof typeof RetrievalFailureSubtype];

/**
 * Family 5: Discrimination failures.
 */
export const DiscriminationFailureSubtype = {
  /** One-feature difference confusion */
  NEAR_NEIGHBOR_SWAP: 'near_neighbor_swap',
  /** Missing discriminants */
  CATEGORY_BOUNDARY_BLUR: 'category_boundary_blur',
  /** Chose typical, missed atypical */
  PROTOTYPE_TRAP: 'prototype_trap',
  /** Multiple concepts → same word */
  MANY_TO_ONE_CONFUSION: 'many_to_one_confusion',
  /** One word → multiple meanings */
  ONE_TO_MANY_CONFUSION: 'one_to_many_confusion',
  /** Too many similar items at once */
  CONFUSABLE_SET_SATURATION: 'confusable_set_saturation',
  /** Superclass vs subclass */
  HIERARCHY_CONFUSION: 'hierarchy_confusion',
} as const;

export type DiscriminationFailureSubtype =
  (typeof DiscriminationFailureSubtype)[keyof typeof DiscriminationFailureSubtype];

/**
 * Family 6: Reasoning failures.
 */
export const ReasoningFailureSubtype = {
  /** Right rule, wrong context */
  RULE_MISFIRE: 'rule_misfire',
  /** Should apply rule but didn't */
  RULE_OMISSION: 'rule_omission',
  /** Correct method, wrong step */
  PROCEDURAL_STEP_ERROR: 'procedural_step_error',
  /** Applied rule too broadly */
  SEMANTIC_OVERGENERALIZATION: 'semantic_overgeneralization',
  /** Too narrow; missed transfer */
  UNDERGENERALIZATION: 'undergeneralization',
  /** Implicit assumption false */
  ASSUMPTION_ERROR: 'assumption_error',
  /** Coherent story > mechanism */
  CAUSAL_STORY_FALLACY: 'causal_story_fallacy',
  /** Analogy invalid outside region */
  ANALOGY_OVERREACH: 'analogy_overreach',
  /** Used conclusion as premise */
  CIRCULAR_REASONING: 'circular_reasoning',
  /** Correlation ≠ causation */
  CORRELATION_CAUSATION_SLIP: 'correlation_causation_slip',
  /** Optimized wrong criterion */
  MIS_SPECIFIED_OBJECTIVE: 'mis_specified_objective',
  /** Skipped justification */
  INCOMPLETE_DERIVATION: 'incomplete_derivation',
} as const;

export type ReasoningFailureSubtype =
  (typeof ReasoningFailureSubtype)[keyof typeof ReasoningFailureSubtype];

/**
 * Family 7: Monitoring failures.
 */
export const MonitoringFailureSubtype = {
  /** No self-check performed */
  NO_SELF_CHECK: 'no_self_check',
  /** Checked wrong thing */
  WRONG_CHECK_TARGET: 'wrong_check_target',
  /** Only looked for support */
  CONFIRMATION_BIAS: 'confirmation_bias',
  /** Stopped when uncertain */
  PREMATURE_STOP: 'premature_stop',
  /** Too many edits, paralysis */
  OVERCHECKING_LOOP: 'overchecking_loop',
  /** Couldn't generate counterexample */
  FAILED_DISCONFIRMATION: 'failed_disconfirmation',
  /** Learned wrong lesson */
  MISINTERPRETED_FEEDBACK: 'misinterpreted_feedback',
  /** Didn't update after correction */
  STUBBORN_PRIOR: 'stubborn_prior',
} as const;

export type MonitoringFailureSubtype =
  (typeof MonitoringFailureSubtype)[keyof typeof MonitoringFailureSubtype];

/**
 * Family 8: Commitment failures.
 */
export const CommitmentFailureSubtype = {
  /** Stopped too early */
  PREMATURE_COMMIT: 'premature_commit',
  /** Too many changes, indecision */
  OVER_EDITING: 'over_editing',
  /** Chose most familiar */
  DEFAULT_TO_FAMILIAR: 'default_to_familiar',
  /** Bet on low-probability */
  RISK_SEEKING_ERROR: 'risk_seeking_error',
  /** Missed high-probability */
  RISK_AVERSION_ERROR: 'risk_aversion_error',
  /** Sunk cost influence */
  ESCALATION_OF_COMMITMENT: 'escalation_of_commitment',
} as const;

export type CommitmentFailureSubtype =
  (typeof CommitmentFailureSubtype)[keyof typeof CommitmentFailureSubtype];

/**
 * Family 9: Calibration failures.
 */
export const CalibrationFailureSubtype = {
  /** Illusion of knowing */
  OVERCONFIDENCE: 'overconfidence',
  /** Hidden competence */
  UNDERCONFIDENCE: 'underconfidence',
  /** "I don't know" when partial */
  POOR_UNCERTAINTY_EXPRESSION: 'poor_uncertainty_expression',
  /** High confidence despite ambiguity */
  CONFIDENCE_DESPITE_AMBIGUITY: 'confidence_despite_ambiguity',
  /** Changed answer to wrong */
  SECOND_GUESSING_ERROR: 'second_guessing_error',
} as const;

export type CalibrationFailureSubtype =
  (typeof CalibrationFailureSubtype)[keyof typeof CalibrationFailureSubtype];

/**
 * Family 10: Attribution failures.
 */
export const AttributionFailureSubtype = {
  /** Blamed memory when it was parsing */
  WRONG_DIAGNOSIS: 'wrong_diagnosis',
  /** "I'm dumb" instead of process */
  ABILITY_ATTRIBUTION: 'ability_attribution',
  /** Blamed system instead of self */
  EXTERNAL_ATTRIBUTION_BIAS: 'external_attribution_bias',
  /** Took credit for luck */
  SELF_SERVING_ATTRIBUTION: 'self_serving_attribution',
} as const;

export type AttributionFailureSubtype =
  (typeof AttributionFailureSubtype)[keyof typeof AttributionFailureSubtype];

/**
 * Union of all failure subtypes.
 */
export type FailureSubtype =
  | ParsingFailureSubtype
  | AttentionFailureSubtype
  | CueSelectionFailureSubtype
  | RetrievalFailureSubtype
  | DiscriminationFailureSubtype
  | ReasoningFailureSubtype
  | MonitoringFailureSubtype
  | CommitmentFailureSubtype
  | CalibrationFailureSubtype
  | AttributionFailureSubtype;

// ============================================================================
// Diagnosis Severity
// ============================================================================

/**
 * Error severity levels.
 */
export const ErrorSeverity = {
  /** Minor format issue */
  MINOR: 'minor',
  /** Conceptual/procedural error */
  MODERATE: 'moderate',
  /** Significant knowledge gap */
  MAJOR: 'major',
  /** Safety-critical if real world */
  CRITICAL: 'critical',
} as const;

export type ErrorSeverity = (typeof ErrorSeverity)[keyof typeof ErrorSeverity];

// ============================================================================
// Patch Types
// ============================================================================

/**
 * Patch timeframes.
 */
export const PatchTimeframe = {
  /** Apply immediately (this session) */
  IMMEDIATE: 'immediate',
  /** Apply in near term (next few sessions) */
  NEAR_TERM: 'near_term',
  /** Long-term intervention */
  LONG_TERM: 'long_term',
} as const;

export type PatchTimeframe = (typeof PatchTimeframe)[keyof typeof PatchTimeframe];

/**
 * Patch intrusiveness levels.
 */
export const PatchIntrusiveness = {
  /** Silent (no user awareness) */
  SILENT: 'silent',
  /** Subtle (light feedback) */
  SUBTLE: 'subtle',
  /** Moderate (clear feedback) */
  MODERATE: 'moderate',
  /** Intrusive (requires action) */
  INTRUSIVE: 'intrusive',
} as const;

export type PatchIntrusiveness = (typeof PatchIntrusiveness)[keyof typeof PatchIntrusiveness];
