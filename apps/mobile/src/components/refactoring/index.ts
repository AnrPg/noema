// =============================================================================
// REFACTORING COMPONENTS INDEX
// =============================================================================
// Export all structural refactoring UI components

export { SplitWizard } from "./SplitWizard";
export { MergeWizard } from "./MergeWizard";
export { MoveCategorySheet } from "./MoveCategorySheet";
export { StructuralTimeline } from "./StructuralTimeline";

// Re-export types from API
export type {
  SplitChildDefinition,
  SplitDistinction,
  SplitCategoryInput,
  MergeCategoriesInput,
  MoveCategoryInput,
  RefactorTimelineEntry,
  StructuralSnapshot,
  StructuralDiff,
} from "@/services/api";
