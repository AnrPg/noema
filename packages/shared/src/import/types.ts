// =============================================================================
// DATA IMPORT SYSTEM - TYPE DEFINITIONS
// =============================================================================
// Comprehensive types for the multi-stage data import pipeline.
// Supports heterogeneous data sources from simple CSV to complex Excel files.

import type { CardId, DeckId, UserId } from "../types/user.types";
import type { CardType, CardContent } from "../types/card.types";

// =============================================================================
// CORE IDENTIFIERS
// =============================================================================

/** Unique identifier for an import session */
export type ImportSessionId = string & { readonly __brand: "ImportSessionId" };

/** Unique identifier for a data source within an import */
export type DataSourceId = string & { readonly __brand: "DataSourceId" };

/** Unique identifier for a sheet/table within a source */
export type SheetId = string & { readonly __brand: "SheetId" };

/** Unique identifier for a detected schema */
export type SchemaId = string & { readonly __brand: "SchemaId" };

/** Unique identifier for a field mapping */
export type MappingId = string & { readonly __brand: "MappingId" };

/** Unique identifier for a preview card */
export type PreviewCardId = string & { readonly __brand: "PreviewCardId" };

// =============================================================================
// IMPORT SESSION - TOP LEVEL ORCHESTRATION
// =============================================================================

/**
 * Import session status
 */
export type ImportSessionStatus =
  | "created" // Session created, awaiting file upload
  | "uploading" // Files being uploaded
  | "analyzing" // Analyzing file structure
  | "schema_detected" // Schema inference complete
  | "awaiting_mapping" // Waiting for user to configure mappings
  | "mapping_complete" // User confirmed mappings
  | "previewing" // Generating preview cards
  | "preview_ready" // Preview available for review
  | "importing" // Actual import in progress
  | "completed" // Import finished successfully
  | "failed" // Import failed
  | "cancelled"; // User cancelled

/**
 * Import mode determines UX complexity and automation level
 */
export type ImportMode =
  | "quick" // Maximum automation, minimal questions
  | "guided" // Step-by-step with smart defaults
  | "expert"; // Full control over every setting

/**
 * Main import session tracking all state
 */
export interface ImportSession {
  readonly id: ImportSessionId;
  readonly userId: UserId;
  readonly status: ImportSessionStatus;
  readonly mode: ImportMode;

  // Data sources
  readonly sources: readonly DataSource[];

  // Detected schemas (one per sheet/table)
  readonly detectedSchemas: readonly DetectedSchema[];

  // User-configured mappings
  readonly mappings: readonly FieldMapping[];

  // Target configuration
  readonly targetConfig: ImportTargetConfig;

  // Preview cards (sample of what will be created)
  readonly previewCards: readonly PreviewCard[];

  // Progress and errors
  readonly progress: ImportProgress;
  readonly issues: readonly ImportIssue[];
  readonly auditLog: readonly ImportAuditEntry[];

  // Timestamps
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
}

/**
 * Target configuration for the import
 */
export interface ImportTargetConfig {
  // Deck settings
  readonly targetDeckId: DeckId | null; // Null = create new deck
  readonly createNewDeck: boolean;
  readonly newDeckName: string | null;
  readonly newDeckDescription: string | null;
  readonly deckHierarchy: DeckHierarchyConfig | null;

  // Card settings
  readonly defaultCardType: CardType;
  readonly cardTypeMapping: ReadonlyMap<string, CardType> | null; // Source type → card type
  readonly defaultTags: readonly string[];
  readonly tagFieldMapping: string | null; // Which field contains tags

  // Duplicate handling
  readonly duplicateStrategy: DuplicateStrategy;
  readonly duplicateMatchFields: readonly string[];

  // Advanced options
  readonly preserveSourceMetadata: boolean;
  readonly generateBidirectional: boolean;
  readonly aiEnhancementLevel: AIEnhancementLevel;
}

/**
 * How to create deck hierarchy from data
 */
export interface DeckHierarchyConfig {
  readonly enabled: boolean;
  readonly sourceField: string; // Field containing hierarchy info
  readonly delimiter: string; // e.g., "::" for "Lang::Spanish::Vocab"
  readonly createMissingParents: boolean;
}

/**
 * Strategy for handling duplicate cards
 */
export type DuplicateStrategy =
  | "skip" // Skip duplicates entirely
  | "update" // Update existing card
  | "create_anyway" // Create duplicate
  | "ask"; // Ask user for each duplicate

/**
 * Level of AI assistance in import
 */
export type AIEnhancementLevel =
  | "none" // No AI processing
  | "detect" // AI helps detect structure/types
  | "suggest" // AI suggests improvements
  | "enhance"; // AI actively improves card quality

// =============================================================================
// DATA SOURCE - RAW INPUT FILES
// =============================================================================

/**
 * A single data source (file) in the import
 */
export interface DataSource {
  readonly id: DataSourceId;
  readonly sessionId: ImportSessionId;

  // File info
  readonly filename: string;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly uploadedAt: Date;

  // Parsed structure
  readonly sourceType: DataSourceType;
  readonly sheets: readonly DataSheet[];

  // Analysis results
  readonly analysisStatus: AnalysisStatus;
  readonly analysisResults: SourceAnalysisResults | null;

  // Raw content access
  readonly storageKey: string;
}

/**
 * Type of data source
 */
export type DataSourceType =
  | "csv"
  | "tsv"
  | "excel"
  | "google_sheets"
  | "json"
  | "yaml"
  | "markdown"
  | "typst"
  | "pdf"
  | "docx"
  | "txt"
  | "html"
  | "anki_apkg"
  | "quizlet_export"
  | "notion_export"
  | "custom";

/**
 * Analysis status for a source
 */
export type AnalysisStatus = "pending" | "analyzing" | "completed" | "failed";

/**
 * A sheet/table within a data source
 */
export interface DataSheet {
  readonly id: SheetId;
  readonly sourceId: DataSourceId;
  readonly name: string;
  readonly index: number;

  // Dimensions
  readonly rowCount: number;
  readonly columnCount: number;

  // Detected structure
  readonly headerRow: number | null; // Which row contains headers (0-indexed)
  readonly dataStartRow: number; // Where actual data starts
  readonly dataEndRow: number; // Where data ends

  // Columns
  readonly columns: readonly DetectedColumn[];

  // Sample data (first N rows for preview)
  readonly sampleRows: readonly DataRow[];

  // Issues specific to this sheet
  readonly issues: readonly SheetIssue[];
}

/**
 * A column detected in the data
 */
export interface DetectedColumn {
  readonly index: number;
  readonly letter: string; // Excel-style: A, B, C, AA, etc.
  readonly headerValue: string | null; // Raw header text
  readonly normalizedName: string; // Cleaned/standardized name

  // Type inference
  readonly inferredType: InferredDataType;
  readonly typeConfidence: number; // 0-1
  readonly nullCount: number;
  readonly uniqueCount: number;

  // Sample values
  readonly sampleValues: readonly CellValue[];

  // Semantic inference
  readonly semanticType: SemanticFieldType | null;
  readonly semanticConfidence: number;

  // Issues
  readonly issues: readonly ColumnIssue[];
}

/**
 * Inferred data type for a column
 */
export type InferredDataType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "date"
  | "datetime"
  | "time"
  | "email"
  | "url"
  | "json"
  | "array"
  | "rich_text"
  | "image_url"
  | "audio_url"
  | "formula"
  | "unknown"
  | "mixed";

/**
 * Semantic type - what the field represents conceptually
 */
export type SemanticFieldType =
  // Card content
  | "question"
  | "answer"
  | "front"
  | "back"
  | "cloze_text"
  | "hint"
  | "mnemonic"
  | "explanation"
  | "example"

  // Media
  | "image"
  | "audio"
  | "video"

  // Metadata
  | "deck_name"
  | "deck_path"
  | "tags"
  | "source"
  | "notes"
  | "difficulty"
  | "priority"

  // Scheduling
  | "due_date"
  | "interval"
  | "ease_factor"
  | "review_count"
  | "last_review"

  // Identifiers
  | "card_id"
  | "external_id"

  // Other
  | "category"
  | "chapter"
  | "page_number"
  | "unknown";

/**
 * A row of data
 */
export interface DataRow {
  readonly rowIndex: number;
  readonly cells: readonly CellValue[];
  readonly rowType: RowType;
  readonly issues: readonly RowIssue[];
}

/**
 * Type of row
 */
export type RowType =
  | "header"
  | "data"
  | "empty"
  | "merged"
  | "subtotal"
  | "comment"
  | "unknown";

/**
 * A cell value with metadata
 */
export interface CellValue {
  readonly columnIndex: number;
  readonly rawValue: unknown;
  readonly displayValue: string;
  readonly formattedValue: string | null;
  readonly formula: string | null;
  readonly dataType: InferredDataType;
  readonly style: CellStyle | null;
  readonly isNull: boolean;
  readonly isMerged: boolean;
  readonly mergeSpan: MergeSpan | null;
}

/**
 * Cell styling (for Excel/formatted sources)
 */
export interface CellStyle {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly strikethrough: boolean;
  readonly fontColor: string | null;
  readonly backgroundColor: string | null;
  readonly fontSize: number | null;
  readonly alignment: string | null;
}

/**
 * Merged cell span
 */
export interface MergeSpan {
  readonly startRow: number;
  readonly endRow: number;
  readonly startCol: number;
  readonly endCol: number;
}

// =============================================================================
// SOURCE ANALYSIS RESULTS
// =============================================================================

/**
 * Results of analyzing a data source
 */
export interface SourceAnalysisResults {
  readonly sourceId: DataSourceId;
  readonly analyzedAt: Date;
  readonly analysisDurationMs: number;

  // File-level insights
  readonly encoding: string;
  readonly delimiter: string | null; // For CSV/TSV
  readonly lineEnding: string;
  readonly hasHeaderRow: boolean;
  readonly headerRowIndex: number | null;

  // Content insights
  readonly totalRows: number;
  readonly totalColumns: number;
  readonly emptyRows: number;
  readonly inconsistentRows: number;

  // Quality metrics
  readonly dataQualityScore: number; // 0-100
  readonly completenessScore: number; // 0-100
  readonly consistencyScore: number; // 0-100

  // AI suggestions
  readonly suggestedSchema: DetectedSchema | null;
  readonly suggestedMappings: readonly SuggestedMapping[];
  readonly suggestedCardType: CardType | null;

  // Detected patterns
  readonly patterns: readonly DetectedPattern[];

  // Potential issues
  readonly warnings: readonly AnalysisWarning[];
}

/**
 * A pattern detected in the data
 */
export interface DetectedPattern {
  readonly type: PatternType;
  readonly description: string;
  readonly confidence: number;
  readonly affectedColumns: readonly number[];
  readonly suggestion: string | null;
}

/**
 * Types of patterns we detect
 */
export type PatternType =
  | "qa_pairs" // Q&A format detected
  | "cloze_deletions" // Text with cloze syntax
  | "numbered_lists" // Ordered steps/items
  | "key_value_pairs" // Term: Definition format
  | "hierarchical_categories" // Nested categories
  | "comparison_table" // Multiple items being compared
  | "process_steps" // Sequential process
  | "vocabulary_list" // Foreign language vocab
  | "formula_definitions" // Math/science formulas
  | "code_snippets" // Programming code
  | "timeline_events" // Historical events
  | "flashcard_format" // Already in flashcard format
  | "mixed_content"; // Multiple formats

/**
 * Warning from analysis
 */
export interface AnalysisWarning {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly details: string | null;
  readonly affectedRows: readonly number[];
  readonly suggestion: string | null;
}

// =============================================================================
// SCHEMA DETECTION
// =============================================================================

/**
 * A detected schema for a data source
 */
export interface DetectedSchema {
  readonly id: SchemaId;
  readonly sourceId: DataSourceId;
  readonly sheetId: SheetId;

  // Schema structure
  readonly fields: readonly SchemaField[];
  readonly primaryKeyFields: readonly string[];
  readonly suggestedCardType: CardType;

  // Confidence
  readonly overallConfidence: number;

  // Validation
  readonly isValid: boolean;
  readonly validationIssues: readonly string[];
}

/**
 * A field in the detected schema
 */
export interface SchemaField {
  readonly name: string;
  readonly sourceColumnIndex: number;
  readonly dataType: InferredDataType;
  readonly semanticType: SemanticFieldType | null;
  readonly isRequired: boolean;
  readonly isUnique: boolean;
  readonly defaultValue: unknown | null;
  readonly validValues: readonly unknown[] | null; // Enum-like constraints
  readonly validation: FieldValidation | null;
}

/**
 * Validation rules for a field
 */
export interface FieldValidation {
  readonly minLength: number | null;
  readonly maxLength: number | null;
  readonly minValue: number | null;
  readonly maxValue: number | null;
  readonly pattern: string | null; // Regex pattern
  readonly customValidation: string | null; // Custom validation function name
}

// =============================================================================
// FIELD MAPPING - USER CONFIGURATION
// =============================================================================

/**
 * User-configured field mapping
 */
export interface FieldMapping {
  readonly id: MappingId;
  readonly sessionId: ImportSessionId;
  readonly sheetId: SheetId;

  // Source
  readonly sourceColumnIndex: number;
  readonly sourceColumnName: string;

  // Target
  readonly targetField: CardTargetField;
  readonly targetCardType: CardType | null; // Null = applies to all types

  // Transformation
  readonly transformation: FieldTransformation | null;

  // Validation
  readonly isValid: boolean;
  readonly validationErrors: readonly string[];

  // Metadata
  readonly isAutoSuggested: boolean;
  readonly userConfirmed: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Target fields for card mapping
 */
export type CardTargetField =
  // Core content
  | "front"
  | "back"
  | "cloze_text"
  | "hint"
  | "mnemonic"
  | "explanation"
  | "notes"

  // Media
  | "front_image"
  | "back_image"
  | "audio"

  // Metadata
  | "tags"
  | "deck"
  | "source"
  | "difficulty"

  // Scheduling (for imports with existing schedule data)
  | "due_date"
  | "interval"
  | "ease_factor"
  | "review_count"

  // Special
  | "ignore" // Don't import this field
  | "custom"; // Custom handling

/**
 * Transformation to apply during mapping
 */
export interface FieldTransformation {
  readonly type: TransformationType;
  readonly config: TransformationConfig;
}

/**
 * Types of transformations available
 */
export type TransformationType =
  | "none"
  | "trim"
  | "lowercase"
  | "uppercase"
  | "capitalize"
  | "strip_html"
  | "markdown_to_html"
  | "html_to_markdown"
  | "split_tags"
  | "join_multiple"
  | "regex_replace"
  | "template"
  | "cloze_convert"
  | "date_format"
  | "number_format"
  | "custom";

/**
 * Configuration for transformations
 */
export interface TransformationConfig {
  // For regex_replace
  readonly pattern?: string;
  readonly replacement?: string;

  // For split_tags
  readonly delimiter?: string;

  // For join_multiple
  readonly joinWith?: string;
  readonly sourceFields?: readonly number[];

  // For template
  readonly template?: string; // e.g., "{{front}} - {{back}}"

  // For date_format
  readonly inputFormat?: string;
  readonly outputFormat?: string;

  // For cloze_convert
  readonly clozeStyle?: "anki" | "manthanein" | "markdown";

  // For custom
  readonly customFunction?: string;
}

/**
 * Suggested mapping from AI/heuristics
 */
export interface SuggestedMapping {
  readonly sourceColumnIndex: number;
  readonly sourceColumnName: string;
  readonly suggestedTarget: CardTargetField;
  readonly suggestedCardType: CardType | null;
  readonly confidence: number;
  readonly reasoning: string;
  readonly alternatives: readonly {
    readonly target: CardTargetField;
    readonly confidence: number;
  }[];
}

// =============================================================================
// PREVIEW CARDS
// =============================================================================

/**
 * Preview of a card that would be created
 */
export interface PreviewCard {
  readonly id: PreviewCardId;
  readonly sessionId: ImportSessionId;
  readonly sourceRowIndex: number;
  readonly sheetId: SheetId;

  // Card content
  readonly cardType: CardType;
  readonly content: Partial<CardContent>;
  readonly tags: readonly string[];
  readonly targetDeck: string;

  // Quality indicators
  readonly qualityScore: number; // 0-100
  readonly qualityIssues: readonly CardQualityIssue[];

  // Status
  readonly status: PreviewCardStatus;
  readonly userAction: PreviewCardAction | null;

  // Duplicate detection
  readonly potentialDuplicates: readonly PotentialDuplicate[];

  // Source reference
  readonly sourceData: Record<string, unknown>;
}

/**
 * Status of a preview card
 */
export type PreviewCardStatus =
  | "pending" // Awaiting user review
  | "approved" // User approved
  | "modified" // User modified content
  | "rejected" // User rejected
  | "flagged"; // Flagged for review

/**
 * User action on a preview card
 */
export type PreviewCardAction =
  | "approve"
  | "approve_with_edit"
  | "reject"
  | "skip"
  | "flag";

/**
 * Quality issue detected in a preview card
 */
export interface CardQualityIssue {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly field: string;
  readonly message: string;
  readonly suggestion: string | null;
  readonly autoFixable: boolean;
}

/**
 * Potential duplicate card
 */
export interface PotentialDuplicate {
  readonly existingCardId: CardId;
  readonly similarity: number; // 0-1
  readonly matchedFields: readonly string[];
}

// =============================================================================
// IMPORT PROGRESS & ISSUES
// =============================================================================

/**
 * Import progress tracking
 */
export interface ImportProgress {
  readonly phase: ImportPhase;
  readonly phaseName: string;
  readonly phaseProgress: number; // 0-100
  readonly overallProgress: number; // 0-100

  // Counts
  readonly totalRows: number;
  readonly processedRows: number;
  readonly successfulCards: number;
  readonly skippedCards: number;
  readonly failedCards: number;
  readonly duplicatesFound: number;

  // Timing
  readonly startedAt: Date | null;
  readonly estimatedCompletion: Date | null;
  readonly currentRate: number; // Cards per second
}

/**
 * Import phase
 */
export type ImportPhase =
  | "idle"
  | "uploading"
  | "analyzing"
  | "detecting_schema"
  | "awaiting_mapping"
  | "generating_preview"
  | "awaiting_confirmation"
  | "creating_decks"
  | "creating_cards"
  | "post_processing"
  | "completed"
  | "failed";

/**
 * An issue encountered during import
 */
export interface ImportIssue {
  readonly id: string;
  readonly timestamp: Date;
  readonly phase: ImportPhase;
  readonly severity: "info" | "warning" | "error" | "critical";
  readonly code: string;
  readonly message: string;
  readonly details: string | null;

  // Location info
  readonly sourceId: DataSourceId | null;
  readonly sheetId: SheetId | null;
  readonly rowIndex: number | null;
  readonly columnIndex: number | null;

  // Resolution
  readonly isResolved: boolean;
  readonly resolution: string | null;
  readonly canAutoResolve: boolean;
  readonly suggestedAction: string | null;
}

/**
 * Audit log entry
 */
export interface ImportAuditEntry {
  readonly timestamp: Date;
  readonly action: ImportAuditAction;
  readonly userId: UserId;
  readonly details: Record<string, unknown>;
}

/**
 * Audit actions
 */
export type ImportAuditAction =
  | "session_created"
  | "file_uploaded"
  | "analysis_started"
  | "analysis_completed"
  | "schema_detected"
  | "mapping_configured"
  | "mapping_confirmed"
  | "preview_generated"
  | "cards_approved"
  | "cards_rejected"
  | "import_started"
  | "import_completed"
  | "import_failed"
  | "import_cancelled"
  | "settings_changed";

// =============================================================================
// ISSUE TYPES
// =============================================================================

/**
 * Sheet-level issue
 */
export interface SheetIssue {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly rowRange: { start: number; end: number } | null;
  readonly columnRange: { start: number; end: number } | null;
}

/**
 * Column-level issue
 */
export interface ColumnIssue {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly affectedRows: readonly number[];
}

/**
 * Row-level issue
 */
export interface RowIssue {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly columnIndex: number | null;
}

// =============================================================================
// IMPORT RESULT
// =============================================================================

/**
 * Final result of an import
 */
export interface ImportResult {
  readonly sessionId: ImportSessionId;
  readonly success: boolean;
  readonly completedAt: Date;
  readonly durationMs: number;

  // Created items
  readonly createdDecks: readonly {
    readonly id: DeckId;
    readonly name: string;
    readonly cardCount: number;
  }[];
  readonly createdCards: number;
  readonly updatedCards: number;
  readonly skippedCards: number;

  // Issues
  readonly errors: readonly ImportIssue[];
  readonly warnings: readonly ImportIssue[];

  // Undo capability
  readonly canUndo: boolean;
  readonly undoDeadline: Date | null;

  // Statistics
  readonly stats: ImportStatistics;
}

/**
 * Statistics about the import
 */
export interface ImportStatistics {
  readonly totalSourceRows: number;
  readonly totalCardsAttempted: number;
  readonly totalCardsCreated: number;
  readonly cardsByType: Record<CardType, number>;
  readonly cardsByDeck: Record<string, number>;
  readonly duplicatesHandled: number;
  readonly transformationsApplied: number;
  readonly averageCardQualityScore: number;
}

// =============================================================================
// UX GUIDANCE & WORKFLOW TYPES
// =============================================================================

/**
 * Import step for UX guidance
 */
export type ImportStep =
  | "select_files"
  | "review_files"
  | "configure_mapping"
  | "target_settings"
  | "preview_cards"
  | "confirm_import"
  | "import_progress"
  | "import_complete";

/**
 * Step definition with guidance for UI
 */
export interface ImportStepDefinition {
  readonly step: ImportStep;
  readonly title: string;
  readonly description: string;
  readonly helpText: string | null;
  readonly isOptional: boolean;
  readonly canSkip: boolean;
  readonly estimatedDuration: string; // e.g., "30 seconds", "1-2 minutes"
  readonly prerequisites: readonly ImportStep[];
}

/**
 * Workflow configuration based on import mode
 */
export interface ImportWorkflowConfig {
  readonly mode: ImportMode;
  readonly steps: readonly ImportStepDefinition[];
  readonly allowStepSkipping: boolean;
  readonly showProgressIndicator: boolean;
  readonly autoAdvanceOnComplete: boolean;
  readonly confirmBeforeAdvance: boolean;
}

/**
 * UX state for tracking wizard progress
 */
export interface ImportWizardState {
  readonly currentStep: ImportStep;
  readonly completedSteps: readonly ImportStep[];
  readonly skippedSteps: readonly ImportStep[];
  readonly validationState: Record<ImportStep, StepValidationState>;
  readonly canProceed: boolean;
  readonly canGoBack: boolean;
  readonly blockers: readonly string[];
}

/**
 * Validation state for a step
 */
export interface StepValidationState {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly isPending: boolean;
}

/**
 * Help content for a specific context
 */
export interface ImportHelpContent {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly type: "tooltip" | "popover" | "modal" | "inline";
  readonly mediaUrl: string | null; // Video or image URL
  readonly learnMoreUrl: string | null;
}

/**
 * Quick action for common operations
 */
export interface ImportQuickAction {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly action:
    | "apply_suggestions"
    | "auto_map"
    | "clear_mappings"
    | "swap_front_back"
    | "bulk_tag"
    | "preview_all";
  readonly isDestructive: boolean;
  readonly requiresConfirmation: boolean;
}

/**
 * Import template for reusable configurations
 */
export interface ImportTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly sourceType: DataSourceType | "any";
  readonly targetConfig: Partial<ImportTargetConfig>;
  readonly mappingRules: readonly MappingRule[];
  readonly transformations: readonly FieldTransformation[];
  readonly createdAt: Date;
  readonly lastUsedAt: Date | null;
  readonly useCount: number;
  readonly isBuiltIn: boolean;
  readonly isShared: boolean;
}

/**
 * Rule for automatic mapping
 */
export interface MappingRule {
  readonly id: string;
  readonly name: string;
  readonly condition: MappingCondition;
  readonly target: CardTargetField;
  readonly transformation: FieldTransformation | null;
  readonly priority: number;
}

/**
 * Condition for applying a mapping rule
 */
export interface MappingCondition {
  readonly type:
    | "header_name"
    | "header_pattern"
    | "data_type"
    | "semantic_type"
    | "column_index";
  readonly value: string | number;
  readonly operator:
    | "equals"
    | "contains"
    | "starts_with"
    | "ends_with"
    | "matches"
    | "greater_than"
    | "less_than";
  readonly caseSensitive: boolean;
}

/**
 * Import history entry for recent imports
 */
export interface ImportHistoryEntry {
  readonly sessionId: ImportSessionId;
  readonly filename: string;
  readonly sourceType: DataSourceType;
  readonly importedAt: Date;
  readonly cardCount: number;
  readonly deckName: string;
  readonly status: "success" | "partial" | "failed";
  readonly templateUsed: string | null;
  readonly canReimport: boolean;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Create branded ID type
 */
export function createImportSessionId(id: string): ImportSessionId {
  return id as ImportSessionId;
}

export function createDataSourceId(id: string): DataSourceId {
  return id as DataSourceId;
}

export function createSheetId(id: string): SheetId {
  return id as SheetId;
}

export function createSchemaId(id: string): SchemaId {
  return id as SchemaId;
}

export function createMappingId(id: string): MappingId {
  return id as MappingId;
}

export function createPreviewCardId(id: string): PreviewCardId {
  return id as PreviewCardId;
}
