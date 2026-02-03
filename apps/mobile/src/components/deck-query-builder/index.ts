// =============================================================================
// DECK QUERY BUILDER INDEX
// =============================================================================
// Phase 6E: Visual deck query builder for dynamic decks

// Main components
export { DeckQueryBuilder } from "./DeckQueryBuilder";
export { FilterGroupEditor } from "./FilterGroupEditor";
export { FilterConditionEditor } from "./FilterConditionEditor";
export { QueryPreview } from "./QueryPreview";
export { SortEditor } from "./SortEditor";

// Types
export type {
  // Operators
  StringOperator,
  NumberOperator,
  DateOperator,
  ArrayOperator,
  BooleanOperator,
  // Core types
  FilterField,
  FilterCondition,
  FilterGroup,
  SortConfig,
  DeckQuery,
  // Props
  DeckQueryBuilderProps,
  FilterConditionEditorProps,
  FilterGroupEditorProps,
  QueryPreviewProps,
  QueryPreviewCard,
} from "./types";

// Constants and helpers
export {
  // Field definitions
  FILTER_FIELDS,
  OPERATOR_METADATA,
  // Factory functions
  generateQueryId,
  createFilterCondition,
  createFilterGroup,
  createDeckQuery,
  // Utilities
  getFieldsByCategory,
  validateDeckQuery,
} from "./types";
