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

/**
 * Deck query log identifier - prefix: deck_
 * TODO: To be used in future implementation of DeckQueryLog — an append-only log
 * that records deck query executions (filters, resolved card IDs, timestamps)
 * for analytics, reproducibility, and potential session replay. Decks are not
 * persisted entities; they are dynamic queries on the card archive + knowledge graph.
 */
export type DeckQueryLogId = Brand<string, 'DeckQueryLogId'>;

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

/** Template identifier - prefix: tmpl_ */
export type TemplateId = Brand<string, 'TemplateId'>;

/** Media asset identifier - prefix: media_ */
export type MediaId = Brand<string, 'MediaId'>;

/** Notification identifier - prefix: notif_ */
export type NotificationId = Brand<string, 'NotificationId'>;

/** Collaboration room identifier - prefix: room_ */
export type RoomId = Brand<string, 'RoomId'>;

/** Card schedule identifier - prefix: sched_ */
export type ScheduleId = Brand<string, 'ScheduleId'>;

/** Review log entry identifier - prefix: rlog_ */
export type ReviewLogId = Brand<string, 'ReviewLogId'>;

/** Algorithm configuration identifier - prefix: algcfg_ */
export type AlgorithmConfigId = Brand<string, 'AlgorithmConfigId'>;

/** CKG mutation lifecycle identifier - prefix: mut_ */
export type MutationId = Brand<string, 'MutationId'>;

/** Misconception detection pattern identifier - prefix: mpat_ */
export type MisconceptionPatternId = Brand<string, 'MisconceptionPatternId'>;

/** Remediation intervention identifier - prefix: intv_ */
export type InterventionId = Brand<string, 'InterventionId'>;

/**
 * Identity of whoever proposes a CKG mutation.
 *
 * CKG mutations can be proposed by either an AI agent (AgentId) or a
 * platform administrator (UserId with admin role). This union type is
 * used in `ICkgMutation.proposedBy`, `ICreateMutationInput.proposedBy`,
 * and pipeline/repository filter parameters.
 *
 * At runtime the value is a plain string with either the `agent_` or
 * `user_` prefix — consumers can inspect the prefix to determine the
 * proposer kind.
 */
export type ProposerId = AgentId | UserId;

/**
 * Utilities for the `ProposerId` union type.
 */
export const ProposerId = {
  /** Check whether a ProposerId represents an agent. */
  isAgent(id: ProposerId): id is AgentId {
    return typeof id === 'string' && id.startsWith(ID_PREFIXES.AgentId);
  },

  /** Check whether a ProposerId represents an admin user. */
  isUser(id: ProposerId): id is UserId {
    return typeof id === 'string' && id.startsWith(ID_PREFIXES.UserId);
  },

  /** Validate that a string is a valid ProposerId (agent_ or user_ prefix). */
  isValid(value: unknown): value is ProposerId {
    return AgentId.isValid(value) || UserId.isValid(value);
  },
} as const;

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
  DeckQueryLogId: 'deck_',
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
  TemplateId: 'tmpl_',
  MediaId: 'media_',
  NotificationId: 'notification_',
  RoomId: 'room_',
  ScheduleId: 'sched_',
  ReviewLogId: 'rlog_',
  AlgorithmConfigId: 'algcfg_',
  MutationId: 'mut_',
  MisconceptionPatternId: 'mpat_',
  InterventionId: 'intv_',
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

// Deck Query Log ID
export const DeckQueryLogId = {
  create: (value: string): DeckQueryLogId =>
    createId<'DeckQueryLogId'>(value, ID_PREFIXES.DeckQueryLogId, 'DeckQueryLogId'),
  isValid: (value: unknown): value is DeckQueryLogId =>
    isValidId(value, ID_PREFIXES.DeckQueryLogId),
  prefix: ID_PREFIXES.DeckQueryLogId,
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

// Template ID
export const TemplateId = {
  create: (value: string): TemplateId =>
    createId<'TemplateId'>(value, ID_PREFIXES.TemplateId, 'TemplateId'),
  isValid: (value: unknown): value is TemplateId => isValidId(value, ID_PREFIXES.TemplateId),
  prefix: ID_PREFIXES.TemplateId,
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

// Schedule ID
export const ScheduleId = {
  create: (value: string): ScheduleId =>
    createId<'ScheduleId'>(value, ID_PREFIXES.ScheduleId, 'ScheduleId'),
  isValid: (value: unknown): value is ScheduleId => isValidId(value, ID_PREFIXES.ScheduleId),
  prefix: ID_PREFIXES.ScheduleId,
} as const;

// Review Log ID
export const ReviewLogId = {
  create: (value: string): ReviewLogId =>
    createId<'ReviewLogId'>(value, ID_PREFIXES.ReviewLogId, 'ReviewLogId'),
  isValid: (value: unknown): value is ReviewLogId => isValidId(value, ID_PREFIXES.ReviewLogId),
  prefix: ID_PREFIXES.ReviewLogId,
} as const;

// Algorithm Config ID
export const AlgorithmConfigId = {
  create: (value: string): AlgorithmConfigId =>
    createId<'AlgorithmConfigId'>(value, ID_PREFIXES.AlgorithmConfigId, 'AlgorithmConfigId'),
  isValid: (value: unknown): value is AlgorithmConfigId =>
    isValidId(value, ID_PREFIXES.AlgorithmConfigId),
  prefix: ID_PREFIXES.AlgorithmConfigId,
} as const;

// Mutation ID
export const MutationId = {
  create: (value: string): MutationId =>
    createId<'MutationId'>(value, ID_PREFIXES.MutationId, 'MutationId'),
  isValid: (value: unknown): value is MutationId => isValidId(value, ID_PREFIXES.MutationId),
  prefix: ID_PREFIXES.MutationId,
} as const;

// Misconception Pattern ID
export const MisconceptionPatternId = {
  create: (value: string): MisconceptionPatternId =>
    createId<'MisconceptionPatternId'>(
      value,
      ID_PREFIXES.MisconceptionPatternId,
      'MisconceptionPatternId'
    ),
  isValid: (value: unknown): value is MisconceptionPatternId =>
    isValidId(value, ID_PREFIXES.MisconceptionPatternId),
  prefix: ID_PREFIXES.MisconceptionPatternId,
} as const;

// Intervention ID
export const InterventionId = {
  create: (value: string): InterventionId =>
    createId<'InterventionId'>(value, ID_PREFIXES.InterventionId, 'InterventionId'),
  isValid: (value: unknown): value is InterventionId =>
    isValidId(value, ID_PREFIXES.InterventionId),
  prefix: ID_PREFIXES.InterventionId,
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
  | DeckQueryLogId
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
  | TemplateId
  | MediaId
  | NotificationId
  | RoomId
  | ScheduleId
  | ReviewLogId
  | AlgorithmConfigId
  | MutationId
  | MisconceptionPatternId
  | InterventionId;

/**
 * Map of ID type names to their prefixes.
 */
export type IdTypeName = keyof typeof ID_PREFIXES;
