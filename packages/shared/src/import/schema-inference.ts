// =============================================================================
// SCHEMA INFERENCE ENGINE
// =============================================================================
// Automatically detects and infers schemas from heterogeneous data sources.
// Handles messy data, inconsistent formats, and ambiguous structures.

import type {
  DataSheet,
  DetectedColumn,
  DetectedSchema,
  SchemaField,
  InferredDataType,
  SemanticFieldType,
  CellValue,
  DataRow,
  DetectedPattern,
  PatternType,
  AnalysisWarning,
  SourceAnalysisResults,
  DataSourceId,
  SchemaId,
} from "./types";
import type { CardType } from "../types/card.types";

// =============================================================================
// TYPE INFERENCE
// =============================================================================

/**
 * Type inference patterns with regex and validators
 */
const TYPE_PATTERNS: Record<InferredDataType, TypePattern> = {
  email: {
    regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    validator: (v) => typeof v === "string" && v.includes("@"),
  },
  url: {
    regex: /^(https?:\/\/|www\.)[^\s]+$/i,
    validator: (v) =>
      typeof v === "string" && (v.startsWith("http") || v.startsWith("www.")),
  },
  date: {
    regex:
      /^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}-\d{1,2}-\d{2,4})$/,
    validator: (v) => !isNaN(Date.parse(String(v))) && !/^\d+$/.test(String(v)),
  },
  datetime: {
    regex: /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2})/,
    validator: (v) => !isNaN(Date.parse(String(v))) && String(v).includes(":"),
  },
  time: {
    regex: /^(\d{1,2}:\d{2}(:\d{2})?)(\s*(AM|PM))?$/i,
    validator: (v) => typeof v === "string" && /^\d{1,2}:\d{2}/.test(v),
  },
  integer: {
    regex: /^-?\d+$/,
    validator: (v) => Number.isInteger(Number(v)) && !isNaN(Number(v)),
  },
  number: {
    regex: /^-?\d+\.?\d*$/,
    validator: (v) => !isNaN(Number(v)) && typeof Number(v) === "number",
  },
  boolean: {
    regex: /^(true|false|yes|no|1|0|y|n)$/i,
    validator: (v) =>
      ["true", "false", "yes", "no", "1", "0", "y", "n"].includes(
        String(v).toLowerCase(),
      ),
  },
  json: {
    regex: /^[[{]/,
    validator: (v) => {
      try {
        JSON.parse(String(v));
        return true;
      } catch {
        return false;
      }
    },
  },
  array: {
    regex: /^\[.*\]$/,
    validator: (v) =>
      Array.isArray(v) || (typeof v === "string" && v.startsWith("[")),
  },
  image_url: {
    regex: /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i,
    validator: (v) =>
      typeof v === "string" && /\.(jpg|jpeg|png|gif|webp|svg|bmp)/i.test(v),
  },
  audio_url: {
    regex: /\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i,
    validator: (v) =>
      typeof v === "string" && /\.(mp3|wav|ogg|m4a|aac|flac)/i.test(v),
  },
  formula: {
    regex: /^=/,
    validator: (v) => typeof v === "string" && v.startsWith("="),
  },
  rich_text: {
    regex: /<[^>]+>|(\*\*|__|~~|`)/,
    validator: (v) =>
      typeof v === "string" && (/<[^>]+>/.test(v) || /(\*\*|__|~~|`)/.test(v)),
  },
  string: {
    regex: /.*/,
    validator: () => true,
  },
  unknown: {
    regex: /.*/,
    validator: () => false,
  },
  mixed: {
    regex: /.*/,
    validator: () => false,
  },
};

interface TypePattern {
  regex: RegExp;
  validator: (value: unknown) => boolean;
}

/**
 * Semantic field patterns - how we detect what a field means
 */
const SEMANTIC_PATTERNS: Record<SemanticFieldType, SemanticPattern> = {
  // Card content
  question: {
    namePatterns: [/^(question|q|prompt|ask|front)$/i, /question/i, /^q\d*$/i],
    contentPatterns: [
      /\?$/,
      /^(what|who|where|when|why|how|which|is|are|do|does|can|will)/i,
    ],
    priority: 10,
  },
  answer: {
    namePatterns: [/^(answer|a|response|reply|back)$/i, /answer/i, /^a\d*$/i],
    contentPatterns: [],
    priority: 10,
  },
  front: {
    namePatterns: [
      /^front$/i,
      /^recto$/i,
      /^term$/i,
      /^word$/i,
      /^vocab(ulary)?$/i,
    ],
    contentPatterns: [],
    priority: 9,
  },
  back: {
    namePatterns: [
      /^back$/i,
      /^verso$/i,
      /^def(inition)?$/i,
      /^meaning$/i,
      /^translation$/i,
    ],
    contentPatterns: [],
    priority: 9,
  },
  cloze_text: {
    namePatterns: [/cloze/i, /^text$/i, /^sentence$/i],
    contentPatterns: [/\{\{c?\d*::|\[\[.*\]\]|_+/],
    priority: 8,
  },
  hint: {
    namePatterns: [/^hint$/i, /^clue$/i, /^tip$/i],
    contentPatterns: [],
    priority: 7,
  },
  mnemonic: {
    namePatterns: [/^mnemonic$/i, /^memory$/i, /^trick$/i],
    contentPatterns: [],
    priority: 7,
  },
  explanation: {
    namePatterns: [
      /^explanation$/i,
      /^explain$/i,
      /^detail$/i,
      /^extra$/i,
      /^more$/i,
    ],
    contentPatterns: [],
    priority: 6,
  },
  example: {
    namePatterns: [/^example$/i, /^sample$/i, /^usage$/i],
    contentPatterns: [],
    priority: 6,
  },

  // Media
  image: {
    namePatterns: [/^image$/i, /^img$/i, /^picture$/i, /^photo$/i, /^media$/i],
    contentPatterns: [/\.(jpg|jpeg|png|gif|webp|svg)/i],
    priority: 7,
  },
  audio: {
    namePatterns: [/^audio$/i, /^sound$/i, /^pronunciation$/i, /^mp3$/i],
    contentPatterns: [/\.(mp3|wav|ogg|m4a)/i],
    priority: 7,
  },
  video: {
    namePatterns: [/^video$/i, /^clip$/i],
    contentPatterns: [/\.(mp4|webm|mov)/i, /youtube|vimeo/i],
    priority: 7,
  },

  // Metadata
  deck_name: {
    namePatterns: [/^deck$/i, /^deck[_-]?name$/i, /^collection$/i],
    contentPatterns: [],
    priority: 8,
  },
  deck_path: {
    namePatterns: [/^deck[_-]?path$/i, /^hierarchy$/i],
    contentPatterns: [/::/],
    priority: 8,
  },
  tags: {
    namePatterns: [/^tags?$/i, /^label$/i, /^category$/i, /^topic$/i],
    contentPatterns: [/[,;]\s*\w+/, /^#\w+/],
    priority: 8,
  },
  source: {
    namePatterns: [/^source$/i, /^reference$/i, /^citation$/i, /^ref$/i],
    contentPatterns: [],
    priority: 5,
  },
  notes: {
    namePatterns: [/^notes?$/i, /^comment$/i, /^remark$/i],
    contentPatterns: [],
    priority: 4,
  },
  difficulty: {
    namePatterns: [/^difficulty$/i, /^level$/i, /^hard(ness)?$/i],
    contentPatterns: [/^(easy|medium|hard|difficult)$/i, /^[1-5]$/],
    priority: 6,
  },
  priority: {
    namePatterns: [/^priority$/i, /^importance$/i, /^urgency$/i],
    contentPatterns: [/^(high|medium|low)$/i, /^[1-5]$/],
    priority: 5,
  },

  // Scheduling
  due_date: {
    namePatterns: [/^due$/i, /^due[_-]?date$/i, /^next[_-]?review$/i],
    contentPatterns: [],
    priority: 6,
  },
  interval: {
    namePatterns: [/^interval$/i, /^ivl$/i],
    contentPatterns: [/^\d+$/],
    priority: 5,
  },
  ease_factor: {
    namePatterns: [/^ease$/i, /^ease[_-]?factor$/i, /^ef$/i, /^factor$/i],
    contentPatterns: [/^\d+(\.\d+)?$/],
    priority: 5,
  },
  review_count: {
    namePatterns: [/^reviews?$/i, /^reps?$/i, /^review[_-]?count$/i],
    contentPatterns: [/^\d+$/],
    priority: 5,
  },
  last_review: {
    namePatterns: [/^last[_-]?review$/i, /^reviewed$/i],
    contentPatterns: [],
    priority: 5,
  },

  // Identifiers
  card_id: {
    namePatterns: [/^id$/i, /^card[_-]?id$/i, /^nid$/i],
    contentPatterns: [/^[a-z0-9]{8,}$/i],
    priority: 4,
  },
  external_id: {
    namePatterns: [/^external[_-]?id$/i, /^ext[_-]?id$/i, /^guid$/i, /^uuid$/i],
    contentPatterns: [/^[a-f0-9-]{36}$/i],
    priority: 4,
  },

  // Other
  category: {
    namePatterns: [/^category$/i, /^cat$/i, /^type$/i],
    contentPatterns: [],
    priority: 5,
  },
  chapter: {
    namePatterns: [/^chapter$/i, /^section$/i, /^unit$/i, /^module$/i],
    contentPatterns: [],
    priority: 5,
  },
  page_number: {
    namePatterns: [/^page$/i, /^page[_-]?num(ber)?$/i, /^pg$/i],
    contentPatterns: [/^\d+$/],
    priority: 4,
  },
  unknown: {
    namePatterns: [],
    contentPatterns: [],
    priority: 0,
  },
};

interface SemanticPattern {
  namePatterns: RegExp[];
  contentPatterns: RegExp[];
  priority: number;
}

// =============================================================================
// SCHEMA INFERENCE ENGINE
// =============================================================================

/**
 * Configuration for schema inference
 */
export interface SchemaInferenceConfig {
  /** Number of rows to sample for type inference */
  sampleSize: number;
  /** Minimum confidence threshold for type inference */
  typeConfidenceThreshold: number;
  /** Minimum confidence threshold for semantic inference */
  semanticConfidenceThreshold: number;
  /** Whether to use AI assistance for inference */
  useAI: boolean;
  /** Maximum unique values to track for enum detection */
  maxEnumValues: number;
}

/**
 * Default configuration
 */
export const DEFAULT_INFERENCE_CONFIG: SchemaInferenceConfig = {
  sampleSize: 100,
  typeConfidenceThreshold: 0.7,
  semanticConfidenceThreshold: 0.6,
  useAI: false,
  maxEnumValues: 50,
};

/**
 * Schema Inference Engine
 *
 * Analyzes data sources to detect structure, types, and semantics.
 */
export class SchemaInferenceEngine {
  private readonly config: SchemaInferenceConfig;

  constructor(config: Partial<SchemaInferenceConfig> = {}) {
    this.config = { ...DEFAULT_INFERENCE_CONFIG, ...config };
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Analyze a data sheet and infer its schema
   */
  analyzeSheet(sheet: DataSheet): DetectedSchema {
    // Infer column types and semantics
    const analyzedColumns = sheet.columns.map((col) =>
      this.analyzeColumn(col, sheet.sampleRows),
    );

    // Detect patterns in the data
    const patterns = this.detectPatterns(sheet, analyzedColumns);

    // Suggest card type based on patterns and columns
    const suggestedCardType = this.inferCardType(patterns, analyzedColumns);

    // Build schema fields
    const fields = this.buildSchemaFields(analyzedColumns);

    // Detect primary key fields
    const primaryKeyFields = this.detectPrimaryKeys(analyzedColumns);

    // Calculate overall confidence
    const overallConfidence = this.calculateOverallConfidence(analyzedColumns);

    // Validate the schema
    const validationIssues = this.validateSchema(fields);

    return {
      id: this.generateSchemaId(),
      sourceId: "" as DataSourceId, // Will be set by caller
      sheetId: sheet.id,
      fields,
      primaryKeyFields,
      suggestedCardType,
      overallConfidence,
      isValid: validationIssues.length === 0,
      validationIssues,
    };
  }

  /**
   * Analyze a source and produce comprehensive analysis results
   */
  analyzeSource(
    sourceId: DataSourceId,
    sheets: readonly DataSheet[],
    rawContent: string | ArrayBuffer,
    encoding: string = "utf-8",
  ): SourceAnalysisResults {
    const startTime = Date.now();

    // Analyze each sheet
    const sheetAnalyses = sheets.map((sheet) => ({
      sheet,
      schema: this.analyzeSheet(sheet),
      patterns: this.detectPatterns(sheet, sheet.columns),
    }));

    // Aggregate quality metrics
    const qualityMetrics = this.calculateQualityMetrics(sheets);

    // Generate suggestions
    const suggestedMappings = this.generateSuggestedMappings(sheetAnalyses);
    const suggestedCardType = this.determineBestCardType(sheetAnalyses);

    // Detect warnings
    const warnings = this.detectWarnings(sheets, sheetAnalyses);

    // Determine best schema
    const primarySheetAnalysis = sheetAnalyses[0];

    return {
      sourceId,
      analyzedAt: new Date(),
      analysisDurationMs: Date.now() - startTime,
      encoding,
      delimiter: this.detectDelimiter(rawContent),
      lineEnding: this.detectLineEnding(rawContent),
      hasHeaderRow: sheets.some((s) => s.headerRow !== null),
      headerRowIndex: sheets[0]?.headerRow ?? null,
      totalRows: sheets.reduce((sum, s) => sum + s.rowCount, 0),
      totalColumns: sheets.reduce((sum, s) => sum + s.columnCount, 0),
      emptyRows: this.countEmptyRows(sheets),
      inconsistentRows: this.countInconsistentRows(sheets),
      dataQualityScore: qualityMetrics.quality,
      completenessScore: qualityMetrics.completeness,
      consistencyScore: qualityMetrics.consistency,
      suggestedSchema: primarySheetAnalysis?.schema ?? null,
      suggestedMappings,
      suggestedCardType,
      patterns: sheetAnalyses.flatMap((a) => a.patterns),
      warnings,
    };
  }

  // ===========================================================================
  // COLUMN ANALYSIS
  // ===========================================================================

  /**
   * Analyze a single column
   */
  private analyzeColumn(
    column: DetectedColumn,
    rows: readonly DataRow[],
  ): AnalyzedColumn {
    const values = this.extractColumnValues(column.index, rows);
    const nonNullValues = values.filter((v) => !v.isNull);

    // Infer data type
    const typeInference = this.inferDataType(nonNullValues);

    // Infer semantic type
    const semanticInference = this.inferSemanticType(
      column.headerValue,
      nonNullValues,
      typeInference.type,
    );

    // Detect unique values (for enum detection)
    const uniqueValues = this.getUniqueValues(nonNullValues);
    const uniqueCount = uniqueValues.size;
    const isUnique =
      uniqueCount === nonNullValues.length && nonNullValues.length > 0;

    // Detect issues
    const issues = this.detectColumnIssues(column, values, typeInference);

    return {
      ...column,
      inferredType: typeInference.type,
      typeConfidence: typeInference.confidence,
      semanticType: semanticInference.type,
      semanticConfidence: semanticInference.confidence,
      nullCount: values.filter((v) => v.isNull).length,
      uniqueCount,
      uniqueValues:
        uniqueCount <= this.config.maxEnumValues
          ? Array.from(uniqueValues)
          : null,
      isUnique,
      issues,
    };
  }

  /**
   * Extract values for a column from rows
   */
  private extractColumnValues(
    columnIndex: number,
    rows: readonly DataRow[],
  ): CellValue[] {
    return rows
      .filter((r) => r.rowType === "data")
      .map((r) => r.cells[columnIndex])
      .filter((v): v is CellValue => v !== undefined);
  }

  /**
   * Infer the data type of a column based on its values
   */
  private inferDataType(values: readonly CellValue[]): TypeInferenceResult {
    if (values.length === 0) {
      return { type: "unknown", confidence: 0 };
    }

    // Sample values if too many
    const sampleValues =
      values.length > this.config.sampleSize
        ? this.sampleArray(values, this.config.sampleSize)
        : values;

    // Count matches for each type
    const typeCounts = new Map<InferredDataType, number>();
    const orderedTypes: InferredDataType[] = [
      "email",
      "url",
      "datetime",
      "date",
      "time",
      "image_url",
      "audio_url",
      "formula",
      "boolean",
      "integer",
      "number",
      "json",
      "array",
      "rich_text",
      "string",
    ];

    for (const value of sampleValues) {
      for (const type of orderedTypes) {
        const pattern = TYPE_PATTERNS[type];
        if (pattern.validator(value.rawValue)) {
          typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
          break; // First matching type wins for this value
        }
      }
    }

    // Find the most common type
    let bestType: InferredDataType = "string";
    let bestCount = 0;

    for (const [type, count] of typeCounts) {
      if (count > bestCount) {
        bestCount = count;
        bestType = type;
      }
    }

    // Check if there's significant type mixing
    const confidence = bestCount / sampleValues.length;
    if (confidence < 0.5 && typeCounts.size > 1) {
      return { type: "mixed", confidence: confidence };
    }

    return { type: bestType, confidence };
  }

  /**
   * Infer the semantic meaning of a field
   */
  private inferSemanticType(
    headerName: string | null,
    values: readonly CellValue[],
    _dataType: InferredDataType,
  ): SemanticInferenceResult {
    const candidates: Array<{ type: SemanticFieldType; score: number }> = [];

    for (const [semanticType, pattern] of Object.entries(
      SEMANTIC_PATTERNS,
    ) as Array<[SemanticFieldType, SemanticPattern]>) {
      let score = 0;

      // Check header name patterns
      if (headerName) {
        for (const regex of pattern.namePatterns) {
          if (regex.test(headerName)) {
            score += 0.6 * pattern.priority;
            break;
          }
        }
      }

      // Check content patterns (on sample of values)
      const sampleValues = values.slice(0, 20);
      let contentMatches = 0;
      for (const value of sampleValues) {
        for (const regex of pattern.contentPatterns) {
          if (regex.test(String(value.rawValue))) {
            contentMatches++;
            break;
          }
        }
      }
      if (sampleValues.length > 0) {
        score +=
          0.4 * (contentMatches / sampleValues.length) * pattern.priority;
      }

      if (score > 0) {
        candidates.push({ type: semanticType, score });
      }
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    if (
      candidates.length > 0 &&
      candidates[0].score >= this.config.semanticConfidenceThreshold
    ) {
      return {
        type: candidates[0].type,
        confidence: Math.min(candidates[0].score / 10, 1),
      };
    }

    return { type: null, confidence: 0 };
  }

  // ===========================================================================
  // PATTERN DETECTION
  // ===========================================================================

  /**
   * Detect patterns in the data that hint at card types
   */
  private detectPatterns(
    sheet: DataSheet,
    columns: readonly DetectedColumn[],
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    // Q&A pairs pattern
    const qaPair = this.detectQAPairPattern(columns);
    if (qaPair) patterns.push(qaPair);

    // Cloze deletions pattern
    const cloze = this.detectClozePattern(sheet);
    if (cloze) patterns.push(cloze);

    // Vocabulary list pattern
    const vocab = this.detectVocabularyPattern(columns);
    if (vocab) patterns.push(vocab);

    // Comparison table pattern
    const comparison = this.detectComparisonPattern(sheet);
    if (comparison) patterns.push(comparison);

    // Process steps pattern
    const process = this.detectProcessPattern(sheet);
    if (process) patterns.push(process);

    // Flashcard format pattern (front/back explicit)
    const flashcard = this.detectFlashcardFormat(columns);
    if (flashcard) patterns.push(flashcard);

    return patterns;
  }

  private detectQAPairPattern(
    columns: readonly DetectedColumn[],
  ): DetectedPattern | null {
    const questionCol = columns.find((c) => c.semanticType === "question");
    const answerCol = columns.find((c) => c.semanticType === "answer");

    if (questionCol && answerCol) {
      return {
        type: "qa_pairs",
        description: "Question and answer columns detected",
        confidence: Math.min(
          questionCol.semanticConfidence,
          answerCol.semanticConfidence,
        ),
        affectedColumns: [questionCol.index, answerCol.index],
        suggestion: "Map to basic Q&A flashcard format",
      };
    }
    return null;
  }

  private detectClozePattern(sheet: DataSheet): DetectedPattern | null {
    const clozeRegex = /\{\{c?\d*::|__+|\[\[.*\]\]/;
    let matchCount = 0;
    const affectedColumns: number[] = [];

    for (const row of sheet.sampleRows) {
      for (const cell of row.cells) {
        if (clozeRegex.test(String(cell.rawValue))) {
          matchCount++;
          if (!affectedColumns.includes(cell.columnIndex)) {
            affectedColumns.push(cell.columnIndex);
          }
        }
      }
    }

    if (matchCount >= 3) {
      return {
        type: "cloze_deletions",
        description: `Cloze deletion syntax found in ${matchCount} cells`,
        confidence: Math.min(matchCount / sheet.sampleRows.length, 0.95),
        affectedColumns,
        suggestion: "Import as cloze deletion cards",
      };
    }
    return null;
  }

  private detectVocabularyPattern(
    columns: readonly DetectedColumn[],
  ): DetectedPattern | null {
    const frontCol = columns.find(
      (c) =>
        c.semanticType === "front" ||
        ["term", "word", "vocab", "vocabulary"].some((s) =>
          c.normalizedName.toLowerCase().includes(s),
        ),
    );
    const backCol = columns.find(
      (c) =>
        c.semanticType === "back" ||
        ["definition", "meaning", "translation"].some((s) =>
          c.normalizedName.toLowerCase().includes(s),
        ),
    );

    if (frontCol && backCol) {
      return {
        type: "vocabulary_list",
        description: "Vocabulary list with terms and definitions",
        confidence: 0.85,
        affectedColumns: [frontCol.index, backCol.index],
        suggestion: "Import as bidirectional vocabulary cards",
      };
    }
    return null;
  }

  private detectComparisonPattern(sheet: DataSheet): DetectedPattern | null {
    // Look for table structure where first column is feature name
    // and subsequent columns are different items being compared
    if (sheet.columnCount >= 3) {
      // Check if first column looks like feature names
      const firstColValues = sheet.sampleRows.map((r) => r.cells[0]?.rawValue);
      const uniqueFirstCol = new Set(firstColValues);

      if (uniqueFirstCol.size === firstColValues.length * 0.8) {
        // Most values are unique - looks like feature names
        return {
          type: "comparison_table",
          description: "Comparison table structure detected",
          confidence: 0.7,
          affectedColumns: sheet.columns.map((c) => c.index),
          suggestion: "Import as comparison cards",
        };
      }
    }
    return null;
  }

  private detectProcessPattern(sheet: DataSheet): DetectedPattern | null {
    // Look for numbered/ordered steps
    const stepCol = sheet.columns.find(
      (c) =>
        c.normalizedName.toLowerCase().match(/step|stage|phase|order|\d+/) ||
        c.inferredType === "integer",
    );

    if (stepCol) {
      const values = sheet.sampleRows.map(
        (r) => r.cells[stepCol.index]?.rawValue,
      );
      const isSequential = this.isSequentialNumbers(values);

      if (isSequential) {
        return {
          type: "process_steps",
          description: "Sequential process steps detected",
          confidence: 0.75,
          affectedColumns: [stepCol.index],
          suggestion: "Import as process/pipeline cards",
        };
      }
    }
    return null;
  }

  private detectFlashcardFormat(
    columns: readonly DetectedColumn[],
  ): DetectedPattern | null {
    const frontCol = columns.find((c) => c.semanticType === "front");
    const backCol = columns.find((c) => c.semanticType === "back");

    if (frontCol && backCol) {
      return {
        type: "flashcard_format",
        description: "Standard front/back flashcard format",
        confidence: 0.9,
        affectedColumns: [frontCol.index, backCol.index],
        suggestion: "Direct import as atomic flashcards",
      };
    }
    return null;
  }

  // ===========================================================================
  // CARD TYPE INFERENCE
  // ===========================================================================

  /**
   * Infer the best card type based on detected patterns
   */
  private inferCardType(
    patterns: DetectedPattern[],
    _columns: readonly AnalyzedColumn[],
  ): CardType {
    // Priority order for patterns
    const patternToCardType: Record<PatternType, CardType> = {
      cloze_deletions: "cloze",
      process_steps: "process",
      comparison_table: "comparison",
      vocabulary_list: "atomic",
      qa_pairs: "atomic",
      flashcard_format: "atomic",
      key_value_pairs: "atomic",
      numbered_lists: "process",
      hierarchical_categories: "concept_graph",
      formula_definitions: "atomic",
      code_snippets: "cloze",
      timeline_events: "process",
      mixed_content: "atomic",
    };

    // Find highest confidence pattern
    const sortedPatterns = [...patterns].sort(
      (a, b) => b.confidence - a.confidence,
    );

    if (sortedPatterns.length > 0 && sortedPatterns[0].confidence >= 0.6) {
      return patternToCardType[sortedPatterns[0].type] ?? "atomic";
    }

    // Default to atomic
    return "atomic";
  }

  private determineBestCardType(
    sheetAnalyses: Array<{
      schema: DetectedSchema;
      patterns: DetectedPattern[];
    }>,
  ): CardType | null {
    const typeCounts = new Map<CardType, number>();

    for (const analysis of sheetAnalyses) {
      const type = analysis.schema.suggestedCardType;
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
    }

    let bestType: CardType | null = null;
    let bestCount = 0;

    for (const [type, count] of typeCounts) {
      if (count > bestCount) {
        bestCount = count;
        bestType = type;
      }
    }

    return bestType;
  }

  // ===========================================================================
  // SCHEMA BUILDING
  // ===========================================================================

  private buildSchemaFields(columns: readonly AnalyzedColumn[]): SchemaField[] {
    return columns.map((col) => ({
      name: col.normalizedName || `column_${col.index}`,
      sourceColumnIndex: col.index,
      dataType: col.inferredType,
      semanticType: col.semanticType,
      isRequired: col.nullCount === 0,
      isUnique: col.uniqueCount === col.sampleValues.length,
      defaultValue: null,
      validValues: col.uniqueValues,
      validation: this.buildFieldValidation(col),
    }));
  }

  private buildFieldValidation(column: AnalyzedColumn): FieldValidation | null {
    let minLength: number | null = null;
    let maxLength: number | null = null;
    let minValue: number | null = null;
    let maxValue: number | null = null;

    // String length constraints
    if (column.inferredType === "string") {
      const lengths = column.sampleValues.map((v) => String(v.rawValue).length);
      if (lengths.length > 0) {
        minLength = Math.min(...lengths);
        maxLength = Math.max(...lengths);
      }
    }

    // Numeric constraints
    if (column.inferredType === "number" || column.inferredType === "integer") {
      const numbers = column.sampleValues
        .map((v) => Number(v.rawValue))
        .filter((n) => !isNaN(n));
      if (numbers.length > 0) {
        minValue = Math.min(...numbers);
        maxValue = Math.max(...numbers);
      }
    }

    // Only return if we have any constraints
    if (
      minLength !== null ||
      maxLength !== null ||
      minValue !== null ||
      maxValue !== null
    ) {
      return {
        minLength,
        maxLength,
        minValue,
        maxValue,
        pattern: null,
        customValidation: null,
      };
    }

    return null;
  }

  private detectPrimaryKeys(columns: readonly AnalyzedColumn[]): string[] {
    const candidates = columns.filter(
      (col) =>
        col.semanticType === "card_id" ||
        col.semanticType === "external_id" ||
        (col.isUnique && col.nullCount === 0),
    );

    return candidates.map((c) => c.normalizedName || `column_${c.index}`);
  }

  // ===========================================================================
  // MAPPING SUGGESTIONS
  // ===========================================================================

  private generateSuggestedMappings(
    sheetAnalyses: Array<{
      sheet: DataSheet;
      schema: DetectedSchema;
      patterns: DetectedPattern[];
    }>,
  ): SuggestedMapping[] {
    const mappings: SuggestedMapping[] = [];

    for (const { sheet, schema } of sheetAnalyses) {
      for (const field of schema.fields) {
        if (field.semanticType) {
          const targetField = this.semanticToTargetField(field.semanticType);
          if (targetField) {
            mappings.push({
              sourceColumnIndex: field.sourceColumnIndex,
              sourceColumnName: field.name,
              suggestedTarget: targetField,
              suggestedCardType: null,
              confidence:
                sheet.columns[field.sourceColumnIndex]?.semanticConfidence ??
                0.5,
              reasoning: `Column "${field.name}" appears to be ${field.semanticType}`,
              alternatives: this.getAlternativeMappings(field.semanticType),
            });
          }
        }
      }
    }

    return mappings;
  }

  private semanticToTargetField(
    semantic: SemanticFieldType,
  ): CardTargetField | null {
    const mapping: Partial<Record<SemanticFieldType, CardTargetField>> = {
      question: "front",
      answer: "back",
      front: "front",
      back: "back",
      cloze_text: "cloze_text",
      hint: "hint",
      mnemonic: "mnemonic",
      explanation: "explanation",
      example: "notes",
      image: "front_image",
      audio: "audio",
      tags: "tags",
      deck_name: "deck",
      deck_path: "deck",
      source: "source",
      notes: "notes",
      difficulty: "difficulty",
      due_date: "due_date",
      interval: "interval",
      ease_factor: "ease_factor",
      review_count: "review_count",
    };

    return mapping[semantic] ?? null;
  }

  private getAlternativeMappings(
    semantic: SemanticFieldType,
  ): Array<{ target: CardTargetField; confidence: number }> {
    const alternatives: Partial<
      Record<
        SemanticFieldType,
        Array<{ target: CardTargetField; confidence: number }>
      >
    > = {
      question: [
        { target: "cloze_text", confidence: 0.5 },
        { target: "notes", confidence: 0.3 },
      ],
      answer: [
        { target: "explanation", confidence: 0.4 },
        { target: "notes", confidence: 0.3 },
      ],
      explanation: [
        { target: "back", confidence: 0.5 },
        { target: "hint", confidence: 0.4 },
      ],
    };

    return alternatives[semantic] ?? [];
  }

  // ===========================================================================
  // QUALITY METRICS
  // ===========================================================================

  private calculateQualityMetrics(
    sheets: readonly DataSheet[],
  ): QualityMetrics {
    const metrics: QualityMetrics = {
      quality: 0,
      completeness: 0,
      consistency: 0,
    };

    if (sheets.length === 0) return metrics;

    // Calculate per-sheet metrics and average
    for (const sheet of sheets) {
      // Completeness: percentage of non-null cells
      const totalCells = sheet.rowCount * sheet.columnCount;
      const nullCells = sheet.columns.reduce(
        (sum, col) => sum + col.nullCount,
        0,
      );
      const sheetCompleteness =
        totalCells > 0 ? ((totalCells - nullCells) / totalCells) * 100 : 0;
      metrics.completeness += sheetCompleteness;

      // Consistency: check for type consistency in columns
      const consistentColumns = sheet.columns.filter(
        (col) => col.typeConfidence >= 0.8,
      ).length;
      const sheetConsistency =
        sheet.columnCount > 0
          ? (consistentColumns / sheet.columnCount) * 100
          : 0;
      metrics.consistency += sheetConsistency;

      // Quality: combination of factors
      const sheetQuality =
        sheetCompleteness * 0.4 +
        sheetConsistency * 0.3 +
        (sheet.issues.length === 0
          ? 30
          : Math.max(0, 30 - sheet.issues.length * 5));
      metrics.quality += sheetQuality;
    }

    // Average across sheets
    metrics.quality /= sheets.length;
    metrics.completeness /= sheets.length;
    metrics.consistency /= sheets.length;

    return metrics;
  }

  private detectWarnings(
    sheets: readonly DataSheet[],
    _analyses: Array<{ schema: DetectedSchema }>,
  ): AnalysisWarning[] {
    const warnings: AnalysisWarning[] = [];

    for (const sheet of sheets) {
      // Warn about empty rows
      const emptyRows = sheet.sampleRows.filter((r) => r.rowType === "empty");
      if (emptyRows.length > 0) {
        warnings.push({
          code: "EMPTY_ROWS",
          severity: "warning",
          message: `${emptyRows.length} empty rows detected`,
          details: null,
          affectedRows: emptyRows.map((r) => r.rowIndex),
          suggestion: "Consider removing empty rows before import",
        });
      }

      // Warn about inconsistent types
      for (const col of sheet.columns) {
        if (col.typeConfidence < 0.5) {
          warnings.push({
            code: "MIXED_TYPES",
            severity: "warning",
            message: `Column "${col.headerValue}" has mixed data types`,
            details: `Type confidence: ${(col.typeConfidence * 100).toFixed(1)}%`,
            affectedRows: [],
            suggestion: "Review and clean data before import",
          });
        }
      }

      // Warn about high null count
      for (const col of sheet.columns) {
        const nullRatio = col.nullCount / sheet.rowCount;
        if (nullRatio > 0.3) {
          warnings.push({
            code: "HIGH_NULL_COUNT",
            severity: "info",
            message: `Column "${col.headerValue}" has ${(nullRatio * 100).toFixed(1)}% empty values`,
            details: null,
            affectedRows: [],
            suggestion: "Consider if this column should be required",
          });
        }
      }
    }

    return warnings;
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  private calculateOverallConfidence(
    columns: readonly AnalyzedColumn[],
  ): number {
    if (columns.length === 0) return 0;

    const avgTypeConfidence =
      columns.reduce((sum, c) => sum + c.typeConfidence, 0) / columns.length;
    const avgSemanticConfidence =
      columns
        .filter((c) => c.semanticType !== null)
        .reduce((sum, c) => sum + c.semanticConfidence, 0) /
      Math.max(1, columns.filter((c) => c.semanticType !== null).length);

    return avgTypeConfidence * 0.6 + avgSemanticConfidence * 0.4;
  }

  private validateSchema(fields: readonly SchemaField[]): string[] {
    const issues: string[] = [];

    // Check for required front/back fields
    const hasContent = fields.some(
      (f) =>
        f.semanticType === "front" ||
        f.semanticType === "question" ||
        f.semanticType === "cloze_text",
    );

    if (!hasContent) {
      issues.push("No content field (front/question/cloze) detected");
    }

    // Check for duplicate semantic types
    const semanticCounts = new Map<SemanticFieldType, number>();
    for (const field of fields) {
      if (field.semanticType) {
        semanticCounts.set(
          field.semanticType,
          (semanticCounts.get(field.semanticType) ?? 0) + 1,
        );
      }
    }

    for (const [type, count] of semanticCounts) {
      if (count > 1 && ["front", "back", "question", "answer"].includes(type)) {
        issues.push(`Multiple fields detected as "${type}"`);
      }
    }

    return issues;
  }

  private getUniqueValues(values: readonly CellValue[]): Set<unknown> {
    const unique = new Set<unknown>();
    for (const v of values) {
      if (unique.size >= this.config.maxEnumValues) break;
      unique.add(v.rawValue);
    }
    return unique;
  }

  private detectColumnIssues(
    column: DetectedColumn,
    values: readonly CellValue[],
    typeInference: TypeInferenceResult,
  ): ColumnIssue[] {
    const issues: ColumnIssue[] = [];

    // Mixed types
    if (typeInference.type === "mixed") {
      issues.push({
        code: "MIXED_TYPES",
        severity: "warning",
        message: "Column contains mixed data types",
        affectedRows: values.map((v) => v.columnIndex),
      });
    }

    // High null rate
    const nullRate = column.nullCount / Math.max(1, values.length);
    if (nullRate > 0.5) {
      issues.push({
        code: "HIGH_NULL_RATE",
        severity: "info",
        message: `${(nullRate * 100).toFixed(1)}% of values are empty`,
        affectedRows: values.filter((v) => v.isNull).map((v) => v.columnIndex),
      });
    }

    return issues;
  }

  private countEmptyRows(sheets: readonly DataSheet[]): number {
    return sheets.reduce(
      (sum, sheet) =>
        sum + sheet.sampleRows.filter((r) => r.rowType === "empty").length,
      0,
    );
  }

  private countInconsistentRows(sheets: readonly DataSheet[]): number {
    return sheets.reduce(
      (sum, sheet) =>
        sum + sheet.sampleRows.filter((r) => r.issues.length > 0).length,
      0,
    );
  }

  private detectDelimiter(content: string | ArrayBuffer): string | null {
    if (typeof content !== "string") return null;

    const firstLine = content.split("\n")[0] ?? "";
    const delimiters = [",", "\t", ";", "|"];
    let bestDelimiter = ",";
    let maxCount = 0;

    for (const d of delimiters) {
      const count = (
        firstLine.match(new RegExp(d === "|" ? "\\|" : d, "g")) || []
      ).length;
      if (count > maxCount) {
        maxCount = count;
        bestDelimiter = d;
      }
    }

    return bestDelimiter;
  }

  private detectLineEnding(content: string | ArrayBuffer): string {
    if (typeof content !== "string") return "\n";
    if (content.includes("\r\n")) return "\r\n";
    if (content.includes("\r")) return "\r";
    return "\n";
  }

  private isSequentialNumbers(values: readonly unknown[]): boolean {
    const numbers = values
      .map((v) => Number(v))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);

    if (numbers.length < 2) return false;

    for (let i = 1; i < numbers.length; i++) {
      if (numbers[i] - numbers[i - 1] !== 1) return false;
    }
    return true;
  }

  private sampleArray<T>(arr: readonly T[], size: number): T[] {
    if (arr.length <= size) return [...arr];

    const result: T[] = [];
    const step = arr.length / size;

    for (let i = 0; i < size; i++) {
      result.push(arr[Math.floor(i * step)]);
    }

    return result;
  }

  private generateSchemaId(): SchemaId {
    return `schema_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` as SchemaId;
  }
}

// =============================================================================
// INTERNAL TYPES
// =============================================================================

interface AnalyzedColumn extends DetectedColumn {
  uniqueValues: unknown[] | null;
  isUnique: boolean;
}

interface TypeInferenceResult {
  type: InferredDataType;
  confidence: number;
}

interface SemanticInferenceResult {
  type: SemanticFieldType | null;
  confidence: number;
}

interface QualityMetrics {
  quality: number;
  completeness: number;
  consistency: number;
}

type CardTargetField = import("./types").CardTargetField;
type SuggestedMapping = import("./types").SuggestedMapping;
type FieldValidation = import("./types").FieldValidation;
type ColumnIssue = import("./types").ColumnIssue;
