// =============================================================================
// MARKDOWN IMPORTER - Import Obsidian Markdown Changes to LKGC
// =============================================================================
// Converts Markdown file changes into ContentOperation events for LKGC.
//
// Core principles from spec:
// - All imports are content operations with provenance
// - New wikilinks create pending stub nodes (require confirmation)
// - Never auto-infer structural edges (prerequisite_of)
// - Default edge confidence ~0.6
// - Inherit privacy from parent node, default to private
//
// NO UI. NO AI. NO SCHEDULING.
// =============================================================================

import type {
  NodeId,
  Timestamp,
  Confidence,
  PrivacyLevel,
} from "../../types/lkgc/foundation";
import type { LKGCNode } from "../../types/lkgc/nodes";
import type { EdgeType } from "../../types/lkgc/edges";
import type {
  MarkdownFile,
  ParsedWikilink,
  PendingNode,
  EdgeInferenceConfig,
  ImportProvenance,
  InferableEdgeType,
  ContentOperation,
} from "./markdown-types";
import { MarkdownParser } from "./markdown-parser";
import {
  generateNodeId,
  generateEdgeId,
  now,
  confidence as createConfidence,
} from "../id-generator";

// =============================================================================
// IMPORT OPERATION TYPES
// =============================================================================

/**
 * Types of changes detected in a Markdown file
 */
export type ChangeType =
  | "frontmatter_edit" // User edited allowed frontmatter fields
  | "body_edit" // User edited body content
  | "wikilink_added" // New wikilink in body
  | "wikilink_removed" // Wikilink removed from body
  | "file_created" // New file appeared
  | "file_deleted"; // File was deleted

/**
 * A detected change in a Markdown file
 */
export interface DetectedChange {
  readonly type: ChangeType;
  readonly field?: string; // For frontmatter edits
  readonly oldValue?: unknown;
  readonly newValue?: unknown;
  readonly wikilink?: ParsedWikilink; // For wikilink changes
}

/**
 * Re-export ContentOperation from types for convenience
 */
export type { ContentOperation } from "./markdown-types";

/**
 * Result of importing a Markdown file
 */
export interface ImportResult {
  readonly success: boolean;
  readonly nodeId: NodeId | undefined;
  readonly filePath: string;
  readonly changes: readonly DetectedChange[];
  readonly operations: readonly ContentOperation[];
  readonly pendingNodes: readonly PendingNode[];
  readonly warnings: readonly string[];
  readonly error?: string;
}

// =============================================================================
// CHANGE DETECTION
// =============================================================================

/**
 * Fields in frontmatter that users can edit
 */
const EDITABLE_FRONTMATTER_FIELDS: readonly string[] = [
  "aliases",
  "tags",
  "strategy_tags",
  "domain",
  // Note: title edits are detected from body H1
];

/**
 * Detect changes between old and new Markdown content
 */
export function detectChanges(
  oldFile: MarkdownFile | undefined,
  newFile: MarkdownFile,
): readonly DetectedChange[] {
  const changes: DetectedChange[] = [];

  // New file
  if (!oldFile) {
    changes.push({ type: "file_created" });
    // Also detect all wikilinks as new
    for (const wikilink of newFile.parsedWikilinks) {
      changes.push({ type: "wikilink_added", wikilink });
    }
    return changes;
  }

  // Frontmatter changes (only editable fields)
  for (const field of EDITABLE_FRONTMATTER_FIELDS) {
    const oldVal = (
      oldFile.frontmatter as unknown as Record<string, unknown> | null
    )?.[field];
    const newVal = (
      newFile.frontmatter as unknown as Record<string, unknown> | null
    )?.[field];

    if (!deepEqual(oldVal, newVal)) {
      changes.push({
        type: "frontmatter_edit",
        field,
        oldValue: oldVal,
        newValue: newVal,
      });
    }
  }

  // Body content changes
  if (oldFile.bodyHash !== newFile.bodyHash) {
    changes.push({
      type: "body_edit",
      oldValue: oldFile.body,
      newValue: newFile.body,
    });
  }

  // Wikilink changes
  const oldLinks = new Set(oldFile.parsedWikilinks.map((w) => wikilinkKey(w)));
  const newLinks = new Set(newFile.parsedWikilinks.map((w) => wikilinkKey(w)));

  for (const wikilink of newFile.parsedWikilinks) {
    if (!oldLinks.has(wikilinkKey(wikilink))) {
      changes.push({ type: "wikilink_added", wikilink });
    }
  }

  for (const wikilink of oldFile.parsedWikilinks) {
    if (!newLinks.has(wikilinkKey(wikilink))) {
      changes.push({ type: "wikilink_removed", wikilink });
    }
  }

  return changes;
}

/**
 * Generate a unique key for a wikilink
 */
function wikilinkKey(wikilink: ParsedWikilink): string {
  return `${wikilink.target}|${wikilink.displayAlias || ""}`;
}

/**
 * Simple deep equality check
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as object);
    const bKeys = Object.keys(b as object);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) =>
      deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
    );
  }
  return false;
}

// =============================================================================
// OPERATION GENERATION
// =============================================================================

/**
 * Extended edge inference config for import operations
 */
export interface ImportEdgeInferenceConfig extends EdgeInferenceConfig {
  /** Global default confidence for inferred edges */
  readonly globalDefaultConfidence: Confidence;

  /** Per-type confidence overrides */
  readonly confidenceByType: Map<EdgeType, Confidence>;

  /** Edge types that can be auto-inferred from wikilinks */
  readonly allowedInferredTypes: readonly InferableEdgeType[];

  /** Structural edge types (never auto-inferred) */
  readonly structuralEdgeTypes: readonly EdgeType[];

  /** Default privacy for new pending nodes */
  readonly defaultPrivacy: PrivacyLevel;
}

/**
 * Generate content operations from detected changes
 */
export function generateOperations(
  nodeId: NodeId,
  changes: readonly DetectedChange[],
  _newFile: MarkdownFile,
  nodeResolver: (nodeId: NodeId) => LKGCNode | undefined,
  nodeByTitle: (title: string) => LKGCNode | undefined,
  edgeInferenceConfig: ImportEdgeInferenceConfig,
): {
  operations: ContentOperation[];
  pendingNodes: PendingNode[];
  warnings: string[];
} {
  const operations: ContentOperation[] = [];
  const pendingNodes: PendingNode[] = [];
  const warnings: string[] = [];
  const timestamp = now();

  const provenance: ImportProvenance = {
    action: "user_action",
    source: "obsidian",
    timestamp,
    userId: undefined, // Will be set by sync engine
    sessionId: undefined,
  };

  const existingNode = nodeResolver(nodeId);

  for (const change of changes) {
    switch (change.type) {
      case "frontmatter_edit": {
        if (
          change.field &&
          EDITABLE_FRONTMATTER_FIELDS.includes(change.field)
        ) {
          operations.push({
            operationType: "update_node",
            targetId: nodeId,
            payload: { [change.field]: change.newValue },
            provenance,
            timestamp,
          });
        }
        break;
      }

      case "body_edit": {
        // Extract title and content from body
        const bodyOps = generateBodyUpdateOperations(
          nodeId,
          change.newValue as string,
          existingNode,
          provenance,
          timestamp,
        );
        operations.push(...bodyOps.operations);
        warnings.push(...bodyOps.warnings);
        break;
      }

      case "wikilink_added": {
        if (change.wikilink) {
          const linkResult = handleNewWikilink(
            nodeId,
            change.wikilink,
            nodeByTitle,
            edgeInferenceConfig,
            provenance,
            timestamp,
          );
          operations.push(...linkResult.operations);
          if (linkResult.pendingNode) {
            pendingNodes.push(linkResult.pendingNode);
          }
          warnings.push(...linkResult.warnings);
        }
        break;
      }

      case "wikilink_removed": {
        // Only remove 'mentions' edges - structural edges stay
        if (change.wikilink) {
          const removeResult = handleRemovedWikilink(
            nodeId,
            change.wikilink,
            nodeByTitle,
            edgeInferenceConfig,
            provenance,
            timestamp,
          );
          operations.push(...removeResult.operations);
          warnings.push(...removeResult.warnings);
        }
        break;
      }

      case "file_created": {
        // New file - this should be handled specially by sync engine
        warnings.push(
          "New file detected - requires manual node creation or pending node resolution",
        );
        break;
      }
    }
  }

  return { operations, pendingNodes, warnings };
}

/**
 * Generate operations for body content update
 */
function generateBodyUpdateOperations(
  targetNodeId: NodeId,
  newBody: string,
  existingNode: LKGCNode | undefined,
  provenance: ImportProvenance,
  timestamp: Timestamp,
): { operations: ContentOperation[]; warnings: string[] } {
  const operations: ContentOperation[] = [];
  const warnings: string[] = [];

  // Extract title (first H1)
  const titleMatch = newBody.match(/^#\s+(.+)$/m);
  const newTitle = titleMatch ? titleMatch[1].trim() : undefined;

  // Build update payload based on node type
  const payload: Record<string, unknown> = {};

  if (newTitle && existingNode && newTitle !== existingNode.title) {
    payload.title = newTitle;
  }

  // Extract description (content between title and first section)
  const descriptionMatch = newBody.match(
    /^#\s+.+\n\n([\s\S]*?)(?=\n##|\n---|$)/,
  );
  if (descriptionMatch && descriptionMatch[1].trim()) {
    payload.description = descriptionMatch[1].trim();
  }

  // Node-type specific content extraction would go here
  // For now, store the full body as 'content' for note types
  if (existingNode?.nodeType === "note") {
    // Remove title line and store rest as content
    const contentWithoutTitle = newBody.replace(/^#\s+.+\n\n?/, "");
    payload.content = contentWithoutTitle;
  }

  if (Object.keys(payload).length > 0) {
    operations.push({
      operationType: "update_node",
      targetId: targetNodeId,
      payload,
      provenance,
      timestamp,
    });
  }

  return { operations, warnings };
}

/**
 * Handle a new wikilink in the body
 */
function handleNewWikilink(
  sourceNodeId: NodeId,
  wikilink: ParsedWikilink,
  nodeByTitle: (title: string) => LKGCNode | undefined,
  config: ImportEdgeInferenceConfig,
  provenance: ImportProvenance,
  timestamp: Timestamp,
): {
  operations: ContentOperation[];
  pendingNode?: PendingNode;
  warnings: string[];
} {
  const operations: ContentOperation[] = [];
  const warnings: string[] = [];

  // Try to resolve the target
  const targetNode = nodeByTitle(wikilink.target);

  if (targetNode) {
    // Create edge if allowed
    const edgeType = determineEdgeType(config);

    if (edgeType && config.allowedInferredTypes.includes(edgeType)) {
      const newEdgeId = generateEdgeId();
      const edgeConfidence =
        config.confidenceByType.get(edgeType) ?? config.globalDefaultConfidence;

      operations.push({
        operationType: "create_edge",
        targetId: newEdgeId,
        payload: {
          id: newEdgeId,
          edgeType,
          sourceId: sourceNodeId,
          targetId: targetNode.id,
          confidence: edgeConfidence,
          provenance: {
            schemaVersion: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
            source: "markdown_import",
          },
        },
        provenance,
        timestamp,
      });
    } else if (edgeType && !config.allowedInferredTypes.includes(edgeType)) {
      warnings.push(
        `Cannot auto-create ${edgeType} edge to "${wikilink.target}" - requires manual confirmation`,
      );
    }
  } else {
    // Create pending stub node
    const pending = createPendingNode(
      wikilink,
      sourceNodeId,
      config,
      timestamp,
    );
    operations.push({
      operationType: "create_pending_node",
      targetId: pending.tempId,
      payload: { ...pending } as unknown as Readonly<Record<string, unknown>>,
      provenance,
      timestamp,
      pendingNode: pending,
    });

    return { operations, pendingNode: pending, warnings };
  }

  return { operations, warnings };
}

/**
 * Create a pending stub node for an unresolved wikilink
 */
function createPendingNode(
  wikilink: ParsedWikilink,
  sourceNodeId: NodeId,
  config: ImportEdgeInferenceConfig,
  timestamp: Timestamp,
): PendingNode {
  const tempId = generateNodeId(); // Generate a temporary ID

  return {
    tempId,
    suggestedTitle: wikilink.target,
    suggestedType: "concept", // Default guess - user must confirm
    sourceWikilink: wikilink,
    linkedFromNodes: [sourceNodeId],
    status: "awaiting_confirmation",
    createdAt: timestamp,
    inheritedPrivacy: config.defaultPrivacy,
    confidence: createConfidence(0.6), // Low confidence - needs user confirmation
  };
}

/**
 * Determine edge type from wikilink context
 */
function determineEdgeType(
  _config: ImportEdgeInferenceConfig,
): InferableEdgeType {
  // Only create 'mentions' edges by default
  // Structural edges like prerequisite_of should NEVER be auto-inferred
  return "mentions";
}

/**
 * Handle a removed wikilink
 */
function handleRemovedWikilink(
  _sourceNodeId: NodeId,
  wikilink: ParsedWikilink,
  nodeByTitle: (title: string) => LKGCNode | undefined,
  _config: ImportEdgeInferenceConfig,
  _provenance: ImportProvenance,
  _timestamp: Timestamp,
): { operations: ContentOperation[]; warnings: string[] } {
  const operations: ContentOperation[] = [];
  const warnings: string[] = [];

  const targetNode = nodeByTitle(wikilink.target);
  if (!targetNode) {
    // Target doesn't exist, nothing to remove
    return { operations, warnings };
  }

  // Only allow removing 'mentions' edges - structural edges require manual deletion
  warnings.push(
    `Wikilink to "${wikilink.target}" removed - associated 'mentions' edge will be marked for review`,
  );

  // Note: We don't actually delete the edge here
  // The sync engine should mark it for review and let the user confirm

  return { operations, warnings };
}

// =============================================================================
// MARKDOWN IMPORTER CLASS
// =============================================================================

/**
 * Importer dependencies
 */
export interface ImporterDependencies {
  /** Resolve node by ID */
  readonly getNode: (nodeId: NodeId) => LKGCNode | undefined;

  /** Resolve node by title */
  readonly getNodeByTitle: (title: string) => LKGCNode | undefined;

  /** Get the previously exported file for a node */
  readonly getPreviousExport: (nodeId: NodeId) => MarkdownFile | undefined;

  /** Parse Markdown content */
  readonly parser: MarkdownParser;

  /** Edge inference configuration */
  readonly edgeInferenceConfig: ImportEdgeInferenceConfig;
}

/**
 * Markdown importer for LKGC
 */
export class MarkdownImporter {
  private readonly deps: ImporterDependencies;

  constructor(deps: ImporterDependencies) {
    this.deps = deps;
  }

  /**
   * Import changes from a Markdown file
   */
  import(content: string, filePath: string, nodeId?: NodeId): ImportResult {
    const warnings: string[] = [];

    try {
      // Parse the new content
      const newFile = this.deps.parser.parseForSync(content, filePath);

      // Determine the node ID
      let resolvedNodeId = nodeId;
      if (!resolvedNodeId && newFile.frontmatter?.lkgc_id) {
        resolvedNodeId = newFile.frontmatter.lkgc_id;
      }

      if (!resolvedNodeId) {
        return {
          success: false,
          nodeId: undefined,
          filePath,
          changes: [],
          operations: [],
          pendingNodes: [],
          warnings: [
            "Cannot determine node ID - file has no lkgc_id in frontmatter",
          ],
          error: "Missing node ID",
        };
      }

      // Get the previous version
      const oldFile = this.deps.getPreviousExport(resolvedNodeId);

      // Detect changes
      const changes = detectChanges(oldFile, newFile);

      if (changes.length === 0) {
        return {
          success: true,
          nodeId: resolvedNodeId,
          filePath,
          changes: [],
          operations: [],
          pendingNodes: [],
          warnings: ["No changes detected"],
        };
      }

      // Generate operations
      const {
        operations,
        pendingNodes,
        warnings: opWarnings,
      } = generateOperations(
        resolvedNodeId,
        changes,
        newFile,
        this.deps.getNode,
        this.deps.getNodeByTitle,
        this.deps.edgeInferenceConfig,
      );

      warnings.push(...opWarnings);

      return {
        success: true,
        nodeId: resolvedNodeId,
        filePath,
        changes,
        operations,
        pendingNodes,
        warnings,
      };
    } catch (error) {
      return {
        success: false,
        nodeId,
        filePath,
        changes: [],
        operations: [],
        pendingNodes: [],
        warnings,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Detect if a file was deleted (called with file path only)
   */
  detectDeletion(
    filePath: string,
    nodeId: NodeId,
  ): ContentOperation | undefined {
    const timestamp = now();

    return {
      operationType: "delete_node",
      targetId: nodeId,
      payload: {
        deletionType: "pending", // Goes to pending_deletion, not immediate delete
        filePath,
      },
      provenance: {
        action: "user_action",
        source: "obsidian",
        timestamp,
        userId: undefined,
        sessionId: undefined,
      },
      timestamp,
    };
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create default edge inference configuration for import operations
 */
export function createDefaultImportEdgeInferenceConfig(): ImportEdgeInferenceConfig {
  const confidenceByType = new Map<EdgeType, Confidence>([
    ["mentions", 0.7 as Confidence],
    ["backlink", 0.7 as Confidence],
    ["part_of", 0.5 as Confidence],
    ["explains", 0.5 as Confidence],
    // prerequisite_of is NOT in this map - never auto-inferred
  ]);

  return {
    // Base EdgeInferenceConfig fields
    enabled: true,
    defaultEdgeType: "mentions",
    createBidirectional: false,
    minConfidenceThreshold: 0.5 as Confidence,

    // Extended ImportEdgeInferenceConfig fields
    globalDefaultConfidence: 0.6 as Confidence,
    confidenceByType,
    allowedInferredTypes: ["mentions"], // Only 'mentions' can be auto-created
    structuralEdgeTypes: [
      "prerequisite_of",
      "part_of",
      "explains",
      "example_of",
    ],
    defaultPrivacy: "private",
  };
}

/**
 * Create a Markdown importer with dependencies
 */
export function createMarkdownImporter(
  deps: ImporterDependencies,
): MarkdownImporter {
  return new MarkdownImporter(deps);
}
