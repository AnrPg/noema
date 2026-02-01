// =============================================================================
// LKGC - Local Knowledge Graph Core
// =============================================================================
// NOTE: "LKGC" in this module refers to "Local Knowledge Graph Core",
// NOT "Last Known Good Configuration" which exists elsewhere in the codebase.
// =============================================================================
// This module provides:
// 1. Event ingestion and aggregation (append-only, explainability-ready)
// 2. Canonical graph store (typed property graph of learning objects)
//
// Design principles:
// - Append-only auditability
// - Explainability-ready
// - Replayability for debugging and ML
// - Future meta-learning support
// - Obsidian compatibility (via content ops)
// - Strong invariants (no dangling edges, versioned updates)
//
// NO UI. NO AI. NO SCHEDULING. (Those are downstream consumers)
// =============================================================================

// -----------------------------------------------------------------------------
// EVENT INGESTION & AGGREGATION
// -----------------------------------------------------------------------------

// Core abstractions
export * from "./event-log";
export * from "./event-validator";
export * from "./feature-store";
export * from "./audit-trail";

// In-memory implementations (for testing)
export * from "./impl/in-memory-event-log";
export * from "./impl/in-memory-feature-store";

// SQLite stubs (schema + signatures only)
export * from "./impl/sqlite-schema";
export * from "./impl/sqlite-event-log";
export * from "./impl/sqlite-feature-store";

// Pipeline orchestration
export * from "./pipeline";

// Helpers
export * from "./id-generator";
export * from "./event-factory";

// -----------------------------------------------------------------------------
// CANONICAL GRAPH STORE
// -----------------------------------------------------------------------------

// Graph store interface and types
export * from "./graph-store";

// In-memory implementation (for testing)
export * from "./impl/in-memory-graph-store";

// SQLite implementation (schema + stubs)
export * from "./impl/sqlite-graph-schema";
export * from "./impl/sqlite-graph-store";
