/**
 * @noema/content-service — Per-Card-Type Content Schemas
 *
 * Zod schemas that enforce type-specific content structure for all 42 card types:
 *  - 22 standard CardTypes
 *  - 20 RemediationCardTypes
 *
 * Every schema extends the base fields (front, back, hint?, explanation?, media?)
 * with additional type-specific required and optional fields.
 *
 * The discriminated validator `validateCardContent()` dispatches to the correct
 * schema based on the cardType discriminator at the API boundary.
 */

import { CardType, RemediationCardType } from '@noema/types';
import { z } from 'zod';
import { MediaAttachmentSchema } from './content.schemas.js';
import {
  CardBackSchema,
  CardFrontSchema,
  ExplanationSchema,
  HintSchema,
} from './value-objects/content.value-objects.js';

// ============================================================================
// Shared Base — All card content inherits these fields
// ============================================================================

const CardContentBaseSchema = z.object({
  front: CardFrontSchema,
  back: CardBackSchema,
  hint: HintSchema,
  explanation: ExplanationSchema,
  media: z.array(MediaAttachmentSchema).max(20).optional(),
});

// ============================================================================
// Shared Building Blocks (reusable across schemas)
// ============================================================================

const RichTextBlock = z.string().min(1).max(50_000);
const ShortText = z.string().min(1).max(2_000);
const OptionalText = z.string().max(5_000).optional();
const PositiveInt = z.number().int().min(0);

// ============================================================================
// 1. ATOMIC — Basic question/answer (base only, no extra fields)
// ============================================================================

export const AtomicContentSchema = CardContentBaseSchema.describe(
  'Atomic card — simple question/answer pair'
);

// ============================================================================
// 2. CLOZE — Fill-in-the-blank
// ============================================================================

const ClozeItem = z.object({
  /** Text of the cloze deletion (the hidden part) */
  text: ShortText,
  /** The expected answer */
  answer: ShortText,
  /** Position index within the template string */
  position: PositiveInt,
});

export const ClozeContentSchema = CardContentBaseSchema.extend({
  /** Template string with {{c1::answer}} placeholders */
  template: RichTextBlock.describe('Cloze template with {{cN::answer}} placeholders'),
  /** Parsed cloze deletions */
  clozes: z.array(ClozeItem).min(1).max(20),
}).describe('Cloze card — fill-in-the-blank');

// ============================================================================
// 3. IMAGE_OCCLUSION — Image with masked regions
// ============================================================================

const OcclusionRegion = z.object({
  /** Region ID for tracking */
  id: z.string().min(1).max(50),
  /** X coordinate (percentage 0-100) */
  x: z.number().min(0).max(100),
  /** Y coordinate (percentage 0-100) */
  y: z.number().min(0).max(100),
  /** Width (percentage 0-100) */
  width: z.number().min(0).max(100),
  /** Height (percentage 0-100) */
  height: z.number().min(0).max(100),
  /** Label for this region (the answer) */
  label: ShortText,
  /** Optional shape: rect is default */
  shape: z.enum(['rect', 'ellipse', 'polygon']).default('rect'),
});

export const ImageOcclusionContentSchema = CardContentBaseSchema.extend({
  /** URL or media-service ID of the base image */
  imageUrl: z.string().min(1).max(2_000),
  /** Masked regions to reveal during review */
  regions: z.array(OcclusionRegion).min(1).max(50),
}).describe('Image occlusion card — masked regions on an image');

// ============================================================================
// 4. AUDIO — Listen and recall
// ============================================================================

export const AudioContentSchema = CardContentBaseSchema.extend({
  /** URL or media-service ID of the audio file */
  audioUrl: z.string().min(1).max(2_000),
  /** Optional transcript */
  transcript: OptionalText,
  /** Suggested playback speed multiplier */
  playbackSpeed: z.number().min(0.25).max(4).default(1).optional(),
  /** Start timestamp in seconds (for clips) */
  startTime: z.number().min(0).optional(),
  /** End timestamp in seconds */
  endTime: z.number().min(0).optional(),
}).describe('Audio card — listen and recall');

// ============================================================================
// 5. PROCESS — Step-by-step sequences
// ============================================================================

const ProcessStep = z.object({
  /** Step order (1-based) */
  order: z.number().int().min(1),
  /** Step title */
  title: ShortText,
  /** Step description */
  description: RichTextBlock,
  /** Optional media for this step */
  imageUrl: z.string().max(2_000).optional(),
});

export const ProcessContentSchema = CardContentBaseSchema.extend({
  /** Name of the process */
  processName: ShortText,
  /** Ordered steps */
  steps: z.array(ProcessStep).min(2).max(30),
}).describe('Process card — step-by-step sequence');

// ============================================================================
// 6. COMPARISON — Compare A vs B vs C
// ============================================================================

const ComparisonItem = z.object({
  /** Item label */
  label: ShortText,
  /** Key-value attributes for comparison */
  attributes: z.record(z.string().max(2_000)),
});

export const ComparisonContentSchema = CardContentBaseSchema.extend({
  /** Items to compare */
  items: z.array(ComparisonItem).min(2).max(10),
  /** Optional criteria to compare on */
  comparisonCriteria: z.array(ShortText).max(20).optional(),
}).describe('Comparison card — compare multiple items');

// ============================================================================
// 7. EXCEPTION — Boundary conditions / exceptions to rules
// ============================================================================

const ExceptionCase = z.object({
  /** The exceptional case */
  condition: ShortText,
  /** Explanation of why it's an exception */
  explanation: RichTextBlock,
});

export const ExceptionContentSchema = CardContentBaseSchema.extend({
  /** The general rule */
  rule: RichTextBlock,
  /** The general principle behind the rule */
  generalPrinciple: OptionalText,
  /** Exception cases */
  exceptions: z.array(ExceptionCase).min(1).max(20),
}).describe('Exception card — boundary conditions and exceptions');

// ============================================================================
// 8. ERROR_SPOTTING — Find the mistake
// ============================================================================

export const ErrorSpottingContentSchema = CardContentBaseSchema.extend({
  /** The text containing the error */
  errorText: RichTextBlock,
  /** The corrected version */
  correctedText: RichTextBlock,
  /** Type of error */
  errorType: ShortText.optional(),
  /** Detailed explanation of the error */
  errorExplanation: OptionalText,
}).describe('Error spotting card — find and correct the mistake');

// ============================================================================
// 9. CONFIDENCE_RATED — Metacognition training
// ============================================================================

export const ConfidenceRatedContentSchema = CardContentBaseSchema.extend({
  /** The correct answer to rate confidence against */
  correctAnswer: RichTextBlock,
  /** Confidence scale config */
  confidenceScale: z
    .object({
      min: z.number().int().min(0).default(1),
      max: z.number().int().max(10).default(5),
      labels: z.record(z.string().max(100)).optional(),
    })
    .optional(),
  /** Calibration feedback after response */
  calibrationFeedback: OptionalText,
}).describe('Confidence-rated card — metacognition training');

// ============================================================================
// 10. CONCEPT_GRAPH — Relation mapping
// ============================================================================

const ConceptNode = z.object({
  id: z.string().min(1).max(50),
  label: ShortText,
  description: OptionalText,
});

const ConceptEdge = z.object({
  from: z.string().min(1).max(50),
  to: z.string().min(1).max(50),
  label: ShortText,
  description: OptionalText,
});

export const ConceptGraphContentSchema = CardContentBaseSchema.extend({
  /** Target concept to test */
  targetConcept: ShortText,
  /** Graph nodes */
  nodes: z.array(ConceptNode).min(2).max(30),
  /** Graph edges */
  edges: z.array(ConceptEdge).min(1).max(50),
}).describe('Concept graph card — relation mapping exercise');

// ============================================================================
// 11. CASE_BASED — Vignette → decision
// ============================================================================

const CaseOption = z.object({
  text: ShortText,
  correct: z.boolean(),
  feedback: OptionalText,
});

export const CaseBasedContentSchema = CardContentBaseSchema.extend({
  /** The scenario/vignette */
  scenario: RichTextBlock,
  /** The question about the scenario */
  question: RichTextBlock,
  /** Optional answer options */
  options: z.array(CaseOption).min(2).max(10).optional(),
  /** Analysis/reasoning after answer */
  analysis: OptionalText,
}).describe('Case-based card — decision from vignette');

// ============================================================================
// 12. MULTIMODAL — Text + image + audio
// ============================================================================

const MultimodalItem = z.object({
  /** Media type */
  type: z.enum(['text', 'image', 'audio', 'video']),
  /** Content (text content or URL) */
  content: z.string().min(1).max(50_000),
  /** Description / alt text */
  description: OptionalText,
  /** Display order */
  order: z.number().int().min(0).optional(),
});

export const MultimodalContentSchema = CardContentBaseSchema.extend({
  /** Media items composing this card */
  mediaItems: z.array(MultimodalItem).min(1).max(10),
  /** Prompt for synthesizing across media */
  synthesisPrompt: OptionalText,
}).describe('Multimodal card — multi-media synthesis');

// ============================================================================
// 13. TRANSFER — Novel contexts
// ============================================================================

export const TransferContentSchema = CardContentBaseSchema.extend({
  /** The original context where the concept was learned */
  originalContext: RichTextBlock,
  /** The novel context to transfer to */
  novelContext: RichTextBlock,
  /** Prompt guiding the transfer */
  transferPrompt: RichTextBlock,
  /** Structural mapping between contexts */
  structuralMapping: OptionalText,
}).describe('Transfer card — apply concept in novel context');

// ============================================================================
// 14. PROGRESSIVE_DISCLOSURE — Layered complexity
// ============================================================================

const DisclosureLayer = z.object({
  /** Layer order (1-based, revealed sequentially) */
  order: z.number().int().min(1),
  /** Content at this layer */
  content: RichTextBlock,
  /** Optional condition for revealing this layer */
  revealCondition: OptionalText,
});

export const ProgressiveDisclosureContentSchema = CardContentBaseSchema.extend({
  /** Ordered layers from simple to complex */
  layers: z.array(DisclosureLayer).min(2).max(10),
}).describe('Progressive disclosure card — layered complexity');

// ============================================================================
// 15. MULTIPLE_CHOICE — Multiple choice
// ============================================================================

const MultipleChoiceOption = z.object({
  /** Option text */
  text: ShortText,
  /** Whether this is a correct answer */
  correct: z.boolean(),
  /** Feedback for selecting this option */
  feedback: OptionalText,
});

export const MultipleChoiceContentSchema = CardContentBaseSchema.extend({
  /** Answer options */
  choices: z
    .array(MultipleChoiceOption)
    .min(2)
    .max(10)
    .refine((choices) => choices.some((c) => c.correct), 'At least one choice must be correct'),
  /** Whether to shuffle choices on each review */
  shuffleChoices: z.boolean().default(true).optional(),
  /** Allow multiple correct answers */
  allowMultiple: z.boolean().default(false).optional(),
}).describe('Multiple choice card');

// ============================================================================
// 16. TRUE_FALSE — True/false statement
// ============================================================================

export const TrueFalseContentSchema = CardContentBaseSchema.extend({
  /** The statement to evaluate */
  statement: RichTextBlock,
  /** Whether the statement is true */
  isTrue: z.boolean(),
}).describe('True/false card');

// ============================================================================
// 17. MATCHING — Match items
// ============================================================================

const MatchingPair = z.object({
  /** Left side item */
  left: ShortText,
  /** Right side matching item */
  right: ShortText,
});

export const MatchingContentSchema = CardContentBaseSchema.extend({
  /** Pairs to match */
  pairs: z.array(MatchingPair).min(2).max(20),
  /** Whether to shuffle pairs on each review */
  shufflePairs: z.boolean().default(true).optional(),
}).describe('Matching card — pair items');

// ============================================================================
// 18. ORDERING — Order items
// ============================================================================

const OrderingItem = z.object({
  /** Item text */
  text: ShortText,
  /** Correct position (1-based) */
  correctPosition: z.number().int().min(1),
});

export const OrderingContentSchema = CardContentBaseSchema.extend({
  /** Items to order */
  items: z
    .array(OrderingItem)
    .min(2)
    .max(20)
    .refine((items) => {
      const positions = items.map((i) => i.correctPosition).sort((a, b) => a - b);
      return positions.every((p, idx) => p === idx + 1);
    }, 'Positions must be consecutive starting from 1'),
  /** The criterion for ordering (e.g., "chronological", "smallest to largest") */
  orderingCriterion: ShortText,
}).describe('Ordering card — arrange items');

// ============================================================================
// 19. DEFINITION — Definition recall
// ============================================================================

export const DefinitionContentSchema = CardContentBaseSchema.extend({
  /** The term being defined */
  term: ShortText,
  /** The definition */
  definition: RichTextBlock,
  /** Usage examples */
  examples: z.array(ShortText).max(10).optional(),
  /** Related terms */
  relatedTerms: z.array(ShortText).max(20).optional(),
}).describe('Definition card — term recall');

// ============================================================================
// 20. CAUSE_EFFECT — Cause-effect relationships
// ============================================================================

const CauseEffectItem = z.object({
  description: ShortText,
});

const CauseEffectRelationship = z.object({
  /** Index into causes array */
  causeIndex: PositiveInt,
  /** Index into effects array */
  effectIndex: PositiveInt,
  /** Explanation of the relationship */
  explanation: OptionalText,
});

export const CauseEffectContentSchema = CardContentBaseSchema.extend({
  /** Causes */
  causes: z.array(CauseEffectItem).min(1).max(10),
  /** Effects */
  effects: z.array(CauseEffectItem).min(1).max(10),
  /** Relationships between causes and effects */
  relationships: z.array(CauseEffectRelationship).min(1).max(30),
}).describe('Cause/effect card — relationship mapping');

// ============================================================================
// 21. TIMELINE — Timeline ordering
// ============================================================================

const TimelineEvent = z.object({
  /** Date or time marker */
  date: ShortText,
  /** Event title */
  title: ShortText,
  /** Event description */
  description: OptionalText,
});

export const TimelineContentSchema = CardContentBaseSchema.extend({
  /** Ordered events */
  events: z.array(TimelineEvent).min(2).max(30),
  /** Scope of the timeline (e.g., "1900-2000", "Mesozoic Era") */
  timelineScope: OptionalText,
}).describe('Timeline card — chronological ordering');

// ============================================================================
// 22. DIAGRAM — Diagram labeling
// ============================================================================

const DiagramLabel = z.object({
  /** X coordinate (percentage 0-100) */
  x: z.number().min(0).max(100),
  /** Y coordinate (percentage 0-100) */
  y: z.number().min(0).max(100),
  /** Label text (shown after answer) */
  text: ShortText,
  /** Expected answer (what the learner must provide) */
  answer: ShortText,
});

export const DiagramContentSchema = CardContentBaseSchema.extend({
  /** URL or media-service ID of the diagram image */
  imageUrl: z.string().min(1).max(2_000),
  /** Labels on the diagram */
  labels: z.array(DiagramLabel).min(1).max(50),
  /** Type of diagram (e.g., "anatomy", "circuit", "flowchart") */
  diagramType: ShortText.optional(),
}).describe('Diagram card — label parts of an image');

// ============================================================================
//
//  REMEDIATION CARD TYPES (20)
//  Used by the Mental Debugger to address specific failure patterns.
//
// ============================================================================

// ============================================================================
// R1. CONTRASTIVE_PAIR — Compare similar items side by side
// ============================================================================

export const ContrastivePairContentSchema = CardContentBaseSchema.extend({
  /** First item */
  itemA: RichTextBlock,
  /** Second item */
  itemB: RichTextBlock,
  /** Shared context between the two */
  sharedContext: RichTextBlock,
  /** Key differences */
  keyDifferences: z.array(ShortText).min(1).max(10),
}).describe('Contrastive pair card — side-by-side comparison of similar items');

// ============================================================================
// R2. MINIMAL_PAIR — Minimal difference comparison
// ============================================================================

export const MinimalPairContentSchema = CardContentBaseSchema.extend({
  /** First item */
  itemA: RichTextBlock,
  /** Second item */
  itemB: RichTextBlock,
  /** The single discriminating feature */
  discriminatingFeature: ShortText,
  /** Context where the difference matters */
  differenceContext: OptionalText,
}).describe('Minimal pair card — single-feature difference');

// ============================================================================
// R3. FALSE_FRIEND — Linguistic false friends
// ============================================================================

export const FalseFriendContentSchema = CardContentBaseSchema.extend({
  /** First term (often from familiar domain) */
  termA: ShortText,
  /** Second term (the false friend) */
  termB: ShortText,
  /** Actual meaning of termB */
  actualMeaning: RichTextBlock,
  /** Language or domain context */
  domainContext: OptionalText,
}).describe('False friend card — address misleading term similarity');

// ============================================================================
// R4. OLD_VS_NEW_DEFINITION — Definition evolution
// ============================================================================

export const OldVsNewDefinitionContentSchema = CardContentBaseSchema.extend({
  /** The term whose definition evolved */
  term: ShortText,
  /** The old/outdated definition */
  oldDefinition: RichTextBlock,
  /** The current/updated definition */
  newDefinition: RichTextBlock,
  /** Reason for the change */
  changeReason: RichTextBlock,
}).describe('Old vs new definition card — concept evolution');

// ============================================================================
// R5. BOUNDARY_CASE — Edge case exploration
// ============================================================================

export const BoundaryCaseContentSchema = CardContentBaseSchema.extend({
  /** The concept being tested */
  concept: ShortText,
  /** The boundary condition */
  boundaryCondition: RichTextBlock,
  /** Whether the boundary case IS included in the concept */
  isIncluded: z.boolean(),
  /** Detailed reasoning */
  reasoning: RichTextBlock,
}).describe('Boundary case card — edge case exploration');

// ============================================================================
// R6. RULE_SCOPE — When rules apply / don't apply
// ============================================================================

export const RuleScopeContentSchema = CardContentBaseSchema.extend({
  /** The rule being scoped */
  rule: RichTextBlock,
  /** Conditions when the rule applies */
  appliesWhen: z.array(ShortText).min(1).max(10),
  /** Conditions when the rule does NOT apply */
  doesNotApplyWhen: z.array(ShortText).min(1).max(10),
}).describe("Rule scope card — when rules apply and don't apply");

// ============================================================================
// R7. DISCRIMINANT_FEATURE — Key distinguishing features
// ============================================================================

const DiscriminantFeatureItem = z.object({
  /** Feature name */
  name: ShortText,
  /** Whether this feature is diagnostic (distinguishing) */
  diagnostic: z.boolean(),
  /** Feature value or description */
  value: ShortText,
});

export const DiscriminantFeatureContentSchema = CardContentBaseSchema.extend({
  /** The concept whose features are being analyzed */
  concept: ShortText,
  /** Discriminant features */
  features: z.array(DiscriminantFeatureItem).min(1).max(20),
}).describe('Discriminant feature card — identify diagnostic features');

// ============================================================================
// R8. ASSUMPTION_CHECK — Surface hidden assumptions
// ============================================================================

export const AssumptionCheckContentSchema = CardContentBaseSchema.extend({
  /** The statement or argument */
  statement: RichTextBlock,
  /** The hidden assumption */
  hiddenAssumption: RichTextBlock,
  /** What follows if the assumption is false */
  consequence: RichTextBlock,
}).describe('Assumption check card — surface hidden assumptions');

// ============================================================================
// R9. COUNTEREXAMPLE — Disprove overgeneralization
// ============================================================================

export const CounterexampleContentSchema = CardContentBaseSchema.extend({
  /** The claim or generalization */
  claim: RichTextBlock,
  /** The counterexample that disproves or limits it */
  counterexample: RichTextBlock,
  /** Context: why this counterexample matters */
  significance: OptionalText,
}).describe('Counterexample card — challenge overgeneralization');

// ============================================================================
// R10. REPRESENTATION_SWITCH — Switch between representations
// ============================================================================

const RepresentationItem = z.object({
  /** Representation type (e.g., "verbal", "visual", "algebraic", "tabular") */
  type: ShortText,
  /** The representation content (text, URL, formula) */
  content: z.string().min(1).max(50_000),
});

export const RepresentationSwitchContentSchema = CardContentBaseSchema.extend({
  /** The concept being represented */
  concept: ShortText,
  /** Multiple representations of the same concept */
  representations: z.array(RepresentationItem).min(2).max(6),
}).describe('Representation switch card — translate between representations');

// ============================================================================
// R11. RETRIEVAL_CUE — Improve recall triggers
// ============================================================================

const RetrievalCueItem = z.object({
  /** The cue */
  cue: ShortText,
  /** Effectiveness label (e.g., "strong", "weak") */
  effectiveness: z.enum(['strong', 'moderate', 'weak']),
});

export const RetrievalCueContentSchema = CardContentBaseSchema.extend({
  /** The target information to retrieve */
  target: RichTextBlock,
  /** Retrieval cues associated with the target */
  cues: z.array(RetrievalCueItem).min(1).max(10),
  /** Retrieval context */
  context: OptionalText,
}).describe('Retrieval cue card — strengthen recall triggers');

// ============================================================================
// R12. ENCODING_REPAIR — Fix faulty encoding
// ============================================================================

export const EncodingRepairContentSchema = CardContentBaseSchema.extend({
  /** The concept */
  concept: ShortText,
  /** The incorrect encoding / understanding */
  incorrectEncoding: RichTextBlock,
  /** The correct encoding / understanding */
  correctEncoding: RichTextBlock,
  /** Strategy for repairing the encoding */
  repairStrategy: RichTextBlock,
}).describe('Encoding repair card — fix faulty initial encoding');

// ============================================================================
// R13. OVERWRITE_DRILL — Override incorrect memory
// ============================================================================

export const OverwriteDrillContentSchema = CardContentBaseSchema.extend({
  /** The incorrect response to overwrite */
  incorrectResponse: RichTextBlock,
  /** The correct response */
  correctResponse: RichTextBlock,
  /** Drill prompts to reinforce the correct response */
  drillPrompts: z.array(ShortText).min(1).max(10),
}).describe('Overwrite drill card — replace incorrect memory');

// ============================================================================
// R14. AVAILABILITY_BIAS_DISCONFIRMATION — Counter availability bias
// ============================================================================

export const AvailabilityBiasDisconfirmationContentSchema = CardContentBaseSchema.extend({
  /** The biased belief */
  biasedBelief: RichTextBlock,
  /** Evidence that counters the bias */
  evidence: RichTextBlock,
  /** Statistical base rate (if applicable) */
  baseRate: OptionalText,
  /** Why the bias is compelling */
  biasExplanation: OptionalText,
}).describe('Availability bias disconfirmation card — counter intuitive but wrong beliefs');

// ============================================================================
// R15. SELF_CHECK_RITUAL — Teach self-check habits
// ============================================================================

const SelfCheckStep = z.object({
  /** Step order */
  step: z.number().int().min(1),
  /** The check question */
  question: ShortText,
});

export const SelfCheckRitualContentSchema = CardContentBaseSchema.extend({
  /** The concept or task to check */
  concept: ShortText,
  /** The self-check steps */
  checkSteps: z.array(SelfCheckStep).min(1).max(10),
  /** What triggers the self-check */
  trigger: ShortText,
}).describe('Self-check ritual card — build metacognitive habits');

// ============================================================================
// R16. CALIBRATION_TRAINING — Confidence calibration
// ============================================================================

export const CalibrationTrainingContentSchema = CardContentBaseSchema.extend({
  /** Statement to assess confidence on */
  statement: RichTextBlock,
  /** True confidence level (0-1) for calibration */
  trueConfidence: z.number().min(0).max(1),
  /** Calibration prompt shown after self-assessment */
  calibrationPrompt: RichTextBlock,
}).describe('Calibration training card — improve confidence accuracy');

// ============================================================================
// R17. ATTRIBUTION_REFRAMING — Reframe causal attributions
// ============================================================================

export const AttributionReframingContentSchema = CardContentBaseSchema.extend({
  /** The outcome or result */
  outcome: RichTextBlock,
  /** The emotional / unhelpful attribution */
  emotionalAttribution: RichTextBlock,
  /** The process-oriented / helpful reframing */
  processAttribution: RichTextBlock,
}).describe('Attribution reframing card — healthy attribution patterns');

// ============================================================================
// R18. STRATEGY_REMINDER — Strategy application
// ============================================================================

export const StrategyReminderContentSchema = CardContentBaseSchema.extend({
  /** The strategy name */
  strategy: ShortText,
  /** When to use this strategy */
  whenToUse: RichTextBlock,
  /** When NOT to use this strategy */
  whenNotToUse: RichTextBlock,
  /** Example application */
  exampleApplication: RichTextBlock,
}).describe('Strategy reminder card — when and how to apply strategies');

// ============================================================================
// R19. CONFUSABLE_SET_DRILL — Drill confusable items
// ============================================================================

const ConfusableItem = z.object({
  /** The term */
  term: ShortText,
  /** Its definition */
  definition: ShortText,
  /** What makes it unique */
  distinguishingFeature: ShortText,
});

export const ConfusableSetDrillContentSchema = CardContentBaseSchema.extend({
  /** Set of confusable items */
  items: z.array(ConfusableItem).min(2).max(10),
  /** Pattern of confusion to address */
  confusionPattern: RichTextBlock,
}).describe('Confusable set drill card — disambiguate similar items');

// ============================================================================
// R20. PARTIAL_KNOWLEDGE_DECOMPOSITION — Map partial knowledge
// ============================================================================

export const PartialKnowledgeDecompositionContentSchema = CardContentBaseSchema.extend({
  /** The concept to decompose */
  concept: ShortText,
  /** Parts the learner already knows */
  knownParts: z.array(ShortText).min(1).max(20),
  /** Parts the learner does NOT yet know */
  unknownParts: z.array(ShortText).min(1).max(20),
  /** Strategy for bridging from known to unknown */
  bridgingStrategy: RichTextBlock,
}).describe('Partial knowledge decomposition card — build on what you know');

// ============================================================================
// Schema Registry — Maps cardType → schema
// ============================================================================

/**
 * Complete registry mapping every card type string to its Zod schema.
 * Used by the discriminated validator to dispatch validation.
 */
export const CardContentSchemaRegistry: Record<string, z.ZodType> = {
  // Standard card types (22)
  [CardType.ATOMIC]: AtomicContentSchema,
  [CardType.CLOZE]: ClozeContentSchema,
  [CardType.IMAGE_OCCLUSION]: ImageOcclusionContentSchema,
  [CardType.AUDIO]: AudioContentSchema,
  [CardType.PROCESS]: ProcessContentSchema,
  [CardType.COMPARISON]: ComparisonContentSchema,
  [CardType.EXCEPTION]: ExceptionContentSchema,
  [CardType.ERROR_SPOTTING]: ErrorSpottingContentSchema,
  [CardType.CONFIDENCE_RATED]: ConfidenceRatedContentSchema,
  [CardType.CONCEPT_GRAPH]: ConceptGraphContentSchema,
  [CardType.CASE_BASED]: CaseBasedContentSchema,
  [CardType.MULTIMODAL]: MultimodalContentSchema,
  [CardType.TRANSFER]: TransferContentSchema,
  [CardType.PROGRESSIVE_DISCLOSURE]: ProgressiveDisclosureContentSchema,
  [CardType.MULTIPLE_CHOICE]: MultipleChoiceContentSchema,
  [CardType.TRUE_FALSE]: TrueFalseContentSchema,
  [CardType.MATCHING]: MatchingContentSchema,
  [CardType.ORDERING]: OrderingContentSchema,
  [CardType.DEFINITION]: DefinitionContentSchema,
  [CardType.CAUSE_EFFECT]: CauseEffectContentSchema,
  [CardType.TIMELINE]: TimelineContentSchema,
  [CardType.DIAGRAM]: DiagramContentSchema,

  // Remediation card types (20)
  [RemediationCardType.CONTRASTIVE_PAIR]: ContrastivePairContentSchema,
  [RemediationCardType.MINIMAL_PAIR]: MinimalPairContentSchema,
  [RemediationCardType.FALSE_FRIEND]: FalseFriendContentSchema,
  [RemediationCardType.OLD_VS_NEW_DEFINITION]: OldVsNewDefinitionContentSchema,
  [RemediationCardType.BOUNDARY_CASE]: BoundaryCaseContentSchema,
  [RemediationCardType.RULE_SCOPE]: RuleScopeContentSchema,
  [RemediationCardType.DISCRIMINANT_FEATURE]: DiscriminantFeatureContentSchema,
  [RemediationCardType.ASSUMPTION_CHECK]: AssumptionCheckContentSchema,
  [RemediationCardType.COUNTEREXAMPLE]: CounterexampleContentSchema,
  [RemediationCardType.REPRESENTATION_SWITCH]: RepresentationSwitchContentSchema,
  [RemediationCardType.RETRIEVAL_CUE]: RetrievalCueContentSchema,
  [RemediationCardType.ENCODING_REPAIR]: EncodingRepairContentSchema,
  [RemediationCardType.OVERWRITE_DRILL]: OverwriteDrillContentSchema,
  [RemediationCardType.AVAILABILITY_BIAS_DISCONFIRMATION]:
    AvailabilityBiasDisconfirmationContentSchema,
  [RemediationCardType.SELF_CHECK_RITUAL]: SelfCheckRitualContentSchema,
  [RemediationCardType.CALIBRATION_TRAINING]: CalibrationTrainingContentSchema,
  [RemediationCardType.ATTRIBUTION_REFRAMING]: AttributionReframingContentSchema,
  [RemediationCardType.STRATEGY_REMINDER]: StrategyReminderContentSchema,
  [RemediationCardType.CONFUSABLE_SET_DRILL]: ConfusableSetDrillContentSchema,
  [RemediationCardType.PARTIAL_KNOWLEDGE_DECOMPOSITION]: PartialKnowledgeDecompositionContentSchema,
} as const;

// ============================================================================
// Discriminated Validator
// ============================================================================

/**
 * Validate card content against the schema for a specific card type.
 *
 * @param cardType - The card type discriminator string
 * @param content  - The raw content blob to validate
 * @returns        - Zod SafeParseReturnType with typed result or errors
 */
export function validateCardContent(
  cardType: string,
  content: unknown
): z.SafeParseReturnType<unknown, unknown> {
  const schema = CardContentSchemaRegistry[cardType];

  if (!schema) {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          path: ['cardType'],
          message: `Unknown card type: '${cardType}'. Expected one of: ${Object.keys(CardContentSchemaRegistry).join(', ')}`,
        },
      ]),
    };
  }

  return schema.safeParse(content);
}

/**
 * Validate card content strictly — throws ZodError on failure.
 *
 * @param cardType - The card type discriminator string
 * @param content  - The raw content blob to validate
 * @returns        - The parsed and validated content
 * @throws         - ZodError if validation fails
 */
export function parseCardContent(cardType: string, content: unknown): unknown {
  const schema = CardContentSchemaRegistry[cardType];

  if (!schema) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ['cardType'],
        message: `Unknown card type: '${cardType}'. Expected one of: ${Object.keys(CardContentSchemaRegistry).join(', ')}`,
      },
    ]);
  }

  return schema.parse(content);
}
