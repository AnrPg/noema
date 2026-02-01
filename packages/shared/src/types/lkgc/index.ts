// =============================================================================
// LKGC - LOCAL KNOWLEDGE GRAPH CONTROLLER
// =============================================================================
// Core domain model for an offline-first spaced-repetition and metacognitive
// training application.
//
// LKGC is NOT a database. It is a local cognitive substrate that:
// - Ingests learning interactions
// - Maintains a typed property graph of learning objects and relations
// - Materializes mastery and metacognitive state
// - Produces explainable decisions for scheduling, coaching, and gamification
//
// AI models only propose changes; LKGC owns truth and auditability.
// =============================================================================

// Re-export all LKGC types
export * from "./foundation";
export * from "./nodes";
export * from "./edges";
export * from "./mastery";
export * from "./session";
export * from "./events";
export * from "./aggregation";
export * from "./explainability";
export * from "./metrics";
