/**
 * @noema/knowledge-graph-service - Misconception Repository Interface
 *
 * Repository for misconception pattern definitions, intervention templates,
 * and detection records. Pattern definitions are structured metadata authored
 * by curriculum designers; detection records track the lifecycle of
 * misconceptions found in individual users' PKGs.
 *
 * Pattern definitions and intervention templates live in PostgreSQL
 * (read frequently, written rarely). Detection runs against Neo4j
 * (checking graph structure), but the results are persisted in PostgreSQL.
 */

import type {
  InterventionId,
  InterventionType,
  Metadata,
  MisconceptionPatternId,
  MisconceptionStatus,
  MisconceptionType,
  NodeId,
  UserId,
} from '@noema/types';
import type { MisconceptionPatternKind } from '@noema/types';

// ============================================================================
// Pattern & Template Types
// ============================================================================

/**
 * A misconception pattern definition — describes how to detect a
 * specific misconception type in a knowledge graph.
 */
export interface IMisconceptionPattern {
  /** Unique pattern ID */
  readonly patternId: MisconceptionPatternId;

  /** Which misconception type this pattern detects */
  readonly misconceptionType: MisconceptionType;

  /** Detection mechanism category */
  readonly kind: MisconceptionPatternKind;

  /** Human-readable name */
  readonly name: string;

  /** Human-readable description */
  readonly description: string;

  /** Algorithm-specific configuration parameters */
  readonly config: Metadata;

  /** Minimum confidence threshold for detection */
  readonly threshold: number;

  /** Whether this pattern is currently active */
  active: boolean;

  /** When the pattern was created (ISO 8601) */
  readonly createdAt: string;

  /** When the pattern was last updated (ISO 8601) */
  updatedAt: string;
}

/**
 * An intervention template — a remediation strategy for a misconception type.
 */
export interface IInterventionTemplate {
  /** Unique template ID */
  readonly templateId: InterventionId;

  /** Which misconception type this intervention addresses */
  readonly misconceptionType: MisconceptionType;

  /** Type of remediation action */
  readonly interventionType: InterventionType;

  /** Human-readable name */
  readonly name: string;

  /** Human-readable description */
  readonly description: string;

  /** Template configuration (prompts, content structure, etc.) */
  readonly config: Metadata;

  /** Priority relative to other templates for the same misconception type */
  readonly priority: number;

  /** When the template was created (ISO 8601) */
  readonly createdAt: string;

  /** When the template was last updated (ISO 8601) */
  updatedAt: string;
}

/**
 * A detected misconception instance for a specific user.
 */
export interface IMisconceptionRecord {
  /** Unique detection ID */
  readonly id: string;

  /** User whose PKG contains this misconception */
  readonly userId: UserId;

  /** Pattern that detected this misconception */
  readonly patternId: MisconceptionPatternId;

  /** Which misconception type was detected */
  readonly misconceptionType: MisconceptionType;

  /** Node IDs affected by this misconception */
  readonly affectedNodeIds: readonly NodeId[];

  /** Detection confidence (0–1) */
  readonly confidence: number;

  /** Current lifecycle status */
  status: MisconceptionStatus;

  /** When detected (ISO 8601) */
  readonly detectedAt: string;

  /** When resolved (ISO 8601), null if unresolved */
  resolvedAt: string | null;
}

// ============================================================================
// Input Types
// ============================================================================

/**
 * Input for creating or updating a misconception pattern.
 */
export interface IUpsertPatternInput {
  readonly misconceptionType: MisconceptionType;
  readonly kind: MisconceptionPatternKind;
  readonly name: string;
  readonly description: string;
  readonly config: Metadata;
  readonly threshold: number;
  readonly active?: boolean;
}

/**
 * Input for creating or updating an intervention template.
 */
export interface IUpsertInterventionTemplateInput {
  readonly misconceptionType: MisconceptionType;
  readonly interventionType: InterventionType;
  readonly name: string;
  readonly description: string;
  readonly config: Metadata;
  readonly priority?: number;
}

/**
 * Input for recording a misconception detection.
 */
export interface IRecordDetectionInput {
  readonly userId: UserId;
  readonly patternId: MisconceptionPatternId;
  readonly misconceptionType: MisconceptionType;
  readonly affectedNodeIds: readonly NodeId[];
  readonly confidence: number;
}

// ============================================================================
// IMisconceptionRepository
// ============================================================================

/**
 * Repository for misconception patterns, intervention templates, and
 * detection records.
 */
export interface IMisconceptionRepository {
  // ── Pattern operations ────────────────────────────────────────────────

  /**
   * Get all currently active misconception patterns.
   */
  getActivePatterns(): Promise<IMisconceptionPattern[]>;

  /**
   * Get patterns by misconception type.
   */
  getPatternsByType(type: MisconceptionType): Promise<IMisconceptionPattern[]>;

  /**
   * Get a pattern by its ID.
   */
  getPatternById(patternId: MisconceptionPatternId): Promise<IMisconceptionPattern | null>;

  /**
   * Create or update a pattern definition.
   * If an ID is provided and exists, update; otherwise, create.
   */
  upsertPattern(
    input: IUpsertPatternInput,
    patternId?: MisconceptionPatternId
  ): Promise<IMisconceptionPattern>;

  // ── Intervention template operations ──────────────────────────────────

  /**
   * Get intervention templates for a misconception type, ordered by priority.
   */
  getInterventionTemplatesByType(type: MisconceptionType): Promise<IInterventionTemplate[]>;

  /**
   * Get an intervention template by ID.
   */
  getInterventionTemplateById(templateId: InterventionId): Promise<IInterventionTemplate | null>;

  /**
   * Create or update an intervention template.
   */
  upsertInterventionTemplate(
    input: IUpsertInterventionTemplateInput,
    templateId?: InterventionId
  ): Promise<IInterventionTemplate>;

  // ── Detection records ─────────────────────────────────────────────────

  /**
   * Record a new misconception detection.
   */
  recordDetection(input: IRecordDetectionInput): Promise<IMisconceptionRecord>;

  /**
   * Get active (non-resolved) misconceptions for a user.
   * @param domain Optional domain filter.
   */
  getActiveMisconceptions(userId: UserId, domain?: string): Promise<IMisconceptionRecord[]>;

  /**
   * Update a misconception's lifecycle status.
   * @param detectionId The detection record ID.
   * @param status New status.
   */
  updateMisconceptionStatus(
    detectionId: string,
    status: MisconceptionStatus
  ): Promise<IMisconceptionRecord>;
}
