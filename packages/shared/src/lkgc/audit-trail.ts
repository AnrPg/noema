// =============================================================================
// AUDIT TRAIL - Immutable Record of All Derived State
// =============================================================================
// Every derived feature MUST be traceable back to:
// - Contributing event IDs
// - Aggregation window
// - Transformation rule
//
// This enables:
// - DecisionRationale generation
// - Counterfactual explanations
// - Debugging and replay
// - Compliance and auditing
// =============================================================================

import type { EntityId, EventId, Timestamp } from "../types/lkgc/foundation";
import type { FeatureGranularity } from "../types/lkgc/aggregation";
import type { FeatureWindow } from "./feature-store";

// =============================================================================
// AUDIT RECORD TYPES
// =============================================================================

/**
 * Types of auditable operations
 */
export type AuditOperationType =
  | "event_ingested" // Raw event was added
  | "event_validated" // Event passed validation
  | "event_rejected" // Event failed validation
  | "feature_computed" // Feature was derived
  | "feature_invalidated" // Feature was invalidated
  | "feature_recomputed" // Feature was recomputed
  | "state_updated" // State was updated (future)
  | "snapshot_created" // AI snapshot was created (future)
  | "proposal_generated" // AI proposal was generated (future)
  | "proposal_applied"; // Proposal was applied (future)

/**
 * Base audit record
 */
export interface BaseAuditRecord {
  /** Unique audit record ID */
  readonly auditId: EntityId;

  /** Type of operation */
  readonly operationType: AuditOperationType;

  /** When this operation occurred */
  readonly timestamp: Timestamp;

  /** Who/what initiated the operation */
  readonly initiator: AuditInitiator;

  /** Duration of the operation (ms) */
  readonly duration: number;

  /** Whether the operation succeeded */
  readonly success: boolean;

  /** Error message if failed */
  readonly errorMessage?: string;
}

/**
 * Who initiated an auditable operation
 */
export interface AuditInitiator {
  /** Type of initiator */
  readonly type: "system" | "user" | "plugin" | "ai" | "scheduler";

  /** Identifier (user ID, plugin ID, etc.) */
  readonly id: string;

  /** Additional context */
  readonly context?: string;
}

// =============================================================================
// SPECIFIC AUDIT RECORDS
// =============================================================================

/**
 * Audit record for event ingestion
 */
export interface EventIngestedAudit extends BaseAuditRecord {
  readonly operationType: "event_ingested";

  /** The event that was ingested */
  readonly eventId: EventId;

  /** Event category */
  readonly eventCategory: string;

  /** Event type */
  readonly eventType: string;

  /** Assigned sequence number */
  readonly sequenceNumber: number;

  /** Event hash for integrity */
  readonly eventHash: string;
}

/**
 * Audit record for event validation
 */
export interface EventValidatedAudit extends BaseAuditRecord {
  readonly operationType: "event_validated" | "event_rejected";

  /** The event that was validated */
  readonly eventId: EventId;

  /** Validation rules that were applied */
  readonly rulesApplied: readonly string[];

  /** Validation issues found */
  readonly issues: readonly {
    readonly code: string;
    readonly severity: string;
    readonly message: string;
  }[];
}

/**
 * Audit record for feature computation
 */
export interface FeatureComputedAudit extends BaseAuditRecord {
  readonly operationType: "feature_computed" | "feature_recomputed";

  /** The feature that was computed */
  readonly featureId: EntityId;

  /** Feature granularity */
  readonly granularity: FeatureGranularity;

  /** Aggregation window */
  readonly window: FeatureWindow;

  /** Source event IDs */
  readonly sourceEventIds: readonly EventId[];

  /** Number of events processed */
  readonly eventsProcessed: number;

  /** Transformation rule used */
  readonly ruleId: string;

  /** Rule version */
  readonly ruleVersion: number;
}

/**
 * Audit record for feature invalidation
 */
export interface FeatureInvalidatedAudit extends BaseAuditRecord {
  readonly operationType: "feature_invalidated";

  /** The feature that was invalidated */
  readonly featureId: EntityId;

  /** Reason for invalidation */
  readonly reason: string;

  /** Event that triggered invalidation (if any) */
  readonly triggeringEventId?: EventId;
}

/**
 * Union of all audit record types
 */
export type AuditRecord =
  | EventIngestedAudit
  | EventValidatedAudit
  | FeatureComputedAudit
  | FeatureInvalidatedAudit;

// =============================================================================
// DERIVATION CHAIN - Tracing features back to events
// =============================================================================

/**
 * A link in the derivation chain
 */
export interface DerivationLink {
  /** From entity (event or feature) */
  readonly from: EntityId;

  /** From entity type */
  readonly fromType: "event" | "feature";

  /** To entity (feature or state) */
  readonly to: EntityId;

  /** To entity type */
  readonly toType: "feature" | "state" | "snapshot";

  /** When this link was created */
  readonly createdAt: Timestamp;

  /** Transformation that created this link */
  readonly transformation: string;
}

/**
 * Complete derivation chain for a feature/state
 */
export interface DerivationChain {
  /** The target entity being traced */
  readonly targetId: EntityId;

  /** Target entity type */
  readonly targetType: "feature" | "state" | "snapshot";

  /** All links in the chain */
  readonly links: readonly DerivationLink[];

  /** Root events (leaves of the chain) */
  readonly rootEventIds: readonly EventId[];

  /** Total depth of the chain */
  readonly depth: number;
}

// =============================================================================
// AUDIT TRAIL INTERFACE
// =============================================================================

/**
 * Query options for audit records
 */
export interface AuditQueryOptions {
  /** Filter by operation type */
  readonly operationTypes?: readonly AuditOperationType[];

  /** Filter by time range */
  readonly timeRange?: {
    readonly start?: Timestamp;
    readonly end?: Timestamp;
  };

  /** Filter by entity ID */
  readonly entityId?: EntityId;

  /** Filter by success/failure */
  readonly success?: boolean;

  /** Maximum results */
  readonly limit?: number;

  /** Offset for pagination */
  readonly offset?: number;

  /** Sort order */
  readonly order?: "asc" | "desc";
}

/**
 * Result of an audit query
 */
export interface AuditQueryResult {
  /** Matching audit records */
  readonly records: readonly AuditRecord[];

  /** Total count */
  readonly totalCount: number;

  /** Whether there are more results */
  readonly hasMore: boolean;
}

/**
 * AuditTrail - Immutable audit log for all operations
 */
export interface AuditTrail {
  // -------------------------------------------------------------------------
  // WRITE OPERATIONS (append-only)
  // -------------------------------------------------------------------------

  /**
   * Record an event ingestion
   */
  recordEventIngested(
    eventId: EventId,
    eventCategory: string,
    eventType: string,
    sequenceNumber: number,
    eventHash: string,
    duration: number,
    initiator: AuditInitiator,
  ): Promise<EventIngestedAudit>;

  /**
   * Record event validation result
   */
  recordEventValidation(
    eventId: EventId,
    success: boolean,
    rulesApplied: readonly string[],
    issues: readonly { code: string; severity: string; message: string }[],
    duration: number,
    initiator: AuditInitiator,
  ): Promise<EventValidatedAudit>;

  /**
   * Record feature computation
   */
  recordFeatureComputed(
    featureId: EntityId,
    granularity: FeatureGranularity,
    window: FeatureWindow,
    sourceEventIds: readonly EventId[],
    ruleId: string,
    ruleVersion: number,
    duration: number,
    initiator: AuditInitiator,
    isRecomputation?: boolean,
  ): Promise<FeatureComputedAudit>;

  /**
   * Record feature invalidation
   */
  recordFeatureInvalidated(
    featureId: EntityId,
    reason: string,
    triggeringEventId: EventId | undefined,
    initiator: AuditInitiator,
  ): Promise<FeatureInvalidatedAudit>;

  // -------------------------------------------------------------------------
  // DERIVATION CHAIN OPERATIONS
  // -------------------------------------------------------------------------

  /**
   * Record a derivation link
   */
  recordDerivationLink(link: DerivationLink): Promise<void>;

  /**
   * Get the complete derivation chain for an entity
   */
  getDerivationChain(entityId: EntityId): Promise<DerivationChain>;

  /**
   * Get all entities derived from a source event
   */
  getDerivedEntities(eventId: EventId): Promise<readonly EntityId[]>;

  // -------------------------------------------------------------------------
  // READ OPERATIONS
  // -------------------------------------------------------------------------

  /**
   * Get an audit record by ID
   */
  getById(auditId: EntityId): Promise<AuditRecord | null>;

  /**
   * Query audit records
   */
  query(options: AuditQueryOptions): Promise<AuditQueryResult>;

  /**
   * Get audit records for a specific entity
   */
  getForEntity(entityId: EntityId): Promise<readonly AuditRecord[]>;

  // -------------------------------------------------------------------------
  // STATISTICS
  // -------------------------------------------------------------------------

  /**
   * Get audit statistics
   */
  getStatistics(): Promise<AuditStatistics>;
}

/**
 * Audit statistics
 */
export interface AuditStatistics {
  /** Total records */
  readonly totalRecords: number;

  /** Records by operation type */
  readonly byOperationType: Record<AuditOperationType, number>;

  /** Success rate */
  readonly successRate: number;

  /** Average operation duration by type (ms) */
  readonly avgDurationByType: Record<AuditOperationType, number>;

  /** Records in last 24 hours */
  readonly last24Hours: number;

  /** Records in last 7 days */
  readonly last7Days: number;
}

// =============================================================================
// EXPLAINABILITY HELPERS
// =============================================================================

/**
 * Generate an explanation for how a feature was derived
 */
export interface FeatureExplanation {
  /** The feature being explained */
  readonly featureId: EntityId;

  /** Human-readable summary */
  readonly summary: string;

  /** Events that contributed */
  readonly contributingEvents: readonly {
    readonly eventId: EventId;
    readonly eventType: string;
    readonly contribution: string;
  }[];

  /** Transformation applied */
  readonly transformation: {
    readonly ruleId: string;
    readonly description: string;
  };

  /** Aggregation window */
  readonly window: {
    readonly start: string; // ISO datetime
    readonly end: string;
    readonly label: string;
  };
}

/**
 * ExplanationGenerator - Creates explanations from audit data
 */
export interface ExplanationGenerator {
  /**
   * Generate explanation for a feature
   */
  explainFeature(featureId: EntityId): Promise<FeatureExplanation>;

  /**
   * Generate explanation for why a value changed
   */
  explainValueChange(
    entityId: EntityId,
    field: string,
    oldValue: unknown,
    newValue: unknown,
  ): Promise<string>;
}
