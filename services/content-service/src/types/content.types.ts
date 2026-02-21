/**
 * @noema/content-service - Content Domain Types
 *
 * Core domain interfaces for cards, queries, and content management.
 * Cards are the atomic unit of knowledge in Noema — the content archive
 * stores polymorphic JSONB blobs discriminated by cardType.
 *
 * Design: ADR-0010 Decision 5 — content service is a pure card archive.
 * Cards link to the Personal Knowledge Graph via knowledgeNodeIds: NodeId[].
 */

import type {
  CardId,
  CardState,
  CardType,
  DifficultyLevel,
  EventSource,
  IAuditedEntity,
  IJsonObject,
  JsonValue,
  MediaId,
  NodeId,
  RemediationCardType,
  TemplateId,
  UserId,
} from '@noema/types';

// ============================================================================
// Card Entity
// ============================================================================

/**
 * Complete card entity — the shared model used across the service.
 * Content is a polymorphic JSONB blob validated at the Zod layer.
 */
export interface ICard extends IAuditedEntity {
  /** Unique card identifier (card_<nanoid>) */
  id: CardId;

  /** Owner user ID */
  userId: UserId;

  /** Card type discriminator (CardType | RemediationCardType) */
  cardType: CardType | RemediationCardType;

  /** Card lifecycle state */
  state: CardState;

  /** Difficulty level */
  difficulty: DifficultyLevel;

  /** Polymorphic content blob — structure depends on cardType */
  content: ICardContent;

  /** PKG node IDs this card is linked to */
  knowledgeNodeIds: NodeId[];

  /** User-defined tags for filtering */
  tags: string[];

  /** How this card was created */
  source: EventSource;

  /** Extensible metadata (scheduling hints, generation params, agent trace) */
  metadata: Record<string, JsonValue>;
}

// ============================================================================
// Card Content (Polymorphic JSONB)
// ============================================================================

/**
 * Base card content — all content types MUST include these fields.
 * Additional fields are type-specific and validated by Zod discriminated unions.
 */
export interface ICardContentBase {
  /** Front side (question/prompt) — Markdown supported */
  front: string;
  /** Back side (answer/explanation) — Markdown supported */
  back: string;
  /** Optional hint shown before reveal */
  hint?: string;
  /** Optional detailed explanation */
  explanation?: string;
  /** Optional media attachments */
  media?: IMediaAttachment[];
}

/**
 * Media attachment for card content.
 */
export interface IMediaAttachment extends IJsonObject {
  /** Media URL (or media-service ID) */
  url: string;
  /** MIME type */
  mimeType: string;
  /** Alt text for accessibility */
  alt?: string;
  /** Position in content: front, back, or shared */
  position: 'front' | 'back' | 'shared';
}

/**
 * Card content — the actual JSONB payload.
 * At minimum it conforms to ICardContentBase, but each cardType
 * extends it with type-specific fields (e.g., cloze deletions,
 * multiple choice options, matching pairs). Validation happens
 * in the Zod schema layer — here we keep it flexible.
 */
export type ICardContent = ICardContentBase & Record<string, JsonValue>;

// ============================================================================
// Card Summary (Read-Optimized Projection)
// ============================================================================

/**
 * Lightweight projection for list views.
 */
export interface ICardSummary {
  id: CardId;
  userId: UserId;
  cardType: CardType | RemediationCardType;
  state: CardState;
  difficulty: DifficultyLevel;
  /** First N chars of front content for preview */
  preview: string;
  knowledgeNodeIds: NodeId[];
  tags: string[];
  source: EventSource;
  createdAt: string;
  updatedAt: string;
  version: number;
}

// ============================================================================
// Input DTOs
// ============================================================================

/**
 * Input for creating a new card.
 */
export interface ICreateCardInput {
  cardType: CardType | RemediationCardType;
  content: ICardContent;
  difficulty?: DifficultyLevel;
  knowledgeNodeIds?: NodeId[];
  tags?: string[];
  source?: EventSource;
  metadata?: Record<string, JsonValue>;
}

/**
 * Input for batch card creation (agent bulk import).
 */
export interface IBatchCreateCardInput {
  cards: ICreateCardInput[];
}

/**
 * Input for updating an existing card.
 */
export interface IUpdateCardInput {
  content?: ICardContent;
  difficulty?: DifficultyLevel;
  knowledgeNodeIds?: NodeId[];
  tags?: string[];
  metadata?: Record<string, JsonValue>;
}

/**
 * Input for changing card state.
 */
export interface IChangeCardStateInput {
  state: CardState;
  /** Optional reason for state change (audit trail) */
  reason?: string;
}

// ============================================================================
// Query Types (ADR-0010 Decision 2 — Dynamic Deck Queries)
// ============================================================================

/**
 * DeckQuery — a dynamic query that replaces static deck CRUD.
 * Agents and clients compose queries over the card archive
 * using filters, sorts, and limits.
 */
export interface IDeckQuery {
  /** Filter by card types */
  cardTypes?: (CardType | RemediationCardType)[];
  /** Filter by card states */
  states?: CardState[];
  /** Filter by difficulty levels */
  difficulties?: DifficultyLevel[];
  /** Filter by PKG node IDs (cards linked to ANY of these nodes) */
  knowledgeNodeIds?: NodeId[];
  /**
   * How to match knowledgeNodeIds.
   * - 'any'           — card linked to ANY of the given nodes (default)
   * - 'all'           — card linked to ALL of the given nodes
   * - 'exact'         — card linked to EXACTLY these nodes (set equality)
   * - 'subtree'       — card linked to these nodes OR their descendants (requires KG service)
   * - 'prerequisites' — card linked to prerequisites of these nodes (requires KG service)
   * - 'related'       — card linked to semantically related nodes (requires KG service)
   *
   * Only 'any', 'all', and 'exact' are implemented in the content service.
   * 'subtree', 'prerequisites', and 'related' require the knowledge-graph-service
   * to resolve node sets first, then pass the expanded set with mode='any'.
   */
  knowledgeNodeIdMode?: 'any' | 'all' | 'exact' | 'subtree' | 'prerequisites' | 'related';
  /** Filter by tags (cards matching ANY of these tags) */
  tags?: string[];
  /** Filter by source */
  sources?: EventSource[];
  /** Filter by user ID (admin only — defaults to context user) */
  userId?: UserId;
  /** Full-text search on content.front + content.back */
  search?: string;
  /** Date range: cards created after this ISO timestamp */
  createdAfter?: string;
  /** Date range: cards created before this ISO timestamp */
  createdBefore?: string;
  /** Date range: cards updated after this ISO timestamp */
  updatedAfter?: string;
  /** Date range: cards updated before this ISO timestamp */
  updatedBefore?: string;
  /** Sort field */
  sortBy?: 'createdAt' | 'updatedAt' | 'difficulty';
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
  /** Pagination offset */
  offset?: number;
  /** Pagination limit (max 100) */
  limit?: number;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Batch creation result.
 */
export interface IBatchCreateResult {
  /** Successfully created cards */
  created: ICard[];
  /** Failed items with error details */
  failed: {
    index: number;
    error: string;
    input: ICreateCardInput;
  }[];
  /** Total attempted */
  total: number;
  /** Total successfully created */
  successCount: number;
  /** Total failures */
  failureCount: number;
}

// ============================================================================
// Template Entity — Reusable Card Blueprints
// ============================================================================

/** Template visibility levels */
export type TemplateVisibility = 'private' | 'public' | 'shared';

/**
 * Complete template entity.
 * Templates are reusable card blueprints — predefined content structures
 * that users or agents can instantiate into concrete cards.
 */
export interface ITemplate extends IAuditedEntity {
  id: TemplateId;
  userId: UserId;
  name: string;
  description: string | null;
  cardType: CardType | RemediationCardType;
  content: ICardContent;
  difficulty: DifficultyLevel;
  knowledgeNodeIds: NodeId[];
  tags: string[];
  metadata: Record<string, JsonValue>;
  visibility: TemplateVisibility;
  usageCount: number;
}

/**
 * Lightweight template summary for list views.
 */
export interface ITemplateSummary {
  id: TemplateId;
  userId: UserId;
  name: string;
  description: string | null;
  cardType: CardType | RemediationCardType;
  difficulty: DifficultyLevel;
  visibility: TemplateVisibility;
  usageCount: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

/**
 * Input for creating a new template.
 */
export interface ICreateTemplateInput {
  name: string;
  description?: string;
  cardType: CardType | RemediationCardType;
  content: ICardContent;
  difficulty?: DifficultyLevel;
  knowledgeNodeIds?: NodeId[];
  tags?: string[];
  metadata?: Record<string, JsonValue>;
  visibility?: TemplateVisibility;
}

/**
 * Input for updating an existing template.
 */
export interface IUpdateTemplateInput {
  name?: string;
  description?: string;
  content?: ICardContent;
  difficulty?: DifficultyLevel;
  knowledgeNodeIds?: NodeId[];
  tags?: string[];
  metadata?: Record<string, JsonValue>;
  visibility?: TemplateVisibility;
}

/**
 * Query filters for listing templates.
 */
export interface ITemplateQuery {
  cardTypes?: (CardType | RemediationCardType)[];
  visibility?: TemplateVisibility;
  tags?: string[];
  search?: string;
  userId?: UserId;
  sortBy?: 'createdAt' | 'updatedAt' | 'usageCount' | 'name';
  sortOrder?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
}

// ============================================================================
// Media File Entity
// ============================================================================

/**
 * Media file metadata (actual files stored in MinIO).
 */
export interface IMediaFile {
  id: MediaId;
  userId: UserId;
  filename: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  bucket: string;
  objectKey: string;
  alt: string | null;
  metadata: Record<string, JsonValue>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * Input for registering a media file after upload.
 */
export interface ICreateMediaInput {
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  alt?: string;
  metadata?: Record<string, JsonValue>;
}

/**
 * Presigned URL response for client-side upload.
 */
export interface IPresignedUploadUrl {
  uploadUrl: string;
  mediaId: MediaId;
  objectKey: string;
  bucket: string;
  expiresAt: string;
}

/**
 * Presigned URL response for download.
 */
export interface IPresignedDownloadUrl {
  downloadUrl: string;
  expiresAt: string;
}
