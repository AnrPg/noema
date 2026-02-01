// =============================================================================
// SETTINGS ENGINE
// =============================================================================
// Core logic for settings resolution, history tracking, and LKGC management.
// This is the "brain" of the settings system, used by both mobile and API.

import type {
  SettingsScope,
  SettingsScopeContext,
  ScopeMetadata,
  SettingsState,
  ScopedSettings,
  EffectiveSettings,
  ConfigChange,
  ConfigChangeId,
  ConfigChangeSource,
  ConfigCheckpoint,
  ConfigSnapshotId,
  CheckpointChangesSummary,
  CategoryChangeSummary,
  SettingsCategory,
  LKGCEntry,
  LKGCId,
  LKGCAutoCriteria,
  LKGCSuggestion,
  LKGCPerformanceSnapshot,
  StudySettings,
  DisplaySettings,
  AudioSettings,
  NotificationSettings,
  PrivacySettings,
  SyncSettings,
  AccessibilitySettings,
  AISettings,
  AdvancedSettings,
} from "../types/settings.types";

import type { InstalledPlugin } from "../types/plugin.types";

import {
  DEFAULT_LKGC_CRITERIA,
  DEFAULT_FSRS_PARAMETERS,
} from "../types/settings.types";

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Generate a unique ID with proper branded type.
 */
export function generateId<T extends string>(prefix: string): T {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `${prefix}_${timestamp}_${random}` as T;
}

/**
 * Deep merge two objects, with source values overriding target values.
 */
export function deepMerge<T>(target: T, source: Partial<T>): T {
  if (typeof target !== "object" || target === null) {
    return source as T;
  }

  const result = { ...target } as T;

  for (const key in source) {
    const sourceValue = source[key as keyof T];
    const targetValue = (target as Record<string, unknown>)[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === "object" &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === "object" &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      // Recursively merge objects
      (result as Record<string, unknown>)[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>,
      );
    } else if (sourceValue !== undefined) {
      // Direct assignment for primitives, arrays, and null
      (result as Record<string, unknown>)[key] = sourceValue;
    }
  }

  return result;
}

/**
 * Get a value from an object using dot notation path.
 */
export function getValueByPath(obj: unknown, path: string): unknown {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

/**
 * Set a value in an object using dot notation path.
 */
export function setValueByPath<T extends Record<string, unknown>>(
  obj: T,
  path: string,
  value: unknown,
): T {
  const keys = path.split(".");
  const result = { ...obj };

  let current: Record<string, unknown> = result;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (typeof current[key] !== "object" || current[key] === null) {
      current[key] = {};
    } else {
      current[key] = { ...(current[key] as Record<string, unknown>) };
    }
    current = current[key] as Record<string, unknown>;
  }

  current[keys[keys.length - 1]] = value;
  return result;
}

/**
 * Extract category from a setting key (e.g., "study.dailyGoal" → "study").
 */
export function getCategoryFromKey(key: string): SettingsCategory {
  const category = key.split(".")[0];
  return category as SettingsCategory;
}

// =============================================================================
// SCOPE RESOLUTION
// =============================================================================

/**
 * Scope priority order (higher index = higher priority/more specific).
 */
export const SCOPE_PRIORITY: readonly SettingsScope[] = [
  "global",
  "profile",
  "deck",
  "template",
  "session",
  "device",
] as const;

/**
 * Get the priority of a scope (higher = more specific).
 */
export function getScopePriority(scope: SettingsScope): number {
  return SCOPE_PRIORITY.indexOf(scope);
}

/**
 * Check if scopeA can override scopeB (A must be same or more specific).
 */
export function canOverride(
  scopeA: SettingsScope,
  scopeB: SettingsScope,
): boolean {
  return getScopePriority(scopeA) >= getScopePriority(scopeB);
}

/**
 * Resolve effective settings by merging all applicable scopes.
 *
 * Algorithm:
 * 1. Start with global defaults
 * 2. Apply each scope in priority order (profile, deck, template, session, device)
 * 3. Track which scope each setting came from
 * 4. Return with caching info
 */
export function resolveEffectiveSettings(
  defaults: SettingsState,
  scopedSettings: readonly ScopedSettings[],
  context: SettingsScopeContext,
  plugins: readonly InstalledPlugin[] = [],
): EffectiveSettings {
  // Sort scoped settings by priority
  const sortedSettings = [...scopedSettings].sort(
    (a, b) => getScopePriority(a.scope) - getScopePriority(b.scope),
  );

  // Filter to only applicable scopes based on context
  const applicableSettings = sortedSettings.filter((s) => {
    switch (s.scope) {
      case "global":
        return true;
      case "profile":
        return !!context.userId;
      case "deck":
        return !!context.deckId && s.scopeId === context.deckId;
      case "template":
        return !!context.templateId && s.scopeId === context.templateId;
      case "session":
        return !!context.sessionId && s.scopeId === context.sessionId;
      case "device":
        return !!context.deviceId && s.scopeId === context.deviceId;
      default:
        return false;
    }
  });

  // Start with global defaults
  let effectiveSettings: SettingsState = { ...defaults };

  // Track sources for each setting
  const sources: Record<string, ScopeMetadata> = {};
  initializeSourcesFromObject(sources, defaults, "global");

  // Merge applicable scoped settings
  for (const scoped of applicableSettings) {
    effectiveSettings = deepMerge(
      effectiveSettings,
      scoped.settings as Partial<SettingsState>,
    );
    updateSourcesFromObject(
      sources,
      scoped.settings,
      scoped.scope,
      scoped.scopeId,
    );
  }

  // Merge plugin settings
  for (const plugin of plugins) {
    if (plugin.isEnabled && plugin.manifest.configSchema) {
      const pluginDefaults = Object.fromEntries(
        Object.entries(plugin.manifest.configSchema.properties || {}).map(
          ([key, prop]) => [key, (prop as { default?: unknown }).default],
        ),
      );
      effectiveSettings = {
        ...effectiveSettings,
        plugins: {
          ...effectiveSettings.plugins,
          [plugin.manifest.id]: {
            pluginId: plugin.manifest.id,
            pluginName: plugin.manifest.name,
            schema: plugin.manifest.configSchema as unknown as Record<
              string,
              unknown
            >,
            values: { ...pluginDefaults, ...plugin.config },
            metadata: [],
          },
        },
      };
    }
  }

  return {
    settings: effectiveSettings,
    sources,
    context,
    resolvedAt: new Date().toISOString(),
  };
}

/**
 * Initialize sources map from an object (recursive).
 */
function initializeSourcesFromObject(
  sources: Record<string, ScopeMetadata>,
  obj: unknown,
  scope: SettingsScope,
  prefix: string = "",
): void {
  if (typeof obj !== "object" || obj === null) {
    return;
  }

  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = (obj as Record<string, unknown>)[key];

    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      initializeSourcesFromObject(sources, value, scope, fullKey);
    } else {
      sources[fullKey] = {
        scope,
        isOverridden: false,
      };
    }
  }
}

/**
 * Update sources map when applying an override.
 */
function updateSourcesFromObject(
  sources: Record<string, ScopeMetadata>,
  obj: unknown,
  scope: SettingsScope,
  scopeId?: string,
  prefix: string = "",
): void {
  if (typeof obj !== "object" || obj === null) {
    return;
  }

  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = (obj as Record<string, unknown>)[key];

    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      updateSourcesFromObject(sources, value, scope, scopeId, fullKey);
    } else if (value !== undefined) {
      // Mark previous scope as overridden
      if (sources[fullKey]) {
        sources[fullKey] = {
          ...sources[fullKey],
          isOverridden: true,
        };
      }

      // Record new source
      sources[fullKey] = {
        scope,
        scopeId,
        inheritedFrom: sources[fullKey]?.scope,
        isOverridden: false,
      };
    }
  }
}

// =============================================================================
// CONFIGURATION HISTORY
// =============================================================================

// Configuration history log (in-memory, should be persisted externally)
const configHistory: ConfigChange[] = [];

/**
 * Create a human-readable description of a setting change.
 */
function createChangeDescription(
  settingKey: string,
  previousValue: unknown,
  newValue: unknown,
): string {
  const settingName = settingKey.split(".").pop() || settingKey;
  const humanName = settingName
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();

  if (typeof newValue === "boolean") {
    return newValue ? `Enabled ${humanName}` : `Disabled ${humanName}`;
  }

  return `Changed ${humanName} from "${previousValue}" to "${newValue}"`;
}

/**
 * Create an impact explanation for a setting change.
 */
function createImpactExplanation(
  settingKey: string,
  _previousValue: unknown,
  newValue: unknown,
): string {
  const category = getCategoryFromKey(settingKey);

  // Category-specific impact explanations
  const impacts: Record<SettingsCategory, string> = {
    study: "This may affect your daily study workload and review scheduling.",
    display: "This changes how the app looks and displays information.",
    audio: "This affects sound and haptic feedback during study.",
    notifications: "This changes when and how you receive reminders.",
    privacy: "This affects what data is collected and shared.",
    sync: "This affects how your data is synchronized across devices.",
    accessibility: "This helps make the app more accessible for your needs.",
    ai: "This enables or modifies AI-powered features.",
    advanced: "This is an advanced setting that may affect app behavior.",
    plugins: "This affects plugin behavior.",
  };

  let impact = impacts[category] || "This setting has been changed.";

  // Add specific impact info for certain settings
  if (settingKey === "study.newCardsPerDay") {
    const count = newValue as number;
    if (count > 30) {
      impact +=
        " Note: High new card counts can lead to large review backlogs.";
    }
  }

  return impact;
}

/**
 * Create a configuration change entry.
 */
export function createConfigChange(
  settingKey: string,
  previousValue: unknown,
  newValue: unknown,
  scope: SettingsScope,
  source: ConfigChangeSource,
  scopeId?: string,
  sourceId?: string,
): ConfigChange {
  return {
    id: generateId<ConfigChangeId>("change"),
    timestamp: new Date().toISOString(),
    scope,
    scopeId,
    source,
    sourceId,
    settingKey,
    category: getCategoryFromKey(settingKey),
    previousValue,
    newValue,
    description: createChangeDescription(settingKey, previousValue, newValue),
    impactExplanation: createImpactExplanation(
      settingKey,
      previousValue,
      newValue,
    ),
  };
}

/**
 * Log a configuration change.
 */
export function logConfigChange(change: ConfigChange): void {
  configHistory.push(change);
}

/**
 * Retrieve the configuration history.
 */
export function getConfigHistory(options?: {
  limit?: number;
  category?: SettingsCategory;
}): ConfigChange[] {
  let history = [...configHistory];

  if (options?.category) {
    history = history.filter((c) => c.category === options.category);
  }

  history.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  if (options?.limit) {
    history = history.slice(0, options.limit);
  }

  return history;
}

/**
 * Retrieve detailed change information for a specific change ID.
 */
export function getChangeDetails(
  changeId: ConfigChangeId,
): ConfigChange | undefined {
  return configHistory.find((change) => change.id === changeId);
}

/**
 * Group changes by category for better organization.
 */
export function groupChangesByCategory(
  changes: readonly ConfigChange[],
): Record<SettingsCategory, ConfigChange[]> {
  const categories: SettingsCategory[] = [
    "study",
    "display",
    "audio",
    "notifications",
    "privacy",
    "sync",
    "accessibility",
    "ai",
    "advanced",
    "plugins",
  ];

  const grouped: Record<SettingsCategory, ConfigChange[]> = {} as Record<
    SettingsCategory,
    ConfigChange[]
  >;

  for (const category of categories) {
    grouped[category] = [];
  }

  for (const change of changes) {
    const category = change.category;
    if (grouped[category]) {
      grouped[category].push(change);
    }
  }

  return grouped;
}

/**
 * Create a checkpoint summary for a batch of changes.
 */
export function createCheckpointSummary(
  changes: readonly ConfigChange[],
): CheckpointChangesSummary {
  const grouped = groupChangesByCategory(changes);
  const byCategory: Record<SettingsCategory, CategoryChangeSummary> =
    {} as Record<SettingsCategory, CategoryChangeSummary>;

  for (const [category, categoryChanges] of Object.entries(grouped)) {
    byCategory[category as SettingsCategory] = {
      count: categoryChanges.length,
      settings: categoryChanges.map((c) => c.settingKey),
    };
  }

  return {
    totalChanges: changes.length,
    byCategory,
    changeIds: changes.map((c) => c.id),
  };
}

/**
 * Create a configuration checkpoint.
 */
export function createConfigCheckpoint(
  name: string,
  snapshot: SettingsState,
  changes: readonly ConfigChange[],
  createdBy: ConfigChangeSource,
  description?: string,
): ConfigCheckpoint {
  return {
    id: generateId<ConfigSnapshotId>("checkpoint"),
    name,
    description,
    timestamp: new Date().toISOString(),
    createdBy,
    snapshot,
    changesSummary: createCheckpointSummary(changes),
    isLKGC: false,
  };
}

// =============================================================================
// LAST KNOWN GOOD CONFIGURATION (LKGC)
// =============================================================================

// LKGC storage (in-memory, should be persisted externally)
let currentLKGC: LKGCEntry | null = null;

/**
 * Check if LKGC criteria are met.
 */
export function checkLKGCCriteria(
  criteria: LKGCAutoCriteria,
  performance: LKGCPerformanceSnapshot,
  daysSinceLastChange: number,
  hasReportedIssues: boolean,
): { met: boolean; reasons: string[]; missing: string[] } {
  const reasons: string[] = [];
  const missing: string[] = [];

  if (daysSinceLastChange >= criteria.minStableDays) {
    reasons.push(
      `Configuration has been stable for ${daysSinceLastChange} days (required: ${criteria.minStableDays})`,
    );
  } else {
    missing.push(
      `Configuration needs ${criteria.minStableDays - daysSinceLastChange} more days of stability`,
    );
  }

  if (performance.sessionCompletionRate >= 0.8) {
    reasons.push(
      `Session completion rate is ${Math.round(performance.sessionCompletionRate * 100)}%`,
    );
  } else {
    missing.push(`Session completion rate is below 80%`);
  }

  if (performance.averageAccuracy >= criteria.minAverageAccuracy) {
    reasons.push(
      `Average accuracy is ${Math.round(performance.averageAccuracy * 100)}% (required: ${Math.round(criteria.minAverageAccuracy * 100)}%)`,
    );
  } else {
    missing.push(
      `Average accuracy needs to be ${Math.round(criteria.minAverageAccuracy * 100)}% or higher`,
    );
  }

  if (criteria.noReportedIssues && !hasReportedIssues) {
    reasons.push("No issues reported with current configuration");
  } else if (hasReportedIssues) {
    missing.push("There are reported issues with current configuration");
  }

  const met = missing.length === 0;

  return { met, reasons, missing };
}

/**
 * Create an LKGC suggestion based on criteria.
 */
export function createLKGCSuggestion(
  checkpointId: ConfigSnapshotId,
  criteria: LKGCAutoCriteria,
  performance: LKGCPerformanceSnapshot,
  daysSinceLastChange: number,
  hasReportedIssues: boolean,
): LKGCSuggestion {
  const criteriaCheck = checkLKGCCriteria(
    criteria,
    performance,
    daysSinceLastChange,
    hasReportedIssues,
  );

  return {
    checkpointId,
    suggestedAt: new Date().toISOString(),
    reason: criteriaCheck.met
      ? "Your configuration has been stable and performing well."
      : "Configuration is close to meeting LKGC criteria.",
    criteriaMet: criteria,
    performanceSnapshot: performance,
    explanation: criteriaCheck.met
      ? 'Tagging this configuration as "Last Known Good" means you can easily roll back to it if future changes cause problems.'
      : "Almost there! " + criteriaCheck.missing.join(" "),
    considerations: [
      "This will become your safety checkpoint for configuration rollback.",
      "You can always tag a new LKGC later if your configuration improves.",
      "The previous LKGC (if any) will be archived but can still be accessed.",
    ],
  };
}

/**
 * Create an LKGC entry.
 */
export function createLKGCEntry(
  checkpointId: ConfigSnapshotId,
  reason: string,
  taggedBy: "user" | "system",
  performance: LKGCPerformanceSnapshot,
  criteria?: LKGCAutoCriteria,
  notes?: string,
): LKGCEntry {
  return {
    id: generateId<LKGCId>("lkgc"),
    checkpointId,
    taggedAt: new Date().toISOString(),
    taggedBy,
    reason,
    criteriaMet: criteria,
    notes,
    performanceSnapshot: performance,
  };
}

/**
 * Tag the current configuration as the Last Known Good Configuration (LKGC).
 */
export function tagLKGC(entry: LKGCEntry): void {
  currentLKGC = entry;
}

/**
 * Retrieve the Last Known Good Configuration (LKGC).
 */
export function getLKGC(): LKGCEntry | null {
  return currentLKGC;
}

/**
 * Rollback to the Last Known Good Configuration (LKGC).
 * Returns the checkpoint ID to rollback to.
 */
export function rollbackToLKGC(): ConfigSnapshotId | null {
  if (!currentLKGC) {
    return null;
  }
  return currentLKGC.checkpointId;
}

// =============================================================================
// CONFLICT RESOLUTION
// =============================================================================

/**
 * Default conflict resolution based on scope.
 * - Global/Profile: Server wins (these are user settings, server is source of truth)
 * - Device: Device wins (device-specific settings shouldn't sync)
 * - Others: Newest wins
 */
export function getDefaultResolutionForScope(
  scope: SettingsScope,
): "server" | "local" | "newest" {
  switch (scope) {
    case "global":
    case "profile":
      return "server";
    case "device":
      return "local";
    default:
      return "newest";
  }
}

/**
 * Resolve a setting conflict.
 */
export function resolveConflict(
  localValue: unknown,
  remoteValue: unknown,
  localTimestamp: string,
  remoteTimestamp: string,
  resolution: "ask" | "server" | "local" | "newest",
  _scope: SettingsScope,
): { value: unknown; source: "local" | "remote" } | "ask" {
  // 'ask' means we need user input
  if (resolution === "ask") {
    return "ask";
  }

  // Direct resolution
  if (resolution === "server") {
    return { value: remoteValue, source: "remote" };
  }

  if (resolution === "local") {
    return { value: localValue, source: "local" };
  }

  // Newest wins
  const localTime = new Date(localTimestamp).getTime();
  const remoteTime = new Date(remoteTimestamp).getTime();

  if (localTime >= remoteTime) {
    return { value: localValue, source: "local" };
  } else {
    return { value: remoteValue, source: "remote" };
  }
}

// =============================================================================
// DEFAULTS FACTORY
// =============================================================================

/**
 * Create default study settings.
 */
export function createDefaultStudySettings(): StudySettings {
  return {
    dailyGoal: 50,
    newCardsPerDay: 20,
    maxReviewsPerDay: 200,
    sessionDuration: 20,
    enableSessionTimer: true,
    showSessionProgress: true,
    breakReminder: true,
    breakReminderInterval: 25,
    reviewOrder: "due_date",
    mixNewAndReview: true,
    newCardPosition: "mixed",
    autoShowAnswerDelay: 0,
    learningSteps: [1, 10],
    relearningSteps: [10],
    graduatingInterval: 1,
    easyInterval: 4,
    lapseNewInterval: 0,
    minimumInterval: 1,
    leechThreshold: 8,
    leechAction: "tag",
    schedulerType: "fsrs",
    fsrsParameters: DEFAULT_FSRS_PARAMETERS,
    enableFuzz: true,
    fuzzFactor: 5,
  };
}

/**
 * Create default display settings.
 */
export function createDefaultDisplaySettings(): DisplaySettings {
  return {
    theme: "system",
    accentColor: "#6366f1",
    trueBlack: false,
    fontSize: "medium",
    fontFamily: "system",
    lineHeight: 1.5,
    showCardTags: true,
    showDeckName: true,
    showCardType: false,
    showNextReviewTime: true,
    showButtonTimes: true,
    showRemainingCount: true,
    centerCardContent: true,
    cardAnimation: "flip",
    animationsEnabled: true,
    animationSpeed: 1.0,
  };
}

/**
 * Create default audio settings.
 */
export function createDefaultAudioSettings(): AudioSettings {
  return {
    soundEnabled: true,
    soundVolume: 80,
    correctSound: "default",
    incorrectSound: "default",
    hapticsEnabled: true,
    hapticIntensity: "medium",
    ttsEnabled: false,
    ttsAutoplay: false,
    ttsSpeed: 1.0,
    ttsPitch: 1.0,
    ttsVoice: "default",
    ttsReadSide: "front",
    autoplayAudio: true,
    autoplaySpeed: "normal",
    autoplayPause: 500,
  };
}

/**
 * Create default notification settings.
 */
export function createDefaultNotificationSettings(): NotificationSettings {
  return {
    pushEnabled: true,
    notificationSound: true,
    notificationBadge: true,
    dailyReminderEnabled: true,
    dailyReminderTime: "09:00",
    skipIfStudied: true,
    streakReminderEnabled: true,
    streakReminderTime: "20:00",
    streakWarningHours: 4,
    achievementNotifications: true,
    levelUpNotifications: true,
    weeklySummaryEnabled: true,
    weeklySummaryDay: 0,
    emailEnabled: true,
    emailDigestFrequency: "weekly",
    emailIncludeStats: true,
  };
}

/**
 * Create default privacy settings.
 */
export function createDefaultPrivacySettings(): PrivacySettings {
  return {
    analyticsEnabled: true,
    crashReportingEnabled: true,
    performanceMonitoring: true,
    shareStudyStats: false,
    showOnLeaderboard: true,
    shareProgress: false,
    profilePublic: false,
    showStreak: true,
    showLevel: true,
    showAchievements: true,
    reviewHistoryRetention: 365,
    sessionLogRetention: 30,
  };
}

/**
 * Create default sync settings.
 */
export function createDefaultSyncSettings(): SyncSettings {
  return {
    autoSyncEnabled: true,
    syncOnWifiOnly: false,
    syncFrequency: "realtime",
    syncAfterReview: true,
    conflictResolution: "ask",
    notifyOnConflictResolution: true,
    offlineModeEnabled: true,
    downloadMediaForOffline: false,
    maxOfflineStorage: 500,
    offlinePreloadDays: 7,
    autoBackupEnabled: true,
    autoBackupInterval: 7,
    backupsToKeep: 5,
  };
}

/**
 * Create default accessibility settings.
 */
export function createDefaultAccessibilitySettings(): AccessibilitySettings {
  return {
    highContrast: false,
    largeText: false,
    boldText: false,
    increasedSpacing: false,
    reduceMotion: false,
    reduceTransparency: false,
    disableAutoplay: false,
    tapToFlip: true,
    swipeToRate: true,
    longPressDelay: 500,
    largeTouchTargets: false,
    screenReaderOptimized: false,
    announceCardContent: true,
    announceActions: true,
    customHints: false,
  };
}

/**
 * Create default AI settings (all opt-in, disabled by default).
 */
export function createDefaultAISettings(): AISettings {
  return {
    aiEnabled: false,
    aiTermsAccepted: false,
    aiCardSuggestions: false,
    aiCardImprovement: false,
    requireApprovalForAIChanges: true,
    aiScheduleOptimization: false,
    aiDifficultyAdjustment: false,
    aiStudyStrategies: false,
    aiPatternAnalysis: false,
    aiGapIdentification: false,
    sendContentToAI: false,
    sendStatsToAI: false,
    storeAIResults: false,
  };
}

/**
 * Create default advanced settings.
 */
export function createDefaultAdvancedSettings(): AdvancedSettings {
  return {
    debugMode: false,
    showCardIds: false,
    logReviews: false,
    showPerformanceMetrics: false,
    cacheSize: 100,
    clearCacheOnLogout: false,
    compactDatabaseOnStartup: false,
    experimentalFeatures: false,
    betaFeatures: false,
    defaultExportFormat: "json",
    includeMediaInExport: true,
    includeHistoryInExport: true,
    useCustomEndpoint: false,
    customEndpointUrl: "",
  };
}

/**
 * Create complete default settings state.
 */
export function createDefaultSettingsState(): SettingsState {
  return {
    study: createDefaultStudySettings(),
    display: createDefaultDisplaySettings(),
    audio: createDefaultAudioSettings(),
    notifications: createDefaultNotificationSettings(),
    privacy: createDefaultPrivacySettings(),
    sync: createDefaultSyncSettings(),
    accessibility: createDefaultAccessibilitySettings(),
    ai: createDefaultAISettings(),
    advanced: createDefaultAdvancedSettings(),
    plugins: {},
  };
}

// =============================================================================
// RE-EXPORTS
// =============================================================================

export { DEFAULT_LKGC_CRITERIA };
