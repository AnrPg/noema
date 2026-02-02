// =============================================================================
// TEST HELPERS - Common utilities for Markdown Mirror tests
// =============================================================================
// Provides factory functions, mock data, and assertion helpers for testing
// the bidirectional sync between LKGC and Obsidian Markdown.
//
// NO UI. NO AI. NO SCHEDULING.
// =============================================================================

import type {
  NodeId,
  EdgeId,
  Timestamp,
  RevisionNumber,
  Confidence,
  PrivacyLevel,
  DeviceId,
  UserId,
  NormalizedValue,
} from "../../../types/lkgc/foundation";
import type {
  LKGCNode,
  ConceptNode,
  FactNode,
  NoteNode,
} from "../../../types/lkgc/nodes";
import type { LKGCEdge, MentionsEdge } from "../../../types/lkgc/edges";
import type { MasteryState } from "../../../types/lkgc/mastery";
import type {
  MarkdownFile,
  MarkdownFrontmatter,
  ParsedWikilink,
  ContentHash,
  PendingNode,
  DeletionState,
  DeletionStatus,
  ExportableNodeType,
} from "../markdown-types";
import { generateContentHash } from "../markdown-parser";
import {
  generateNodeId,
  generateEdgeId,
  now,
  revision,
  confidence,
  timestamp,
} from "../../id-generator";

// =============================================================================
// COUNTER FOR UNIQUE IDS
// =============================================================================

let idCounter = 0;

/**
 * Reset ID counter (call in beforeEach)
 */
export function resetIdCounter(): void {
  idCounter = 0;
}

/**
 * Generate a unique test ID
 */
export function uniqueId(prefix = "test"): string {
  return `${prefix}_${++idCounter}_${Date.now()}`;
}

// =============================================================================
// NODE FACTORIES
// =============================================================================

/**
 * Create a minimal LKGC node for testing
 */
export function createTestNode(
  overrides: Partial<LKGCNode> & { nodeType: ExportableNodeType } = {
    nodeType: "concept",
  },
): LKGCNode {
  const id = generateNodeId();
  const baseTimestamp = now();

  const baseNode = {
    id,
    nodeType: overrides.nodeType,
    title: overrides.title ?? `Test Node ${idCounter++}`,
    description: overrides.description,
    aliases: overrides.aliases ?? [],
    provenance: {
      source: "user_action" as const,
      sourceId: "test",
      confidence: 1.0 as Confidence,
      createdAt: baseTimestamp,
      updatedAt: baseTimestamp,
      deviceId: "test_device" as DeviceId,
      appVersion: "1.0.0",
      schemaVersion: 1,
    },
    privacy: {
      level: (overrides as any).privacyLevel ?? ("private" as PrivacyLevel),
      visibleTo: [],
      encryptionKeyId: undefined,
    },
    sync: {
      localRevision: revision(1),
      baseRevision: revision(0),
      isTombstone: false,
      mergeParents: [],
      lastSyncedAt: undefined,
    },
  };

  // Add type-specific fields
  switch (overrides.nodeType) {
    case "concept":
      return {
        ...baseNode,
        ...overrides,
        definition:
          (overrides as any).definition ??
          (overrides as any).content ??
          "Test concept definition",
        intuition: (overrides as any).intuition,
        domain: (overrides as any).domain ?? "mathematics",
        abstractionLevel: (overrides as any).abstractionLevel ?? 3,
      } as unknown as ConceptNode;
    case "fact":
      return {
        ...baseNode,
        ...overrides,
        claim:
          (overrides as any).claim ??
          (overrides as any).content ??
          "Test fact claim",
        truthValue: (overrides as any).truthValue ?? true,
        domain: (overrides as any).domain ?? "general",
      } as unknown as FactNode;
    case "note":
      return {
        ...baseNode,
        ...overrides,
        content: (overrides as any).content ?? "Test note content",
      } as unknown as NoteNode;
    default:
      return {
        ...baseNode,
        ...overrides,
        content: (overrides as any).content ?? "Test content",
      } as unknown as LKGCNode;
  }
}

/**
 * Create a concept node
 */
export function createConceptNode(
  title: string,
  definition: string,
  overrides: Partial<ConceptNode> = {},
): ConceptNode {
  return createTestNode({
    nodeType: "concept",
    title,
    definition,
    ...overrides,
  } as any) as ConceptNode;
}

/**
 * Create a fact node
 */
export function createFactNode(
  title: string,
  claim: string,
  overrides: Partial<FactNode> = {},
): FactNode {
  return createTestNode({
    nodeType: "fact",
    title,
    claim,
    ...overrides,
  } as any) as FactNode;
}

/**
 * Create a note node
 */
export function createNoteNode(
  title: string,
  content: string,
  overrides: Partial<NoteNode> = {},
): NoteNode {
  return createTestNode({
    nodeType: "note",
    title,
    content,
    ...overrides,
  } as any) as NoteNode;
}

// =============================================================================
// EDGE FACTORIES
// =============================================================================

/**
 * Create a test edge
 */
export function createTestEdge(
  sourceId: NodeId,
  targetId: NodeId,
  edgeType: LKGCEdge["edgeType"] = "mentions",
  overrides: Partial<LKGCEdge> = {},
): LKGCEdge {
  const id = generateEdgeId();
  const baseTimestamp = now();

  return {
    id,
    edgeType,
    sourceId,
    targetId,
    weight: overrides.weight ?? (0.6 as NormalizedValue),
    polarity: overrides.polarity ?? "neutral",
    evidenceCount: 1,
    lastEvidenceAt: baseTimestamp,
    bidirectional: false,
    provenance: {
      source: "user_action" as const,
      sourceId: "test",
      confidence: 1.0 as Confidence,
      createdAt: baseTimestamp,
      updatedAt: baseTimestamp,
      deviceId: "test_device" as DeviceId,
      appVersion: "1.0.0",
      schemaVersion: 1,
    },
    privacy: {
      level: "private" as PrivacyLevel,
      visibleTo: [],
      encryptionKeyId: undefined,
    },
    sync: {
      localRevision: revision(1),
      baseRevision: revision(0),
      isTombstone: false,
      mergeParents: [],
      lastSyncedAt: undefined,
    },
    ...overrides,
  } as LKGCEdge;
}

/**
 * Create a mentions edge (for wikilinks)
 */
export function createMentionsEdge(
  sourceId: NodeId,
  targetId: NodeId,
  overrides: Partial<MentionsEdge> = {},
): MentionsEdge {
  return createTestEdge(sourceId, targetId, "mentions", {
    weight: 0.9 as NormalizedValue,
    ...overrides,
  }) as MentionsEdge;
}

// =============================================================================
// MASTERY STATE FACTORIES
// =============================================================================

/**
 * Create a test mastery state
 */
export function createTestMasteryState(
  nodeId: NodeId,
  state: "new" | "learning" | "review" | "relearning" = "new",
): MasteryState {
  const baseTimestamp = now();

  return {
    id: `mastery_${nodeId}` as any,
    nodeId,
    granularity: "concept",
    memory: {
      stability: state === "new" ? 0 : 10,
      difficulty: 0.5 as NormalizedValue,
      retrievability: (state === "new" ? 1 : 0.9) as NormalizedValue,
      halfLife: state === "new" ? 1 : 7,
      learningState: state,
      reps: state === "new" ? 0 : 3,
      lapses: 0,
      streak: state === "new" ? 0 : 3,
      elapsedDays: state === "new" ? 0 : 14,
      scheduledDays: state === "new" ? 1 : 7,
      dueDate: (baseTimestamp +
        (state === "new" ? 86400000 : 604800000)) as Timestamp,
      lastReview: state === "new" ? undefined : baseTimestamp,
      targetRetention: 0.9 as NormalizedValue,
    },
    evidence: {
      totalReviews: state === "new" ? 0 : 5,
      reviewsByOutcome: {
        again: 0,
        hard: 1,
        good: 3,
        easy: 1,
      },
      averageResponseTime: state === "new" ? 0 : 3000,
      lastResponseTime: state === "new" ? 0 : 2500,
      firstReviewDate:
        state === "new"
          ? undefined
          : ((baseTimestamp - 86400000 * 14) as Timestamp),
      lastReviewDate: state === "new" ? undefined : baseTimestamp,
    },
    metacognition: {
      confidenceAccuracy: 0.8,
      judgmentOfLearning: 0.7,
      feelingOfKnowing: 0.75,
    },
    forgetting: {
      forgettingRate: 0.1,
      interferenceLevel: 0.2,
      retentionStrength: 0.8,
    },
    generalization: {
      transferScore: 0.5,
      applicationBreadth: 0.4,
    },
    cognitiveLoad: {
      intrinsicLoad: 0.5,
      extraneousLoad: 0.2,
      germaneLoad: 0.3,
    },
    affect: {
      engagement: 0.7,
      frustration: 0.2,
      confidence: 0.75,
    },
    trust: {
      reliabilityScore: 0.9,
      varianceEstimate: 0.1,
    },
    computedAt: baseTimestamp,
    stateVersion: 1,
    provenance: {
      source: "system" as const,
      sourceId: "mastery_calculator",
      confidence: 1.0 as Confidence,
      createdAt: baseTimestamp,
      updatedAt: baseTimestamp,
      deviceId: "test_device" as DeviceId,
      appVersion: "1.0.0",
      schemaVersion: 1,
    },
    privacy: {
      level: "private" as PrivacyLevel,
      visibleTo: [],
      encryptionKeyId: undefined,
    },
    sync: {
      localRevision: revision(1),
      baseRevision: revision(0),
      isTombstone: false,
      mergeParents: [],
      lastSyncedAt: undefined,
    },
  } as unknown as MasteryState;
}

// =============================================================================
// MARKDOWN FILE FACTORIES
// =============================================================================

/**
 * Create a test markdown file
 */
export function createTestMarkdownFile(
  relativePath: string,
  body: string,
  frontmatter: Partial<MarkdownFrontmatter> = {},
): MarkdownFile {
  const baseTimestamp = now();
  const nodeId = frontmatter.lkgc_id ?? generateNodeId();

  const fullFrontmatter: MarkdownFrontmatter = {
    lkgc_id: nodeId,
    node_type: frontmatter.node_type ?? "concept",
    schema_version: frontmatter.schema_version ?? 1,
    rev: frontmatter.rev ?? (1 as RevisionNumber),
    source: "lkgc_mirror",
    privacy_level: frontmatter.privacy_level ?? ("private" as PrivacyLevel),
    created_at: frontmatter.created_at ?? baseTimestamp,
    updated_at: frontmatter.updated_at ?? baseTimestamp,
    ...frontmatter,
  };

  return {
    relativePath,
    frontmatter: fullFrontmatter,
    body,
    bodyHash: generateContentHash(body),
    parsedWikilinks: extractWikilinks(body),
    lastModified: baseTimestamp,
    exists: true,
  };
}

/**
 * Create a raw markdown string from frontmatter and body
 */
export function createRawMarkdown(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  const yamlLines: string[] = ["---"];

  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      if (value.length === 0) {
        yamlLines.push(`${key}: []`);
      } else {
        yamlLines.push(`${key}:`);
        for (const item of value) {
          yamlLines.push(`  - ${JSON.stringify(item)}`);
        }
      }
    } else if (typeof value === "object" && value !== null) {
      yamlLines.push(`${key}:`);
      for (const [subKey, subValue] of Object.entries(value)) {
        yamlLines.push(`  ${subKey}: ${JSON.stringify(subValue)}`);
      }
    } else {
      yamlLines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }

  yamlLines.push("---");
  yamlLines.push("");
  yamlLines.push(body);

  return yamlLines.join("\n");
}

/**
 * Extract wikilinks from body (simple implementation for tests)
 */
export function extractWikilinks(body: string): readonly ParsedWikilink[] {
  const wikilinks: ParsedWikilink[] = [];
  const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let match;

  while ((match = regex.exec(body)) !== null) {
    const target = match[1].trim();
    // Skip empty or whitespace-only targets
    if (!target) {
      continue;
    }
    wikilinks.push({
      originalText: match[0],
      target,
      displayAlias: match[2]?.trim(),
      position: match.index,
      lineNumber: body.substring(0, match.index).split("\n").length,
      resolution: "unresolved",
    });
  }

  return wikilinks;
}

// =============================================================================
// PENDING NODE FACTORIES
// =============================================================================

/**
 * Create a pending node
 */
export function createTestPendingNode(
  title: string,
  overrides: Partial<PendingNode> = {},
): PendingNode {
  const baseTimestamp = now();
  const tempId = generateNodeId();

  return {
    tempId,
    suggestedTitle: title,
    suggestedType: overrides.suggestedType ?? "concept",
    sourceWikilink: overrides.sourceWikilink ?? {
      originalText: `[[${title}]]`,
      target: title,
      position: 0,
      lineNumber: 1,
      resolution: "unresolved",
    },
    linkedFromNodes: overrides.linkedFromNodes ?? [],
    status: overrides.status ?? "awaiting_confirmation",
    createdAt: overrides.createdAt ?? baseTimestamp,
    inheritedPrivacy: overrides.inheritedPrivacy ?? "private",
    confidence: overrides.confidence ?? (0.3 as Confidence),
    ...overrides,
  };
}

// =============================================================================
// DELETION STATE FACTORIES
// =============================================================================

/**
 * Create a deletion state
 */
export function createTestDeletionState(
  nodeId: NodeId,
  status: DeletionStatus = "pending_confirmation",
  overrides: Partial<DeletionState> = {},
): DeletionState {
  const baseTimestamp = now();

  return {
    nodeId,
    filePath: overrides.filePath ?? `${nodeId}.md`,
    status,
    detectedAt: overrides.detectedAt ?? baseTimestamp,
    gracePeriodEnds:
      overrides.gracePeriodEnds ?? ((baseTimestamp + 86400000) as Timestamp),
    confirmedAt: overrides.confirmedAt,
    ...overrides,
  };
}

// =============================================================================
// MOCK STORES
// =============================================================================

/**
 * Create a mock node store
 */
export function createMockNodeStore(initialNodes: LKGCNode[] = []): {
  nodes: Map<NodeId, LKGCNode>;
  getNode: (id: NodeId) => LKGCNode | undefined;
  getNodeByTitle: (title: string) => LKGCNode | undefined;
  getAllNodes: () => LKGCNode[];
  addNode: (node: LKGCNode) => void;
  updateNode: (id: NodeId, updates: Partial<LKGCNode>) => void;
  archiveNode: (id: NodeId) => void;
} {
  const nodes = new Map<NodeId, LKGCNode>();

  for (const node of initialNodes) {
    nodes.set(node.id, node);
  }

  return {
    nodes,
    getNode: (id: NodeId) => nodes.get(id),
    getNodeByTitle: (title: string) => {
      for (const node of nodes.values()) {
        if (node.title === title) return node;
        if (node.aliases?.includes(title)) return node;
      }
      return undefined;
    },
    getAllNodes: () => Array.from(nodes.values()),
    addNode: (node: LKGCNode) => nodes.set(node.id, node),
    updateNode: (id: NodeId, updates: Partial<LKGCNode>) => {
      const existing = nodes.get(id);
      if (existing) {
        nodes.set(id, { ...existing, ...updates } as LKGCNode);
      }
    },
    archiveNode: (id: NodeId) => {
      const existing = nodes.get(id);
      if (existing) {
        nodes.set(id, { ...existing, archivedAt: now() } as LKGCNode);
      }
    },
  };
}

/**
 * Create a mock edge store
 */
export function createMockEdgeStore(initialEdges: LKGCEdge[] = []): {
  edges: Map<EdgeId, LKGCEdge>;
  getEdge: (id: EdgeId) => LKGCEdge | undefined;
  getOutgoingEdges: (nodeId: NodeId) => readonly LKGCEdge[];
  getIncomingEdges: (nodeId: NodeId) => readonly LKGCEdge[];
  addEdge: (edge: LKGCEdge) => void;
  removeEdge: (id: EdgeId) => void;
} {
  const edges = new Map<EdgeId, LKGCEdge>();

  for (const edge of initialEdges) {
    edges.set(edge.id, edge);
  }

  return {
    edges,
    getEdge: (id: EdgeId) => edges.get(id),
    getOutgoingEdges: (nodeId: NodeId) =>
      Array.from(edges.values()).filter((e) => e.sourceId === nodeId),
    getIncomingEdges: (nodeId: NodeId) =>
      Array.from(edges.values()).filter((e) => e.targetId === nodeId),
    addEdge: (edge: LKGCEdge) => edges.set(edge.id, edge),
    removeEdge: (id: EdgeId) => edges.delete(id),
  };
}

/**
 * Create a mock mastery store
 */
export function createMockMasteryStore(initialStates: MasteryState[] = []): {
  states: Map<NodeId, MasteryState>;
  getMasteryState: (nodeId: NodeId) => MasteryState | undefined;
  setMasteryState: (state: MasteryState) => void;
} {
  const states = new Map<NodeId, MasteryState>();

  for (const state of initialStates) {
    states.set(state.nodeId, state);
  }

  return {
    states,
    getMasteryState: (nodeId: NodeId) => states.get(nodeId),
    setMasteryState: (state: MasteryState) => states.set(state.nodeId, state),
  };
}

// =============================================================================
// AUDIT EVENT COLLECTOR
// =============================================================================

export interface AuditEvent {
  type: string;
  nodeId?: NodeId;
  edgeId?: EdgeId;
  timestamp: Timestamp;
  data: Record<string, unknown>;
}

/**
 * Create an audit event collector for testing
 */
export function createAuditCollector(): {
  events: AuditEvent[];
  emit: (type: string, data: Record<string, unknown>) => void;
  getByType: (type: string) => AuditEvent[];
  getByNodeId: (nodeId: NodeId) => AuditEvent[];
  hasEvent: (
    type: string,
    predicate?: (data: Record<string, unknown>) => boolean,
  ) => boolean;
  clear: () => void;
} {
  const events: AuditEvent[] = [];

  return {
    events,
    emit: (type: string, data: Record<string, unknown>) => {
      events.push({
        type,
        nodeId: data.nodeId as NodeId | undefined,
        edgeId: data.edgeId as EdgeId | undefined,
        timestamp: now(),
        data,
      });
    },
    getByType: (type: string) => events.filter((e) => e.type === type),
    getByNodeId: (nodeId: NodeId) => events.filter((e) => e.nodeId === nodeId),
    hasEvent: (
      type: string,
      predicate?: (data: Record<string, unknown>) => boolean,
    ) =>
      events.some((e) => e.type === type && (!predicate || predicate(e.data))),
    clear: () => {
      events.length = 0;
    },
  };
}

// =============================================================================
// ASSERTION HELPERS
// =============================================================================

/**
 * Assert that a file contains expected frontmatter
 */
export function assertFrontmatterContains(
  content: string,
  expected: Record<string, unknown>,
): void {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    throw new Error("No frontmatter found in content");
  }

  const frontmatter = frontmatterMatch[1];
  for (const [key, value] of Object.entries(expected)) {
    const pattern = new RegExp(`${key}:\\s*`);
    if (!pattern.test(frontmatter)) {
      throw new Error(`Expected frontmatter to contain "${key}"`);
    }
  }
}

/**
 * Assert that a file body contains expected text
 */
export function assertBodyContains(content: string, expected: string): void {
  const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  const body = bodyMatch ? bodyMatch[1] : content;

  if (!body.includes(expected)) {
    throw new Error(`Expected body to contain "${expected}"\nActual: ${body}`);
  }
}

/**
 * Assert that a file has conflict markers
 */
export function assertHasConflictMarkers(content: string): void {
  if (
    !content.includes("<<<<<<< LKGC") ||
    !content.includes(">>>>>>> Obsidian")
  ) {
    throw new Error("Expected content to have conflict markers");
  }
}

/**
 * Assert that a file does NOT have conflict markers
 */
export function assertNoConflictMarkers(content: string): void {
  if (
    content.includes("<<<<<<< LKGC") ||
    content.includes(">>>>>>> Obsidian")
  ) {
    throw new Error("Expected content to NOT have conflict markers");
  }
}
