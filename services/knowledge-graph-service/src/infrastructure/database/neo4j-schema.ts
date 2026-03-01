/**
 * @noema/knowledge-graph-service — Neo4j Schema Initializer
 *
 * Creates indexes and constraints required by the knowledge graph service.
 * All statements are idempotent (IF NOT EXISTS) so they are safe to run
 * on every service startup — the Neo4j equivalent of Prisma migrations.
 *
 * Schema decisions:
 * - PKG nodes labeled :PkgNode, CKG nodes labeled :CkgNode
 * - PKG uniqueness: composite (userId, nodeId)
 * - CKG uniqueness: global nodeId
 * - Full-text index on label + description for concept search
 * - Performance indexes on type, userId, domain for common query patterns
 */

import type pino from 'pino';
import type { Neo4jClient } from './neo4j-client.js';

// ============================================================================
// Schema Statements
// ============================================================================

/**
 * Uniqueness constraints.
 */
const CONSTRAINTS = [
  // PKG: each nodeId is unique within a user's PKG
  {
    name: 'pkgnode_userid_nodeid_unique',
    statement: `
      CREATE CONSTRAINT pkgnode_userid_nodeid_unique IF NOT EXISTS
      FOR (n:PkgNode)
      REQUIRE (n.userId, n.nodeId) IS UNIQUE
    `,
  },
  // CKG: nodeId is globally unique
  {
    name: 'ckgnode_nodeid_unique',
    statement: `
      CREATE CONSTRAINT ckgnode_nodeid_unique IF NOT EXISTS
      FOR (n:CkgNode)
      REQUIRE n.nodeId IS UNIQUE
    `,
  },
] as const;

/**
 * Performance indexes for node lookups.
 */
const NODE_INDEXES = [
  // PKG node indexes
  {
    name: 'pkgnode_type_idx',
    statement: `
      CREATE INDEX pkgnode_type_idx IF NOT EXISTS
      FOR (n:PkgNode)
      ON (n.type)
    `,
  },
  {
    name: 'pkgnode_userid_idx',
    statement: `
      CREATE INDEX pkgnode_userid_idx IF NOT EXISTS
      FOR (n:PkgNode)
      ON (n.userId)
    `,
  },
  {
    name: 'pkgnode_domain_idx',
    statement: `
      CREATE INDEX pkgnode_domain_idx IF NOT EXISTS
      FOR (n:PkgNode)
      ON (n.domain)
    `,
  },
  // CKG node indexes
  {
    name: 'ckgnode_type_idx',
    statement: `
      CREATE INDEX ckgnode_type_idx IF NOT EXISTS
      FOR (n:CkgNode)
      ON (n.type)
    `,
  },
  {
    name: 'ckgnode_domain_idx',
    statement: `
      CREATE INDEX ckgnode_domain_idx IF NOT EXISTS
      FOR (n:CkgNode)
      ON (n.domain)
    `,
  },
] as const;

/**
 * Performance indexes for relationship (edge) lookups.
 * Neo4j 5 supports relationship property indexes.
 *
 * Design decision D1 (Phase 4): Use type-specific relationship types
 * (PREREQUISITE, PART_OF, etc.) instead of a generic :EDGE with a type
 * property. This enables O(1) type dispatch per hop during variable-length
 * traversals, native multi-type syntax ([:PREREQUISITE|PART_OF]), and
 * precise cycle detection. Each GraphEdgeType maps to an uppercase Neo4j
 * relationship type.
 *
 * Indexes cover edgeId (primary lookup), userId (PKG scoping), and weight
 * (threshold-based queries) per relationship type.
 */
const RELATIONSHIP_TYPES = [
  'PREREQUISITE',
  'PART_OF',
  'IS_A',
  'RELATED_TO',
  'CONTRADICTS',
  'EXEMPLIFIES',
  'CAUSES',
  'DERIVED_FROM',
  'EQUIVALENT_TO',
  'ENTAILS',
  'DISJOINT_WITH',
  'ANALOGOUS_TO',
  'CONTRASTS_WITH',
  'DEPENDS_ON',
  'CONSTITUTED_BY',
  'PRECEDES',
  'HAS_PROPERTY',
] as const;

const RELATIONSHIP_INDEXES = RELATIONSHIP_TYPES.flatMap((relType) => [
  {
    name: `rel_${relType.toLowerCase()}_edgeid_idx`,
    statement: `
      CREATE INDEX rel_${relType.toLowerCase()}_edgeid_idx IF NOT EXISTS
      FOR ()-[r:${relType}]-()
      ON (r.edgeId)
    `,
  },
  {
    name: `rel_${relType.toLowerCase()}_userid_idx`,
    statement: `
      CREATE INDEX rel_${relType.toLowerCase()}_userid_idx IF NOT EXISTS
      FOR ()-[r:${relType}]-()
      ON (r.userId)
    `,
  },
]);

/**
 * Full-text search indexes.
 * Neo4j full-text indexes are created with a different syntax.
 */
const FULLTEXT_INDEXES = [
  {
    name: 'pkgnode_fulltext',
    statement: `
      CREATE FULLTEXT INDEX pkgnode_fulltext IF NOT EXISTS
      FOR (n:PkgNode)
      ON EACH [n.label, n.description]
    `,
  },
  {
    name: 'ckgnode_fulltext',
    statement: `
      CREATE FULLTEXT INDEX ckgnode_fulltext IF NOT EXISTS
      FOR (n:CkgNode)
      ON EACH [n.label, n.description]
    `,
  },
] as const;

// ============================================================================
// Initializer
// ============================================================================

/**
 * Run all schema initialization statements against Neo4j.
 * Safe to call on every startup — all statements use IF NOT EXISTS.
 */
export async function initializeNeo4jSchema(
  neo4jClient: Neo4jClient,
  logger: pino.Logger
): Promise<void> {
  const schemaLogger = logger.child({ component: 'neo4j-schema' });

  const allStatements = [
    ...CONSTRAINTS.map((c) => ({ ...c, kind: 'constraint' as const })),
    ...NODE_INDEXES.map((i) => ({ ...i, kind: 'index' as const })),
    ...RELATIONSHIP_INDEXES.map((i) => ({ ...i, kind: 'relationship-index' as const })),
    ...FULLTEXT_INDEXES.map((i) => ({ ...i, kind: 'fulltext-index' as const })),
  ];

  schemaLogger.info(
    { totalStatements: allStatements.length },
    'Initializing Neo4j schema (constraints + indexes)'
  );

  const session = neo4jClient.getSession();
  try {
    for (const entry of allStatements) {
      try {
        await session.run(entry.statement);
        schemaLogger.debug({ name: entry.name, kind: entry.kind }, 'Schema element ensured');
      } catch (error) {
        schemaLogger.error(
          { name: entry.name, kind: entry.kind, error },
          'Failed to create schema element'
        );
        throw error;
      }
    }

    schemaLogger.info('Neo4j schema initialization complete');
  } finally {
    await session.close();
  }
}
