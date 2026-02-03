// =============================================================================
// CARD EDITOR TYPES
// =============================================================================
// Type definitions for the card editor components

import type {
  CardFaceType,
  CognitiveDepthLevel,
  ContentPrimitive,
  ContentPrimitiveType,
  CardFace,
  CanonicalCard,
} from "@manthanein/shared";

// Re-export shared types for convenience
export type { CardFaceType, ContentPrimitiveType, ContentPrimitive };

// =============================================================================
// EDITABLE DATA STRUCTURES
// =============================================================================

/**
 * Editable content primitive
 */
export interface EditablePrimitive {
  /** Temporary ID for editing */
  readonly tempId: string;
  /** Primitive type */
  type: ContentPrimitiveTypeSimple;
  /** Text content */
  content: string;
  /** Media URL (for image, audio, video) */
  mediaUrl?: string;
  /** Alt text (for images) */
  altText?: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
  /** Display order */
  order: number;
  /** Is this primitive new (unsaved)? */
  isNew?: boolean;
  /** Has this primitive been modified? */
  isDirty?: boolean;
}

/**
 * Editable card face
 */
export interface EditableFace {
  /** Temporary ID for editing */
  readonly tempId: string;
  /** Original face ID (if editing existing) */
  originalId?: string;
  /** Face name */
  name: string;
  /** Face type */
  faceType: CardFaceType;
  /** Cognitive depth level (Bloom's taxonomy) */
  depthLevel: DepthLevel;
  /** Question side primitives */
  questionPrimitives: EditablePrimitive[];
  /** Answer side primitives */
  answerPrimitives: EditablePrimitive[];
  /** Scaffolding level (0-3) */
  scaffoldingLevel: number;
  /** Hints */
  hints: string[];
  /** Is this the default face? */
  isDefault: boolean;
  /** Is this face new (unsaved)? */
  isNew?: boolean;
  /** Has this face been modified? */
  isDirty?: boolean;
  /** Is this face expanded in the editor? */
  isExpanded?: boolean;
}

/**
 * Editable card structure
 */
export interface EditableCard {
  /** Card ID (if editing existing) */
  id?: string;
  /** Card title/name */
  title: string;
  /** Card description */
  description?: string;
  /** Canonical content primitives */
  canonicalPrimitives: EditablePrimitive[];
  /** Card faces */
  faces: EditableFace[];
  /** Default face temp ID */
  defaultFaceTempId: string;
  /** Tags */
  tags: string[];
  /** Is this a new card? */
  isNew?: boolean;
  /** Has the card been modified? */
  isDirty?: boolean;
}

// =============================================================================
// COMPONENT PROPS
// =============================================================================

/**
 * Card editor props
 */
export interface CardEditorProps {
  /** Card to edit (undefined for new card) */
  card?: CanonicalCard;
  /** Callback when card is saved */
  onSave: (card: EditableCard) => Promise<void>;
  /** Callback when editing is cancelled */
  onCancel: () => void;
  /** Whether to show advanced options by default */
  showAdvanced?: boolean;
  /** Loading state */
  isLoading?: boolean;
}

/**
 * Face editor props
 */
export interface FaceEditorProps {
  /** Face to edit */
  face: EditableFace;
  /** Available canonical primitives to reference */
  canonicalPrimitives: EditablePrimitive[];
  /** Callback when face is updated */
  onUpdate: (face: EditableFace) => void;
  /** Callback when face is deleted */
  onDelete: () => void;
  /** Whether this face can be deleted (not if it's the only face) */
  canDelete: boolean;
  /** Whether face is expanded */
  isExpanded: boolean;
  /** Toggle expanded state */
  onToggleExpanded: () => void;
  /** User expertise level */
  expertiseLevel: "novice" | "intermediate" | "advanced";
}

/**
 * Face preview props
 */
export interface FacePreviewProps {
  /** Face to preview */
  face: EditableFace;
  /** Show question side or answer side */
  side: "question" | "answer";
  /** Preview size */
  size?: "small" | "medium" | "large";
  /** Interactive mode (allows flipping) */
  interactive?: boolean;
  /** Show scaffolding hints */
  showScaffolding?: boolean;
}

/**
 * Face selector props
 */
export interface FaceSelectorProps {
  /** Available faces */
  faces: EditableFace[];
  /** Currently selected face temp ID */
  selectedFaceTempId: string;
  /** Callback when face is selected */
  onSelect: (faceTempId: string) => void;
  /** Callback to add a new face */
  onAddFace: () => void;
  /** Whether adding is allowed */
  canAdd?: boolean;
}

/**
 * Content primitive editor props
 */
export interface ContentPrimitiveEditorProps {
  /** Primitive to edit */
  primitive: EditablePrimitive;
  /** Callback when primitive is updated */
  onUpdate: (primitive: EditablePrimitive) => void;
  /** Callback when primitive is deleted */
  onDelete: () => void;
  /** Callback when primitive is moved up */
  onMoveUp?: () => void;
  /** Callback when primitive is moved down */
  onMoveDown?: () => void;
  /** Whether move up is available */
  canMoveUp?: boolean;
  /** Whether move down is available */
  canMoveDown?: boolean;
}

/**
 * Depth level selector props
 */
export interface DepthLevelSelectorProps {
  /** Current depth level */
  value: CognitiveDepthLevel;
  /** Callback when depth level changes */
  onChange: (level: CognitiveDepthLevel) => void;
  /** Whether to show descriptions */
  showDescriptions?: boolean;
}

/**
 * Card preview sheet props
 */
export interface CardPreviewSheetProps {
  /** Card to preview */
  card: EditableCard;
  /** Whether the sheet is visible */
  visible: boolean;
  /** Callback when sheet is closed */
  onClose: () => void;
}

// =============================================================================
// FACE TYPE METADATA
// =============================================================================

export const FACE_TYPE_METADATA: Record<CardFaceType, {
  label: string;
  description: string;
  icon: string;
  color: string;
  category: "recognition" | "recall" | "application" | "synthesis" | "meta";
}> = {
  recognition: {
    label: "Recognition",
    description: "Multiple choice or identification",
    icon: "eye-outline",
    color: "#22c55e",
    category: "recognition",
  },
  true_false: {
    label: "True/False",
    description: "Evaluate statement correctness",
    icon: "checkmark-circle-outline",
    color: "#22c55e",
    category: "recognition",
  },
  matching: {
    label: "Matching",
    description: "Match related items",
    icon: "git-compare-outline",
    color: "#22c55e",
    category: "recognition",
  },
  definition: {
    label: "Definition",
    description: "Define the term or concept",
    icon: "book-outline",
    color: "#3b82f6",
    category: "recall",
  },
  recall: {
    label: "Recall",
    description: "Freely recall information",
    icon: "bulb-outline",
    color: "#3b82f6",
    category: "recall",
  },
  cloze: {
    label: "Cloze",
    description: "Fill in the blank",
    icon: "create-outline",
    color: "#3b82f6",
    category: "recall",
  },
  application: {
    label: "Application",
    description: "Apply knowledge to scenarios",
    icon: "hammer-outline",
    color: "#f59e0b",
    category: "application",
  },
  problem_solving: {
    label: "Problem Solving",
    description: "Solve using the concept",
    icon: "calculator-outline",
    color: "#f59e0b",
    category: "application",
  },
  derivation: {
    label: "Derivation",
    description: "Derive from first principles",
    icon: "git-branch-outline",
    color: "#f59e0b",
    category: "application",
  },
  explanation: {
    label: "Explanation",
    description: "Explain why or how",
    icon: "chatbubble-ellipses-outline",
    color: "#f59e0b",
    category: "application",
  },
  synthesis: {
    label: "Synthesis",
    description: "Integrate multiple concepts",
    icon: "git-merge-outline",
    color: "#8b5cf6",
    category: "synthesis",
  },
  comparison: {
    label: "Comparison",
    description: "Compare and contrast",
    icon: "swap-horizontal-outline",
    color: "#8b5cf6",
    category: "synthesis",
  },
  critique: {
    label: "Critique",
    description: "Evaluate and critique",
    icon: "analytics-outline",
    color: "#8b5cf6",
    category: "synthesis",
  },
  transfer: {
    label: "Transfer",
    description: "Apply to novel domain",
    icon: "arrow-forward-outline",
    color: "#8b5cf6",
    category: "synthesis",
  },
  intuition: {
    label: "Intuition",
    description: "Quick intuitive response",
    icon: "flash-outline",
    color: "#ec4899",
    category: "meta",
  },
  self_assessment: {
    label: "Self Assessment",
    description: "Rate your confidence",
    icon: "pulse-outline",
    color: "#ec4899",
    category: "meta",
  },
  teaching: {
    label: "Teaching",
    description: "Explain as if teaching",
    icon: "school-outline",
    color: "#ec4899",
    category: "meta",
  },
  custom: {
    label: "Custom",
    description: "Custom face type",
    icon: "build-outline",
    color: "#6b7280",
    category: "meta",
  },
};

// =============================================================================
// DEPTH LEVEL METADATA (Bloom's Taxonomy Inspired)
// =============================================================================

/** Depth level type for simplified editor use */
export type DepthLevel =
  | "remember"
  | "understand"
  | "apply"
  | "analyze"
  | "evaluate"
  | "create";

export const DEPTH_LEVEL_METADATA: Record<
  DepthLevel,
  {
    label: string;
    shortLabel: string;
    description: string;
    icon: string;
    color: string;
    level: number;
    verbs: string[];
  }
> = {
  remember: {
    label: "Remember",
    shortLabel: "Remember",
    description: "Recall facts and basic concepts",
    icon: "eye-outline",
    color: "#22c55e",
    level: 1,
    verbs: ["define", "list", "recall", "identify", "name", "recognize"],
  },
  understand: {
    label: "Understand",
    shortLabel: "Understand",
    description: "Explain ideas and interpret meaning",
    icon: "book-outline",
    color: "#3b82f6",
    level: 2,
    verbs: ["describe", "explain", "summarize", "paraphrase", "classify"],
  },
  apply: {
    label: "Apply",
    shortLabel: "Apply",
    description: "Use information in new situations",
    icon: "hammer-outline",
    color: "#f59e0b",
    level: 3,
    verbs: ["solve", "use", "demonstrate", "implement", "execute"],
  },
  analyze: {
    label: "Analyze",
    shortLabel: "Analyze",
    description: "Draw connections among ideas",
    icon: "analytics-outline",
    color: "#ef4444",
    level: 4,
    verbs: ["compare", "contrast", "differentiate", "examine", "organize"],
  },
  evaluate: {
    label: "Evaluate",
    shortLabel: "Evaluate",
    description: "Justify decisions or arguments",
    icon: "checkmark-done-outline",
    color: "#8b5cf6",
    level: 5,
    verbs: ["critique", "judge", "assess", "defend", "argue"],
  },
  create: {
    label: "Create",
    shortLabel: "Create",
    description: "Produce new or original work",
    icon: "build-outline",
    color: "#ec4899",
    level: 6,
    verbs: ["design", "construct", "develop", "formulate", "compose"],
  },
};

// =============================================================================
// CONTENT PRIMITIVE TYPE METADATA
// =============================================================================

/** Content primitive type for simplified editor use */
export type ContentPrimitiveTypeSimple =
  | "text"
  | "richtext"
  | "latex"
  | "image"
  | "audio"
  | "video"
  | "code"
  | "cloze"
  | "diagram";

export const CONTENT_PRIMITIVE_METADATA: Record<
  ContentPrimitiveTypeSimple,
  {
    label: string;
    description: string;
    icon: string;
  }
> = {
  text: {
    label: "Text",
    description: "Plain text content",
    icon: "text-outline",
  },
  richtext: {
    label: "Rich Text",
    description: "Formatted text with markdown",
    icon: "document-text-outline",
  },
  latex: {
    label: "LaTeX",
    description: "Mathematical formula",
    icon: "calculator-outline",
  },
  image: {
    label: "Image",
    description: "Image or diagram",
    icon: "image-outline",
  },
  audio: {
    label: "Audio",
    description: "Audio clip",
    icon: "musical-notes-outline",
  },
  video: {
    label: "Video",
    description: "Video clip",
    icon: "videocam-outline",
  },
  code: {
    label: "Code",
    description: "Code snippet",
    icon: "code-slash-outline",
  },
  cloze: {
    label: "Cloze",
    description: "Fill in the blank",
    icon: "create-outline",
  },
  diagram: {
    label: "Diagram",
    description: "Interactive diagram",
    icon: "git-network-outline",
  },
};

// =============================================================================
// PRIMITIVE TYPE METADATA
// =============================================================================

export const PRIMITIVE_TYPE_METADATA: Record<ContentPrimitiveType, {
  label: string;
  description: string;
  icon: string;
}> = {
  text: {
    label: "Text",
    description: "Plain or rich text content",
    icon: "text-outline",
  },
  markdown: {
    label: "Markdown",
    description: "Markdown-formatted text",
    icon: "document-text-outline",
  },
  html: {
    label: "HTML",
    description: "HTML content (sanitized)",
    icon: "code-outline",
  },
  latex: {
    label: "LaTeX",
    description: "Mathematical formula",
    icon: "calculator-outline",
  },
  code: {
    label: "Code",
    description: "Code snippet with syntax highlighting",
    icon: "code-slash-outline",
  },
  image: {
    label: "Image",
    description: "Image or diagram",
    icon: "image-outline",
  },
  audio: {
    label: "Audio",
    description: "Audio clip",
    icon: "musical-notes-outline",
  },
  video: {
    label: "Video",
    description: "Video clip",
    icon: "videocam-outline",
  },
  cloze_region: {
    label: "Cloze",
    description: "Fill in the blank region",
    icon: "create-outline",
  },
  formula: {
    label: "Formula",
    description: "Mathematical formula",
    icon: "calculator-outline",
  },
  diagram: {
    label: "Diagram",
    description: "Interactive diagram",
    icon: "git-network-outline",
  },
  table: {
    label: "Table",
    description: "Data table",
    icon: "grid-outline",
  },
  list: {
    label: "List",
    description: "Ordered or unordered list",
    icon: "list-outline",
  },
  quote: {
    label: "Quote",
    description: "Block quote",
    icon: "chatbox-outline",
  },
  callout: {
    label: "Callout",
    description: "Callout or admonition",
    icon: "alert-circle-outline",
  },
  embed: {
    label: "Embed",
    description: "Embedded content",
    icon: "link-outline",
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate a temporary ID for editing
 */
export function generateTempId(): string {
  return `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a new editable primitive
 */
export function createEditablePrimitive(
  type: ContentPrimitiveTypeSimple = "text",
  order: number = 0
): EditablePrimitive {
  return {
    tempId: generateTempId(),
    type,
    content: "",
    order,
    isNew: true,
    isDirty: true,
  };
}

/**
 * Create a new editable face
 */
export function createEditableFace(
  isDefault: boolean = false,
  order: number = 0
): EditableFace {
  return {
    tempId: generateTempId(),
    name: isDefault ? "Basic" : `Face ${order + 1}`,
    faceType: "recall",
    depthLevel: "understand",
    questionPrimitives: [createEditablePrimitive("text", 0)],
    answerPrimitives: [createEditablePrimitive("text", 0)],
    scaffoldingLevel: 0,
    hints: [],
    isDefault,
    isNew: true,
    isDirty: true,
    isExpanded: true,
  };
}

/**
 * Create a new editable card
 */
export function createEditableCard(): EditableCard {
  const defaultFace = createEditableFace(true, 0);
  return {
    title: "",
    canonicalPrimitives: [],
    faces: [defaultFace],
    defaultFaceTempId: defaultFace.tempId,
    tags: [],
    isNew: true,
    isDirty: true,
  };
}
