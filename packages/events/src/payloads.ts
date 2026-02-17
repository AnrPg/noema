/**
 * @noema/events - Payload Patterns
 *
 * Standard payload structures for different event types.
 * Use the appropriate pattern based on your event type.
 */

// ============================================================================
// Event Source
// ============================================================================

/**
 * Source of an action.
 */
export const EventSourceType = {
  USER: 'user',
  AGENT: 'agent',
  SYSTEM: 'system',
  IMPORT: 'import',
} as const;

export type EventSourceType =
  (typeof EventSourceType)[keyof typeof EventSourceType];

// ============================================================================
// Pattern 1: Created Payload
// ============================================================================

/**
 * Payload for *.created events.
 *
 * @typeParam TEntity - The entity type being created
 */
export interface CreatedPayload<TEntity> {
  /** Full or partial entity data */
  entity: TEntity;

  /** Who/what created the entity */
  source?: EventSourceType;

  /** ID of parent entity (if nested) */
  parentId?: string;

  /** Type of parent entity */
  parentType?: string;
}

// ============================================================================
// Pattern 2: Updated Payload
// ============================================================================

/**
 * Payload for *.updated events.
 *
 * @typeParam TChanges - Fields that can be changed
 */
export interface UpdatedPayload<TChanges> {
  /** Only the fields that changed */
  changes: TChanges;

  /** Previous values for changed fields */
  previousValues?: Partial<TChanges>;

  /** Entity version before update */
  previousVersion: number;

  /** Entity version after update */
  newVersion: number;

  /** When update occurred (ISO 8601) */
  updatedAt: string;

  /** Why the update was made */
  reason?: string;
}

// ============================================================================
// Pattern 3: Deleted Payload
// ============================================================================

/**
 * Payload for *.deleted events.
 *
 * @typeParam TSnapshot - Entity snapshot type (optional)
 */
export interface DeletedPayload<TSnapshot = unknown> {
  /** ID of deleted entity */
  deletedId: string;

  /** Type of deleted entity */
  deletedType: string;

  /** true: soft delete, false: hard delete */
  soft?: boolean;

  /** Why the entity was deleted */
  reason?: string;

  /** Complete entity before deletion (for potential restoration) */
  snapshot?: TSnapshot;
}

// ============================================================================
// Pattern 4: State Changed Payload
// ============================================================================

/**
 * Trigger for state change.
 */
export const StateTrigger = {
  USER: 'user',
  AGENT: 'agent',
  SYSTEM: 'system',
  TIMEOUT: 'timeout',
} as const;

export type StateTrigger = (typeof StateTrigger)[keyof typeof StateTrigger];

/**
 * Payload for *.state.changed events.
 *
 * @typeParam TState - The state enum/union type
 * @typeParam TContext - Additional context type
 */
export interface StateChangedPayload<TState extends string, TContext = unknown> {
  /** State before the change */
  previousState: TState;

  /** State after the change */
  newState: TState;

  /** Why state changed */
  reason?: string;

  /** What triggered the state change */
  triggeredBy?: StateTrigger;

  /** Additional context about the change */
  context?: TContext;
}

// ============================================================================
// Pattern 5: Telemetry Payload
// ============================================================================

/**
 * Payload for telemetry/analytics events.
 */
export interface TelemetryPayload {
  /** Event category (e.g., "engagement", "performance") */
  category: string;

  /** Action performed (e.g., "card_reviewed", "session_completed") */
  action: string;

  /** Additional label for grouping */
  label?: string;

  /** Numeric value associated with event */
  value?: number;

  /** Additional event properties */
  properties?: Record<string, unknown>;
}

// ============================================================================
// Pattern 6: Command Result Payload
// ============================================================================

/**
 * Payload for command completion events.
 *
 * @typeParam TResult - Command result type
 */
export interface CommandResultPayload<TResult = unknown> {
  /** Whether command succeeded */
  success: boolean;

  /** Command result data (if success) */
  result?: TResult;

  /** Error code (if failure) */
  errorCode?: string;

  /** Error message (if failure) */
  errorMessage?: string;

  /** Duration in milliseconds */
  durationMs: number;
}

// ============================================================================
// Pattern 7: Batch Payload
// ============================================================================

/**
 * Payload for batch operation events.
 *
 * @typeParam TItem - The item type in the batch
 */
export interface BatchPayload<TItem> {
  /** Total items in batch */
  totalItems: number;

  /** Successfully processed items */
  successCount: number;

  /** Failed items */
  failureCount: number;

  /** Items that succeeded */
  succeeded?: TItem[];

  /** Items that failed with reasons */
  failed?: Array<{ item: TItem; reason: string }>;
}
