// =============================================================================
// EVENT FACTORY - Create Well-Formed Events
// =============================================================================
// Factory functions for creating LKGC events with:
// - Proper default values
// - Automatic ID generation
// - Provenance initialization
// - Privacy scope defaults
// - Sync state initialization
//
// Use these factories instead of manually constructing events to ensure
// all required fields are properly set.
// =============================================================================

import type {
  EventId,
  SessionId,
  NodeId,
  DeviceId,
  Timestamp,
  Duration,
  DataSource,
  Provenance,
  PrivacyScope,
  SyncState,
} from "../types/lkgc/foundation";
import { DEFAULT_PRIVACY_SCOPE } from "../types/lkgc/foundation";
import type { ReviewRating, ReviewAttemptId } from "../types/lkgc/session";
import type {
  ReviewStartedEvent,
  ReviewCompletedEvent,
  ConfidenceReportedEvent,
  ReflectionSubmittedEvent,
  IdleDetectedEvent,
  AppBackgroundedEvent,
  QuestAcceptedEvent,
  StreakExtendedEvent,
  ImportCompletedEvent,
  LinkCreatedEvent,
  SessionEnvironmentCapturedEvent,
} from "../types/lkgc/events";
import {
  generateEventId,
  now,
  confidence,
  normalized,
  revision,
} from "./id-generator";

// =============================================================================
// FACTORY CONFIGURATION
// =============================================================================
/**
 * Configuration for the event factory
 */
export interface EventFactoryConfig {
  /** Default device ID to use */
  readonly deviceId: DeviceId;

  /** App version string */
  readonly appVersion: string;

  /** Schema version */
  readonly schemaVersion: number;

  /** Default privacy scope */
  readonly defaultPrivacy?: PrivacyScope;

  /** Default data source */
  readonly defaultSource?: DataSource;
}

// =============================================================================
// EVENT FACTORY CLASS
// =============================================================================

/**
 * Factory for creating well-formed LKGC events
 */
export class EventFactory {
  private readonly config: EventFactoryConfig;
  private revisionCounter = 0;

  constructor(config: EventFactoryConfig) {
    this.config = config;
  }

  // -------------------------------------------------------------------------
  // BASE EVENT CREATION
  // -------------------------------------------------------------------------

  /**
   * Create base event properties
   */
  private createBaseEvent(
    sessionId?: SessionId,
    source: DataSource = this.config.defaultSource ?? "user_action",
    sourceId = "app",
    conf: number = 1.0,
  ): {
    id: EventId;
    timestamp: Timestamp;
    sessionId: SessionId | undefined;
    deviceId: DeviceId;
    provenance: Provenance;
    privacy: PrivacyScope;
    sync: SyncState;
  } {
    const timestamp = now();
    return {
      id: generateEventId(),
      timestamp,
      sessionId,
      deviceId: this.config.deviceId,
      provenance: this.createProvenance(source, sourceId, conf, timestamp),
      privacy: this.config.defaultPrivacy ?? DEFAULT_PRIVACY_SCOPE,
      sync: this.createSyncState(),
    };
  }

  /**
   * Create provenance object
   */
  private createProvenance(
    source: DataSource,
    sourceId: string,
    conf: number,
    timestamp: Timestamp,
  ): Provenance {
    return {
      source,
      sourceId,
      confidence: confidence(conf),
      createdAt: timestamp,
      updatedAt: timestamp,
      deviceId: this.config.deviceId,
      appVersion: this.config.appVersion,
      schemaVersion: this.config.schemaVersion,
    };
  }

  /**
   * Create sync state
   */
  private createSyncState(): SyncState {
    return {
      rev: revision(++this.revisionCounter),
      mergeStrategy: "lww",
      pendingSync: true,
    };
  }

  // -------------------------------------------------------------------------
  // REVIEW PERFORMANCE EVENTS
  // -------------------------------------------------------------------------

  /**
   * Create a review started event
   */
  reviewStarted(
    cardId: NodeId,
    attemptId: ReviewAttemptId,
    sessionId: SessionId,
    options: {
      preReviewRetrievability: number;
      scheduledInterval: number;
      isOverdue?: boolean;
      overdueBy?: number;
    },
  ): ReviewStartedEvent {
    return {
      ...this.createBaseEvent(sessionId),
      category: "review_performance",
      eventType: "review_started",
      cardId,
      attemptId,
      preReviewRetrievability: normalized(options.preReviewRetrievability),
      scheduledInterval: options.scheduledInterval,
      isOverdue: options.isOverdue ?? false,
      overdueBy: options.overdueBy,
    };
  }

  /**
   * Create a review completed event
   */
  reviewCompleted(
    cardId: NodeId,
    attemptId: ReviewAttemptId,
    sessionId: SessionId,
    options: {
      rating: ReviewRating;
      responseTime: Duration;
      hintLevel?: number;
      answerChanged?: boolean;
      changeCount?: number;
      editedDuringReview?: boolean;
      newStability: number;
      newDifficulty: number;
      newInterval: number;
      partialCredit?: number;
      hintsAvailable?: number;
    },
  ): ReviewCompletedEvent {
    return {
      ...this.createBaseEvent(sessionId),
      category: "review_performance",
      eventType: "review_completed",
      cardId,
      attemptId,
      rating: options.rating,
      responseTime: options.responseTime,
      hintLevel: options.hintLevel ?? 0,
      hintsAvailable: options.hintsAvailable ?? 0,
      answerChanged: options.answerChanged ?? false,
      changeCount: options.changeCount ?? 0,
      editedDuringReview: options.editedDuringReview ?? false,
      newStability: options.newStability,
      newDifficulty: normalized(options.newDifficulty),
      newInterval: options.newInterval,
      partialCredit:
        options.partialCredit !== undefined
          ? normalized(options.partialCredit)
          : undefined,
    };
  }

  // -------------------------------------------------------------------------
  // METACOGNITIVE EVENTS
  // -------------------------------------------------------------------------

  /**
   * Create a confidence reported event
   */
  confidenceReported(
    cardId: NodeId,
    attemptId: ReviewAttemptId,
    sessionId: SessionId,
    timing: "pre_answer" | "post_answer",
    confidenceValue: number,
    previousConfidence?: number,
  ): ConfidenceReportedEvent {
    return {
      ...this.createBaseEvent(sessionId),
      category: "metacognitive",
      eventType: "confidence_reported",
      cardId,
      attemptId,
      timing,
      confidence: confidence(confidenceValue),
      previousConfidence:
        previousConfidence !== undefined
          ? confidence(previousConfidence)
          : undefined,
    };
  }

  /**
   * Create a reflection submitted event
   */
  reflectionSubmitted(
    reflectionId: NodeId,
    sessionId: SessionId | undefined,
    options: {
      reflectionType: "session" | "daily" | "weekly" | "topic" | "goal";
      duration: Duration;
      hasAudio: boolean;
      wordCount: number;
      actionItemCount?: number;
      qualityScore?: number;
    },
  ): ReflectionSubmittedEvent {
    return {
      ...this.createBaseEvent(sessionId),
      category: "metacognitive",
      eventType: "reflection_submitted",
      reflectionId,
      reflectionType: options.reflectionType,
      duration: options.duration,
      hasAudio: options.hasAudio,
      wordCount: options.wordCount,
      actionItemCount: options.actionItemCount ?? 0,
      qualityScore:
        options.qualityScore !== undefined
          ? normalized(options.qualityScore)
          : undefined,
    };
  }

  // -------------------------------------------------------------------------
  // ATTENTION EVENTS
  // -------------------------------------------------------------------------

  /**
   * Create an idle detected event
   */
  idleDetected(
    sessionId: SessionId | undefined,
    idleDuration: Duration,
    context: "mid_card" | "between_cards" | "session_start",
  ): IdleDetectedEvent {
    return {
      ...this.createBaseEvent(sessionId, "system", "idle_detector"),
      category: "attention",
      eventType: "idle_detected",
      idleDuration,
      context,
    };
  }

  /**
   * Create an app backgrounded event
   */
  appBackgrounded(
    sessionId: SessionId | undefined,
    sessionState: "active" | "paused" | "idle",
    cardInProgress?: NodeId,
    attemptInProgress?: ReviewAttemptId,
  ): AppBackgroundedEvent {
    return {
      ...this.createBaseEvent(sessionId, "system", "app_lifecycle"),
      category: "attention",
      eventType: "app_backgrounded",
      sessionState,
      cardInProgress,
      attemptInProgress,
    };
  }

  // -------------------------------------------------------------------------
  // GAMIFICATION EVENTS
  // -------------------------------------------------------------------------

  /**
   * Create a quest accepted event
   */
  questAccepted(
    questId: NodeId,
    sessionId: SessionId | undefined,
    options: {
      questType: "main" | "side" | "daily" | "weekly" | "event";
      objectiveCount: number;
      deadline?: Timestamp;
    },
  ): QuestAcceptedEvent {
    return {
      ...this.createBaseEvent(sessionId),
      category: "gamification",
      eventType: "quest_accepted",
      questId,
      questType: options.questType,
      objectiveCount: options.objectiveCount,
      deadline: options.deadline,
    };
  }

  /**
   * Create a streak extended event
   */
  streakExtended(
    streakRuleId: NodeId,
    newStreak: number,
    isPersonalBest: boolean,
    bonusXp?: number,
  ): StreakExtendedEvent {
    return {
      ...this.createBaseEvent(undefined, "system", "gamification_engine"),
      category: "gamification",
      eventType: "streak_extended",
      streakRuleId,
      newStreak,
      isPersonalBest,
      bonusXp,
    };
  }

  // -------------------------------------------------------------------------
  // CONTENT EVENTS
  // -------------------------------------------------------------------------

  /**
   * Create an import completed event
   */
  importCompleted(
    importId: string,
    options: {
      itemsImported: number;
      itemsSkipped: number;
      duplicatesFound: number;
      errorsEncountered: number;
      duration: Duration;
    },
  ): ImportCompletedEvent {
    return {
      ...this.createBaseEvent(undefined, "import_parser", importId),
      category: "content",
      eventType: "import_completed",
      importId:
        importId as unknown as import("../types/lkgc/foundation").EntityId,
      itemsImported: options.itemsImported,
      itemsSkipped: options.itemsSkipped,
      duplicatesFound: options.duplicatesFound,
      errorsEncountered: options.errorsEncountered,
      duration: options.duration,
    };
  }

  /**
   * Create a link created event
   */
  linkCreated(
    sourceNodeId: NodeId,
    targetNodeId: NodeId,
    linkText: string,
    context?: string,
  ): LinkCreatedEvent {
    return {
      ...this.createBaseEvent(),
      category: "content",
      eventType: "link_created",
      sourceNodeId,
      targetNodeId,
      linkText,
      context,
    };
  }

  // -------------------------------------------------------------------------
  // ENVIRONMENT EVENTS
  // -------------------------------------------------------------------------

  /**
   * Create a session environment captured event
   */
  sessionEnvironmentCaptured(
    sessionId: SessionId,
    options: {
      deviceType: "phone" | "tablet" | "desktop" | "other";
      osVersion: string;
      connectivity: "online" | "offline" | "metered";
      timeZone: string;
      locale: string;
      batteryLevel?: number;
      isCharging?: boolean;
      screenBrightness?: number;
    },
  ): SessionEnvironmentCapturedEvent {
    return {
      ...this.createBaseEvent(sessionId, "system", "environment_capture"),
      category: "environment",
      eventType: "session_environment_captured",
      deviceType: options.deviceType,
      osVersion: options.osVersion,
      appVersion: this.config.appVersion,
      connectivity: options.connectivity,
      timeZone: options.timeZone,
      locale: options.locale,
      batteryLevel:
        options.batteryLevel !== undefined
          ? normalized(options.batteryLevel)
          : undefined,
      isCharging: options.isCharging,
      screenBrightness:
        options.screenBrightness !== undefined
          ? normalized(options.screenBrightness)
          : undefined,
    };
  }
}

// =============================================================================
// CONVENIENCE FACTORY FUNCTION
// =============================================================================

/**
 * Create an event factory with the given configuration
 */
export function createEventFactory(config: EventFactoryConfig): EventFactory {
  return new EventFactory(config);
}
