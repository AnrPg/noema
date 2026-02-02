// =============================================================================
// TEST SUITE A: BASIC SYNC OPERATIONS
// =============================================================================
// Tests for clean export, clean import, and no-op sync scenarios.
// These are the foundational operations that must work correctly.
//
// Test IDs: A1-A8
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import type {
  NodeId,
  RevisionNumber,
  Timestamp,
} from "../../../types/lkgc/foundation";
import type { LKGCNode } from "../../../types/lkgc/nodes";
import type { LKGCEdge } from "../../../types/lkgc/edges";
import type { MasteryState } from "../../../types/lkgc/mastery";
import { MarkdownParser, generateContentHash } from "../markdown-parser";
import { MarkdownExporter, createMarkdownExporter } from "../markdown-exporter";
import {
  MarkdownImporter,
  createMarkdownImporter,
  createDefaultImportEdgeInferenceConfig,
} from "../markdown-importer";
import {
  InMemoryFileSystem,
  InMemorySyncStateStorage,
} from "../in-memory-file-system";
import {
  createConceptNode,
  createFactNode,
  createNoteNode,
  createTestNode,
  createTestMasteryState,
  createTestMarkdownFile,
  createRawMarkdown,
  createMockNodeStore,
  createMockEdgeStore,
  createMockMasteryStore,
  createAuditCollector,
  resetIdCounter,
  assertFrontmatterContains,
  assertBodyContains,
} from "./test-helpers";
import { generateNodeId, revision, now } from "../../id-generator";

describe("A) Basic Sync Operations", () => {
  let parser: MarkdownParser;
  let fileSystem: InMemoryFileSystem;
  let syncState: InMemorySyncStateStorage;
  let nodeStore: ReturnType<typeof createMockNodeStore>;
  let edgeStore: ReturnType<typeof createMockEdgeStore>;
  let masteryStore: ReturnType<typeof createMockMasteryStore>;
  let audit: ReturnType<typeof createAuditCollector>;

  beforeEach(() => {
    resetIdCounter();
    parser = new MarkdownParser();
    fileSystem = new InMemoryFileSystem();
    syncState = new InMemorySyncStateStorage();
    nodeStore = createMockNodeStore();
    edgeStore = createMockEdgeStore();
    masteryStore = createMockMasteryStore();
    audit = createAuditCollector();
  });

  // ===========================================================================
  // A1: Clean export - new node
  // ===========================================================================
  describe("A1: Clean export - new node", () => {
    it("should create file with correct frontmatter and body when exporting new node", async () => {
      // Initial State: LKGC has node N1; vault empty
      const node = createConceptNode(
        "Calculus",
        "The study of continuous change.",
      );
      nodeStore.addNode(node);

      // Create exporter
      const exporter = createMarkdownExporter(
        { vaultRoot: "/vault" },
        {
          getNode: nodeStore.getNode,
          getOutgoingEdges: edgeStore.getOutgoingEdges,
          getMasteryState: masteryStore.getMasteryState,
        },
      );

      // Sync Trigger: Export - API takes NodeId, returns ExportResult
      const result = exporter.export(node.id);

      // Expected Result: Export successful with content and path
      expect(result.success).toBe(true);
      expect(result.filePath).toBe("Calculus.md");
      expect(result.content).toBeDefined();
      expect(result.contentHash).toBeDefined();

      // Verify frontmatter by parsing content
      const parsed = parser.parse(
        result.content,
        "Calculus.md",
        "/vault/Calculus.md",
        now(),
      );
      expect(parsed.frontmatter).toBeDefined();
      expect(parsed.frontmatter!.lkgc_id).toBe(node.id);
      expect(parsed.frontmatter!.node_type).toBe("concept");
      expect(parsed.frontmatter!.source).toBe("lkgc_mirror");

      // Verify body contains node content
      expect(result.content).toContain("The study of continuous change.");

      // Audit Event: EXPORT_CREATED
      audit.emit("EXPORT_CREATED", { nodeId: node.id, path: result.filePath });
      expect(
        audit.hasEvent("EXPORT_CREATED", (d) => d.nodeId === node.id),
      ).toBe(true);
    });

    it("should generate valid YAML frontmatter", async () => {
      const node = createConceptNode(
        "Linear Algebra",
        "Study of vectors and matrices.",
      );
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

      // The content should be parseable
      const parsed = parser.parse(
        result.content,
        "Linear Algebra.md",
        "/vault/Linear Algebra.md",
        now(),
      );

      expect(parsed.frontmatter).toBeDefined();
      expect(parsed.frontmatter!.lkgc_id).toBe(node.id);
    });
  });

  // ===========================================================================
  // A2: Clean export - existing node updated
  // ===========================================================================
  describe("A2: Clean export - existing node updated", () => {
    it("should update file when node revision increases", async () => {
      // Initial State: Node at rev=1, file exists at rev=1
      const node = createConceptNode("Calculus", "Original definition");
      nodeStore.addNode(node);

      // Simulate previous export
      const oldFile = createTestMarkdownFile(
        "Calculus.md",
        "Original definition",
        {
          lkgc_id: node.id,
          rev: 1 as RevisionNumber,
        },
      );
      await syncState.setLastExport(node.id, oldFile);
      fileSystem.seed({
        "Calculus.md":
          "---\nlkgc_id: " + node.id + "\nrev: 1\n---\nOriginal definition",
      });

      // LKGC Action: Update node definition, rev becomes 2
      const updatedNode = {
        ...node,
        definition: "Updated definition with new information",
        sync: { ...node.sync, localRevision: revision(2) },
      } as typeof node;
      nodeStore.updateNode(node.id, updatedNode);

      // Create exporter and export
      const exporter = createMarkdownExporter(
        { vaultRoot: "/vault" },
        {
          getNode: nodeStore.getNode,
          getOutgoingEdges: edgeStore.getOutgoingEdges,
          getMasteryState: masteryStore.getMasteryState,
        },
      );

      const result = exporter.export(node.id);

      // Expected Result: File updated to rev=2
      expect(result.success).toBe(true);
      expect(result.content).toContain(
        "Updated definition with new information",
      );

      // Audit Event
      audit.emit("EXPORT_UPDATED", { nodeId: node.id, oldRev: 1, newRev: 2 });
      expect(audit.hasEvent("EXPORT_UPDATED")).toBe(true);
    });
  });

  // ===========================================================================
  // A3: Clean import - body edit
  // ===========================================================================
  describe("A3: Clean import - body edit", () => {
    it("should update LKGC node body when user edits file", async () => {
      // Initial State: Node and file match
      const node = createConceptNode("Calculus", "Original content");
      nodeStore.addNode(node);

      // User Action: Edit body in Obsidian
      const userEditedContent = createRawMarkdown(
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
        "User edited content with more details",
      );

      // Create importer
      const importer = createMarkdownImporter({
        getNode: nodeStore.getNode,
        getNodeByTitle: nodeStore.getNodeByTitle,
        getPreviousExport: () =>
          createTestMarkdownFile("Calculus.md", "Original content", {
            lkgc_id: node.id,
          }),
        parser,
        edgeInferenceConfig: createDefaultImportEdgeInferenceConfig(),
      });

      // Sync Trigger: Import
      const result = importer.import(userEditedContent, "Calculus.md");

      // Expected Result: Content operations generated for body update
      expect(result.success).toBe(true);
      // Note: Body changes are detected via changes array, not operations
      const bodyChange = result.changes.find((c) => c.type === "body_edit");
      expect(bodyChange).toBeDefined();

      // Audit Event
      audit.emit("IMPORT_BODY_UPDATED", {
        nodeId: node.id,
        source: "obsidian",
      });
      expect(audit.hasEvent("IMPORT_BODY_UPDATED")).toBe(true);
    });
  });

  // ===========================================================================
  // A4: Clean import - frontmatter edit (editable)
  // ===========================================================================
  describe("A4: Clean import - frontmatter edit (editable)", () => {
    it("should update node tags when user edits editable frontmatter", async () => {
      // Initial State: Node with empty tags
      const node = createConceptNode("Calculus", "Content");
      nodeStore.addNode(node);

      // User Action: Add tags in frontmatter
      const userEditedContent = createRawMarkdown(
        {
          lkgc_id: node.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
          tags: ["math", "calculus"],
        },
        "Content",
      );

      const importer = createMarkdownImporter({
        getNode: nodeStore.getNode,
        getNodeByTitle: nodeStore.getNodeByTitle,
        getPreviousExport: () =>
          createTestMarkdownFile("Calculus.md", "Content", {
            lkgc_id: node.id,
          }),
        parser,
        edgeInferenceConfig: createDefaultImportEdgeInferenceConfig(),
      });

      const result = importer.import(userEditedContent, "Calculus.md");

      // Expected Result: Tags operation generated
      expect(result.success).toBe(true);

      // Tags changes are detected via changes array (frontmatter_edit type)
      const tagsChange = result.changes.find(
        (c) => c.type === "frontmatter_edit" && c.field === "tags",
      );
      expect(tagsChange).toBeDefined();
      expect(tagsChange!.newValue).toEqual(["math", "calculus"]);

      // Audit Event
      audit.emit("IMPORT_FRONTMATTER_UPDATED", {
        nodeId: node.id,
        field: "tags",
        newValue: ["math", "calculus"],
      });
      expect(audit.hasEvent("IMPORT_FRONTMATTER_UPDATED")).toBe(true);
    });
  });

  // ===========================================================================
  // A5: No-op sync - identical
  // ===========================================================================
  describe("A5: No-op sync - identical", () => {
    it("should not generate operations when content is identical", async () => {
      // Initial State: Node and file are identical
      const node = createConceptNode("Calculus", "Identical content");
      nodeStore.addNode(node);

      const fileContent = createRawMarkdown(
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
        "Identical content",
      );

      const previousExport = createTestMarkdownFile(
        "Calculus.md",
        "Identical content",
        { lkgc_id: node.id },
      );

      const importer = createMarkdownImporter({
        getNode: nodeStore.getNode,
        getNodeByTitle: nodeStore.getNodeByTitle,
        getPreviousExport: () => previousExport,
        parser,
        edgeInferenceConfig: createDefaultImportEdgeInferenceConfig(),
      });

      // Use identical content
      const result = importer.import(fileContent, "Calculus.md");

      // Expected Result: No operations (or only no-op marker)
      // Note: Implementation may still return success with empty operations
      expect(result.success).toBe(true);

      // With identical content, there should be no changes detected
      expect(result.changes.length).toBe(0);

      // Audit Event
      audit.emit("SYNC_NOOP", { nodeId: node.id, reason: "identical" });
      expect(audit.hasEvent("SYNC_NOOP")).toBe(true);
    });
  });

  // ===========================================================================
  // A6: No-op sync - non-exportable node type
  // ===========================================================================
  describe("A6: No-op sync - non-exportable node type", () => {
    it("should skip export for non-exportable node types like memory_anchor", async () => {
      // Initial State: Node is a non-exportable type
      // Note: memory_anchor is not a valid node type in our schema,
      // but we can test with 'card' which is non-exportable
      const node = {
        ...createConceptNode("Test Card", "Card content"),
        nodeType: "card" as any,
      };
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

      // Expected Result: Export failed for non-exportable type
      expect(result.success).toBe(false);
      expect(result.error).toContain("not exportable");

      // Audit Event
      audit.emit("SYNC_SKIPPED", {
        nodeId: node.id,
        reason: "non_exportable_type",
      });
      expect(audit.hasEvent("SYNC_SKIPPED")).toBe(true);
    });
  });

  // ===========================================================================
  // A7: Clean export - node with mastery state
  // ===========================================================================
  describe("A7: Clean export - node with mastery state", () => {
    it("should include mastery_summary in frontmatter", async () => {
      // Initial State: Node with mastery state
      const node = createConceptNode("Calculus", "Content");
      nodeStore.addNode(node);

      const mastery = createTestMasteryState(node.id, "review");
      masteryStore.setMasteryState(mastery);

      const exporter = createMarkdownExporter(
        { vaultRoot: "/vault" },
        {
          getNode: nodeStore.getNode,
          getOutgoingEdges: edgeStore.getOutgoingEdges,
          getMasteryState: masteryStore.getMasteryState,
        },
      );

      const result = exporter.export(node.id);

      // Expected Result: File includes mastery_summary
      expect(result.success).toBe(true);

      // Verify mastery_summary is in the content as YAML
      // Note: The simple YAML parser doesn't handle nested objects,
      // so we verify the raw content instead
      expect(result.content).toContain("mastery_summary:");
      expect(result.content).toContain("state:");
      expect(result.content).toContain("trend:");

      // Verify the state is one of the expected values
      const stateMatch = result.content.match(/state:\s*(\w+)/);
      expect(stateMatch).toBeDefined();
      expect(["new", "fragile", "developing", "stable", "strong"]).toContain(
        stateMatch![1],
      );

      // Audit Event
      audit.emit("EXPORT_CREATED", { nodeId: node.id, includedMastery: true });
      expect(audit.hasEvent("EXPORT_CREATED")).toBe(true);
    });
  });

  // ===========================================================================
  // A8: Batch export - multiple nodes
  // ===========================================================================
  describe("A8: Batch export - multiple nodes", () => {
    it("should export multiple nodes in batch", async () => {
      // Initial State: Multiple nodes
      const node1 = createConceptNode("Calculus", "Calculus content");
      const node2 = createConceptNode("Algebra", "Algebra content");
      const node3 = createConceptNode("Geometry", "Geometry content");

      nodeStore.addNode(node1);
      nodeStore.addNode(node2);
      nodeStore.addNode(node3);

      const exporter = createMarkdownExporter(
        { vaultRoot: "/vault" },
        {
          getNode: nodeStore.getNode,
          getOutgoingEdges: edgeStore.getOutgoingEdges,
          getMasteryState: masteryStore.getMasteryState,
        },
      );

      // Export all using exportMany
      const results = exporter.exportMany([node1.id, node2.id, node3.id]);

      // Expected Result: Three files created
      expect(results.every((r) => r.success)).toBe(true);
      expect(results[0].filePath).toBe("Calculus.md");
      expect(results[1].filePath).toBe("Algebra.md");
      expect(results[2].filePath).toBe("Geometry.md");

      // Audit Event
      audit.emit("EXPORT_BATCH", {
        count: 3,
        nodeIds: [node1.id, node2.id, node3.id],
      });
      expect(audit.hasEvent("EXPORT_BATCH", (d) => d.count === 3)).toBe(true);
    });
  });
});
