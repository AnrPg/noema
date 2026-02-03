// =============================================================================
// ECOSYSTEM BRIDGE TYPES - API LAYER
// =============================================================================
// Internal types for the EcosystemBridge service layer

// =============================================================================
// SHARED TYPE DEFINITIONS (Local copies for API layer independence)
// =============================================================================

/**
 * Mapping between Ecosystem Category and LKGC Concept Node
 */
export interface CategoryToConceptMapping {
  categoryId: string;
  lkgcNodeId: string;
  userId: string;
  createdAt: Date;
  lastSyncedAt: Date;
  syncStatus: "active" | "pending" | "orphaned";
}

/**
 * Mapping between Ecosystem CategoryRelation and LKGC Edge
 */
export interface CategoryRelationToEdgeMapping {
  categoryRelationId: string;
  lkgcEdgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  userId: string;
  ecosystemRelationType: string;
  lkgcEdgeType: string;
  createdAt: Date;
  lastSyncedAt: Date;
  syncStatus: "active" | "pending" | "orphaned";
}

/**
 * Mapping between CardCategoryParticipation and LKGC example_of edge
 */
export interface ParticipationToEdgeMapping {
  participationId: string;
  lkgcEdgeId: string;
  cardNodeId: string;
  conceptNodeId: string;
  userId: string;
  semanticRole: string;
  createdAt: Date;
  lastSyncedAt: Date;
  syncStatus: "active" | "pending" | "orphaned";
}

/**
 * Active lens/category context for decision engine
 */
export interface ActiveLensContext {
  activeCategoryId?: string | null;
  categoryNodeId?: string | null;
  activeConceptNodeId?: string | null;
  activeCategoryName?: string | null;
  filterToActiveCategory: boolean;
  emphasisMultiplier: number;
  deEmphasisMultiplier: number;
}

/**
 * Mastery projection from LKGC to Ecosystem
 */
export interface MasteryProjection {
  participationId: string;
  cardId: string;
  categoryId: string;
  projectedContextMasteryScore: number;
  projectedContextSuccessRate: number;
  confidence: number;
  projectedAt: Date;
}

/**
 * Context review event data for LKGC
 */
export interface ContextReviewEventData {
  cardId: string;
  categoryId: string;
  userId: string;
  rating: number;
  responseTimeMs: number;
  contextSuccessRate: number;
  contextMasteryScore: number;
  reviewCountInContext: number;
  timestamp: Date;
}

/**
 * Bridge configuration
 */
export interface EcosystemBridgeConfig {
  syncMode: "realtime" | "batch" | "manual";
  defaultConfidence: {
    categoryRelationEdge: number;
    cardParticipationEdge: number;
    contextReviewEvent: number;
  };
  masteryProjection: {
    updateOnEveryReview: boolean;
    batchIntervalMs?: number;
  };
}

// =============================================================================
// OPERATION RESULTS
// =============================================================================

export interface SyncResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  mappingId?: string;
  syncEventId?: string;
}

export interface BatchSyncResult<T> {
  success: boolean;
  results: SyncResult<T>[];
  totalProcessed: number;
  successCount: number;
  errorCount: number;
  errors: string[];
}

// =============================================================================
// SYNC OPERATIONS
// =============================================================================

export interface CategorySyncInput {
  categoryId: string;
  userId: string;
  name: string;
  description?: string;
  framingQuestion?: string;
}

export interface CategoryRelationSyncInput {
  categoryRelationId: string;
  userId: string;
  sourceCategoryId: string;
  targetCategoryId: string;
  relationType: string;
  strength: number;
  isUserConfirmed: boolean;
  isAutoSuggested: boolean;
}

export interface ParticipationSyncInput {
  participationId: string;
  userId: string;
  cardId: string;
  categoryId: string;
  semanticRole: string;
  isPrimary: boolean;
}

export interface ContextReviewInput {
  cardId: string;
  categoryId: string;
  userId: string;
  rating: number;
  responseTimeMs: number;
  contextSuccessRate: number;
  contextMasteryScore: number;
  reviewCountInContext: number;
}

// =============================================================================
// LKGC OPERATION PAYLOADS
// =============================================================================

export interface CreateLkgcConceptNodePayload {
  title: string;
  description?: string;
  aliases?: string[];
  sourceId: string; // Ecosystem category ID
}

export interface CreateLkgcEdgePayload {
  sourceId: string;
  targetId: string;
  edgeType: string;
  weight: number;
  confidence: number;
  label?: string;
  sourceEntityId: string; // Ecosystem entity ID for provenance
}

export interface EmitLkgcReviewEventPayload {
  cardNodeId: string;
  conceptNodeId?: string;
  rating: number;
  responseTimeMs: number;
  contextData: {
    categoryId: string;
    contextSuccessRate: number;
    contextMasteryScore: number;
  };
}

// =============================================================================
// BRIDGE STATE QUERIES
// =============================================================================

export interface MappingQuery {
  userId: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface CategoryMappingQuery extends MappingQuery {
  categoryId?: string;
  lkgcNodeId?: string;
}

export interface RelationMappingQuery extends MappingQuery {
  categoryRelationId?: string;
  lkgcEdgeId?: string;
  sourceCategoryId?: string;
  targetCategoryId?: string;
}

export interface ParticipationMappingQuery extends MappingQuery {
  participationId?: string;
  cardId?: string;
  categoryId?: string;
}

// =============================================================================
// BRIDGE STATISTICS
// =============================================================================

export interface BridgeStatistics {
  userId: string;
  categoryMappings: {
    total: number;
    active: number;
    pending: number;
    orphaned: number;
  };
  relationMappings: {
    total: number;
    active: number;
    byRelationType: Record<string, number>;
  };
  participationMappings: {
    total: number;
    active: number;
    primaryCount: number;
  };
  syncEvents: {
    total: number;
    last24Hours: number;
    successRate: number;
  };
  lastSyncAt?: Date;
}

// =============================================================================
// DECISION ENGINE INTEGRATION
// =============================================================================

export interface DecisionEngineContextInput {
  userId: string;
  activeCategoryId?: string;
  filterToActiveCategory?: boolean;
  emphasisMultiplier?: number;
  deEmphasisMultiplier?: number;
}

export interface DecisionEngineContextOutput {
  context: ActiveLensContext;
  categoryNodeId?: string;
  participatingCardIds?: string[];
}

// =============================================================================
// MASTERY PROJECTION
// =============================================================================

export interface MasteryProjectionInput {
  participationId: string;
  cardId: string;
  categoryId: string;
  userId: string;
}

export interface MasteryProjectionOutput {
  participationId: string;
  projectedContextMasteryScore: number;
  projectedContextSuccessRate: number;
  lkgcMasteryData?: {
    masteryScore: number;
    stability: number;
    retrievability: number;
  };
  confidence: number;
}

// =============================================================================
// HOOKS FOR EXTERNAL INTEGRATION
// =============================================================================

export type OnCategoryCreatedHook = (input: CategorySyncInput) => Promise<void>;
export type OnCategoryRelationCreatedHook = (
  input: CategoryRelationSyncInput,
) => Promise<void>;
export type OnParticipationCreatedHook = (
  input: ParticipationSyncInput,
) => Promise<void>;
export type OnContextReviewHook = (input: ContextReviewInput) => Promise<void>;

export interface EcosystemBridgeHooks {
  onCategoryCreated?: OnCategoryCreatedHook;
  onCategoryUpdated?: OnCategoryCreatedHook;
  onCategoryDeleted?: (categoryId: string, userId: string) => Promise<void>;
  onCategoryRelationCreated?: OnCategoryRelationCreatedHook;
  onCategoryRelationUpdated?: OnCategoryRelationCreatedHook;
  onCategoryRelationDeleted?: (
    relationId: string,
    userId: string,
  ) => Promise<void>;
  onParticipationCreated?: OnParticipationCreatedHook;
  onParticipationUpdated?: OnParticipationCreatedHook;
  onParticipationDeleted?: (
    participationId: string,
    userId: string,
  ) => Promise<void>;
  onContextReview?: OnContextReviewHook;
}
