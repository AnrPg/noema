/**
 * @noema/knowledge-graph-service — Database Layer Barrel Export
 */

// Neo4j
export { Neo4jClient } from './neo4j-client.js';
export type { INeo4jConfig } from './neo4j-client.js';
export { Neo4jGraphRepository } from './neo4j-graph.repository.js';
export { initializeNeo4jSchema } from './neo4j-schema.js';
export {
  toNumber,
  toIsoString,
  inferGraphType,
  inferNodeType,
  graphTypeToLabel,
  nodeTypeToLabel,
  edgeTypeToRelType,
  relTypeToEdgeType,
  mapNodeToGraphNode,
  mapRelationshipToGraphEdge,
  buildSubgraph,
  buildNodeProperties,
  buildNodeUpdateProperties,
  buildEdgeProperties,
} from './neo4j-mapper.js';

// Prisma repositories
export {
  PrismaMutationRepository,
  PrismaMetricsRepository,
  PrismaMisconceptionRepository,
  PrismaOperationLogRepository,
  PrismaAggregationEvidenceRepository,
} from './repositories/index.js';
