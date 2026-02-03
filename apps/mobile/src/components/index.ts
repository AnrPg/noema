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

// Multi-Belonging Components
export {
  ParticipationPanel,
  SynthesisPromptUI,
  BridgeCardViewer,
  BridgeCardCreator,
} from "./multi-belonging";

// Card Editor Components (Phase 6E)
export {
  CardEditor,
  FaceEditor,
  FacePreview,
  FaceSelector,
  ContentPrimitiveEditor,
  DepthLevelSelector,
  CardPreviewSheet,
} from "./card-editor";

export type {
  CardEditorProps,
  FaceEditorProps,
  EditableCard,
  EditableFace,
  EditablePrimitive,
} from "./card-editor";

// Deck Query Builder Components (Phase 6E)
export {
  DeckQueryBuilder,
  FilterGroupEditor,
  FilterConditionEditor,
  QueryPreview,
  SortEditor,
} from "./deck-query-builder";

export type {
  DeckQueryBuilderProps,
  DeckQuery,
  FilterGroup,
  FilterCondition,
  FilterField,
  SortConfig,
} from "./deck-query-builder";

// Review Enhancements Components (Phase 6E)
export {
  MultiFaceCardRenderer,
  ContextIndicatorBar,
  ExplainabilityPanel,
  EnhancedRatingButtons,
  ReviewFaceSelector,
  HintRevealer,
  MemoryPredictionDisplay,
} from "./review-enhancements";

export type {
  ReviewFace,
  ReviewCard,
  CardContext,
  CardExplainability,
  MemoryPrediction,
  EnhancedReviewResponse,
  ReviewResult,
} from "./review-enhancements";
