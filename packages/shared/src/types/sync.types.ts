// =============================================================================
// OFFLINE-FIRST SYNC TYPES
// =============================================================================
// Types for client-server synchronization with conflict resolution
// Supports offline-first architecture with eventual consistency

import type { UserId, CardId, DeckId, ReviewId } from "./user.types";

// =============================================================================
// SYNC IDENTIFIERS
// =============================================================================

/** Unique identifier for a sync operation */
export type SyncId = string;

/** Unique identifier for a client device */
export type ClientId = string;

/** Vector clock entry for causal ordering */
export type VectorClock = Record<ClientId, number>;

// =============================================================================
// ENTITY TYPES
// =============================================================================

/**
 * Types of entities that can be synced
 */
export type SyncEntityType =
  | "card"
  | "deck"
  | "review"
  | "category"
  | "card_category_participation"
  | "contextual_annotation"
  | "emphasis_rule"
  | "multi_context_performance"
  | "study_session"
  | "user_settings";

/**
 * Operations that can be performed on entities
 */
export type SyncOperation = "create" | "update" | "delete";

// =============================================================================
// CHANGE TRACKING
// =============================================================================

/**
 * A tracked change for synchronization
 */
export interface SyncChange {
  readonly id: string;
  readonly entityType: SyncEntityType;
  readonly entityId: string;
  readonly operation: SyncOperation;
  readonly timestamp: Date;
  readonly clientId: ClientId;
  readonly userId: UserId;
  readonly version: number;
  readonly vectorClock: VectorClock;
  readonly data: unknown;
  readonly checksum: string;
  readonly parentVersion: number | null;
  readonly conflictResolutionHint?: ConflictHint;
}

/**
 * Hint for automatic conflict resolution
 */
export interface ConflictHint {
  readonly strategy: ConflictResolutionStrategy;
  readonly priority: number;
  readonly preserveFields?: readonly string[];
}

/**
 * Strategy for resolving conflicts
 */
export type ConflictResolutionStrategy =
  | "local_wins" // Always prefer local changes
  | "remote_wins" // Always prefer server changes
  | "latest_wins" // Use most recent timestamp
  | "merge" // Attempt field-level merge
  | "manual"; // Require user intervention

// =============================================================================
// CONFLICT DETECTION
// =============================================================================

/**
 * A detected sync conflict
 */
export interface SyncConflict {
  readonly id: string;
  readonly entityType: SyncEntityType;
  readonly entityId: string;
  readonly localChange: SyncChange;
  readonly remoteChange: SyncChange;
  readonly baseVersion: SyncChange | null;
  readonly conflictType: ConflictType;
  readonly severity: ConflictSeverity;
  readonly autoResolvable: boolean;
  readonly suggestedResolution: ConflictResolutionStrategy;
  readonly detectedAt: Date;
}

/**
 * Types of conflicts
 */
export type ConflictType =
  | "concurrent_update" // Same entity updated on both sides
  | "update_delete" // Updated locally, deleted remotely
  | "delete_update" // Deleted locally, updated remotely
  | "create_create" // Same entity created on both sides
  | "parent_deleted" // Parent entity was deleted
  | "constraint_violation"; // Would violate DB constraints

/**
 * Severity of conflicts
 */
export type ConflictSeverity = "critical" | "high" | "medium" | "low";

// =============================================================================
// CONFLICT RESOLUTION
// =============================================================================

/**
 * Result of conflict resolution
 */
export interface ResolvedConflict {
  readonly conflictId: string;
  readonly resolution: ConflictResolutionStrategy;
  readonly resultingChange: SyncChange;
  readonly mergeDetails: MergeDetails | null;
  readonly resolvedAt: Date;
  readonly resolvedBy: "auto" | "user" | "plugin";
  readonly requiresReview: boolean;
}

/**
 * Details of a merge operation
 */
export interface MergeDetails {
  readonly fieldsFromLocal: readonly string[];
  readonly fieldsFromRemote: readonly string[];
  readonly mergedFields: readonly string[];
  readonly droppedChanges: readonly DroppedChange[];
}

/**
 * A change that was dropped during merge
 */
export interface DroppedChange {
  readonly field: string;
  readonly source: "local" | "remote";
  readonly value: unknown;
  readonly reason: string;
}

// =============================================================================
// SYNC SESSION
// =============================================================================

/**
 * A sync session between client and server
 */
export interface SyncSession {
  readonly id: SyncId;
  readonly clientId: ClientId;
  readonly userId: UserId;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly status: SyncStatus;
  readonly direction: SyncDirection;
  readonly stats: SyncStats;
  readonly errors: readonly SyncError[];
}

/**
 * Status of sync session
 */
export type SyncStatus =
  | "pending"
  | "in_progress"
  | "resolving_conflicts"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Direction of sync
 */
export type SyncDirection = "push" | "pull" | "bidirectional";

/**
 * Statistics for sync session
 */
export interface SyncStats {
  readonly totalChanges: number;
  readonly uploaded: number;
  readonly downloaded: number;
  readonly conflictsDetected: number;
  readonly conflictsResolved: number;
  readonly conflictsPending: number;
  readonly bytesTransferred: number;
  readonly duration: number;
}

/**
 * Sync error
 */
export interface SyncError {
  readonly code: SyncErrorCode;
  readonly message: string;
  readonly entityType?: SyncEntityType;
  readonly entityId?: string;
  readonly recoverable: boolean;
  readonly timestamp: Date;
}

/**
 * Error codes for sync
 */
export type SyncErrorCode =
  | "NETWORK_ERROR"
  | "AUTH_ERROR"
  | "VALIDATION_ERROR"
  | "CONFLICT_ERROR"
  | "CONSTRAINT_ERROR"
  | "VERSION_MISMATCH"
  | "QUOTA_EXCEEDED"
  | "SERVER_ERROR"
  | "CLIENT_ERROR"
  | "UNKNOWN_ERROR";

// =============================================================================
// SYNC REQUESTS & RESPONSES
// =============================================================================

/**
 * Request to push changes to server
 */
export interface SyncPushRequest {
  readonly clientId: ClientId;
  readonly lastSyncVersion: number;
  readonly vectorClock: VectorClock;
  readonly changes: readonly SyncChange[];
  readonly deviceInfo: DeviceInfo;
}

/**
 * Response from push operation
 */
export interface SyncPushResponse {
  readonly sessionId: SyncId;
  readonly accepted: readonly AcceptedChange[];
  readonly rejected: readonly RejectedChange[];
  readonly conflicts: readonly SyncConflict[];
  readonly serverVersion: number;
  readonly serverVectorClock: VectorClock;
}

/**
 * Request to pull changes from server
 */
export interface SyncPullRequest {
  readonly clientId: ClientId;
  readonly lastSyncVersion: number;
  readonly vectorClock: VectorClock;
  readonly entityTypes?: readonly SyncEntityType[];
  readonly since?: Date;
  readonly limit?: number;
}

/**
 * Response from pull operation
 */
export interface SyncPullResponse {
  readonly sessionId: SyncId;
  readonly changes: readonly SyncChange[];
  readonly hasMore: boolean;
  readonly serverVersion: number;
  readonly serverVectorClock: VectorClock;
  readonly deletedEntities: readonly DeletedEntity[];
}

/**
 * Accepted change
 */
export interface AcceptedChange {
  readonly changeId: string;
  readonly entityId: string;
  readonly serverVersion: number;
  readonly processedAt: Date;
}

/**
 * Rejected change
 */
export interface RejectedChange {
  readonly changeId: string;
  readonly entityId: string;
  readonly reason: string;
  readonly errorCode: SyncErrorCode;
  readonly recoverable: boolean;
}

/**
 * Deleted entity notification
 */
export interface DeletedEntity {
  readonly entityType: SyncEntityType;
  readonly entityId: string;
  readonly deletedAt: Date;
  readonly deletedBy: UserId;
}

/**
 * Device info for sync
 */
export interface DeviceInfo {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly platform: "ios" | "android" | "web" | "desktop";
  readonly appVersion: string;
  readonly lastSyncAt: Date | null;
}

// =============================================================================
// SYNC STATE
// =============================================================================

/**
 * Client-side sync state
 */
export interface SyncState {
  readonly clientId: ClientId;
  readonly lastSyncVersion: number;
  readonly vectorClock: VectorClock;
  readonly lastSyncAt: Date | null;
  readonly pendingChanges: readonly SyncChange[];
  readonly unresolvedConflicts: readonly SyncConflict[];
  readonly syncStatus: ClientSyncStatus;
  readonly offlineDuration: number;
}

/**
 * Client sync status
 */
export type ClientSyncStatus =
  | "synced" // Fully up to date
  | "pending_push" // Has local changes to push
  | "pending_pull" // Server has changes to pull
  | "syncing" // Currently syncing
  | "conflict" // Has unresolved conflicts
  | "error" // Sync error
  | "offline"; // No network connection

// =============================================================================
// CHANGE LOG
// =============================================================================

/**
 * Entry in the change log
 */
export interface ChangeLogEntry {
  readonly id: string;
  readonly syncId: SyncId | null;
  readonly entityType: SyncEntityType;
  readonly entityId: string;
  readonly operation: SyncOperation;
  readonly timestamp: Date;
  readonly version: number;
  readonly userId: UserId;
  readonly clientId: ClientId;
  readonly dataBefore: unknown | null;
  readonly dataAfter: unknown | null;
  readonly synced: boolean;
  readonly syncedAt: Date | null;
}

// =============================================================================
// OFFLINE QUEUE
// =============================================================================

/**
 * Offline operation queue entry
 */
export interface OfflineQueueEntry {
  readonly id: string;
  readonly operation: OfflineOperation;
  readonly createdAt: Date;
  readonly retryCount: number;
  readonly lastAttemptAt: Date | null;
  readonly status: OfflineQueueStatus;
  readonly error: string | null;
}

/**
 * Offline operation
 */
export interface OfflineOperation {
  readonly type: "sync_push" | "sync_pull" | "api_call";
  readonly payload: unknown;
  readonly priority: number;
  readonly expiresAt: Date | null;
}

/**
 * Status of offline queue entry
 */
export type OfflineQueueStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "expired";

// =============================================================================
// SYNC CONFIGURATION
// =============================================================================

/**
 * Sync configuration options
 */
export interface SyncConfig {
  readonly autoSync: boolean;
  readonly syncInterval: number; // Milliseconds
  readonly maxBatchSize: number;
  readonly maxRetries: number;
  readonly retryBackoff: "linear" | "exponential";
  readonly conflictResolutionDefault: ConflictResolutionStrategy;
  readonly offlineQueueMaxAge: number; // Milliseconds
  readonly enableDeltaSync: boolean;
  readonly compressionEnabled: boolean;
}

/**
 * Default sync configuration
 */
export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  autoSync: true,
  syncInterval: 30000, // 30 seconds
  maxBatchSize: 100,
  maxRetries: 3,
  retryBackoff: "exponential",
  conflictResolutionDefault: "latest_wins",
  offlineQueueMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  enableDeltaSync: true,
  compressionEnabled: true,
};

// =============================================================================
// SYNC EVENTS
// =============================================================================

/**
 * Sync event types
 */
export type SyncEventType =
  | "sync:started"
  | "sync:progress"
  | "sync:completed"
  | "sync:failed"
  | "sync:conflict_detected"
  | "sync:conflict_resolved"
  | "sync:change_pushed"
  | "sync:change_pulled"
  | "sync:offline"
  | "sync:online";

/**
 * Base sync event
 */
export interface SyncEvent {
  readonly type: SyncEventType;
  readonly timestamp: Date;
  readonly sessionId: SyncId | null;
}

/**
 * Sync progress event
 */
export interface SyncProgressEvent extends SyncEvent {
  readonly type: "sync:progress";
  readonly progress: number; // 0-100
  readonly currentEntity: string;
  readonly processed: number;
  readonly total: number;
}

/**
 * Sync conflict event
 */
export interface SyncConflictEvent extends SyncEvent {
  readonly type: "sync:conflict_detected";
  readonly conflict: SyncConflict;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Compare two versions
 */
export function compareVersions(
  a: VectorClock,
  b: VectorClock,
): "before" | "after" | "concurrent" {
  let aBeforeB = false;
  let bBeforeA = false;

  const allClients = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const client of allClients) {
    const aVal = a[client] || 0;
    const bVal = b[client] || 0;

    if (aVal < bVal) aBeforeB = true;
    if (bVal < aVal) bBeforeA = true;
  }

  if (aBeforeB && !bBeforeA) return "before";
  if (bBeforeA && !aBeforeB) return "after";
  return "concurrent";
}

/**
 * Merge vector clocks
 */
export function mergeVectorClocks(a: VectorClock, b: VectorClock): VectorClock {
  const merged: Record<ClientId, number> = {};
  const allClients = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const client of allClients) {
    merged[client] = Math.max(a[client] || 0, b[client] || 0);
  }

  return merged;
}

/**
 * Increment vector clock for a client
 */
export function incrementVectorClock(
  clock: VectorClock,
  clientId: ClientId,
): VectorClock {
  return {
    ...clock,
    [clientId]: (clock[clientId] || 0) + 1,
  };
}

/**
 * Generate checksum for data
 */
export function generateChecksum(data: unknown): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
