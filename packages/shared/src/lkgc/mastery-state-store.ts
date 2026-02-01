// =============================================================================
// MASTERY STATE STORE - Storage Abstraction for MasteryState
// =============================================================================
// Persistent storage for MasteryState records with:
// - Full revision history (every update is versioned)
// - Audit trail (every change linked to rule IDs and source data)
// - Query capabilities by node, granularity, and time
//
// NO SCHEDULING. NO AI. Just state storage and retrieval.
// =============================================================================

import type {
  EntityId,
  NodeId,
  Timestamp,
  RevisionNumber,
  NormalizedValue,
} from "../types/lkgc/foundation";
import type {
  MasteryState,
  MasteryStateDelta,
  MasteryGranularity,
} from "../types/lkgc/mastery";

// =============================================================================
// MASTERY STATE ID
// =============================================================================

/**
 * Unique identifier for a mastery state record
 * Branded type for type safety
 */
declare const __masteryStateId: unique symbol;
export type MasteryStateId = string & { readonly [__masteryStateId]: never };

// =============================================================================
// MASTERY STATE RECORD - Stored record with metadata
// =============================================================================

/**
 * Stored mastery state with audit metadata
 */
export interface MasteryStateRecord {
  /** Unique ID for this record */
  readonly masteryStateId: MasteryStateId;

  /** The node this mastery state is for */
  readonly nodeId: NodeId;

  /** Granularity level (card, concept, skill) */
  readonly granularity: MasteryGranularity;

  /** The full mastery state */
  readonly state: MasteryState;

  /** Current revision number */
  readonly rev: RevisionNumber;

  /** When this state was created */
  readonly createdAt: Timestamp;

  /** When this state was last updated */
  readonly updatedAt: Timestamp;

  /** Materialization metadata */
  readonly materialization: MaterializationMetadata;
}

/**
 * Metadata about how and when the state was materialized
 */
export interface MaterializationMetadata {
  /** Last feature revision watermark (for incremental updates) */
  readonly lastFeatureRevision: RevisionNumber;

  /** Last graph revision watermark */
  readonly lastGraphRevision: RevisionNumber;

  /** IDs of rules applied in the last update */
  readonly appliedRuleIds: readonly string[];

  /** Rule versions used */
  readonly ruleVersions: Readonly<Record<string, number>>;

  /** Source feature IDs that contributed */
  readonly sourceFeatureIds: readonly EntityId[];

  /** Whether this is a full recomputation or incremental */
  readonly isFullRecomputation: boolean;

  /** Duration of the last materialization (ms) */
  readonly materializationDuration: number;

  /** Model version used (e.g., "heuristic-v0") */
  readonly modelVersion: string;
}

// =============================================================================
// MASTERY STATE REVISION - Historical record
// =============================================================================

/**
 * Historical revision of a mastery state
 */
export interface MasteryStateRevision {
  /** The state at this revision */
  readonly state: MasteryState;

  /** Revision number */
  readonly rev: RevisionNumber;

  /** When this revision was created */
  readonly createdAt: Timestamp;

  /** Delta from previous revision (if available) */
  readonly delta: MasteryStateDelta | null;

  /** Materialization metadata at this revision */
  readonly materialization: MaterializationMetadata;

  /** Previous revision number (null if first) */
  readonly previousRev: RevisionNumber | null;
}

// =============================================================================
// QUERY OPTIONS
// =============================================================================

/**
 * Options for querying mastery states
 */
export interface MasteryStateQueryOptions {
  /** Filter by granularity */
  readonly granularity?: MasteryGranularity;

  /** Filter by node IDs */
  readonly nodeIds?: readonly NodeId[];

  /** Filter by minimum retrievability */
  readonly minRetrievability?: NormalizedValue;

  /** Filter by maximum retrievability */
  readonly maxRetrievability?: NormalizedValue;

  /** Filter by learning state */
  readonly learningStates?: readonly (
    | "new"
    | "learning"
    | "review"
    | "relearning"
  )[];

  /** Filter by staleness (days since last update) */
  readonly maxDaysSinceUpdate?: number;

  /** Include deleted records */
  readonly includeDeleted?: boolean;

  /** Pagination: limit */
  readonly limit?: number;

  /** Pagination: offset */
  readonly offset?: number;

  /** Sort field */
  readonly sortBy?: "updatedAt" | "retrievability" | "dueDate" | "stability";

  /** Sort direction */
  readonly sortDirection?: "asc" | "desc";
}

/**
 * Result of a mastery state query
 */
export interface MasteryStateQueryResult {
  /** Matching states */
  readonly states: readonly MasteryStateRecord[];

  /** Total count (ignoring pagination) */
  readonly totalCount: number;

  /** Whether there are more results */
  readonly hasMore: boolean;
}

// =============================================================================
// UPSERT INPUT
// =============================================================================

/**
 * Input for creating or updating a mastery state
 */
export interface UpsertMasteryStateInput {
  /** Node ID (required) */
  readonly nodeId: NodeId;

  /** Granularity (required) */
  readonly granularity: MasteryGranularity;

  /** The full state (for create) or partial updates (for update) */
  readonly state: MasteryState;

  /** Expected revision (for optimistic concurrency, optional) */
  readonly expectedRev?: RevisionNumber;

  /** Materialization metadata (required) */
  readonly materialization: MaterializationMetadata;

  /** Delta describing what changed (for audit) */
  readonly delta?: MasteryStateDelta;
}

/**
 * Result of an upsert operation
 */
export interface UpsertMasteryStateResult {
  /** Whether the operation succeeded */
  readonly success: boolean;

  /** The resulting record (if successful) */
  readonly record?: MasteryStateRecord;

  /** The new revision number (if successful) */
  readonly rev?: RevisionNumber;

  /** Error message (if failed) */
  readonly error?: string;

  /** Whether this was a create or update */
  readonly operation?: "create" | "update";
}

// =============================================================================
// STATISTICS
// =============================================================================

/**
 * Statistics about the mastery state store
 */
export interface MasteryStoreStatistics {
  /** Total state count */
  readonly totalStates: number;

  /** States by granularity */
  readonly statesByGranularity: Readonly<
    Partial<Record<MasteryGranularity, number>>
  >;

  /** States by learning state */
  readonly statesByLearningState: Readonly<Record<string, number>>;

  /** Average retrievability */
  readonly avgRetrievability: number;

  /** Average stability */
  readonly avgStability: number;

  /** Total revisions stored */
  readonly totalRevisions: number;

  /** Oldest state timestamp */
  readonly oldestState: Timestamp | null;

  /** Newest state timestamp */
  readonly newestState: Timestamp | null;
}

// =============================================================================
// WATERMARK - For incremental processing
// =============================================================================

/**
 * Processing watermarks for incremental materialization
 */
export interface MaterializationWatermark {
  /** Last processed feature revision */
  readonly featureRevision: RevisionNumber;

  /** Last processed graph revision */
  readonly graphRevision: RevisionNumber;

  /** Last materialization timestamp */
  readonly materializedAt: Timestamp;

  /** Number of states updated in last materialization */
  readonly statesUpdated: number;
}

// =============================================================================
// MASTERY STATE STORE INTERFACE
// =============================================================================

/**
 * MasteryStateStore - Persistent storage for MasteryState
 *
 * Provides:
 * - CRUD operations with revision tracking
 * - Query capabilities
 * - Revision history for audit
 * - Watermarks for incremental processing
 */
export interface MasteryStateStore {
  // ---------------------------------------------------------------------------
  // WRITE OPERATIONS
  // ---------------------------------------------------------------------------

  /**
   * Create or update a mastery state
   * - Creates if nodeId doesn't exist
   * - Updates if nodeId exists (with optional optimistic concurrency)
   * - Always increments revision
   */
  upsert(input: UpsertMasteryStateInput): Promise<UpsertMasteryStateResult>;

  /**
   * Batch upsert multiple states atomically
   */
  upsertBatch(
    inputs: readonly UpsertMasteryStateInput[],
  ): Promise<readonly UpsertMasteryStateResult[]>;

  /**
   * Soft-delete a mastery state
   */
  delete(nodeId: NodeId, granularity: MasteryGranularity): Promise<boolean>;

  // ---------------------------------------------------------------------------
  // READ OPERATIONS - Single Record
  // ---------------------------------------------------------------------------

  /**
   * Get the current mastery state for a node
   */
  get(
    nodeId: NodeId,
    granularity: MasteryGranularity,
  ): Promise<MasteryStateRecord | null>;

  /**
   * Get mastery states for multiple nodes
   */
  getMany(
    nodeIds: readonly NodeId[],
    granularity: MasteryGranularity,
  ): Promise<readonly MasteryStateRecord[]>;

  /**
   * Check if a mastery state exists for a node
   */
  exists(nodeId: NodeId, granularity: MasteryGranularity): Promise<boolean>;

  // ---------------------------------------------------------------------------
  // READ OPERATIONS - Queries
  // ---------------------------------------------------------------------------

  /**
   * Query mastery states with filters
   */
  query(options: MasteryStateQueryOptions): Promise<MasteryStateQueryResult>;

  /**
   * Get all mastery states for a specific granularity
   */
  getByGranularity(
    granularity: MasteryGranularity,
    options?: Omit<MasteryStateQueryOptions, "granularity">,
  ): Promise<MasteryStateQueryResult>;

  /**
   * Get states due for review (retrievability below threshold)
   */
  getDueStates(
    threshold: NormalizedValue,
    options?: Omit<MasteryStateQueryOptions, "maxRetrievability">,
  ): Promise<MasteryStateQueryResult>;

  /**
   * Get states that need recomputation (stale)
   */
  getStaleStates(
    maxAge: number, // days
    options?: Omit<MasteryStateQueryOptions, "maxDaysSinceUpdate">,
  ): Promise<MasteryStateQueryResult>;

  // ---------------------------------------------------------------------------
  // REVISION HISTORY
  // ---------------------------------------------------------------------------

  /**
   * Get revision history for a node
   */
  getRevisions(
    nodeId: NodeId,
    granularity: MasteryGranularity,
    options?: { limit?: number; offset?: number },
  ): Promise<readonly MasteryStateRevision[]>;

  /**
   * Get state at a specific revision
   */
  getAtRevision(
    nodeId: NodeId,
    granularity: MasteryGranularity,
    rev: RevisionNumber,
  ): Promise<MasteryState | null>;

  /**
   * Get the delta between two revisions
   */
  getDelta(
    nodeId: NodeId,
    granularity: MasteryGranularity,
    fromRev: RevisionNumber,
    toRev: RevisionNumber,
  ): Promise<MasteryStateDelta | null>;

  // ---------------------------------------------------------------------------
  // WATERMARKS & STATISTICS
  // ---------------------------------------------------------------------------

  /**
   * Get the current materialization watermark
   */
  getWatermark(): Promise<MaterializationWatermark>;

  /**
   * Update the materialization watermark
   */
  setWatermark(watermark: MaterializationWatermark): Promise<void>;

  /**
   * Get store statistics
   */
  getStatistics(): Promise<MasteryStoreStatistics>;

  // ---------------------------------------------------------------------------
  // BULK OPERATIONS
  // ---------------------------------------------------------------------------

  /**
   * Clear all mastery states (for testing/reset)
   */
  clear(): Promise<void>;

  /**
   * Export all states (for backup/migration)
   */
  exportAll(): Promise<readonly MasteryStateRecord[]>;

  /**
   * Import states (for restore/migration)
   */
  importAll(records: readonly MasteryStateRecord[]): Promise<void>;
}

// =============================================================================
// FACTORY TYPE
// =============================================================================

/**
 * Options for creating a MasteryStateStore
 */
export interface MasteryStateStoreOptions {
  /** Initial watermark (optional) */
  readonly initialWatermark?: MaterializationWatermark;
}
