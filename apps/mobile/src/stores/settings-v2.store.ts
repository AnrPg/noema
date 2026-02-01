// =============================================================================
// PROFESSIONAL SETTINGS STORE
// =============================================================================
// Complete settings management with:
// - Hierarchical scopes (Global → Profile → Deck → Template → Session → Device)
// - Configuration history with checkpoints
// - LKGC (Last Known Good Configuration) management
// - Plugin extensibility
// - Full explanations for every setting

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { MMKV } from "react-native-mmkv";
import type {
  SettingsState,
  StudySettings,
  DisplaySettings,
  AudioSettings,
  NotificationSettings,
  PrivacySettings,
  SyncSettings,
  AccessibilitySettings,
  AISettings,
  AdvancedSettings,
  SettingsScope,
  SettingsScopeContext,
  ScopedSettings,
  EffectiveSettings,
  ConfigChange,
  ConfigChangeId,
  ConfigChangeSource,
  ConfigCheckpoint,
  ConfigSnapshotId,
  LKGCEntry,
  LKGCAutoCriteria,
  LKGCSuggestion,
  LKGCPerformanceSnapshot,
  PluginSettingsSection,
  SettingsCategory,
} from "@manthanein/shared";

import {
  createDefaultSettingsState,
  createConfigChange,
  createConfigCheckpoint,
  createLKGCEntry,
  createLKGCSuggestion,
  checkLKGCCriteria,
  resolveEffectiveSettings,
  getValueByPath,
  deepMerge,
  generateId,
  DEFAULT_LKGC_CRITERIA,
} from "@manthanein/shared";

// =============================================================================
// STORAGE SETUP
// =============================================================================

const storage = new MMKV({ id: "settings-v2-storage" });
const historyStorage = new MMKV({ id: "settings-history-storage" });

const mmkvStorage = {
  getItem: (name: string) => {
    const value = storage.getString(name);
    return value ?? null;
  },
  setItem: (name: string, value: string) => {
    storage.set(name, value);
  },
  removeItem: (name: string) => {
    storage.delete(name);
  },
};

const historyMmkvStorage = {
  getItem: (name: string) => {
    const value = historyStorage.getString(name);
    return value ?? null;
  },
  setItem: (name: string, value: string) => {
    historyStorage.set(name, value);
  },
  removeItem: (name: string) => {
    historyStorage.delete(name);
  },
};

// =============================================================================
// STORE STATE TYPES
// =============================================================================

interface SettingsStoreState {
  // Current settings (profile scope by default)
  settings: SettingsState;

  // Scoped overrides (keyed by "scope:scopeId")
  scopedOverrides: Record<string, Partial<SettingsState>>;

  // Current scope context
  currentContext: SettingsScopeContext;

  // Metadata
  lastUpdated: string;
  version: number;
  deviceId: string;

  // LKGC
  currentLKGC: LKGCEntry | null;
  lkgcSuggestion: LKGCSuggestion | null;
  lkgcSuggestionDismissedAt: string | null;
}

interface HistoryStoreState {
  // All changes since last checkpoint
  pendingChanges: ConfigChange[];

  // All checkpoints
  checkpoints: ConfigCheckpoint[];

  // Change history (limited to recent changes for performance)
  recentChanges: ConfigChange[];

  // Maximum items to keep
  maxRecentChanges: number;
  maxCheckpoints: number;
}

interface SettingsStoreActions {
  // === Category Updates ===
  updateStudySettings: (
    settings: Partial<StudySettings>,
    source?: ConfigChangeSource,
  ) => void;
  updateDisplaySettings: (
    settings: Partial<DisplaySettings>,
    source?: ConfigChangeSource,
  ) => void;
  updateAudioSettings: (
    settings: Partial<AudioSettings>,
    source?: ConfigChangeSource,
  ) => void;
  updateNotificationSettings: (
    settings: Partial<NotificationSettings>,
    source?: ConfigChangeSource,
  ) => void;
  updatePrivacySettings: (
    settings: Partial<PrivacySettings>,
    source?: ConfigChangeSource,
  ) => void;
  updateSyncSettings: (
    settings: Partial<SyncSettings>,
    source?: ConfigChangeSource,
  ) => void;
  updateAccessibilitySettings: (
    settings: Partial<AccessibilitySettings>,
    source?: ConfigChangeSource,
  ) => void;
  updateAISettings: (
    settings: Partial<AISettings>,
    source?: ConfigChangeSource,
  ) => void;
  updateAdvancedSettings: (
    settings: Partial<AdvancedSettings>,
    source?: ConfigChangeSource,
  ) => void;

  // === Generic Setting Update ===
  updateSetting: (
    key: string,
    value: unknown,
    source?: ConfigChangeSource,
  ) => void;

  // === Scope Management ===
  setContext: (context: SettingsScopeContext) => void;
  setScopeOverride: (
    scope: SettingsScope,
    scopeId: string,
    settings: Partial<SettingsState>,
  ) => void;
  clearScopeOverride: (scope: SettingsScope, scopeId: string) => void;
  getEffectiveSettings: () => EffectiveSettings;

  // === Reset ===
  resetCategory: (category: SettingsCategory) => void;
  resetToDefaults: () => void;

  // === Import/Export ===
  exportSettings: () => string;
  importSettings: (json: string) => boolean;

  // === Plugin Settings ===
  registerPluginSettings: (section: PluginSettingsSection) => void;
  unregisterPluginSettings: (pluginId: string) => void;
  updatePluginSettings: (
    pluginId: string,
    values: Record<string, unknown>,
  ) => void;
}

interface HistoryStoreActions {
  // === History ===
  recordChange: (change: ConfigChange) => void;
  getRecentChanges: (
    limit?: number,
    category?: SettingsCategory,
  ) => ConfigChange[];
  getChangeById: (id: ConfigChangeId) => ConfigChange | undefined;

  // === Checkpoints ===
  createCheckpoint: (
    name: string,
    description?: string,
    snapshot?: SettingsState,
  ) => ConfigCheckpoint;
  getCheckpoints: () => ConfigCheckpoint[];
  getCheckpointById: (id: ConfigSnapshotId) => ConfigCheckpoint | undefined;
  rollbackToCheckpoint: (
    checkpointId: ConfigSnapshotId,
  ) => SettingsState | null;

  // === LKGC ===
  tagCheckpointAsLKGC: (
    checkpointId: ConfigSnapshotId,
    reason: string,
    notes?: string,
  ) => LKGCEntry;
  clearHistory: () => void;
}

interface LKGCActions {
  // === LKGC Management ===
  setLKGC: (entry: LKGCEntry) => void;
  clearLKGC: () => void;
  getLKGC: () => LKGCEntry | null;

  // === LKGC Suggestion ===
  checkAndSuggestLKGC: (performance: LKGCPerformanceSnapshot) => void;
  dismissLKGCSuggestion: () => void;
  acceptLKGCSuggestion: () => void;
}

// =============================================================================
// DEFAULT VALUES
// =============================================================================

const defaultSettings = createDefaultSettingsState();

const defaultStoreState: SettingsStoreState = {
  settings: defaultSettings,
  scopedOverrides: {},
  currentContext: {},
  lastUpdated: new Date().toISOString(),
  version: 2,
  deviceId: generateId("device"),
  currentLKGC: null,
  lkgcSuggestion: null,
  lkgcSuggestionDismissedAt: null,
};

const defaultHistoryState: HistoryStoreState = {
  pendingChanges: [],
  checkpoints: [],
  recentChanges: [],
  maxRecentChanges: 500,
  maxCheckpoints: 50,
};

// =============================================================================
// HISTORY STORE
// =============================================================================

export const useHistoryStore = create<
  HistoryStoreState & HistoryStoreActions
>()(
  persist(
    (set, get) => ({
      ...defaultHistoryState,

      recordChange: (change) => {
        set((state) => {
          const recentChanges = [change, ...state.recentChanges].slice(
            0,
            state.maxRecentChanges,
          );
          const pendingChanges = [...state.pendingChanges, change];
          return { recentChanges, pendingChanges };
        });
      },

      getRecentChanges: (limit = 50, category) => {
        const { recentChanges } = get();
        let filtered = recentChanges;
        if (category) {
          filtered = filtered.filter((c) => c.category === category);
        }
        return filtered.slice(0, limit);
      },

      getChangeById: (id) => {
        const { recentChanges } = get();
        return recentChanges.find((c) => c.id === id);
      },

      createCheckpoint: (name, description, snapshot) => {
        const state = get();
        const checkpoint = createConfigCheckpoint(
          name,
          snapshot || defaultSettings,
          state.pendingChanges,
          "user",
          description,
        );

        set((s) => ({
          checkpoints: [checkpoint, ...s.checkpoints].slice(
            0,
            s.maxCheckpoints,
          ),
          pendingChanges: [],
        }));

        return checkpoint;
      },

      getCheckpoints: () => get().checkpoints,

      getCheckpointById: (id) => {
        return get().checkpoints.find((c) => c.id === id);
      },

      rollbackToCheckpoint: (checkpointId) => {
        const checkpoint = get().checkpoints.find((c) => c.id === checkpointId);
        if (!checkpoint) return null;
        return checkpoint.snapshot;
      },

      tagCheckpointAsLKGC: (checkpointId, reason, notes) => {
        const checkpoint = get().checkpoints.find((c) => c.id === checkpointId);
        if (!checkpoint) {
          throw new Error(`Checkpoint ${checkpointId} not found`);
        }

        // Mark checkpoint as LKGC
        set((state) => ({
          checkpoints: state.checkpoints.map(
            (c) =>
              c.id === checkpointId
                ? {
                    ...c,
                    isLKGC: true,
                    lkgcTaggedAt: new Date().toISOString(),
                    lkgcReason: reason,
                  }
                : { ...c, isLKGC: false }, // Only one LKGC at a time
          ),
        }));

        // Create LKGC entry
        const lkgcEntry = createLKGCEntry(
          checkpointId,
          reason,
          "user",
          {
            averageAccuracy: 0.85, // Would be computed from actual stats
            averageRetention: 0.9,
            cardsReviewedPerDay: 50,
            streakDays: 7,
            sessionCompletionRate: 0.9,
          },
          undefined, // criteria
          notes,
        );

        return lkgcEntry;
      },

      clearHistory: () => {
        set({
          pendingChanges: [],
          recentChanges: [],
          checkpoints: [],
        });
      },
    }),
    {
      name: "settings-history",
      storage: createJSONStorage(() => historyMmkvStorage),
    },
  ),
);

// =============================================================================
// MAIN SETTINGS STORE
// =============================================================================

export const useSettingsStore = create<
  SettingsStoreState & SettingsStoreActions & LKGCActions
>()(
  persist(
    (set, get) => ({
      ...defaultStoreState,

      // === Category Update Helpers ===
      updateStudySettings: (settings, source = "user") => {
        const state = get();
        const changes: ConfigChange[] = [];

        for (const [key, value] of Object.entries(settings)) {
          const fullKey = `study.${key}`;
          const previousValue = getValueByPath(state.settings, fullKey);
          if (previousValue !== value) {
            changes.push(
              createConfigChange(
                fullKey,
                previousValue,
                value,
                "profile",
                source,
              ),
            );
          }
        }

        set((s) => ({
          settings: {
            ...s.settings,
            study: { ...s.settings.study, ...settings },
          },
          lastUpdated: new Date().toISOString(),
        }));

        // Record changes
        const historyStore = useHistoryStore.getState();
        changes.forEach((c) => historyStore.recordChange(c));
      },

      updateDisplaySettings: (settings, source = "user") => {
        const state = get();
        const changes: ConfigChange[] = [];

        for (const [key, value] of Object.entries(settings)) {
          const fullKey = `display.${key}`;
          const previousValue = getValueByPath(state.settings, fullKey);
          if (previousValue !== value) {
            changes.push(
              createConfigChange(
                fullKey,
                previousValue,
                value,
                "profile",
                source,
              ),
            );
          }
        }

        set((s) => ({
          settings: {
            ...s.settings,
            display: { ...s.settings.display, ...settings },
          },
          lastUpdated: new Date().toISOString(),
        }));

        const historyStore = useHistoryStore.getState();
        changes.forEach((c) => historyStore.recordChange(c));
      },

      updateAudioSettings: (settings, source = "user") => {
        const state = get();
        const changes: ConfigChange[] = [];

        for (const [key, value] of Object.entries(settings)) {
          const fullKey = `audio.${key}`;
          const previousValue = getValueByPath(state.settings, fullKey);
          if (previousValue !== value) {
            changes.push(
              createConfigChange(
                fullKey,
                previousValue,
                value,
                "profile",
                source,
              ),
            );
          }
        }

        set((s) => ({
          settings: {
            ...s.settings,
            audio: { ...s.settings.audio, ...settings },
          },
          lastUpdated: new Date().toISOString(),
        }));

        const historyStore = useHistoryStore.getState();
        changes.forEach((c) => historyStore.recordChange(c));
      },

      updateNotificationSettings: (settings, source = "user") => {
        const state = get();
        const changes: ConfigChange[] = [];

        for (const [key, value] of Object.entries(settings)) {
          const fullKey = `notifications.${key}`;
          const previousValue = getValueByPath(state.settings, fullKey);
          if (previousValue !== value) {
            changes.push(
              createConfigChange(
                fullKey,
                previousValue,
                value,
                "profile",
                source,
              ),
            );
          }
        }

        set((s) => ({
          settings: {
            ...s.settings,
            notifications: { ...s.settings.notifications, ...settings },
          },
          lastUpdated: new Date().toISOString(),
        }));

        const historyStore = useHistoryStore.getState();
        changes.forEach((c) => historyStore.recordChange(c));
      },

      updatePrivacySettings: (settings, source = "user") => {
        const state = get();
        const changes: ConfigChange[] = [];

        for (const [key, value] of Object.entries(settings)) {
          const fullKey = `privacy.${key}`;
          const previousValue = getValueByPath(state.settings, fullKey);
          if (previousValue !== value) {
            changes.push(
              createConfigChange(
                fullKey,
                previousValue,
                value,
                "profile",
                source,
              ),
            );
          }
        }

        set((s) => ({
          settings: {
            ...s.settings,
            privacy: { ...s.settings.privacy, ...settings },
          },
          lastUpdated: new Date().toISOString(),
        }));

        const historyStore = useHistoryStore.getState();
        changes.forEach((c) => historyStore.recordChange(c));
      },

      updateSyncSettings: (settings, source = "user") => {
        const state = get();
        const changes: ConfigChange[] = [];

        for (const [key, value] of Object.entries(settings)) {
          const fullKey = `sync.${key}`;
          const previousValue = getValueByPath(state.settings, fullKey);
          if (previousValue !== value) {
            changes.push(
              createConfigChange(
                fullKey,
                previousValue,
                value,
                "profile",
                source,
              ),
            );
          }
        }

        set((s) => ({
          settings: {
            ...s.settings,
            sync: { ...s.settings.sync, ...settings },
          },
          lastUpdated: new Date().toISOString(),
        }));

        const historyStore = useHistoryStore.getState();
        changes.forEach((c) => historyStore.recordChange(c));
      },

      updateAccessibilitySettings: (settings, source = "user") => {
        const state = get();
        const changes: ConfigChange[] = [];

        for (const [key, value] of Object.entries(settings)) {
          const fullKey = `accessibility.${key}`;
          const previousValue = getValueByPath(state.settings, fullKey);
          if (previousValue !== value) {
            changes.push(
              createConfigChange(
                fullKey,
                previousValue,
                value,
                "profile",
                source,
              ),
            );
          }
        }

        set((s) => ({
          settings: {
            ...s.settings,
            accessibility: { ...s.settings.accessibility, ...settings },
          },
          lastUpdated: new Date().toISOString(),
        }));

        const historyStore = useHistoryStore.getState();
        changes.forEach((c) => historyStore.recordChange(c));
      },

      updateAISettings: (settings, source = "user") => {
        const state = get();
        const changes: ConfigChange[] = [];

        for (const [key, value] of Object.entries(settings)) {
          const fullKey = `ai.${key}`;
          const previousValue = getValueByPath(state.settings, fullKey);
          if (previousValue !== value) {
            changes.push(
              createConfigChange(
                fullKey,
                previousValue,
                value,
                "profile",
                source,
              ),
            );
          }
        }

        set((s) => ({
          settings: {
            ...s.settings,
            ai: { ...s.settings.ai, ...settings },
          },
          lastUpdated: new Date().toISOString(),
        }));

        const historyStore = useHistoryStore.getState();
        changes.forEach((c) => historyStore.recordChange(c));
      },

      updateAdvancedSettings: (settings, source = "user") => {
        const state = get();
        const changes: ConfigChange[] = [];

        for (const [key, value] of Object.entries(settings)) {
          const fullKey = `advanced.${key}`;
          const previousValue = getValueByPath(state.settings, fullKey);
          if (previousValue !== value) {
            changes.push(
              createConfigChange(
                fullKey,
                previousValue,
                value,
                "profile",
                source,
              ),
            );
          }
        }

        set((s) => ({
          settings: {
            ...s.settings,
            advanced: { ...s.settings.advanced, ...settings },
          },
          lastUpdated: new Date().toISOString(),
        }));

        const historyStore = useHistoryStore.getState();
        changes.forEach((c) => historyStore.recordChange(c));
      },

      // === Generic Setting Update ===
      updateSetting: (key, value, source = "user") => {
        const state = get();
        const previousValue = getValueByPath(state.settings, key);

        if (previousValue === value) return;

        const change = createConfigChange(
          key,
          previousValue,
          value,
          "profile",
          source,
        );

        // Parse the key to update the correct category
        const [category, ...rest] = key.split(".");
        const settingKey = rest.join(".");

        set((s) => {
          const categorySettings = (
            s.settings as unknown as Record<string, unknown>
          )[category];
          if (
            typeof categorySettings === "object" &&
            categorySettings !== null
          ) {
            return {
              settings: {
                ...s.settings,
                [category]: {
                  ...(categorySettings as Record<string, unknown>),
                  [settingKey]: value,
                },
              },
              lastUpdated: new Date().toISOString(),
            };
          }
          return s;
        });

        useHistoryStore.getState().recordChange(change);
      },

      // === Scope Management ===
      setContext: (context) => {
        set({ currentContext: context });
      },

      setScopeOverride: (scope, scopeId, settings) => {
        const key = `${scope}:${scopeId}`;
        set((state) => ({
          scopedOverrides: {
            ...state.scopedOverrides,
            [key]: deepMerge(state.scopedOverrides[key] || {}, settings),
          },
        }));
      },

      clearScopeOverride: (scope, scopeId) => {
        const key = `${scope}:${scopeId}`;
        set((state) => {
          const { [key]: _, ...rest } = state.scopedOverrides;
          return { scopedOverrides: rest };
        });
      },

      getEffectiveSettings: () => {
        const state = get();

        // Convert scopedOverrides to ScopedSettings array
        const scopedSettings: ScopedSettings[] = [
          // Profile settings (the main settings)
          {
            scope: "profile" as SettingsScope,
            settings: state.settings,
            updatedAt: state.lastUpdated,
            updatedBy: "user",
          },
          // Add all scope overrides
          ...Object.entries(state.scopedOverrides).map(([key, settings]) => {
            const [scope, scopeId] = key.split(":");
            return {
              scope: scope as SettingsScope,
              scopeId,
              settings,
              updatedAt: state.lastUpdated,
              updatedBy: "user" as const,
            };
          }),
        ];

        return resolveEffectiveSettings(
          defaultSettings,
          scopedSettings,
          state.currentContext,
        );
      },

      // === Reset ===
      resetCategory: (category) => {
        const defaults = defaultSettings[category as keyof SettingsState];
        if (defaults) {
          set((state) => ({
            settings: {
              ...state.settings,
              [category]: defaults,
            },
            lastUpdated: new Date().toISOString(),
          }));

          // Record the reset
          const change = createConfigChange(
            category,
            "previous values",
            "defaults",
            "profile",
            "user",
          );
          useHistoryStore.getState().recordChange(change);
        }
      },

      resetToDefaults: () => {
        set({
          settings: defaultSettings,
          scopedOverrides: {},
          lastUpdated: new Date().toISOString(),
        });

        const change = createConfigChange(
          "all",
          "previous values",
          "defaults",
          "profile",
          "user",
        );
        useHistoryStore.getState().recordChange(change);
      },

      // === Import/Export ===
      exportSettings: () => {
        const state = get();
        const historyState = useHistoryStore.getState();

        const exportData = {
          settings: state.settings,
          scopedOverrides: state.scopedOverrides,
          checkpoints: historyState.checkpoints,
          currentLKGC: state.currentLKGC,
          version: state.version,
          exportedAt: new Date().toISOString(),
        };

        return JSON.stringify(exportData, null, 2);
      },

      importSettings: (json) => {
        try {
          const imported = JSON.parse(json);

          if (!imported.settings) {
            throw new Error("Invalid settings format");
          }

          set({
            settings: deepMerge(defaultSettings, imported.settings),
            scopedOverrides: imported.scopedOverrides || {},
            lastUpdated: new Date().toISOString(),
          });

          // Record the import
          const change = createConfigChange(
            "all",
            "previous values",
            "imported values",
            "profile",
            "import",
          );
          useHistoryStore.getState().recordChange(change);

          return true;
        } catch {
          return false;
        }
      },

      // === Plugin Settings ===
      registerPluginSettings: (section) => {
        set((state) => ({
          settings: {
            ...state.settings,
            plugins: {
              ...state.settings.plugins,
              [section.pluginId]: section,
            },
          },
        }));
      },

      unregisterPluginSettings: (pluginId) => {
        set((state) => {
          const { [pluginId]: _, ...rest } = state.settings.plugins;
          return {
            settings: {
              ...state.settings,
              plugins: rest,
            },
          };
        });
      },

      updatePluginSettings: (pluginId, values) => {
        set((state) => {
          const plugin = state.settings.plugins[pluginId];
          if (!plugin) return state;

          return {
            settings: {
              ...state.settings,
              plugins: {
                ...state.settings.plugins,
                [pluginId]: {
                  ...plugin,
                  values: { ...plugin.values, ...values },
                },
              },
            },
            lastUpdated: new Date().toISOString(),
          };
        });
      },

      // === LKGC Management ===
      setLKGC: (entry) => {
        set({ currentLKGC: entry, lkgcSuggestion: null });
      },

      clearLKGC: () => {
        set({ currentLKGC: null });
      },

      getLKGC: () => {
        return get().currentLKGC;
      },

      checkAndSuggestLKGC: (performance) => {
        const state = get();

        // Don't suggest if already dismissed recently (within 7 days)
        if (state.lkgcSuggestionDismissedAt) {
          const dismissedAt = new Date(
            state.lkgcSuggestionDismissedAt,
          ).getTime();
          const daysSinceDismiss =
            (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
          if (daysSinceDismiss < 7) return;
        }

        // Calculate days since last change
        const lastChangeTime = new Date(state.lastUpdated).getTime();
        const daysSinceLastChange =
          (Date.now() - lastChangeTime) / (1000 * 60 * 60 * 24);

        // Check criteria
        const criteriaCheck = checkLKGCCriteria(
          DEFAULT_LKGC_CRITERIA,
          performance,
          daysSinceLastChange,
          false, // hasReportedIssues - would come from external tracking
        );

        if (criteriaCheck.met) {
          // Create a checkpoint if we don't have a recent one
          const historyStore = useHistoryStore.getState();
          let checkpoint = historyStore.checkpoints[0];

          if (
            !checkpoint ||
            Date.now() - new Date(checkpoint.timestamp).getTime() >
              24 * 60 * 60 * 1000
          ) {
            checkpoint = historyStore.createCheckpoint(
              "Auto-checkpoint for LKGC",
              "Created automatically when LKGC criteria were met",
              state.settings,
            );
          }

          const suggestion = createLKGCSuggestion(
            checkpoint.id,
            DEFAULT_LKGC_CRITERIA,
            performance,
            daysSinceLastChange,
            false, // hasReportedIssues
          );

          set({ lkgcSuggestion: suggestion });
        }
      },

      dismissLKGCSuggestion: () => {
        set({
          lkgcSuggestion: null,
          lkgcSuggestionDismissedAt: new Date().toISOString(),
        });
      },

      acceptLKGCSuggestion: () => {
        const state = get();
        if (!state.lkgcSuggestion) return;

        const historyStore = useHistoryStore.getState();
        const lkgcEntry = historyStore.tagCheckpointAsLKGC(
          state.lkgcSuggestion.checkpointId,
          state.lkgcSuggestion.reason,
          "Accepted from suggestion",
        );

        set({
          currentLKGC: lkgcEntry,
          lkgcSuggestion: null,
        });
      },
    }),
    {
      name: "settings-v2",
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);

// =============================================================================
// SELECTORS
// =============================================================================

export const useStudySettings = () =>
  useSettingsStore((state) => state.settings.study);
export const useDisplaySettings = () =>
  useSettingsStore((state) => state.settings.display);
export const useAudioSettings = () =>
  useSettingsStore((state) => state.settings.audio);
export const useNotificationSettings = () =>
  useSettingsStore((state) => state.settings.notifications);
export const usePrivacySettings = () =>
  useSettingsStore((state) => state.settings.privacy);
export const useSyncSettings = () =>
  useSettingsStore((state) => state.settings.sync);
export const useAccessibilitySettings = () =>
  useSettingsStore((state) => state.settings.accessibility);
export const useAISettings = () =>
  useSettingsStore((state) => state.settings.ai);
export const useAdvancedSettings = () =>
  useSettingsStore((state) => state.settings.advanced);
export const usePluginSettings = (pluginId: string) =>
  useSettingsStore((state) => state.settings.plugins[pluginId]);

// LKGC Selectors
export const useLKGC = () => useSettingsStore((state) => state.currentLKGC);
export const useLKGCSuggestion = () =>
  useSettingsStore((state) => state.lkgcSuggestion);

// History Selectors
export const useRecentChanges = (limit?: number, category?: SettingsCategory) =>
  useHistoryStore((state) => {
    let changes = state.recentChanges;
    if (category) {
      changes = changes.filter((c) => c.category === category);
    }
    return changes.slice(0, limit || 50);
  });

export const useCheckpoints = () =>
  useHistoryStore((state) => state.checkpoints);
export const usePendingChanges = () =>
  useHistoryStore((state) => state.pendingChanges);

// =============================================================================
// RE-EXPORT TYPES FOR CONVENIENCE
// =============================================================================

export type {
  SettingsState,
  StudySettings,
  DisplaySettings,
  AudioSettings,
  NotificationSettings,
  PrivacySettings,
  SyncSettings,
  AccessibilitySettings,
  AISettings,
  AdvancedSettings,
  ConfigChange,
  ConfigCheckpoint,
  LKGCEntry,
  LKGCSuggestion,
  SettingsScope,
  SettingsCategory,
  ThemeMode,
  FontSize,
  CardAnimation,
  SchedulerType,
  ReviewOrder,
  NewCardPosition,
  LeechAction,
} from "@manthanein/shared";
