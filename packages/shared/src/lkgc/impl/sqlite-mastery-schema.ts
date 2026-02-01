// =============================================================================
// SQLITE MASTERY STATE SCHEMA - DDL for MasteryStateStore
// =============================================================================
// SQLite schema for persisting MasteryState records.
// Includes:
// - mastery_states: Current state for each node+granularity
// - mastery_revisions: Full revision history
// - mastery_watermarks: Processing watermarks
// - Indexes for efficient queries
// =============================================================================

/**
 * Schema version for migrations
 */
export const MASTERY_STORE_SCHEMA_VERSION = 1;

/**
 * Main DDL for the mastery state store
 */
export const MASTERY_STORE_SCHEMA = `
-- =============================================================================
-- MASTERY STATE TABLES
-- =============================================================================

-- Main mastery state table
-- One row per node+granularity combination
CREATE TABLE IF NOT EXISTS mastery_states (
  -- Primary identification
  mastery_state_id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  granularity TEXT NOT NULL CHECK (granularity IN ('card', 'concept', 'skill', 'topic', 'domain')),
  
  -- Current revision
  rev INTEGER NOT NULL DEFAULT 1,
  
  -- Timestamps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  
  -- The full state as JSON
  state_json TEXT NOT NULL,
  
  -- Materialization metadata as JSON
  materialization_json TEXT NOT NULL,
  
  -- Unique constraint: one state per node+granularity
  UNIQUE (node_id, granularity)
);

-- Revision history table
-- Append-only for full audit trail
CREATE TABLE IF NOT EXISTS mastery_revisions (
  -- Primary key
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Reference to mastery state
  node_id TEXT NOT NULL,
  granularity TEXT NOT NULL,
  
  -- Revision number
  rev INTEGER NOT NULL,
  
  -- Timestamp
  created_at INTEGER NOT NULL,
  
  -- Previous revision (null for first)
  previous_rev INTEGER,
  
  -- The state at this revision as JSON
  state_json TEXT NOT NULL,
  
  -- Delta from previous revision as JSON (optional)
  delta_json TEXT,
  
  -- Materialization metadata as JSON
  materialization_json TEXT NOT NULL,
  
  -- Unique: one revision per node+granularity+rev
  UNIQUE (node_id, granularity, rev)
);

-- Processing watermarks table
-- Single row tracking materialization progress
CREATE TABLE IF NOT EXISTS mastery_watermarks (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- Single row
  feature_revision INTEGER NOT NULL,
  graph_revision INTEGER NOT NULL,
  materialized_at INTEGER NOT NULL,
  states_updated INTEGER NOT NULL
);

-- Insert initial watermark if not exists
INSERT OR IGNORE INTO mastery_watermarks (id, feature_revision, graph_revision, materialized_at, states_updated)
VALUES (1, 0, 0, 0, 0);

-- =============================================================================
-- INDEXES FOR EFFICIENT QUERIES
-- =============================================================================

-- Index for querying by node_id
CREATE INDEX IF NOT EXISTS idx_mastery_states_node_id 
ON mastery_states(node_id);

-- Index for querying by granularity
CREATE INDEX IF NOT EXISTS idx_mastery_states_granularity 
ON mastery_states(granularity);

-- Index for querying active (non-deleted) states
CREATE INDEX IF NOT EXISTS idx_mastery_states_active 
ON mastery_states(deleted_at) WHERE deleted_at IS NULL;

-- Index for querying by updated_at (for staleness checks)
CREATE INDEX IF NOT EXISTS idx_mastery_states_updated_at 
ON mastery_states(updated_at);

-- Composite index for node+granularity lookups
CREATE INDEX IF NOT EXISTS idx_mastery_states_node_granularity 
ON mastery_states(node_id, granularity);

-- Index for revision history lookups
CREATE INDEX IF NOT EXISTS idx_mastery_revisions_node_granularity 
ON mastery_revisions(node_id, granularity);

-- Index for revision history by timestamp
CREATE INDEX IF NOT EXISTS idx_mastery_revisions_created_at 
ON mastery_revisions(created_at);

-- =============================================================================
-- VIEWS FOR COMMON QUERIES
-- =============================================================================

-- View: Active mastery states (non-deleted)
CREATE VIEW IF NOT EXISTS active_mastery_states AS
SELECT 
  mastery_state_id,
  node_id,
  granularity,
  rev,
  created_at,
  updated_at,
  state_json,
  materialization_json
FROM mastery_states
WHERE deleted_at IS NULL;

-- View: Mastery statistics by granularity
CREATE VIEW IF NOT EXISTS mastery_stats_by_granularity AS
SELECT 
  granularity,
  COUNT(*) as total_count,
  AVG(json_extract(state_json, '$.memory.retrievability')) as avg_retrievability,
  AVG(json_extract(state_json, '$.memory.stability')) as avg_stability,
  MIN(created_at) as oldest_created,
  MAX(updated_at) as newest_updated
FROM mastery_states
WHERE deleted_at IS NULL
GROUP BY granularity;

-- View: Mastery statistics by learning state
CREATE VIEW IF NOT EXISTS mastery_stats_by_learning_state AS
SELECT 
  json_extract(state_json, '$.memory.learningState') as learning_state,
  COUNT(*) as count
FROM mastery_states
WHERE deleted_at IS NULL
GROUP BY json_extract(state_json, '$.memory.learningState');

-- View: Due items (retrievability below threshold)
-- Note: threshold is set as a parameter when querying
CREATE VIEW IF NOT EXISTS due_mastery_states AS
SELECT 
  mastery_state_id,
  node_id,
  granularity,
  json_extract(state_json, '$.memory.retrievability') as retrievability,
  json_extract(state_json, '$.memory.dueDate') as due_date,
  state_json,
  materialization_json
FROM mastery_states
WHERE deleted_at IS NULL
ORDER BY json_extract(state_json, '$.memory.retrievability') ASC;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Trigger: Auto-update updated_at on state changes
CREATE TRIGGER IF NOT EXISTS trg_mastery_states_updated_at
AFTER UPDATE ON mastery_states
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE mastery_states 
  SET updated_at = strftime('%s', 'now') * 1000 
  WHERE mastery_state_id = NEW.mastery_state_id;
END;

-- Trigger: Auto-insert revision on state update
CREATE TRIGGER IF NOT EXISTS trg_mastery_states_revision
AFTER UPDATE ON mastery_states
FOR EACH ROW
BEGIN
  INSERT INTO mastery_revisions (
    node_id,
    granularity,
    rev,
    created_at,
    previous_rev,
    state_json,
    delta_json,
    materialization_json
  ) VALUES (
    NEW.node_id,
    NEW.granularity,
    NEW.rev,
    NEW.updated_at,
    OLD.rev,
    NEW.state_json,
    NULL, -- Delta computed by application
    NEW.materialization_json
  );
END;

-- Trigger: Auto-insert initial revision on state creation
CREATE TRIGGER IF NOT EXISTS trg_mastery_states_initial_revision
AFTER INSERT ON mastery_states
FOR EACH ROW
BEGIN
  INSERT INTO mastery_revisions (
    node_id,
    granularity,
    rev,
    created_at,
    previous_rev,
    state_json,
    delta_json,
    materialization_json
  ) VALUES (
    NEW.node_id,
    NEW.granularity,
    NEW.rev,
    NEW.created_at,
    NULL,
    NEW.state_json,
    NULL,
    NEW.materialization_json
  );
END;
`;

/**
 * SQL to check if tables exist
 */
export const CHECK_MASTERY_STORE_TABLES_SQL = `
SELECT COUNT(*) as count 
FROM sqlite_master 
WHERE type='table' 
AND name IN ('mastery_states', 'mastery_revisions', 'mastery_watermarks');
`;

/**
 * Expected table count for validation
 */
export const EXPECTED_MASTERY_STORE_TABLE_COUNT = 3;

// =============================================================================
// PREPARED STATEMENT TEMPLATES
// =============================================================================

/**
 * SQL templates for common operations
 * These are templates - actual values are bound as parameters
 */
export const MASTERY_SQL = {
  // ---------------------------------------------------------------------------
  // INSERT / UPDATE
  // ---------------------------------------------------------------------------

  /** Insert a new mastery state */
  INSERT_STATE: `
    INSERT INTO mastery_states (
      mastery_state_id,
      node_id,
      granularity,
      rev,
      created_at,
      updated_at,
      state_json,
      materialization_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,

  /** Update an existing mastery state */
  UPDATE_STATE: `
    UPDATE mastery_states
    SET rev = ?,
        updated_at = ?,
        state_json = ?,
        materialization_json = ?
    WHERE node_id = ? AND granularity = ? AND rev = ?
  `,

  /** Soft delete a mastery state */
  SOFT_DELETE_STATE: `
    UPDATE mastery_states
    SET deleted_at = ?,
        rev = rev + 1,
        updated_at = ?
    WHERE node_id = ? AND granularity = ?
  `,

  // ---------------------------------------------------------------------------
  // SELECT - Single
  // ---------------------------------------------------------------------------

  /** Get a mastery state by node+granularity */
  GET_STATE: `
    SELECT 
      mastery_state_id,
      node_id,
      granularity,
      rev,
      created_at,
      updated_at,
      deleted_at,
      state_json,
      materialization_json
    FROM mastery_states
    WHERE node_id = ? AND granularity = ? AND deleted_at IS NULL
  `,

  /** Get a mastery state including deleted */
  GET_STATE_WITH_DELETED: `
    SELECT 
      mastery_state_id,
      node_id,
      granularity,
      rev,
      created_at,
      updated_at,
      deleted_at,
      state_json,
      materialization_json
    FROM mastery_states
    WHERE node_id = ? AND granularity = ?
  `,

  // ---------------------------------------------------------------------------
  // SELECT - Queries
  // ---------------------------------------------------------------------------

  /** Query mastery states with basic filters */
  QUERY_STATES_BASE: `
    SELECT 
      mastery_state_id,
      node_id,
      granularity,
      rev,
      created_at,
      updated_at,
      deleted_at,
      state_json,
      materialization_json
    FROM mastery_states
    WHERE 1=1
  `,

  /** Get states by granularity */
  GET_BY_GRANULARITY: `
    SELECT 
      mastery_state_id,
      node_id,
      granularity,
      rev,
      created_at,
      updated_at,
      state_json,
      materialization_json
    FROM mastery_states
    WHERE granularity = ? AND deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `,

  /** Get due states (retrievability below threshold) */
  GET_DUE_STATES: `
    SELECT 
      mastery_state_id,
      node_id,
      granularity,
      rev,
      created_at,
      updated_at,
      state_json,
      materialization_json
    FROM mastery_states
    WHERE deleted_at IS NULL
      AND json_extract(state_json, '$.memory.retrievability') <= ?
    ORDER BY json_extract(state_json, '$.memory.retrievability') ASC
    LIMIT ? OFFSET ?
  `,

  /** Get stale states (not updated in N days) */
  GET_STALE_STATES: `
    SELECT 
      mastery_state_id,
      node_id,
      granularity,
      rev,
      created_at,
      updated_at,
      state_json,
      materialization_json
    FROM mastery_states
    WHERE deleted_at IS NULL
      AND updated_at < ?
    ORDER BY updated_at ASC
    LIMIT ? OFFSET ?
  `,

  // ---------------------------------------------------------------------------
  // REVISIONS
  // ---------------------------------------------------------------------------

  /** Get revisions for a node+granularity */
  GET_REVISIONS: `
    SELECT 
      id,
      node_id,
      granularity,
      rev,
      created_at,
      previous_rev,
      state_json,
      delta_json,
      materialization_json
    FROM mastery_revisions
    WHERE node_id = ? AND granularity = ?
    ORDER BY rev DESC
    LIMIT ? OFFSET ?
  `,

  /** Get a specific revision */
  GET_REVISION_AT: `
    SELECT 
      state_json
    FROM mastery_revisions
    WHERE node_id = ? AND granularity = ? AND rev = ?
  `,

  // ---------------------------------------------------------------------------
  // WATERMARKS
  // ---------------------------------------------------------------------------

  /** Get current watermark */
  GET_WATERMARK: `
    SELECT 
      feature_revision,
      graph_revision,
      materialized_at,
      states_updated
    FROM mastery_watermarks
    WHERE id = 1
  `,

  /** Update watermark */
  UPDATE_WATERMARK: `
    UPDATE mastery_watermarks
    SET feature_revision = ?,
        graph_revision = ?,
        materialized_at = ?,
        states_updated = ?
    WHERE id = 1
  `,

  // ---------------------------------------------------------------------------
  // STATISTICS
  // ---------------------------------------------------------------------------

  /** Get statistics */
  GET_STATISTICS: `
    SELECT 
      COUNT(*) as total_states,
      AVG(json_extract(state_json, '$.memory.retrievability')) as avg_retrievability,
      AVG(json_extract(state_json, '$.memory.stability')) as avg_stability,
      MIN(created_at) as oldest_state,
      MAX(updated_at) as newest_state
    FROM mastery_states
    WHERE deleted_at IS NULL
  `,

  /** Get counts by granularity */
  GET_COUNTS_BY_GRANULARITY: `
    SELECT 
      granularity,
      COUNT(*) as count
    FROM mastery_states
    WHERE deleted_at IS NULL
    GROUP BY granularity
  `,

  /** Get counts by learning state */
  GET_COUNTS_BY_LEARNING_STATE: `
    SELECT 
      json_extract(state_json, '$.memory.learningState') as learning_state,
      COUNT(*) as count
    FROM mastery_states
    WHERE deleted_at IS NULL
    GROUP BY json_extract(state_json, '$.memory.learningState')
  `,

  /** Get total revisions count */
  GET_TOTAL_REVISIONS: `
    SELECT COUNT(*) as count FROM mastery_revisions
  `,

  // ---------------------------------------------------------------------------
  // BULK OPERATIONS
  // ---------------------------------------------------------------------------

  /** Clear all data (for testing) */
  CLEAR_ALL: `
    DELETE FROM mastery_states;
    DELETE FROM mastery_revisions;
    UPDATE mastery_watermarks SET feature_revision = 0, graph_revision = 0, materialized_at = 0, states_updated = 0 WHERE id = 1;
  `,

  /** Export all states */
  EXPORT_ALL: `
    SELECT 
      mastery_state_id,
      node_id,
      granularity,
      rev,
      created_at,
      updated_at,
      deleted_at,
      state_json,
      materialization_json
    FROM mastery_states
  `,
} as const;
