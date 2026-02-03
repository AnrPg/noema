// =============================================================================
// ECOSYSTEM BRIDGE TYPES
// =============================================================================
// Types for bidirectional sync between Ecosystem (Categories as Lenses) and
// LKGC (Local Knowledge Graph Core).
//
// The bridge enables:
// - Category → LKGC concept node mapping
// - CategoryRelation → LKGC edge mapping
// - CardCategoryParticipation → LKGC example_of edge mapping
// - Context-aware reviews → LKGC event emission
// - LKGC MasteryState → Ecosystem contextMasteryScore projection
// - Decision engine context awareness (active lens)
// =============================================================================

import type { CategoryId, CategoryRelationType } from "./ecosystem.types";
import type { CardId, UserId } from "./user.types";
import type { ParticipationId } from "./multi-belonging.types";
import type { NodeId, EdgeId, Confidence, Timestamp } from "./lkgc/foundation";
import type { EdgeType } from "./lkgc/edges";

// =============================================================================
// MAPPING IDENTIFIERS
// =============================================================================

export type EcosystemMappingId = string;
export type SyncEventId = string;

// =============================================================================
// MAPPING DIRECTION
// =============================================================================

/**
 * Direction of sync between Ecosystem and LKGC
 */
export type SyncDirection =
  | "ecosystem_to_lkgc" // Ecosystem is source of truth
  | "lkgc_to_ecosystem" // LKGC is source of truth
  | "bidirectional"; // Both can modify, conflict resolution needed

// =============================================================================
// MAPPING STATUS
// =============================================================================

/**
 * Status of a mapping between Ecosystem and LKGC entities
 */
export type MappingStatus =
  | "active" // Actively syncing
  | "pending" // Waiting for confirmation
  | "orphaned" // Source deleted, target exists
  | "conflict" // Both modified, needs resolution
  | "archived"; // Soft deleted, preserved for history

// =============================================================================
// RELATION TYPE MAPPING
// =============================================================================

/**
 * Mapping from CategoryRelationType to LKGC EdgeType
 * Based on semantic equivalence
 */
export const CATEGORY_RELATION_TO_LKGC_EDGE: Record<
  CategoryRelationType,
  EdgeType
> = {
  prepares_for: "prerequisite_of",
  contrasts_with: "contrasts_with",
  analogous_to: "analogous_to",
  specializes: "part_of", // Child is part of parent concept
  generalizes: "part_of", // Need to reverse direction
  conceptual_contains: "part_of", // Contained is part of container
} as const;

/**
 * Reverse mapping from LKGC EdgeType to CategoryRelationType
 * Note: Not all LKGC edges map back to CategoryRelations
 */
export const LKGC_EDGE_TO_CATEGORY_RELATION: Partial<
  Record<EdgeType, CategoryRelationType>
> = {
  prerequisite_of: "prepares_for",
  contrasts_with: "contrasts_with",
  analogous_to: "analogous_to",
  part_of: "specializes", // Default mapping, context determines actual
} as const;

// =============================================================================
// CONFIDENCE LEVELS
// =============================================================================

/**
 * Confidence levels for different mapping sources
 */
export const ECOSYSTEM_SYNC_CONFIDENCE = {
  /** User-defined CategoryRelation */
  categoryRelation: 0.85 as Confidence,

  /** User-confirmed CategoryRelation */
  categoryRelationConfirmed: 0.9 as Confidence,

  /** Auto-suggested CategoryRelation */
  categoryRelationSuggested: 0.7 as Confidence,

  /** Card participation (system-inferred) */
  cardParticipation: 0.75 as Confidence,

  /** Primary card participation (user-designated) */
  cardParticipationPrimary: 0.85 as Confidence,

  /** Category → concept node mapping */
  categoryToConceptNode: 0.95 as Confidence,
} as const;

// =============================================================================
// CATEGORY → CONCEPT NODE MAPPING
// =============================================================================

/**
 * Mapping between an Ecosystem Category and an LKGC concept node
 */
export interface CategoryToConceptMapping {
  readonly id: EcosystemMappingId;
  readonly categoryId: CategoryId;
  readonly lkgcNodeId: NodeId;
  readonly userId: UserId;

  /** Sync direction for this mapping */
  readonly direction: SyncDirection;

  /** Current status */
  readonly status: MappingStatus;

  /** Confidence in this mapping */
  readonly confidence: Confidence;

  /** When the mapping was created */
  readonly createdAt: Timestamp;

  /** When the mapping was last synced */
  readonly lastSyncedAt: Timestamp;

  /** Hash of category state at last sync (for change detection) */
  readonly categoryStateHash?: string;

  /** Hash of LKGC node state at last sync */
  readonly lkgcStateHash?: string;
}

// =============================================================================
// CATEGORY RELATION → LKGC EDGE MAPPING
// =============================================================================

/**
 * Mapping between a CategoryRelation and an LKGC edge
 */
export interface CategoryRelationToEdgeMapping {
  readonly id: EcosystemMappingId;
  readonly categoryRelationId: string;
  readonly lkgcEdgeId: EdgeId;
  readonly userId: UserId;

  /** Source category ID */
  readonly sourceCategoryId: CategoryId;

  /** Target category ID */
  readonly targetCategoryId: CategoryId;

  /** Original relation type from Ecosystem */
  readonly originalRelationType: CategoryRelationType;

  /** Mapped edge type in LKGC */
  readonly mappedEdgeType: EdgeType;

  /** Whether direction was reversed in mapping */
  readonly directionReversed: boolean;

  /** Sync direction */
  readonly direction: SyncDirection;

  /** Status */
  readonly status: MappingStatus;

  /** Confidence */
  readonly confidence: Confidence;

  /** Timestamps */
  readonly createdAt: Timestamp;
  readonly lastSyncedAt: Timestamp;
}

// =============================================================================
// CARD PARTICIPATION → LKGC EDGE MAPPING
// =============================================================================

/**
 * Mapping between CardCategoryParticipation and LKGC example_of edge
 */
export interface ParticipationToEdgeMapping {
  readonly id: EcosystemMappingId;
  readonly participationId: ParticipationId;
  readonly lkgcEdgeId: EdgeId;
  readonly userId: UserId;

  /** Card ID */
  readonly cardId: CardId;

  /** Category ID */
  readonly categoryId: CategoryId;

  /** LKGC card node ID */
  readonly lkgcCardNodeId: NodeId;

  /** LKGC category concept node ID */
  readonly lkgcConceptNodeId: NodeId;

  /** Mapped edge type (always example_of per user decision) */
  readonly mappedEdgeType: "example_of";

  /** Is this the primary participation? */
  readonly isPrimary: boolean;

  /** Semantic role from participation */
  readonly semanticRole: string;

  /** Sync direction */
  readonly direction: SyncDirection;

  /** Status */
  readonly status: MappingStatus;

  /** Confidence */
  readonly confidence: Confidence;

  /** Timestamps */
  readonly createdAt: Timestamp;
  readonly lastSyncedAt: Timestamp;
}

// =============================================================================
// CONTEXT REVIEW EVENT
// =============================================================================

/**
 * Data for emitting a context-aware review to LKGC EventLog
 */
export interface ContextReviewEventData {
  readonly cardId: CardId;
  readonly categoryId: CategoryId;
  readonly userId: UserId;

  /** LKGC node IDs for provenance */
  readonly lkgcCardNodeId?: NodeId;
  readonly lkgcConceptNodeId?: NodeId;

  /** Review outcome */
  readonly rating: number;
  readonly responseTimeMs: number;

  /** Context-specific metrics at time of review */
  readonly contextSuccessRate: number;
  readonly contextMasteryScore: number;
  readonly reviewCountInContext: number;

  /** Timestamp */
  readonly reviewedAt: Timestamp;
}

// =============================================================================
// MASTERY PROJECTION
// =============================================================================

/**
 * Projection from LKGC MasteryState to Ecosystem contextMasteryScore
 */
export interface MasteryProjection {
  readonly participationId: ParticipationId;
  readonly cardId: CardId;
  readonly categoryId: CategoryId;

  /** LKGC source data */
  readonly lkgcMasteryScore: number;
  readonly lkgcStability: number;
  readonly lkgcRetrievability: number;

  /** Projected Ecosystem metrics */
  readonly projectedContextMasteryScore: number;
  readonly projectedContextSuccessRate: number;

  /** Confidence in projection */
  readonly confidence: Confidence;

  /** Timestamp */
  readonly projectedAt: Timestamp;
}

// =============================================================================
// ACTIVE LENS CONTEXT (for Decision Engine)
// =============================================================================

/**
 * Active lens context passed to LKGC decision engine
 */
export interface ActiveLensContext {
  /** Currently active category ID (the lens being studied through) */
  readonly activeCategoryId?: CategoryId;

  /** LKGC concept node ID for active category */
  readonly activeConceptNodeId?: NodeId;

  /** Category name (for display/logging) */
  readonly activeCategoryName?: string;

  /** Whether to filter reviews to this category only */
  readonly filterToActiveCategory: boolean;

  /** Emphasis multiplier for cards in this category */
  readonly emphasisMultiplier: number;

  /** De-emphasis multiplier for cards not in this category */
  readonly deEmphasisMultiplier: number;
}

/**
 * Default active lens context (no category filter)
 */
export const DEFAULT_ACTIVE_LENS_CONTEXT: ActiveLensContext = {
  filterToActiveCategory: false,
  emphasisMultiplier: 1.0,
  deEmphasisMultiplier: 1.0,
};

// =============================================================================
// SYNC EVENT TYPES
// =============================================================================

/**
 * Types of sync events
 */
export type EcosystemSyncEventType =
  // Category → LKGC
  | "category_created"
  | "category_updated"
  | "category_deleted"
  // CategoryRelation → LKGC
  | "category_relation_created"
  | "category_relation_updated"
  | "category_relation_deleted"
  // CardCategoryParticipation → LKGC
  | "participation_created"
  | "participation_updated"
  | "participation_deleted"
  // Review → LKGC Event
  | "context_review_recorded"
  // Mastery projection
  | "mastery_projected"
  // LKGC → Ecosystem (reverse sync)
  | "lkgc_edge_created"
  | "lkgc_edge_updated"
  | "lkgc_node_updated";

/**
 * Sync event record for audit trail
 */
export interface EcosystemSyncEvent {
  readonly id: SyncEventId;
  readonly eventType: EcosystemSyncEventType;
  readonly userId: UserId;

  /** Source entity */
  readonly sourceType:
    | "category"
    | "category_relation"
    | "participation"
    | "review"
    | "lkgc_node"
    | "lkgc_edge";
  readonly sourceId: string;

  /** Target entity */
  readonly targetType:
    | "lkgc_node"
    | "lkgc_edge"
    | "lkgc_event"
    | "participation"
    | "category";
  readonly targetId: string;

  /** Mapping ID if applicable */
  readonly mappingId?: EcosystemMappingId;

  /** Success status */
  readonly success: boolean;
  readonly errorMessage?: string;

  /** Timestamp */
  readonly timestamp: Timestamp;

  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

// =============================================================================
// BRIDGE CONFIGURATION
// =============================================================================

/**
 * Configuration for the EcosystemBridge
 */
export interface EcosystemBridgeConfig {
  /** Enable Ecosystem → LKGC sync */
  readonly enableEcosystemToLkgc: boolean;

  /** Enable LKGC → Ecosystem sync */
  readonly enableLkgcToEcosystem: boolean;

  /** Enable real-time review event emission */
  readonly enableRealtimeReviewEvents: boolean;

  /** Enable mastery projection after every review */
  readonly enableMasteryProjection: boolean;

  /** Enable decision engine context awareness */
  readonly enableDecisionEngineContext: boolean;

  /** Confidence levels (can override defaults) */
  readonly confidenceLevels?: Partial<typeof ECOSYSTEM_SYNC_CONFIDENCE>;

  /** Batch size for bulk operations */
  readonly batchSize: number;

  /** Retry configuration */
  readonly maxRetries: number;
  readonly retryDelayMs: number;
}

/**
 * Default bridge configuration
 */
export const DEFAULT_BRIDGE_CONFIG: EcosystemBridgeConfig = {
  enableEcosystemToLkgc: true,
  enableLkgcToEcosystem: true,
  enableRealtimeReviewEvents: true,
  enableMasteryProjection: true,
  enableDecisionEngineContext: true,
  batchSize: 100,
  maxRetries: 3,
  retryDelayMs: 1000,
};
