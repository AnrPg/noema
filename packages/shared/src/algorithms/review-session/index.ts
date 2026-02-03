// =============================================================================
// REVIEW SESSION MODULE
// =============================================================================
// Phase 6D: Review Session Integration (Orchestration)
//
// This module provides the orchestration layer that wires together:
// - Scheduler → ranked candidates (SRS urgency)
// - Mode → filtered/prioritized candidates (learning context)
// - Deck → membership filtering (user's deck selection)
// - Face Resolution → dynamic face selection per card
//
// ## Architecture
//
// The session orchestrator accepts ranked candidates from the scheduler/mode
// layer, applies optional deck filtering, resolves faces dynamically for each
// card, and surfaces context indicators with full explainability.
//
// ## Key Components
//
// - **ReviewSessionOrchestrator**: Main orchestrator that wires all components
// - **DeckFilterAdapter**: Integrates deck query engine for membership filtering
// - **FaceResolutionAdapter**: Integrates face resolution engine with pivoting
// - **ExplainabilityBuilder**: Builds comprehensive explanations
//
// ## Usage Example
//
// ```typescript
// import {
//   createSessionOrchestrator,
//   createDeckFilterAdapter,
//   createFaceResolutionAdapter,
// } from '@manthanein/shared/algorithms/review-session';
//
// // Create providers
// const candidateProvider = ...; // From mode/scheduler integration
// const deckProvider = createDeckFilterAdapter(deckQueryEngine);
// const faceProvider = createFaceResolutionAdapter(faceResolutionEngine);
// const cardProvider = ...; // Card data access
//
// // Create orchestrator
// const orchestrator = createSessionOrchestrator(
//   candidateProvider,
//   deckProvider,
//   faceProvider,
//   cardProvider
// );
//
// // Start a session
// const session = await orchestrator.startSession({
//   userId: 'user_123',
//   modeId: 'system:goal_driven',
//   deckId: 'deck_456',
// });
//
// // Get first item
// const item = session.firstItem;
// console.log(item.resolvedFace.face.name);
// console.log(item.contextIndicators);
//
// // Process review
// const result = await orchestrator.processReview(
//   session.sessionId,
//   item.itemId,
//   { rating: 'good', responseTimeMs: 3000 }
// );
//
// // Pivot face (if enabled)
// if (item.alternativeFaces?.length > 0) {
//   await orchestrator.pivotFace({
//     sessionId: session.sessionId,
//     itemId: item.itemId,
//     targetFaceId: item.alternativeFaces[0].faceId,
//     pivotReason: 'want_different_angle',
//   });
// }
// ```
//
// @see {@link ReviewSessionOrchestrator} for main orchestration
// @see {@link DeckFilterAdapter} for deck integration
// @see {@link FaceResolutionAdapter} for face resolution
// @see {@link ExplainabilityBuilder} for explainability
// =============================================================================

// =============================================================================
// SESSION ORCHESTRATOR
// =============================================================================

export {
  ReviewSessionOrchestrator,
  createSessionOrchestrator,
  buildContextIndicators,
} from "./session-orchestrator";

// =============================================================================
// DECK FILTER ADAPTER
// =============================================================================

export {
  DeckFilterAdapter,
  OptimizedDeckMembershipChecker,
  createDeckFilterAdapter,
  createMembershipChecker,
} from "./deck-filter-adapter";

export type {
  DeckQueryEngineAdapter,
  DeckFilterResult,
  DeckMemberInfo,
} from "./deck-filter-adapter";

// =============================================================================
// FACE RESOLUTION ADAPTER
// =============================================================================

export {
  FaceResolutionAdapter,
  FacePivotAnalyzer,
  createFaceResolutionAdapter,
  createFacePivotAnalyzer,
  DEFAULT_FACE_ADAPTER_CONFIG,
} from "./face-resolution-adapter";

export type {
  FaceAdapterConfig,
  PivotPattern,
  PivotRecommendation,
  PivotHistoryEntry,
} from "./face-resolution-adapter";

// =============================================================================
// EXPLAINABILITY BUILDER
// =============================================================================

export {
  ExplainabilityBuilder,
  createExplainabilityBuilder,
  DEFAULT_EXPLAINABILITY_CONFIG,
} from "./explainability-builder";

export type { ExplainabilityConfig } from "./explainability-builder";

// =============================================================================
// RE-EXPORT TYPES
// =============================================================================

export type {
  // Session types
  ReviewSessionId,
  ReviewItemId,
  OrchestrationTraceId,
  FacePivotId,
  SessionEventId,

  // Request/Response
  ReviewSessionRequest,
  ReviewSessionResponse,
  ReviewSessionState,

  // Review items
  ResolvedReviewItem,
  ReviewItemScheduling,
  ReviewItemDeckContext,
  ResolvedFaceContext,
  AlternativeFace,
  ImprovementPotential,

  // Context indicators
  ContextIndicator,
  ContextIndicatorType,

  // Review processing
  ReviewResult,
  ReviewResultResponse,
  ReviewFeedback,

  // Face pivoting
  FacePivotRequest,
  FacePivotResponse,
  FacePivotReason,
  FacePivotRecord,
  LearningImpactEstimate,

  // Session state
  SessionStatus,
  ReviewSessionStatistics,
  SessionConstraints,
  ActiveDeckContext,
  DeckEvaluationSummary,

  // Completion
  SessionCompletionSummary,
  LearningInsight,
  SessionRecommendation,

  // Explainability
  SessionExplainability,
  ReviewItemExplainability,
  SchedulerStageExplanation,
  ModeStageExplanation,
  DeckStageExplanation,
  FaceStageExplanation,
  SignalContribution,
  ModeInfluenceExplanation,
  SignalAmplificationExplanation,
  PolicyModificationExplanation,
  DeckFilterExplanation,
  QueueCompositionExplanation,

  // Events
  SessionEvent,
  SessionEventCallback,
  SessionEventSubscription,
  SessionStartedEvent,
  ItemPresentedEvent,
  ItemReviewedEvent,
  FacePivotedEvent,
  SessionPausedEvent,
  SessionResumedEvent,
  SessionCompletedEvent,
  SessionErrorEvent,

  // Provider interfaces
  IReviewSessionOrchestrator,
  RankedCandidateProvider,
  RankedCandidateOptions,
  DeckEvaluationProvider,
  DeckMembershipResult,
  FaceResolutionProvider,
  CardDataProviderForSession,
  CardData,
  ParticipationSummary,

  // Configuration
  SessionOrchestratorConfig,

  // Shared types
  CardState,
  UrgencyLevel,
} from "../../types/review-session.types";

export { DEFAULT_SESSION_ORCHESTRATOR_CONFIG } from "../../types/review-session.types";
