/**
 * @noema/api-client - Content Service Types
 *
 * DTOs for Content Service API requests and responses.
 * Authoritative field names derived from card-content.schemas.ts (content-service).
 */

import type { IApiResponse } from '@noema/contracts';
import type {
  CardId,
  CardState,
  DifficultyLevel,
  MediaId,
  StudyMode,
  TemplateId,
} from '@noema/types';
import type { CardType, RemediationCardType } from '@noema/types';

// ============================================================================
// Card State
// ============================================================================

// ============================================================================
// Media Attachment (shared across content interfaces)
// ============================================================================

export interface IMediaAttachment {
  id: string;
  url: string;
  mimeType: string;
  altText?: string;
}

// ============================================================================
// Base Content Fields (every card type extends these)
// ============================================================================

interface ICardContentBase {
  front?: string;
  back?: string;
  hint?: string;
  explanation?: string;
  media?: IMediaAttachment[];
}

// ============================================================================
// Standard Card Types (22)
// ============================================================================

// 1. ATOMIC — simple question/answer pair
export interface IAtomicContent extends ICardContentBase {
  front?: string;
  back?: string;
}

// 2. CLOZE — fill-in-the-blank
export interface IClozeItem {
  text: string;
  answer: string;
  position: number;
}

export interface IClozeContent extends ICardContentBase {
  template: string;
  clozes?: IClozeItem[];
}

// 3. IMAGE_OCCLUSION — image with masked regions
export interface IOcclusionRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  shape?: 'rect' | 'ellipse' | 'polygon';
}

export interface IImageOcclusionContent extends ICardContentBase {
  imageUrl: string;
  regions: IOcclusionRegion[];
}

// 4. AUDIO — listen and recall
export interface IAudioContent extends ICardContentBase {
  audioUrl: string;
  transcript?: string;
  playbackSpeed?: number;
  startTime?: number;
  endTime?: number;
}

// 5. PROCESS — step-by-step sequences
export interface IProcessStep {
  order: number;
  title: string;
  description: string;
  imageUrl?: string;
}

export interface IProcessContent extends ICardContentBase {
  processName: string;
  steps: IProcessStep[];
}

// 6. COMPARISON — compare A vs B vs C
export interface IComparisonItem {
  label: string;
  attributes: Record<string, string>;
}

export interface IComparisonContent extends ICardContentBase {
  items: IComparisonItem[];
  comparisonCriteria?: string[];
}

// 7. EXCEPTION — boundary conditions / exceptions to rules
export interface IExceptionCase {
  condition: string;
  explanation: string;
}

export interface IExceptionContent extends ICardContentBase {
  rule: string;
  generalPrinciple?: string;
  exceptions: IExceptionCase[];
}

// 8. ERROR_SPOTTING — find the mistake
export interface IErrorSpottingContent extends ICardContentBase {
  errorText: string;
  correctedText: string;
  errorType?: string;
  errorExplanation?: string;
}

// 9. CONFIDENCE_RATED — metacognition training
export interface IConfidenceScale {
  min: number;
  max: number;
  labels?: Record<string, string>;
}

export interface IConfidenceRatedContent extends ICardContentBase {
  correctAnswer: string;
  confidenceScale?: IConfidenceScale;
  calibrationFeedback?: string;
}

// 10. CONCEPT_GRAPH — relation mapping
export interface IConceptNode {
  id: string;
  label: string;
  description?: string;
}

export interface IConceptEdge {
  from: string;
  to: string;
  label: string;
  description?: string;
}

export interface IConceptGraphContent extends ICardContentBase {
  targetConcept: string;
  nodes: IConceptNode[];
  edges: IConceptEdge[];
}

// 11. CASE_BASED — vignette -> decision
export interface ICaseOption {
  text: string;
  correct: boolean;
  feedback?: string;
}

export interface ICaseBasedContent extends ICardContentBase {
  scenario: string;
  question: string;
  options?: ICaseOption[];
  analysis?: string;
}

// 12. MULTIMODAL — text + image + audio
export interface IMultimodalItem {
  type: 'text' | 'image' | 'audio' | 'video';
  content: string;
  description?: string;
  order?: number;
}

export interface IMultimodalContent extends ICardContentBase {
  mediaItems: IMultimodalItem[];
  synthesisPrompt?: string;
}

// 13. TRANSFER — novel contexts
export interface ITransferContent extends ICardContentBase {
  originalContext: string;
  novelContext: string;
  transferPrompt: string;
  structuralMapping?: string;
}

// 14. PROGRESSIVE_DISCLOSURE — layered complexity
export interface IDisclosureLayer {
  order: number;
  content: string;
  revealCondition?: string;
}

export interface IProgressiveDisclosureContent extends ICardContentBase {
  layers: IDisclosureLayer[];
}

// 15. MULTIPLE_CHOICE — multiple choice
export interface IMultipleChoiceOption {
  text: string;
  correct: boolean;
  feedback?: string;
}

export interface IMultipleChoiceContent extends ICardContentBase {
  choices: IMultipleChoiceOption[];
  shuffleChoices?: boolean;
  allowMultiple?: boolean;
}

// 16. TRUE_FALSE — true/false statement
export interface ITrueFalseContent extends ICardContentBase {
  statement: string;
  isTrue: boolean;
}

// 17. MATCHING — match items
export interface IMatchingPair {
  left: string;
  right: string;
}

export interface IMatchingContent extends ICardContentBase {
  pairs: IMatchingPair[];
  shufflePairs?: boolean;
}

// 18. ORDERING — order items
export interface IOrderingItem {
  text: string;
  correctPosition: number;
}

export interface IOrderingContent extends ICardContentBase {
  items: IOrderingItem[];
  orderingCriterion: string;
}

// 19. DEFINITION — definition recall
export interface IDefinitionContent extends ICardContentBase {
  term: string;
  partOfSpeech?: string;
  definition: string;
  examples?: string[];
  relatedTerms?: string[];
}

// 20. CAUSE_EFFECT — cause-effect relationships
export interface ICauseEffectItem {
  description: string;
}

export interface ICauseEffectRelationship {
  causeIndex: number;
  effectIndex: number;
  explanation?: string;
}

export interface ICauseEffectContent extends ICardContentBase {
  causes: ICauseEffectItem[];
  effects: ICauseEffectItem[];
  relationships: ICauseEffectRelationship[];
}

// 21. TIMELINE — timeline ordering
export interface ITimelineEvent {
  date: string;
  title: string;
  description?: string;
}

export interface ITimelineContent extends ICardContentBase {
  events: ITimelineEvent[];
  timelineScope?: string;
}

// 22. DIAGRAM — diagram labeling
export interface IDiagramLabel {
  x: number;
  y: number;
  text: string;
  answer: string;
}

export interface IDiagramContent extends ICardContentBase {
  imageUrl: string;
  labels: IDiagramLabel[];
  diagramType?: string;
}

// ============================================================================
// Remediation Card Types (20)
// ============================================================================

// R1. CONTRASTIVE_PAIR
export interface IContrastivePairContent extends ICardContentBase {
  itemA: string;
  itemB: string;
  sharedContext: string;
  keyDifferences: string[];
}

// R2. MINIMAL_PAIR
export interface IMinimalPairContent extends ICardContentBase {
  itemA: string;
  itemB: string;
  discriminatingFeature: string;
  differenceContext?: string;
}

// R3. FALSE_FRIEND
export interface IFalseFriendContent extends ICardContentBase {
  termA: string;
  termB: string;
  actualMeaning: string;
  domainContext?: string;
}

// R4. OLD_VS_NEW_DEFINITION
export interface IOldVsNewDefinitionContent extends ICardContentBase {
  term: string;
  oldDefinition: string;
  newDefinition: string;
  changeReason: string;
}

// R5. BOUNDARY_CASE
export interface IBoundaryCaseContent extends ICardContentBase {
  concept: string;
  boundaryCondition: string;
  isIncluded: boolean;
  reasoning: string;
}

// R6. RULE_SCOPE
export interface IRuleScopeContent extends ICardContentBase {
  rule: string;
  appliesWhen: string[];
  doesNotApplyWhen: string[];
}

// R7. DISCRIMINANT_FEATURE
export interface IDiscriminantFeatureItem {
  name: string;
  diagnostic: boolean;
  value: string;
}

export interface IDiscriminantFeatureContent extends ICardContentBase {
  concept: string;
  features: IDiscriminantFeatureItem[];
}

// R8. ASSUMPTION_CHECK
export interface IAssumptionCheckContent extends ICardContentBase {
  statement: string;
  hiddenAssumption: string;
  consequence: string;
}

// R9. COUNTEREXAMPLE
export interface ICounterexampleContent extends ICardContentBase {
  claim: string;
  counterexample: string;
  significance?: string;
}

// R10. REPRESENTATION_SWITCH
export interface IRepresentationItem {
  type: string;
  content: string;
}

export interface IRepresentationSwitchContent extends ICardContentBase {
  concept: string;
  representations: IRepresentationItem[];
}

// R11. RETRIEVAL_CUE
export interface IRetrievalCueItem {
  cue: string;
  effectiveness: 'strong' | 'moderate' | 'weak';
}

export interface IRetrievalCueContent extends ICardContentBase {
  target: string;
  cues: IRetrievalCueItem[];
  context?: string;
}

// R12. ENCODING_REPAIR
export interface IEncodingRepairContent extends ICardContentBase {
  concept: string;
  incorrectEncoding: string;
  correctEncoding: string;
  repairStrategy: string;
}

// R13. OVERWRITE_DRILL
export interface IOverwriteDrillContent extends ICardContentBase {
  incorrectResponse: string;
  correctResponse: string;
  drillPrompts: string[];
}

// R14. AVAILABILITY_BIAS_DISCONFIRMATION
export interface IAvailabilityBiasDisconfirmationContent extends ICardContentBase {
  biasedBelief: string;
  evidence: string;
  baseRate?: string;
  biasExplanation?: string;
}

// R15. SELF_CHECK_RITUAL
export interface ISelfCheckStep {
  step: number;
  question: string;
}

export interface ISelfCheckRitualContent extends ICardContentBase {
  concept: string;
  checkSteps: ISelfCheckStep[];
  trigger: string;
}

// R16. CALIBRATION_TRAINING
export interface ICalibrationTrainingContent extends ICardContentBase {
  statement: string;
  trueConfidence: number;
  calibrationPrompt: string;
}

// R17. ATTRIBUTION_REFRAMING
export interface IAttributionReframingContent extends ICardContentBase {
  outcome: string;
  emotionalAttribution: string;
  processAttribution: string;
}

// R18. STRATEGY_REMINDER
export interface IStrategyReminderContent extends ICardContentBase {
  strategy: string;
  whenToUse: string;
  whenNotToUse: string;
  exampleApplication: string;
}

// R19. CONFUSABLE_SET_DRILL
export interface IConfusableItem {
  term: string;
  definition: string;
  distinguishingFeature: string;
}

export interface IConfusableSetDrillContent extends ICardContentBase {
  items: IConfusableItem[];
  confusionPattern: string;
}

// R20. PARTIAL_KNOWLEDGE_DECOMPOSITION
export interface IPartialKnowledgeDecompositionContent extends ICardContentBase {
  concept: string;
  knownParts: string[];
  unknownParts: string[];
  bridgingStrategy: string;
}

// ============================================================================
// CardContentByType — Mapped type for discriminated narrowing
// ============================================================================

export type CardContentByType = {
  [K in keyof typeof CardType as (typeof CardType)[K]]: K extends 'ATOMIC'
    ? IAtomicContent
    : K extends 'CLOZE'
      ? IClozeContent
      : K extends 'IMAGE_OCCLUSION'
        ? IImageOcclusionContent
        : K extends 'AUDIO'
          ? IAudioContent
          : K extends 'PROCESS'
            ? IProcessContent
            : K extends 'COMPARISON'
              ? IComparisonContent
              : K extends 'EXCEPTION'
                ? IExceptionContent
                : K extends 'ERROR_SPOTTING'
                  ? IErrorSpottingContent
                  : K extends 'CONFIDENCE_RATED'
                    ? IConfidenceRatedContent
                    : K extends 'CONCEPT_GRAPH'
                      ? IConceptGraphContent
                      : K extends 'CASE_BASED'
                        ? ICaseBasedContent
                        : K extends 'MULTIMODAL'
                          ? IMultimodalContent
                          : K extends 'TRANSFER'
                            ? ITransferContent
                            : K extends 'PROGRESSIVE_DISCLOSURE'
                              ? IProgressiveDisclosureContent
                              : K extends 'MULTIPLE_CHOICE'
                                ? IMultipleChoiceContent
                                : K extends 'TRUE_FALSE'
                                  ? ITrueFalseContent
                                  : K extends 'MATCHING'
                                    ? IMatchingContent
                                    : K extends 'ORDERING'
                                      ? IOrderingContent
                                      : K extends 'DEFINITION'
                                        ? IDefinitionContent
                                        : K extends 'CAUSE_EFFECT'
                                          ? ICauseEffectContent
                                          : K extends 'TIMELINE'
                                            ? ITimelineContent
                                            : K extends 'DIAGRAM'
                                              ? IDiagramContent
                                              : ICardContentBase;
} & {
  [K in keyof typeof RemediationCardType as (typeof RemediationCardType)[K]]: K extends 'CONTRASTIVE_PAIR'
    ? IContrastivePairContent
    : K extends 'MINIMAL_PAIR'
      ? IMinimalPairContent
      : K extends 'FALSE_FRIEND'
        ? IFalseFriendContent
        : K extends 'OLD_VS_NEW_DEFINITION'
          ? IOldVsNewDefinitionContent
          : K extends 'BOUNDARY_CASE'
            ? IBoundaryCaseContent
            : K extends 'RULE_SCOPE'
              ? IRuleScopeContent
              : K extends 'DISCRIMINANT_FEATURE'
                ? IDiscriminantFeatureContent
                : K extends 'ASSUMPTION_CHECK'
                  ? IAssumptionCheckContent
                  : K extends 'COUNTEREXAMPLE'
                    ? ICounterexampleContent
                    : K extends 'REPRESENTATION_SWITCH'
                      ? IRepresentationSwitchContent
                      : K extends 'RETRIEVAL_CUE'
                        ? IRetrievalCueContent
                        : K extends 'ENCODING_REPAIR'
                          ? IEncodingRepairContent
                          : K extends 'OVERWRITE_DRILL'
                            ? IOverwriteDrillContent
                            : K extends 'AVAILABILITY_BIAS_DISCONFIRMATION'
                              ? IAvailabilityBiasDisconfirmationContent
                              : K extends 'SELF_CHECK_RITUAL'
                                ? ISelfCheckRitualContent
                                : K extends 'CALIBRATION_TRAINING'
                                  ? ICalibrationTrainingContent
                                  : K extends 'ATTRIBUTION_REFRAMING'
                                    ? IAttributionReframingContent
                                    : K extends 'STRATEGY_REMINDER'
                                      ? IStrategyReminderContent
                                      : K extends 'CONFUSABLE_SET_DRILL'
                                        ? IConfusableSetDrillContent
                                        : K extends 'PARTIAL_KNOWLEDGE_DECOMPOSITION'
                                          ? IPartialKnowledgeDecompositionContent
                                          : ICardContentBase;
};

// ============================================================================
// Card DTOs
// ============================================================================

/** Full card shape returned by the API. */
export interface ICardDto {
  id: CardId;
  userId: string;
  cardType: string;
  state: CardState;
  difficulty: number;
  content: Record<string, unknown>;
  knowledgeNodeIds: string[];
  tags: string[];
  supportedStudyModes?: StudyMode[];
  source?: string;
  metadata: Record<string, unknown>;
  contentHash?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

/**
 * Alias for backward compatibility with hooks.ts which imports `CardDto`.
 * @deprecated Use ICardDto directly for new code.
 */
export type CardDto = ICardDto;

/** List-safe card shape (no content blob). */
export interface ICardSummaryDto {
  id: CardId;
  sessionId: string;
  label: string;
  cardType: string;
  state: CardState;
  tags: string[];
  knowledgeNodeIds: string[];
  supportedStudyModes?: StudyMode[];
  difficulty: number;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** Batch summary returned after a batch creation job completes. */
export interface IBatchSummaryDto {
  batchId: string;
  count: number;
  createdAt: string;
}

// ============================================================================
// Deck Query
// ============================================================================

export interface IDeckQueryInput {
  search?: string;
  cardTypes?: string[];
  states?: CardState[];
  tags?: string[];
  knowledgeNodeIds?: string[];
  supportedStudyModes?: StudyMode[];
  sources?: string[];
  source?: string;
  difficulty?: { min?: number; max?: number };
  difficulties?: string[];
  sortBy?: 'createdAt' | 'updatedAt' | 'difficulty' | 'nextReviewAt';
  sortDir?: 'asc' | 'desc';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  cursor?: string;
}

// ============================================================================
// Create / Update Inputs
// ============================================================================

export interface ICreateCardInput {
  cardType: string;
  content: Record<string, unknown>;
  tags?: string[];
  knowledgeNodeIds?: string[];
  source?: string;
  difficulty?: DifficultyLevel;
  supportedStudyModes?: StudyMode[];
  metadata?: Record<string, unknown>;
}

export interface IUpdateCardInput {
  content?: Record<string, unknown>;
  tags?: string[];
  knowledgeNodeIds?: string[];
  source?: string;
  supportedStudyModes?: StudyMode[];
  metadata?: Record<string, unknown>;
  version: number;
}

export interface IUpdateCardStateInput {
  state: CardState;
}

export interface IBatchStateUpdateInput {
  items: { id: string; version: number }[];
  state: CardState;
  reason?: string;
}

export interface IUpdateCardTagsInput {
  tags: string[];
}

export interface IUpdateCardNodeLinksInput {
  knowledgeNodeIds: string[];
}

// ============================================================================
// Batch Operations
// ============================================================================

export interface IBatchCreateInput {
  cards: ICreateCardInput[];
}

/** IMPORTANT: `created` is ICardDto[] not a number. */
export interface IBatchCreateResult {
  batchId: string;
  created: ICardDto[];
  failed: number;
  total: number;
}

export type CardImportFileType =
  | 'json'
  | 'jsonl'
  | 'csv'
  | 'tsv'
  | 'xlsx'
  | 'txt'
  | 'markdown'
  | 'latex'
  | 'typst';

export type CardImportTargetFieldId =
  | 'front'
  | 'back'
  | 'hint'
  | 'explanation'
  | 'tags'
  | 'knowledgeNodeIds'
  | 'difficulty'
  | 'state';

export type CardImportMappingTarget = CardImportTargetFieldId | 'dump';

export interface ICardImportPayload {
  encoding: 'text' | 'base64';
  content: string;
}

export interface ICardImportPreviewInput {
  fileName: string;
  fileType: CardImportFileType;
  formatId: string;
  payload: ICardImportPayload;
  sheetName?: string;
  supportedStudyModes?: StudyMode[];
}

export interface ICardImportSourceField {
  key: string;
  sample: string;
}

export interface ICardImportRecord {
  values: Record<string, string>;
}

export interface ICardImportFieldMapping {
  sourceKey: string;
  targetFieldId: CardImportMappingTarget;
  dumpKey?: string;
}

export interface ICardImportPreviewResult {
  fileName: string;
  fileType: CardImportFileType;
  formatId: string;
  sourceFields: ICardImportSourceField[];
  records: ICardImportRecord[];
  warnings: string[];
  sheetNames?: string[];
  suggestedMappings: ICardImportFieldMapping[];
}

export interface ICardImportExecuteInput extends ICardImportPreviewInput {
  mappings: ICardImportFieldMapping[];
  sharedTags?: string[];
  sharedKnowledgeNodeIds?: string[];
  sharedDifficulty?: 'beginner' | 'elementary' | 'intermediate' | 'advanced' | 'expert';
  sharedState?: 'draft' | 'active';
  recordMetadata?: ICardImportRecordMetadataInput[];
}

export interface ICardImportRecordMetadataInput {
  index: number;
  tags?: string[];
  knowledgeNodeIds?: string[];
  difficulty?: 'beginner' | 'elementary' | 'intermediate' | 'advanced' | 'expert';
  state?: 'draft' | 'active';
}

export interface ICardImportExecuteResult {
  batchId: string;
  created: ICardDto[];
  failed: {
    index: number;
    error: string;
    input: ICreateCardInput;
  }[];
  total: number;
  importWarnings: string[];
}

// ============================================================================
// Stats
// ============================================================================

export interface ICardStatsDto {
  total: number;
  byState: Record<CardState, number>;
  byType: Record<string, number>;
  averageDifficulty: number;
}

// ============================================================================
// History
// ============================================================================

/** A single version snapshot within a card's history. */
export interface ICardHistoryEntryDto {
  version: number;
  content: Record<string, unknown>;
  changedAt: string;
  changedBy: string;
}

/**
 * Full version history for a card.
 * CardHistoryResponse wraps this so that `select: (r) => r.data` returns ICardHistoryDto.
 */
export interface ICardHistoryDto {
  cardId: string;
  snapshots: ICardHistoryEntryDto[];
}

// ============================================================================
// Session Seed
// ============================================================================

export interface ISessionSeedDto {
  cardIds: string[];
  totalCount: number;
}

export interface ISessionSeedQuery {
  limit?: number;
  strategy?: 'due' | 'new' | 'mixed';
  cardTypes?: string[];
  tags?: string[];
  supportedStudyModes?: StudyMode[];
}

// ============================================================================
// Validation
// ============================================================================

export interface ICardValidationResult {
  valid: boolean;
  errors?: string[];
}

// ============================================================================
// Templates
// ============================================================================

export interface ITemplateDto {
  id: TemplateId;
  name: string;
  cardType: string;
  defaultContent: Record<string, unknown>;
  createdAt: string;
}

/** Alias for backward compatibility with api.ts and hooks.ts. */
export type TemplateDto = ITemplateDto;

export interface ICreateTemplateInput {
  name: string;
  cardType: string;
  defaultContent: Record<string, unknown>;
}

/** Alias for backward compatibility with api.ts and hooks.ts. */
export type CreateTemplateInput = ICreateTemplateInput;

export interface IUpdateTemplateInput {
  name?: string;
  defaultContent?: Record<string, unknown>;
}

// ============================================================================
// Media
// ============================================================================

export interface IMediaFileDto {
  id: MediaId;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: string;
}

export interface IUploadUrlResult {
  uploadUrl: string;
  mediaId: MediaId;
}

// ============================================================================
// Response wrapper types
// ============================================================================

export type CardResponse = IApiResponse<ICardDto>;
export type CardsListResponse = IApiResponse<{
  items: ICardSummaryDto[];
  total?: number;
  hasMore?: boolean;
}>;
export type CardsCursorResponse = IApiResponse<{
  items: ICardSummaryDto[];
  nextCursor: string | null;
  prevCursor?: string | null;
  hasMore?: boolean;
}>;
export type CardCountResponse = IApiResponse<{ count: number }>;
export type CardStatsResponse = IApiResponse<ICardStatsDto>;
export type BatchCreateResponse = IApiResponse<IBatchCreateResult>;
export type BatchCardsResponse = IApiResponse<ICardDto[]>;
export type BatchSummariesResponse = IApiResponse<IBatchSummaryDto[]>;
export type CardImportPreviewResponse = IApiResponse<ICardImportPreviewResult>;
export type CardImportExecuteResponse = IApiResponse<ICardImportExecuteResult>;
export type CardHistoryResponse = IApiResponse<ICardHistoryDto>;
export type CardVersionResponse = IApiResponse<{
  version: number;
  content: Record<string, unknown>;
  changedAt: string;
}>;
export type CardValidationResponse = IApiResponse<ICardValidationResult>;
export type SessionSeedResponse = IApiResponse<ISessionSeedDto>;
export type UploadUrlResponse = IApiResponse<IUploadUrlResult>;
export type MediaResponse = IApiResponse<IMediaFileDto>;
export type TemplateResponse = IApiResponse<TemplateDto>;
export type TemplatesListResponse = IApiResponse<TemplateDto[]>;
