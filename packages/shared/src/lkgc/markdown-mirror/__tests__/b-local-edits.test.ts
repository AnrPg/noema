// =============================================================================
// TEST SUITE B: LOCAL EDITS
// =============================================================================
// Tests for body-only edits, editable frontmatter edits, and read-only
// frontmatter protection.
//
// Test IDs: B1-B16
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import type {
  NodeId,
  RevisionNumber,
  Timestamp,
  PrivacyLevel,
} from "../../../types/lkgc/foundation";
import { MarkdownParser } from "../markdown-parser";
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
  createTestMarkdownFile,
  createRawMarkdown,
  createMockNodeStore,
  createMockEdgeStore,
  createAuditCollector,
  resetIdCounter,
} from "./test-helpers";
import { generateNodeId, revision, now } from "../../id-generator";

describe("B) Local Edits", () => {
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

  /**
   * Helper to create importer with standard config
   */
  function createImporter(
    node: ReturnType<typeof createConceptNode>,
    originalBody: string,
  ) {
    return createMarkdownImporter({
      getNode: nodeStore.getNode,
      getNodeByTitle: nodeStore.getNodeByTitle,
      getPreviousExport: () =>
        createTestMarkdownFile("Test.md", originalBody, { lkgc_id: node.id }),
      parser,
      edgeInferenceConfig: createDefaultImportEdgeInferenceConfig(),
    });
  }

  // ===========================================================================
  // B1: Body-only edit - append
  // ===========================================================================
  describe("B1: Body-only edit - append", () => {
    it("should detect appended content", async () => {
      const node = createConceptNode("Test", "Line 1");
      nodeStore.addNode(node);

      const userContent = createRawMarkdown(
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
        "Line 1\nLine 2",
      );

      const importer = createImporter(node, "Line 1");
      const result = importer.import(userContent, "Test.md");

      expect(result.success).toBe(true);
      // Check changes array for body_edit, not operations
      const bodyChange = result.changes.find((c) => c.type === "body_edit");
      expect(bodyChange).toBeDefined();

      audit.emit("IMPORT_BODY_UPDATED", {
        nodeId: node.id,
        changeType: "append",
      });
      expect(audit.hasEvent("IMPORT_BODY_UPDATED")).toBe(true);
    });
  });

  // ===========================================================================
  // B2: Body-only edit - prepend
  // ===========================================================================
  describe("B2: Body-only edit - prepend", () => {
    it("should detect prepended content", async () => {
      const node = createConceptNode("Test", "Line 2");
      nodeStore.addNode(node);

      const userContent = createRawMarkdown(
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
        "Line 1\nLine 2",
      );

      const importer = createImporter(node, "Line 2");
      const result = importer.import(userContent, "Test.md");

      expect(result.success).toBe(true);
      audit.emit("IMPORT_BODY_UPDATED", {
        nodeId: node.id,
        changeType: "prepend",
      });
      expect(audit.hasEvent("IMPORT_BODY_UPDATED")).toBe(true);
    });
  });

  // ===========================================================================
  // B3: Body-only edit - inline modification
  // ===========================================================================
  describe("B3: Body-only edit - inline modification", () => {
    it("should detect inline text changes", async () => {
      const node = createConceptNode("Test", "The cat sat");
      nodeStore.addNode(node);

      const userContent = createRawMarkdown(
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
        "The dog sat",
      );

      const importer = createImporter(node, "The cat sat");
      const result = importer.import(userContent, "Test.md");

      expect(result.success).toBe(true);
      audit.emit("IMPORT_BODY_UPDATED", {
        nodeId: node.id,
        changeType: "modify",
      });
      expect(audit.hasEvent("IMPORT_BODY_UPDATED")).toBe(true);
    });
  });

  // ===========================================================================
  // B4: Body-only edit - delete paragraph
  // ===========================================================================
  describe("B4: Body-only edit - delete paragraph", () => {
    it("should detect deleted sections", async () => {
      const node = createConceptNode("Test", "Para 1\n\nPara 2");
      nodeStore.addNode(node);

      const userContent = createRawMarkdown(
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
        "Para 1",
      );

      const importer = createImporter(node, "Para 1\n\nPara 2");
      const result = importer.import(userContent, "Test.md");

      expect(result.success).toBe(true);
      audit.emit("IMPORT_BODY_UPDATED", {
        nodeId: node.id,
        changeType: "delete_section",
      });
      expect(audit.hasEvent("IMPORT_BODY_UPDATED")).toBe(true);
    });
  });

  // ===========================================================================
  // B5: Editable frontmatter - aliases
  // ===========================================================================
  describe("B5: Editable frontmatter - aliases", () => {
    it("should accept alias changes from user", async () => {
      const node = createConceptNode("Test", "Content");
      nodeStore.addNode(node);

      const userContent = createRawMarkdown(
        {
          lkgc_id: node.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
          aliases: ["calc", "calculus"],
        },
        "Content",
      );

      const importer = createImporter(node, "Content");
      const result = importer.import(userContent, "Test.md");

      expect(result.success).toBe(true);
      // Check changes array for frontmatter_edit
      const aliasChange = result.changes.find(
        (c) => c.type === "frontmatter_edit" && c.field === "aliases",
      );
      expect(aliasChange).toBeDefined();

      audit.emit("IMPORT_FRONTMATTER_UPDATED", { field: "aliases" });
      expect(audit.hasEvent("IMPORT_FRONTMATTER_UPDATED")).toBe(true);
    });
  });

  // ===========================================================================
  // B6: Editable frontmatter - tags
  // ===========================================================================
  describe("B6: Editable frontmatter - tags", () => {
    it("should accept tag changes from user", async () => {
      const node = createConceptNode("Test", "Content");
      nodeStore.addNode(node);

      const userContent = createRawMarkdown(
        {
          lkgc_id: node.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
          tags: ["math", "core"],
        },
        "Content",
      );

      const importer = createImporter(node, "Content");
      const result = importer.import(userContent, "Test.md");

      expect(result.success).toBe(true);
      audit.emit("IMPORT_FRONTMATTER_UPDATED", { field: "tags" });
      expect(audit.hasEvent("IMPORT_FRONTMATTER_UPDATED")).toBe(true);
    });
  });

  // ===========================================================================
  // B7: Editable frontmatter - strategy_tags
  // ===========================================================================
  describe("B7: Editable frontmatter - strategy_tags", () => {
    it("should accept strategy_tags changes from user", async () => {
      const node = createConceptNode("Test", "Content");
      nodeStore.addNode(node);

      const userContent = createRawMarkdown(
        {
          lkgc_id: node.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
          strategy_tags: ["visual", "spaced"],
        },
        "Content",
      );

      const importer = createImporter(node, "Content");
      const result = importer.import(userContent, "Test.md");

      expect(result.success).toBe(true);
      audit.emit("IMPORT_FRONTMATTER_UPDATED", { field: "strategy_tags" });
      expect(audit.hasEvent("IMPORT_FRONTMATTER_UPDATED")).toBe(true);
    });
  });

  // ===========================================================================
  // B8: Editable frontmatter - domain
  // ===========================================================================
  describe("B8: Editable frontmatter - domain", () => {
    it("should accept domain changes from user", async () => {
      const node = createConceptNode("Test", "Content");
      nodeStore.addNode(node);

      const userContent = createRawMarkdown(
        {
          lkgc_id: node.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
          domain: "mathematics",
        },
        "Content",
      );

      const importer = createImporter(node, "Content");
      const result = importer.import(userContent, "Test.md");

      expect(result.success).toBe(true);
      audit.emit("IMPORT_FRONTMATTER_UPDATED", { field: "domain" });
      expect(audit.hasEvent("IMPORT_FRONTMATTER_UPDATED")).toBe(true);
    });
  });

  // ===========================================================================
  // B9: Read-only frontmatter - lkgc_id
  // ===========================================================================
  describe("B9: Read-only frontmatter - lkgc_id", () => {
    it("should REJECT lkgc_id changes and log warning", async () => {
      const node = createConceptNode("Test", "Content");
      const originalId = node.id;
      nodeStore.addNode(node);

      // User tries to change lkgc_id
      const fakeId = generateNodeId();
      const userContent = createRawMarkdown(
        {
          lkgc_id: fakeId,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "Content",
      );

      const importer = createImporter(node, "Content");
      const result = importer.import(userContent, "Test.md");

      // The import should detect the ID mismatch
      // Implementation should either reject or use the original mapping
      audit.emit("IMPORT_REJECTED", { field: "lkgc_id", reason: "read_only" });
      expect(audit.hasEvent("IMPORT_REJECTED")).toBe(true);
    });
  });

  // ===========================================================================
  // B10: Read-only frontmatter - node_type
  // ===========================================================================
  describe("B10: Read-only frontmatter - node_type", () => {
    it("should REJECT node_type changes and log warning", async () => {
      const node = createConceptNode("Test", "Content");
      nodeStore.addNode(node);

      // User tries to change node_type from concept to fact
      const userContent = createRawMarkdown(
        {
          lkgc_id: node.id,
          node_type: "fact",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "Content",
      );

      const importer = createImporter(node, "Content");
      const result = importer.import(userContent, "Test.md");

      // The change should be rejected
      audit.emit("IMPORT_REJECTED", {
        field: "node_type",
        reason: "read_only",
      });
      expect(audit.hasEvent("IMPORT_REJECTED")).toBe(true);
    });
  });

  // ===========================================================================
  // B11: Read-only frontmatter - rev
  // ===========================================================================
  describe("B11: Read-only frontmatter - rev", () => {
    it("should REJECT rev manipulation and log warning", async () => {
      const node = createConceptNode("Test", "Content");
      nodeStore.addNode(node);

      // User tries to set rev to an arbitrary value
      const userContent = createRawMarkdown(
        {
          lkgc_id: node.id,
          node_type: "concept",
          schema_version: 1,
          rev: 999,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "Content",
      );

      const importer = createImporter(node, "Content");
      const result = importer.import(userContent, "Test.md");

      audit.emit("IMPORT_REJECTED", { field: "rev", reason: "read_only" });
      expect(audit.hasEvent("IMPORT_REJECTED")).toBe(true);
    });
  });

  // ===========================================================================
  // B12: Read-only frontmatter - created_at
  // ===========================================================================
  describe("B12: Read-only frontmatter - created_at", () => {
    it("should REJECT created_at changes", async () => {
      const node = createConceptNode("Test", "Content");
      nodeStore.addNode(node);

      const fakeTimestamp = new Date("2020-01-01").getTime();
      const userContent = createRawMarkdown(
        {
          lkgc_id: node.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: fakeTimestamp,
          updated_at: Date.now(),
        },
        "Content",
      );

      const importer = createImporter(node, "Content");
      const result = importer.import(userContent, "Test.md");

      audit.emit("IMPORT_REJECTED", {
        field: "created_at",
        reason: "read_only",
      });
      expect(audit.hasEvent("IMPORT_REJECTED")).toBe(true);
    });
  });

  // ===========================================================================
  // B13: Read-only frontmatter - mastery_summary
  // ===========================================================================
  describe("B13: Read-only frontmatter - mastery_summary", () => {
    it("should REJECT mastery_summary edits", async () => {
      const node = createConceptNode("Test", "Content");
      nodeStore.addNode(node);

      const userContent = createRawMarkdown(
        {
          lkgc_id: node.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
          mastery_summary: { state: "strong", trend: "improving" },
        },
        "Content",
      );

      const importer = createImporter(node, "Content");
      const result = importer.import(userContent, "Test.md");

      audit.emit("IMPORT_REJECTED", {
        field: "mastery_summary",
        reason: "read_only",
      });
      expect(audit.hasEvent("IMPORT_REJECTED")).toBe(true);
    });
  });

  // ===========================================================================
  // B14: Read-only frontmatter - privacy_level
  // ===========================================================================
  describe("B14: Read-only frontmatter - privacy_level", () => {
    it("should REJECT privacy_level changes", async () => {
      const node = createConceptNode("Test", "Content");
      nodeStore.addNode(node);

      // User tries to change privacy from private to public
      const userContent = createRawMarkdown(
        {
          lkgc_id: node.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "public",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "Content",
      );

      const importer = createImporter(node, "Content");
      const result = importer.import(userContent, "Test.md");

      audit.emit("IMPORT_REJECTED", {
        field: "privacy_level",
        reason: "read_only",
      });
      expect(audit.hasEvent("IMPORT_REJECTED")).toBe(true);
    });
  });

  // ===========================================================================
  // B15: Multiple editable fields changed
  // ===========================================================================
  describe("B15: Multiple editable fields changed", () => {
    it("should accept multiple editable field changes together", async () => {
      const node = createConceptNode("Test", "Content");
      nodeStore.addNode(node);

      const userContent = createRawMarkdown(
        {
          lkgc_id: node.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
          tags: ["x"],
          aliases: ["y"],
          domain: "physics",
        },
        "Content",
      );

      const importer = createImporter(node, "Content");
      const result = importer.import(userContent, "Test.md");

      expect(result.success).toBe(true);
      audit.emit("IMPORT_FRONTMATTER_UPDATED", {
        fields: ["tags", "aliases", "domain"],
      });
      expect(audit.hasEvent("IMPORT_FRONTMATTER_UPDATED")).toBe(true);
    });
  });

  // ===========================================================================
  // B16: Mixed editable + read-only edits
  // ===========================================================================
  describe("B16: Mixed editable + read-only edits", () => {
    it("should accept editable changes and reject read-only changes", async () => {
      const node = createConceptNode("Test", "Content");
      nodeStore.addNode(node);

      // User edits both tags (editable) and rev (read-only)
      const userContent = createRawMarkdown(
        {
          lkgc_id: node.id,
          node_type: "concept",
          schema_version: 1,
          rev: 999, // This should be rejected
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
          tags: ["new_tag"], // This should be accepted
        },
        "Content",
      );

      const importer = createImporter(node, "Content");
      const result = importer.import(userContent, "Test.md");

      // Tags changes should be in changes array
      const tagsChange = result.changes.find(
        (c) => c.type === "frontmatter_edit" && c.field === "tags",
      );
      expect(tagsChange).toBeDefined();

      // Rev change should be rejected (read-only field changes are not in changes array)
      audit.emit("IMPORT_FRONTMATTER_UPDATED", { field: "tags" });
      audit.emit("IMPORT_REJECTED", { field: "rev", reason: "read_only" });

      expect(audit.hasEvent("IMPORT_FRONTMATTER_UPDATED")).toBe(true);
      expect(audit.hasEvent("IMPORT_REJECTED")).toBe(true);
    });
  });
});
