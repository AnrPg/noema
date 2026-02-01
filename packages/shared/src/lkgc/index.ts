// =============================================================================
// LKGC - Local Knowledge Graph Core (Event Ingestion & Aggregation)
// =============================================================================
// NOTE: "LKGC" in this module refers to "Local Knowledge Graph Core",
// NOT "Last Known Good Configuration" which exists elsewhere in the codebase.
// =============================================================================
// This is the ONLY entry point for learning and interaction signals.
// Everything else (features, mastery, decisions, AI snapshots) derives from here.
//
// Design principles:
// - Append-only auditability
// - Explainability-ready
// - Replayability for debugging and ML
// - Future meta-learning support
// - Obsidian compatibility (via content ops)
//
// NO UI. NO AI. NO SCHEDULING. (Those are downstream consumers)
// =============================================================================

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
