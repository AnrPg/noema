// =============================================================================
// MARKDOWN MIRROR TYPES - Type Definitions for Obsidian Sync Layer
// =============================================================================
// Defines types for the bidirectional Markdown mirror that projects LKGC's
// knowledge graph to Obsidian-compatible Markdown files.
//
// Core principles:
// - LKGC remains the source of truth
// - Markdown is a mirror, not the canonical store
// - All imports are treated as content operations with provenance
// - Graph integrity, identity, and revisioning must be preserved
//
// NO UI. NO AI. NO SCHEDULING.
// =============================================================================

import type {
  NodeId,
  EdgeId,
  UserId,
  Timestamp,
  Duration,
  Confidence,
  RevisionNumber,
  PrivacyLevel,
  DataSource,
} from "../../types/lkgc/foundation";
import type { NodeType } from "../../types/lkgc/nodes";
import type { EdgeType } from "../../types/lkgc/edges";

// =============================================================================
// BRANDED TYPES
// =============================================================================

declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

/** Unique identifier for a markdown file in the mirror */
export type MarkdownFileId = Brand<string, "MarkdownFileId">;

/** Content hash for change detection */
export type ContentHash = Brand<string, "ContentHash">;

/** Unique identifier for a sync operation */
export type SyncOperationId = Brand<string, "SyncOperationId">;

/** Unique identifier for a reconciliation record */
export type ReconciliationId = Brand<string, "ReconciliationId">;

// =============================================================================
// NODE TYPES ELIGIBLE FOR MARKDOWN EXPORT
// =============================================================================

/**
 * Node types that can be exported to Markdown
 */
export type ExportableNodeType =
  // Core knowledge content
  | "note"
  | "concept"
  | "term"
  | "fact"
  | "formula"
  | "procedure"
  | "example"
  | "counterexample"
  | "question"
  // Optional (configurable)
  | "strategy" // As guidance notes
  | "goal" // As planning notes
  | "learning_path"; // As planning notes

/**
 * Check if a node type is exportable
 */
export function isExportableNodeType(
  nodeType: NodeType,
): nodeType is ExportableNodeType {
  const exportableTypes: readonly NodeType[] = [
    "note",
    "concept",
    "term",
    "fact",
    "formula",
    "procedure",
    "example",
    "counterexample",
    "question",
    "strategy",
    "goal",
    "learning_path",
  ];
  return exportableTypes.includes(nodeType);
}

/**
 * Node types that should NEVER be exported
 */
export const NON_EXPORTABLE_NODE_TYPES: readonly NodeType[] = [
  "card", // Cards have their own export mechanism
  "resource",
  "chunk",
  "milestone",
  "assessment",
  "rubric",
  "reflection",
  "prediction",
  "error_pattern",
  "quest",
  "challenge",
  "badge",
  "streak_rule",
  "boss",
  "reward",
  "plugin_module",
  "experiment",
  "notification_template",
];

// =============================================================================
// FRONTMATTER SCHEMA
// =============================================================================

/**
 * Field editability classification
 */
export type FieldEditability = "user_editable" | "lkgc_controlled" | "computed";

/**
 * Required frontmatter fields (always present)
 */
export interface RequiredFrontmatter {
  /** Stable LKGC node ID */
  readonly lkgc_id: NodeId;

  /** Node type */
  readonly node_type: ExportableNodeType;

  /** Schema version for forward/backward compatibility */
  readonly schema_version: number;

  /** LKGC revision number */
  readonly rev: RevisionNumber;

  /** Source of this export (always "lkgc_mirror" on export) */
  readonly source: "lkgc_mirror";

  /** Privacy level */
  readonly privacy_level: PrivacyLevel;

  /** Creation timestamp */
  readonly created_at: Timestamp;

  /** Last update timestamp */
  readonly updated_at: Timestamp;
}

/**
 * Optional frontmatter fields (read-only summaries)
 */
export interface OptionalFrontmatter {
  /** Mastery summary (qualitative, not raw parameters) */
  readonly mastery_summary?: MasterySummary;

  /** Last reviewed date */
  readonly last_reviewed?: Timestamp;

  /** Strategy tags */
  readonly strategy_tags?: readonly string[];

  /** Aliases for this node */
  readonly aliases?: readonly string[];

  /** User-defined tags */
  readonly tags?: readonly string[];

  /** Domain/subject area */
  readonly domain?: string;

  /** Archived state */
  readonly archived?: boolean;
}

/**
 * Complete frontmatter structure
 */
export interface MarkdownFrontmatter
  extends RequiredFrontmatter, OptionalFrontmatter {}

/**
 * Qualitative mastery summary (not raw MasteryState internals)
 */
export interface MasterySummary {
  /** Categorical state */
  readonly state: "new" | "fragile" | "developing" | "stable" | "strong";

  /** Directional trend */
  readonly trend: "improving" | "stable" | "declining" | "unknown";

  /** Short explanation */
  readonly explanation?: string;
}

/**
 * Frontmatter field metadata
 */
export interface FrontmatterFieldMeta {
  readonly name: string;
  readonly editability: FieldEditability;
  readonly type:
    | "string"
    | "number"
    | "boolean"
    | "array"
    | "object"
    | "timestamp";
  readonly required: boolean;
  readonly description: string;
}

/**
 * Field editability registry
 */
export const FRONTMATTER_FIELD_EDITABILITY: Record<
  keyof MarkdownFrontmatter,
  FieldEditability
> = {
  // Required fields - mostly LKGC controlled
  lkgc_id: "lkgc_controlled",
  node_type: "lkgc_controlled",
  schema_version: "lkgc_controlled",
  rev: "lkgc_controlled",
  source: "lkgc_controlled",
  privacy_level: "user_editable", // User can change privacy
  created_at: "lkgc_controlled",
  updated_at: "lkgc_controlled",

  // Optional fields - mixed editability
  mastery_summary: "computed",
  last_reviewed: "computed",
  strategy_tags: "user_editable",
  aliases: "user_editable",
  tags: "user_editable",
  domain: "user_editable",
  archived: "user_editable",
};

// =============================================================================
// WIKILINK TYPES
// =============================================================================

/**
 * Parsed wikilink from Markdown content
 */
export interface ParsedWikilink {
  /** Original link text as written */
  readonly originalText: string;

  /** Target identifier (node title or alias) */
  readonly target: string;

  /** Display alias if present [[target|displayed]] */
  readonly displayAlias?: string;

  /** Position in the document (character offset) */
  readonly position: number;

  /** Line number (1-indexed) */
  readonly lineNumber: number;

  /** Surrounding context (for edge metadata) */
  readonly context?: string;

  /** Resolved node ID (if found) */
  readonly resolvedNodeId?: NodeId;

  /** Resolution status */
  readonly resolution: WikilinkResolution;
}

/**
 * Wikilink resolution status
 */
export type WikilinkResolution =
  | "resolved" // Found existing node
  | "unresolved" // No matching node found
  | "ambiguous" // Multiple matches
  | "pending_stub"; // Stub created, awaiting confirmation

// =============================================================================
// EDGE INFERENCE CONFIGURATION
// =============================================================================

/**
 * Edge types that can be inferred from wikilinks
 */
export type InferableEdgeType =
  | "mentions"
  | "part_of"
  | "explains"
  | "example_of"
  | "uses"
  | "defines"
  | "analogous_to"
  | "contrasts_with";

/**
 * Edge types that must NEVER be auto-inferred (structural)
 */
export const NON_INFERABLE_EDGE_TYPES: readonly EdgeType[] = [
  "prerequisite_of",
  "causes",
  "derived_from",
  "targets_goal",
  "introduced_in_path_step",
  "assessed_by",
  "practiced_by",
  "best_learned_with_strategy",
  "error_pattern_for",
  "reflection_about",
  "frequently_confused_with",
  "cross_deck_duplicate_of",
];

/**
 * Default confidence for inferred edges by type
 */
export const DEFAULT_EDGE_INFERENCE_CONFIDENCE: Record<
  InferableEdgeType,
  Confidence
> = {
  mentions: 0.9 as Confidence, // High - direct link
  part_of: 0.6 as Confidence, // Moderate
  explains: 0.6 as Confidence,
  example_of: 0.6 as Confidence,
  uses: 0.6 as Confidence,
  defines: 0.6 as Confidence,
  analogous_to: 0.5 as Confidence, // Lower - semantic inference
  contrasts_with: 0.5 as Confidence,
};

/**
 * Edge inference configuration
 */
export interface EdgeInferenceConfig {
  /** Whether to infer edges from wikilinks */
  readonly enabled: boolean;

  /** Default edge type for unqualified wikilinks */
  readonly defaultEdgeType: InferableEdgeType;

  /** Confidence overrides per edge type */
  readonly confidenceOverrides?: Partial<Record<InferableEdgeType, Confidence>>;

  /** Whether to create bidirectional edges */
  readonly createBidirectional: boolean;

  /** Minimum confidence threshold for edge creation */
  readonly minConfidenceThreshold: Confidence;
}

/**
 * Default edge inference configuration
 */
export const DEFAULT_EDGE_INFERENCE_CONFIG: EdgeInferenceConfig = {
  enabled: true,
  defaultEdgeType: "mentions",
  createBidirectional: false,
  minConfidenceThreshold: 0.5 as Confidence,
};

// =============================================================================
// MARKDOWN FILE REPRESENTATION
// =============================================================================

/**
 * Represents a parsed Markdown file
 */
export interface ParsedMarkdownFile {
  /** File identifier */
  readonly fileId: MarkdownFileId;

  /** File path relative to vault root */
  readonly relativePath: string;

  /** Absolute file path */
  readonly absolutePath: string;

  /** File name without extension */
  readonly fileName: string;

  /** Parsed frontmatter */
  readonly frontmatter: MarkdownFrontmatter | null;

  /** Raw frontmatter YAML string */
  readonly rawFrontmatter: string;

  /** Body content (everything after frontmatter) */
  readonly body: string;

  /** Extracted wikilinks */
  readonly wikilinks: readonly ParsedWikilink[];

  /** Content hash for change detection */
  readonly contentHash: ContentHash;

  /** File modification timestamp */
  readonly modifiedAt: Timestamp;

  /** File creation timestamp (if available) */
  readonly createdAt?: Timestamp;

  /** Parsing errors (if any) */
  readonly parseErrors: readonly MarkdownParseError[];
}

/**
 * Simplified alias for internal sync operations
 * Contains only the fields needed for change detection and reconciliation
 */
export interface MarkdownFile {
  /** File path relative to vault root */
  readonly relativePath: string;

  /** Parsed frontmatter */
  readonly frontmatter: MarkdownFrontmatter | null;

  /** Body content */
  readonly body: string;

  /** Body content hash for change detection */
  readonly bodyHash: ContentHash;

  /** Extracted wikilinks */
  readonly parsedWikilinks: readonly ParsedWikilink[];

  /** Last modified timestamp */
  readonly lastModified: Timestamp;

  /** Whether file exists */
  readonly exists: boolean;
}

/**
 * Markdown parsing error
 */
export interface MarkdownParseError {
  readonly code: string;
  readonly message: string;
  readonly lineNumber?: number;
  readonly severity: "error" | "warning";
}

// =============================================================================
// SYNC STATE & OPERATIONS
// =============================================================================

/**
 * Sync direction
 */
export type SyncDirection = "export" | "import" | "bidirectional";

/**
 * File sync status
 */
export type FileSyncStatus =
  | "synced" // File and node are in sync
  | "modified_locally" // File changed, node unchanged
  | "modified_remotely" // Node changed, file unchanged
  | "conflict" // Both changed
  | "new_file" // File exists, no corresponding node
  | "new_node" // Node exists, no corresponding file
  | "deleted_file" // File was deleted
  | "pending_deletion" // Marked for deletion, awaiting confirmation
  | "archived"; // Node is archived

/**
 * Sync state for a file-node pair
 */
export interface FileSyncState {
  /** File identifier */
  readonly fileId: MarkdownFileId;

  /** Node identifier */
  readonly nodeId: NodeId;

  /** Current sync status */
  readonly status: FileSyncStatus;

  /** Last sync timestamp */
  readonly lastSyncAt: Timestamp;

  /** Last known file hash */
  readonly lastFileHash: ContentHash;

  /** Last known node revision */
  readonly lastNodeRev: RevisionNumber;

  /** File path at last sync */
  readonly lastFilePath: string;

  /** Pending changes (if any) */
  readonly pendingChanges?: PendingChanges;
}

/**
 * Pending changes awaiting sync
 */
export interface PendingChanges {
  /** Frontmatter changes */
  readonly frontmatterChanges?: FrontmatterChanges;

  /** Body content changes */
  readonly bodyChanges?: BodyChanges;

  /** Wikilink changes */
  readonly wikilinkChanges?: WikilinkChanges;

  /** Detected at */
  readonly detectedAt: Timestamp;
}

/**
 * Frontmatter changes
 */
export interface FrontmatterChanges {
  readonly added: Readonly<Record<string, unknown>>;
  readonly modified: Readonly<Record<string, { old: unknown; new: unknown }>>;
  readonly removed: readonly string[];
}

/**
 * Body content changes
 */
export interface BodyChanges {
  readonly oldContent: string;
  readonly newContent: string;
  readonly diff?: string; // Unified diff format
}

/**
 * Wikilink changes
 */
export interface WikilinkChanges {
  readonly added: readonly ParsedWikilink[];
  readonly removed: readonly ParsedWikilink[];
  readonly modified: readonly { old: ParsedWikilink; new: ParsedWikilink }[];
}

// =============================================================================
// CONFLICT RESOLUTION
// =============================================================================

/**
 * Conflict resolution strategy
 */
export type ConflictResolutionStrategy =
  | "keep_lkgc" // LKGC version wins
  | "keep_file" // File version wins
  | "merge" // Attempt to merge
  | "manual" // Require manual resolution
  | "create_conflict_file"; // Create a .conflict.md file

/**
 * Conflict severity level
 */
export type ConflictSeverity =
  | "info" // Informational - auto-resolvable
  | "warning" // Warning - needs attention but not blocking
  | "critical"; // Critical - blocks sync until resolved

/**
 * Conflict marker in merged content
 * Used for tracking conflicts during three-way merge
 */
export interface ConflictMarker {
  /** Unique conflict ID */
  readonly id: string;

  /** Node ID this conflict belongs to */
  readonly nodeId: NodeId;

  /** Field or location of conflict */
  readonly field: string;

  /** LKGC version of conflicting content */
  readonly lkgcValue: string;

  /** Obsidian/file version of conflicting content */
  readonly obsidianValue: string;

  /** Base version (if available from three-way merge) */
  readonly baseValue?: string;

  /** Conflict severity */
  readonly severity: ConflictSeverity;

  /** Suggested resolution action */
  readonly suggestedResolution:
    | "manual"
    | "accept_lkgc"
    | "accept_obsidian"
    | "merge";

  /** When conflict was detected */
  readonly createdAt: Timestamp;

  /** Start line position (optional, for body conflicts) */
  readonly startLine?: number;

  /** End line position (optional, for body conflicts) */
  readonly endLine?: number;

  /** Conflict description */
  readonly description?: string;
}

/**
 * Conflict resolution result
 */
export interface ConflictResolutionResult {
  /** Resolution strategy used */
  readonly strategy: ConflictResolutionStrategy;

  /** Resolved content */
  readonly resolvedContent?: string;

  /** Remaining conflict markers (if merge with conflicts) */
  readonly conflictMarkers?: readonly ConflictMarker[];

  /** Whether resolution was complete */
  readonly fullyResolved: boolean;

  /** Resolution timestamp */
  readonly resolvedAt: Timestamp;

  /** Manual action required */
  readonly requiresManualAction: boolean;
}

/**
 * Import provenance for content operations
 * Tracks where imported content came from
 */
export interface ImportProvenance {
  readonly action: "user_action" | "sync_cycle" | "auto_merge";
  readonly source:
    | "obsidian"
    | "lkgc_mirror"
    | "deletion_grace_period"
    | "pending_node_confirmation"
    | "force_delete";
  readonly timestamp: Timestamp;
  readonly userId?: UserId;
  readonly sessionId?: string;
}

/**
 * Reconciliation status
 */
export type ReconciliationStatus =
  | "clean" // No conflicts, merge succeeded
  | "merged_with_conflicts" // Merged but has conflict markers
  | "requires_manual_review" // Too many conflicts, needs manual review
  | "failed"; // Reconciliation failed

/**
 * Content operation type
 */
export type ContentOperationType =
  | "update_node"
  | "create_node"
  | "delete_node"
  | "create_edge"
  | "delete_edge"
  | "create_pending_node";

/**
 * Content operation to be applied to LKGC
 * Moved here to avoid circular dependency with importer
 */
export interface ContentOperation {
  readonly operationType: ContentOperationType;
  readonly targetId: NodeId | EdgeId;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly provenance: ImportProvenance;
  readonly timestamp: Timestamp;

  /** For pending node creation */
  readonly pendingNode?: PendingNode;
}

/**
 * Result of reconciling LKGC and Obsidian versions
 */
export interface ReconciliationResult {
  /** Final reconciliation status */
  readonly status: ReconciliationStatus;

  /** Merged file (if reconciliation produced output) */
  readonly mergedFile: MarkdownFile;

  /** List of conflicts found */
  readonly conflicts: readonly ConflictMarker[];

  /** Content operations that were applied */
  readonly appliedOperations: readonly ContentOperation[];

  /** Warning messages */
  readonly warnings: readonly string[];

  /** Whether user input is needed */
  readonly needsUserInput: boolean;

  /** Timestamp of reconciliation */
  readonly timestamp: Timestamp;
}

// =============================================================================
// STUB NODE (Pending Confirmation)
// =============================================================================

/**
 * Stub node created from unresolved wikilink
 */
export interface StubNode {
  /** Temporary node ID */
  readonly stubId: NodeId;

  /** Title from wikilink */
  readonly title: string;

  /** Source file that created this stub */
  readonly sourceFileId: MarkdownFileId;

  /** Source wikilink */
  readonly sourceWikilink: ParsedWikilink;

  /** When stub was created */
  readonly createdAt: Timestamp;

  /** Confirmation status */
  readonly status: StubNodeStatus;

  /** Suggested node type (if determinable from context) */
  readonly suggestedNodeType?: ExportableNodeType;

  /** User who should confirm (if multi-user) */
  readonly assignedUserId?: UserId;
}

/**
 * Pending node (simplified version for importer)
 * Created when a wikilink points to a non-existent node
 */
export interface PendingNode {
  /** Temporary node ID */
  readonly tempId: NodeId;

  /** Suggested title from wikilink */
  readonly suggestedTitle: string;

  /** Suggested node type */
  readonly suggestedType: ExportableNodeType;

  /** Source wikilink that created this */
  readonly sourceWikilink: ParsedWikilink;

  /** Nodes that link to this pending node */
  readonly linkedFromNodes: readonly NodeId[];

  /** Status of the pending node */
  readonly status: PendingNodeStatus;

  /** When created */
  readonly createdAt: Timestamp;

  /** Inherited privacy level */
  readonly inheritedPrivacy: PrivacyLevel;

  /** Confidence in the suggestion */
  readonly confidence: Confidence;
}

/**
 * Pending node status
 */
export type PendingNodeStatus =
  | "awaiting_confirmation"
  | "confirmed"
  | "rejected"
  | "expired";

/**
 * Stub node status
 */
export type StubNodeStatus =
  | "pending" // Awaiting user confirmation
  | "confirmed" // User confirmed, node will be created
  | "rejected" // User rejected, stub will be removed
  | "expired"; // Grace period expired, auto-rejected

// =============================================================================
// DELETION HANDLING
// =============================================================================

/**
 * Deletion state for a node file
 */
export interface DeletionState {
  readonly nodeId: NodeId;
  readonly filePath: string;
  readonly status: DeletionStatus;
  readonly detectedAt: Timestamp;
  readonly gracePeriodEnds: Timestamp;
  readonly confirmedAt?: Timestamp;
}

/**
 * Deletion request for a node
 */
export interface DeletionRequest {
  /** Node ID to delete */
  readonly nodeId: NodeId;

  /** File path that was deleted */
  readonly deletedFilePath: string;

  /** When deletion was detected */
  readonly detectedAt: Timestamp;

  /** Deletion status */
  readonly status: DeletionStatus;

  /** Confirmation deadline (grace period end) */
  readonly confirmationDeadline: Timestamp;

  /** Confirmed by user */
  readonly confirmedByUser?: boolean;

  /** Confirmation timestamp */
  readonly confirmedAt?: Timestamp;
}

/**
 * Deletion status
 */
export type DeletionStatus =
  | "pending_confirmation" // Awaiting user confirmation
  | "confirmed" // User confirmed deletion
  | "auto_archived" // Grace period expired, auto-archived
  | "cancelled"; // User restored the file

// =============================================================================
// SYNC CONFIGURATION
// =============================================================================

/**
 * Markdown mirror configuration
 */
export interface MarkdownMirrorConfig {
  /** Vault root directory */
  readonly vaultRoot: string;

  /** Subdirectory for LKGC-managed files (optional) */
  readonly lkgcSubdirectory?: string;

  /** Node types to export */
  readonly exportableNodeTypes: readonly ExportableNodeType[];

  /** Edge inference configuration */
  readonly edgeInference: EdgeInferenceConfig;

  /** Conflict resolution strategy */
  readonly conflictStrategy: ConflictResolutionStrategy;

  /** Grace period for deletion confirmation (milliseconds) */
  readonly deletionGracePeriod: Duration;

  /** Whether to auto-create stub nodes from unresolved wikilinks */
  readonly autoCreateStubs: boolean;

  /** Default privacy level for new files */
  readonly defaultPrivacyLevel: PrivacyLevel;

  /** File naming strategy */
  readonly fileNamingStrategy: FileNamingStrategy;

  /** Whether to preserve user formatting on re-import */
  readonly preserveUserFormatting: boolean;

  /** Schema version */
  readonly schemaVersion: number;
}

/**
 * File naming strategy
 */
export type FileNamingStrategy =
  | "title_only" // "My Note.md"
  | "title_with_id" // "My Note (nod_xxx).md"
  | "id_prefixed"; // "nod_xxx - My Note.md"

/**
 * Default mirror configuration
 */
export const DEFAULT_MIRROR_CONFIG: MarkdownMirrorConfig = {
  vaultRoot: "./vault",
  exportableNodeTypes: [
    "note",
    "concept",
    "term",
    "fact",
    "formula",
    "procedure",
    "example",
    "counterexample",
    "question",
  ],
  edgeInference: DEFAULT_EDGE_INFERENCE_CONFIG,
  conflictStrategy: "merge",
  deletionGracePeriod: (24 * 60 * 60 * 1000) as Duration, // 24 hours
  autoCreateStubs: true,
  defaultPrivacyLevel: "private",
  fileNamingStrategy: "title_only",
  preserveUserFormatting: true,
  schemaVersion: 1,
};

// =============================================================================
// AUDIT & PROVENANCE
// =============================================================================

/**
 * Sync operation record for audit trail
 */
export interface SyncOperationRecord {
  /** Operation ID */
  readonly operationId: SyncOperationId;

  /** Operation type */
  readonly operationType: SyncOperationType;

  /** Direction */
  readonly direction: SyncDirection;

  /** Affected node ID */
  readonly nodeId?: NodeId;

  /** Affected file path */
  readonly filePath?: string;

  /** Operation timestamp */
  readonly timestamp: Timestamp;

  /** User who triggered (if applicable) */
  readonly userId?: UserId;

  /** Provenance information */
  readonly provenance: SyncProvenance;

  /** Operation result */
  readonly result: SyncOperationResult;

  /** Changes made */
  readonly changes?: SyncChanges;
}

/**
 * Sync operation types
 */
export type SyncOperationType =
  | "export_node"
  | "import_file"
  | "update_node_from_file"
  | "update_file_from_node"
  | "create_node_from_file"
  | "create_file_from_node"
  | "resolve_conflict"
  | "archive_node"
  | "delete_file"
  | "create_stub"
  | "confirm_stub"
  | "reject_stub"
  | "mark_deletion_pending"
  | "confirm_deletion"
  | "cancel_deletion";

/**
 * Sync provenance
 */
export interface SyncProvenance {
  readonly source: DataSource;
  readonly sourceId: string;
  readonly confidence: Confidence;
  readonly reason: string;
}

/**
 * Simple sync record for internal engine use
 * Less formal than SyncOperationRecord, used for quick logging
 */
export interface SimpleSyncRecord {
  readonly id: string;
  readonly nodeId: NodeId;
  readonly timestamp: Timestamp;
  readonly operation: string;
  readonly changes: readonly string[];
  readonly provenance: ImportProvenance;
  readonly previousHash?: ContentHash;
  readonly newHash?: ContentHash;
}

/**
 * Sync operation result
 */
export interface SyncOperationResult {
  readonly success: boolean;
  readonly error?: string;
  readonly warnings?: readonly string[];
  readonly nodeRevAfter?: RevisionNumber;
  readonly fileHashAfter?: ContentHash;
}

/**
 * Changes made during sync
 */
export interface SyncChanges {
  readonly frontmatterChanges?: FrontmatterChanges;
  readonly bodyChanges?: BodyChanges;
  readonly edgesCreated?: readonly EdgeId[];
  readonly edgesRemoved?: readonly EdgeId[];
  readonly conflictResolution?: ConflictResolutionResult;
}
