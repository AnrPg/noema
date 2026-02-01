// =============================================================================
// SETTINGS STORE
// =============================================================================
// Manages all user preferences and settings with persistence

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { MMKV } from "react-native-mmkv";
import { deepMerge } from "../utils/deepMerge";

const storage = new MMKV({ id: "settings-storage" });

// MMKV Storage adapter for Zustand
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

// =============================================================================
// TYPES
// =============================================================================

export type SchedulerType = "fsrs" | "sm2" | "hlr";
export type ThemeMode = "light" | "dark" | "system";
export type Language = "en" | "es" | "fr" | "de" | "pt" | "zh" | "ja" | "ko";
export type FontSize = "small" | "medium" | "large" | "xlarge";
export type CardAnimation = "flip" | "slide" | "fade" | "none";
export type ReviewOrder = "due_date" | "random" | "difficulty" | "deck_order";
export type AutoplaySpeed = "slow" | "normal" | "fast";

export interface FSRSParameters {
  requestRetention: number; // Target retention rate (0.7 - 0.99)
  maximumInterval: number; // Max days between reviews
  w: number[]; // FSRS weights (17 parameters)
}

export interface StudySettings {
  // Daily Goals
  dailyGoal: number; // Cards per day (10-500)
  newCardsPerDay: number; // New cards to introduce (0-100)
  maxReviewsPerDay: number; // Maximum reviews (50-9999)

  // Session Settings
  sessionDuration: number; // Target session length in minutes (5-120)
  enableSessionTimer: boolean;
  showSessionProgress: boolean;

  // Review Order & Behavior
  reviewOrder: ReviewOrder;
  mixNewAndReview: boolean; // Interleave new cards with reviews
  newCardPosition: "first" | "last" | "mixed";

  // Learning Steps (in minutes)
  learningSteps: number[]; // e.g., [1, 10, 60, 1440]
  relearningSteps: number[]; // e.g., [10, 60]
  graduatingInterval: number; // Days after learning (1-365)
  easyInterval: number; // Days for easy rating (1-365)

  // Lapses
  lapseNewInterval: number; // Percentage of previous interval (0-100)
  minimumInterval: number; // Minimum days after lapse (1-7)
  leechThreshold: number; // Lapses before marking as leech (3-20)
  leechAction: "tag" | "suspend";

  // Scheduler
  schedulerType: SchedulerType;
  fsrsParameters: FSRSParameters;
  enableFuzz: boolean; // Add randomness to intervals
  fuzzFactor: number; // Fuzz percentage (0-25)
}

export interface DisplaySettings {
  // Theme
  theme: ThemeMode;
  accentColor: string;

  // Typography
  fontSize: FontSize;
  fontFamily: "system" | "serif" | "monospace";

  // Card Display
  showCardTags: boolean;
  showDeckName: boolean;
  showCardType: boolean;
  showNextReviewTime: boolean;
  showButtonTimes: boolean; // Show "10m", "1d" on buttons
  showRemainingCount: boolean;

  // Animations
  cardAnimation: CardAnimation;
  animationsEnabled: boolean;
  reduceMotion: boolean;
}

export interface AudioSettings {
  // Sound Effects
  soundEnabled: boolean;
  soundVolume: number; // 0-100

  // Haptic Feedback
  hapticsEnabled: boolean;
  hapticIntensity: "light" | "medium" | "heavy";

  // Text-to-Speech
  ttsEnabled: boolean;
  ttsAutoplay: boolean;
  ttsSpeed: number; // 0.5 - 2.0
  ttsVoice: string;

  // Audio Cards
  autoplayAudio: boolean;
  autoplaySpeed: AutoplaySpeed;
}

export interface NotificationSettings {
  // Push Notifications
  pushEnabled: boolean;

  // Daily Reminder
  dailyReminderEnabled: boolean;
  dailyReminderTime: string; // HH:mm format

  // Streak Notifications
  streakReminderEnabled: boolean;
  streakReminderTime: string;

  // Achievement Notifications
  achievementNotifications: boolean;

  // Weekly Summary
  weeklySummaryEnabled: boolean;
  weeklySummaryDay: number; // 0 = Sunday, 6 = Saturday

  // Email Notifications
  emailEnabled: boolean;
  emailDigestFrequency: "daily" | "weekly" | "monthly" | "never";
}

export interface PrivacySettings {
  // Analytics
  analyticsEnabled: boolean;
  crashReportingEnabled: boolean;

  // Data Sharing
  shareStudyStats: boolean; // For leaderboards
  showOnLeaderboard: boolean;
  shareProgress: boolean;

  // Profile Visibility
  profilePublic: boolean;
  showStreak: boolean;
  showLevel: boolean;
  showAchievements: boolean;
}

export interface SyncSettings {
  // Auto Sync
  autoSyncEnabled: boolean;
  syncOnWifiOnly: boolean;
  syncFrequency: "realtime" | "hourly" | "daily" | "manual";

  // Conflict Resolution
  conflictResolution: "server" | "local" | "newest" | "ask";

  // Offline Mode
  offlineModeEnabled: boolean;
  downloadMediaForOffline: boolean;
  maxOfflineStorage: number; // MB
}

export interface AccessibilitySettings {
  // Visual
  highContrast: boolean;
  largeText: boolean;
  boldText: boolean;

  // Motion
  reduceMotion: boolean;
  reduceTransparency: boolean;

  // Interaction
  tapToFlip: boolean;
  swipeToRate: boolean;
  longPressDelay: number; // ms (200-1000)

  // Screen Reader
  screenReaderOptimized: boolean;
  announceCardContent: boolean;
}

export interface AdvancedSettings {
  // Developer Options
  debugMode: boolean;
  showCardIds: boolean;
  logReviews: boolean;

  // Data Management
  cacheSize: number; // MB
  clearCacheOnLogout: boolean;

  // Experimental Features
  experimentalFeatures: boolean;
  betaFeatures: boolean;

  // Import/Export
  defaultExportFormat: "json" | "csv" | "anki";
  includeMediaInExport: boolean;
}

export interface SettingsState {
  study: StudySettings;
  display: DisplaySettings;
  audio: AudioSettings;
  notifications: NotificationSettings;
  privacy: PrivacySettings;
  sync: SyncSettings;
  accessibility: AccessibilitySettings;
  advanced: AdvancedSettings;

  // Metadata
  lastUpdated: string;
  version: number;

  // Plugin settings
  plugins: Record<string, Record<string, unknown>>; // Plugin settings by plugin ID
}

interface SettingsActions {
  // Update methods for each category
  updateStudySettings: (settings: Partial<StudySettings>) => void;
  updateDisplaySettings: (settings: Partial<DisplaySettings>) => void;
  updateAudioSettings: (settings: Partial<AudioSettings>) => void;
  updateNotificationSettings: (settings: Partial<NotificationSettings>) => void;
  updatePrivacySettings: (settings: Partial<PrivacySettings>) => void;
  updateSyncSettings: (settings: Partial<SyncSettings>) => void;
  updateAccessibilitySettings: (
    settings: Partial<AccessibilitySettings>,
  ) => void;
  updateAdvancedSettings: (settings: Partial<AdvancedSettings>) => void;

  // Plugin settings
  updatePluginSettings: (
    pluginId: string,
    settings: Record<string, unknown>,
  ) => void;

  // Utility methods
  resetToDefaults: () => void;
  resetCategory: (category: keyof SettingsState) => void;
  exportSettings: () => string;
  importSettings: (json: string) => boolean;
}

// =============================================================================
// DEFAULT VALUES
// =============================================================================

const defaultFSRSParameters: FSRSParameters = {
  requestRetention: 0.9,
  maximumInterval: 36500, // 100 years
  w: [
    0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05,
    0.34, 1.26, 0.29, 2.61,
  ],
};

const defaultStudySettings: StudySettings = {
  dailyGoal: 50,
  newCardsPerDay: 20,
  maxReviewsPerDay: 200,
  sessionDuration: 20,
  enableSessionTimer: true,
  showSessionProgress: true,
  reviewOrder: "due_date",
  mixNewAndReview: true,
  newCardPosition: "mixed",
  learningSteps: [1, 10],
  relearningSteps: [10],
  graduatingInterval: 1,
  easyInterval: 4,
  lapseNewInterval: 0,
  minimumInterval: 1,
  leechThreshold: 8,
  leechAction: "tag",
  schedulerType: "fsrs",
  fsrsParameters: defaultFSRSParameters,
  enableFuzz: true,
  fuzzFactor: 5,
};

const defaultDisplaySettings: DisplaySettings = {
  theme: "system",
  accentColor: "#6366f1",
  fontSize: "medium",
  fontFamily: "system",
  showCardTags: true,
  showDeckName: true,
  showCardType: false,
  showNextReviewTime: true,
  showButtonTimes: true,
  showRemainingCount: true,
  cardAnimation: "flip",
  animationsEnabled: true,
  reduceMotion: false,
};

const defaultAudioSettings: AudioSettings = {
  soundEnabled: true,
  soundVolume: 80,
  hapticsEnabled: true,
  hapticIntensity: "medium",
  ttsEnabled: false,
  ttsAutoplay: false,
  ttsSpeed: 1.0,
  ttsVoice: "default",
  autoplayAudio: true,
  autoplaySpeed: "normal",
};

const defaultNotificationSettings: NotificationSettings = {
  pushEnabled: true,
  dailyReminderEnabled: true,
  dailyReminderTime: "09:00",
  streakReminderEnabled: true,
  streakReminderTime: "20:00",
  achievementNotifications: true,
  weeklySummaryEnabled: true,
  weeklySummaryDay: 0, // Sunday
  emailEnabled: true,
  emailDigestFrequency: "weekly",
};

const defaultPrivacySettings: PrivacySettings = {
  analyticsEnabled: true,
  crashReportingEnabled: true,
  shareStudyStats: false,
  showOnLeaderboard: true,
  shareProgress: false,
  profilePublic: false,
  showStreak: true,
  showLevel: true,
  showAchievements: true,
};

const defaultSyncSettings: SyncSettings = {
  autoSyncEnabled: true,
  syncOnWifiOnly: false,
  syncFrequency: "realtime",
  conflictResolution: "newest",
  offlineModeEnabled: true,
  downloadMediaForOffline: false,
  maxOfflineStorage: 500,
};

const defaultAccessibilitySettings: AccessibilitySettings = {
  highContrast: false,
  largeText: false,
  boldText: false,
  reduceMotion: false,
  reduceTransparency: false,
  tapToFlip: true,
  swipeToRate: true,
  longPressDelay: 500,
  screenReaderOptimized: false,
  announceCardContent: true,
};

const defaultAdvancedSettings: AdvancedSettings = {
  debugMode: false,
  showCardIds: false,
  logReviews: false,
  cacheSize: 100,
  clearCacheOnLogout: false,
  experimentalFeatures: false,
  betaFeatures: false,
  defaultExportFormat: "json",
  includeMediaInExport: true,
};

const defaultPluginSettings: Record<string, Record<string, unknown>> = {};

const defaultSettings: SettingsState = {
  study: defaultStudySettings,
  display: defaultDisplaySettings,
  audio: defaultAudioSettings,
  notifications: defaultNotificationSettings,
  privacy: defaultPrivacySettings,
  sync: defaultSyncSettings,
  accessibility: defaultAccessibilitySettings,
  advanced: defaultAdvancedSettings,
  plugins: defaultPluginSettings,
  lastUpdated: new Date().toISOString(),
  version: 1,
};

// =============================================================================
// STORE
// =============================================================================

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set, get) => ({
      ...defaultSettings,

      updateStudySettings: (settings) =>
        set((state) => ({
          study: { ...state.study, ...settings },
          lastUpdated: new Date().toISOString(),
        })),

      updateDisplaySettings: (settings) =>
        set((state) => ({
          display: { ...state.display, ...settings },
          lastUpdated: new Date().toISOString(),
        })),

      updateAudioSettings: (settings) =>
        set((state) => ({
          audio: { ...state.audio, ...settings },
          lastUpdated: new Date().toISOString(),
        })),

      updateNotificationSettings: (settings) =>
        set((state) => ({
          notifications: { ...state.notifications, ...settings },
          lastUpdated: new Date().toISOString(),
        })),

      updatePrivacySettings: (settings) =>
        set((state) => ({
          privacy: { ...state.privacy, ...settings },
          lastUpdated: new Date().toISOString(),
        })),

      updateSyncSettings: (settings) =>
        set((state) => ({
          sync: { ...state.sync, ...settings },
          lastUpdated: new Date().toISOString(),
        })),

      updateAccessibilitySettings: (settings) =>
        set((state) => ({
          accessibility: { ...state.accessibility, ...settings },
          lastUpdated: new Date().toISOString(),
        })),

      updateAdvancedSettings: (settings) =>
        set((state) => ({
          advanced: { ...state.advanced, ...settings },
          lastUpdated: new Date().toISOString(),
        })),

      updatePluginSettings: (pluginId, settings) => {
        set((state) => ({
          plugins: {
            ...state.plugins,
            [pluginId]: {
              ...state.plugins[pluginId],
              ...settings,
            },
          },
          lastUpdated: new Date().toISOString(),
        }));
      },

      resetToDefaults: () =>
        set({
          ...defaultSettings,
          lastUpdated: new Date().toISOString(),
        }),

      resetCategory: (category) => {
        const defaults: Record<string, unknown> = {
          study: defaultStudySettings,
          display: defaultDisplaySettings,
          audio: defaultAudioSettings,
          notifications: defaultNotificationSettings,
          privacy: defaultPrivacySettings,
          sync: defaultSyncSettings,
          accessibility: defaultAccessibilitySettings,
          advanced: defaultAdvancedSettings,
        };

        if (defaults[category]) {
          set({
            [category]: defaults[category],
            lastUpdated: new Date().toISOString(),
          });
        }
      },

      exportSettings: () => {
        const state = get();
        const exportData = {
          study: state.study,
          display: state.display,
          audio: state.audio,
          notifications: state.notifications,
          privacy: state.privacy,
          sync: state.sync,
          accessibility: state.accessibility,
          advanced: state.advanced,
          version: state.version,
          exportedAt: new Date().toISOString(),
        };
        return JSON.stringify(exportData, null, 2);
      },

      importSettings: (json) => {
        try {
          const imported = JSON.parse(json);
          set({
            study: { ...defaultStudySettings, ...imported.study },
            display: { ...defaultDisplaySettings, ...imported.display },
            audio: { ...defaultAudioSettings, ...imported.audio },
            notifications: {
              ...defaultNotificationSettings,
              ...imported.notifications,
            },
            privacy: { ...defaultPrivacySettings, ...imported.privacy },
            sync: { ...defaultSyncSettings, ...imported.sync },
            accessibility: {
              ...defaultAccessibilitySettings,
              ...imported.accessibility,
            },
            advanced: { ...defaultAdvancedSettings, ...imported.advanced },
            lastUpdated: new Date().toISOString(),
          });
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: "settings-storage",
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);

// =============================================================================
// SELECTORS
// =============================================================================

export const useStudySettings = () => useSettingsStore((state) => state.study);
export const useDisplaySettings = () =>
  useSettingsStore((state) => state.display);
export const useAudioSettings = () => useSettingsStore((state) => state.audio);
export const useNotificationSettings = () =>
  useSettingsStore((state) => state.notifications);
export const usePrivacySettings = () =>
  useSettingsStore((state) => state.privacy);
export const useSyncSettings = () => useSettingsStore((state) => state.sync);
export const useAccessibilitySettings = () =>
  useSettingsStore((state) => state.accessibility);
export const useAdvancedSettings = () =>
  useSettingsStore((state) => state.advanced);

// =============================================================================
// HIERARCHICAL SCOPE RESOLUTION
// =============================================================================

/**
 * Resolve effective settings by merging values from all active scopes.
 * Resolution order: Global → Profile → Deck → Template → Session → Device.
 */
function resolveEffectiveSettings(
  globalSettings: SettingsState,
  profileSettings?: Partial<SettingsState>,
  deckSettings?: Partial<SettingsState>,
  templateSettings?: Partial<SettingsState>,
  sessionSettings?: Partial<SettingsState>,
  deviceSettings?: Partial<SettingsState>,
): SettingsState {
  return {
    study: deepMerge(
      globalSettings.study,
      profileSettings?.study,
      deckSettings?.study,
      templateSettings?.study,
      sessionSettings?.study,
      deviceSettings?.study,
    ),
    display: deepMerge(
      globalSettings.display,
      profileSettings?.display,
      deckSettings?.display,
      templateSettings?.display,
      sessionSettings?.display,
      deviceSettings?.display,
    ),
    audio: deepMerge(
      globalSettings.audio,
      profileSettings?.audio,
      deckSettings?.audio,
      templateSettings?.audio,
      sessionSettings?.audio,
      deviceSettings?.audio,
    ),
    notifications: deepMerge(
      globalSettings.notifications,
      profileSettings?.notifications,
      deckSettings?.notifications,
      templateSettings?.notifications,
      sessionSettings?.notifications,
      deviceSettings?.notifications,
    ),
    privacy: deepMerge(
      globalSettings.privacy,
      profileSettings?.privacy,
      deckSettings?.privacy,
      templateSettings?.privacy,
      sessionSettings?.privacy,
      deviceSettings?.privacy,
    ),
    sync: deepMerge(
      globalSettings.sync,
      profileSettings?.sync,
      deckSettings?.sync,
      templateSettings?.sync,
      sessionSettings?.sync,
      deviceSettings?.sync,
    ),
    accessibility: deepMerge(
      globalSettings.accessibility,
      profileSettings?.accessibility,
      deckSettings?.accessibility,
      templateSettings?.accessibility,
      sessionSettings?.accessibility,
      deviceSettings?.accessibility,
    ),
    advanced: deepMerge(
      globalSettings.advanced,
      profileSettings?.advanced,
      deckSettings?.advanced,
      templateSettings?.advanced,
      sessionSettings?.advanced,
      deviceSettings?.advanced,
    ),
    lastUpdated: new Date().toISOString(),
    version: globalSettings.version,
    plugins: deepMerge(
      globalSettings.plugins,
      profileSettings?.plugins,
      deckSettings?.plugins,
      templateSettings?.plugins,
      sessionSettings?.plugins,
      deviceSettings?.plugins,
    ),
  };
}

// Export the function to avoid unused warning
export { resolveEffectiveSettings };
