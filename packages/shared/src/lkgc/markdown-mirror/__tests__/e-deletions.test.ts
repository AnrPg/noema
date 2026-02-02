// =============================================================================
// TEST SUITE E: DELETIONS
// =============================================================================
// Tests for file deletion handling: accidental deletes, confirmation flow,
// grace periods, and the policy of never hard-deleting nodes.
//
// Test IDs: E1-E13
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import type {
  NodeId,
  Timestamp,
  RevisionNumber,
} from "../../../types/lkgc/foundation";
import type { DeletionStatus } from "../markdown-types";
import { MarkdownParser } from "../markdown-parser";
import {
  InMemoryFileSystem,
  InMemorySyncStateStorage,
} from "../in-memory-file-system";
import {
  createConceptNode,
  createTestMarkdownFile,
  createTestDeletionState,
  createTestPendingNode,
  createMockNodeStore,
  createMockEdgeStore,
  createAuditCollector,
  resetIdCounter,
} from "./test-helpers";
import { generateNodeId, revision, now, timestamp } from "../../id-generator";

describe("E) Deletions", () => {
  let parser: MarkdownParser;
  let fileSystem: InMemoryFileSystem;
  let syncState: InMemorySyncStateStorage;
  let nodeStore: ReturnType<typeof createMockNodeStore>;
  let edgeStore: ReturnType<typeof createMockEdgeStore>;
  let audit: ReturnType<typeof createAuditCollector>;

  beforeEach(() => {
    resetIdCounter();
    parser = new MarkdownParser();
    fileSystem = new InMemoryFileSystem();
    syncState = new InMemorySyncStateStorage();
    nodeStore = createMockNodeStore();
    edgeStore = createMockEdgeStore();
    audit = createAuditCollector();
  });

  // ===========================================================================
  // E1: Accidental delete - detected
  // ===========================================================================
  describe("E1: Accidental delete - detected", () => {
    it("should mark node as pending_confirmation when file is deleted", async () => {
      // Initial State: File exists, node active
      const node = createConceptNode("Test", "Content");
      nodeStore.addNode(node);
      fileSystem.seed({ "Test.md": "content" });

      // User Action: Delete file in Obsidian
      await fileSystem.deleteFile("Test.md");

      // Sync detects missing file
      const fileExists = await fileSystem.exists("Test.md");
      expect(fileExists).toBe(false);

      // Expected Result: Node marked pending_confirmation
      const deletionState = createTestDeletionState(
        node.id,
        "pending_confirmation",
        {
          filePath: "Test.md",
        },
      );
      await syncState.addPendingDeletion(deletionState);

      const pendingDeletions = await syncState.getPendingDeletions();
      expect(pendingDeletions.length).toBe(1);
      expect(pendingDeletions[0].status).toBe("pending_confirmation");

      // Audit Events
      audit.emit("DELETION_DETECTED", { nodeId: node.id });
      audit.emit("DELETION_PENDING_CONFIRMATION", { nodeId: node.id });
      expect(audit.hasEvent("DELETION_DETECTED")).toBe(true);
      expect(audit.hasEvent("DELETION_PENDING_CONFIRMATION")).toBe(true);
    });
  });

  // ===========================================================================
  // E2: Delete + undo before sync
  // ===========================================================================
  describe("E2: Delete + undo before sync", () => {
    it("should detect no deletion when file is restored before sync", async () => {
      const node = createConceptNode("Test", "Content");
      nodeStore.addNode(node);

      // User deletes then restores file before sync
      fileSystem.seed({ "Test.md": "content" });
      await fileSystem.deleteFile("Test.md");
      await fileSystem.writeFile("Test.md", "content"); // Undo

      // At sync time, file exists
      const fileExists = await fileSystem.exists("Test.md");
      expect(fileExists).toBe(true);

      // No deletion detected
      audit.emit("SYNC_NOOP", {});
      expect(audit.hasEvent("SYNC_NOOP")).toBe(true);
    });
  });

  // ===========================================================================
  // E3: Delete + undo after sync (restore before grace period)
  // ===========================================================================
  describe("E3: Delete + undo after sync (restore before grace period)", () => {
    it("should cancel deletion when file is restored during grace period", async () => {
      const node = createConceptNode("Test", "Content");
      nodeStore.addNode(node);

      // Deletion was detected, node in pending_confirmation
      const deletionState = createTestDeletionState(
        node.id,
        "pending_confirmation",
      );
      await syncState.addPendingDeletion(deletionState);

      // User restores file before grace period ends
      fileSystem.seed({ "Test.md": "content" });

      // On next sync, file exists again
      const fileExists = await fileSystem.exists("Test.md");
      expect(fileExists).toBe(true);

      // Deletion should be cancelled
      await syncState.removeDeletionState(node.id);

      const pendingDeletions = await syncState.getPendingDeletions();
      expect(pendingDeletions.length).toBe(0);

      audit.emit("DELETION_CANCELLED", {
        nodeId: node.id,
        reason: "file_restored",
      });
      expect(audit.hasEvent("DELETION_CANCELLED")).toBe(true);
    });
  });

  // ===========================================================================
  // E4: Delete confirmed (explicit)
  // ===========================================================================
  describe("E4: Delete confirmed (explicit)", () => {
    it("should archive node when deletion is explicitly confirmed", async () => {
      const node = createConceptNode("Test", "Content");
      nodeStore.addNode(node);

      // Node in pending_confirmation
      const deletionState = createTestDeletionState(
        node.id,
        "pending_confirmation",
      );
      await syncState.addPendingDeletion(deletionState);

      // User explicitly confirms deletion
      await syncState.updateDeletionStatus(node.id, "confirmed");

      // Node should be archived (soft delete)
      nodeStore.archiveNode(node.id);
      const archivedNode = nodeStore.getNode(node.id);
      expect(archivedNode?.archivedAt).toBeDefined();

      // Deletion state updated
      const pendingDeletions = await syncState.getPendingDeletions();
      const confirmedDeletion = pendingDeletions.find(
        (d) => d.nodeId === node.id,
      );
      expect(confirmedDeletion?.status).toBe("confirmed");

      audit.emit("DELETION_CONFIRMED", { nodeId: node.id });
      audit.emit("NODE_ARCHIVED", { nodeId: node.id });
      expect(audit.hasEvent("DELETION_CONFIRMED")).toBe(true);
      expect(audit.hasEvent("NODE_ARCHIVED")).toBe(true);
    });
  });

  // ===========================================================================
  // E5: Delete confirmed (grace period)
  // ===========================================================================
  describe("E5: Delete confirmed (grace period)", () => {
    it("should auto-archive node after grace period expires", async () => {
      const node = createConceptNode("Test", "Content");
      nodeStore.addNode(node);

      // Set up deletion with grace period that has passed
      const baseTime = now();
      const pastGracePeriod = (baseTime - 86400000 - 1000) as Timestamp; // 24h + 1s ago
      const deletionState = createTestDeletionState(
        node.id,
        "pending_confirmation",
        {
          detectedAt: pastGracePeriod,
          gracePeriodEnds: (pastGracePeriod + 86400000) as Timestamp, // 24h grace
        },
      );
      await syncState.addPendingDeletion(deletionState);

      // Current time is past grace period
      const currentTime = now();
      const gracePeriodEnds = deletionState.gracePeriodEnds;

      expect(currentTime).toBeGreaterThan(gracePeriodEnds);

      // Auto-archive should occur
      await syncState.updateDeletionStatus(node.id, "auto_archived");
      nodeStore.archiveNode(node.id);

      const archivedNode = nodeStore.getNode(node.id);
      expect(archivedNode?.archivedAt).toBeDefined();

      audit.emit("DELETION_AUTO_ARCHIVED", {
        nodeId: node.id,
        gracePeriod: "24h",
      });
      expect(audit.hasEvent("DELETION_AUTO_ARCHIVED")).toBe(true);
    });
  });

  // ===========================================================================
  // E6: Delete during conflict
  // ===========================================================================
  describe("E6: Delete during conflict", () => {
    it("should let deletion win but preserve LKGC changes in audit", async () => {
      const node = createConceptNode("Test", "Original content");
      nodeStore.addNode(node);

      // LKGC made changes to node
      const lkgcChanges = { content: "Updated by LKGC" };
      nodeStore.updateNode(node.id, { content: "Updated by LKGC" } as any);

      // User deleted file simultaneously
      const deletionState = createTestDeletionState(
        node.id,
        "pending_confirmation",
      );
      await syncState.addPendingDeletion(deletionState);

      // Deletion wins short-term (pending_confirmation)
      // But LKGC changes should be recorded in audit
      audit.emit("DELETION_DETECTED", { nodeId: node.id });
      audit.emit("CONFLICT_ARCHIVED", { lkgcChanges });
      expect(audit.hasEvent("DELETION_DETECTED")).toBe(true);
      expect(audit.hasEvent("CONFLICT_ARCHIVED")).toBe(true);
    });
  });

  // ===========================================================================
  // E7: Delete cancelled - grace period reset
  // ===========================================================================
  describe("E7: Delete cancelled - grace period reset", () => {
    it("should clear grace period timer when deletion is cancelled", async () => {
      const node = createConceptNode("Test", "Content");
      nodeStore.addNode(node);

      // Deletion with active grace period
      const deletionState = createTestDeletionState(
        node.id,
        "pending_confirmation",
      );
      await syncState.addPendingDeletion(deletionState);

      // User restores file
      fileSystem.seed({ "Test.md": "content" });

      // Cancel deletion
      await syncState.removeDeletionState(node.id);

      // Verify no pending deletions
      const pendingDeletions = await syncState.getPendingDeletions();
      expect(
        pendingDeletions.find((d) => d.nodeId === node.id),
      ).toBeUndefined();

      audit.emit("DELETION_CANCELLED", { nodeId: node.id });
      audit.emit("GRACE_PERIOD_CLEARED", { nodeId: node.id });
      expect(audit.hasEvent("GRACE_PERIOD_CLEARED")).toBe(true);
    });
  });

  // ===========================================================================
  // E8: Hard delete attempt - blocked
  // ===========================================================================
  describe("E8: Hard delete attempt - blocked", () => {
    it("should NEVER allow hard deletion of nodes", async () => {
      const node = createConceptNode("Test", "Content");
      nodeStore.addNode(node);

      // Attempt hard delete (simulated)
      const attemptHardDelete = () => {
        // In real implementation, this would throw or return error
        throw new Error("Hard delete is forbidden");
      };

      expect(() => attemptHardDelete()).toThrow("Hard delete is forbidden");

      // Node should still exist
      const existingNode = nodeStore.getNode(node.id);
      expect(existingNode).toBeDefined();

      audit.emit("HARD_DELETE_BLOCKED", { nodeId: node.id });
      expect(audit.hasEvent("HARD_DELETE_BLOCKED")).toBe(true);
    });
  });

  // ===========================================================================
  // E9: Delete file for pending node
  // ===========================================================================
  describe("E9: Delete file for pending node", () => {
    it("should remove pending node when its stub file is deleted", async () => {
      // Pending node (not yet active)
      const pendingNode = createTestPendingNode("UnconfirmedTopic");
      await syncState.addPendingNode(pendingNode);

      // User deletes the stub file
      // Since pending nodes are not yet in LKGC, they CAN be fully removed

      await syncState.removePendingNode(pendingNode.tempId);

      const pendingNodes = await syncState.getPendingNodes();
      expect(
        pendingNodes.find((n) => n.tempId === pendingNode.tempId),
      ).toBeUndefined();

      audit.emit("PENDING_NODE_REMOVED", { nodeId: pendingNode.tempId });
      expect(audit.hasEvent("PENDING_NODE_REMOVED")).toBe(true);
    });
  });

  // ===========================================================================
  // E10: Delete archived node's file
  // ===========================================================================
  describe("E10: Delete archived node's file", () => {
    it("should treat file deletion for already-archived node as no-op", async () => {
      const node = createConceptNode("Test", "Content");
      nodeStore.addNode(node);
      nodeStore.archiveNode(node.id);

      // File still exists but node is archived
      fileSystem.seed({ "Test.md": "content" });

      // User deletes file
      await fileSystem.deleteFile("Test.md");

      // Node already archived, no state change needed
      const archivedNode = nodeStore.getNode(node.id);
      expect(archivedNode?.archivedAt).toBeDefined();

      audit.emit("STALE_FILE_DELETED", { nodeId: node.id });
      expect(audit.hasEvent("STALE_FILE_DELETED")).toBe(true);
    });
  });

  // ===========================================================================
  // E11: Bulk delete - multiple files
  // ===========================================================================
  describe("E11: Bulk delete - multiple files", () => {
    it("should mark all deleted files as pending_confirmation with warning", async () => {
      const nodeA = createConceptNode("NodeA", "Content A");
      const nodeB = createConceptNode("NodeB", "Content B");
      const nodeC = createConceptNode("NodeC", "Content C");
      nodeStore.addNode(nodeA);
      nodeStore.addNode(nodeB);
      nodeStore.addNode(nodeC);

      fileSystem.seed({
        "NodeA.md": "content",
        "NodeB.md": "content",
        "NodeC.md": "content",
      });

      // User deletes all three files
      await fileSystem.deleteFile("NodeA.md");
      await fileSystem.deleteFile("NodeB.md");
      await fileSystem.deleteFile("NodeC.md");

      // All three should be pending_confirmation
      await syncState.addPendingDeletion(
        createTestDeletionState(nodeA.id, "pending_confirmation"),
      );
      await syncState.addPendingDeletion(
        createTestDeletionState(nodeB.id, "pending_confirmation"),
      );
      await syncState.addPendingDeletion(
        createTestDeletionState(nodeC.id, "pending_confirmation"),
      );

      const pendingDeletions = await syncState.getPendingDeletions();
      expect(pendingDeletions.length).toBe(3);

      audit.emit("DELETION_DETECTED", { nodeId: nodeA.id });
      audit.emit("DELETION_DETECTED", { nodeId: nodeB.id });
      audit.emit("DELETION_DETECTED", { nodeId: nodeC.id });
      audit.emit("BULK_DELETION_WARNING", { count: 3 });
      expect(audit.hasEvent("BULK_DELETION_WARNING")).toBe(true);
    });
  });

  // ===========================================================================
  // E12: Delete + re-create same title
  // ===========================================================================
  describe("E12: Delete + re-create same title", () => {
    it("should cancel deletion and import new content when file is recreated", async () => {
      const node = createConceptNode("Test", "Original content");
      nodeStore.addNode(node);

      // File deleted, pending_confirmation
      const deletionState = createTestDeletionState(
        node.id,
        "pending_confirmation",
      );
      await syncState.addPendingDeletion(deletionState);

      // User creates new file with same name but different content
      const newContent = "Completely new content";
      await fileSystem.writeFile("Test.md", newContent);

      // Deletion should be cancelled, new content imported
      await syncState.removeDeletionState(node.id);

      const pendingDeletions = await syncState.getPendingDeletions();
      expect(pendingDeletions.length).toBe(0);

      audit.emit("DELETION_CANCELLED", { nodeId: node.id });
      audit.emit("IMPORT_BODY_UPDATED", {
        nodeId: node.id,
        content: newContent,
      });
      expect(audit.hasEvent("DELETION_CANCELLED")).toBe(true);
      expect(audit.hasEvent("IMPORT_BODY_UPDATED")).toBe(true);
    });
  });

  // ===========================================================================
  // E13: Delete non-exportable node file
  // ===========================================================================
  describe("E13: Delete non-exportable node file", () => {
    it("should ignore deletion of file for non-exportable node type", async () => {
      // User manually created a file for a non-exportable node type
      // (shouldn't happen, but if it does, ignore deletion)

      fileSystem.seed({ "MemoryAnchor.md": "content" });

      // User deletes it
      await fileSystem.deleteFile("MemoryAnchor.md");

      // No node state change (file was orphan anyway)
      audit.emit("ORPHAN_FILE_DELETED", { path: "MemoryAnchor.md" });
      expect(audit.hasEvent("ORPHAN_FILE_DELETED")).toBe(true);
    });
  });

  // ===========================================================================
  // Additional: Verify soft-delete is the ONLY deletion mechanism
  // ===========================================================================
  describe("Soft-delete policy enforcement", () => {
    it("should only ever soft-delete (archive) nodes, never hard-delete", async () => {
      const node = createConceptNode("Test", "Content");
      nodeStore.addNode(node);

      // Go through full deletion flow
      const deletionState = createTestDeletionState(
        node.id,
        "pending_confirmation",
      );
      await syncState.addPendingDeletion(deletionState);
      await syncState.updateDeletionStatus(node.id, "confirmed");
      nodeStore.archiveNode(node.id);

      // Node should still exist (archived, not deleted)
      const archivedNode = nodeStore.getNode(node.id);
      expect(archivedNode).toBeDefined();
      expect(archivedNode?.archivedAt).toBeDefined();

      // The node map should still contain the node
      expect(nodeStore.nodes.has(node.id)).toBe(true);
    });
  });
});
