/**
 * @noema/types - Branded ID Types
 *
 * Type-safe branded IDs with factory functions for runtime validation.
 * Each ID has a unique prefix for debugging and validation.
 *
 * Pattern: {entity}_{nanoid} e.g., user_abc123def456
 */

// ============================================================================
// Base Brand Symbol
// ============================================================================

declare const __brand: unique symbol;

/**
 * Creates a branded type from a base type.
 * The brand ensures type safety at compile time.
 */
export type Brand<T, TBrand extends string> = T & {
  readonly [__brand]: TBrand;
};

// ============================================================================
// Branded ID Types
// ============================================================================

/** User identifier - prefix: user_ */
export type UserId = Brand<string, 'UserId'>;

/** Card identifier - prefix: card_ */
export type CardId = Brand<string, 'CardId'>;

/** Deck identifier - prefix: deck_ */
export type DeckId = Brand<string, 'DeckId'>;

/** Category identifier - prefix: cat_ */
export type CategoryId = Brand<string, 'CategoryId'>;

/** Session identifier - prefix: sess_ */
export type SessionId = Brand<string, 'SessionId'>;

/** Attempt identifier - prefix: att_ */
export type AttemptId = Brand<string, 'AttemptId'>;

/** Trace identifier (thinking trace) - prefix: trace_ */
export type TraceId = Brand<string, 'TraceId'>;

/** Diagnosis identifier - prefix: diag_ */
export type DiagnosisId = Brand<string, 'DiagnosisId'>;

/** Patch identifier (remediation) - prefix: patch_ */
export type PatchId = Brand<string, 'PatchId'>;

/** Strategy loadout identifier - prefix: load_ */
export type LoadoutId = Brand<string, 'LoadoutId'>;

/** Knowledge graph node identifier - prefix: node_ */
export type NodeId = Brand<string, 'NodeId'>;

/** Knowledge graph edge identifier - prefix: edge_ */
export type EdgeId = Brand<string, 'EdgeId'>;

/** Achievement identifier - prefix: ach_ */
export type AchievementId = Brand<string, 'AchievementId'>;

/** Streak identifier - prefix: streak_ */
export type StreakId = Brand<string, 'StreakId'>;

/** Ingestion job identifier - prefix: job_ */
export type JobId = Brand<string, 'JobId'>;

/** Event identifier - prefix: evt_ */
export type EventId = Brand<string, 'EventId'>;

/** Correlation identifier for distributed tracing - prefix: cor_ */
export type CorrelationId = Brand<string, 'CorrelationId'>;

/** Causation identifier for event chains - prefix: caus_ */
export type CausationId = Brand<string, 'CausationId'>;

/** Tool identifier - prefix: tool_ */
export type ToolId = Brand<string, 'ToolId'>;

/** Agent identifier - prefix: agent_ */
export type AgentId = Brand<string, 'AgentId'>;

/** Media asset identifier - prefix: media_ */
export type MediaId = Brand<string, 'MediaId'>;

/** Notification identifier - prefix: notif_ */
export type NotificationId = Brand<string, 'NotificationId'>;

/** Collaboration room identifier - prefix: room_ */
export type RoomId = Brand<string, 'RoomId'>;

// ============================================================================
// ID Prefix Registry
// ============================================================================

/**
 * Registry of ID prefixes for validation.
 * Each branded ID type has a unique prefix.
 */
export const ID_PREFIXES = {
  UserId: 'user_',
  CardId: 'card_',
  DeckId: 'deck_',
  CategoryId: 'category_',
  SessionId: 'session_',
  AttemptId: 'attempt_',
  TraceId: 'trace_',
  DiagnosisId: 'diagnosis_',
  PatchId: 'patch_',
  LoadoutId: 'load_',
  NodeId: 'node_',
  EdgeId: 'edge_',
  AchievementId: 'achievement_',
  StreakId: 'streak_',
  JobId: 'job_',
  EventId: 'event_',
  CorrelationId: 'correlation_',
  CausationId: 'causation_',
  ToolId: 'tool_',
  AgentId: 'agent_',
  MediaId: 'media_',
  NotificationId: 'notification_',
  RoomId: 'room_',
} as const;

export type IdPrefix = (typeof ID_PREFIXES)[keyof typeof ID_PREFIXES];

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Validates an ID string has the correct prefix and minimum length.
 */
function validateIdFormat(value: string, prefix: string): boolean {
  return (
    typeof value === 'string' && value.startsWith(prefix) && value.length > prefix.length + 5 // prefix + at least 6 chars
  );
}

/**
 * Creates a branded ID with validation.
 * Throws if the value doesn't match the expected format.
 */
function createId<T extends string>(
  value: string,
  prefix: string,
  typeName: string
): Brand<string, T> {
  if (!validateIdFormat(value, prefix)) {
    throw new Error(
      `Invalid ${typeName}: must start with "${prefix}" and have at least 6 characters after prefix. Got: "${value}"`
    );
  }
  return value as Brand<string, T>;
}

/**
 * Type guard to check if a value is a valid branded ID.
 */
function isValidId(value: unknown, prefix: string): value is string {
  return typeof value === 'string' && validateIdFormat(value, prefix);
}

// User ID
export const UserId = {
  create: (value: string): UserId => createId<'UserId'>(value, ID_PREFIXES.UserId, 'UserId'),
  isValid: (value: unknown): value is UserId => isValidId(value, ID_PREFIXES.UserId),
  prefix: ID_PREFIXES.UserId,
} as const;

// Card ID
export const CardId = {
  create: (value: string): CardId => createId<'CardId'>(value, ID_PREFIXES.CardId, 'CardId'),
  isValid: (value: unknown): value is CardId => isValidId(value, ID_PREFIXES.CardId),
  prefix: ID_PREFIXES.CardId,
} as const;

// Deck ID
export const DeckId = {
  create: (value: string): DeckId => createId<'DeckId'>(value, ID_PREFIXES.DeckId, 'DeckId'),
  isValid: (value: unknown): value is DeckId => isValidId(value, ID_PREFIXES.DeckId),
  prefix: ID_PREFIXES.DeckId,
} as const;

// Category ID
export const CategoryId = {
  create: (value: string): CategoryId =>
    createId<'CategoryId'>(value, ID_PREFIXES.CategoryId, 'CategoryId'),
  isValid: (value: unknown): value is CategoryId => isValidId(value, ID_PREFIXES.CategoryId),
  prefix: ID_PREFIXES.CategoryId,
} as const;

// Session ID
export const SessionId = {
  create: (value: string): SessionId =>
    createId<'SessionId'>(value, ID_PREFIXES.SessionId, 'SessionId'),
  isValid: (value: unknown): value is SessionId => isValidId(value, ID_PREFIXES.SessionId),
  prefix: ID_PREFIXES.SessionId,
} as const;

// Attempt ID
export const AttemptId = {
  create: (value: string): AttemptId =>
    createId<'AttemptId'>(value, ID_PREFIXES.AttemptId, 'AttemptId'),
  isValid: (value: unknown): value is AttemptId => isValidId(value, ID_PREFIXES.AttemptId),
  prefix: ID_PREFIXES.AttemptId,
} as const;

// Trace ID
export const TraceId = {
  create: (value: string): TraceId => createId<'TraceId'>(value, ID_PREFIXES.TraceId, 'TraceId'),
  isValid: (value: unknown): value is TraceId => isValidId(value, ID_PREFIXES.TraceId),
  prefix: ID_PREFIXES.TraceId,
} as const;

// Diagnosis ID
export const DiagnosisId = {
  create: (value: string): DiagnosisId =>
    createId<'DiagnosisId'>(value, ID_PREFIXES.DiagnosisId, 'DiagnosisId'),
  isValid: (value: unknown): value is DiagnosisId => isValidId(value, ID_PREFIXES.DiagnosisId),
  prefix: ID_PREFIXES.DiagnosisId,
} as const;

// Patch ID
export const PatchId = {
  create: (value: string): PatchId => createId<'PatchId'>(value, ID_PREFIXES.PatchId, 'PatchId'),
  isValid: (value: unknown): value is PatchId => isValidId(value, ID_PREFIXES.PatchId),
  prefix: ID_PREFIXES.PatchId,
} as const;

// Loadout ID
export const LoadoutId = {
  create: (value: string): LoadoutId =>
    createId<'LoadoutId'>(value, ID_PREFIXES.LoadoutId, 'LoadoutId'),
  isValid: (value: unknown): value is LoadoutId => isValidId(value, ID_PREFIXES.LoadoutId),
  prefix: ID_PREFIXES.LoadoutId,
} as const;

// Node ID
export const NodeId = {
  create: (value: string): NodeId => createId<'NodeId'>(value, ID_PREFIXES.NodeId, 'NodeId'),
  isValid: (value: unknown): value is NodeId => isValidId(value, ID_PREFIXES.NodeId),
  prefix: ID_PREFIXES.NodeId,
} as const;

// Edge ID
export const EdgeId = {
  create: (value: string): EdgeId => createId<'EdgeId'>(value, ID_PREFIXES.EdgeId, 'EdgeId'),
  isValid: (value: unknown): value is EdgeId => isValidId(value, ID_PREFIXES.EdgeId),
  prefix: ID_PREFIXES.EdgeId,
} as const;

// Achievement ID
export const AchievementId = {
  create: (value: string): AchievementId =>
    createId<'AchievementId'>(value, ID_PREFIXES.AchievementId, 'AchievementId'),
  isValid: (value: unknown): value is AchievementId => isValidId(value, ID_PREFIXES.AchievementId),
  prefix: ID_PREFIXES.AchievementId,
} as const;

// Streak ID
export const StreakId = {
  create: (value: string): StreakId =>
    createId<'StreakId'>(value, ID_PREFIXES.StreakId, 'StreakId'),
  isValid: (value: unknown): value is StreakId => isValidId(value, ID_PREFIXES.StreakId),
  prefix: ID_PREFIXES.StreakId,
} as const;

// Job ID
export const JobId = {
  create: (value: string): JobId => createId<'JobId'>(value, ID_PREFIXES.JobId, 'JobId'),
  isValid: (value: unknown): value is JobId => isValidId(value, ID_PREFIXES.JobId),
  prefix: ID_PREFIXES.JobId,
} as const;

// Event ID
export const EventId = {
  create: (value: string): EventId => createId<'EventId'>(value, ID_PREFIXES.EventId, 'EventId'),
  isValid: (value: unknown): value is EventId => isValidId(value, ID_PREFIXES.EventId),
  prefix: ID_PREFIXES.EventId,
} as const;

// Correlation ID
export const CorrelationId = {
  create: (value: string): CorrelationId =>
    createId<'CorrelationId'>(value, ID_PREFIXES.CorrelationId, 'CorrelationId'),
  isValid: (value: unknown): value is CorrelationId => isValidId(value, ID_PREFIXES.CorrelationId),
  prefix: ID_PREFIXES.CorrelationId,
} as const;

// Causation ID
export const CausationId = {
  create: (value: string): CausationId =>
    createId<'CausationId'>(value, ID_PREFIXES.CausationId, 'CausationId'),
  isValid: (value: unknown): value is CausationId => isValidId(value, ID_PREFIXES.CausationId),
  prefix: ID_PREFIXES.CausationId,
} as const;

// Tool ID
export const ToolId = {
  create: (value: string): ToolId => createId<'ToolId'>(value, ID_PREFIXES.ToolId, 'ToolId'),
  isValid: (value: unknown): value is ToolId => isValidId(value, ID_PREFIXES.ToolId),
  prefix: ID_PREFIXES.ToolId,
} as const;

// Agent ID
export const AgentId = {
  create: (value: string): AgentId => createId<'AgentId'>(value, ID_PREFIXES.AgentId, 'AgentId'),
  isValid: (value: unknown): value is AgentId => isValidId(value, ID_PREFIXES.AgentId),
  prefix: ID_PREFIXES.AgentId,
} as const;

// Media ID
export const MediaId = {
  create: (value: string): MediaId => createId<'MediaId'>(value, ID_PREFIXES.MediaId, 'MediaId'),
  isValid: (value: unknown): value is MediaId => isValidId(value, ID_PREFIXES.MediaId),
  prefix: ID_PREFIXES.MediaId,
} as const;

// Notification ID
export const NotificationId = {
  create: (value: string): NotificationId =>
    createId<'NotificationId'>(value, ID_PREFIXES.NotificationId, 'NotificationId'),
  isValid: (value: unknown): value is NotificationId =>
    isValidId(value, ID_PREFIXES.NotificationId),
  prefix: ID_PREFIXES.NotificationId,
} as const;

// Room ID
export const RoomId = {
  create: (value: string): RoomId => createId<'RoomId'>(value, ID_PREFIXES.RoomId, 'RoomId'),
  isValid: (value: unknown): value is RoomId => isValidId(value, ID_PREFIXES.RoomId),
  prefix: ID_PREFIXES.RoomId,
} as const;

// ============================================================================
// Union Types for Generic Handling
// ============================================================================

/**
 * Union of all branded ID types for generic handling.
 */
export type AnyBrandedId =
  | UserId
  | CardId
  | DeckId
  | CategoryId
  | SessionId
  | AttemptId
  | TraceId
  | DiagnosisId
  | PatchId
  | LoadoutId
  | NodeId
  | EdgeId
  | AchievementId
  | StreakId
  | JobId
  | EventId
  | CorrelationId
  | CausationId
  | ToolId
  | AgentId
  | MediaId
  | NotificationId
  | RoomId;

/**
 * Map of ID type names to their prefixes.
 */
export type IdTypeName = keyof typeof ID_PREFIXES;
