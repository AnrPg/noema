// =============================================================================
// ECOSYSTEM BRIDGE - PUBLIC API
// =============================================================================
// Re-exports the public interface of the EcosystemBridge module

export {
  EcosystemBridgeService,
  getEcosystemBridge,
  resetEcosystemBridge,
} from "./bridge-service.js";

export type {
  SyncResult,
  BatchSyncResult,
  CategorySyncInput,
  CategoryRelationSyncInput,
  ParticipationSyncInput,
  ContextReviewInput,
  BridgeStatistics,
  DecisionEngineContextInput,
  DecisionEngineContextOutput,
  MasteryProjectionInput,
  MasteryProjectionOutput,
  EcosystemBridgeHooks,
} from "./types.js";

export {
  generateMappingId,
  generateSyncEventId,
  generateLkgcNodeId,
  generateLkgcEdgeId,
} from "./id-generator.js";

// Integration helpers for use in existing routes
export {
  syncCategoryOnCreate,
  syncCategoryOnUpdate,
  syncCategoryOnDelete,
  syncCategoryRelationOnCreate,
  syncCategoryRelationOnUpdate,
  syncParticipationOnCreate,
  syncParticipationOnUpdate,
  emitContextReviewOnSubmit,
  projectMasteryAfterReview,
  buildActiveLensContext,
} from "./integration.js";
