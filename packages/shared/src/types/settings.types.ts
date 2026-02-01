// =============================================================================
// SETTINGS SYSTEM TYPES
// =============================================================================
// Professional-grade settings system with hierarchical scopes, history tracking,
// LKGC (Last Known Good Configuration), and plugin extensibility.
//
// Scope Hierarchy: Global → Profile → Deck → Template → Session → Device
// Each lower scope can override settings from higher scopes.

import type { SchedulerType } from "./scheduler.types";

// Re-export for convenience
export type { SchedulerType };

// =============================================================================
// CORE TYPES & IDENTIFIERS
// =============================================================================

/** Unique identifier for settings entries */
export type SettingsId = string & { readonly __brand: "SettingsId" };

/** Unique identifier for configuration snapshots */
export type ConfigSnapshotId = string & {
  readonly __brand: "ConfigSnapshotId";
};

/** Unique identifier for configuration change entries */
export type ConfigChangeId = string & { readonly __brand: "ConfigChangeId" };

/** Unique identifier for LKGC entries */
export type LKGCId = string & { readonly __brand: "LKGCId" };

/** Unique identifier for plugin settings */
export type PluginSettingsId = string & {
  readonly __brand: "PluginSettingsId";
};

/** Unique identifier for user */
export type UserId = string & { readonly __brand: "UserId" };

/** Unique identifier for deck */
export type DeckId = string & { readonly __brand: "DeckId" };

// =============================================================================
// COMMON TYPE ALIASES
// =============================================================================

/** Review order for cards */
export type ReviewOrder = "due_date" | "random" | "difficulty" | "deck_order";

/** New card position in queue */
export type NewCardPosition = "first" | "last" | "mixed";

/** Leech action when threshold is reached */
export type LeechAction = "tag" | "suspend";

// =============================================================================
// SCOPE SYSTEM
// =============================================================================

/**
 * Settings scope hierarchy (from most general to most specific).
 * Lower scopes override higher scopes when resolving effective settings.
 *
 * Resolution order: Global → Profile → Deck → Template → Session →
 */
export type SettingsScope =
  | "global" // System-wide defaults (set by admins or app defaults)
  | "profile" // User's personal settings (synced across devices)
  | "deck" // Per-deck overrides (useful for language-specific settings)
  | "template" // Per-card-template overrides (e.g., audio cards need different TTS)
  | "session" // Temporary session-specific overrides (reset after session)
  | "device"; // Device-specific settings (not synced, e.g., volume)

/**
 * Context for resolving settings - identifies which scopes are active.
 */
export interface SettingsScopeContext {
  readonly userId?: UserId;
  readonly deckId?: DeckId;
  readonly templateId?: string;
  readonly sessionId?: string;
  readonly deviceId?: string;
}

/**
 * Scope metadata for a settings value.
 */
export interface ScopeMetadata {
  readonly scope: SettingsScope;
  readonly scopeId?: string; // ID within scope (e.g., deckId for 'deck' scope)
  readonly inheritedFrom?: SettingsScope; // If this value was inherited
  readonly isOverridden: boolean; // True if a lower scope overrides this
}

// =============================================================================
// SETTING METADATA & EXPLANATIONS
// =============================================================================

/**
 * Every setting MUST have explanations. This is enforced by the type system.
 */
export interface SettingExplanation {
  /** Short description shown next to the setting (1-2 sentences) */
  readonly summary: string;

  /** Detailed explanation shown in "Learn more" section */
  readonly detailed: string;

  /** Practical impact of this setting on user experience */
  readonly impact: string;

  /** Optional tips or recommendations */
  readonly tips?: readonly string[];

  /** Optional warnings about this setting */
  readonly warnings?: readonly string[];

  /** Related settings that might need adjustment together */
  readonly relatedSettings?: readonly string[];

  /** i18n key for translations (if not provided, use the strings directly) */
  readonly i18nKey?: string;
}

/**
 * Explanation for individual options within a choice/enum setting.
 */
export interface OptionExplanation {
  /** The option value */
  readonly value: string | number | boolean;

  /** Display label for the option */
  readonly label: string;

  /** What this option does */
  readonly description: string;

  /** When to use this option */
  readonly useCase?: string;

  /** Potential drawbacks of this option */
  readonly tradeoffs?: string;
}

/**
 * Complete metadata for a setting, including type information and validation.
 */
export interface SettingMetadata<T = unknown> {
  /** Unique key for this setting (dot-notation path) */
  readonly key: string;

  /** Category this setting belongs to */
  readonly category: SettingsCategory;

  /** Subcategory for grouping within category */
  readonly subcategory?: string;

  /** Human-readable name */
  readonly name: string;

  /** Full explanation (REQUIRED) */
  readonly explanation: SettingExplanation;

  /** Data type */
  readonly type: SettingType;

  /** Default value */
  readonly defaultValue: T;

  /** For enum/choice types, the available options with explanations */
  readonly options?: readonly OptionExplanation[];

  /** For numeric types, validation constraints */
  readonly validation?: SettingValidation;

  /** Which scopes can override this setting */
  readonly allowedScopes: readonly SettingsScope[];

  /** If true, changing this setting requires app restart */
  readonly requiresRestart?: boolean;

  /** If true, this is an AI-related feature (must be opt-in) */
  readonly isAIFeature?: boolean;

  /** If true, this setting affects privacy */
  readonly isPrivacySensitive?: boolean;

  /** Tags for search and filtering */
  readonly tags?: readonly string[];

  /** JSON Schema for plugin-contributed settings */
  readonly jsonSchema?: Record<string, unknown>;
}

export type SettingType =
  | "boolean"
  | "number"
  | "string"
  | "enum"
  | "range" // Numeric with min/max
  | "time" // HH:mm format
  | "color" // Hex color
  | "array" // Array of values
  | "object" // Complex nested object
  | "json"; // Free-form JSON (for plugins)

export interface SettingValidation {
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly pattern?: string; // Regex for strings
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly required?: boolean;
}

// =============================================================================
// SETTINGS CATEGORIES
// =============================================================================

/**
 * Top-level settings categories for organization.
 */
export type SettingsCategory =
  | "study" // Learning goals, scheduling, review behavior
  | "display" // Theme, fonts, card appearance
  | "audio" // Sound, haptics, TTS
  | "notifications" // Reminders, alerts
  | "privacy" // Data sharing, analytics
  | "sync" // Cloud sync, offline mode
  | "accessibility" // A11y features
  | "ai" // AI features (opt-in only)
  | "advanced" // Developer options, experimental
  | "plugins"; // Plugin-contributed settings

/**
 * Category metadata with explanations.
 */
export interface CategoryMetadata {
  readonly id: SettingsCategory;
  readonly name: string;
  readonly icon: string;
  readonly explanation: SettingExplanation;
  readonly order: number;
}

// =============================================================================
// FSRS PARAMETERS
// =============================================================================

export interface FSRSParameters {
  /** Target retention rate (0.7 - 0.99). Higher = more reviews but better retention */
  readonly requestRetention: number;
  /** Maximum interval between reviews in days */
  readonly maximumInterval: number;
  /** FSRS algorithm weights (17 parameters, auto-optimized) */
  readonly w: readonly number[];
}

// =============================================================================
// STUDY SETTINGS
// =============================================================================

export interface StudySettings {
  // === Daily Goals ===
  /** Target cards to review per day (10-500) */
  readonly dailyGoal: number;
  /** New cards to introduce each day (0-100) */
  readonly newCardsPerDay: number;
  /** Maximum reviews allowed per day (50-9999) */
  readonly maxReviewsPerDay: number;

  // === Session Settings ===
  /** Target study session length in minutes (5-120) */
  readonly sessionDuration: number;
  /** Show timer during study sessions */
  readonly enableSessionTimer: boolean;
  /** Show progress bar during study sessions */
  readonly showSessionProgress: boolean;
  /** Remind to take breaks after continuous studying */
  readonly breakReminder: boolean;
  /** Minutes before break reminder (15-60) */
  readonly breakReminderInterval: number;

  // === Review Order & Behavior ===
  /** Order in which cards are presented */
  readonly reviewOrder: ReviewOrder;
  /** Mix new cards with reviews or show separately */
  readonly mixNewAndReview: boolean;
  /** Where to show new cards in the queue */
  readonly newCardPosition: NewCardPosition;
  /** Show answer automatically after delay (0 = disabled) */
  readonly autoShowAnswerDelay: number;

  // === Learning Steps ===
  /** Learning steps in minutes for new cards */
  readonly learningSteps: readonly number[];
  /** Relearning steps in minutes for lapsed cards */
  readonly relearningSteps: readonly number[];
  /** Days until card graduates from learning */
  readonly graduatingInterval: number;
  /** Days for cards rated "Easy" on first review */
  readonly easyInterval: number;

  // === Lapse Handling ===
  /** Percentage of previous interval after lapse (0-100) */
  readonly lapseNewInterval: number;
  /** Minimum interval after lapse in days */
  readonly minimumInterval: number;
  /** Number of lapses before card is marked as leech */
  readonly leechThreshold: number;
  /** What to do when a card becomes a leech */
  readonly leechAction: LeechAction;

  // === Scheduling Algorithm ===
  /** Which spaced repetition algorithm to use */
  readonly schedulerType: SchedulerType;
  /** FSRS-specific parameters */
  readonly fsrsParameters: FSRSParameters;
  /** Add randomness to intervals to avoid clustering */
  readonly enableFuzz: boolean;
  /** Amount of fuzz as percentage (0-25) */
  readonly fuzzFactor: number;
}

// =============================================================================
// DISPLAY SETTINGS
// =============================================================================

export type ThemeMode = "light" | "dark" | "system";
export type FontSize = "small" | "medium" | "large" | "xlarge";
export type FontFamily = "system" | "serif" | "sans-serif" | "monospace";
export type CardAnimation = "flip" | "slide" | "fade" | "none";

export interface DisplaySettings {
  // === Theme ===
  /** Color theme mode */
  readonly theme: ThemeMode;
  /** Accent color for UI elements */
  readonly accentColor: string;
  /** Use true black for dark mode (OLED) */
  readonly trueBlack: boolean;

  // === Typography ===
  /** Base font size */
  readonly fontSize: FontSize;
  /** Font family for card content */
  readonly fontFamily: FontFamily;
  /** Line height multiplier (1.0 - 2.0) */
  readonly lineHeight: number;

  // === Card Display ===
  /** Show tags on cards */
  readonly showCardTags: boolean;
  /** Show deck name on cards */
  readonly showDeckName: boolean;
  /** Show card type indicator */
  readonly showCardType: boolean;
  /** Show next review time on cards */
  readonly showNextReviewTime: boolean;
  /** Show timing predictions on answer buttons */
  readonly showButtonTimes: boolean;
  /** Show remaining card count */
  readonly showRemainingCount: boolean;
  /** Center card content vertically */
  readonly centerCardContent: boolean;

  // === Animations ===
  /** Card flip/transition animation style */
  readonly cardAnimation: CardAnimation;
  /** Enable UI animations */
  readonly animationsEnabled: boolean;
  /** Animation speed multiplier (0.5 - 2.0) */
  readonly animationSpeed: number;
}

// =============================================================================
// AUDIO SETTINGS
// =============================================================================

export type HapticIntensity = "light" | "medium" | "heavy";
export type AutoplaySpeed = "slow" | "normal" | "fast";

export interface AudioSettings {
  // === Sound Effects ===
  /** Enable sound effects */
  readonly soundEnabled: boolean;
  /** Sound effect volume (0-100) */
  readonly soundVolume: number;
  /** Sound for correct answer */
  readonly correctSound: "default" | "subtle" | "celebration" | "none";
  /** Sound for incorrect answer */
  readonly incorrectSound: "default" | "subtle" | "none";

  // === Haptic Feedback ===
  /** Enable haptic feedback */
  readonly hapticsEnabled: boolean;
  /** Haptic feedback intensity */
  readonly hapticIntensity: HapticIntensity;

  // === Text-to-Speech ===
  /** Enable text-to-speech */
  readonly ttsEnabled: boolean;
  /** Auto-play TTS when card is shown */
  readonly ttsAutoplay: boolean;
  /** TTS speaking rate (0.5 - 2.0) */
  readonly ttsSpeed: number;
  /** TTS pitch (0.5 - 2.0) */
  readonly ttsPitch: number;
  /** Preferred TTS voice identifier */
  readonly ttsVoice: string;
  /** Read front, back, or both */
  readonly ttsReadSide: "front" | "back" | "both";

  // === Audio Cards ===
  /** Auto-play audio on audio cards */
  readonly autoplayAudio: boolean;
  /** Auto-play speed for audio content */
  readonly autoplaySpeed: AutoplaySpeed;
  /** Pause between auto-played audio segments (ms) */
  readonly autoplayPause: number;
}

// =============================================================================
// NOTIFICATION SETTINGS
// =============================================================================

export type EmailDigestFrequency = "daily" | "weekly" | "monthly" | "never";

export interface NotificationSettings {
  // === Push Notifications ===
  /** Enable push notifications */
  readonly pushEnabled: boolean;
  /** Allow notifications to make sounds */
  readonly notificationSound: boolean;
  /** Allow notification badges on app icon */
  readonly notificationBadge: boolean;

  // === Daily Reminder ===
  /** Enable daily study reminder */
  readonly dailyReminderEnabled: boolean;
  /** Time for daily reminder (HH:mm) */
  readonly dailyReminderTime: string;
  /** Skip reminder if already studied today */
  readonly skipIfStudied: boolean;

  // === Streak Notifications ===
  /** Enable streak reminder */
  readonly streakReminderEnabled: boolean;
  /** Time for streak reminder (HH:mm) */
  readonly streakReminderTime: string;
  /** Hours before midnight to send streak warning */
  readonly streakWarningHours: number;

  // === Achievement Notifications ===
  /** Notify when achievements are unlocked */
  readonly achievementNotifications: boolean;
  /** Notify on level up */
  readonly levelUpNotifications: boolean;

  // === Weekly Summary ===
  /** Enable weekly summary notification */
  readonly weeklySummaryEnabled: boolean;
  /** Day of week for summary (0=Sunday, 6=Saturday) */
  readonly weeklySummaryDay: number;

  // === Email Notifications ===
  /** Enable email notifications */
  readonly emailEnabled: boolean;
  /** Frequency of email digest */
  readonly emailDigestFrequency: EmailDigestFrequency;
  /** Include learning stats in emails */
  readonly emailIncludeStats: boolean;
}

// =============================================================================
// PRIVACY SETTINGS
// =============================================================================

export interface PrivacySettings {
  // === Analytics ===
  /** Allow anonymous usage analytics */
  readonly analyticsEnabled: boolean;
  /** Allow crash reporting */
  readonly crashReportingEnabled: boolean;
  /** Allow performance monitoring */
  readonly performanceMonitoring: boolean;

  // === Data Sharing ===
  /** Share study stats for leaderboards */
  readonly shareStudyStats: boolean;
  /** Appear on public leaderboards */
  readonly showOnLeaderboard: boolean;
  /** Share progress with friends */
  readonly shareProgress: boolean;

  // === Profile Visibility ===
  /** Make profile publicly visible */
  readonly profilePublic: boolean;
  /** Show streak on profile */
  readonly showStreak: boolean;
  /** Show level on profile */
  readonly showLevel: boolean;
  /** Show achievements on profile */
  readonly showAchievements: boolean;

  // === Data Retention ===
  /** Days to keep detailed review history (30-365) */
  readonly reviewHistoryRetention: number;
  /** Days to keep session logs (7-90) */
  readonly sessionLogRetention: number;
}

// =============================================================================
// SYNC SETTINGS
// =============================================================================

export type SyncFrequency = "realtime" | "hourly" | "daily" | "manual";
export type ConflictResolution = "ask" | "server" | "local" | "newest";

export interface SyncSettings {
  // === Auto Sync ===
  /** Enable automatic sync */
  readonly autoSyncEnabled: boolean;
  /** Only sync on Wi-Fi */
  readonly syncOnWifiOnly: boolean;
  /** How often to sync */
  readonly syncFrequency: SyncFrequency;
  /** Sync immediately after each review */
  readonly syncAfterReview: boolean;

  // === Conflict Resolution ===
  /**
   * How to resolve sync conflicts.
   * HIGHLY RECOMMENDED: 'ask' - prompts you for each conflict
   * When prompting isn't possible, falls back to scope-appropriate resolution.
   */
  readonly conflictResolution: ConflictResolution;
  /** Show notification when conflicts are auto-resolved */
  readonly notifyOnConflictResolution: boolean;

  // === Offline Mode ===
  /** Enable offline mode capabilities */
  readonly offlineModeEnabled: boolean;
  /** Download media for offline use */
  readonly downloadMediaForOffline: boolean;
  /** Maximum storage for offline content (MB) */
  readonly maxOfflineStorage: number;
  /** Preload cards for offline (number of days ahead) */
  readonly offlinePreloadDays: number;

  // === Backup ===
  /** Enable automatic backups */
  readonly autoBackupEnabled: boolean;
  /** Days between automatic backups */
  readonly autoBackupInterval: number;
  /** Number of backups to keep */
  readonly backupsToKeep: number;
}

// =============================================================================
// ACCESSIBILITY SETTINGS
// =============================================================================

export interface AccessibilitySettings {
  // === Visual ===
  /** Enable high contrast mode */
  readonly highContrast: boolean;
  /** Use larger text throughout the app */
  readonly largeText: boolean;
  /** Use bold text for better readability */
  readonly boldText: boolean;
  /** Increase spacing between elements */
  readonly increasedSpacing: boolean;

  // === Motion ===
  /** Reduce motion and animations */
  readonly reduceMotion: boolean;
  /** Reduce transparency effects */
  readonly reduceTransparency: boolean;
  /** Disable auto-playing animations */
  readonly disableAutoplay: boolean;

  // === Interaction ===
  /** Tap anywhere on card to flip */
  readonly tapToFlip: boolean;
  /** Swipe to rate cards */
  readonly swipeToRate: boolean;
  /** Long press delay in ms (200-1000) */
  readonly longPressDelay: number;
  /** Larger touch targets */
  readonly largeTouchTargets: boolean;

  // === Screen Reader ===
  /** Optimize for screen readers */
  readonly screenReaderOptimized: boolean;
  /** Announce card content automatically */
  readonly announceCardContent: boolean;
  /** Announce button actions */
  readonly announceActions: boolean;
  /** Custom screen reader hints */
  readonly customHints: boolean;
}

// =============================================================================
// AI SETTINGS (Opt-in Only)
// =============================================================================

export interface AISettings {
  // === AI Features Master Switch ===
  /** Enable AI-powered features (opt-in required) */
  readonly aiEnabled: boolean;
  /** Acknowledged AI terms and understood implications */
  readonly aiTermsAccepted: boolean;

  // === Card Generation ===
  /** Allow AI to suggest new cards */
  readonly aiCardSuggestions: boolean;
  /** Allow AI to improve card content */
  readonly aiCardImprovement: boolean;
  /** Require approval before AI changes cards */
  readonly requireApprovalForAIChanges: boolean;

  // === Study Optimization ===
  /** Allow AI to optimize study schedule */
  readonly aiScheduleOptimization: boolean;
  /** Allow AI to adjust difficulty estimates */
  readonly aiDifficultyAdjustment: boolean;
  /** Allow AI to suggest study strategies */
  readonly aiStudyStrategies: boolean;

  // === Content Analysis ===
  /** Allow AI to analyze learning patterns */
  readonly aiPatternAnalysis: boolean;
  /** Allow AI to identify knowledge gaps */
  readonly aiGapIdentification: boolean;

  // === Data & Privacy ===
  /** Send card content to AI service */
  readonly sendContentToAI: boolean;
  /** Send study statistics to AI service */
  readonly sendStatsToAI: boolean;
  /** Store AI analysis results */
  readonly storeAIResults: boolean;
}

// =============================================================================
// ADVANCED SETTINGS
// =============================================================================

export type ExportFormat = "json" | "csv" | "anki";

export interface AdvancedSettings {
  // === Developer Options ===
  /** Enable debug mode (shows extra info) */
  readonly debugMode: boolean;
  /** Show card IDs in UI */
  readonly showCardIds: boolean;
  /** Log all reviews to console */
  readonly logReviews: boolean;
  /** Show performance metrics */
  readonly showPerformanceMetrics: boolean;

  // === Data Management ===
  /** Cache size limit in MB */
  readonly cacheSize: number;
  /** Clear cache on logout */
  readonly clearCacheOnLogout: boolean;
  /** Compact database on startup */
  readonly compactDatabaseOnStartup: boolean;

  // === Experimental Features ===
  /** Enable experimental features */
  readonly experimentalFeatures: boolean;
  /** Enable beta features */
  readonly betaFeatures: boolean;

  // === Import/Export ===
  /** Default export format */
  readonly defaultExportFormat: ExportFormat;
  /** Include media in exports */
  readonly includeMediaInExport: boolean;
  /** Include review history in exports */
  readonly includeHistoryInExport: boolean;

  // === Custom API ===
  /** Use custom API endpoint */
  readonly useCustomEndpoint: boolean;
  /** Custom API endpoint URL */
  readonly customEndpointUrl: string;
}

// =============================================================================
// PLUGIN SETTINGS
// =============================================================================

/**
 * Settings contributed by a plugin.
 */
export interface PluginSettingsSection {
  /** Plugin identifier */
  readonly pluginId: string;
  /** Plugin display name */
  readonly pluginName: string;
  /** Plugin settings schema (JSON Schema format) */
  readonly schema: Record<string, unknown>;
  /** Current values */
  readonly values: Record<string, unknown>;
  /** Settings metadata with explanations */
  readonly metadata: readonly SettingMetadata[];
}

/**
 * Plugin injection into core settings.
 */
export interface PluginSettingsInjection {
  /** Plugin identifier */
  readonly pluginId: string;
  /** Target setting key to extend */
  readonly targetKey: string;
  /** Additional options to add */
  readonly options?: readonly OptionExplanation[];
  /** Additional validation */
  readonly validation?: SettingValidation;
}

// =============================================================================
// COMPLETE SETTINGS STATE
// =============================================================================

/**
 * Complete settings state with all categories.
 */
export interface SettingsState {
  readonly study: StudySettings;
  readonly display: DisplaySettings;
  readonly audio: AudioSettings;
  readonly notifications: NotificationSettings;
  readonly privacy: PrivacySettings;
  readonly sync: SyncSettings;
  readonly accessibility: AccessibilitySettings;
  readonly ai: AISettings;
  readonly advanced: AdvancedSettings;
  readonly plugins: Record<string, PluginSettingsSection>;
}

/**
 * Settings at a specific scope.
 */
export interface ScopedSettings {
  readonly scope: SettingsScope;
  readonly scopeId?: string;
  readonly settings: Partial<SettingsState>;
  readonly updatedAt: string;
  readonly updatedBy: "user" | "plugin" | "system" | "sync";
}

// =============================================================================
// CONFIGURATION HISTORY
// =============================================================================

/**
 * Source of a configuration change.
 */
export type ConfigChangeSource =
  | "user" // User manually changed setting
  | "plugin" // Plugin changed setting
  | "system" // System/app changed setting
  | "sync" // Change came from sync
  | "import" // Change from import
  | "rollback"; // Change from rollback

/**
 * Single configuration change entry.
 */
export interface ConfigChange {
  readonly id: ConfigChangeId;
  readonly timestamp: string;
  readonly scope: SettingsScope;
  readonly scopeId?: string;
  readonly source: ConfigChangeSource;
  readonly sourceId?: string; // Plugin ID, user ID, etc.

  /** The setting key that changed (dot notation) */
  readonly settingKey: string;
  /** Category for grouping */
  readonly category: SettingsCategory;

  /** Value before the change */
  readonly previousValue: unknown;
  /** Value after the change */
  readonly newValue: unknown;

  /** Human-readable description of the change */
  readonly description: string;
  /** Human-readable explanation of the impact */
  readonly impactExplanation: string;
}

/**
 * Checkpoint - a named point in configuration history.
 */
export interface ConfigCheckpoint {
  readonly id: ConfigSnapshotId;
  readonly name: string;
  readonly description?: string;
  readonly timestamp: string;
  readonly createdBy: ConfigChangeSource;

  /** Full snapshot of settings at this point */
  readonly snapshot: SettingsState;

  /** Summary of changes since previous checkpoint */
  readonly changesSummary: CheckpointChangesSummary;

  /** If this is a LKGC-tagged checkpoint */
  readonly isLKGC: boolean;
  readonly lkgcTaggedAt?: string;
  readonly lkgcReason?: string;
}

/**
 * Summary of changes in a checkpoint, grouped by category.
 */
export interface CheckpointChangesSummary {
  readonly totalChanges: number;
  readonly byCategory: Record<SettingsCategory, CategoryChangeSummary>;
  readonly changeIds: readonly ConfigChangeId[];
}

export interface CategoryChangeSummary {
  readonly count: number;
  readonly settings: readonly string[];
}

// =============================================================================
// LAST KNOWN GOOD CONFIGURATION (LKGC)
// =============================================================================

/**
 * Criteria for automatic LKGC tagging suggestion.
 */
export interface LKGCAutoCriteria {
  /** Minimum days since last config change */
  readonly minStableDays: number;
  /** Minimum successful study sessions */
  readonly minSuccessfulSessions: number;
  /** Minimum average accuracy in recent sessions (0-1) */
  readonly minAverageAccuracy: number;
  /** Minimum cards reviewed */
  readonly minCardsReviewed: number;
  /** No reported issues in this period */
  readonly noReportedIssues: boolean;
}

/**
 * LKGC entry with full metadata.
 */
export interface LKGCEntry {
  readonly id: LKGCId;
  readonly checkpointId: ConfigSnapshotId;
  readonly taggedAt: string;
  readonly taggedBy: "user" | "system";

  /** Why this was tagged as LKGC */
  readonly reason: string;

  /** Criteria that were met (for system-tagged) */
  readonly criteriaMet?: LKGCAutoCriteria;

  /** User notes about this configuration */
  readonly notes?: string;

  /** Performance metrics at time of tagging */
  readonly performanceSnapshot: LKGCPerformanceSnapshot;
}

export interface LKGCPerformanceSnapshot {
  readonly averageAccuracy: number;
  readonly averageRetention: number;
  readonly cardsReviewedPerDay: number;
  readonly streakDays: number;
  readonly sessionCompletionRate: number;
}

/**
 * LKGC suggestion shown to user.
 */
export interface LKGCSuggestion {
  readonly checkpointId: ConfigSnapshotId;
  readonly suggestedAt: string;
  readonly reason: string;
  readonly criteriaMet: LKGCAutoCriteria;
  readonly performanceSnapshot: LKGCPerformanceSnapshot;

  /** User-friendly explanation of what this means */
  readonly explanation: string;
  /** What the user should consider before accepting */
  readonly considerations: readonly string[];
}

// =============================================================================
// EFFECTIVE SETTINGS RESOLUTION
// =============================================================================

/**
 * Result of resolving effective settings.
 */
export interface EffectiveSettings {
  /** The resolved settings values */
  readonly settings: SettingsState;

  /** Metadata about where each setting came from */
  readonly sources: Record<string, ScopeMetadata>;

  /** Resolution context that was used */
  readonly context: SettingsScopeContext;

  /** Timestamp of resolution */
  readonly resolvedAt: string;
}

/**
 * Conflict during sync.
 */
export interface SettingsConflict {
  readonly settingKey: string;
  readonly localValue: unknown;
  readonly remoteValue: unknown;
  readonly localTimestamp: string;
  readonly remoteTimestamp: string;
  readonly suggestedResolution: "local" | "remote";
  readonly explanation: string;
}

// =============================================================================
// SETTINGS ACTIONS
// =============================================================================

/**
 * Actions available on the settings system.
 */
export interface SettingsActions {
  // === Category Updates ===
  updateStudySettings(
    settings: Partial<StudySettings>,
    source?: ConfigChangeSource,
  ): void;
  updateDisplaySettings(
    settings: Partial<DisplaySettings>,
    source?: ConfigChangeSource,
  ): void;
  updateAudioSettings(
    settings: Partial<AudioSettings>,
    source?: ConfigChangeSource,
  ): void;
  updateNotificationSettings(
    settings: Partial<NotificationSettings>,
    source?: ConfigChangeSource,
  ): void;
  updatePrivacySettings(
    settings: Partial<PrivacySettings>,
    source?: ConfigChangeSource,
  ): void;
  updateSyncSettings(
    settings: Partial<SyncSettings>,
    source?: ConfigChangeSource,
  ): void;
  updateAccessibilitySettings(
    settings: Partial<AccessibilitySettings>,
    source?: ConfigChangeSource,
  ): void;
  updateAISettings(
    settings: Partial<AISettings>,
    source?: ConfigChangeSource,
  ): void;
  updateAdvancedSettings(
    settings: Partial<AdvancedSettings>,
    source?: ConfigChangeSource,
  ): void;

  // === Scope Management ===
  setScopeOverride(
    scope: SettingsScope,
    scopeId: string,
    settings: Partial<SettingsState>,
  ): void;
  clearScopeOverride(scope: SettingsScope, scopeId: string): void;
  getEffectiveSettings(context: SettingsScopeContext): EffectiveSettings;

  // === History ===
  getChangeHistory(options?: {
    limit?: number;
    category?: SettingsCategory;
  }): readonly ConfigChange[];
  getCheckpoints(): readonly ConfigCheckpoint[];
  createCheckpoint(name: string, description?: string): ConfigCheckpoint;
  rollbackToCheckpoint(checkpointId: ConfigSnapshotId): void;

  // === LKGC ===
  getLKGC(): LKGCEntry | null;
  tagAsLKGC(
    checkpointId: ConfigSnapshotId,
    reason: string,
    notes?: string,
  ): LKGCEntry;
  rollbackToLKGC(): void;
  getLKGCSuggestion(): LKGCSuggestion | null;
  dismissLKGCSuggestion(): void;

  // === Reset ===
  resetCategory(category: SettingsCategory): void;
  resetToDefaults(): void;

  // === Import/Export ===
  exportSettings(): string;
  importSettings(json: string): boolean;

  // === Plugin Settings ===
  registerPluginSettings(section: PluginSettingsSection): void;
  unregisterPluginSettings(pluginId: string): void;
  updatePluginSettings(pluginId: string, values: Record<string, unknown>): void;
}

// =============================================================================
// DEFAULTS
// =============================================================================

export const DEFAULT_FSRS_PARAMETERS: FSRSParameters = {
  requestRetention: 0.9,
  maximumInterval: 36500,
  w: [
    0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05,
    0.34, 1.26, 0.29, 2.61,
  ],
};

export const DEFAULT_LKGC_CRITERIA: LKGCAutoCriteria = {
  minStableDays: 7,
  minSuccessfulSessions: 10,
  minAverageAccuracy: 0.8,
  minCardsReviewed: 100,
  noReportedIssues: true,
};
