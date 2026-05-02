import type {
  CardId,
  CardOriginMode,
  CardReviewState,
  CardTransformKind,
  CardType,
  ConceptId,
  ContentGenerationJobId,
  ContentGenerationJobStatus,
  DifficultyLevel,
  JsonValue,
  NodeId,
  RemediationCardType,
  UserId,
} from '@noema/types';

export interface IContentSourceCitationDto {
  documentId?: string;
  url?: string;
  title?: string;
  locator?: string;
  excerptHash?: string;
}

export interface ICardProvenanceDto {
  originMode: CardOriginMode;
  originAgentRunId?: string | null;
  authorUserId?: UserId | null;
  sourceDocumentIds: string[];
  sources: IContentSourceCitationDto[];
  anchoredCkgNodeIds: ConceptId[];
  anchoredPkgNodeIds: NodeId[];
  factualityScore?: number | null;
  guardianValidationId?: string | null;
}

export interface ICardLineageDto {
  cardId: CardId;
  parentCardId: CardId | null;
  transformationKind: CardTransformKind | null;
  ancestors: CardId[];
  variants: CardId[];
}

export interface ICompleteCardMetadataInputDto {
  cardType?: CardType | RemediationCardType;
  difficulty?: DifficultyLevel;
  tags?: string[];
  anchoredCkgNodeIds?: ConceptId[];
  anchoredPkgNodeIds?: NodeId[];
  metadata?: Record<string, JsonValue>;
}

export interface IPromoteCardFromReviewInputDto {
  decisionNote?: string;
}

export interface ITransformCardInputDto {
  transformationKind: CardTransformKind;
  prompt?: string;
  targetCardType?: CardType | RemediationCardType;
  anchoredCkgNodeIds?: ConceptId[];
  anchoredPkgNodeIds?: NodeId[];
}

export interface IContentGenerationJobDto {
  id: ContentGenerationJobId;
  userId: UserId;
  status: ContentGenerationJobStatus;
  mode: CardOriginMode;
  conceptIds: ConceptId[];
  documentIds: string[];
  requestedCardTypes: (CardType | RemediationCardType)[];
  createdCardIds: CardId[];
  rejectedDrafts: Record<string, JsonValue>[];
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ICreateContentGenerationJobInputDto {
  mode: Exclude<CardOriginMode, 'authored'>;
  conceptIds: ConceptId[];
  documentIds?: string[];
  curriculumContext?: Record<string, JsonValue>;
  studentContext?: Record<string, JsonValue>;
  desiredCardTypes?: (CardType | RemediationCardType)[];
  varietyMandate?: {
    minDistinctTypesPerConcept?: number;
  };
  budget?: {
    maxCards?: number;
    timeoutMs?: number;
  };
}

export interface IConceptCardCoverageDto {
  conceptId: ConceptId;
  activeCardCount: number;
  distinctActiveCardTypes: number;
  pendingReviewCount: number;
  metadataIncompleteCount: number;
  lastUpdatedAt: string;
}

export interface IUserContentCoverageDto {
  userId: UserId;
  concepts: IConceptCardCoverageDto[];
}

export interface ICardReviewStateDto {
  cardId: CardId;
  reviewState: CardReviewState;
  reason?: string;
}
