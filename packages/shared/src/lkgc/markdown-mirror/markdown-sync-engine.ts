// =============================================================================
// MARKDOWN SYNC ENGINE - Orchestration for Bidirectional Sync
// =============================================================================
// Coordinates export, import, and reconciliation phases.
//
// Policy implementations from user specification:
// 1. Conflict: Merge non-conflicting, conflict markers for overlaps
// 2. New nodes from wikilinks: Pending stub nodes requiring confirmation
// 3. File deletion: pending_deletion first, then archive after grace period
// 4. Edge confidence: ~0.6 default, never auto-infer structural edges
// 5. Privacy: Inherit from node, default to private
//
// NO UI. NO AI. NO SCHEDULING.
// =============================================================================

import type { NodeId, Timestamp } from "../../types/lkgc/foundation";
import type { LKGCNode } from "../../types/lkgc/nodes";
import type { LKGCEdge } from "../../types/lkgc/edges";
import type { MasteryState } from "../../types/lkgc/mastery";
import type {
  MarkdownFile,
  MarkdownMirrorConfig,
  PendingNode,
  DeletionState,
  DeletionStatus,
  SimpleSyncRecord,
  ReconciliationResult,
  ContentHash,
  ExportableNodeType,
} from "./markdown-types";
import { DEFAULT_MIRROR_CONFIG } from "./markdown-types";
import { MarkdownParser, generateContentHash } from "./markdown-parser";
import {
  MarkdownExporter,
  createMarkdownExporter,
  type ExportResult,
} from "./markdown-exporter";
import {
  MarkdownImporter,
  createMarkdownImporter,
  createDefaultImportEdgeInferenceConfig,
  type ImportResult,
  type ContentOperation,
} from "./markdown-importer";
import {
  MarkdownReconciler,
  createMarkdownReconciler,
} from "./markdown-reconciler";
import { now } from "../id-generator";

// =============================================================================
// FILE SYSTEM ABSTRACTION
// =============================================================================

/**
 * Abstract file system interface
 * Implementations for Obsidian vault, in-memory testing, etc.
 */
export interface FileSystemAdapter {
  /** Read file content */
  readFile(path: string): Promise<string | undefined>;

  /** Write file content */
  writeFile(path: string, content: string): Promise<void>;

  /** Delete file */
  deleteFile(path: string): Promise<void>;

  /** Move file to archive */
  moveToArchive(path: string, archivePath: string): Promise<void>;

  /** Check if file exists */
  exists(path: string): Promise<boolean>;

  /** List all markdown files in directory */
  listMarkdownFiles(directory: string): Promise<readonly string[]>;

  /** Get file modification time */
  getModificationTime(path: string): Promise<Timestamp | undefined>;
}

// =============================================================================
// SYNC STATE STORAGE
// =============================================================================

/**
 * Storage for sync state (last exports, pending nodes, etc.)
 */
export interface SyncStateStorage {
  /** Get last exported file for a node */
  getLastExport(nodeId: NodeId): Promise<MarkdownFile | undefined>;

  /** Store last exported file for a node */
  setLastExport(nodeId: NodeId, file: MarkdownFile): Promise<void>;

  /** Get all pending nodes */
  getPendingNodes(): Promise<readonly PendingNode[]>;

  /** Add pending node */
  addPendingNode(node: PendingNode): Promise<void>;

  /** Remove pending node (when resolved) */
  removePendingNode(tempId: NodeId): Promise<void>;

  /** Get all pending deletions */
  getPendingDeletions(): Promise<readonly DeletionState[]>;

  /** Add pending deletion */
  addPendingDeletion(deletion: DeletionState): Promise<void>;

  /** Update deletion status */
  updateDeletionStatus(nodeId: NodeId, status: DeletionStatus): Promise<void>;

  /** Remove deletion state (when resolved) */
  removeDeletionState(nodeId: NodeId): Promise<void>;

  /** Record sync operation */
  recordOperation(record: SimpleSyncRecord): Promise<void>;

  /** Get sync history for a node */
  getSyncHistory(
    nodeId: NodeId,
    limit?: number,
  ): Promise<readonly SimpleSyncRecord[]>;

  /** Get node ID by file path */
  getNodeIdByPath(path: string): Promise<NodeId | undefined>;

  /** Set mapping from file path to node ID */
  setPathMapping(path: string, nodeId: NodeId): Promise<void>;
}

// =============================================================================
// SYNC ENGINE
// =============================================================================

/**
 * Result of a full sync cycle
 */
export interface SyncCycleResult {
  readonly success: boolean;
  readonly timestamp: Timestamp;

  /** Nodes exported to Markdown */
  readonly exported: readonly ExportResult[];

  /** Files imported from Markdown */
  readonly imported: readonly ImportResult[];

  /** Reconciliation results (for conflicts) */
  readonly reconciliations: readonly ReconciliationResult[];

  /** Pending nodes created (awaiting confirmation) */
  readonly pendingNodes: readonly PendingNode[];

  /** Files marked for deletion */
  readonly pendingDeletions: readonly DeletionState[];

  /** Deletions that were finalized (grace period passed) */
  readonly finalizedDeletions: readonly NodeId[];

  /** All warnings */
  readonly warnings: readonly string[];

  /** Errors encountered */
  readonly errors: readonly string[];
}

/**
 * Dependencies for the sync engine
 */
export interface SyncEngineDependencies {
  /** Graph store operations */
  readonly getNode: (nodeId: NodeId) => LKGCNode | undefined;
  readonly getNodeByTitle: (title: string) => LKGCNode | undefined;
  readonly getAllNodeIds: () => readonly NodeId[];
  readonly getOutgoingEdges: (nodeId: NodeId) => readonly LKGCEdge[];
  readonly getMasteryState?: (nodeId: NodeId) => MasteryState | undefined;

  /** Apply content operations to LKGC */
  readonly applyOperation: (operation: ContentOperation) => Promise<boolean>;

  /** File system */
  readonly fileSystem: FileSystemAdapter;

  /** Sync state storage */
  readonly storage: SyncStateStorage;
}

/**
 * Sync engine for bidirectional Obsidian-LKGC sync
 */
export class MarkdownSyncEngine {
  private readonly config: MarkdownMirrorConfig;
  private readonly deps: SyncEngineDependencies;
  private readonly parser: MarkdownParser;
  private readonly exporter: MarkdownExporter;
  private readonly importer: MarkdownImporter;
  private readonly reconciler: MarkdownReconciler;

  constructor(
    config: Partial<MarkdownMirrorConfig>,
    deps: SyncEngineDependencies,
  ) {
    this.config = { ...DEFAULT_MIRROR_CONFIG, ...config };
    this.deps = deps;
    this.parser = new MarkdownParser();
    this.reconciler = createMarkdownReconciler();

    this.exporter = createMarkdownExporter(this.config, {
      getNode: deps.getNode,
      getOutgoingEdges: deps.getOutgoingEdges,
      getMasteryState: deps.getMasteryState,
    });

    this.importer = createMarkdownImporter({
      getNode: deps.getNode,
      getNodeByTitle: deps.getNodeByTitle,
      getPreviousExport: (_nodeId: NodeId): MarkdownFile | undefined => {
        // This is a stub - proper implementation would cache exported files
        // and look them up by nodeId for change detection
        return undefined;
      },
      parser: this.parser,
      edgeInferenceConfig: createDefaultImportEdgeInferenceConfig(),
    });
  }

  /**
   * Run a full sync cycle
   */
  async sync(): Promise<SyncCycleResult> {
    const timestamp = now();
    const warnings: string[] = [];
    const errors: string[] = [];

    const exported: ExportResult[] = [];
    const imported: ImportResult[] = [];
    const reconciliations: ReconciliationResult[] = [];
    const pendingNodes: PendingNode[] = [];
    const finalizedDeletions: NodeId[] = [];

    try {
      // Phase 1: Export LKGC changes to Markdown
      const exportResults = await this.exportPhase();
      exported.push(...exportResults.results);
      warnings.push(...exportResults.warnings);
      errors.push(...exportResults.errors);

      // Phase 2: Import Markdown changes to LKGC
      const importResults = await this.importPhase();
      imported.push(...importResults.results);
      pendingNodes.push(...importResults.pendingNodes);
      warnings.push(...importResults.warnings);
      errors.push(...importResults.errors);

      // Phase 3: Handle conflicts with reconciliation
      for (const importResult of importResults.results) {
        if (importResult.nodeId && importResult.changes.length > 0) {
          const reconcileResult = await this.reconcileNode(importResult.nodeId);
          if (reconcileResult) {
            reconciliations.push(reconcileResult);
          }
        }
      }

      // Phase 4: Process pending deletions
      const deletionResults = await this.processPendingDeletions();
      finalizedDeletions.push(...deletionResults.finalized);
      warnings.push(...deletionResults.warnings);

      // Get current pending deletions
      const pendingDeletions = await this.deps.storage.getPendingDeletions();

      return {
        success: errors.length === 0,
        timestamp,
        exported,
        imported,
        reconciliations,
        pendingNodes,
        pendingDeletions,
        finalizedDeletions,
        warnings,
        errors,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown error");

      return {
        success: false,
        timestamp,
        exported,
        imported,
        reconciliations,
        pendingNodes,
        pendingDeletions: [],
        finalizedDeletions,
        warnings,
        errors,
      };
    }
  }

  /**
   * Export phase: LKGC → Markdown
   */
  private async exportPhase(): Promise<{
    results: ExportResult[];
    warnings: string[];
    errors: string[];
  }> {
    const results: ExportResult[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    // Get all exportable nodes
    const allNodeIds = this.deps.getAllNodeIds();
    const exportableIds = this.exporter.getExportableNodes(allNodeIds);

    for (const nodeId of exportableIds) {
      try {
        const node = this.deps.getNode(nodeId);
        if (!node) continue;

        // Skip non-exportable privacy levels (private nodes stay in LKGC only)
        if (node.privacy.privacyLevel === "private") {
          continue;
        }

        // Export the node
        const exportResult = this.exporter.export(nodeId);

        if (exportResult.success) {
          // Check if file needs updating
          const existingContent = await this.deps.fileSystem.readFile(
            exportResult.filePath,
          );

          if (existingContent) {
            const existingHash = generateContentHash(existingContent);
            if (existingHash === exportResult.contentHash) {
              // No changes needed
              continue;
            }
          }

          // Write the file
          await this.deps.fileSystem.writeFile(
            exportResult.filePath,
            exportResult.content,
          );

          // Store as last export
          const exportedFile = this.parser.parseForSync(
            exportResult.content,
            exportResult.filePath,
          );
          await this.deps.storage.setLastExport(nodeId, exportedFile);
          await this.deps.storage.setPathMapping(exportResult.filePath, nodeId);

          // Record operation
          await this.deps.storage.recordOperation({
            id: `export-${nodeId}-${now()}`,
            nodeId,
            timestamp: now(),
            operation: "export",
            changes: ["full_export"],
            provenance: {
              action: "sync_cycle",
              source: "lkgc_mirror",
              timestamp: now(),
            },
            previousHash: existingContent
              ? (generateContentHash(existingContent) as ContentHash)
              : undefined,
            newHash: exportResult.contentHash,
          });

          results.push(exportResult);
        } else {
          warnings.push(...exportResult.warnings);
          if (exportResult.error) {
            errors.push(exportResult.error);
          }
        }
      } catch (error) {
        errors.push(
          `Export error for ${nodeId}: ${error instanceof Error ? error.message : "Unknown"}`,
        );
      }
    }

    return { results, warnings, errors };
  }

  /**
   * Import phase: Markdown → LKGC
   */
  private async importPhase(): Promise<{
    results: ImportResult[];
    pendingNodes: PendingNode[];
    warnings: string[];
    errors: string[];
  }> {
    const results: ImportResult[] = [];
    const pendingNodes: PendingNode[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    // Get all markdown files
    const vaultPath = this.config.vaultRoot;
    const files = await this.deps.fileSystem.listMarkdownFiles(vaultPath);

    for (const filePath of files) {
      try {
        const content = await this.deps.fileSystem.readFile(filePath);
        if (!content) continue;

        // Get node ID for this file
        const nodeId = await this.deps.storage.getNodeIdByPath(filePath);

        // Import the file
        const importResult = this.importer.import(content, filePath, nodeId);

        if (importResult.success && importResult.operations.length > 0) {
          // Apply operations to LKGC
          for (const operation of importResult.operations) {
            const success = await this.deps.applyOperation(operation);
            if (!success) {
              warnings.push(
                `Failed to apply operation: ${operation.operationType} on ${operation.targetId}`,
              );
            }
          }

          // Track pending nodes
          for (const pending of importResult.pendingNodes) {
            await this.deps.storage.addPendingNode(pending);
            pendingNodes.push(pending);
          }

          results.push(importResult);
        }

        warnings.push(...importResult.warnings);
        if (importResult.error) {
          errors.push(importResult.error);
        }
      } catch (error) {
        errors.push(
          `Import error for ${filePath}: ${error instanceof Error ? error.message : "Unknown"}`,
        );
      }
    }

    // Detect deleted files
    const deletedFiles = await this.detectDeletedFiles(files);
    for (const { filePath, nodeId } of deletedFiles) {
      const deletionOp = this.importer.detectDeletion(filePath, nodeId);
      if (deletionOp) {
        // Create pending deletion instead of immediate delete
        const deletionState: DeletionState = {
          nodeId,
          filePath,
          status: "pending_confirmation",
          detectedAt: now(),
          gracePeriodEnds: (now() +
            this.config.deletionGracePeriod) as Timestamp,
        };

        await this.deps.storage.addPendingDeletion(deletionState);
        warnings.push(
          `File "${filePath}" deleted - node ${nodeId} marked for pending deletion`,
        );
      }
    }

    return { results, pendingNodes, warnings, errors };
  }

  /**
   * Detect files that were deleted from the vault
   */
  private async detectDeletedFiles(
    currentFiles: readonly string[],
  ): Promise<{ filePath: string; nodeId: NodeId }[]> {
    const deleted: { filePath: string; nodeId: NodeId }[] = [];

    // Get all nodes we've exported before
    const allNodeIds = this.deps.getAllNodeIds();
    const currentFileSet = new Set(currentFiles);

    for (const nodeId of allNodeIds) {
      const lastExport = await this.deps.storage.getLastExport(nodeId);
      if (lastExport && !currentFileSet.has(lastExport.relativePath)) {
        // File was deleted
        deleted.push({ filePath: lastExport.relativePath, nodeId });
      }
    }

    return deleted;
  }

  /**
   * Reconcile a specific node
   */
  private async reconcileNode(
    nodeId: NodeId,
  ): Promise<ReconciliationResult | undefined> {
    const lastExport = await this.deps.storage.getLastExport(nodeId);
    if (!lastExport) return undefined;

    const currentContent = await this.deps.fileSystem.readFile(
      lastExport.relativePath,
    );
    if (!currentContent) return undefined;

    const currentFile = this.parser.parseForSync(
      currentContent,
      lastExport.relativePath,
    );

    // Get fresh LKGC export
    const freshExport = this.exporter.export(nodeId);
    if (!freshExport.success) return undefined;

    const lkgcFile = this.parser.parseForSync(
      freshExport.content,
      freshExport.filePath,
    );

    // Reconcile
    const result = this.reconciler.reconcile(
      nodeId,
      lastExport,
      lkgcFile,
      currentFile,
    );

    if (result.status !== "clean") {
      // Write merged file if there were changes
      await this.deps.fileSystem.writeFile(
        lastExport.relativePath,
        result.mergedFile.body, // TODO: serialize properly
      );
    }

    return result;
  }

  /**
   * Process pending deletions
   */
  private async processPendingDeletions(): Promise<{
    finalized: NodeId[];
    warnings: string[];
  }> {
    const finalized: NodeId[] = [];
    const warnings: string[] = [];

    const pendingDeletions = await this.deps.storage.getPendingDeletions();
    const currentTime = now();

    for (const deletion of pendingDeletions) {
      if (deletion.status === "pending_confirmation") {
        if (currentTime >= deletion.gracePeriodEnds) {
          // Grace period passed - archive the node
          await this.deps.storage.updateDeletionStatus(
            deletion.nodeId,
            "auto_archived",
          );

          // Move file to archive if it exists
          const archivePath = `${this.config.vaultRoot}/.archive/${deletion.filePath}`;
          const exists = await this.deps.fileSystem.exists(deletion.filePath);
          if (exists) {
            await this.deps.fileSystem.moveToArchive(
              deletion.filePath,
              archivePath,
            );
          }

          // Apply archive operation to LKGC
          await this.deps.applyOperation({
            operationType: "update_node",
            targetId: deletion.nodeId,
            payload: { archivedAt: currentTime },
            provenance: {
              action: "sync_cycle",
              source: "deletion_grace_period",
              timestamp: currentTime,
            },
            timestamp: currentTime,
          });

          finalized.push(deletion.nodeId);
          warnings.push(`Node ${deletion.nodeId} archived after grace period`);
        }
      }
    }

    return { finalized, warnings };
  }

  /**
   * Manually confirm a pending node
   */
  async confirmPendingNode(
    tempId: NodeId,
    confirmedType: ExportableNodeType,
    confirmedTitle: string,
  ): Promise<{ success: boolean; newNodeId?: NodeId; error?: string }> {
    const pendingNodes = await this.deps.storage.getPendingNodes();
    const pending = pendingNodes.find((p) => p.tempId === tempId);

    if (!pending) {
      return { success: false, error: "Pending node not found" };
    }

    // Create the actual node
    const createOp: ContentOperation = {
      operationType: "create_node",
      targetId: tempId, // Use temp ID as real ID
      payload: {
        id: tempId,
        nodeType: confirmedType,
        title: confirmedTitle,
        description: "",
        privacy: { privacyLevel: pending.inheritedPrivacy },
        provenance: {
          schemaVersion: 1,
          createdAt: now(),
          updatedAt: now(),
          source: "obsidian_import",
        },
        sync: {
          rev: 1,
          syncState: "synced",
          lastSyncAt: now(),
        },
      },
      provenance: {
        action: "user_action",
        source: "pending_node_confirmation",
        timestamp: now(),
      },
      timestamp: now(),
    };

    const success = await this.deps.applyOperation(createOp);

    if (success) {
      await this.deps.storage.removePendingNode(tempId);
      return { success: true, newNodeId: tempId };
    }

    return { success: false, error: "Failed to create node" };
  }

  /**
   * Reject a pending node
   */
  async rejectPendingNode(tempId: NodeId): Promise<boolean> {
    await this.deps.storage.removePendingNode(tempId);
    return true;
  }

  /**
   * Cancel a pending deletion (restore the file)
   */
  async cancelDeletion(nodeId: NodeId): Promise<boolean> {
    await this.deps.storage.removeDeletionState(nodeId);

    // Re-export the node
    const exportResult = this.exporter.export(nodeId);
    if (exportResult.success) {
      await this.deps.fileSystem.writeFile(
        exportResult.filePath,
        exportResult.content,
      );
    }

    return exportResult.success;
  }

  /**
   * Force immediate deletion (skip grace period)
   */
  async forceDelete(nodeId: NodeId): Promise<boolean> {
    const pendingDeletions = await this.deps.storage.getPendingDeletions();
    const deletion = pendingDeletions.find((d) => d.nodeId === nodeId);

    if (!deletion) {
      return false;
    }

    // Archive immediately
    await this.deps.storage.updateDeletionStatus(nodeId, "auto_archived");

    // Apply archive operation
    await this.deps.applyOperation({
      operationType: "update_node",
      targetId: nodeId,
      payload: { archivedAt: now() },
      provenance: {
        action: "user_action",
        source: "force_delete",
        timestamp: now(),
      },
      timestamp: now(),
    });

    return true;
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a markdown sync engine
 */
export function createMarkdownSyncEngine(
  config: Partial<MarkdownMirrorConfig>,
  deps: SyncEngineDependencies,
): MarkdownSyncEngine {
  return new MarkdownSyncEngine(config, deps);
}
