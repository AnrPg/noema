// =============================================================================
// DECK AUTO-UPDATE - Reactive deck updates
// =============================================================================
// Phase 6C: Dynamic Decks as Query Views
//
// This module provides:
// - Event-driven deck invalidation
// - Debounced re-evaluation
// - Change diffing and notification
// - Subscription management
// =============================================================================

import type {
  DynamicDeckDefinition,
  DynamicDeckId,
  DeckChangeEvent,
  DeckChangeEventId,
  DeckUpdateTrigger,
  DeckChangeType,
  DeckSnapshotSummary,
  DeckSnapshotId,
  DeckAutoUpdateConfig,
  DeckChangeCallback,
  DeckChangeSubscription,
  DeckQueryEvaluationResult,
} from "../../types/dynamic-deck.types";
import type { CanonicalCardId } from "../../types/canonical-card.types";
import type { CategoryId } from "../../types/ecosystem.types";
import type { UserId } from "../../types/user.types";
import type { Timestamp, Duration } from "../../types/lkgc/foundation";

import { DEFAULT_AUTO_UPDATE_CONFIG } from "../../types/dynamic-deck.types";
import type { DeckQueryEngine } from "./deck-query-engine";

// =============================================================================
// EVENT TYPES
// =============================================================================

/**
 * Raw event that may trigger deck updates
 */
export type DeckTriggerEvent =
  | CardCreatedTrigger
  | CardUpdatedTrigger
  | CardDeletedTrigger
  | CardReviewedTrigger
  | CardStateChangedTrigger
  | ParticipationCreatedTrigger
  | ParticipationUpdatedTrigger
  | ParticipationDeletedTrigger
  | CategoryUpdatedTrigger
  | LkgcSignalChangedTrigger
  | TagChangedTrigger
  | ManualTrigger
  | ScheduledTrigger;

interface CardCreatedTrigger {
  readonly type: "card_created";
  readonly cardId: CanonicalCardId;
  readonly userId: UserId;
  readonly timestamp: Timestamp;
}

interface CardUpdatedTrigger {
  readonly type: "card_updated";
  readonly cardId: CanonicalCardId;
  readonly userId: UserId;
  readonly timestamp: Timestamp;
  readonly changedFields: readonly string[];
}

interface CardDeletedTrigger {
  readonly type: "card_deleted";
  readonly cardId: CanonicalCardId;
  readonly userId: UserId;
  readonly timestamp: Timestamp;
}

interface CardReviewedTrigger {
  readonly type: "card_reviewed";
  readonly cardId: CanonicalCardId;
  readonly userId: UserId;
  readonly timestamp: Timestamp;
}

interface CardStateChangedTrigger {
  readonly type: "card_state_changed";
  readonly cardId: CanonicalCardId;
  readonly userId: UserId;
  readonly timestamp: Timestamp;
  readonly previousState: string;
  readonly newState: string;
}

interface ParticipationCreatedTrigger {
  readonly type: "participation_created";
  readonly cardId: CanonicalCardId;
  readonly categoryId: CategoryId;
  readonly userId: UserId;
  readonly timestamp: Timestamp;
}

interface ParticipationUpdatedTrigger {
  readonly type: "participation_updated";
  readonly cardId: CanonicalCardId;
  readonly categoryId: CategoryId;
  readonly userId: UserId;
  readonly timestamp: Timestamp;
}

interface ParticipationDeletedTrigger {
  readonly type: "participation_deleted";
  readonly cardId: CanonicalCardId;
  readonly categoryId: CategoryId;
  readonly userId: UserId;
  readonly timestamp: Timestamp;
}

interface CategoryUpdatedTrigger {
  readonly type: "category_updated";
  readonly categoryId: CategoryId;
  readonly userId: UserId;
  readonly timestamp: Timestamp;
}

interface LkgcSignalChangedTrigger {
  readonly type: "lkgc_signal_changed";
  readonly cardId: CanonicalCardId;
  readonly userId: UserId;
  readonly timestamp: Timestamp;
  readonly signalType: string;
}

interface TagChangedTrigger {
  readonly type: "tag_changed";
  readonly cardId: CanonicalCardId;
  readonly userId: UserId;
  readonly timestamp: Timestamp;
  readonly addedTags: readonly string[];
  readonly removedTags: readonly string[];
}

interface ManualTrigger {
  readonly type: "manual";
  readonly deckId: DynamicDeckId;
  readonly userId: UserId;
  readonly timestamp: Timestamp;
}

interface ScheduledTrigger {
  readonly type: "scheduled";
  readonly deckId: DynamicDeckId;
  readonly userId: UserId;
  readonly timestamp: Timestamp;
}

// =============================================================================
// SNAPSHOT MANAGEMENT
// =============================================================================

/**
 * Full snapshot of a deck's state (for change detection)
 */
export interface DeckSnapshot {
  readonly snapshotId: DeckSnapshotId;
  readonly deckId: DynamicDeckId;
  readonly timestamp: Timestamp;
  readonly cardIds: readonly CanonicalCardId[];
  readonly cardIdHash: string;
  readonly totalCount: number;
}

/**
 * Generate a hash of card IDs for quick comparison
 */
function hashCardIds(cardIds: readonly CanonicalCardId[]): string {
  // Sort and hash for consistent comparison
  const sorted = [...cardIds].sort();
  return sorted.join(",");
}

/**
 * Create a snapshot from evaluation result
 */
function createSnapshot(
  deckId: DynamicDeckId,
  result: DeckQueryEvaluationResult,
): DeckSnapshot {
  const cardIds = result.cards.map((c) => c.cardId);
  return {
    snapshotId: `snap-${deckId}-${Date.now()}` as DeckSnapshotId,
    deckId,
    timestamp: result.metadata.evaluatedAt,
    cardIds,
    cardIdHash: hashCardIds(cardIds),
    totalCount: result.totalCount,
  };
}

/**
 * Create a summary from a snapshot
 */
function snapshotToSummary(snapshot: DeckSnapshot): DeckSnapshotSummary {
  return {
    snapshotId: snapshot.snapshotId,
    timestamp: snapshot.timestamp,
    cardCount: snapshot.totalCount,
    cardIdHash: snapshot.cardIdHash,
  };
}

// =============================================================================
// CHANGE DETECTION
// =============================================================================

/**
 * Detect changes between two snapshots
 */
function detectChanges(
  previous: DeckSnapshot,
  current: DeckSnapshot,
): {
  added: CanonicalCardId[];
  removed: CanonicalCardId[];
  hasChanges: boolean;
} {
  // Quick check via hash
  if (previous.cardIdHash === current.cardIdHash) {
    return { added: [], removed: [], hasChanges: false };
  }

  const previousSet = new Set(previous.cardIds);
  const currentSet = new Set(current.cardIds);

  const added = [...currentSet].filter((id) => !previousSet.has(id));
  const removed = [...previousSet].filter((id) => !currentSet.has(id));

  return {
    added,
    removed,
    hasChanges: added.length > 0 || removed.length > 0,
  };
}

// =============================================================================
// DECK AUTO-UPDATER
// =============================================================================

/**
 * Manages automatic updates for dynamic decks
 */
export class DeckAutoUpdater {
  private readonly engine: DeckQueryEngine;
  private readonly configs = new Map<DynamicDeckId, DeckAutoUpdateConfig>();
  private readonly snapshots = new Map<DynamicDeckId, DeckSnapshot>();
  private readonly pendingUpdates = new Map<DynamicDeckId, NodeJS.Timeout>();
  private readonly subscriptions = new Map<
    string,
    {
      deckId: DynamicDeckId;
      callback: DeckChangeCallback;
      active: boolean;
    }
  >();
  private subscriptionCounter = 0;

  // Dependencies (inject or set)
  private deckProvider?: {
    getDecksForUser(userId: UserId): Promise<readonly DynamicDeckDefinition[]>;
  };

  constructor(engine: DeckQueryEngine) {
    this.engine = engine;
  }

  /**
   * Set deck provider for querying decks
   */
  setDeckProvider(provider: {
    getDecksForUser(userId: UserId): Promise<readonly DynamicDeckDefinition[]>;
  }): void {
    this.deckProvider = provider;
  }

  /**
   * Configure auto-update for a deck
   */
  configure(
    deckId: DynamicDeckId,
    config: Partial<DeckAutoUpdateConfig>,
  ): void {
    this.configs.set(deckId, { ...DEFAULT_AUTO_UPDATE_CONFIG, ...config });
  }

  /**
   * Get configuration for a deck
   */
  getConfig(deckId: DynamicDeckId): DeckAutoUpdateConfig {
    return this.configs.get(deckId) ?? DEFAULT_AUTO_UPDATE_CONFIG;
  }

  /**
   * Process a trigger event that may affect decks
   */
  async processTrigger(event: DeckTriggerEvent): Promise<void> {
    if (!this.deckProvider) {
      console.warn("DeckAutoUpdater: No deck provider set");
      return;
    }

    // Map event type to trigger type
    const triggerType = this.eventToTriggerType(event);
    if (!triggerType) return;

    // Get all decks for the user
    const decks = await this.deckProvider.getDecksForUser(event.userId);

    // Check each deck
    for (const deck of decks) {
      const config = this.getConfig(deck.id);

      // Skip if auto-update is disabled
      if (!config.enabled) continue;

      // Skip if this trigger type is not in the deck's triggers
      if (!config.triggers.includes(triggerType)) continue;

      // Check if this event could affect the deck
      if (this.couldAffectDeck(event, deck)) {
        this.scheduleUpdate(deck.id, event.userId, triggerType, config);
      }
    }
  }

  /**
   * Map event type to trigger type
   */
  private eventToTriggerType(
    event: DeckTriggerEvent,
  ): DeckUpdateTrigger | null {
    switch (event.type) {
      case "card_created":
        return "card_created";
      case "card_updated":
        return "card_updated";
      case "card_deleted":
        return "card_deleted";
      case "card_reviewed":
        return "card_reviewed";
      case "card_state_changed":
        return "card_state_changed";
      case "participation_created":
        return "participation_created";
      case "participation_updated":
        return "participation_updated";
      case "participation_deleted":
        return "participation_deleted";
      case "category_updated":
        return "category_updated";
      case "lkgc_signal_changed":
        return "lkgc_signal_changed";
      case "tag_changed":
        return "tag_changed";
      case "manual":
        return "manual";
      case "scheduled":
        return "scheduled";
      default:
        return null;
    }
  }

  /**
   * Check if an event could affect a deck
   */
  private couldAffectDeck(
    event: DeckTriggerEvent,
    deck: DynamicDeckDefinition,
  ): boolean {
    // For manual/scheduled triggers, check if it's for this deck
    if (event.type === "manual" || event.type === "scheduled") {
      return event.deckId === deck.id;
    }

    // For category updates, check if the category is relevant
    if (event.type === "category_updated") {
      return this.categoryIsRelevant(event.categoryId, deck);
    }

    // For participation events, check if the category is relevant
    if (
      event.type === "participation_created" ||
      event.type === "participation_updated" ||
      event.type === "participation_deleted"
    ) {
      return this.categoryIsRelevant(event.categoryId, deck);
    }

    // For other card events, we need to check if the card could match
    // For efficiency, we assume it could (actual filtering happens during evaluation)
    return true;
  }

  /**
   * Check if a category is relevant to a deck
   */
  private categoryIsRelevant(
    categoryId: CategoryId,
    deck: DynamicDeckDefinition,
  ): boolean {
    // Check if the query references this category
    return this.queryReferencesCategory(deck.query, categoryId);
  }

  /**
   * Recursively check if a query references a category
   */
  private queryReferencesCategory(
    query: DynamicDeckDefinition["query"],
    categoryId: CategoryId,
  ): boolean {
    if (query.queryType === "base") {
      if (query.includeCategoryIds?.includes(categoryId)) return true;
      if (query.excludeCategoryIds?.includes(categoryId)) return true;
      return false;
    }

    if (
      query.queryType === "union" ||
      query.queryType === "intersection" ||
      query.queryType === "difference" ||
      query.queryType === "symmetric_diff"
    ) {
      return query.operands.some((op) =>
        this.queryReferencesCategory(op, categoryId),
      );
    }

    // Reference queries need to be resolved
    return true;
  }

  /**
   * Schedule a debounced update for a deck
   */
  private scheduleUpdate(
    deckId: DynamicDeckId,
    userId: UserId,
    triggerType: DeckUpdateTrigger,
    config: DeckAutoUpdateConfig,
  ): void {
    // Cancel any pending update
    const existing = this.pendingUpdates.get(deckId);
    if (existing) {
      clearTimeout(existing);
    }

    // Schedule new update with debounce
    const timeout = setTimeout(async () => {
      this.pendingUpdates.delete(deckId);
      await this.executeUpdate(deckId, userId, triggerType, config);
    }, config.minIntervalMs);

    this.pendingUpdates.set(deckId, timeout);
  }

  /**
   * Execute a deck update and notify subscribers
   */
  private async executeUpdate(
    deckId: DynamicDeckId,
    userId: UserId,
    triggerType: DeckUpdateTrigger,
    config: DeckAutoUpdateConfig,
  ): Promise<void> {
    try {
      // Get previous snapshot
      const previousSnapshot = this.snapshots.get(deckId);

      // Evaluate the deck
      const result = await this.engine.evaluate({
        query: deckId,
        userId,
        timestamp: Date.now() as Timestamp,
        includeExplainability: false,
        includeLkgcSignals: false,
      });

      // Create new snapshot
      const currentSnapshot = createSnapshot(deckId, result);
      this.snapshots.set(deckId, currentSnapshot);

      // If no previous snapshot, no change event needed
      if (!previousSnapshot) {
        return;
      }

      // Detect changes
      const changes = detectChanges(previousSnapshot, currentSnapshot);

      if (!changes.hasChanges) {
        return;
      }

      // Determine change types
      const changeTypes: DeckChangeType[] = [];
      if (changes.added.length > 0) changeTypes.push("card_added");
      if (changes.removed.length > 0) changeTypes.push("card_removed");

      // Check if we should notify
      const shouldNotify =
        config.notifyOnChanges &&
        changeTypes.some((ct) => config.notifyChangeTypes.includes(ct));

      if (!shouldNotify) {
        return;
      }

      // Build change event
      const event: DeckChangeEvent = {
        eventId: `evt-${deckId}-${Date.now()}` as DeckChangeEventId,
        deckId,
        timestamp: currentSnapshot.timestamp,
        changeType: changeTypes[0], // Primary change type
        affectedCardIds: [...changes.added, ...changes.removed],
        trigger: triggerType,
        previousSnapshot: snapshotToSummary(previousSnapshot),
        newSnapshot: snapshotToSummary(currentSnapshot),
      };

      // Notify subscribers
      this.notifySubscribers(event);

      // Also notify the engine
      this.engine.notifyChange(event);
    } catch (error) {
      console.error(`Error updating deck ${deckId}:`, error);
    }
  }

  /**
   * Force an immediate update for a deck
   */
  async forceUpdate(
    deckId: DynamicDeckId,
    userId: UserId,
  ): Promise<DeckChangeEvent | null> {
    // Cancel any pending update
    const existing = this.pendingUpdates.get(deckId);
    if (existing) {
      clearTimeout(existing);
      this.pendingUpdates.delete(deckId);
    }

    // Get previous snapshot
    const previousSnapshot = this.snapshots.get(deckId);

    // Evaluate the deck
    const result = await this.engine.evaluate({
      query: deckId,
      userId,
      timestamp: Date.now() as Timestamp,
      includeExplainability: false,
      includeLkgcSignals: false,
    });

    // Create new snapshot
    const currentSnapshot = createSnapshot(deckId, result);
    this.snapshots.set(deckId, currentSnapshot);

    // If no previous snapshot, return null
    if (!previousSnapshot) {
      return null;
    }

    // Detect changes
    const changes = detectChanges(previousSnapshot, currentSnapshot);

    if (!changes.hasChanges) {
      return null;
    }

    // Build change event
    const changeTypes: DeckChangeType[] = [];
    if (changes.added.length > 0) changeTypes.push("card_added");
    if (changes.removed.length > 0) changeTypes.push("card_removed");

    const event: DeckChangeEvent = {
      eventId: `evt-${deckId}-${Date.now()}` as DeckChangeEventId,
      deckId,
      timestamp: currentSnapshot.timestamp,
      changeType: changeTypes[0],
      affectedCardIds: [...changes.added, ...changes.removed],
      trigger: "manual",
      previousSnapshot: snapshotToSummary(previousSnapshot),
      newSnapshot: snapshotToSummary(currentSnapshot),
    };

    // Notify subscribers
    this.notifySubscribers(event);
    this.engine.notifyChange(event);

    return event;
  }

  /**
   * Subscribe to changes for a specific deck
   */
  subscribe(
    deckId: DynamicDeckId,
    callback: DeckChangeCallback,
  ): DeckChangeSubscription {
    const id = `sub-${++this.subscriptionCounter}`;
    const entry = { deckId, callback, active: true };
    this.subscriptions.set(id, entry);

    return {
      unsubscribe: () => {
        entry.active = false;
        this.subscriptions.delete(id);
      },
      get active() {
        return entry.active;
      },
    };
  }

  /**
   * Notify all subscribers for a deck
   */
  private notifySubscribers(event: DeckChangeEvent): void {
    for (const entry of this.subscriptions.values()) {
      if (entry.active && entry.deckId === event.deckId) {
        try {
          entry.callback(event);
        } catch (error) {
          console.error("Error in deck change subscriber:", error);
        }
      }
    }
  }

  /**
   * Initialize snapshot for a deck (call on first load)
   */
  async initializeSnapshot(
    deckId: DynamicDeckId,
    userId: UserId,
  ): Promise<void> {
    const result = await this.engine.evaluate({
      query: deckId,
      userId,
      timestamp: Date.now() as Timestamp,
      includeExplainability: false,
      includeLkgcSignals: false,
    });

    const snapshot = createSnapshot(deckId, result);
    this.snapshots.set(deckId, snapshot);
  }

  /**
   * Clear all pending updates and subscriptions for a deck
   */
  cleanup(deckId: DynamicDeckId): void {
    // Clear pending updates
    const pending = this.pendingUpdates.get(deckId);
    if (pending) {
      clearTimeout(pending);
      this.pendingUpdates.delete(deckId);
    }

    // Clear snapshot
    this.snapshots.delete(deckId);

    // Clear config
    this.configs.delete(deckId);

    // Clear subscriptions
    for (const [id, entry] of this.subscriptions) {
      if (entry.deckId === deckId) {
        entry.active = false;
        this.subscriptions.delete(id);
      }
    }
  }

  /**
   * Cleanup all resources
   */
  dispose(): void {
    // Clear all pending updates
    for (const timeout of this.pendingUpdates.values()) {
      clearTimeout(timeout);
    }
    this.pendingUpdates.clear();

    // Clear all subscriptions
    for (const entry of this.subscriptions.values()) {
      entry.active = false;
    }
    this.subscriptions.clear();

    // Clear snapshots and configs
    this.snapshots.clear();
    this.configs.clear();
  }
}

/**
 * Create a deck auto-updater
 */
export function createDeckAutoUpdater(
  engine: DeckQueryEngine,
): DeckAutoUpdater {
  return new DeckAutoUpdater(engine);
}
