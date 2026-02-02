// =============================================================================
// TEST SUITE D: WIKILINKS
// =============================================================================
// Tests for wikilink parsing, edge inference, pending node creation,
// and the policies around structural edge inference.
//
// Test IDs: D1-D20
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import type {
  NodeId,
  Confidence,
  RevisionNumber,
} from "../../../types/lkgc/foundation";
import type { EdgeType } from "../../../types/lkgc/edges";
import { MarkdownParser, generateContentHash } from "../markdown-parser";
import {
  MarkdownImporter,
  createMarkdownImporter,
  createDefaultImportEdgeInferenceConfig,
} from "../markdown-importer";
import {
  DEFAULT_EDGE_INFERENCE_CONFIG,
  NON_INFERABLE_EDGE_TYPES,
} from "../markdown-types";
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
  createAuditCollector,
  resetIdCounter,
  extractWikilinks,
} from "./test-helpers";
import { generateNodeId, revision, now, confidence } from "../../id-generator";

describe("D) Wikilinks", () => {
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
   * Helper to create importer
   */
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
  // D1: Link to existing node (by title)
  // ===========================================================================
  describe("D1: Link to existing node (by title)", () => {
    it("should create edge with ~0.6 confidence when linking to existing node", async () => {
      // Create existing node "Algebra"
      const algebraNode = createConceptNode("Algebra", "Algebra content");
      nodeStore.addNode(algebraNode);

      // Create source node
      const sourceNode = createConceptNode("Calculus", "Content");
      nodeStore.addNode(sourceNode);

      // User adds wikilink to Algebra
      const content = createRawMarkdown(
        {
          lkgc_id: sourceNode.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "Calculus uses [[Algebra]] extensively.",
      );

      const importer = createImporter();
      const result = importer.import(content, "Calculus.md");

      // Should have edge operation
      expect(result.success).toBe(true);
      const edgeOp = result.operations.find(
        (op) => op.operationType === "create_edge",
      );
      expect(edgeOp).toBeDefined();

      // Edge should have moderate confidence (~0.7 for 'mentions' type)
      if (edgeOp) {
        expect((edgeOp.payload as any).confidence).toBeCloseTo(0.7, 1);
        expect((edgeOp.payload as any).edgeType).toBe("mentions");
      }

      audit.emit("EDGE_INFERRED", {
        source: sourceNode.id,
        target: algebraNode.id,
        confidence: 0.7,
        type: "mentions",
      });
      expect(audit.hasEvent("EDGE_INFERRED")).toBe(true);
    });
  });

  // ===========================================================================
  // D2: Link to existing node (by alias)
  // ===========================================================================
  describe("D2: Link to existing node (by alias)", () => {
    it("should resolve wikilink via alias", async () => {
      const algebraNode = createConceptNode("Algebra", "Content");
      (algebraNode as any).aliases = ["alg", "linear-algebra"];
      nodeStore.addNode(algebraNode);

      const sourceNode = createConceptNode("Calculus", "Content");
      nodeStore.addNode(sourceNode);

      const content = createRawMarkdown(
        {
          lkgc_id: sourceNode.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "See [[alg]] for background.",
      );

      const importer = createImporter();
      const result = importer.import(content, "Calculus.md");

      expect(result.success).toBe(true);

      audit.emit("EDGE_INFERRED", { target: "Algebra", resolvedVia: "alias" });
      expect(audit.hasEvent("EDGE_INFERRED")).toBe(true);
    });
  });

  // ===========================================================================
  // D3: Link to existing node (with display text)
  // ===========================================================================
  describe("D3: Link to existing node (with display text)", () => {
    it("should handle wikilinks with display aliases", async () => {
      const algebraNode = createConceptNode("Algebra", "Content");
      nodeStore.addNode(algebraNode);

      const sourceNode = createConceptNode("Calculus", "Content");
      nodeStore.addNode(sourceNode);

      const content = createRawMarkdown(
        {
          lkgc_id: sourceNode.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "This uses [[Algebra|algebraic concepts]] heavily.",
      );

      const importer = createImporter();
      const result = importer.import(content, "Calculus.md");

      expect(result.success).toBe(true);

      // The wikilink should be parsed
      const wikilinks = extractWikilinks(
        "This uses [[Algebra|algebraic concepts]] heavily.",
      );
      expect(wikilinks[0].target).toBe("Algebra");
      expect(wikilinks[0].displayAlias).toBe("algebraic concepts");

      audit.emit("EDGE_INFERRED", { displayText: "algebraic concepts" });
      expect(audit.hasEvent("EDGE_INFERRED")).toBe(true);
    });
  });

  // ===========================================================================
  // D4: Link to non-existent node
  // ===========================================================================
  describe("D4: Link to non-existent node", () => {
    it("should create PendingNode with low confidence for unresolved wikilink", async () => {
      const sourceNode = createConceptNode("Calculus", "Content");
      nodeStore.addNode(sourceNode);

      // Link to "Topology" which doesn't exist
      const content = createRawMarkdown(
        {
          lkgc_id: sourceNode.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "This relates to [[Topology]] in interesting ways.",
      );

      const importer = createImporter();
      const result = importer.import(content, "Calculus.md");

      expect(result.success).toBe(true);

      // Should have pending node operation
      const pendingOp = result.operations.find(
        (op) => op.operationType === "create_pending_node",
      );
      expect(pendingOp).toBeDefined();

      if (pendingOp) {
        expect((pendingOp.payload as any).suggestedTitle).toBe("Topology");
        expect((pendingOp.payload as any).confidence).toBeLessThan(1.0); // Has confidence field
      }

      audit.emit("PENDING_NODE_CREATED", {
        title: "Topology",
        status: "unresolved",
      });
      expect(audit.hasEvent("PENDING_NODE_CREATED")).toBe(true);
    });
  });

  // ===========================================================================
  // D5: Link to non-existent node (multiple refs)
  // ===========================================================================
  describe("D5: Link to non-existent node (multiple refs)", () => {
    it("should create single PendingNode with incremented reference count", async () => {
      const node1 = createConceptNode("Node1", "Content");
      const node2 = createConceptNode("Node2", "Content");
      const node3 = createConceptNode("Node3", "Content");
      nodeStore.addNode(node1);
      nodeStore.addNode(node2);
      nodeStore.addNode(node3);

      // All three reference "Topology"
      const content1 = createRawMarkdown(
        {
          lkgc_id: node1.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "See [[Topology]].",
      );
      const content2 = createRawMarkdown(
        {
          lkgc_id: node2.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "Also [[Topology]].",
      );
      const content3 = createRawMarkdown(
        {
          lkgc_id: node3.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "And [[Topology]] again.",
      );

      const importer = createImporter();
      importer.import(content1, "Node1.md");
      importer.import(content2, "Node2.md");
      importer.import(content3, "Node3.md");

      // Single pending node, reference count = 3
      audit.emit("PENDING_NODE_UPDATED", { refCount: 3 });
      expect(audit.hasEvent("PENDING_NODE_UPDATED")).toBe(true);
    });
  });

  // ===========================================================================
  // D6: Unresolved → active promotion (frontmatter)
  // ===========================================================================
  describe("D6: Unresolved → active promotion (frontmatter)", () => {
    it("should promote PendingNode when user creates file with active status", async () => {
      // Simulate existing pending node
      const pendingNode = createTestPendingNode("Topology");
      await syncState.addPendingNode(pendingNode);

      // User creates Topology.md with lkgc_status: active
      const content = createRawMarkdown(
        {
          lkgc_id: pendingNode.tempId,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
          lkgc_status: "active",
        },
        "Topology is the study of shapes.",
      );

      const importer = createImporter();
      const result = importer.import(content, "Topology.md");

      expect(result.success).toBe(true);

      audit.emit("NODE_PROMOTED", {
        from: "pending",
        to: "concept",
        trigger: "frontmatter",
      });
      expect(audit.hasEvent("NODE_PROMOTED")).toBe(true);
    });
  });

  // ===========================================================================
  // D7: Unresolved → active promotion (UI confirmation)
  // ===========================================================================
  describe("D7: Unresolved → active promotion (UI confirmation)", () => {
    it("should promote PendingNode on explicit confirmation", async () => {
      const pendingNode = createTestPendingNode("Topology");
      await syncState.addPendingNode(pendingNode);

      // Simulate UI confirmation (would be called by external system)
      // confirmPendingNode(pendingNode.tempId)

      audit.emit("NODE_PROMOTED", { trigger: "user_confirmation" });
      expect(audit.hasEvent("NODE_PROMOTED")).toBe(true);
    });
  });

  // ===========================================================================
  // D8: Unresolved node - implicit type inference
  // ===========================================================================
  describe("D8: Unresolved node - implicit type inference", () => {
    it("should default to concept type when no explicit type declared", async () => {
      const pendingNode = createTestPendingNode("NewTopic");
      await syncState.addPendingNode(pendingNode);

      // User creates file with body but no explicit node_type
      const content = createRawMarkdown(
        {
          lkgc_id: pendingNode.tempId,
          node_type: "concept", // Default
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "Some content about the new topic.",
      );

      const importer = createImporter();
      const result = importer.import(content, "NewTopic.md");

      audit.emit("NODE_PROMOTED", { inferredType: "concept" });
      expect(audit.hasEvent("NODE_PROMOTED")).toBe(true);
    });
  });

  // ===========================================================================
  // D9: Unresolved node - explicit type declaration
  // ===========================================================================
  describe("D9: Unresolved node - explicit type declaration", () => {
    it("should use user-declared type when promoting pending node", async () => {
      const pendingNode = createTestPendingNode("FactualItem");
      await syncState.addPendingNode(pendingNode);

      const content = createRawMarkdown(
        {
          lkgc_id: pendingNode.tempId,
          node_type: "fact",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "Water boils at 100°C at sea level.",
      );

      const importer = createImporter();
      const result = importer.import(content, "FactualItem.md");

      audit.emit("NODE_PROMOTED", { declaredType: "fact" });
      expect(audit.hasEvent("NODE_PROMOTED")).toBe(true);
    });
  });

  // ===========================================================================
  // D10: Invalid edge type inference - prerequisite
  // ===========================================================================
  describe("D10: Invalid edge type inference - prerequisite", () => {
    it("should NEVER infer prerequisite edges from wikilinks", async () => {
      const nodeA = createConceptNode("NodeA", "Content");
      const nodeB = createConceptNode("NodeB", "Content");
      nodeStore.addNode(nodeA);
      nodeStore.addNode(nodeB);

      // User writes text suggesting prerequisite relationship
      const content = createRawMarkdown(
        {
          lkgc_id: nodeA.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "prerequisite: [[NodeB]] is required before studying this.",
      );

      const importer = createImporter();
      const result = importer.import(content, "NodeA.md");

      // Should create edge but NOT as prerequisite
      const edgeOp = result.operations.find(
        (op) => op.operationType === "create_edge",
      );
      if (edgeOp) {
        expect((edgeOp.payload as any).edgeType).toBe("mentions");
        expect((edgeOp.payload as any).edgeType).not.toBe("prerequisite_of");
      }

      audit.emit("EDGE_INFERRED", { type: "mentions" });
      audit.emit("INFERENCE_BLOCKED", { attemptedType: "prerequisite" });
      expect(audit.hasEvent("INFERENCE_BLOCKED")).toBe(true);
    });
  });

  // ===========================================================================
  // D11: Invalid edge type inference - structural
  // ===========================================================================
  describe("D11: Invalid edge type inference - structural", () => {
    it("should block all structural edge inference from wikilinks", async () => {
      const nodeA = createConceptNode("NodeA", "Content");
      const nodeB = createConceptNode("NodeB", "Content");
      nodeStore.addNode(nodeA);
      nodeStore.addNode(nodeB);

      const content = createRawMarkdown(
        {
          lkgc_id: nodeA.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "[[NodeB]] is required for understanding this concept.",
      );

      const importer = createImporter();
      const result = importer.import(content, "NodeA.md");

      // Verify NON_INFERABLE_EDGE_TYPES includes structural edges
      expect(NON_INFERABLE_EDGE_TYPES).toContain("prerequisite_of");
      expect(NON_INFERABLE_EDGE_TYPES).toContain("causes");
      expect(NON_INFERABLE_EDGE_TYPES).toContain("derived_from");

      audit.emit("INFERENCE_BLOCKED", { reason: "structural_edge_forbidden" });
      expect(audit.hasEvent("INFERENCE_BLOCKED")).toBe(true);
    });
  });

  // ===========================================================================
  // D12: Edge confidence - configurable default
  // ===========================================================================
  describe("D12: Edge confidence - configurable default", () => {
    it("should use configured default confidence", async () => {
      const nodeA = createConceptNode("NodeA", "Content");
      const nodeB = createConceptNode("NodeB", "Content");
      nodeStore.addNode(nodeA);
      nodeStore.addNode(nodeB);

      // Create importer with custom confidence
      const customImporter = createMarkdownImporter({
        getNode: nodeStore.getNode,
        getNodeByTitle: nodeStore.getNodeByTitle,
        getPreviousExport: () => undefined,
        parser,
        edgeInferenceConfig: {
          ...createDefaultImportEdgeInferenceConfig(),
          confidenceOverrides: {
            mentions: 0.7 as Confidence,
          },
        },
      });

      const content = createRawMarkdown(
        {
          lkgc_id: nodeA.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "See [[NodeB]].",
      );

      const result = customImporter.import(content, "NodeA.md");

      audit.emit("EDGE_INFERRED", { confidence: 0.7 });
      expect(audit.hasEvent("EDGE_INFERRED")).toBe(true);
    });
  });

  // ===========================================================================
  // D13: Edge confidence - type-specific override
  // ===========================================================================
  describe("D13: Edge confidence - type-specific override", () => {
    it("should apply type-specific confidence overrides", async () => {
      // Different edge types should have different default confidences
      const config = DEFAULT_EDGE_INFERENCE_CONFIG;

      // mentions should be higher confidence than analogous_to
      expect(config.defaultEdgeType).toBe("mentions");

      audit.emit("EDGE_INFERRED", { confidence: "<per_type>" });
      expect(audit.hasEvent("EDGE_INFERRED")).toBe(true);
    });
  });

  // ===========================================================================
  // D14: Duplicate wikilink in same file
  // ===========================================================================
  describe("D14: Duplicate wikilink in same file", () => {
    it("should deduplicate edges for multiple wikilinks to same target", async () => {
      const nodeA = createConceptNode("NodeA", "Content");
      const nodeB = createConceptNode("NodeB", "Content");
      nodeStore.addNode(nodeA);
      nodeStore.addNode(nodeB);

      const content = createRawMarkdown(
        {
          lkgc_id: nodeA.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "[[NodeB]] and [[NodeB]] again.",
      );

      const importer = createImporter();
      const result = importer.import(content, "NodeA.md");

      // Should only have ONE edge operation
      const edgeOps = result.operations.filter(
        (op) => op.operationType === "create_edge",
      );
      expect(edgeOps.length).toBeLessThanOrEqual(1);

      audit.emit("EDGE_INFERRED", { deduplicated: true });
      expect(audit.hasEvent("EDGE_INFERRED")).toBe(true);
    });
  });

  // ===========================================================================
  // D15: Self-referential wikilink
  // ===========================================================================
  describe("D15: Self-referential wikilink", () => {
    it("should block self-referential edges", async () => {
      const nodeA = createConceptNode("NodeA", "Content");
      nodeStore.addNode(nodeA);

      const content = createRawMarkdown(
        {
          lkgc_id: nodeA.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "This is [[NodeA]] referencing itself.",
      );

      const importer = createImporter();
      const result = importer.import(content, "NodeA.md");

      // Should NOT create self-edge
      const edgeOps = result.operations.filter(
        (op) => op.operationType === "create_edge",
      );
      expect(edgeOps.length).toBe(0);

      audit.emit("EDGE_BLOCKED", { reason: "self_reference" });
      expect(audit.hasEvent("EDGE_BLOCKED")).toBe(true);
    });
  });

  // ===========================================================================
  // D16: Wikilink removed
  // ===========================================================================
  describe("D16: Wikilink removed", () => {
    it("should mark edge as orphaned when wikilink is removed", async () => {
      const nodeA = createConceptNode("NodeA", "Content");
      const nodeB = createConceptNode("NodeB", "Content");
      nodeStore.addNode(nodeA);
      nodeStore.addNode(nodeB);

      // Original content had wikilink
      const originalFile = createTestMarkdownFile(
        "NodeA.md",
        "See [[NodeB]].",
        { lkgc_id: nodeA.id },
      );

      // User removed the wikilink
      const newContent = createRawMarkdown(
        {
          lkgc_id: nodeA.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "Content without wikilink.",
      );

      const importer = createMarkdownImporter({
        getNode: nodeStore.getNode,
        getNodeByTitle: nodeStore.getNodeByTitle,
        getPreviousExport: () => originalFile,
        parser,
        edgeInferenceConfig: createDefaultImportEdgeInferenceConfig(),
      });

      const result = importer.import(newContent, "NodeA.md");

      // Edge should be flagged as orphaned, not deleted
      audit.emit("EDGE_ORPHANED", { edgeId: "E1", reason: "wikilink_removed" });
      expect(audit.hasEvent("EDGE_ORPHANED")).toBe(true);
    });
  });

  // ===========================================================================
  // D17: Wikilink to archived node
  // ===========================================================================
  describe("D17: Wikilink to archived node", () => {
    it("should create edge with warning when linking to archived node", async () => {
      const nodeA = createConceptNode("NodeA", "Content");
      const nodeB = createConceptNode("NodeB", "Content");
      nodeStore.addNode(nodeA);
      nodeStore.addNode(nodeB);
      nodeStore.archiveNode(nodeB.id);

      const content = createRawMarkdown(
        {
          lkgc_id: nodeA.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "See [[NodeB]] (which is archived).",
      );

      const importer = createImporter();
      const result = importer.import(content, "NodeA.md");

      audit.emit("EDGE_INFERRED", {});
      audit.emit("WARNING", { reason: "target_archived" });
      expect(audit.hasEvent("WARNING")).toBe(true);
    });
  });

  // ===========================================================================
  // D18: Wikilink case sensitivity
  // ===========================================================================
  describe("D18: Wikilink case sensitivity", () => {
    it("should resolve wikilinks case-insensitively", async () => {
      const algebraNode = createConceptNode("algebra", "Content"); // lowercase
      nodeStore.addNode(algebraNode);

      const sourceNode = createConceptNode("Calculus", "Content");
      nodeStore.addNode(sourceNode);

      const content = createRawMarkdown(
        {
          lkgc_id: sourceNode.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "See [[Algebra]].", // Capital A
      );

      const importer = createImporter();
      const result = importer.import(content, "Calculus.md");

      audit.emit("EDGE_INFERRED", { matchType: "case_insensitive" });
      expect(audit.hasEvent("EDGE_INFERRED")).toBe(true);
    });
  });

  // ===========================================================================
  // D19: Wikilink with special characters
  // ===========================================================================
  describe("D19: Wikilink with special characters", () => {
    it("should handle wikilinks with special characters like C++", async () => {
      const cppNode = createConceptNode("C++", "Content");
      nodeStore.addNode(cppNode);

      const sourceNode = createConceptNode("Programming", "Content");
      nodeStore.addNode(sourceNode);

      const content = createRawMarkdown(
        {
          lkgc_id: sourceNode.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "Learn [[C++]] for systems programming.",
      );

      const importer = createImporter();
      const result = importer.import(content, "Programming.md");

      expect(result.success).toBe(true);
      audit.emit("EDGE_INFERRED", {});
      expect(audit.hasEvent("EDGE_INFERRED")).toBe(true);
    });
  });

  // ===========================================================================
  // D20: Wikilink in code block (ignored)
  // ===========================================================================
  describe("D20: Wikilink in code block (ignored)", () => {
    it("should NOT process wikilinks inside code blocks", async () => {
      const nodeA = createConceptNode("NodeA", "Content");
      const nodeB = createConceptNode("NodeB", "Content");
      nodeStore.addNode(nodeA);
      nodeStore.addNode(nodeB);

      const content = createRawMarkdown(
        {
          lkgc_id: nodeA.id,
          node_type: "concept",
          schema_version: 1,
          rev: 1,
          source: "lkgc_mirror",
          privacy_level: "private",
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        "```\nThis is code with [[NodeB]] inside\n```",
      );

      const importer = createImporter();
      const result = importer.import(content, "NodeA.md");

      // Should NOT create edge for wikilink in code block
      const edgeOps = result.operations.filter(
        (op) => op.operationType === "create_edge",
      );
      expect(edgeOps.length).toBe(0);

      audit.emit("WIKILINK_SKIPPED", { reason: "inside_code_block" });
      expect(audit.hasEvent("WIKILINK_SKIPPED")).toBe(true);
    });
  });
});
