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
  MarkdownFlashcardParser,
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
