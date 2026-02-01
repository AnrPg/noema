// =============================================================================
// SETTINGS MODULE INDEX
// =============================================================================

export {
  // Utility functions
  generateId,
  deepMerge,
  getValueByPath,
  setValueByPath,
  getCategoryFromKey,

  // Scope resolution
  SCOPE_PRIORITY,
  getScopePriority,
  canOverride,
  resolveEffectiveSettings,

  // Configuration history
  createConfigChange,
  groupChangesByCategory,
  createCheckpointSummary,
  createConfigCheckpoint,
  logConfigChange,
  getConfigHistory,
  getChangeDetails,

  // LKGC
  checkLKGCCriteria,
  createLKGCSuggestion,
  createLKGCEntry,
  tagLKGC,
  getLKGC,
  rollbackToLKGC,

  // Conflict resolution
  getDefaultResolutionForScope,
  resolveConflict,

  // Defaults
  createDefaultStudySettings,
  createDefaultDisplaySettings,
  createDefaultAudioSettings,
  createDefaultNotificationSettings,
  createDefaultPrivacySettings,
  createDefaultSyncSettings,
  createDefaultAccessibilitySettings,
  createDefaultAISettings,
  createDefaultAdvancedSettings,
  createDefaultSettingsState,
} from "./settings-engine";
