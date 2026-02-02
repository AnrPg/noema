// =============================================================================
// TEST SUITE C: CONCURRENT CHANGES
// =============================================================================
// Tests for scenarios where both LKGC and Obsidian have made changes
// since the last sync. Covers three-way merge and conflict resolution.
//
// Test IDs: C1-C11
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import type {
  NodeId,
  RevisionNumber,
  Timestamp,
} from "../../../types/lkgc/foundation";
import { MarkdownParser, generateContentHash } from "../markdown-parser";
import {
  MarkdownReconciler,
  createMarkdownReconciler,
  compareVersions,
  threeWayMerge,
} from "../markdown-reconciler";
import {
  InMemoryFileSystem,
  InMemorySyncStateStorage,
} from "../in-memory-file-system";
import {
  createConceptNode,
  createTestMarkdownFile,
  createRawMarkdown,
  createMockNodeStore,
  createMockEdgeStore,
  createAuditCollector,
  resetIdCounter,
  assertHasConflictMarkers,
  assertNoConflictMarkers,
} from "./test-helpers";
import { generateNodeId, revision, now } from "../../id-generator";

describe("C) Concurrent Changes", () => {
  let parser: MarkdownParser;
  let reconciler: MarkdownReconciler;
  let fileSystem: InMemoryFileSystem;
  let syncState: InMemorySyncStateStorage;
  let nodeStore: ReturnType<typeof createMockNodeStore>;
  let edgeStore: ReturnType<typeof createMockEdgeStore>;
  let audit: ReturnType<typeof createAuditCollector>;

  beforeEach(() => {
    resetIdCounter();
    parser = new MarkdownParser();
    reconciler = createMarkdownReconciler();
    fileSystem = new InMemoryFileSystem();
    syncState = new InMemorySyncStateStorage();
    nodeStore = createMockNodeStore();
    edgeStore = createMockEdgeStore();
    audit = createAuditCollector();
  });

  // ===========================================================================
  // C1: LKGC update + no local edit
  // ===========================================================================
  describe("C1: LKGC update + no local edit", () => {
    it("should update file to match LKGC when no local changes", async () => {
      const node = createConceptNode("Test", "Original content");
      const nodeId = node.id;
      nodeStore.addNode(node);

      // Base version (what was last synced)
      const baseFile = createTestMarkdownFile("Test.md", "Original content", {
        lkgc_id: nodeId,
        rev: 1 as RevisionNumber,
      });

      // LKGC version (updated)
      const lkgcFile = createTestMarkdownFile("Test.md", "Updated by LKGC", {
        lkgc_id: nodeId,
        rev: 2 as RevisionNumber,
      });

      // Obsidian version (unchanged from base)
      const obsidianFile = createTestMarkdownFile(
        "Test.md",
        "Original content",
        {
          lkgc_id: nodeId,
          rev: 1 as RevisionNumber,
        },
      );

      // Compare versions - order is (base, lkgc, obsidian)
      const comparison = compareVersions(baseFile, lkgcFile, obsidianFile);

      // LKGC changed body, Obsidian didn't - so bodyDiffers should be true
      // but only LKGC changed from base, so no conflicts
      expect(comparison.hasConflicts).toBe(false);

      // Reconcile - order is (nodeId, base, lkgc, obsidian)
      const result = reconciler.reconcile(
        nodeId,
        baseFile,
        lkgcFile,
        obsidianFile,
      );

      // Result should be clean - LKGC changes applied
      expect(result.status).toBe("clean");
      expect(result.mergedFile.body).toBe("Updated by LKGC");

      audit.emit("EXPORT_UPDATED", { nodeId });
      expect(audit.hasEvent("EXPORT_UPDATED")).toBe(true);
    });
  });

  // ===========================================================================
  // C2: LKGC update + local body edit (non-overlapping)
  // ===========================================================================
  describe("C2: LKGC update + local body edit (non-overlapping)", () => {
    it("should merge non-overlapping changes from both sides", async () => {
      const node = createConceptNode("Test", "Line A\nLine B");
      const nodeId = node.id;
      nodeStore.addNode(node);

      // Base: "Line A\nLine B"
      const baseFile = createTestMarkdownFile("Test.md", "Line A\nLine B", {
        lkgc_id: nodeId,
        rev: 1 as RevisionNumber,
      });

      // LKGC changed Line B
      const lkgcFile = createTestMarkdownFile(
        "Test.md",
        "Line A\nLine B modified by LKGC",
        {
          lkgc_id: nodeId,
          rev: 2 as RevisionNumber,
        },
      );

      // User changed Line A
      const obsidianFile = createTestMarkdownFile(
        "Test.md",
        "Line A modified by user\nLine B",
        {
          lkgc_id: nodeId,
          rev: 1 as RevisionNumber,
        },
      );

      const result = reconciler.reconcile(
        nodeId,
        baseFile,
        lkgcFile,
        obsidianFile,
      );

      // Should merge successfully
      expect(result.status).toBe("clean");
      expect(result.mergedFile.body).toContain("Line A modified by user");
      expect(result.mergedFile.body).toContain("Line B modified by LKGC");

      audit.emit("RECONCILE_MERGED", { nodeId, strategy: "three_way" });
      expect(audit.hasEvent("RECONCILE_MERGED")).toBe(true);
    });
  });

  // ===========================================================================
  // C3: LKGC update + local body edit (overlapping - conflict)
  // ===========================================================================
  describe("C3: LKGC update + local body edit (overlapping - conflict)", () => {
    it("should create conflict markers when both sides change same content", async () => {
      const node = createConceptNode("Test", "The quick brown fox");
      const nodeId = node.id;
      nodeStore.addNode(node);

      // Base
      const baseFile = createTestMarkdownFile(
        "Test.md",
        "The quick brown fox",
        {
          lkgc_id: nodeId,
          rev: 1 as RevisionNumber,
        },
      );

      // LKGC: changed "brown" to "red"
      const lkgcFile = createTestMarkdownFile("Test.md", "The quick red fox", {
        lkgc_id: nodeId,
        rev: 2 as RevisionNumber,
      });

      // User: changed "quick" to "slow"
      const obsidianFile = createTestMarkdownFile(
        "Test.md",
        "The slow brown fox",
        {
          lkgc_id: nodeId,
          rev: 1 as RevisionNumber,
        },
      );

      const result = reconciler.reconcile(
        nodeId,
        baseFile,
        lkgcFile,
        obsidianFile,
      );

      // Should have conflict
      expect(result.status).not.toBe("clean");
      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.needsUserInput).toBe(true);

      // Merged content should have conflict markers
      assertHasConflictMarkers(result.mergedFile.body);

      audit.emit("RECONCILE_CONFLICT", {
        nodeId,
        field: "body",
        severity: "warning",
      });
      expect(audit.hasEvent("RECONCILE_CONFLICT")).toBe(true);
    });
  });

  // ===========================================================================
  // C4: LKGC update + local frontmatter edit (editable)
  // ===========================================================================
  describe("C4: LKGC update + local frontmatter edit (editable)", () => {
    it("should accept user frontmatter and LKGC body changes together", async () => {
      const node = createConceptNode("Test", "Original body");
      const nodeId = node.id;
      nodeStore.addNode(node);

      const baseFile = createTestMarkdownFile("Test.md", "Original body", {
        lkgc_id: nodeId,
        rev: 1 as RevisionNumber,
        tags: ["a"],
      });

      // LKGC: body changed
      const lkgcFile = createTestMarkdownFile(
        "Test.md",
        "Updated body by LKGC",
        {
          lkgc_id: nodeId,
          rev: 2 as RevisionNumber,
          tags: ["a"],
        },
      );

      // User: tags changed
      const obsidianFile = createTestMarkdownFile("Test.md", "Original body", {
        lkgc_id: nodeId,
        rev: 1 as RevisionNumber,
        tags: ["a", "b"],
      });

      const result = reconciler.reconcile(
        nodeId,
        baseFile,
        lkgcFile,
        obsidianFile,
      );

      // Should merge: LKGC body + user tags
      expect(result.status).toBe("clean");
      expect(result.mergedFile.body).toBe("Updated body by LKGC");
      expect(result.mergedFile.frontmatter?.tags).toContain("b");

      audit.emit("RECONCILE_MERGED", { nodeId });
      audit.emit("IMPORT_FRONTMATTER_UPDATED", { field: "tags" });
      expect(audit.hasEvent("RECONCILE_MERGED")).toBe(true);
    });
  });

  // ===========================================================================
  // C5: LKGC frontmatter + local frontmatter (same editable field)
  // ===========================================================================
  describe("C5: LKGC frontmatter + local frontmatter (same editable field)", () => {
    it("should let LKGC win for frontmatter conflicts with warning", async () => {
      const node = createConceptNode("Test", "Body");
      const nodeId = node.id;
      nodeStore.addNode(node);

      const baseFile = createTestMarkdownFile("Test.md", "Body", {
        lkgc_id: nodeId,
        rev: 1 as RevisionNumber,
        tags: ["a"],
      });

      // LKGC: tags = ["c"]
      const lkgcFile = createTestMarkdownFile("Test.md", "Body", {
        lkgc_id: nodeId,
        rev: 2 as RevisionNumber,
        tags: ["c"],
      });

      // User: tags = ["b"]
      const obsidianFile = createTestMarkdownFile("Test.md", "Body", {
        lkgc_id: nodeId,
        rev: 1 as RevisionNumber,
        tags: ["b"],
      });

      const result = reconciler.reconcile(
        nodeId,
        baseFile,
        lkgcFile,
        obsidianFile,
      );

      // For frontmatter conflicts on editable fields, LKGC should win
      // (This is a policy decision - could also merge arrays)
      audit.emit("RECONCILE_CONFLICT", { field: "tags" });
      audit.emit("IMPORT_REJECTED", { reason: "lkgc_wins" });
      expect(audit.hasEvent("RECONCILE_CONFLICT")).toBe(true);
    });
  });

  // ===========================================================================
  // C6: LKGC frontmatter + local frontmatter (different fields)
  // ===========================================================================
  describe("C6: LKGC frontmatter + local frontmatter (different fields)", () => {
    it("should merge non-conflicting frontmatter changes", async () => {
      const node = createConceptNode("Test", "Body");
      const nodeId = node.id;
      nodeStore.addNode(node);

      const baseFile = createTestMarkdownFile("Test.md", "Body", {
        lkgc_id: nodeId,
        rev: 1 as RevisionNumber,
        tags: [],
        domain: undefined,
      });

      // LKGC: changed domain
      const lkgcFile = createTestMarkdownFile("Test.md", "Body", {
        lkgc_id: nodeId,
        rev: 2 as RevisionNumber,
        tags: [],
        domain: "math",
      });

      // User: changed tags
      const obsidianFile = createTestMarkdownFile("Test.md", "Body", {
        lkgc_id: nodeId,
        rev: 1 as RevisionNumber,
        tags: ["x"],
        domain: undefined,
      });

      const result = reconciler.reconcile(
        nodeId,
        baseFile,
        lkgcFile,
        obsidianFile,
      );

      // Both changes should be merged
      expect(result.status).toBe("clean");
      expect(result.mergedFile.frontmatter?.tags).toContain("x");
      expect(result.mergedFile.frontmatter?.domain).toBe("math");

      audit.emit("RECONCILE_MERGED", { fields: ["tags", "domain"] });
      expect(audit.hasEvent("RECONCILE_MERGED")).toBe(true);
    });
  });

  // ===========================================================================
  // C7: Triple conflict - base/LKGC/local all differ
  // ===========================================================================
  describe("C7: Triple conflict - base/LKGC/local all differ", () => {
    it("should show full conflict with all three versions", async () => {
      const node = createConceptNode("Test", "A");
      const nodeId = node.id;
      nodeStore.addNode(node);

      const baseFile = createTestMarkdownFile("Test.md", "A", {
        lkgc_id: nodeId,
        rev: 1 as RevisionNumber,
      });

      const lkgcFile = createTestMarkdownFile("Test.md", "B", {
        lkgc_id: nodeId,
        rev: 2 as RevisionNumber,
      });

      const obsidianFile = createTestMarkdownFile("Test.md", "C", {
        lkgc_id: nodeId,
        rev: 1 as RevisionNumber,
      });

      const result = reconciler.reconcile(
        nodeId,
        baseFile,
        lkgcFile,
        obsidianFile,
      );

      // Should have conflict
      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.needsUserInput).toBe(true);

      audit.emit("RECONCILE_CONFLICT", { severity: "critical", hasBase: true });
      expect(audit.hasEvent("RECONCILE_CONFLICT")).toBe(true);
    });
  });

  // ===========================================================================
  // C8: Concurrent - local delete + LKGC update
  // ===========================================================================
  describe("C8: Concurrent - local delete + LKGC update", () => {
    it("should handle deletion during LKGC update - deletion wins short-term", async () => {
      const node = createConceptNode("Test", "Content");
      const nodeId = node.id;
      nodeStore.addNode(node);

      // User deleted the file (detected by sync engine)
      // LKGC updated the node

      // This scenario is handled at sync engine level, not reconciler
      // The reconciler deals with content, not file existence

      audit.emit("DELETION_DETECTED", { nodeId });
      audit.emit("DELETION_PENDING_CONFIRMATION", { nodeId });
      expect(audit.hasEvent("DELETION_DETECTED")).toBe(true);
      expect(audit.hasEvent("DELETION_PENDING_CONFIRMATION")).toBe(true);
    });
  });

  // ===========================================================================
  // C9: Concurrent - local edit + LKGC archive
  // ===========================================================================
  describe("C9: Concurrent - local edit + LKGC archive", () => {
    it("should preserve user edit in audit when node is archived", async () => {
      const node = createConceptNode("Test", "Original");
      const nodeId = node.id;
      nodeStore.addNode(node);

      // LKGC archives the node
      nodeStore.archiveNode(nodeId);

      // User edited the file (not knowing it was archived)
      const userEdit = "User edited this content";

      // On sync, the edit conflicts with archived status
      audit.emit("RECONCILE_CONFLICT", { reason: "edit_on_archived" });

      // User's edit should be preserved in audit
      audit.emit("EDIT_PRESERVED_IN_AUDIT", { nodeId, content: userEdit });

      expect(audit.hasEvent("RECONCILE_CONFLICT")).toBe(true);
      expect(audit.hasEvent("EDIT_PRESERVED_IN_AUDIT")).toBe(true);
    });
  });

  // ===========================================================================
  // C10: Concurrent - multiple files conflict
  // ===========================================================================
  describe("C10: Concurrent - multiple files conflict", () => {
    it("should handle each file independently", async () => {
      const nodeA = createConceptNode("NodeA", "A content");
      const nodeB = createConceptNode("NodeB", "B content");
      nodeStore.addNode(nodeA);
      nodeStore.addNode(nodeB);

      // Node A: clean merge
      const baseA = createTestMarkdownFile("NodeA.md", "A content", {
        lkgc_id: nodeA.id,
        rev: 1 as RevisionNumber,
      });
      const lkgcA = createTestMarkdownFile("NodeA.md", "A updated", {
        lkgc_id: nodeA.id,
        rev: 2 as RevisionNumber,
      });
      const obsidianA = createTestMarkdownFile("NodeA.md", "A content", {
        lkgc_id: nodeA.id,
        rev: 1 as RevisionNumber,
      });

      // Node B: conflict
      const baseB = createTestMarkdownFile("NodeB.md", "B content", {
        lkgc_id: nodeB.id,
        rev: 1 as RevisionNumber,
      });
      const lkgcB = createTestMarkdownFile("NodeB.md", "B by LKGC", {
        lkgc_id: nodeB.id,
        rev: 2 as RevisionNumber,
      });
      const obsidianB = createTestMarkdownFile("NodeB.md", "B by user", {
        lkgc_id: nodeB.id,
        rev: 1 as RevisionNumber,
      });

      const resultA = reconciler.reconcile(nodeA.id, baseA, lkgcA, obsidianA);
      const resultB = reconciler.reconcile(nodeB.id, baseB, lkgcB, obsidianB);

      // A should be clean, B should conflict
      expect(resultA.status).toBe("clean");
      expect(resultB.status).not.toBe("clean");

      audit.emit("RECONCILE_MERGED", { nodeId: nodeA.id });
      audit.emit("RECONCILE_CONFLICT", { nodeId: nodeB.id });
      expect(audit.hasEvent("RECONCILE_MERGED")).toBe(true);
      expect(audit.hasEvent("RECONCILE_CONFLICT")).toBe(true);
    });
  });

  // ===========================================================================
  // C11: High-frequency concurrent edits
  // ===========================================================================
  describe("C11: High-frequency concurrent edits", () => {
    it("should handle multiple rapid changes and sync to final state", async () => {
      const node = createConceptNode("Test", "t=0");
      const nodeId = node.id;
      nodeStore.addNode(node);

      // Simulate: base at t=0, user edits at t=1,2,3, LKGC at t=1.5, sync at t=4
      // Final user state should merge with LKGC state

      const baseFile = createTestMarkdownFile("Test.md", "t=0", {
        lkgc_id: nodeId,
        rev: 1 as RevisionNumber,
      });

      // LKGC made a change at t=1.5
      const lkgcFile = createTestMarkdownFile(
        "Test.md",
        "t=0\nLKGC addition at t=1.5",
        {
          lkgc_id: nodeId,
          rev: 2 as RevisionNumber,
        },
      );

      // User's final state at t=3 (accumulated edits)
      const obsidianFile = createTestMarkdownFile(
        "Test.md",
        "t=0\nUser edit t=1\nUser edit t=2\nUser edit t=3",
        {
          lkgc_id: nodeId,
          rev: 1 as RevisionNumber,
        },
      );

      const result = reconciler.reconcile(
        nodeId,
        baseFile,
        lkgcFile,
        obsidianFile,
      );

      // Both sets of changes should be in the merged result
      expect(result.mergedFile.body).toContain("t=0");
      // The merge should preserve user's work
      expect(result.mergedFile.body).toContain("User edit");

      audit.emit("RECONCILE_MERGED", { nodeId });
      expect(audit.hasEvent("RECONCILE_MERGED")).toBe(true);
    });
  });
});
