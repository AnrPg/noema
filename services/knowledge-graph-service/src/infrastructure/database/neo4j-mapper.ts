/**
 * @noema/knowledge-graph-service — Neo4j Record Mapper
 *
 * Converts between Neo4j Records/Node/Relationship objects and domain
 * types (IGraphNode, IGraphEdge, ISubgraph). Isolates all Neo4j-specific
 * data format handling from the repository logic.
 *
 * Handles:
 * - Neo4j Integer (Int64) → JavaScript number
 * - Neo4j DateTime → ISO string
 * - Null properties → undefined in domain types
 * - Relationship records → IGraphEdge with source/target nodeIds extracted
 * - Label-based graphType inference (PkgNode → 'pkg', CkgNode → 'ckg')
 */

import type {
  EdgeId,
  EdgeWeight,
  GraphEdgeType,
  GraphNodeType,
  GraphType,
  IGraphEdge,
  IGraphNode,
  ISubgraph,
  MasteryLevel,
  Metadata,
  NodeId,
} from '@noema/types';
import type { Node, Relationship } from 'neo4j-driver';
import neo4j from 'neo4j-driver';

// ============================================================================
// Neo4j Primitive Conversions
// ============================================================================

/**
 * Convert a Neo4j Integer (Int64) to a JavaScript number.
 * Neo4j driver returns `Integer` objects for all integer values, even small ones.
 */
export function toNumber(value: unknown): number {
  if (neo4j.isInt(value)) {
    return value.toNumber();
  }
  if (typeof value === 'number') {
    return value;
  }
  return 0;
}

/**
 * Convert a Neo4j DateTime to an ISO string.
 * Handles Neo4j DateTime, Date, and LocalDateTime types.
 *
 * Returns a fallback epoch timestamp for null/unrecognized values
 * (indicates data inconsistency — timestamps should always be present).
 */
const EPOCH_FALLBACK = '1970-01-01T00:00:00.000Z';

export function toIsoString(value: unknown): string {
  if (value === null || value === undefined) {
    return EPOCH_FALLBACK;
  }
  // Neo4j DateTime objects have a toString() that produces ISO format
  if (typeof value === 'object' && 'toString' in value) {
    return (value as { toString(): string }).toString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return EPOCH_FALLBACK;
}

/**
 * Convert a Neo4j property value to a JavaScript value suitable for domain types.
 * Handles Integer, DateTime, null, and passthrough for primitives.
 */
function toDomainValue(value: unknown): unknown {
  if (value === null) return undefined;
  if (neo4j.isInt(value)) return value.toNumber();
  if (Array.isArray(value)) return value.map(toDomainValue);
  return value;
}

// ============================================================================
// Graph Type Inference
// ============================================================================

/**
 * Infer the graphType ('pkg' or 'ckg') from Neo4j node labels.
 */
export function inferGraphType(labels: string[]): GraphType {
  if (labels.includes('PkgNode')) return 'pkg' as GraphType;
  if (labels.includes('CkgNode')) return 'ckg' as GraphType;
  // Fallback — should not happen with correct schema
  return 'pkg' as GraphType;
}

/**
 * Infer the nodeType from Neo4j node labels.
 * The nodeType is the secondary label (not PkgNode/CkgNode).
 */
export function inferNodeType(labels: string[]): GraphNodeType {
  const graphLabels = new Set(['PkgNode', 'CkgNode']);
  const nodeTypeLabel = labels.find((l) => !graphLabels.has(l));
  // Convert PascalCase label to lowercase enum value
  return (nodeTypeLabel?.toLowerCase() ?? 'concept') as GraphNodeType;
}

/**
 * Get the primary Neo4j label for a graph type.
 */
export function graphTypeToLabel(graphType: string): string {
  return graphType === 'ckg' ? 'CkgNode' : 'PkgNode';
}

/**
 * Validate that a string is safe to use as a Neo4j label.
 * Prevents Cypher injection through label names.
 */
const SAFE_LABEL_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Convert a nodeType string to a PascalCase Neo4j label.
 * e.g., 'concept' → 'Concept', 'counterexample' → 'Counterexample'
 *
 * Validates the result against a safe-label pattern to prevent Cypher injection.
 */
export function nodeTypeToLabel(nodeType: string): string {
  const label = nodeType.charAt(0).toUpperCase() + nodeType.slice(1);
  if (!SAFE_LABEL_PATTERN.test(label)) {
    throw new Error(`Unsafe Neo4j label derived from nodeType "${nodeType}": "${label}"`);
  }
  return label;
}

/**
 * Convert a GraphEdgeType to the uppercase Neo4j relationship type.
 * e.g., 'prerequisite' → 'PREREQUISITE', 'part_of' → 'PART_OF'
 *
 * Validates the result against a safe-label pattern to prevent Cypher injection.
 */
export function edgeTypeToRelType(edgeType: GraphEdgeType): string {
  const relType = (edgeType as string).toUpperCase();
  if (!SAFE_LABEL_PATTERN.test(relType)) {
    throw new Error(
      `Unsafe Neo4j relationship type derived from edgeType "${edgeType}": "${relType}"`
    );
  }
  return relType;
}

/**
 * Convert a Neo4j relationship type back to a GraphEdgeType enum value.
 * e.g., 'PREREQUISITE' → 'prerequisite', 'PART_OF' → 'part_of'
 */
export function relTypeToEdgeType(relType: string): GraphEdgeType {
  return relType.toLowerCase() as GraphEdgeType;
}

// ============================================================================
// Node Mapping
// ============================================================================

/**
 * Extract flat properties from a Neo4j node, converting Neo4j types to JS types.
 * Returns a plain object with all node properties.
 */
function extractNodeProperties(node: Node): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node.properties)) {
    props[key] = toDomainValue(value);
  }
  return props;
}

/**
 * Map a Neo4j Node to a domain IGraphNode.
 */
export function mapNodeToGraphNode(node: Node): IGraphNode {
  const props = extractNodeProperties(node);
  const labels = node.labels;

  // Extract known properties, rest goes to properties bag
  const {
    nodeId,
    graphType: _graphTypeProp, // Prefer label-based inference
    nodeType: _nodeTypeProp,
    label,
    description,
    domain,
    userId,
    masteryLevel,
    createdAt,
    updatedAt,
    isDeleted: _isDeleted,
    deletedAt: _deletedAt,
    ...extraProps
  } = props;

  return {
    nodeId: nodeId as string as NodeId,
    graphType: inferGraphType(labels),
    nodeType: inferNodeType(labels),
    label: typeof label === 'string' ? label : '',
    ...(description !== null ? { description: description as string } : {}),
    domain: typeof domain === 'string' ? domain : '',
    ...(userId !== null ? { userId: userId as string } : {}),
    properties: extraProps as Metadata,
    ...(masteryLevel !== null ? { masteryLevel: masteryLevel as number as MasteryLevel } : {}),
    createdAt: toIsoString(createdAt),
    updatedAt: toIsoString(updatedAt),
  };
}

// ============================================================================
// Edge Mapping
// ============================================================================

/**
 * Extract flat properties from a Neo4j relationship, converting Neo4j types.
 */
function extractRelationshipProperties(rel: Relationship): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rel.properties)) {
    props[key] = toDomainValue(value);
  }
  return props;
}

/**
 * Map a Neo4j Relationship to a domain IGraphEdge.
 *
 * Requires the source and target nodeIds to be provided separately,
 * since Neo4j relationships reference internal node IDs — we need
 * the application-level nodeIds from the matched nodes.
 */
export function mapRelationshipToGraphEdge(
  rel: Relationship,
  sourceNodeId: NodeId,
  targetNodeId: NodeId,
  graphType: GraphType
): IGraphEdge {
  const props = extractRelationshipProperties(rel);

  const { edgeId, edgeType: _edgeTypeProp, weight, userId, createdAt, ...extraProps } = props;

  // Edge type: prefer the Neo4j relationship type, fallback to property
  const resolvedEdgeType = relTypeToEdgeType(rel.type);

  return {
    edgeId: edgeId as string as EdgeId,
    graphType,
    edgeType: resolvedEdgeType,
    sourceNodeId,
    targetNodeId,
    ...(userId !== null ? { userId: userId as string } : {}),
    weight: (typeof weight === 'number' ? weight : 1.0) as EdgeWeight,
    properties: extraProps as Metadata,
    createdAt: toIsoString(createdAt),
  };
}

// ============================================================================
// Subgraph Mapping
// ============================================================================

/**
 * Build an ISubgraph from collections of Neo4j nodes and relationships.
 * Deduplicates nodes and edges by their application IDs.
 */
export function buildSubgraph(
  nodes: Node[],
  relationships: {
    rel: Relationship;
    sourceNodeId: NodeId;
    targetNodeId: NodeId;
    graphType: GraphType;
  }[],
  rootNodeId?: NodeId
): ISubgraph {
  // Deduplicate nodes by nodeId
  const nodeMap = new Map<string, IGraphNode>();
  for (const node of nodes) {
    const graphNode = mapNodeToGraphNode(node);
    nodeMap.set(graphNode.nodeId, graphNode);
  }

  // Deduplicate edges by edgeId
  const edgeMap = new Map<string, IGraphEdge>();
  for (const { rel, sourceNodeId, targetNodeId, graphType } of relationships) {
    const graphEdge = mapRelationshipToGraphEdge(rel, sourceNodeId, targetNodeId, graphType);
    edgeMap.set(graphEdge.edgeId, graphEdge);
  }

  return {
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
    ...(rootNodeId !== undefined ? { rootNodeId } : {}),
  };
}

// ============================================================================
// Input Mapping (Domain → Neo4j Properties)
// ============================================================================

/**
 * Build a flat Neo4j properties object from domain ICreateNodeInput.
 * Used in CREATE Cypher statements.
 */
export function buildNodeProperties(
  input: {
    label: string;
    nodeType: string;
    domain: string;
    description?: string;
    properties?: Record<string, unknown>;
    masteryLevel?: MasteryLevel;
  },
  nodeId: NodeId,
  graphType: string,
  userId?: string
): Record<string, unknown> {
  const now = new Date().toISOString();

  return {
    nodeId,
    graphType,
    nodeType: input.nodeType,
    label: input.label,
    ...(input.description !== undefined ? { description: input.description } : {}),
    domain: input.domain,
    ...(userId !== undefined ? { userId } : {}),
    ...(input.masteryLevel !== undefined ? { masteryLevel: input.masteryLevel as number } : {}),
    ...flattenProperties(input.properties),
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  };
}

/**
 * Build a flat Neo4j properties object for a Cypher SET clause from update input.
 * Only includes fields that are actually provided (not undefined).
 */
export function buildNodeUpdateProperties(updates: {
  label?: string;
  description?: string;
  domain?: string;
  properties?: Record<string, unknown>;
  masteryLevel?: MasteryLevel;
}): Record<string, unknown> {
  const props: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (updates.label !== undefined) props['label'] = updates.label;
  if (updates.description !== undefined) props['description'] = updates.description;
  if (updates.domain !== undefined) props['domain'] = updates.domain;
  if (updates.masteryLevel !== undefined) props['masteryLevel'] = updates.masteryLevel as number;
  if (updates.properties !== undefined) {
    Object.assign(props, flattenProperties(updates.properties));
  }

  return props;
}

/**
 * Build Neo4j relationship properties for edge creation.
 */
export function buildEdgeProperties(
  input: {
    edgeType: GraphEdgeType;
    weight?: EdgeWeight;
    properties?: Record<string, unknown>;
  },
  edgeId: EdgeId,
  userId?: string
): Record<string, unknown> {
  return {
    edgeId,
    edgeType: input.edgeType,
    weight: input.weight !== undefined ? (input.weight as number) : 1.0,
    ...(userId !== undefined ? { userId } : {}),
    ...flattenProperties(input.properties),
    createdAt: new Date().toISOString(),
  };
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Flatten a properties object for safe storage in Neo4j.
 * Neo4j cannot store nested objects — only primitives, arrays of primitives,
 * and strings. Complex nested objects are serialized to JSON strings.
 */
function flattenProperties(
  properties: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!properties) return {};
  const flat: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      // Serialize complex objects as JSON strings
      flat[key] = JSON.stringify(value);
    } else {
      flat[key] = value;
    }
  }
  return flat;
}
