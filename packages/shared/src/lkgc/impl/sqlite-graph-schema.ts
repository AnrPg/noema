// =============================================================================
// SQLITE GRAPH SCHEMA - DDL for Graph Store Tables
// =============================================================================
// Schema for persisting nodes, edges, and their revisions in SQLite.
// Designed for:
// - ACID transactions
// - Efficient node/edge lookups
// - Revision history tracking
// - Soft deletion support
// =============================================================================

/**
 * SQLite DDL statements for the graph store
 *
 * Tables:
 * - nodes: Current state of all nodes
 * - edges: Current state of all edges
 * - node_revisions: Historical revisions of nodes
 * - edge_revisions: Historical revisions of edges
 * - mutation_log: Log of all mutations for auditability
 *
 * Design decisions:
 * - Properties stored as JSON blobs for flexibility
 * - Separate revision tables for efficient current-state queries
 * - Indexes optimized for common access patterns
 * - Foreign keys for referential integrity (no dangling edges)
 */
export const GRAPH_STORE_SCHEMA = `
-- =============================================================================
-- NODES TABLE
-- =============================================================================
-- Current state of all nodes in the graph

CREATE TABLE IF NOT EXISTS nodes (
  -- Identity
  id TEXT PRIMARY KEY NOT NULL,               -- NodeId (branded string)
  node_type TEXT NOT NULL,                    -- NodeType discriminator

  -- Core fields
  title TEXT NOT NULL,
  description TEXT,
  source_path TEXT,                           -- Obsidian file path if applicable
  
  -- JSON-serialized fields
  frontmatter TEXT,                           -- JSON: Record<string, unknown>
  aliases TEXT,                               -- JSON: string[]
  tags TEXT,                                  -- JSON: string[]
  metadata TEXT,                              -- JSON: Record<string, unknown>
  
  -- Type-specific properties (JSON blob)
  properties TEXT NOT NULL,                   -- JSON: Node-type-specific fields
  
  -- Provenance
  prov_source TEXT NOT NULL,                  -- "user" | "ai" | "import" | "plugin" | "derived"
  prov_source_id TEXT NOT NULL,               -- userId, pluginId, etc.
  prov_confidence REAL NOT NULL DEFAULT 1.0,  -- [0, 1]
  prov_created_at TEXT NOT NULL,              -- ISO timestamp
  prov_updated_at TEXT NOT NULL,              -- ISO timestamp
  prov_device_id TEXT,
  prov_app_version TEXT NOT NULL,
  prov_schema_version INTEGER NOT NULL,
  
  -- Privacy
  privacy_level TEXT NOT NULL DEFAULT 'private',  -- PrivacyLevel
  privacy_telemetry TEXT NOT NULL,            -- JSON: TelemetryConsent
  
  -- Sync
  sync_rev INTEGER NOT NULL DEFAULT 1,        -- RevisionNumber
  sync_merge_strategy TEXT NOT NULL DEFAULT 'lww',
  sync_last_sync_at TEXT,
  sync_remote_rev INTEGER,
  sync_pending_sync INTEGER NOT NULL DEFAULT 0,  -- boolean
  sync_conflict_state TEXT,                   -- JSON: ConflictState or null
  
  -- Soft deletion
  deleted_at TEXT,                            -- ISO timestamp or null
  archived_at TEXT,                           -- ISO timestamp or null
  
  -- Indexes will be created separately
  CHECK (prov_confidence >= 0 AND prov_confidence <= 1)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(node_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_nodes_deleted ON nodes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_nodes_source_path ON nodes(source_path) WHERE source_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nodes_prov_source ON nodes(prov_source);
CREATE INDEX IF NOT EXISTS idx_nodes_created_at ON nodes(prov_created_at);
CREATE INDEX IF NOT EXISTS idx_nodes_updated_at ON nodes(prov_updated_at);

-- Full-text search on title and description (if needed)
-- CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(id, title, description, content=nodes, content_rowid=rowid);

-- =============================================================================
-- EDGES TABLE
-- =============================================================================
-- Current state of all edges in the graph

CREATE TABLE IF NOT EXISTS edges (
  -- Identity
  id TEXT PRIMARY KEY NOT NULL,               -- EdgeId (branded string)
  edge_type TEXT NOT NULL,                    -- EdgeType discriminator
  
  -- Endpoints (with foreign key constraints)
  source_id TEXT NOT NULL REFERENCES nodes(id),
  target_id TEXT NOT NULL REFERENCES nodes(id),
  
  -- Core fields
  weight REAL NOT NULL DEFAULT 1.0,           -- [0, 1] - strength of relationship
  polarity TEXT NOT NULL DEFAULT 'positive',  -- "positive" | "negative" | "neutral"
  evidence_count INTEGER NOT NULL DEFAULT 0,  -- How many times this edge was reinforced
  last_evidence_at TEXT,                      -- ISO timestamp
  label TEXT,                                 -- Human-readable label
  bidirectional INTEGER NOT NULL DEFAULT 0,   -- boolean
  
  -- JSON-serialized fields
  tags TEXT,                                  -- JSON: string[]
  metadata TEXT,                              -- JSON: Record<string, unknown>
  
  -- Type-specific properties (JSON blob)
  properties TEXT NOT NULL,                   -- JSON: Edge-type-specific fields
  
  -- Provenance
  prov_source TEXT NOT NULL,
  prov_source_id TEXT NOT NULL,
  prov_confidence REAL NOT NULL DEFAULT 1.0,
  prov_created_at TEXT NOT NULL,
  prov_updated_at TEXT NOT NULL,
  prov_device_id TEXT,
  prov_app_version TEXT NOT NULL,
  prov_schema_version INTEGER NOT NULL,
  
  -- Privacy
  privacy_level TEXT NOT NULL DEFAULT 'private',
  privacy_telemetry TEXT NOT NULL,
  
  -- Sync
  sync_rev INTEGER NOT NULL DEFAULT 1,
  sync_merge_strategy TEXT NOT NULL DEFAULT 'lww',
  sync_last_sync_at TEXT,
  sync_remote_rev INTEGER,
  sync_pending_sync INTEGER NOT NULL DEFAULT 0,
  sync_conflict_state TEXT,
  
  -- Soft deletion
  deleted_at TEXT,
  
  -- Constraints
  CHECK (weight >= 0 AND weight <= 1),
  CHECK (prov_confidence >= 0 AND prov_confidence <= 1),
  CHECK (polarity IN ('positive', 'negative', 'neutral'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(edge_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_edges_source_target ON edges(source_id, target_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_edges_deleted ON edges(deleted_at);
CREATE INDEX IF NOT EXISTS idx_edges_evidence ON edges(evidence_count DESC);
CREATE INDEX IF NOT EXISTS idx_edges_weight ON edges(weight DESC) WHERE deleted_at IS NULL;

-- =============================================================================
-- NODE REVISIONS TABLE
-- =============================================================================
-- Historical revisions of nodes (append-only)

CREATE TABLE IF NOT EXISTS node_revisions (
  -- Identity
  node_id TEXT NOT NULL REFERENCES nodes(id),
  rev INTEGER NOT NULL,
  
  -- Snapshot of node state at this revision
  node_snapshot TEXT NOT NULL,                -- JSON: Full LKGCNode
  
  -- Mutation tracking
  mutation_reason TEXT NOT NULL,
  mutation_source TEXT NOT NULL,              -- "user" | "ai" | "plugin" | "system" | "sync"
  mutation_source_id TEXT NOT NULL,
  mutation_event_id TEXT,                     -- EventId if from event log
  mutation_proposal_id TEXT,                  -- ProposalId if from AI
  mutation_requested_at TEXT NOT NULL,        -- ISO timestamp
  
  -- Revision chain
  created_at TEXT NOT NULL,                   -- ISO timestamp
  previous_rev INTEGER,                       -- null for first revision
  
  PRIMARY KEY (node_id, rev)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_node_revisions_node ON node_revisions(node_id);
CREATE INDEX IF NOT EXISTS idx_node_revisions_event ON node_revisions(mutation_event_id) WHERE mutation_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_node_revisions_proposal ON node_revisions(mutation_proposal_id) WHERE mutation_proposal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_node_revisions_created ON node_revisions(created_at);

-- =============================================================================
-- EDGE REVISIONS TABLE
-- =============================================================================
-- Historical revisions of edges (append-only)

CREATE TABLE IF NOT EXISTS edge_revisions (
  -- Identity
  edge_id TEXT NOT NULL REFERENCES edges(id),
  rev INTEGER NOT NULL,
  
  -- Snapshot of edge state at this revision
  edge_snapshot TEXT NOT NULL,                -- JSON: Full LKGCEdge
  
  -- Mutation tracking
  mutation_reason TEXT NOT NULL,
  mutation_source TEXT NOT NULL,
  mutation_source_id TEXT NOT NULL,
  mutation_event_id TEXT,
  mutation_proposal_id TEXT,
  mutation_requested_at TEXT NOT NULL,
  
  -- Revision chain
  created_at TEXT NOT NULL,
  previous_rev INTEGER,
  
  PRIMARY KEY (edge_id, rev)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_edge_revisions_edge ON edge_revisions(edge_id);
CREATE INDEX IF NOT EXISTS idx_edge_revisions_event ON edge_revisions(mutation_event_id) WHERE mutation_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_edge_revisions_proposal ON edge_revisions(mutation_proposal_id) WHERE mutation_proposal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_edge_revisions_created ON edge_revisions(created_at);

-- =============================================================================
-- MUTATION LOG TABLE
-- =============================================================================
-- Audit log of all graph mutations (for debugging and replays)

CREATE TABLE IF NOT EXISTS graph_mutation_log (
  -- Identity
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- What was mutated
  entity_type TEXT NOT NULL,                  -- "node" | "edge"
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,                    -- "create" | "update" | "delete"
  
  -- Mutation details
  mutation_reason TEXT NOT NULL,
  mutation_source TEXT NOT NULL,
  mutation_source_id TEXT NOT NULL,
  mutation_event_id TEXT,
  mutation_proposal_id TEXT,
  
  -- State change
  old_rev INTEGER,                            -- null for creates
  new_rev INTEGER NOT NULL,
  old_state TEXT,                             -- JSON: Previous state (null for creates)
  new_state TEXT NOT NULL,                    -- JSON: New state
  
  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mutation_log_entity ON graph_mutation_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_mutation_log_operation ON graph_mutation_log(operation);
CREATE INDEX IF NOT EXISTS idx_mutation_log_event ON graph_mutation_log(mutation_event_id) WHERE mutation_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mutation_log_created ON graph_mutation_log(created_at);

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Active nodes (not deleted)
CREATE VIEW IF NOT EXISTS active_nodes AS
SELECT * FROM nodes WHERE deleted_at IS NULL;

-- Active edges (not deleted, connecting active nodes)
CREATE VIEW IF NOT EXISTS active_edges AS
SELECT e.* FROM edges e
JOIN nodes ns ON e.source_id = ns.id AND ns.deleted_at IS NULL
JOIN nodes nt ON e.target_id = nt.id AND nt.deleted_at IS NULL
WHERE e.deleted_at IS NULL;

-- Node statistics by type
CREATE VIEW IF NOT EXISTS node_stats AS
SELECT 
  node_type,
  COUNT(*) as total_count,
  SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as active_count,
  SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) as deleted_count
FROM nodes
GROUP BY node_type;

-- Edge statistics by type
CREATE VIEW IF NOT EXISTS edge_stats AS
SELECT 
  edge_type,
  COUNT(*) as total_count,
  SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as active_count,
  SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) as deleted_count,
  AVG(weight) as avg_weight,
  AVG(evidence_count) as avg_evidence
FROM edges
GROUP BY edge_type;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Prevent creating edges with non-existent nodes
-- (Foreign keys handle this, but explicit trigger for better error messages)
CREATE TRIGGER IF NOT EXISTS trg_edges_check_source
BEFORE INSERT ON edges
BEGIN
  SELECT RAISE(ABORT, 'Source node does not exist')
  WHERE NOT EXISTS (SELECT 1 FROM nodes WHERE id = NEW.source_id AND deleted_at IS NULL);
END;

CREATE TRIGGER IF NOT EXISTS trg_edges_check_target
BEFORE INSERT ON edges
BEGIN
  SELECT RAISE(ABORT, 'Target node does not exist')
  WHERE NOT EXISTS (SELECT 1 FROM nodes WHERE id = NEW.target_id AND deleted_at IS NULL);
END;

-- Soft-delete edges when node is deleted
CREATE TRIGGER IF NOT EXISTS trg_cascade_soft_delete_edges
AFTER UPDATE OF deleted_at ON nodes
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
BEGIN
  UPDATE edges 
  SET deleted_at = NEW.deleted_at
  WHERE (source_id = NEW.id OR target_id = NEW.id)
    AND deleted_at IS NULL;
END;
`;

/**
 * Create all graph store tables
 * Should be called when initializing the database
 */
export function getGraphStoreSchema(): string {
  return GRAPH_STORE_SCHEMA;
}

/**
 * Schema version for migrations
 */
export const GRAPH_STORE_SCHEMA_VERSION = 1;

/**
 * Check if graph store tables exist
 */
export const CHECK_GRAPH_STORE_TABLES_SQL = `
SELECT COUNT(*) as count FROM sqlite_master 
WHERE type='table' 
AND name IN ('nodes', 'edges', 'node_revisions', 'edge_revisions', 'graph_mutation_log');
`;

/**
 * Expected table count
 */
export const EXPECTED_GRAPH_STORE_TABLE_COUNT = 5;
