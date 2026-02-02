// =============================================================================
// MARKDOWN MIRROR - Public Exports
// =============================================================================
// Obsidian-compatible Markdown mirroring for LKGC.
//
// Core principle: LKGC is the source of truth. Markdown is a mirror, not
// the canonical store. All imports from Markdown are treated as content
// operations with provenance.
//
// NO UI. NO AI. NO SCHEDULING.
// =============================================================================

// Types
export type {
  // Branded types
  MarkdownFileId,
  ContentHash,

  // Frontmatter
  FrontmatterFieldMeta,
  MarkdownFrontmatter,
  MasterySummary,

  // Wikilinks
  WikilinkResolution,
  ParsedWikilink,

  // Files
  MarkdownFile,
  ExportableNodeType,

  // Conflicts
  ConflictSeverity,
  ConflictMarker,
  ReconciliationStatus,
  ReconciliationResult,

  // Pending nodes
  PendingNodeStatus,
  PendingNode,

  // Deletion
  DeletionStatus,
  DeletionState,

  // Configuration
  MarkdownMirrorConfig,
  EdgeInferenceConfig,

  // Operations
  ContentOperationType,
  ContentOperation,

  // Sync
  SyncProvenance,
  ImportProvenance,
  SimpleSyncRecord,
  SyncOperationType,
  SyncOperationRecord,
} from "./markdown-types";

export {
  // Type guards
  isExportableNodeType,

  // Constants
  NON_EXPORTABLE_NODE_TYPES,
  DEFAULT_MIRROR_CONFIG,
} from "./markdown-types";

// Parser
export { MarkdownParser, generateContentHash } from "./markdown-parser";

// Exporter
export type { ExportResult, ExporterDependencies } from "./markdown-exporter";

export {
  MarkdownExporter,
  createMarkdownExporter,
  generateFrontmatter,
  generateBodyContent,
  generateFilePath,
  generateMasterySummary,
  serializeFrontmatter,
} from "./markdown-exporter";

// Importer
export type {
  ChangeType,
  DetectedChange,
  ImportResult,
  ImporterDependencies,
} from "./markdown-importer";

export {
  MarkdownImporter,
  createMarkdownImporter,
  createDefaultImportEdgeInferenceConfig,
  detectChanges,
  generateOperations,
} from "./markdown-importer";

// Reconciler
export type {
  ComparisonResult,
  MergeResult,
  ReconcilerConfig,
} from "./markdown-reconciler";

export {
  MarkdownReconciler,
  createMarkdownReconciler,
  compareVersions,
  threeWayMerge,
  reconcileFrontmatter,
  DEFAULT_RECONCILER_CONFIG,
} from "./markdown-reconciler";

// Sync Engine
export type {
  FileSystemAdapter,
  SyncStateStorage,
  SyncCycleResult,
  SyncEngineDependencies,
} from "./markdown-sync-engine";

export {
  MarkdownSyncEngine,
  createMarkdownSyncEngine,
} from "./markdown-sync-engine";

// In-Memory Implementations (for testing)
export {
  InMemoryFileSystem,
  InMemorySyncStateStorage,
  createInMemoryFileSystem,
  createInMemorySyncStateStorage,
} from "./in-memory-file-system";
