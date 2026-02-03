// =============================================================================
// REVIEW SESSION ORCHESTRATOR
// =============================================================================
// Phase 6D: Review Session Integration (Orchestration)
//
// The orchestrator wires together:
// - Scheduler/Mode → ranked candidates
// - Deck → membership filtering
// - Face Resolution → dynamic face selection
//
// This is PURE ORCHESTRATION. No algorithms are implemented here.
// =============================================================================

import type {
  ReviewSessionRequest,
  ReviewSessionResponse,
  ReviewSessionState,
  ResolvedReviewItem,
  ReviewResult,
  ReviewResultResponse,
  SessionCompletionSummary,
  FacePivotRequest,
  FacePivotResponse,
  AlternativeFace,
  ReviewItemExplainability,
  SessionExplainability,
  SessionEvent,
  SessionEventCallback,
  SessionEventSubscription,
  IReviewSessionOrchestrator,
  SessionOrchestratorConfig,
  RankedCandidateProvider,
  DeckEvaluationProvider,
  FaceResolutionProvider,
  CardDataProviderForSession,
  ReviewSessionId,
  ReviewItemId,
  OrchestrationTraceId,
  SessionEventId,
  FacePivotId,
  SessionStatus,
  SessionConstraints,
  ActiveDeckContext,
  ContextIndicator,
  ContextIndicatorType,
  ReviewItemScheduling,
  ResolvedFaceContext,
  ReviewItemDeckContext,
  ReviewSessionStatistics,
  FacePivotRecord,
  CardState,
  UrgencyLevel,
} from "../../types/review-session.types";

import { DEFAULT_SESSION_ORCHESTRATOR_CONFIG } from "../../types/review-session.types";

import type {
  ReviewCandidate,
  ModeRuntimeState,
  LearningModeId,
} from "../../types/learning-mode.types";

import type { DeckCardResult } from "../../types/dynamic-deck.types";

import type {
  FaceResolutionInput,
  FaceResolutionOutput,
  CategoryLensContext,
  ParticipationContext,
  ModeContext,
  ResolutionRequestId,
} from "../../types/face-resolution.types";

import type { UserId } from "../../types/user.types";
import type {
  CanonicalCardId,
  CardFace,
  CardFaceId,
} from "../../types/canonical-card.types";
import type {
  CategoryId,
  ParticipationId,
  SemanticRole,
} from "../../types/ecosystem.types";
import type { ExtendedSemanticRole } from "../../types/multi-belonging.types";
import type {
  Timestamp,
  Duration,
  NormalizedValue,
  Confidence,
} from "../../types/lkgc/foundation";

// =============================================================================
// INTERNAL TYPES
// =============================================================================

/** Internal session data */
interface InternalSessionData {
  sessionId: ReviewSessionId;
  userId: UserId;
  status: SessionStatus;
  createdAt: Timestamp;
  startedAt?: Timestamp;
  lastActivityAt: Timestamp;
  completedAt?: Timestamp;

  // Configuration
  constraints: SessionConstraints;
  modeState: ModeRuntimeState;
  activeDeck?: ActiveDeckContext;

  // Queue
  queue: InternalQueueItem[];
  currentIndex: number;
  resolvedItems: Map<ReviewItemId, ResolvedReviewItem>;

  // Statistics
  statistics: MutableSessionStatistics;

  // Face pivots
  facePivots: FacePivotRecord[];

  // Subscriptions
  eventSubscriptions: Set<SessionEventCallback>;
}

/** Mutable session statistics */
interface MutableSessionStatistics {
  totalTimeMs: number;
  ratingDistribution: {
    again: number;
    hard: number;
    good: number;
    easy: number;
  };
  cardsByState: {
    new: number;
    learning: number;
    review: number;
    relearning: number;
  };
  responseTimes: number[];
}

/** Internal queue item */
interface InternalQueueItem {
  itemId: ReviewItemId;
  candidate: ReviewCandidate;
  deckResult?: DeckCardResult;
  resolved: boolean;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/** Generate unique session ID */
function generateSessionId(): ReviewSessionId {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}` as ReviewSessionId;
}

/** Generate unique item ID */
function generateItemId(): ReviewItemId {
  return `item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` as ReviewItemId;
}

/** Generate unique trace ID */
function generateTraceId(): OrchestrationTraceId {
  return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` as OrchestrationTraceId;
}

/** Generate unique event ID */
function generateEventId(): SessionEventId {
  return `event_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` as SessionEventId;
}

/** Generate unique pivot ID */
function generatePivotId(): FacePivotId {
  return `pivot_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` as FacePivotId;
}

/** Generate resolution request ID */
function generateResolutionRequestId(): ResolutionRequestId {
  return `res_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` as ResolutionRequestId;
}

/** Get current timestamp */
function now(): Timestamp {
  return Date.now() as Timestamp;
}

/** Calculate urgency level from priority score */
function calculateUrgencyLevel(
  priorityScore: number,
  state: CardState,
  daysOverdue: number,
): UrgencyLevel {
  if (state === "new") return "low";
  if (daysOverdue > 7) return "critical";
  if (daysOverdue > 3) return "high";
  if (priorityScore >= 0.8) return "high";
  if (priorityScore >= 0.5) return "medium";
  if (priorityScore >= 0.2) return "low";
  return "deferred";
}

/** Build context indicators for a review item */
export function buildContextIndicators(
  candidate: ReviewCandidate,
  scheduling: ReviewItemScheduling,
  deckContext?: ReviewItemDeckContext,
  modeState?: ModeRuntimeState,
): ContextIndicator[] {
  const indicators: ContextIndicator[] = [];

  // Urgency indicator
  if (scheduling.urgency === "critical" || scheduling.urgency === "high") {
    indicators.push({
      type: "urgency",
      icon: scheduling.urgency === "critical" ? "🔴" : "🟠",
      label: scheduling.urgency === "critical" ? "Critical" : "High Priority",
      description: `This card is ${scheduling.daysOverdue > 0 ? `${scheduling.daysOverdue} days overdue` : "due soon"}`,
      importance: "primary",
      colorHint: scheduling.urgency === "critical" ? "#dc2626" : "#f97316",
    });
  }

  // New card indicator
  if (scheduling.isNew) {
    indicators.push({
      type: "new",
      icon: "✨",
      label: "New Card",
      description: "This is a new card you haven't learned yet",
      importance: "primary",
      colorHint: "#22c55e",
    });
  }

  // Overdue indicator
  if (scheduling.daysOverdue > 0 && !scheduling.isNew) {
    indicators.push({
      type: "overdue",
      icon: "⏰",
      label: `${scheduling.daysOverdue}d Overdue`,
      description: `This card was due ${scheduling.daysOverdue} days ago`,
      importance: "secondary",
      colorHint: "#ef4444",
    });
  }

  // Mode indicator
  if (modeState && candidate.scoring.modeModifier > 0.5) {
    indicators.push({
      type: "mode",
      icon: modeState.activeModeDefinition.icon,
      label: modeState.activeModeDefinition.name,
      description: `Prioritized by ${modeState.activeModeDefinition.name} mode`,
      importance: "secondary",
    });
  }

  // Deck indicator
  if (deckContext) {
    indicators.push({
      type: "deck",
      icon: "📚",
      label: "In Deck",
      description: `Part of your selected deck (position ${deckContext.positionInDeck})`,
      importance: "tertiary",
    });
  }

  // Mastery indicator based on retrievability
  if (scheduling.retrievability < 0.5) {
    indicators.push({
      type: "mastery",
      icon: "📉",
      label: "Low Retention",
      description: `Memory strength is at ${Math.round(scheduling.retrievability * 100)}%`,
      importance: "secondary",
      colorHint: "#f59e0b",
    });
  }

  // Relearning indicator
  if (scheduling.state === "relearning") {
    indicators.push({
      type: "lapse",
      icon: "🔄",
      label: "Relearning",
      description: "You're relearning this card after a lapse",
      importance: "secondary",
      colorHint: "#8b5cf6",
    });
  }

  return indicators;
}

// =============================================================================
// REVIEW SESSION ORCHESTRATOR
// =============================================================================

/**
 * Review Session Orchestrator
 *
 * Wires together scheduler, mode, deck, and face resolution
 * without modifying any core algorithms.
 */
export class ReviewSessionOrchestrator implements IReviewSessionOrchestrator {
  private readonly config: SessionOrchestratorConfig;
  private readonly candidateProvider: RankedCandidateProvider;
  private readonly deckProvider: DeckEvaluationProvider;
  private readonly faceProvider: FaceResolutionProvider;
  private readonly cardProvider: CardDataProviderForSession;

  // Active sessions
  private readonly sessions: Map<ReviewSessionId, InternalSessionData> =
    new Map();

  constructor(
    candidateProvider: RankedCandidateProvider,
    deckProvider: DeckEvaluationProvider,
    faceProvider: FaceResolutionProvider,
    cardProvider: CardDataProviderForSession,
    config: Partial<SessionOrchestratorConfig> = {},
  ) {
    this.candidateProvider = candidateProvider;
    this.deckProvider = deckProvider;
    this.faceProvider = faceProvider;
    this.cardProvider = cardProvider;
    this.config = { ...DEFAULT_SESSION_ORCHESTRATOR_CONFIG, ...config };
  }

  // ===========================================================================
  // SESSION LIFECYCLE
  // ===========================================================================

  /**
   * Start a new review session
   */
  async startSession(
    request: ReviewSessionRequest,
  ): Promise<ReviewSessionResponse> {
    const sessionId = generateSessionId();
    const timestamp = now();

    // 1. Determine mode
    const modeId = request.modeId ?? ("system:goal_driven" as LearningModeId);

    // 2. Get ranked candidates from scheduler/mode
    const rankedCandidates = await this.candidateProvider.getRankedCandidates(
      request.userId,
      modeId,
      {
        categoryId: request.categoryId,
        maxCandidates: request.maxCards ?? this.config.defaultMaxCards,
        timeBudget: request.timeBudget ?? this.config.defaultTimeBudget,
        parameterOverrides: request.modeParameterOverrides,
      },
    );

    // 3. Filter by deck if specified
    let filteredCandidates = rankedCandidates.reviewCandidates;
    let activeDeck: ActiveDeckContext | undefined;
    let deckResults: Map<CanonicalCardId, DeckCardResult> | undefined;

    if (request.deckId) {
      const cardIds = filteredCandidates.map(
        (c) => c.cardId as unknown as CanonicalCardId,
      );
      const deckMembership = await this.deckProvider.evaluateDeckMembership(
        request.deckId,
        cardIds,
        request.userId,
      );

      deckResults = new Map(deckMembership.members);

      // Filter to only deck members
      filteredCandidates = filteredCandidates.filter((c) =>
        deckMembership.members.has(c.cardId as unknown as CanonicalCardId),
      );

      // Build active deck context
      const deckEvaluation = await this.deckProvider.evaluateDeck(
        request.deckId,
        request.userId,
      );

      activeDeck = {
        deckId: request.deckId,
        name: "Dynamic Deck", // Deck name resolved separately if needed
        totalCards: deckEvaluation.totalCount,
        dueCards: filteredCandidates.length,
        evaluationSummary: {
          complexity: deckEvaluation.metadata?.complexityScore ?? 0,
          predicatesEvaluated:
            deckEvaluation.metadata?.predicatesEvaluated ?? 0,
          evaluationTimeMs: deckEvaluation.metadata?.evaluationDurationMs ?? 0,
          cacheHit: deckEvaluation.metadata?.fromCache ?? false,
        },
      };
    }

    // 4. Apply specific card filter if provided
    if (request.specificCardIds && request.specificCardIds.length > 0) {
      const specificSet = new Set(request.specificCardIds as readonly string[]);
      filteredCandidates = filteredCandidates.filter((c) =>
        specificSet.has(c.cardId as string),
      );
    }

    // 5. Apply max cards limit
    const maxCards = request.maxCards ?? this.config.defaultMaxCards;
    filteredCandidates = filteredCandidates.slice(0, maxCards);

    // 6. Build session constraints
    const constraints: SessionConstraints = {
      maxCards,
      timeBudget: request.timeBudget ?? this.config.defaultTimeBudget,
      includeNewCards: request.includeNewCards ?? true,
      maxNewCards: request.maxNewCards ?? Math.ceil(maxCards * 0.2),
      faceResolutionEnabled:
        request.enableFaceResolution ?? this.config.defaultEnableFaceResolution,
      facePivotingEnabled:
        request.enableFacePivoting ?? this.config.defaultEnableFacePivoting,
      prefetchCount: request.prefetchCount ?? this.config.defaultPrefetchCount,
    };

    // 7. Build queue
    const queue: InternalQueueItem[] = filteredCandidates.map((candidate) => ({
      itemId: generateItemId(),
      candidate,
      deckResult: deckResults?.get(
        candidate.cardId as unknown as CanonicalCardId,
      ),
      resolved: false,
    }));

    // 8. Count cards by state
    const cardsByState = { new: 0, learning: 0, review: 0, relearning: 0 };
    for (const item of queue) {
      const state = this.extractCardState(item.candidate);
      cardsByState[state]++;
    }

    // 9. Create session data
    const sessionData: InternalSessionData = {
      sessionId,
      userId: request.userId,
      status: "active",
      createdAt: timestamp,
      startedAt: timestamp,
      lastActivityAt: timestamp,
      constraints,
      modeState: rankedCandidates as unknown as ModeRuntimeState, // Simplified - in real impl, fetch full mode state
      activeDeck,
      queue,
      currentIndex: 0,
      resolvedItems: new Map(),
      statistics: {
        totalTimeMs: 0,
        ratingDistribution: { again: 0, hard: 0, good: 0, easy: 0 },
        cardsByState,
        responseTimes: [],
      },
      facePivots: [],
      eventSubscriptions: new Set(),
    };

    this.sessions.set(sessionId, sessionData);

    // 10. Resolve first item
    let firstItem: ResolvedReviewItem | null = null;
    if (queue.length > 0) {
      firstItem = await this.resolveQueueItem(sessionData, queue[0]);
      sessionData.resolvedItems.set(queue[0].itemId, firstItem);
      queue[0].resolved = true;
    }

    // 11. Pre-resolve next items (prefetch)
    this.prefetchItems(sessionData).catch(console.error);

    // 12. Emit session started event
    this.emitEvent(sessionData, {
      type: "session_started",
      eventId: generateEventId(),
      sessionId,
      timestamp,
      payload: {
        modeId,
        totalCards: queue.length,
        constraints,
      },
    });

    // 13. Build response
    return {
      sessionId,
      userId: request.userId,
      createdAt: timestamp,
      modeState: sessionData.modeState,
      activeDeck,
      constraints,
      totalCards: queue.length,
      dueCards: queue.filter((q) => !this.isNewCard(q.candidate)).length,
      newCards: cardsByState.new,
      estimatedDuration: this.estimateSessionDuration(queue.length) as Duration,
      firstItem,
      sessionExplainability: request.includeExplainability
        ? this.buildSessionExplainability(sessionData)
        : undefined,
      orchestrationTraceId: generateTraceId(),
    };
  }

  /**
   * Get the next item in the session
   */
  async getNextItem(
    sessionId: ReviewSessionId,
  ): Promise<ResolvedReviewItem | null> {
    const session = this.getSession(sessionId);

    if (session.currentIndex >= session.queue.length) {
      return null;
    }

    const queueItem = session.queue[session.currentIndex];

    // Return cached if already resolved
    if (queueItem.resolved) {
      const resolved = session.resolvedItems.get(queueItem.itemId);
      if (resolved) {
        this.emitItemPresentedEvent(session, resolved);
        return resolved;
      }
    }

    // Resolve the item
    const resolved = await this.resolveQueueItem(session, queueItem);
    session.resolvedItems.set(queueItem.itemId, resolved);
    queueItem.resolved = true;

    this.emitItemPresentedEvent(session, resolved);

    // Trigger prefetch
    this.prefetchItems(session).catch(console.error);

    return resolved;
  }

  /**
   * Process a review result
   */
  async processReview(
    sessionId: ReviewSessionId,
    itemId: ReviewItemId,
    result: ReviewResult,
  ): Promise<ReviewResultResponse> {
    const session = this.getSession(sessionId);
    const resolved = session.resolvedItems.get(itemId);

    if (!resolved) {
      throw new Error(`Item ${itemId} not found in session ${sessionId}`);
    }

    // Update statistics
    session.statistics.ratingDistribution[result.rating]++;
    session.statistics.responseTimes.push(result.responseTimeMs);
    session.lastActivityAt = now();

    // Emit review event
    this.emitEvent(session, {
      type: "item_reviewed",
      eventId: generateEventId(),
      sessionId,
      timestamp: now(),
      payload: {
        itemId,
        cardId: resolved.canonicalCardId,
        rating: result.rating,
        responseTimeMs: result.responseTimeMs,
        faceId: resolved.resolvedFace.faceId,
      },
    });

    // Move to next item
    session.currentIndex++;

    // Get next item
    const nextItem =
      session.currentIndex < session.queue.length
        ? await this.getNextItem(sessionId)
        : null;

    // Calculate progress
    const reviewed = session.currentIndex;
    const remaining = session.queue.length - reviewed;
    const percentComplete = (reviewed /
      session.queue.length) as NormalizedValue;

    return {
      success: true,
      updatedState: {
        nextDueDate: this.calculateNextDueDate(result.rating) as Timestamp,
        newStability: this.estimateNewStability(
          resolved.scheduling.stability,
          result.rating,
        ),
        newDifficulty: this.estimateNewDifficulty(
          resolved.scheduling.difficulty,
          result.rating,
        ),
      },
      nextItem,
      progress: {
        reviewed,
        remaining,
        percentComplete,
      },
      feedbackAcknowledged: result.feedback ? true : undefined,
    };
  }

  /**
   * Pause the session
   */
  async pauseSession(sessionId: ReviewSessionId): Promise<void> {
    const session = this.getSession(sessionId);
    session.status = "paused";
    session.lastActivityAt = now();

    this.emitEvent(session, {
      type: "session_paused",
      eventId: generateEventId(),
      sessionId,
      timestamp: now(),
      payload: {
        progress: session.currentIndex / session.queue.length,
      },
    });
  }

  /**
   * Resume the session
   */
  async resumeSession(sessionId: ReviewSessionId): Promise<void> {
    const session = this.getSession(sessionId);
    const pauseDuration = now() - session.lastActivityAt;
    session.status = "active";
    session.lastActivityAt = now();

    this.emitEvent(session, {
      type: "session_resumed",
      eventId: generateEventId(),
      sessionId,
      timestamp: now(),
      payload: {
        pauseDurationMs: pauseDuration as Duration,
      },
    });
  }

  /**
   * End the session
   */
  async endSession(
    sessionId: ReviewSessionId,
  ): Promise<SessionCompletionSummary> {
    const session = this.getSession(sessionId);
    session.status = "completed";
    session.completedAt = now();

    // Calculate final statistics
    const statistics = this.calculateFinalStatistics(session);

    // Determine completion type
    const completionType =
      session.currentIndex >= session.queue.length
        ? "finished"
        : "user_stopped";

    // Emit completion event
    this.emitEvent(session, {
      type: "session_completed",
      eventId: generateEventId(),
      sessionId,
      timestamp: now(),
      payload: {
        statistics,
        completionType,
      },
    });

    // Clean up
    this.sessions.delete(sessionId);

    return {
      sessionId,
      statistics,
      completionType,
      insights: this.generateInsights(session),
      recommendations: this.generateRecommendations(session),
    };
  }

  /**
   * Get session state
   */
  async getSessionState(
    sessionId: ReviewSessionId,
  ): Promise<ReviewSessionState> {
    const session = this.getSession(sessionId);

    return {
      sessionId,
      status: session.status,
      startedAt: session.startedAt ?? session.createdAt,
      lastActivityAt: session.lastActivityAt,
      completedAt: session.completedAt,
      totalItems: session.queue.length,
      itemsReviewed: session.currentIndex,
      itemsRemaining: session.queue.length - session.currentIndex,
      currentIndex: session.currentIndex,
      currentItem:
        session.currentIndex < session.queue.length
          ? session.resolvedItems.get(
              session.queue[session.currentIndex].itemId,
            )
          : undefined,
      statistics: this.calculateFinalStatistics(session),
      facePivots: session.facePivots,
    };
  }

  // ===========================================================================
  // FACE PIVOTING
  // ===========================================================================

  /**
   * Pivot to a different face
   */
  async pivotFace(request: FacePivotRequest): Promise<FacePivotResponse> {
    const session = this.getSession(request.sessionId);
    const resolved = session.resolvedItems.get(request.itemId);

    if (!resolved) {
      return {
        pivotId: generatePivotId(),
        updatedItem: resolved!,
        success: false,
        message: `Item ${request.itemId} not found`,
      };
    }

    // Check if pivoting is enabled
    if (!session.constraints.facePivotingEnabled) {
      return {
        pivotId: generatePivotId(),
        updatedItem: resolved,
        success: false,
        message: "Face pivoting is not enabled for this session",
      };
    }

    // Check pivot limit
    if (session.facePivots.length >= this.config.maxFacePivotsPerSession) {
      return {
        pivotId: generatePivotId(),
        updatedItem: resolved,
        success: false,
        message: `Maximum face pivots (${this.config.maxFacePivotsPerSession}) reached`,
      };
    }

    // Get card data to find the target face
    const cardData = await this.cardProvider.getCard(resolved.canonicalCardId);
    if (!cardData) {
      return {
        pivotId: generatePivotId(),
        updatedItem: resolved,
        success: false,
        message: "Card data not found",
      };
    }

    const targetFace = cardData.faces.find(
      (f) => f.id === request.targetFaceId,
    );
    if (!targetFace) {
      return {
        pivotId: generatePivotId(),
        updatedItem: resolved,
        success: false,
        message: `Face ${request.targetFaceId} not found`,
      };
    }

    // Record the pivot
    const pivotId = generatePivotId();
    const pivotRecord: FacePivotRecord = {
      pivotId,
      itemId: request.itemId,
      cardId: resolved.canonicalCardId,
      fromFaceId: resolved.resolvedFace.faceId,
      toFaceId: request.targetFaceId,
      reason: request.pivotReason,
      timestamp: request.timestamp,
    };
    session.facePivots.push(pivotRecord);

    // Create updated item with new face
    const updatedItem: ResolvedReviewItem = {
      ...resolved,
      resolvedFace: {
        face: targetFace,
        faceId: request.targetFaceId,
        isDefaultFace: request.targetFaceId === cardData.defaultFaceId,
        scaffolding: resolved.resolvedFace.scaffolding, // Keep scaffolding
        rendering: resolved.resolvedFace.rendering, // Keep rendering
        confidence: 1.0 as Confidence, // User chose, full confidence
        resolutionTimeMs: 0,
      },
      contextIndicators: [
        ...resolved.contextIndicators.filter((i) => i.type !== "face_adapted"),
        {
          type: "face_adapted" as ContextIndicatorType,
          icon: "🔄",
          label: "Face Changed",
          description: `You switched to "${targetFace.name}" face`,
          importance: "secondary",
        },
      ],
    };

    // Update cache
    session.resolvedItems.set(request.itemId, updatedItem);

    // Emit pivot event
    this.emitEvent(session, {
      type: "face_pivoted",
      eventId: generateEventId(),
      sessionId: request.sessionId,
      timestamp: request.timestamp,
      payload: {
        itemId: request.itemId,
        fromFaceId: resolved.resolvedFace.faceId,
        toFaceId: request.targetFaceId,
        reason: request.pivotReason,
      },
    });

    return {
      pivotId,
      updatedItem,
      success: true,
      message: `Switched to "${targetFace.name}" face`,
      learningImpact: {
        type: "neutral",
        description: "Face switching helps you explore different perspectives",
        confidence: 0.7 as Confidence,
      },
    };
  }

  /**
   * Get available alternative faces for an item
   */
  async getAlternativeFaces(
    sessionId: ReviewSessionId,
    itemId: ReviewItemId,
  ): Promise<readonly AlternativeFace[]> {
    const session = this.getSession(sessionId);
    const resolved = session.resolvedItems.get(itemId);

    if (!resolved) {
      return [];
    }

    // Use the face provider to get alternatives
    const cardData = await this.cardProvider.getCard(resolved.canonicalCardId);
    if (!cardData) {
      return [];
    }

    // Build face resolution input for context
    const input = await this.buildFaceResolutionInput(
      session,
      resolved.candidate,
      cardData,
    );

    return this.faceProvider.getAlternativeFaces(
      resolved.canonicalCardId,
      resolved.resolvedFace.faceId,
      input,
    );
  }

  // ===========================================================================
  // EXPLAINABILITY
  // ===========================================================================

  /**
   * Get explanation for an item
   */
  async explainItem(
    sessionId: ReviewSessionId,
    itemId: ReviewItemId,
  ): Promise<ReviewItemExplainability> {
    const session = this.getSession(sessionId);
    const resolved = session.resolvedItems.get(itemId);

    if (!resolved) {
      throw new Error(`Item ${itemId} not found`);
    }

    return this.buildItemExplainability(session, resolved);
  }

  /**
   * Get session explanation
   */
  async explainSession(
    sessionId: ReviewSessionId,
  ): Promise<SessionExplainability> {
    const session = this.getSession(sessionId);
    return this.buildSessionExplainability(session);
  }

  // ===========================================================================
  // SUBSCRIPTIONS
  // ===========================================================================

  /**
   * Subscribe to session events
   */
  subscribeToEvents(
    sessionId: ReviewSessionId,
    callback: SessionEventCallback,
  ): SessionEventSubscription {
    const session = this.getSession(sessionId);
    session.eventSubscriptions.add(callback);

    return {
      unsubscribe: () => {
        session.eventSubscriptions.delete(callback);
      },
    };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private getSession(sessionId: ReviewSessionId): InternalSessionData {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return session;
  }

  private async resolveQueueItem(
    session: InternalSessionData,
    queueItem: InternalQueueItem,
  ): Promise<ResolvedReviewItem> {
    const { itemId, candidate, deckResult } = queueItem;
    const cardId = candidate.cardId as unknown as CanonicalCardId;

    // Get card data
    const cardData = await this.cardProvider.getCard(cardId);
    if (!cardData) {
      throw new Error(`Card ${cardId} not found`);
    }

    // Build scheduling info
    const scheduling = this.buildSchedulingInfo(candidate);

    // Resolve face (if enabled)
    let resolvedFace: ResolvedFaceContext;
    if (session.constraints.faceResolutionEnabled) {
      const faceInput = await this.buildFaceResolutionInput(
        session,
        candidate,
        cardData,
      );
      const faceOutput = await this.faceProvider.resolveFace(faceInput);
      resolvedFace = this.buildResolvedFaceContext(
        faceOutput,
        cardData.defaultFaceId,
      );
    } else {
      // Use default face
      const defaultFace = cardData.faces.find(
        (f) => f.id === cardData.defaultFaceId,
      );
      resolvedFace = {
        face: defaultFace!,
        faceId: cardData.defaultFaceId,
        isDefaultFace: true,
        scaffolding: {
          effectiveLevel: 0,
          autoRevealOnStruggle: false,
        },
        rendering: {
          showContextIndicators: false,
        },
        confidence: 1.0 as Confidence,
        resolutionTimeMs: 0,
      };
    }

    // Build deck context
    let deckContext: ReviewItemDeckContext | undefined;
    if (deckResult && session.activeDeck) {
      deckContext = {
        deckId: session.activeDeck.deckId,
        positionInDeck: deckResult.position,
        matchingParticipationIds: deckResult.matchingParticipationIds,
        matchingCategoryIds: deckResult.matchingCategoryIds,
        inclusionExplanation: deckResult.inclusion,
      };
    }

    // Build context indicators
    const contextIndicators = buildContextIndicators(
      candidate,
      scheduling,
      deckContext,
      session.modeState,
    );

    // Build alternative faces (if pivoting enabled)
    let alternativeFaces: AlternativeFace[] | undefined;
    if (session.constraints.facePivotingEnabled) {
      alternativeFaces = cardData.faces
        .filter((f) => f.id !== resolvedFace.faceId)
        .map((f) => ({
          face: f,
          faceId: f.id,
          relevanceScore: 0.5 as NormalizedValue,
          availabilityReason: "Alternative perspective available",
        }));
    }

    return {
      itemId,
      sessionId: session.sessionId,
      position: session.queue.findIndex((q) => q.itemId === itemId) + 1,
      resolvedAt: now(),
      canonicalCardId: cardId,
      legacyCardId: cardData.legacyCardId,
      candidate,
      scheduling,
      deckContext,
      resolvedFace,
      alternativeFaces,
      contextIndicators,
    };
  }

  private async buildFaceResolutionInput(
    session: InternalSessionData,
    candidate: ReviewCandidate,
    cardData: {
      canonicalCardId: CanonicalCardId;
      faces: readonly CardFace[];
      defaultFaceId: CardFaceId;
      participations: readonly {
        participationId: string;
        categoryId: string;
        categoryName: string;
        semanticRole: string;
      }[];
    },
  ): Promise<FaceResolutionInput> {
    // Build category lens context
    let categoryLens: CategoryLensContext | undefined;
    if (candidate.categoryId) {
      const participation = cardData.participations.find(
        (p) => p.categoryId === candidate.categoryId,
      );
      if (participation) {
        categoryLens = {
          categoryId: candidate.categoryId,
          categoryName: participation.categoryName,
        };
      }
    }

    // Build participation context
    let participationCtx: ParticipationContext | undefined;
    if (candidate.participationId) {
      const part = cardData.participations.find(
        (p) => p.participationId === candidate.participationId,
      );
      if (part) {
        participationCtx = {
          participationId: part.participationId as ParticipationId,
          semanticRole: part.semanticRole as
            | SemanticRole
            | ExtendedSemanticRole,
          // Provide defaults for fields not in ParticipationSummary
          isPrimary: true, // Assume primary since we don't have this data
          contextMastery: 0.5 as NormalizedValue, // Default to middle mastery
          reviewCountInContext: 0, // Unknown, default to 0
        };
      }
    }

    // Build mode context
    const modeContext: ModeContext | undefined = session.modeState
      ?.activeModeDefinition
      ? {
          modeId: session.modeState.activeModeDefinition.id,
          modeName: session.modeState.activeModeDefinition.name,
          systemModeType:
            session.modeState.activeModeDefinition.systemType ?? undefined,
        }
      : undefined;

    return {
      requestId: generateResolutionRequestId(),
      userId: session.userId,
      timestamp: now(),
      canonicalCardId: cardData.canonicalCardId,
      availableFaces: cardData.faces.map((f) => ({ face: f, rules: [] })),
      defaultFaceId: cardData.defaultFaceId,
      categoryLens,
      participation: participationCtx,
      mode: modeContext,
    };
  }

  private buildSchedulingInfo(
    candidate: ReviewCandidate,
  ): ReviewItemScheduling {
    // Extract scheduling data from candidate
    // In a real implementation, this would come from the candidate's scheduling data
    const schedulingData = candidate.scoring;
    const isNew = schedulingData.urgency < 0.1;
    const daysOverdue = Math.floor(schedulingData.urgency * 10);
    const state = isNew ? "new" : ("review" as CardState);

    return {
      dueDate: now(),
      daysOverdue,
      stability: 1.0,
      retrievability: (1 - schedulingData.urgency) as NormalizedValue,
      difficulty: schedulingData.modeModifier as NormalizedValue,
      state,
      isNew,
      urgency: calculateUrgencyLevel(
        candidate.priorityScore,
        state,
        daysOverdue,
      ),
    };
  }

  private buildResolvedFaceContext(
    output: FaceResolutionOutput,
    defaultFaceId: CardFaceId,
  ): ResolvedFaceContext {
    return {
      face: output.selectedFace,
      faceId: output.selectedFaceId,
      isDefaultFace: output.selectedFaceId === defaultFaceId,
      scaffolding: output.scaffoldingDirectives,
      rendering: output.renderingDirectives,
      confidence: output.confidence,
      resolutionTimeMs: output.resolutionTimeMs,
    };
  }

  private async prefetchItems(session: InternalSessionData): Promise<void> {
    const startIndex = session.currentIndex + 1;
    const endIndex = Math.min(
      startIndex + session.constraints.prefetchCount,
      session.queue.length,
    );

    const itemsToResolve = session.queue
      .slice(startIndex, endIndex)
      .filter((item) => !item.resolved);

    await Promise.all(
      itemsToResolve.map(async (item) => {
        try {
          const resolved = await this.resolveQueueItem(session, item);
          session.resolvedItems.set(item.itemId, resolved);
          item.resolved = true;
        } catch (error) {
          console.error(`Failed to prefetch item ${item.itemId}:`, error);
        }
      }),
    );
  }

  private extractCardState(candidate: ReviewCandidate): CardState {
    // Extract state from candidate - simplified
    const urgency = candidate.scoring.urgency;
    if (urgency < 0.1) return "new";
    if (urgency < 0.3) return "learning";
    if (urgency > 0.8) return "relearning";
    return "review";
  }

  private isNewCard(candidate: ReviewCandidate): boolean {
    return candidate.scoring.urgency < 0.1;
  }

  private estimateSessionDuration(cardCount: number): number {
    // Estimate ~30 seconds per card
    return cardCount * 30 * 1000;
  }

  private calculateNextDueDate(rating: string): number {
    const intervals: Record<string, number> = {
      again: 1,
      hard: 1,
      good: 3,
      easy: 7,
    };
    const days = intervals[rating] ?? 1;
    return Date.now() + days * 24 * 60 * 60 * 1000;
  }

  private estimateNewStability(
    currentStability: number,
    rating: string,
  ): number {
    const multipliers: Record<string, number> = {
      again: 0.5,
      hard: 0.8,
      good: 1.2,
      easy: 1.5,
    };
    return currentStability * (multipliers[rating] ?? 1);
  }

  private estimateNewDifficulty(
    currentDifficulty: NormalizedValue,
    rating: string,
  ): NormalizedValue {
    const adjustments: Record<string, number> = {
      again: 0.1,
      hard: 0.05,
      good: -0.02,
      easy: -0.05,
    };
    const adjustment = adjustments[rating] ?? 0;
    return Math.max(
      0,
      Math.min(1, currentDifficulty + adjustment),
    ) as NormalizedValue;
  }

  private calculateFinalStatistics(
    session: InternalSessionData,
  ): ReviewSessionStatistics {
    const totalTime =
      session.lastActivityAt - (session.startedAt ?? session.createdAt);
    const reviewedCount = session.currentIndex;
    const averageTime = reviewedCount > 0 ? totalTime / reviewedCount : 0;

    const totalRatings = Object.values(
      session.statistics.ratingDistribution,
    ).reduce((a, b) => a + b, 0);
    const correctRatings =
      session.statistics.ratingDistribution.good +
      session.statistics.ratingDistribution.easy;
    const accuracy = totalRatings > 0 ? correctRatings / totalRatings : 0;

    return {
      totalTimeMs: totalTime as Duration,
      averageTimePerCard: averageTime as Duration,
      ratingDistribution: session.statistics.ratingDistribution,
      cardsByState: session.statistics.cardsByState,
      facePivotsCount: session.facePivots.length,
      accuracyEstimate: accuracy as NormalizedValue,
    };
  }

  private buildSessionExplainability(
    session: InternalSessionData,
  ): SessionExplainability {
    const modeState = session.modeState;
    const modeDef = modeState?.activeModeDefinition;

    return {
      traceId: generateTraceId(),
      summary: `Review session with ${session.queue.length} cards using ${modeDef?.name ?? "default"} mode`,
      details: `This session was created based on your learning mode preferences and current card due dates.`,
      modeInfluence: {
        modeName: modeDef?.name ?? "Default",
        modeType: modeDef?.systemType ?? "unknown",
        parametersUsed: modeState?.resolvedParameters ?? {},
        signalAmplifications: [],
        policyModifications: [],
      },
      deckFilterExplanation: session.activeDeck
        ? {
            deckName: session.activeDeck.name,
            cardsBefore: session.activeDeck.totalCards,
            cardsAfter: session.queue.length,
            cardsFiltered: session.activeDeck.totalCards - session.queue.length,
            filterCriteriaSummary: "Deck membership filter applied",
          }
        : undefined,
      queueComposition: {
        total: session.queue.length,
        byState: session.statistics.cardsByState,
        byUrgency: {
          critical: 0,
          high: 0,
          medium: session.queue.length,
          low: 0,
        },
        topFactors: ["Due date", "Mode priority", "Deck membership"],
      },
    };
  }

  private buildItemExplainability(
    session: InternalSessionData,
    item: ResolvedReviewItem,
  ): ReviewItemExplainability {
    return {
      traceId: generateTraceId(),
      summary: `Card selected based on ${item.scheduling.urgency} urgency in ${session.modeState?.activeModeDefinition?.name ?? "default"} mode`,
      details: `This card was chosen based on scheduling urgency and mode-specific prioritization.`,
      schedulerStage: {
        dueDateReason: item.scheduling.isNew
          ? "New card ready for introduction"
          : `Due date reached (${item.scheduling.daysOverdue} days overdue)`,
        stabilityExplanation: `Memory stability at ${item.scheduling.stability.toFixed(2)}`,
        retrievabilityExplanation: `Estimated recall probability: ${Math.round(item.scheduling.retrievability * 100)}%`,
        intervalPrediction: "Next review interval will depend on your rating",
      },
      modeStage: {
        modeName: session.modeState?.activeModeDefinition?.name ?? "Default",
        priorityScore: item.candidate.priorityScore as NormalizedValue,
        scoringBreakdown: item.candidate.scoring,
        signalContributions: Object.entries(
          item.candidate.scoring.signalContributions ?? {},
        ).map(([name, value]) => ({
          signalName: name,
          contribution: value as number,
          interpretation: `${name} contributed ${(value as number).toFixed(2)} to priority`,
        })),
      },
      deckStage: item.deckContext
        ? {
            deckName: session.activeDeck?.name ?? "Unknown",
            inclusionReason: "Card matches deck query criteria",
            matchedPredicates: ["Deck membership"],
          }
        : undefined,
      faceStage: {
        selectedFaceName: item.resolvedFace.face.name,
        selectionReason: item.resolvedFace.isDefaultFace
          ? "Default face used"
          : "Face selected based on context rules",
        rulesMatched: 0,
        scaffoldingApplied: [],
        fullExplainability: undefined,
      },
    };
  }

  private generateInsights(session: InternalSessionData): Array<{
    type: "strength" | "weakness" | "pattern" | "achievement";
    title: string;
    description: string;
    categoryId?: CategoryId;
  }> {
    const insights: Array<{
      type: "strength" | "weakness" | "pattern" | "achievement";
      title: string;
      description: string;
      categoryId?: CategoryId;
    }> = [];

    const stats = session.statistics;
    const totalRatings = Object.values(stats.ratingDistribution).reduce(
      (a, b) => a + b,
      0,
    );

    if (totalRatings > 0) {
      const accuracyRate =
        (stats.ratingDistribution.good + stats.ratingDistribution.easy) /
        totalRatings;

      if (accuracyRate >= 0.8) {
        insights.push({
          type: "strength",
          title: "High Accuracy",
          description: `You correctly recalled ${Math.round(accuracyRate * 100)}% of cards. Great retention!`,
        });
      }

      if (stats.ratingDistribution.again > totalRatings * 0.3) {
        insights.push({
          type: "weakness",
          title: "Review Needed",
          description: `${stats.ratingDistribution.again} cards need more practice. Consider shorter review intervals.`,
        });
      }
    }

    return insights;
  }

  private generateRecommendations(session: InternalSessionData): Array<{
    type: "focus_area" | "mode_suggestion" | "pacing" | "scheduling";
    title: string;
    description: string;
    actionable: boolean;
    action?: { type: string; parameters: Record<string, unknown> };
  }> {
    const recommendations: Array<{
      type: "focus_area" | "mode_suggestion" | "pacing" | "scheduling";
      title: string;
      description: string;
      actionable: boolean;
      action?: { type: string; parameters: Record<string, unknown> };
    }> = [];

    // Simple recommendation based on session results
    if (session.statistics.ratingDistribution.again > 5) {
      recommendations.push({
        type: "focus_area",
        title: "Focus on Difficult Cards",
        description:
          "Consider a targeted review session for cards you struggled with.",
        actionable: true,
        action: {
          type: "create_session",
          parameters: { filter: "difficult" },
        },
      });
    }

    return recommendations;
  }

  private emitEvent(session: InternalSessionData, event: SessionEvent): void {
    for (const callback of session.eventSubscriptions) {
      try {
        callback(event);
      } catch (error) {
        console.error("Error in session event callback:", error);
      }
    }
  }

  private emitItemPresentedEvent(
    session: InternalSessionData,
    item: ResolvedReviewItem,
  ): void {
    this.emitEvent(session, {
      type: "item_presented",
      eventId: generateEventId(),
      sessionId: session.sessionId,
      timestamp: now(),
      payload: {
        itemId: item.itemId,
        cardId: item.canonicalCardId,
        faceId: item.resolvedFace.faceId,
        position: item.position,
      },
    });
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new session orchestrator
 */
export function createSessionOrchestrator(
  candidateProvider: RankedCandidateProvider,
  deckProvider: DeckEvaluationProvider,
  faceProvider: FaceResolutionProvider,
  cardProvider: CardDataProviderForSession,
  config?: Partial<SessionOrchestratorConfig>,
): IReviewSessionOrchestrator {
  return new ReviewSessionOrchestrator(
    candidateProvider,
    deckProvider,
    faceProvider,
    cardProvider,
    config,
  );
}
