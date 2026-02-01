// =============================================================================
// SQLITE SCHEMA - Database Schema for LKGC Storage
// =============================================================================
// Schema definitions for SQLite-backed event log and feature store.
// This file contains ONLY schema definitions and SQL statements.
// The actual implementation will be in separate files.
// =============================================================================

// =============================================================================
// EVENT LOG SCHEMA
// =============================================================================

/**
 * SQL to create the events table
 * Events are immutable - the only update allowed is to processing status
 */
export const CREATE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS lkgc_events (
  -- Primary key
  event_id TEXT PRIMARY KEY NOT NULL,
  
  -- Sequence number (monotonic, for ordering)
  sequence_number INTEGER NOT NULL UNIQUE,
  
  -- Event data (JSON blob)
  event_data TEXT NOT NULL,
  
  -- Event category (for indexing)
  event_category TEXT NOT NULL,
  
  -- Event type (for indexing)
  event_type TEXT NOT NULL,
  
  -- Event timestamp (from the event itself)
  event_timestamp INTEGER NOT NULL,
  
  -- Session ID (nullable, for indexing)
  session_id TEXT,
  
  -- Node ID (extracted from event, for indexing)
  node_id TEXT,
  
  -- When this record was received
  received_at INTEGER NOT NULL,
  
  -- Processing status
  processing_status TEXT NOT NULL DEFAULT 'pending',
  
  -- When processing completed
  processed_at INTEGER,
  
  -- Error message if processing failed
  processing_error TEXT,
  
  -- Hash of event data (for integrity verification)
  event_hash TEXT NOT NULL,
  
  -- Schema version
  schema_version INTEGER NOT NULL DEFAULT 1
);
`;

/**
 * SQL to create indexes on the events table
 */
export const CREATE_EVENTS_INDEXES = `
-- Index for sequence-based queries (replay, sync)
CREATE INDEX IF NOT EXISTS idx_events_sequence ON lkgc_events(sequence_number);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON lkgc_events(event_timestamp);

-- Index for category-based queries
CREATE INDEX IF NOT EXISTS idx_events_category ON lkgc_events(event_category);

-- Index for type-based queries
CREATE INDEX IF NOT EXISTS idx_events_type ON lkgc_events(event_type);

-- Index for session-based queries
CREATE INDEX IF NOT EXISTS idx_events_session ON lkgc_events(session_id) WHERE session_id IS NOT NULL;

-- Index for node-based queries
CREATE INDEX IF NOT EXISTS idx_events_node ON lkgc_events(node_id) WHERE node_id IS NOT NULL;

-- Index for status-based queries
CREATE INDEX IF NOT EXISTS idx_events_status ON lkgc_events(processing_status);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_events_category_timestamp ON lkgc_events(event_category, event_timestamp);
`;

// =============================================================================
// FEATURE STORE SCHEMA
// =============================================================================

/**
 * SQL to create the features table
 */
export const CREATE_FEATURES_TABLE = `
CREATE TABLE IF NOT EXISTS lkgc_features (
  -- Primary key
  feature_id TEXT PRIMARY KEY NOT NULL,
  
  -- Granularity level (attempt, session, day, week, month)
  granularity TEXT NOT NULL,
  
  -- Period start timestamp
  period_start INTEGER NOT NULL,
  
  -- Period end timestamp
  period_end INTEGER NOT NULL,
  
  -- Feature data (JSON blob)
  feature_data TEXT NOT NULL,
  
  -- When this feature was computed
  computed_at INTEGER NOT NULL,
  
  -- Computation version (for cache invalidation)
  computation_version INTEGER NOT NULL,
  
  -- Source event IDs (JSON array)
  source_event_ids TEXT NOT NULL,
  
  -- Computation metadata (JSON blob)
  computation_metadata TEXT NOT NULL,
  
  -- Window label (human-readable)
  window_label TEXT NOT NULL,
  
  -- Session ID (for session-level features, nullable)
  session_id TEXT,
  
  -- Node ID (for attempt-level features, nullable)
  node_id TEXT,
  
  -- Date string (for daily features, nullable)
  date_key TEXT,
  
  -- Week key (for weekly features, nullable)
  week_key TEXT,
  
  -- Whether this feature has been invalidated
  invalidated INTEGER NOT NULL DEFAULT 0,
  
  -- When invalidated (if applicable)
  invalidated_at INTEGER
);
`;

/**
 * SQL to create indexes on the features table
 */
export const CREATE_FEATURES_INDEXES = `
-- Index for granularity-based queries
CREATE INDEX IF NOT EXISTS idx_features_granularity ON lkgc_features(granularity);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_features_period ON lkgc_features(period_start, period_end);

-- Index for session-based queries
CREATE INDEX IF NOT EXISTS idx_features_session ON lkgc_features(session_id) WHERE session_id IS NOT NULL;

-- Index for node-based queries
CREATE INDEX IF NOT EXISTS idx_features_node ON lkgc_features(node_id) WHERE node_id IS NOT NULL;

-- Index for daily features
CREATE INDEX IF NOT EXISTS idx_features_date ON lkgc_features(date_key) WHERE date_key IS NOT NULL;

-- Index for weekly features
CREATE INDEX IF NOT EXISTS idx_features_week ON lkgc_features(week_key) WHERE week_key IS NOT NULL;

-- Index for finding non-invalidated features
CREATE INDEX IF NOT EXISTS idx_features_valid ON lkgc_features(invalidated) WHERE invalidated = 0;

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_features_granularity_period ON lkgc_features(granularity, period_start);
`;

// =============================================================================
// EVENT-FEATURE MAPPING TABLE
// =============================================================================

/**
 * SQL to create the event-to-feature mapping table
 * This enables tracing features back to their source events
 */
export const CREATE_EVENT_FEATURE_MAPPING_TABLE = `
CREATE TABLE IF NOT EXISTS lkgc_event_feature_mapping (
  -- Event ID (foreign key)
  event_id TEXT NOT NULL,
  
  -- Feature ID (foreign key)
  feature_id TEXT NOT NULL,
  
  -- Primary key is the combination
  PRIMARY KEY (event_id, feature_id)
);
`;

/**
 * SQL to create indexes on the mapping table
 */
export const CREATE_EVENT_FEATURE_MAPPING_INDEXES = `
-- Index for looking up features by event
CREATE INDEX IF NOT EXISTS idx_efm_event ON lkgc_event_feature_mapping(event_id);

-- Index for looking up events by feature
CREATE INDEX IF NOT EXISTS idx_efm_feature ON lkgc_event_feature_mapping(feature_id);
`;

// =============================================================================
// AUDIT TRAIL SCHEMA
// =============================================================================

/**
 * SQL to create the audit trail table
 */
export const CREATE_AUDIT_TABLE = `
CREATE TABLE IF NOT EXISTS lkgc_audit (
  -- Primary key
  audit_id TEXT PRIMARY KEY NOT NULL,
  
  -- Operation type
  operation_type TEXT NOT NULL,
  
  -- Timestamp
  timestamp INTEGER NOT NULL,
  
  -- Initiator type
  initiator_type TEXT NOT NULL,
  
  -- Initiator ID
  initiator_id TEXT NOT NULL,
  
  -- Operation duration (ms)
  duration INTEGER NOT NULL,
  
  -- Whether operation succeeded
  success INTEGER NOT NULL,
  
  -- Error message (if failed)
  error_message TEXT,
  
  -- Additional data (JSON blob, operation-specific)
  additional_data TEXT NOT NULL
);
`;

/**
 * SQL to create indexes on the audit table
 */
export const CREATE_AUDIT_INDEXES = `
-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON lkgc_audit(timestamp);

-- Index for operation type queries
CREATE INDEX IF NOT EXISTS idx_audit_operation ON lkgc_audit(operation_type);

-- Index for success/failure queries
CREATE INDEX IF NOT EXISTS idx_audit_success ON lkgc_audit(success);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_op_time ON lkgc_audit(operation_type, timestamp);
`;

// =============================================================================
// DERIVATION CHAIN SCHEMA
// =============================================================================

/**
 * SQL to create the derivation links table
 */
export const CREATE_DERIVATION_LINKS_TABLE = `
CREATE TABLE IF NOT EXISTS lkgc_derivation_links (
  -- Source entity ID
  from_id TEXT NOT NULL,
  
  -- Source entity type
  from_type TEXT NOT NULL,
  
  -- Target entity ID
  to_id TEXT NOT NULL,
  
  -- Target entity type
  to_type TEXT NOT NULL,
  
  -- When this link was created
  created_at INTEGER NOT NULL,
  
  -- Transformation that created this link
  transformation TEXT NOT NULL,
  
  -- Primary key
  PRIMARY KEY (from_id, to_id)
);
`;

/**
 * SQL to create indexes on the derivation links table
 */
export const CREATE_DERIVATION_LINKS_INDEXES = `
-- Index for forward traversal (from -> to)
CREATE INDEX IF NOT EXISTS idx_derivation_from ON lkgc_derivation_links(from_id);

-- Index for reverse traversal (to -> from)
CREATE INDEX IF NOT EXISTS idx_derivation_to ON lkgc_derivation_links(to_id);
`;

// =============================================================================
// SEQUENCE TABLE (for generating monotonic sequence numbers)
// =============================================================================

/**
 * SQL to create the sequence table
 */
export const CREATE_SEQUENCE_TABLE = `
CREATE TABLE IF NOT EXISTS lkgc_sequences (
  sequence_name TEXT PRIMARY KEY NOT NULL,
  current_value INTEGER NOT NULL DEFAULT 0
);

-- Initialize the event sequence
INSERT OR IGNORE INTO lkgc_sequences (sequence_name, current_value) VALUES ('events', 0);
`;

// =============================================================================
// ALL SCHEMA STATEMENTS
// =============================================================================

/**
 * All SQL statements to initialize the database
 */
export const INITIALIZE_DATABASE_STATEMENTS = [
  CREATE_EVENTS_TABLE,
  CREATE_EVENTS_INDEXES,
  CREATE_FEATURES_TABLE,
  CREATE_FEATURES_INDEXES,
  CREATE_EVENT_FEATURE_MAPPING_TABLE,
  CREATE_EVENT_FEATURE_MAPPING_INDEXES,
  CREATE_AUDIT_TABLE,
  CREATE_AUDIT_INDEXES,
  CREATE_DERIVATION_LINKS_TABLE,
  CREATE_DERIVATION_LINKS_INDEXES,
  CREATE_SEQUENCE_TABLE,
];

/**
 * Initialize the database with all tables and indexes
 * @param db SQLite database connection (implementation-specific)
 */
export function getInitializationSQL(): string {
  return INITIALIZE_DATABASE_STATEMENTS.join("\n\n");
}

// =============================================================================
// MIGRATION SUPPORT
// =============================================================================

/**
 * Schema version for migrations
 */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * SQL to check schema version
 */
export const CHECK_SCHEMA_VERSION = `
SELECT MAX(schema_version) as version FROM lkgc_events LIMIT 1;
`;

/**
 * Migration SQL statements (keyed by target version)
 */
export const MIGRATIONS: Record<number, string[]> = {
  // Version 1 is the initial schema (no migration needed)
  // Future migrations would be added here:
  // 2: ['ALTER TABLE lkgc_events ADD COLUMN new_field TEXT;'],
};
