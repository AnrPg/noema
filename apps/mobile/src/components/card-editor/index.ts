// =============================================================================
// CARD EDITOR COMPONENTS INDEX
// =============================================================================
// Phase 6E: Card editing with face management and previews

// Main components
export { CardEditor, useExpertiseLevel } from "./CardEditor";
export { FaceEditor } from "./FaceEditor";
export { FacePreview, FaceCardPreview } from "./FacePreview";
export { FaceSelector, FaceTabs } from "./FaceSelector";
export { CardPreviewSheet } from "./CardPreviewSheet";
export { ContentPrimitiveEditor } from "./ContentPrimitiveEditor";
export { DepthLevelSelector, DepthLevelBadge } from "./DepthLevelSelector";

// Types
export type {
  CardEditorProps,
  FaceEditorProps,
  FacePreviewProps,
  FaceSelectorProps,
  CardPreviewSheetProps,
  ContentPrimitiveEditorProps,
  DepthLevelSelectorProps,
  EditableCard,
  EditableFace,
  EditablePrimitive,
  DepthLevel,
  ContentPrimitiveTypeSimple,
} from "./types";

// Metadata and helpers
export {
  FACE_TYPE_METADATA,
  DEPTH_LEVEL_METADATA,
  CONTENT_PRIMITIVE_METADATA,
  PRIMITIVE_TYPE_METADATA,
  generateTempId,
  createEditablePrimitive,
  createEditableFace,
  createEditableCard,
} from "./types";
