// =============================================================================
// DATA IMPORT MODULE - PUBLIC API
// =============================================================================
// Comprehensive data import system for Manthanein.
// Handles heterogeneous data sources and converts them to flashcards.

// Core types
export type {
  // Session types
  ImportSessionId,
  ImportSessionStatus,
  ImportMode,
  ImportSession,
  ImportTargetConfig,
  DuplicateStrategy,
  AIEnhancementLevel,
  DeckHierarchyConfig,

  // Data source types
  DataSourceId,
  DataSourceType,
  DataSource,
  AnalysisStatus,

  // Sheet types
  SheetId,
  DataSheet,
  DataRow,
  RowType,

  // Column types
  DetectedColumn,
  InferredDataType,
  SemanticFieldType,

  // Cell types
  CellValue,
  CellStyle,
  MergeSpan,

  // Schema types
  SchemaId,
  DetectedSchema,
  SchemaField,
  FieldValidation,

  // Mapping types
  MappingId,
  FieldMapping,
  CardTargetField,
  TransformationType,
  FieldTransformation,
  TransformationConfig,
  SuggestedMapping,

  // Preview types
  PreviewCardId,
  PreviewCard,
  PreviewCardStatus,
  PreviewCardAction,
  CardQualityIssue,
  PotentialDuplicate,

  // Progress types
  ImportProgress,
  ImportPhase,

  // Issue types
  ImportIssue,
  SheetIssue,
  ColumnIssue,
  RowIssue,

  // Analysis types
  SourceAnalysisResults,
  DetectedPattern,
  PatternType,
  AnalysisWarning,

  // Result types
  ImportResult,
  ImportStatistics,

  // Audit types
  ImportAuditEntry,
  ImportAuditAction,

  // UX guidance types
  ImportStep,
  ImportStepDefinition,
  ImportWorkflowConfig,
  ImportWizardState,
  StepValidationState,
  ImportHelpContent,
  ImportQuickAction,
  ImportTemplate,
  MappingRule,
  MappingCondition,
  ImportHistoryEntry,
} from "./types";

// ID creation utilities
export {
  createImportSessionId,
  createDataSourceId,
  createSheetId,
  createSchemaId,
  createMappingId,
  createPreviewCardId,
} from "./types";

// Schema inference
export {
  SchemaInferenceEngine,
  DEFAULT_INFERENCE_CONFIG,
  type SchemaInferenceConfig,
} from "./schema-inference";

// Parsers
export {
  CSVParser,
  JSONParser,
  YAMLParser,
  MarkdownFlashcardParser,
  TypstParser,
  ExcelParser,
  PDFParser,
  PlainTextParser,
  ParserRegistry,
  parserRegistry,
  DEFAULT_PARSE_OPTIONS,
  type DataParser,
  type ParseOptions,
  type ParseResult,
  type ParseError,
} from "./parsers";

// Session management
export {
  ImportSessionManager,
  ImportError,
  type ImportSessionEvent,
  type ImportEventListener,
  type ImportSessionStorage,
  type CardStorage,
  type ImportManagerConfig,
} from "./session-manager";

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

import { parserRegistry, type ParseResult, type ParseOptions } from "./parsers";
import { SchemaInferenceEngine } from "./schema-inference";
import type { DetectedSchema, DataSheet } from "./types";

/**
 * Quick parse a file and return parsed sheets
 */
export async function parseFile(
  content: ArrayBuffer | string,
  filename: string,
  mimeType?: string,
  options?: Partial<ParseOptions>,
): Promise<ParseResult> {
  return parserRegistry.parse(content, filename, mimeType, options);
}

/**
 * Quick analyze a sheet and detect its schema
 */
export function analyzeSheet(sheet: DataSheet): DetectedSchema {
  const engine = new SchemaInferenceEngine();
  return engine.analyzeSheet(sheet);
}

/**
 * Check if a file type is supported
 */
export function isFileTypeSupported(
  filename: string,
  mimeType?: string,
): boolean {
  return parserRegistry.findParser(filename, mimeType) !== null;
}

/**
 * Get all supported file extensions
 */
export function getSupportedExtensions(): string[] {
  return parserRegistry.getSupportedExtensions();
}

/**
 * Get all supported MIME types
 */
export function getSupportedMimeTypes(): string[] {
  return parserRegistry.getSupportedMimeTypes();
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

import type {
  ImportSession,
  DataSource,
  FieldMapping,
  PreviewCard,
} from "./types";

/**
 * Check if a value is an ImportSession
 */
export function isImportSession(value: unknown): value is ImportSession {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.status === "string" &&
    Array.isArray(obj.sources) &&
    typeof obj.targetConfig === "object"
  );
}

/**
 * Check if a value is a DataSource
 */
export function isDataSource(value: unknown): value is DataSource {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.filename === "string" &&
    Array.isArray(obj.sheets)
  );
}

/**
 * Check if a value is a FieldMapping
 */
export function isFieldMapping(value: unknown): value is FieldMapping {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.sourceColumnIndex === "number" &&
    typeof obj.targetField === "string"
  );
}

/**
 * Check if a value is a PreviewCard
 */
export function isPreviewCard(value: unknown): value is PreviewCard {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.cardType === "string" &&
    typeof obj.status === "string"
  );
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default card target fields with labels
 */
export const CARD_TARGET_FIELDS = [
  { value: "front", label: "Front (Question)", group: "content" },
  { value: "back", label: "Back (Answer)", group: "content" },
  { value: "cloze_text", label: "Cloze Text", group: "content" },
  { value: "hint", label: "Hint", group: "content" },
  { value: "mnemonic", label: "Mnemonic", group: "content" },
  { value: "explanation", label: "Explanation", group: "content" },
  { value: "notes", label: "Notes", group: "content" },
  { value: "front_image", label: "Front Image", group: "media" },
  { value: "back_image", label: "Back Image", group: "media" },
  { value: "audio", label: "Audio", group: "media" },
  { value: "tags", label: "Tags", group: "metadata" },
  { value: "deck", label: "Deck Name", group: "metadata" },
  { value: "source", label: "Source/Reference", group: "metadata" },
  { value: "difficulty", label: "Difficulty", group: "metadata" },
  { value: "due_date", label: "Due Date", group: "scheduling" },
  { value: "interval", label: "Interval", group: "scheduling" },
  { value: "ease_factor", label: "Ease Factor", group: "scheduling" },
  { value: "review_count", label: "Review Count", group: "scheduling" },
  { value: "ignore", label: "Ignore (Don't Import)", group: "special" },
] as const;

/**
 * Available transformation types with labels
 */
export const TRANSFORMATION_TYPES = [
  { value: "none", label: "No transformation" },
  { value: "trim", label: "Trim whitespace" },
  { value: "lowercase", label: "Convert to lowercase" },
  { value: "uppercase", label: "Convert to UPPERCASE" },
  { value: "capitalize", label: "Capitalize first letter" },
  { value: "strip_html", label: "Remove HTML tags" },
  { value: "markdown_to_html", label: "Convert Markdown to HTML" },
  { value: "html_to_markdown", label: "Convert HTML to Markdown" },
  { value: "split_tags", label: "Split into tags" },
  { value: "regex_replace", label: "Replace with regex" },
  { value: "cloze_convert", label: "Convert cloze syntax" },
] as const;

/**
 * Import modes with descriptions
 */
export const IMPORT_MODES = [
  {
    value: "quick",
    label: "Quick Import",
    description:
      "Maximum automation with smart defaults. Best for clean, simple data.",
  },
  {
    value: "guided",
    label: "Guided Import",
    description:
      "Step-by-step process with suggestions. Recommended for most imports.",
  },
  {
    value: "expert",
    label: "Expert Mode",
    description:
      "Full control over every setting. For complex or unusual data formats.",
  },
] as const;

/**
 * Duplicate handling strategies with descriptions
 */
export const DUPLICATE_STRATEGIES = [
  {
    value: "skip",
    label: "Skip duplicates",
    description: "Don't import cards that already exist",
  },
  {
    value: "update",
    label: "Update existing",
    description: "Update existing cards with new content",
  },
  {
    value: "create_anyway",
    label: "Create anyway",
    description: "Import as new cards even if duplicates exist",
  },
  {
    value: "ask",
    label: "Ask for each",
    description: "Review each duplicate individually",
  },
] as const;

// =============================================================================
// UX GUIDANCE CONSTANTS
// =============================================================================

import type {
  ImportStepDefinition,
  ImportWorkflowConfig,
  ImportQuickAction,
  ImportHelpContent,
  ImportMode,
} from "./types";
import type { ImportPreferences } from "../types/user.types";

/**
 * Import step definitions for UX guidance
 */
export const IMPORT_STEP_DEFINITIONS: readonly ImportStepDefinition[] = [
  {
    step: "select_files",
    title: "Select Files",
    description: "Choose files to import",
    helpText:
      "Drag and drop files or click to browse. Supports CSV, JSON, Markdown, and more.",
    isOptional: false,
    canSkip: false,
    estimatedDuration: "10 seconds",
    prerequisites: [],
  },
  {
    step: "review_files",
    title: "Review Files",
    description: "Check detected structure",
    helpText: "Verify headers, data types, and row counts are correct.",
    isOptional: true,
    canSkip: true,
    estimatedDuration: "30 seconds",
    prerequisites: ["select_files"],
  },
  {
    step: "configure_mapping",
    title: "Map Fields",
    description: "Connect columns to card fields",
    helpText:
      "Map each column from your file to the corresponding card field (front, back, tags, etc.).",
    isOptional: false,
    canSkip: false,
    estimatedDuration: "1-2 minutes",
    prerequisites: ["select_files"],
  },
  {
    step: "target_settings",
    title: "Target Settings",
    description: "Choose deck and options",
    helpText:
      "Select target deck, card type, and configure duplicate handling.",
    isOptional: false,
    canSkip: false,
    estimatedDuration: "30 seconds",
    prerequisites: ["configure_mapping"],
  },
  {
    step: "preview_cards",
    title: "Preview Cards",
    description: "Review before importing",
    helpText: "Check sample cards and make adjustments if needed.",
    isOptional: true,
    canSkip: true,
    estimatedDuration: "1-3 minutes",
    prerequisites: ["target_settings"],
  },
  {
    step: "confirm_import",
    title: "Confirm Import",
    description: "Final review and start",
    helpText: "Review summary and confirm to begin import.",
    isOptional: false,
    canSkip: false,
    estimatedDuration: "10 seconds",
    prerequisites: ["target_settings"],
  },
  {
    step: "import_progress",
    title: "Importing",
    description: "Creating cards...",
    helpText: null,
    isOptional: false,
    canSkip: false,
    estimatedDuration: "Varies",
    prerequisites: ["confirm_import"],
  },
  {
    step: "import_complete",
    title: "Complete",
    description: "Import finished",
    helpText: "Your cards have been imported successfully.",
    isOptional: false,
    canSkip: false,
    estimatedDuration: "N/A",
    prerequisites: ["import_progress"],
  },
];

/**
 * Workflow configurations for each import mode
 */
export const IMPORT_WORKFLOW_CONFIGS: Record<ImportMode, ImportWorkflowConfig> =
  {
    quick: {
      mode: "quick",
      steps: IMPORT_STEP_DEFINITIONS.filter((s) =>
        [
          "select_files",
          "confirm_import",
          "import_progress",
          "import_complete",
        ].includes(s.step),
      ),
      allowStepSkipping: false,
      showProgressIndicator: false,
      autoAdvanceOnComplete: true,
      confirmBeforeAdvance: false,
    },
    guided: {
      mode: "guided",
      steps: IMPORT_STEP_DEFINITIONS,
      allowStepSkipping: true,
      showProgressIndicator: true,
      autoAdvanceOnComplete: false,
      confirmBeforeAdvance: true,
    },
    expert: {
      mode: "expert",
      steps: IMPORT_STEP_DEFINITIONS,
      allowStepSkipping: true,
      showProgressIndicator: true,
      autoAdvanceOnComplete: false,
      confirmBeforeAdvance: false,
    },
  };

/**
 * Quick actions for import UI
 */
export const IMPORT_QUICK_ACTIONS: readonly ImportQuickAction[] = [
  {
    id: "apply_suggestions",
    label: "Apply Suggestions",
    description: "Apply all AI-suggested field mappings",
    icon: "wand",
    action: "apply_suggestions",
    isDestructive: false,
    requiresConfirmation: false,
  },
  {
    id: "auto_map",
    label: "Auto-Map Fields",
    description: "Automatically detect and map fields",
    icon: "sparkles",
    action: "auto_map",
    isDestructive: false,
    requiresConfirmation: false,
  },
  {
    id: "clear_mappings",
    label: "Clear All Mappings",
    description: "Remove all current field mappings",
    icon: "trash",
    action: "clear_mappings",
    isDestructive: true,
    requiresConfirmation: true,
  },
  {
    id: "swap_front_back",
    label: "Swap Front & Back",
    description: "Exchange front and back field mappings",
    icon: "swap",
    action: "swap_front_back",
    isDestructive: false,
    requiresConfirmation: false,
  },
  {
    id: "bulk_tag",
    label: "Add Tags to All",
    description: "Apply tags to all cards being imported",
    icon: "tag",
    action: "bulk_tag",
    isDestructive: false,
    requiresConfirmation: false,
  },
  {
    id: "preview_all",
    label: "Preview All Cards",
    description: "Generate preview for all rows",
    icon: "eye",
    action: "preview_all",
    isDestructive: false,
    requiresConfirmation: false,
  },
];

/**
 * Help content for import workflow
 */
export const IMPORT_HELP_CONTENT: readonly ImportHelpContent[] = [
  {
    id: "file_formats",
    title: "Supported File Formats",
    content:
      "We support CSV, TSV, JSON, and Markdown files. Excel support coming soon. For best results, ensure your file has clear headers.",
    type: "popover",
    mediaUrl: null,
    learnMoreUrl: "/docs/import/file-formats",
  },
  {
    id: "field_mapping",
    title: "Understanding Field Mapping",
    content:
      "Field mapping connects columns in your file to card fields. 'Front' is the question, 'Back' is the answer. You can map multiple columns to tags or notes.",
    type: "modal",
    mediaUrl: null,
    learnMoreUrl: "/docs/import/field-mapping",
  },
  {
    id: "duplicate_handling",
    title: "Handling Duplicates",
    content:
      "Duplicates are detected by comparing front content. Choose 'Skip' to ignore duplicates, 'Update' to refresh existing cards, or 'Ask' to review each one.",
    type: "popover",
    mediaUrl: null,
    learnMoreUrl: "/docs/import/duplicates",
  },
  {
    id: "quality_score",
    title: "Card Quality Score",
    content:
      "Quality score indicates how well-formed a card is. Cards with empty fronts or very short content score lower. Aim for 70+ for good results.",
    type: "tooltip",
    mediaUrl: null,
    learnMoreUrl: null,
  },
  {
    id: "cloze_syntax",
    title: "Cloze Deletion Syntax",
    content:
      "Use {{c1::text}} for Anki-style or {{text}} for simple cloze deletions. Multiple clozes use c1, c2, c3, etc.",
    type: "popover",
    mediaUrl: null,
    learnMoreUrl: "/docs/cards/cloze",
  },
];

/**
 * Default import preferences
 */
export const DEFAULT_IMPORT_PREFERENCES: ImportPreferences = {
  defaultImportMode: "guided",
  rememberLastMode: true,
  defaultDuplicateStrategy: "skip",
  defaultCardType: "atomic",
  defaultTags: [],
  preserveSourceMetadata: true,
  autoAnalyzeOnUpload: true,
  autoApplySuggestions: false,
  autoTrimWhitespace: true,
  autoDetectHeaders: true,
  minimumQualityScore: 60,
  requireManualReviewForLowQuality: true,
  showPreviewByDefault: true,
  preferredEncoding: "auto",
  preferredDelimiter: "auto",
  maxPreviewRows: 100,
  aiAssistanceLevel: "suggest",
  useAIForFieldMapping: true,
  useAIForCardEnhancement: false,
  saveImportHistory: true,
  reuseLastMappings: true,
  maxHistoryEntries: 50,
};

/**
 * Supported file extensions with descriptions
 */
export const SUPPORTED_FILE_TYPES = [
  // Spreadsheet/Tabular formats
  {
    extension: "csv",
    label: "CSV (Comma-Separated)",
    mimeType: "text/csv",
    description: "Most common spreadsheet format",
  },
  {
    extension: "tsv",
    label: "TSV (Tab-Separated)",
    mimeType: "text/tab-separated-values",
    description: "Tab-delimited data",
  },
  {
    extension: "xlsx",
    label: "Excel (XLSX)",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    description: "Modern Excel spreadsheet",
  },
  {
    extension: "xls",
    label: "Excel (XLS)",
    mimeType: "application/vnd.ms-excel",
    description: "Legacy Excel format",
  },

  // Structured data formats
  {
    extension: "json",
    label: "JSON",
    mimeType: "application/json",
    description: "Structured data format",
  },
  {
    extension: "yaml",
    label: "YAML",
    mimeType: "text/yaml",
    description: "Human-readable data serialization",
  },
  {
    extension: "yml",
    label: "YAML",
    mimeType: "text/yaml",
    description: "Human-readable data serialization",
  },

  // Document/Markup formats
  {
    extension: "md",
    label: "Markdown",
    mimeType: "text/markdown",
    description: "Formatted text with flashcard syntax",
  },
  {
    extension: "markdown",
    label: "Markdown",
    mimeType: "text/markdown",
    description: "Formatted text with flashcard syntax",
  },
  {
    extension: "typ",
    label: "Typst",
    mimeType: "text/typst",
    description: "Modern typesetting markup",
  },
  {
    extension: "typst",
    label: "Typst",
    mimeType: "text/typst",
    description: "Modern typesetting markup",
  },

  // Binary document formats
  {
    extension: "pdf",
    label: "PDF",
    mimeType: "application/pdf",
    description: "Portable Document Format (text extraction)",
  },

  // Plain text formats
  {
    extension: "txt",
    label: "Plain Text",
    mimeType: "text/plain",
    description: "Simple text files with auto-detection",
  },
  {
    extension: "text",
    label: "Plain Text",
    mimeType: "text/plain",
    description: "Simple text files",
  },
] as const;

/**
 * AI assistance levels with descriptions
 */
export const AI_ASSISTANCE_LEVELS = [
  {
    value: "none",
    label: "No AI",
    description: "Manual mapping only, no AI assistance",
  },
  {
    value: "detect",
    label: "Detection Only",
    description: "AI helps detect file structure and data types",
  },
  {
    value: "suggest",
    label: "Suggestions",
    description: "AI suggests field mappings and improvements",
  },
  {
    value: "enhance",
    label: "Full Enhancement",
    description: "AI actively improves card quality and content",
  },
] as const;
