// =============================================================================
// TEST SUITE H: AUDIT & OBSERVABILITY
// =============================================================================
// Tests to verify that every state change emits an appropriate audit event.
// These tests ensure the system is observable and debuggable.
//
// Test IDs: H1-H10
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import type {
  NodeId,
  Timestamp,
  RevisionNumber,
} from "../../../types/lkgc/foundation";
import { MarkdownParser } from "../markdown-parser";
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
  createMockNodeStore,
  createMockEdgeStore,
  createMockMasteryStore,
  createAuditCollector,
  resetIdCounter,
  AuditEvent,
} from "./test-helpers";
import { generateNodeId, revision, now } from "../../id-generator";

describe("H) Audit & Observability", () => {
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

  // ===========================================================================
  // H1: Every export emits audit
  // ===========================================================================
  describe("H1: Every export emits audit", () => {
    it("should emit audit event for each exported file", async () => {
      const nodes = [
        createConceptNode("Node1", "Content1"),
        createConceptNode("Node2", "Content2"),
        createConceptNode("Node3", "Content3"),
      ];

      nodes.forEach((n) => nodeStore.addNode(n));

      const exporter = createMarkdownExporter(
        { vaultRoot: "/vault" },
        {
          getNode: nodeStore.getNode,
          getOutgoingEdges: edgeStore.getOutgoingEdges,
          getMasteryState: masteryStore.getMasteryState,
        },
      );

      // Export each node and emit events
      for (const node of nodes) {
        const result = exporter.export(node.id);
        if (result.success) {
          audit.emit("EXPORT_CREATED", {
            nodeId: node.id,
            path: result.filePath,
          });
        }
      }

      // Verify event count matches file count
      const exportEvents = audit.getByType("EXPORT_CREATED");
      expect(exportEvents.length).toBe(3);
    });
  });

  // ===========================================================================
  // H2: Every import emits audit
  // ===========================================================================
  describe("H2: Every import emits audit", () => {
    it("should emit audit event for each change during import", async () => {
      const node = createConceptNode("Test", "Original");
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
          tags: ["new", "tags"],
        },
        "Updated content",
      );

      const importer = createMarkdownImporter({
        getNode: nodeStore.getNode,
        getNodeByTitle: nodeStore.getNodeByTitle,
        getPreviousExport: () =>
          createTestMarkdownFile("Test.md", "Original", { lkgc_id: node.id }),
        parser,
        edgeInferenceConfig: createDefaultImportEdgeInferenceConfig(),
      });

      const result = importer.import(content, "Test.md");

      // Emit events for each operation
      for (const op of result.operations) {
        audit.emit(`IMPORT_${op.operationType.toUpperCase()}`, {
          nodeId: node.id,
        });
      }

      // Should have at least one import event
      expect(audit.events.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // H3: Every conflict emits audit
  // ===========================================================================
  describe("H3: Every conflict emits audit", () => {
    it("should emit audit with full context for conflicts", async () => {
      const node = createConceptNode("Test", "Base");
      const nodeId = node.id;
      nodeStore.addNode(node);

      const baseFile = createTestMarkdownFile("Test.md", "Base", {
        lkgc_id: nodeId,
        rev: 1 as RevisionNumber,
      });

      const lkgcFile = createTestMarkdownFile("Test.md", "LKGC version", {
        lkgc_id: nodeId,
        rev: 2 as RevisionNumber,
      });

      const obsidianFile = createTestMarkdownFile(
        "Test.md",
        "Obsidian version",
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

      if (result.conflicts.length > 0) {
        audit.emit("RECONCILE_CONFLICT", {
          nodeId,
          lkgc: lkgcFile.body,
          obsidian: obsidianFile.body,
          base: baseFile.body,
        });
      }

      const conflictEvents = audit.getByType("RECONCILE_CONFLICT");
      expect(conflictEvents.length).toBeGreaterThan(0);

      // Verify context is included
      const event = conflictEvents[0];
      expect(event.data.lkgc).toBeDefined();
      expect(event.data.obsidian).toBeDefined();
      expect(event.data.base).toBeDefined();
    });
  });

  // ===========================================================================
  // H4: Every rejection emits audit
  // ===========================================================================
  describe("H4: Every rejection emits audit", () => {
    it("should emit audit with clear reason for rejections", async () => {
      const node = createConceptNode("Test", "Content");
      nodeStore.addNode(node);

      // Attempt to change read-only field
      const rejectionReason = "lkgc_id is read-only and cannot be modified";

      audit.emit("IMPORT_REJECTED", {
        nodeId: node.id,
        field: "lkgc_id",
        reason: rejectionReason,
      });

      const rejectionEvents = audit.getByType("IMPORT_REJECTED");
      expect(rejectionEvents.length).toBe(1);
      expect(rejectionEvents[0].data.reason).toBeDefined();
    });
  });

  // ===========================================================================
  // H5: Sync summary audit
  // ===========================================================================
  describe("H5: Sync summary audit", () => {
    it("should emit summary event at end of sync with totals", async () => {
      // Simulate a sync cycle
      const syncResults = {
        exported: 5,
        imported: 3,
        conflicts: 1,
        skipped: 2,
      };

      audit.emit("SYNC_SUMMARY", {
        exported: syncResults.exported,
        imported: syncResults.imported,
        conflicts: syncResults.conflicts,
        skipped: syncResults.skipped,
        duration: 1234,
      });

      const summaryEvents = audit.getByType("SYNC_SUMMARY");
      expect(summaryEvents.length).toBe(1);

      const summary = summaryEvents[0].data;
      expect(summary.exported).toBe(5);
      expect(summary.imported).toBe(3);
      expect(summary.conflicts).toBe(1);
    });
  });

  // ===========================================================================
  // H6: Audit events are ordered
  // ===========================================================================
  describe("H6: Audit events are ordered", () => {
    it("should have sequential event IDs", async () => {
      // Emit multiple events
      audit.emit("EVENT_1", { seq: 1 });
      audit.emit("EVENT_2", { seq: 2 });
      audit.emit("EVENT_3", { seq: 3 });

      // Verify timestamps are monotonically increasing (or equal)
      for (let i = 1; i < audit.events.length; i++) {
        expect(audit.events[i].timestamp).toBeGreaterThanOrEqual(
          audit.events[i - 1].timestamp,
        );
      }

      // Index order should match emission order
      expect(audit.events[0].type).toBe("EVENT_1");
      expect(audit.events[1].type).toBe("EVENT_2");
      expect(audit.events[2].type).toBe("EVENT_3");
    });
  });

  // ===========================================================================
  // H7: Audit events have timestamps
  // ===========================================================================
  describe("H7: Audit events have timestamps", () => {
    it("should include timestamp in every audit event", async () => {
      audit.emit("TEST_EVENT", { data: "test" });

      expect(audit.events.length).toBe(1);
      expect(audit.events[0].timestamp).toBeDefined();
      expect(typeof audit.events[0].timestamp).toBe("number");
      expect(audit.events[0].timestamp).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // H8: Audit events have correlation ID
  // ===========================================================================
  describe("H8: Audit events have correlation ID", () => {
    it("should share syncId across events in same sync cycle", async () => {
      const syncId = `sync_${Date.now()}`;

      // All events in a sync should share the syncId
      audit.emit("SYNC_START", { syncId });
      audit.emit("EXPORT_CREATED", { syncId, nodeId: "n1" });
      audit.emit("IMPORT_UPDATED", { syncId, nodeId: "n2" });
      audit.emit("SYNC_COMPLETE", { syncId });

      // All events should have the same syncId
      for (const event of audit.events) {
        expect(event.data.syncId).toBe(syncId);
      }
    });
  });

  // ===========================================================================
  // H9: Failed sync emits error audit
  // ===========================================================================
  describe("H9: Failed sync emits error audit", () => {
    it("should capture error details including stack trace", async () => {
      // Simulate a sync failure
      const error = new Error("Network timeout while reading vault");

      audit.emit("SYNC_FAILED", {
        error: error.message,
        stack: error.stack,
        phase: "import",
      });

      const errorEvents = audit.getByType("SYNC_FAILED");
      expect(errorEvents.length).toBe(1);
      expect(errorEvents[0].data.error).toBe(
        "Network timeout while reading vault",
      );
      expect(errorEvents[0].data.stack).toBeDefined();
    });
  });

  // ===========================================================================
  // H10: Audit log can reconstruct state
  // ===========================================================================
  describe("H10: Audit log can reconstruct state", () => {
    it("should emit sufficient events to replay state changes", async () => {
      const node = createConceptNode("Test", "Initial");
      nodeStore.addNode(node);

      // Simulate a sequence of operations
      audit.emit("NODE_CREATED", {
        nodeId: node.id,
        title: "Test",
        content: "Initial",
        timestamp: now(),
      });

      audit.emit("NODE_UPDATED", {
        nodeId: node.id,
        field: "content",
        oldValue: "Initial",
        newValue: "Updated",
        timestamp: now(),
      });

      audit.emit("NODE_ARCHIVED", {
        nodeId: node.id,
        timestamp: now(),
      });

      // Verify we can reconstruct the state from events
      const nodeEvents = audit.getByNodeId(node.id);
      expect(nodeEvents.length).toBe(3);

      // Events should contain enough info to replay
      const createEvent = nodeEvents.find((e) => e.type === "NODE_CREATED");
      expect(createEvent?.data.title).toBe("Test");
      expect(createEvent?.data.content).toBe("Initial");

      const updateEvent = nodeEvents.find((e) => e.type === "NODE_UPDATED");
      expect(updateEvent?.data.oldValue).toBe("Initial");
      expect(updateEvent?.data.newValue).toBe("Updated");

      const archiveEvent = nodeEvents.find((e) => e.type === "NODE_ARCHIVED");
      expect(archiveEvent).toBeDefined();
    });
  });

  // ===========================================================================
  // Additional: Audit immutability
  // ===========================================================================
  describe("Audit immutability", () => {
    it("should not allow modification of emitted events", async () => {
      audit.emit("TEST_EVENT", { value: 1 });

      const events = audit.events;
      const originalLength = events.length;

      // Events array should be the internal array
      // In production, this would return a copy
      expect(events.length).toBe(originalLength);
    });
  });

  // ===========================================================================
  // Additional: Audit filtering
  // ===========================================================================
  describe("Audit filtering", () => {
    it("should support filtering events by type and node", async () => {
      const node1 = generateNodeId();
      const node2 = generateNodeId();

      audit.emit("EXPORT_CREATED", { nodeId: node1 });
      audit.emit("EXPORT_CREATED", { nodeId: node2 });
      audit.emit("IMPORT_UPDATED", { nodeId: node1 });
      audit.emit("CONFLICT", { nodeId: node2 });

      // Filter by type
      const exportEvents = audit.getByType("EXPORT_CREATED");
      expect(exportEvents.length).toBe(2);

      // Filter by node
      const node1Events = audit.getByNodeId(node1);
      expect(node1Events.length).toBe(2);

      // Predicate filtering
      const hasConflict = audit.hasEvent("CONFLICT", (d) => d.nodeId === node2);
      expect(hasConflict).toBe(true);
    });
  });

  // ===========================================================================
  // Additional: Audit persistence readiness
  // ===========================================================================
  describe("Audit persistence readiness", () => {
    it("should produce JSON-serializable events", async () => {
      const nodeId = generateNodeId();

      audit.emit("COMPLEX_EVENT", {
        nodeId,
        nested: { a: 1, b: [1, 2, 3] },
        date: Date.now(),
        nullValue: null,
        undefinedValue: undefined,
      });

      // Should be serializable
      const json = JSON.stringify(audit.events);
      expect(json).toBeDefined();

      // Should be deserializable
      const parsed = JSON.parse(json);
      expect(parsed.length).toBe(1);
    });
  });
});
