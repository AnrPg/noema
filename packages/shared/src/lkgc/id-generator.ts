// =============================================================================
// ID GENERATOR - Type-safe ID generation for LKGC entities
// =============================================================================
// Generates branded IDs that are:
// - Globally unique (UUIDv4 or similar)
// - Type-safe (can't mix event IDs with node IDs)
// - Sortable by creation time (optional prefix)
// =============================================================================

import type {
  EntityId,
  EventId,
  SessionId,
  NodeId,
  EdgeId,
  DeviceId,
  UserId,
  ProposalId,
  SnapshotId,
  Timestamp,
  RevisionNumber,
  Confidence,
  NormalizedValue,
  Duration,
} from "../types/lkgc/foundation";

// =============================================================================
// ID PREFIXES - For human readability
// =============================================================================

/**
 * Prefixes for different ID types
 */
export const ID_PREFIXES = {
  entity: "ent",
  event: "evt",
  session: "ses",
  node: "nod",
  edge: "edg",
  device: "dev",
  user: "usr",
  proposal: "prp",
  snapshot: "snp",
  feature: "fea",
  audit: "aud",
} as const;

// =============================================================================
// ID GENERATOR
// =============================================================================

/**
 * Generate a random UUID v4
 */
function generateUUID(): string {
  // Use crypto.randomUUID if available (Node 19+, modern browsers)
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback implementation
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a timestamp-prefixed ID (sortable)
 */
function generateSortableId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = generateUUID().replace(/-/g, "").slice(0, 12);
  return `${prefix}_${timestamp}_${random}`;
}

// =============================================================================
// TYPED ID GENERATORS
// =============================================================================

/**
 * Generate a new EntityId
 */
export function generateEntityId(): EntityId {
  return generateSortableId(ID_PREFIXES.entity) as EntityId;
}

/**
 * Generate a new EventId
 */
export function generateEventId(): EventId {
  return generateSortableId(ID_PREFIXES.event) as EventId;
}

/**
 * Generate a new SessionId
 */
export function generateSessionId(): SessionId {
  return generateSortableId(ID_PREFIXES.session) as SessionId;
}

/**
 * Generate a new NodeId
 */
export function generateNodeId(): NodeId {
  return generateSortableId(ID_PREFIXES.node) as NodeId;
}

/**
 * Generate a new EdgeId
 */
export function generateEdgeId(): EdgeId {
  return generateSortableId(ID_PREFIXES.edge) as EdgeId;
}

/**
 * Generate a new DeviceId
 */
export function generateDeviceId(): DeviceId {
  return generateSortableId(ID_PREFIXES.device) as DeviceId;
}

/**
 * Generate a new UserId
 */
export function generateUserId(): UserId {
  return generateSortableId(ID_PREFIXES.user) as UserId;
}

/**
 * Generate a new ProposalId
 */
export function generateProposalId(): ProposalId {
  return generateSortableId(ID_PREFIXES.proposal) as ProposalId;
}

/**
 * Generate a new SnapshotId
 */
export function generateSnapshotId(): SnapshotId {
  return generateSortableId(ID_PREFIXES.snapshot) as SnapshotId;
}

// =============================================================================
// VALUE CONSTRUCTORS - Create branded primitive types safely
// =============================================================================

/**
 * Create a Timestamp from a number or Date
 */
export function timestamp(value: number | Date): Timestamp {
  const ts = typeof value === "number" ? value : value.getTime();
  if (!Number.isFinite(ts) || ts < 0) {
    throw new Error(`Invalid timestamp: ${ts}`);
  }
  return ts as Timestamp;
}

/**
 * Get current timestamp
 */
export function now(): Timestamp {
  return Date.now() as Timestamp;
}

/**
 * Create a Duration from a number
 */
export function duration(ms: number): Duration {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new Error(`Invalid duration: ${ms}`);
  }
  return ms as Duration;
}

/**
 * Create a Confidence value (must be in [0, 1])
 */
export function confidence(value: number): Confidence {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Confidence must be in [0, 1], got: ${value}`);
  }
  return value as Confidence;
}

/**
 * Create a NormalizedValue (must be in [0, 1])
 */
export function normalized(value: number): NormalizedValue {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`NormalizedValue must be in [0, 1], got: ${value}`);
  }
  return value as NormalizedValue;
}

/**
 * Create a RevisionNumber (must be positive integer)
 */
export function revision(value: number): RevisionNumber {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `RevisionNumber must be a non-negative integer, got: ${value}`,
    );
  }
  return value as RevisionNumber;
}

// =============================================================================
// ID PARSING & VALIDATION
// =============================================================================

/**
 * Parse an ID to extract its prefix and components
 */
export function parseId(id: string): {
  prefix: string;
  timestamp?: number;
  random: string;
} {
  const parts = id.split("_");
  if (parts.length === 3) {
    return {
      prefix: parts[0],
      timestamp: parseInt(parts[1], 36),
      random: parts[2],
    };
  } else if (parts.length === 2) {
    return {
      prefix: parts[0],
      random: parts[1],
    };
  }
  return { prefix: "", random: id };
}

/**
 * Check if an ID has a specific prefix
 */
export function hasPrefix(id: string, prefix: string): boolean {
  return id.startsWith(`${prefix}_`);
}

/**
 * Validate that an ID looks correct for its type
 */
export function validateId(id: string, expectedPrefix: string): boolean {
  if (!hasPrefix(id, expectedPrefix)) return false;
  const parsed = parseId(id);
  return parsed.random.length >= 8;
}

// =============================================================================
// ID TYPE GUARDS
// =============================================================================

/**
 * Check if a string is a valid EventId
 */
export function isEventId(id: string): id is EventId {
  return validateId(id, ID_PREFIXES.event);
}

/**
 * Check if a string is a valid SessionId
 */
export function isSessionId(id: string): id is SessionId {
  return validateId(id, ID_PREFIXES.session);
}

/**
 * Check if a string is a valid NodeId
 */
export function isNodeId(id: string): id is NodeId {
  return validateId(id, ID_PREFIXES.node);
}

/**
 * Check if a string is a valid EdgeId
 */
export function isEdgeId(id: string): id is EdgeId {
  return validateId(id, ID_PREFIXES.edge);
}

// =============================================================================
// BATCH ID GENERATION
// =============================================================================

/**
 * Generate multiple IDs efficiently
 */
export function generateEventIds(count: number): readonly EventId[] {
  const ids: EventId[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(generateEventId());
  }
  return ids;
}

/**
 * Generate multiple node IDs efficiently
 */
export function generateNodeIds(count: number): readonly NodeId[] {
  const ids: NodeId[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(generateNodeId());
  }
  return ids;
}
