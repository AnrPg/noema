// =============================================================================
// STORES INDEX
// =============================================================================

export { useAuthStore } from "./auth.store";
export { useStudyStore } from "./study.store";
export { authState, useIsAuthenticated } from "./auth-state";

// Legacy settings store (deprecated - use settings-v2 for new features)
export {
  useSettingsStore as useSettingsStoreLegacy,
  useStudySettings as useStudySettingsLegacy,
  useDisplaySettings as useDisplaySettingsLegacy,
  useAudioSettings as useAudioSettingsLegacy,
  useNotificationSettings as useNotificationSettingsLegacy,
  usePrivacySettings as usePrivacySettingsLegacy,
  useSyncSettings as useSyncSettingsLegacy,
  useAccessibilitySettings as useAccessibilitySettingsLegacy,
  useAdvancedSettings as useAdvancedSettingsLegacy,
} from "./settings.store";

// New professional-grade settings store with:
// - Hierarchical scopes (Global → Profile → Deck → Template → Session → Device)
// - Configuration history with checkpoints
// - LKGC (Last Known Good Configuration)
// - Plugin extensibility
// - Full explanations for every setting
export {
  useSettingsStore,
  useHistoryStore,
  useStudySettings,
  useDisplaySettings,
  useAudioSettings,
  useNotificationSettings,
  usePrivacySettings,
  useSyncSettings,
  useAccessibilitySettings,
  useAISettings,
  useAdvancedSettings,
  usePluginSettings,
  useLKGC,
  useLKGCSuggestion,
  useRecentChanges,
  useCheckpoints,
  usePendingChanges,
} from "./settings-v2.store";

// Re-export types from shared package
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
} from "./settings-v2.store";
