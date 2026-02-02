// =============================================================================
// IN-MEMORY FILE SYSTEM - Test Implementation for Markdown Mirror
// =============================================================================
// A simple in-memory file system for testing the sync engine without
// requiring actual file system access.
//
// NO UI. NO AI. NO SCHEDULING.
// =============================================================================

import type { Timestamp } from "../../types/lkgc/foundation";
import type { FileSystemAdapter } from "./markdown-sync-engine";
import { now } from "../id-generator";

/**
 * File entry in the in-memory file system
 */
interface FileEntry {
  content: string;
  modificationTime: Timestamp;
}

/**
 * In-memory file system adapter for testing
 */
export class InMemoryFileSystem implements FileSystemAdapter {
  private files: Map<string, FileEntry> = new Map();
  private archive: Map<string, FileEntry> = new Map();

  /**
   * Read file content
   */
  async readFile(path: string): Promise<string | undefined> {
    const entry = this.files.get(this.normalizePath(path));
    return entry?.content;
  }

  /**
   * Write file content
   */
  async writeFile(path: string, content: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);

    // Ensure parent directories exist (conceptually)
    this.ensureParentDirectories(normalizedPath);

    this.files.set(normalizedPath, {
      content,
      modificationTime: now(),
    });
  }

  /**
   * Delete file
   */
  async deleteFile(path: string): Promise<void> {
    this.files.delete(this.normalizePath(path));
  }

  /**
   * Move file to archive
   */
  async moveToArchive(path: string, archivePath: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const normalizedArchivePath = this.normalizePath(archivePath);

    const entry = this.files.get(normalizedPath);
    if (entry) {
      this.archive.set(normalizedArchivePath, entry);
      this.files.delete(normalizedPath);
    }
  }

  /**
   * Check if file exists
   */
  async exists(path: string): Promise<boolean> {
    return this.files.has(this.normalizePath(path));
  }

  /**
   * List all markdown files in directory
   */
  async listMarkdownFiles(directory: string): Promise<readonly string[]> {
    const normalizedDir = this.normalizePath(directory);
    const result: string[] = [];

    for (const path of this.files.keys()) {
      if (path.startsWith(normalizedDir) && path.endsWith(".md")) {
        result.push(path);
      }
    }

    return result;
  }

  /**
   * Get file modification time
   */
  async getModificationTime(path: string): Promise<Timestamp | undefined> {
    const entry = this.files.get(this.normalizePath(path));
    return entry?.modificationTime;
  }

  // =========================================================================
  // TEST HELPERS
  // =========================================================================

  /**
   * Get all files (for testing)
   */
  getAllFiles(): Map<string, string> {
    const result = new Map<string, string>();
    for (const [path, entry] of this.files) {
      result.set(path, entry.content);
    }
    return result;
  }

  /**
   * Get archived files (for testing)
   */
  getArchivedFiles(): Map<string, string> {
    const result = new Map<string, string>();
    for (const [path, entry] of this.archive) {
      result.set(path, entry.content);
    }
    return result;
  }

  /**
   * Clear all files (for testing)
   */
  clear(): void {
    this.files.clear();
    this.archive.clear();
  }

  /**
   * Seed with initial files (for testing)
   */
  seed(files: Record<string, string>): void {
    const timestamp = now();
    for (const [path, content] of Object.entries(files)) {
      this.files.set(this.normalizePath(path), {
        content,
        modificationTime: timestamp,
      });
    }
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  /**
   * Normalize a file path
   */
  private normalizePath(path: string): string {
    // Remove leading/trailing slashes
    let normalized = path.replace(/^\/+|\/+$/g, "");
    // Normalize multiple slashes
    normalized = normalized.replace(/\/+/g, "/");
    return normalized;
  }

  /**
   * Ensure parent directories exist (no-op in memory, but tracks structure)
   */
  private ensureParentDirectories(_path: string): void {
    // In a real file system, this would create directories
    // For in-memory, we don't need to do anything
  }
}

// =============================================================================
// IN-MEMORY SYNC STATE STORAGE
// =============================================================================

import type { NodeId } from "../../types/lkgc/foundation";
import type {
  MarkdownFile,
  PendingNode,
  DeletionState,
  DeletionStatus,
  SimpleSyncRecord,
} from "./markdown-types";
import type { SyncStateStorage } from "./markdown-sync-engine";

/**
 * In-memory sync state storage for testing
 */
export class InMemorySyncStateStorage implements SyncStateStorage {
  private lastExports: Map<NodeId, MarkdownFile> = new Map();
  private pendingNodes: Map<NodeId, PendingNode> = new Map();
  private pendingDeletions: Map<NodeId, DeletionState> = new Map();
  private operationHistory: Map<NodeId, SimpleSyncRecord[]> = new Map();
  private pathMappings: Map<string, NodeId> = new Map();

  /**
   * Get last exported file for a node
   */
  async getLastExport(nodeId: NodeId): Promise<MarkdownFile | undefined> {
    return this.lastExports.get(nodeId);
  }

  /**
   * Store last exported file for a node
   */
  async setLastExport(nodeId: NodeId, file: MarkdownFile): Promise<void> {
    this.lastExports.set(nodeId, file);
  }

  /**
   * Get all pending nodes
   */
  async getPendingNodes(): Promise<readonly PendingNode[]> {
    return Array.from(this.pendingNodes.values());
  }

  /**
   * Add pending node
   */
  async addPendingNode(node: PendingNode): Promise<void> {
    this.pendingNodes.set(node.tempId, node);
  }

  /**
   * Remove pending node (when resolved)
   */
  async removePendingNode(tempId: NodeId): Promise<void> {
    this.pendingNodes.delete(tempId);
  }

  /**
   * Get all pending deletions
   */
  async getPendingDeletions(): Promise<readonly DeletionState[]> {
    return Array.from(this.pendingDeletions.values());
  }

  /**
   * Add pending deletion
   */
  async addPendingDeletion(deletion: DeletionState): Promise<void> {
    this.pendingDeletions.set(deletion.nodeId, deletion);
  }

  /**
   * Update deletion status
   */
  async updateDeletionStatus(
    nodeId: NodeId,
    status: DeletionStatus,
  ): Promise<void> {
    const deletion = this.pendingDeletions.get(nodeId);
    if (deletion) {
      this.pendingDeletions.set(nodeId, { ...deletion, status });
    }
  }

  /**
   * Remove deletion state (when resolved)
   */
  async removeDeletionState(nodeId: NodeId): Promise<void> {
    this.pendingDeletions.delete(nodeId);
  }

  /**
   * Record sync operation
   */
  async recordOperation(record: SimpleSyncRecord): Promise<void> {
    if (!record.nodeId) return;
    const history = this.operationHistory.get(record.nodeId) || [];
    history.push(record);
    this.operationHistory.set(record.nodeId, history);
  }

  /**
   * Get sync history for a node
   */
  async getSyncHistory(
    nodeId: NodeId,
    limit?: number,
  ): Promise<readonly SimpleSyncRecord[]> {
    const history = this.operationHistory.get(nodeId) || [];
    if (limit !== undefined) {
      return history.slice(-limit);
    }
    return history;
  }

  /**
   * Get node ID by file path
   */
  async getNodeIdByPath(path: string): Promise<NodeId | undefined> {
    return this.pathMappings.get(path);
  }

  /**
   * Set mapping from file path to node ID
   */
  async setPathMapping(path: string, nodeId: NodeId): Promise<void> {
    this.pathMappings.set(path, nodeId);
  }

  // =========================================================================
  // TEST HELPERS
  // =========================================================================

  /**
   * Clear all state (for testing)
   */
  clear(): void {
    this.lastExports.clear();
    this.pendingNodes.clear();
    this.pendingDeletions.clear();
    this.operationHistory.clear();
    this.pathMappings.clear();
  }

  /**
   * Get all state for debugging
   */
  getDebugState(): {
    lastExports: number;
    pendingNodes: number;
    pendingDeletions: number;
    pathMappings: number;
  } {
    return {
      lastExports: this.lastExports.size,
      pendingNodes: this.pendingNodes.size,
      pendingDeletions: this.pendingDeletions.size,
      pathMappings: this.pathMappings.size,
    };
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create an in-memory file system for testing
 */
export function createInMemoryFileSystem(): InMemoryFileSystem {
  return new InMemoryFileSystem();
}

/**
 * Create an in-memory sync state storage for testing
 */
export function createInMemorySyncStateStorage(): InMemorySyncStateStorage {
  return new InMemorySyncStateStorage();
}
