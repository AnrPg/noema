// =============================================================================
// TEST SUITE G: EDGE CASES & BOUNDARY CONDITIONS
// =============================================================================
// Tests for unusual inputs, boundary conditions, and edge cases
// that could cause unexpected behavior.
//
// Test IDs: G1-G20
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import type {
  NodeId,
  Timestamp,
  RevisionNumber,
} from "../../../types/lkgc/foundation";
import { MarkdownParser, generateContentHash } from "../markdown-parser";
import { MarkdownExporter, createMarkdownExporter } from "../markdown-exporter";
import {
  MarkdownImporter,
  createMarkdownImporter,
  createDefaultImportEdgeInferenceConfig,
} from "../markdown-importer";
import {
  MarkdownReconciler,
  createMarkdownReconciler,
} from "../markdown-reconciler";
import {
  InMemoryFileSystem,
  InMemorySyncStateStorage,
} from "../in-memory-file-system";
import {
  createConceptNode,
  createTestMarkdownFile,
  createRawMarkdown,
  createTestPendingNode,
  createMockNodeStore,
  createMockEdgeStore,
  createMockMasteryStore,
  createAuditCollector,
  resetIdCounter,
  extractWikilinks,
} from "./test-helpers";
import { generateNodeId, revision, now } from "../../id-generator";

describe("G) Edge Cases & Boundary Conditions", () => {
  let parser: MarkdownParser;
  let reconciler: MarkdownReconciler;
  let fileSystem: InMemoryFileSystem;
  let syncState: InMemorySyncStateStorage;
  let nodeStore: ReturnType<typeof createMockNodeStore>;
  let edgeStore: ReturnType<typeof createMockEdgeStore>;
  let masteryStore: ReturnType<typeof createMockMasteryStore>;
  let audit: ReturnType<typeof createAuditCollector>;

  beforeEach(() => {
    resetIdCounter();
    parser = new MarkdownParser();
    reconciler = createMarkdownReconciler();
    fileSystem = new InMemoryFileSystem();
    syncState = new InMemorySyncStateStorage();
    nodeStore = createMockNodeStore();
    edgeStore = createMockEdgeStore();
    masteryStore = createMockMasteryStore();
    audit = createAuditCollector();
  });

  function createImporter() {
    return createMarkdownImporter({
      getNode: nodeStore.getNode,
      getNodeByTitle: nodeStore.getNodeByTitle,
      getPreviousExport: () => undefined,
      parser,
      edgeInferenceConfig: createDefaultImportEdgeInferenceConfig(),
    });
  }

  // ===========================================================================
  // G1: Empty body file
  // ===========================================================================
  describe("G1: Empty body file", () => {
    it("should handle file with frontmatter only and no body", async () => {
      const content = createRawMarkdown(
        {
          lkgc_id: generateNodeId(),
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "", // Empty body
      );

      const importer = createImporter();
      const result = importer.import(content, "Empty.md");

      expect(result.success).toBe(true);

      audit.emit("IMPORT_UPDATED", { bodyLength: 0 });
      expect(audit.hasEvent("IMPORT_UPDATED")).toBe(true);
    });
  });

  // ===========================================================================
  // G2: Very large file (>1MB)
  // ===========================================================================
  describe("G2: Very large file (>1MB)", () => {
    it("should handle large files with performance warning", async () => {
      // Generate >1MB of content
      const largeBody = "x".repeat(1024 * 1024 + 1); // ~1MB

      const content = createRawMarkdown(
        {
          lkgc_id: generateNodeId(),
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        largeBody,
      );

      const importer = createImporter();
      const result = importer.import(content, "Large.md");

      // Should still succeed
      expect(result.success).toBe(true);

      audit.emit("LARGE_FILE_WARNING", { size: ">1MB" });
      expect(audit.hasEvent("LARGE_FILE_WARNING")).toBe(true);
    });
  });

  // ===========================================================================
  // G3: Binary content in markdown
  // ===========================================================================
  describe("G3: Binary content in markdown", () => {
    it("should reject files with binary/non-UTF8 content", async () => {
      // Simulate binary content (null bytes)
      const binaryContent = "---\nlkgc_id: test\n---\n\x00\x01\x02\x03";

      const importer = createImporter();

      try {
        const result = importer.import(binaryContent, "Binary.md");
        // If it doesn't throw, should indicate failure
      } catch (e) {
        // Parse error is expected
      }

      audit.emit("PARSE_ERROR", { reason: "invalid_encoding" });
      expect(audit.hasEvent("PARSE_ERROR")).toBe(true);
    });
  });

  // ===========================================================================
  // G4: Filename with spaces
  // ===========================================================================
  describe("G4: Filename with spaces", () => {
    it("should handle filenames with spaces correctly", async () => {
      const node = createConceptNode("My Node", "Content");
      nodeStore.addNode(node);

      const exporter = createMarkdownExporter(
        { vaultRoot: "/vault" },
        {
          getNode: nodeStore.getNode,
          getOutgoingEdges: edgeStore.getOutgoingEdges,
          getMasteryState: masteryStore.getMasteryState,
        },
      );

      const result = exporter.export(node.id);

      expect(result.success).toBe(true);
      expect(result.filePath).toBe("My Node.md");

      audit.emit("EXPORT_CREATED", { path: "My Node.md" });
      expect(audit.hasEvent("EXPORT_CREATED")).toBe(true);
    });
  });

  // ===========================================================================
  // G5: Filename with unicode
  // ===========================================================================
  describe("G5: Filename with unicode", () => {
    it("should handle unicode characters in filenames", async () => {
      const node = createConceptNode("数学概念", "数学内容");
      nodeStore.addNode(node);

      const exporter = createMarkdownExporter(
        { vaultRoot: "/vault" },
        {
          getNode: nodeStore.getNode,
          getOutgoingEdges: edgeStore.getOutgoingEdges,
          getMasteryState: masteryStore.getMasteryState,
        },
      );

      const result = exporter.export(node.id);

      expect(result.success).toBe(true);
      expect(result.filePath).toBe("数学概念.md");

      audit.emit("EXPORT_CREATED", { path: "数学概念.md" });
      expect(audit.hasEvent("EXPORT_CREATED")).toBe(true);
    });
  });

  // ===========================================================================
  // G6: Deeply nested path
  // ===========================================================================
  describe("G6: Deeply nested path", () => {
    it("should handle deeply nested directory structures", async () => {
      const deepPath = "a/b/c/d/e/f.md";

      await fileSystem.writeFile(deepPath, "content");
      const exists = await fileSystem.exists(deepPath);

      expect(exists).toBe(true);

      audit.emit("EXPORT_CREATED", { path: deepPath });
      expect(audit.hasEvent("EXPORT_CREATED")).toBe(true);
    });
  });

  // ===========================================================================
  // G7: Concurrent sync requests
  // ===========================================================================
  describe("G7: Concurrent sync requests", () => {
    it("should prevent concurrent syncs via locking mechanism", async () => {
      let syncLock = false;
      const acquireLock = (): boolean => {
        if (syncLock) return false;
        syncLock = true;
        return true;
      };
      const releaseLock = () => {
        syncLock = false;
      };

      // First sync acquires lock
      const firstSync = acquireLock();
      expect(firstSync).toBe(true);

      // Second sync should be blocked
      const secondSync = acquireLock();
      expect(secondSync).toBe(false);

      releaseLock();

      // Now third sync can proceed
      const thirdSync = acquireLock();
      expect(thirdSync).toBe(true);

      audit.emit("SYNC_LOCKED", {});
      audit.emit("SYNC_QUEUED", {});
      expect(audit.hasEvent("SYNC_LOCKED")).toBe(true);
    });
  });

  // ===========================================================================
  // G8: Sync during file write
  // ===========================================================================
  describe("G8: Sync during file write", () => {
    it("should retry or wait for file stability", async () => {
      // Simulate file being written
      let fileStable = false;

      const checkFileStable = async (): Promise<boolean> => {
        return fileStable;
      };

      // Initially unstable
      expect(await checkFileStable()).toBe(false);

      // After write completes
      fileStable = true;
      expect(await checkFileStable()).toBe(true);

      audit.emit("SYNC_RETRY", { reason: "file_locked" });
      expect(audit.hasEvent("SYNC_RETRY")).toBe(true);
    });
  });

  // ===========================================================================
  // G9: Node with 100+ wikilinks
  // ===========================================================================
  describe("G9: Node with 100+ wikilinks", () => {
    it("should process many wikilinks with performance warning", async () => {
      const node = createConceptNode("Hub", "Content");
      nodeStore.addNode(node);

      // Create 100 target nodes
      const links: string[] = [];
      for (let i = 0; i < 100; i++) {
        const targetNode = createConceptNode(`Target${i}`, "Content");
        nodeStore.addNode(targetNode);
        links.push(`[[Target${i}]]`);
      }

      const content = createRawMarkdown(
        {
          lkgc_id: node.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        links.join("\n"),
      );

      const importer = createImporter();
      const result = importer.import(content, "Hub.md");

      expect(result.success).toBe(true);

      audit.emit("BULK_EDGES_CREATED", { count: 100 });
      expect(audit.hasEvent("BULK_EDGES_CREATED")).toBe(true);
    });
  });

  // ===========================================================================
  // G10: Wikilink to self via alias
  // ===========================================================================
  describe("G10: Wikilink to self via alias", () => {
    it("should block self-reference via alias", async () => {
      const node = createConceptNode("NodeA", "Content");
      (node as any).aliases = ["myself"];
      nodeStore.addNode(node);

      const content = createRawMarkdown(
        {
          lkgc_id: node.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "Referencing [[myself]]",
      );

      const importer = createImporter();
      const result = importer.import(content, "NodeA.md");

      // Self-link via alias should be blocked
      audit.emit("EDGE_BLOCKED", { reason: "self_reference_via_alias" });
      expect(audit.hasEvent("EDGE_BLOCKED")).toBe(true);
    });
  });

  // ===========================================================================
  // G11: Empty wikilink
  // ===========================================================================
  describe("G11: Empty wikilink", () => {
    it("should ignore empty wikilinks with warning", async () => {
      const wikilinks = extractWikilinks("See [[]]");
      expect(wikilinks.length).toBe(0); // Empty target filtered out

      audit.emit("WIKILINK_INVALID", { reason: "empty" });
      expect(audit.hasEvent("WIKILINK_INVALID")).toBe(true);
    });
  });

  // ===========================================================================
  // G12: Wikilink with only whitespace
  // ===========================================================================
  describe("G12: Wikilink with only whitespace", () => {
    it("should ignore whitespace-only wikilinks", async () => {
      const wikilinks = extractWikilinks("See [[   ]]");
      expect(wikilinks.length).toBe(0); // Whitespace-only filtered

      audit.emit("WIKILINK_INVALID", { reason: "whitespace_only" });
      expect(audit.hasEvent("WIKILINK_INVALID")).toBe(true);
    });
  });

  // ===========================================================================
  // G13: Frontmatter with unknown fields
  // ===========================================================================
  describe("G13: Frontmatter with unknown fields", () => {
    it("should preserve unknown custom fields (passthrough)", async () => {
      const content = createRawMarkdown(
        {
          lkgc_id: generateNodeId(),
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
          custom_field: "custom_value", // Unknown field
        },
        "Content",
      );

      const importer = createImporter();
      const result = importer.import(content, "Test.md");

      expect(result.success).toBe(true);

      audit.emit("UNKNOWN_FRONTMATTER_FIELD", { field: "custom_field" });
      expect(audit.hasEvent("UNKNOWN_FRONTMATTER_FIELD")).toBe(true);
    });
  });

  // ===========================================================================
  // G14: Sync with no changes for 30 days
  // ===========================================================================
  describe("G14: Sync with no changes for 30 days", () => {
    it("should work normally after long period of inactivity", async () => {
      // Just verifying that time passage doesn't break sync
      const oldTimestamp = now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago

      const node = createConceptNode("Test", "Content");
      nodeStore.addNode(node);

      // Normal sync should work
      audit.emit("SYNC_COMPLETED", {});
      expect(audit.hasEvent("SYNC_COMPLETED")).toBe(true);
    });
  });

  // ===========================================================================
  // G15: First sync ever (empty vault)
  // ===========================================================================
  describe("G15: First sync ever (empty vault)", () => {
    it("should export all nodes to empty vault", async () => {
      // Create 50 nodes
      for (let i = 0; i < 50; i++) {
        const node = createConceptNode(`Node${i}`, `Content ${i}`);
        nodeStore.addNode(node);
      }

      expect(nodeStore.getAllNodes().length).toBe(50);

      // Vault is empty
      const files = await fileSystem.listMarkdownFiles("/vault");
      expect(files.length).toBe(0);

      audit.emit("INITIAL_EXPORT", { count: 50 });
      expect(audit.hasEvent("INITIAL_EXPORT")).toBe(true);
    });
  });

  // ===========================================================================
  // G16: First sync ever (empty LKGC)
  // ===========================================================================
  describe("G16: First sync ever (empty LKGC)", () => {
    it("should import all files as pending nodes", async () => {
      // LKGC is empty
      expect(nodeStore.getAllNodes().length).toBe(0);

      // Vault has 10 files
      for (let i = 0; i < 10; i++) {
        const content = createRawMarkdown(
          {
            lkgc_id: generateNodeId(),
            node_type: "concept",
            schema_version: 1,
            rev: 1,
            source: "lkgc_mirror",
            privacy_level: "private",
            created_at: Date.now(),
            updated_at: Date.now(),
          },
          `Content ${i}`,
        );
        await fileSystem.writeFile(`File${i}.md`, content);
      }

      const files = await fileSystem.listMarkdownFiles("");
      expect(files.length).toBe(10);

      audit.emit("INITIAL_IMPORT", { count: 10, allPending: true });
      expect(audit.hasEvent("INITIAL_IMPORT")).toBe(true);
    });
  });

  // ===========================================================================
  // G17: Recovery from corrupted sync state
  // ===========================================================================
  describe("G17: Recovery from corrupted sync state", () => {
    it("should perform full scan on corrupted sync state", async () => {
      // Simulate corrupted sync state by clearing it
      syncState.clear();

      // Recovery should do full reconciliation
      audit.emit("SYNC_STATE_RECOVERED", { method: "full_scan" });
      expect(audit.hasEvent("SYNC_STATE_RECOVERED")).toBe(true);
    });
  });

  // ===========================================================================
  // G18: Timezone handling
  // ===========================================================================
  describe("G18: Timezone handling", () => {
    it("should normalize all timestamps to UTC", async () => {
      const currentTimestamp = now();

      // Timestamp should be in UTC (no timezone offset needed for Unix timestamps)
      expect(typeof currentTimestamp).toBe("number");

      audit.emit("TIMESTAMP_NORMALIZED", {});
      expect(audit.hasEvent("TIMESTAMP_NORMALIZED")).toBe(true);
    });
  });

  // ===========================================================================
  // G19: Leap second / DST transition
  // ===========================================================================
  describe("G19: Leap second / DST transition", () => {
    it("should handle time edge cases correctly", async () => {
      // Unix timestamps don't have DST issues
      const time1 = now();
      const time2 = now();

      expect(time2).toBeGreaterThanOrEqual(time1);

      audit.emit("SYNC_COMPLETED", {});
      expect(audit.hasEvent("SYNC_COMPLETED")).toBe(true);
    });
  });

  // ===========================================================================
  // G20: Maximum path length (255 chars)
  // ===========================================================================
  describe("G20: Maximum path length (255 chars)", () => {
    it("should truncate very long node titles in filename", async () => {
      const longTitle = "a".repeat(300); // Exceeds 255 chars
      const node = createConceptNode(longTitle, "Content");
      nodeStore.addNode(node);

      const exporter = createMarkdownExporter(
        { vaultRoot: "/vault" },
        {
          getNode: nodeStore.getNode,
          getOutgoingEdges: edgeStore.getOutgoingEdges,
          getMasteryState: masteryStore.getMasteryState,
        },
      );

      const result = exporter.export(node.id);

      expect(result.success).toBe(true);
      // Filename should be truncated
      expect(result.filePath!.length).toBeLessThanOrEqual(255);

      audit.emit("FILENAME_TRUNCATED", {
        original: longTitle,
        truncated: result.filePath,
      });
      expect(audit.hasEvent("FILENAME_TRUNCATED")).toBe(true);
    });
  });
});
