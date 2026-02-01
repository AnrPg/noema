// =============================================================================
// FLASHCARD TYPES - THE HEART OF THE LEARNING SYSTEM
// =============================================================================
// This file defines all 14 flashcard types you specified, plus the core
// card structure. Each card type has specific content schemas and
// rendering requirements.

import type { CardId, DeckId, UserId, TagId, PluginId } from "./user.types";

// =============================================================================
// CARD TYPE ENUMERATION
// =============================================================================

/**
 * All supported flashcard types in the system.
 * Each type has unique content structure and study mechanics.
 */
export type CardType =
  | "atomic" // 1. Atomic text cards (1 fact, bidirectional)
  | "cloze" // 2. Structured cloze deletions (multi-cloze, syntax-aware)
  | "image_occlusion" // 3. Semantic image occlusion (anatomy, diagrams)
  | "audio" // 4. Audio-first & speech-response
  | "process" // 5. Process/pipeline cards (steps, reordering)
  | "comparison" // 6. Comparison cards (A vs B vs C)
  | "exception" // 7. Exception cards (when does rule fail?)
  | "error_spotting" // 8. Error-spotting cards (find the mistake)
  | "confidence" // 9. Confidence-rated cards (predict before answer)
  | "concept_graph" // 10. Concept-graph/relation cards
  | "case_based" // 11. Case-based cards (vignette → decision)
  | "multimodal" // 12. Multi-modal synthesis (image + text + audio)
  | "transfer" // 13. Transfer cards (apply to novel context)
  | "progressive"; // 14. Progressive disclosure cards

// =============================================================================
// CONTENT TYPE DEFINITIONS FOR EACH CARD TYPE
// =============================================================================

/**
 * 1. ATOMIC CARDS - Single fact, optionally bidirectional
 * Research basis: Testing effect, atomic learning principle
 * Example: "Capital of France" ↔ "Paris"
 */
export interface AtomicCardContent {
  readonly type: "atomic";
  readonly front: RichText; // Question/prompt side
  readonly back: RichText; // Answer side
  readonly bidirectional: boolean; // If true, also test back→front
  readonly hint: string | null; // Optional hint shown on request
  readonly mnemonic: string | null; // Memory aid (user-provided or AI-generated)
  readonly sourceReference: string | null; // Where this fact came from
}

/**
 * 2. CLOZE DELETION CARDS - Syntax-aware, multi-cloze
 * Research basis: Generation effect, active recall
 * Example: "The mitochondria is the {{c1::powerhouse}} of the {{c2::cell}}"
 */
export interface ClozeCardContent {
  readonly type: "cloze";
  readonly text: string; // Full text with {{cN::answer::hint}} syntax
  readonly clozes: readonly ClozeItem[]; // Parsed cloze deletions
  readonly context: string | null; // Optional context shown always
  readonly showAllClozesAtOnce: boolean; // True = show all blanks, False = one at a time
  readonly syntaxHighlighting: string | null; // For code: 'javascript', 'python', etc.
}

/**
 * Individual cloze deletion item within a cloze card.
 */
export interface ClozeItem {
  readonly id: number; // c1, c2, c3...
  readonly answer: string; // The hidden text
  readonly hint: string | null; // Optional hint for this specific cloze
  readonly startIndex: number; // Position in original text
  readonly endIndex: number;
  readonly alternativeAnswers: readonly string[]; // Other acceptable answers
}

/**
 * 3. IMAGE OCCLUSION CARDS - Label-based, layered
 * Research basis: Visual learning, spatial memory
 * Perfect for: Anatomy, diagrams, maps, circuit boards
 */
export interface ImageOcclusionContent {
  readonly type: "image_occlusion";
  readonly imageUrl: string; // Base image URL
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly regions: readonly OcclusionRegion[]; // Areas to hide/reveal
  readonly labels: readonly ImageLabel[]; // Text labels on the image
  readonly layers: readonly OcclusionLayer[]; // For complex layered anatomy
  readonly mode: "hide_one" | "hide_all"; // Hide one region or all at once
}

/**
 * A region on an image that can be occluded.
 */
export interface OcclusionRegion {
  readonly id: string;
  readonly label: string; // What this region represents
  readonly shape: "rectangle" | "ellipse" | "polygon"; //TODO: support more shapes and Bezier curves
  readonly coordinates: readonly number[]; // [x, y, width, height] or polygon points
  readonly color: string; // Occlusion mask color
  readonly groupId: string | null; // Group related regions together
  readonly layer: number; // Z-index for layered occlusions
  readonly alternativeLabels: readonly string[]; // Acceptable alternative answers
}

/**
 * Text label overlay on an image.
 */
export interface ImageLabel {
  readonly id: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
  readonly color: string;
  readonly linkedRegionId: string | null; // Connect label to a region
}

/**
 * For complex diagrams with multiple layers (e.g., anatomy with skin/muscle/bone)
 */
export interface OcclusionLayer {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly opacity: number;
  readonly order: number;
}

/**
 * 4. AUDIO CARDS - Listening and pronunciation
 * Research basis: Dual coding, phonological loop
 * Use cases: Language learning, music, sound recognition
 */
export interface AudioCardContent {
  readonly type: "audio";
  readonly mode:
    | "listen_recall"
    | "pronunciation"
    | "dictation"
    | "sound_recognition";
  readonly audioUrl: string; // Primary audio file
  readonly audioTranscript: string | null; // Text version of audio
  readonly prompt: RichText; // What the user should do
  readonly expectedResponse: string; // Correct answer/pronunciation
  readonly acceptedPronunciations: readonly string[]; // IPA variants
  readonly playbackSpeed: number; // Default playback speed (1.0)
  readonly autoPlay: boolean; // Play audio automatically
  readonly repeatCount: number; // How many times to repeat
  readonly showTranscriptAfter: boolean; // Show transcript after answer
}

/**
 * 5. PROCESS/PIPELINE CARDS - Steps, ordering, causal chains
 * Research basis: Procedural memory, chunking
 * Example: Steps of mitosis, algorithm execution, recipe
 */
export interface ProcessCardContent {
  readonly type: "process";
  readonly mode: "step_omission" | "reordering" | "causal_chain" | "fill_step";
  readonly title: string; // Process name
  readonly description: string | null; // Optional context
  readonly steps: readonly ProcessStep[]; // All steps in correct order
  readonly hiddenStepIndices: readonly number[]; // Which steps to test (for omission mode)
  readonly showStepNumbers: boolean; // Show 1, 2, 3... or not
  readonly allowPartialCredit: boolean; // Award points for partially correct order
}

/**
 * Single step in a process card.
 */
export interface ProcessStep {
  readonly id: string;
  readonly order: number; // Correct position (0-indexed)
  readonly content: RichText; // Step description
  readonly shortLabel: string; // Brief label for reordering UI
  readonly explanation: string | null; // Why this step comes here
  readonly isOptional: boolean; // Some processes have optional steps
  readonly dependencies: readonly string[]; // IDs of steps that must come before
}

/**
 * 6. COMPARISON CARDS - A vs B vs C with discriminative features
 * Research basis: Interleaving, discrimination learning
 * Example: Mitosis vs Meiosis, Similar medications, Confusing grammar rules
 */
export interface ComparisonCardContent {
  readonly type: "comparison";
  readonly title: string; // What is being compared
  readonly items: readonly ComparisonItem[]; // Things being compared (2+)
  readonly features: readonly ComparisonFeature[]; // Dimensions of comparison
  readonly mode: "table" | "venn" | "side_by_side" | "feature_match";
  readonly questionType: "identify_item" | "identify_feature" | "match_all";
  readonly hiddenCells: readonly HiddenCell[]; // Which cells to test
}

/**
 * An item being compared (e.g., "Mitosis" in Mitosis vs Meiosis)
 */
export interface ComparisonItem {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly color: string; // For visual differentiation
}

/**
 * A feature/dimension being compared across items
 */
export interface ComparisonFeature {
  readonly id: string;
  readonly name: string; // e.g., "Number of divisions"
  readonly category: string | null; // Group related features
  readonly values: Record<string, string>; // itemId → value for this feature
}

/**
 * Specifies which cell in the comparison table to hide
 */
export interface HiddenCell {
  readonly itemId: string;
  readonly featureId: string;
}

/**
 * 7. EXCEPTION CARDS - When does the rule fail?
 * Research basis: Exception learning, boundary conditions
 * Example: "When does 'i before e' NOT apply?"
 */
export interface ExceptionCardContent {
  readonly type: "exception";
  readonly rule: RichText; // The general rule
  readonly ruleExample: string; // Example where rule works
  readonly exceptions: readonly ExceptionItem[]; // Cases where rule fails
  readonly mode: "recall_exception" | "identify_if_exception" | "explain_why";
  readonly showRuleAlways: boolean; // Always display the rule
}

/**
 * A single exception to a rule
 */
export interface ExceptionItem {
  readonly id: string;
  readonly case: string; // The exception case
  readonly explanation: string; // Why this is an exception
  readonly category: string | null; // Type of exception
  readonly frequency: "common" | "rare" | "edge_case";
}

/**
 * 8. ERROR-SPOTTING CARDS - Find the mistake
 * Research basis: Error detection, critical thinking
 * Example: Find the bug in this code, spot the incorrect statement
 */
export interface ErrorSpottingContent {
  readonly type: "error_spotting";
  readonly prompt: string; // Instructions
  readonly content: RichText; // Content containing error(s)
  readonly contentType: "text" | "code" | "math" | "diagram";
  readonly errors: readonly ErrorItem[]; // All errors to find
  readonly distractors: readonly string[]; // Things that look wrong but aren't
  readonly requireExplanation: boolean; // Must user explain why it's wrong?
  readonly syntaxHighlighting: string | null; // For code
}

/**
 * A single error in error-spotting content
 */
export interface ErrorItem {
  readonly id: string;
  readonly location: {
    // Where the error is
    readonly startIndex: number;
    readonly endIndex: number;
    readonly line?: number; // For code
    readonly column?: number;
  };
  readonly incorrectContent: string; // What's wrong
  readonly correctContent: string; // What it should be
  readonly explanation: string; // Why it's wrong
  readonly errorType: string; // Category of error
  readonly severity: "critical" | "major" | "minor";
}

/**
 * 9. CONFIDENCE-RATED CARDS - Predict recall before answering
 * Research basis: Metacognition, calibration, judgment of learning
 * User predicts confidence, then sees if they were right
 */
export interface ConfidenceCardContent {
  readonly type: "confidence";
  readonly innerCard: Exclude<CardContent, ConfidenceCardContent>; // Wraps another card type
  readonly confidencePrompt: string; // "How confident are you?"
  readonly confidenceScale: readonly ConfidenceLevel[];
  readonly showCalibrationFeedback: boolean; // Show "You said 80%, you were wrong"
  readonly trackCalibration: boolean; // Record for calibration score
}

/**
 * A level on the confidence scale
 */
export interface ConfidenceLevel {
  readonly value: number; // 0-100
  readonly label: string; // "Very confident", "Somewhat sure", etc.
  readonly emoji: string; // Visual indicator
}

/**
 * 10. CONCEPT-GRAPH CARDS - Rebuild links between concepts
 * Research basis: Semantic networks, elaborative interrogation
 * Example: Connect "Photosynthesis" to related concepts
 */
export interface ConceptGraphContent {
  readonly type: "concept_graph";
  readonly centralConcept: ConceptNode; // The main concept being tested
  readonly relatedConcepts: readonly ConceptNode[];
  readonly relations: readonly ConceptRelation[];
  readonly mode:
    | "build_links"
    | "label_links"
    | "find_missing"
    | "validate_graph";
  readonly hiddenRelations: readonly string[]; // Relation IDs to hide for testing
  readonly showRelationTypes: boolean; // Show "is-a", "part-of" hints
  readonly allowNewConnections: boolean; // Can user add unlisted connections?
}

/**
 * A concept in the knowledge graph
 */
export interface ConceptNode {
  readonly id: string;
  readonly label: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly imageUrl: string | null;
  readonly position?: { x: number; y: number }; // For visual layout
}

/**
 * A relationship between two concepts
 */
export interface ConceptRelation {
  readonly id: string;
  readonly sourceId: string; // From concept
  readonly targetId: string; // To concept
  readonly type: RelationType;
  readonly label: string; // Human-readable description
  readonly bidirectional: boolean;
  readonly strength: "strong" | "moderate" | "weak";
}

/**
 * Types of relationships between concepts
 */
export type RelationType =
  | "is_a" // Taxonomy: "Dog is_a Animal"
  | "part_of" // Meronymy: "Wheel part_of Car"
  | "causes" // Causation: "Heat causes Expansion"
  | "requires" // Prerequisite: "Calculus requires Algebra"
  | "similar_to" // Similarity: "Mitosis similar_to Meiosis"
  | "opposite_of" // Antonymy: "Hot opposite_of Cold"
  | "example_of" // Instance: "Paris example_of Capital"
  | "used_for" // Function: "Knife used_for Cutting"
  | "located_in" // Spatial: "Heart located_in Chest"
  | "occurs_before" // Temporal: "Birth occurs_before Death"
  | "interacts_with" // General: "Enzyme interacts_with Substrate"
  | "custom"; // User-defined relationship

/**
 * 11. CASE-BASED CARDS - Clinical vignette → diagnosis/decision
 * Research basis: Case-based reasoning, situated learning
 * Use cases: Medical diagnosis, legal cases, business decisions
 */
export interface CaseBasedContent {
  readonly type: "case_based";
  readonly scenario: RichText; // The case description
  readonly additionalInfo: readonly CaseInfoItem[]; // Extra info revealed on request
  readonly question: string; // What decision to make
  readonly options: readonly CaseOption[]; // Possible answers
  readonly correctOptionIds: readonly string[]; // One or more correct answers
  readonly decisionTree: DecisionNode | null; // For multi-step reasoning
  readonly keyFindings: readonly string[]; // Critical info to notice
  readonly redHerrings: readonly string[]; // Distracting irrelevant info
  readonly domain: "medical" | "legal" | "business" | "technical" | "other";
}

/**
 * Additional information that can be revealed in a case
 */
export interface CaseInfoItem {
  readonly id: string;
  readonly category: string; // "Lab Results", "History", etc.
  readonly content: RichText;
  readonly cost: number; // "Cost" to reveal (for decision simulation)
  readonly isCritical: boolean; // Must be checked for full credit
}

/**
 * A possible answer/decision in a case
 */
export interface CaseOption {
  readonly id: string;
  readonly label: string;
  readonly explanation: string; // Why this is right/wrong
  readonly consequences: string | null; // What happens if you choose this
}

/**
 * For multi-step decision cases
 */
export interface DecisionNode {
  readonly id: string;
  readonly question: string;
  readonly options: readonly {
    label: string;
    nextNodeId: string | null; // null = terminal node
    isCorrect: boolean;
  }[];
}

/**
 * 12. MULTIMODAL SYNTHESIS CARDS - Image + text + audio combined
 * Research basis: Dual coding, multimedia learning principles
 * Example: Medical image with audio description and text questions
 */
export interface MultimodalContent {
  readonly type: "multimodal";
  readonly elements: readonly MultimodalElement[];
  readonly question: RichText;
  readonly answer: RichText;
  readonly elementInteractions: readonly ElementInteraction[];
  readonly synchronization: "sequential" | "simultaneous" | "user_controlled";
}

/**
 * A single element in a multimodal card
 */
export interface MultimodalElement {
  readonly id: string;
  readonly type: "text" | "image" | "audio" | "video" | "diagram";
  readonly content: string; // Text content or URL
  readonly label: string | null;
  readonly displayOrder: number;
  readonly displayDuration: number | null; // For timed elements (ms)
  readonly isRequired: boolean; // Must interact with before answering
}

/**
 * How elements interact with each other
 */
export interface ElementInteraction {
  readonly sourceId: string;
  readonly targetId: string;
  readonly type: "highlights" | "explains" | "contrasts";
}

/**
 * 13. TRANSFER CARDS - Apply concept to novel context
 * Research basis: Transfer of learning, far transfer
 * Example: "Apply Ohm's Law to this new circuit configuration"
 */
export interface TransferCardContent {
  readonly type: "transfer";
  readonly originalConcept: RichText; // The concept being transferred
  readonly originalContext: RichText; // Where they learned it
  readonly originalExample: RichText; // Example from original context
  readonly novelContext: RichText; // New situation to apply it
  readonly question: string; // How to apply it here
  readonly answer: RichText; // Correct application
  readonly transferDistance: "near" | "far"; // How different is the new context
  readonly scaffolding: readonly TransferHint[]; // Hints to bridge the gap
  readonly commonMisconceptions: readonly string[];
}

/**
 * Hints to help with transfer
 */
export interface TransferHint {
  readonly id: string;
  readonly hint: string;
  readonly revealOrder: number; // Progressive hint revelation
  readonly bridgesConcept: string; // What concept this hint connects
}

/**
 * 14. PROGRESSIVE DISCLOSURE CARDS - Details unlock after correct recall
 * Research basis: Scaffolding, zone of proximal development
 * Example: Basic fact → detailed mechanism → edge cases
 */
export interface ProgressiveDisclosureContent {
  readonly type: "progressive";
  readonly levels: readonly ProgressiveLevel[];
  readonly currentLevel: number; // User's current unlock level
  readonly requireCorrectToAdvance: boolean; // Must get right to see next level
  readonly streakToUnlock: number; // Correct answers needed to advance
  readonly allowLevelSkip: boolean; // Can user jump to harder levels
}

/**
 * A single level of progressive disclosure
 */
export interface ProgressiveLevel {
  readonly level: number; // 0 = basic, higher = more advanced
  readonly name: string; // "Foundation", "Intermediate", "Expert"
  readonly front: RichText; // Question at this level
  readonly back: RichText; // Answer at this level
  readonly unlockedContent: RichText | null; // Bonus content shown when unlocked
  readonly difficulty: number; // 1-10 scale
  readonly prerequisites: readonly string[]; // Concept IDs needed first
}

// =============================================================================
// RICH TEXT TYPE - For formatted content
// =============================================================================

/**
 * Rich text content that can include formatting, math, and media.
 */
export interface RichText {
  readonly format: "plain" | "markdown" | "html";
  readonly content: string;
  readonly attachments: readonly MediaAttachment[];
  readonly mathBlocks: readonly MathBlock[];
}

/**
 * Media attachment within rich text
 */
export interface MediaAttachment {
  readonly id: string;
  readonly type: "image" | "audio" | "video" | "file";
  readonly url: string;
  readonly altText: string | null;
  readonly caption: string | null;
  readonly width: number | null;
  readonly height: number | null;
}

/**
 * LaTeX math block within rich text
 */
export interface MathBlock {
  //TODO: add support for various LaTex variations
  readonly id: string;
  readonly latex: string;
  readonly display: "inline" | "block";
}

// =============================================================================
// UNION TYPE FOR ALL CARD CONTENT
// =============================================================================

/**
 * Union type of all possible card content types.
 * Use discriminated union pattern with 'type' field.
 */
export type CardContent =
  | AtomicCardContent
  | ClozeCardContent
  | ImageOcclusionContent
  | AudioCardContent
  | ProcessCardContent
  | ComparisonCardContent
  | ExceptionCardContent
  | ErrorSpottingContent
  | ConfidenceCardContent
  | ConceptGraphContent
  | CaseBasedContent
  | MultimodalContent
  | TransferCardContent
  | ProgressiveDisclosureContent;

// =============================================================================
// CORE CARD STRUCTURE
// =============================================================================

/**
 * The main Card entity that wraps content with metadata and SRS state.
 * This is the atomic unit of learning in the system.
 */
export interface Card {
  readonly id: CardId;
  readonly deckId: DeckId;
  readonly userId: UserId;

  // Content
  readonly content: CardContent;
  readonly tags: readonly TagId[];

  // Metadata
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly sourceFile: string | null; // If imported from a file
  readonly sourcePlugin: PluginId | null; // If generated by a plugin

  // SRS State (mutable)
  readonly srsState: CardSRSState;

  // Statistics
  readonly stats: CardStats;

  // Flags
  readonly isSuspended: boolean; // Temporarily excluded from reviews
  readonly isBuried: boolean; // Excluded until next day
  readonly isLeech: boolean; // Repeatedly forgotten
}

/**
 * Spaced repetition state for a card.
 * Contains all data needed by scheduling algorithms.
 * Compatible with database schema for direct use in API.
 */
export interface CardSRSState {
  // Core FSRS/HLR parameters
  readonly stability: number; // Memory stability (days)
  readonly difficulty: number; // Card difficulty (0-1 scale)
  readonly elapsedDays: number; // Days since last review
  readonly scheduledDays: number; // Days until next review

  // Review counts (optional - not all schedulers use these)
  readonly reps?: number; // Total number of reviews
  readonly lapses?: number; // Number of times card was forgotten

  // Scheduling state
  readonly state: CardState;
  readonly lastReviewDate: Date | null;

  // Optional: computed fields (may not always be present)
  readonly retrievability?: number; // Current recall probability (0-1)
  readonly dueDate?: Date;
  readonly lastRating?: Rating | null;

  // For half-life regression
  readonly halfLife?: number; // Memory half-life in days

  // For interference modeling (optional)
  readonly similarCardIds?: readonly CardId[]; // Cards that might interfere
  readonly lastInterferenceCheck?: Date | null;

  // Algorithm-specific data (JSON blob)
  readonly algorithmData?: Record<string, unknown>;
}

/**
 * Learning state of a card
 */
export type CardState =
  | "new" // Never studied
  | "learning" // In initial learning phase
  | "review" // In regular review cycle
  | "relearning"; // Forgotten, relearning

/**
 * User rating after reviewing a card (string form)
 */
export type Rating = "again" | "hard" | "good" | "easy";

/**
 * User rating as a number (1-4)
 */
export type NumericRating = 1 | 2 | 3 | 4;

/**
 * Numeric values for ratings (used in algorithms)
 */
export const RatingValues: Record<Rating, NumericRating> = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
} as const;

/**
 * Convert numeric rating to string rating
 */
export const NumericToRating: Record<NumericRating, Rating> = {
  1: "again",
  2: "hard",
  3: "good",
  4: "easy",
} as const;

/**
 * Convert numeric rating (1-4) to string rating
 */
export function toRating(num: number): Rating {
  if (num <= 1) return "again";
  if (num === 2) return "hard";
  if (num === 3) return "good";
  return "easy";
}

/**
 * Lifetime statistics for a card
 */
export interface CardStats {
  readonly totalReviews: number;
  readonly correctReviews: number;
  readonly againCount: number;
  readonly hardCount: number;
  readonly goodCount: number;
  readonly easyCount: number;
  readonly totalStudyTime: number; // Milliseconds
  readonly averageResponseTime: number; // Milliseconds
  readonly streakCurrent: number; // Current correct streak
  readonly streakBest: number; // Best correct streak
  readonly lapseCount: number; // Times forgotten after learning
  readonly lastConfidenceRating: number | null; // For confidence tracking
  readonly confidenceAccuracy: number | null; // How well-calibrated
}
