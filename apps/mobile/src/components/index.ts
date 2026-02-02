// =============================================================================
// COMPONENTS BARREL EXPORT
// =============================================================================

export { AuthGuard, useRequireAuth } from "./AuthGuard";

// Settings Components
export {
  SettingInfo,
  LearnMore,
  ExplanationModal,
  OptionExplanation,
  ChangeItem,
  CheckpointItem,
  HistoryModal,
  HistoryButton,
  LKGCSuggestionBanner,
  LKGCIndicator,
  LKGCModal,
  LKGCSection,
} from "./settings";

// Import Components
export * from "./import";

// Ecosystem Components (Knowledge Territories)
export {
  TerritoryMap,
  ContextWheel,
  ContextIndicator,
  CategoryTree,
  LearningModeSelector,
  CategoryForm,
} from "./ecosystem";

// Structural Refactoring Components
export {
  SplitWizard,
  MergeWizard,
  MoveCategorySheet,
  StructuralTimeline,
} from "./refactoring";
