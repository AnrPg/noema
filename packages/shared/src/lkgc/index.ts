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

// -----------------------------------------------------------------------------
// MASTERY STATE MATERIALIZATION
// -----------------------------------------------------------------------------

// MasteryState store interface and types
export * from "./mastery-state-store";

// Update rules system
export * from "./rule-registry";
export * from "./default-rules";

// Materializer service
export * from "./mastery-materializer";

// In-memory implementation (for testing)
export * from "./impl/in-memory-mastery-store";

// SQLite implementation (schema + stubs)
export * from "./impl/sqlite-mastery-schema";
export * from "./impl/sqlite-mastery-store";

// -----------------------------------------------------------------------------
// DECISION LAYER
// -----------------------------------------------------------------------------

// Decision types and interfaces
// Export specific types to avoid conflicts with types/lkgc/aggregation.ts
export type {
  ActionPlanId,
  QueueItemId,
  InterventionId,
  GameHookId,
  RationaleId,
  DecisionRuleId,
  DecisionConstraints,
  RetrievabilityRange,
  ContentFilters,
  LearningMode,
  DeviceType,
  DecisionTimeOfDay,
  DecisionContext,
  ActionPlan,
  ReviewQueue,
  QueueCounts,
  DifficultyBucket,
  ReviewQueueItem,
  ItemCategory,
  PriorityScoring,
  PriorityScoringWeights,
  InterleavingMetadata,
  CoachingInterventionType,
  InterventionScope,
  CoachingIntervention,
  InterventionTrigger,
  InterventionResponseSchema,
  GameHookType,
  GamificationHook,
  GameHookParameters,
  QuestParameters,
  ChallengeParameters,
  BossParameters,
  StreakRuleParameters,
  BadgeParameters,
  RewardParameters,
  GameReward,
  HookProgress,
  PlanRationale,
  RationaleFactor,
  AppliedRule,
  DecisionCounterfactual,
  ActionPlanDiagnostics,
  DiagnosticWarning,
  CoachingInterventionLog,
  DecisionInterventionMetrics,
} from "./decision-types";

export { DEFAULT_CONSTRAINTS, DEFAULT_CONTEXT } from "./decision-types";

// Decision rule registry and default rules
export * from "./decision-rule-registry";
export * from "./default-decision-rules";

// Component planners
export * from "./review-queue-builder";
export * from "./meta-coach-planner";
export * from "./game-hook-planner";

// Decision engine orchestrator
export * from "./decision-engine";

// -----------------------------------------------------------------------------
// AI INTEGRATION BOUNDARY
// -----------------------------------------------------------------------------
// NOTE: The ai-boundary module is NOT re-exported from here to avoid
// naming conflicts with types in types/lkgc/aggregation.ts (AISnapshot,
// AIProposal, etc.). Import directly from "./ai-boundary" when needed:
//
//   import { SnapshotBuilder, ProposalValidator } from "./lkgc/ai-boundary";
//
// This keeps the ai-boundary as a distinct integration point with its own
// namespace, which aligns with its role as a boundary layer.
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// OBSIDIAN MARKDOWN MIRROR
// -----------------------------------------------------------------------------
// NOTE: The markdown-mirror module is NOT re-exported from here to keep
// a clean separation of concerns. Import directly when needed:
//
//   import { MarkdownSyncEngine, createMarkdownSyncEngine } from "./lkgc/markdown-mirror";
//
// Core principle: LKGC is the source of truth. Markdown is a mirror, not
// the canonical store. All imports from Markdown are treated as content
// operations with provenance.
// -----------------------------------------------------------------------------
