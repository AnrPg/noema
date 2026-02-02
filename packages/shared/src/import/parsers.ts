// =============================================================================
// DATA PARSERS - FILE FORMAT HANDLERS
// =============================================================================
// Parsers for various file formats that produce the unified DataSheet format.
// Each parser handles the quirks of its specific format.

import type {
  DataSheet,
  DataRow,
  DetectedColumn,
  CellValue,
  InferredDataType,
  RowType,
  SheetIssue,
  DataSourceType,
  DataSourceId,
  SheetId,
} from "./types";

// =============================================================================
// PARSER INTERFACE
// =============================================================================

/**
 * Configuration options for parsing
 */
export interface ParseOptions {
  /** Maximum rows to load for preview/analysis */
  maxPreviewRows: number;
  /** Whether to detect and skip header rows */
  detectHeaders: boolean;
  /** Specific encoding to use (or 'auto' for detection) */
  encoding: string;
  /** For CSV: delimiter to use (or 'auto' for detection) */
  delimiter: string;
  /** For Excel: specific sheets to load (or empty for all) */
  sheetNames: string[];
  /** Whether to preserve formatting information */
  preserveFormatting: boolean;
  /** Skip rows before data starts */
  skipRows: number;
  /** Whether to trim whitespace from values */
  trimValues: boolean;
}

/**
 * Default parse options
 */
export const DEFAULT_PARSE_OPTIONS: ParseOptions = {
  maxPreviewRows: 1000,
  detectHeaders: true,
  encoding: "auto",
  delimiter: "auto",
  sheetNames: [],
  preserveFormatting: true,
  skipRows: 0,
  trimValues: true,
};

/**
 * Result of parsing a file
 */
export interface ParseResult {
  success: boolean;
  sourceType: DataSourceType;
  sheets: DataSheet[];
  encoding: string;
  errors: ParseError[];
  warnings: string[];
  metadata: Record<string, unknown>;
}

/**
 * A parsing error
 */
export interface ParseError {
  code: string;
  message: string;
  location?: {
    sheet?: string;
    row?: number;
    column?: number;
  };
}

/**
 * Base interface for all parsers
 */
export interface DataParser {
  /** File extensions this parser handles */
  readonly supportedExtensions: string[];
  /** MIME types this parser handles */
  readonly supportedMimeTypes: string[];

  /**
   * Parse file content into DataSheets
   */
  parse(
    content: ArrayBuffer | string,
    filename: string,
    options?: Partial<ParseOptions>,
  ): Promise<ParseResult>;

  /**
   * Quick check if this parser can handle the file
   */
  canParse(filename: string, mimeType?: string): boolean;
}

// =============================================================================
// CSV / TSV PARSER
// =============================================================================

/**
 * Parser for CSV and TSV files
 */
export class CSVParser implements DataParser {
  readonly supportedExtensions = ["csv", "tsv", "txt"];
  readonly supportedMimeTypes = [
    "text/csv",
    "text/tab-separated-values",
    "text/plain",
  ];

  canParse(filename: string, mimeType?: string): boolean {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    return (
      this.supportedExtensions.includes(ext) ||
      (mimeType !== undefined && this.supportedMimeTypes.includes(mimeType))
    );
  }

  async parse(
    content: ArrayBuffer | string,
    filename: string,
    options: Partial<ParseOptions> = {},
  ): Promise<ParseResult> {
    const opts = { ...DEFAULT_PARSE_OPTIONS, ...options };
    const errors: ParseError[] = [];
    const warnings: string[] = [];

    // Convert ArrayBuffer to string if needed
    let text: string;
    let encoding = opts.encoding;

    if (content instanceof ArrayBuffer) {
      const result = this.decodeContent(content, opts.encoding);
      text = result.text;
      encoding = result.encoding;
    } else {
      text = content;
      encoding = "utf-8";
    }

    // Detect delimiter
    const delimiter =
      opts.delimiter === "auto" ? this.detectDelimiter(text) : opts.delimiter;

    // Parse the CSV
    const rows = this.parseCSV(text, delimiter, opts);

    // Skip specified rows
    const dataRows = rows.slice(opts.skipRows);

    // Detect header row
    let headerRow: number | null = null;
    let headers: string[] = [];
    let dataStartRow = 0;

    if (opts.detectHeaders && dataRows.length > 0) {
      const headerDetection = this.detectHeaderRow(dataRows);
      headerRow = headerDetection.headerRowIndex;
      if (headerRow !== null) {
        headers = dataRows[headerRow].map((v) => String(v ?? ""));
        dataStartRow = headerRow + 1;
      }
    }

    // Build columns
    const columnCount = Math.max(...dataRows.map((r) => r.length), 0);
    const columns: DetectedColumn[] = [];

    for (let i = 0; i < columnCount; i++) {
      const header = headers[i] ?? null;
      const sampleValues = this.extractColumnSample(
        dataRows,
        i,
        dataStartRow,
        opts.maxPreviewRows,
      );

      columns.push({
        index: i,
        letter: this.indexToLetter(i),
        headerValue: header,
        normalizedName: this.normalizeColumnName(header, i),
        inferredType: this.quickTypeInference(sampleValues),
        typeConfidence: 0, // Will be calculated by schema engine
        nullCount: sampleValues.filter((v) => v.isNull).length,
        uniqueCount: new Set(sampleValues.map((v) => v.rawValue)).size,
        sampleValues,
        semanticType: null,
        semanticConfidence: 0,
        issues: [],
      });
    }

    // Build rows
    const parsedRows: DataRow[] = dataRows.map((row, index) => {
      const cells: CellValue[] = row.map((value, colIndex) =>
        this.createCellValue(value, colIndex, opts.trimValues),
      );

      // Pad with empty cells if needed
      while (cells.length < columnCount) {
        cells.push(this.createCellValue(null, cells.length, false));
      }

      const rowType: RowType =
        index < dataStartRow
          ? "header"
          : cells.every((c) => c.isNull)
            ? "empty"
            : "data";

      return {
        rowIndex: index + opts.skipRows,
        cells,
        rowType,
        issues: [],
      };
    });

    // Build the sheet
    const sheet: DataSheet = {
      id: `sheet_0` as SheetId,
      sourceId: "" as DataSourceId, // Will be set by caller
      name: filename.replace(/\.[^.]+$/, ""),
      index: 0,
      rowCount: parsedRows.length,
      columnCount,
      headerRow: headerRow !== null ? headerRow + opts.skipRows : null,
      dataStartRow: dataStartRow + opts.skipRows,
      dataEndRow: parsedRows.length - 1 + opts.skipRows,
      columns,
      sampleRows: parsedRows.slice(0, opts.maxPreviewRows),
      issues: [],
    };

    // Detect issues
    this.detectSheetIssues(sheet, parsedRows, warnings);

    return {
      success: errors.length === 0,
      sourceType: delimiter === "\t" ? "tsv" : "csv",
      sheets: [sheet],
      encoding,
      errors,
      warnings,
      metadata: {
        delimiter,
        totalRows: parsedRows.length,
        hasHeaders: headerRow !== null,
      },
    };
  }

  private decodeContent(
    buffer: ArrayBuffer,
    preferredEncoding: string,
  ): { text: string; encoding: string } {
    // Try to detect BOM
    const bytes = new Uint8Array(buffer);

    // UTF-8 BOM
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return {
        text: new TextDecoder("utf-8").decode(buffer.slice(3)),
        encoding: "utf-8",
      };
    }

    // UTF-16 LE BOM
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return {
        text: new TextDecoder("utf-16le").decode(buffer.slice(2)),
        encoding: "utf-16le",
      };
    }

    // UTF-16 BE BOM
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      return {
        text: new TextDecoder("utf-16be").decode(buffer.slice(2)),
        encoding: "utf-16be",
      };
    }

    // Use preferred encoding or default to UTF-8
    const encoding = preferredEncoding !== "auto" ? preferredEncoding : "utf-8";
    return { text: new TextDecoder(encoding).decode(buffer), encoding };
  }

  private detectDelimiter(text: string): string {
    const firstLines = text.split("\n").slice(0, 5);
    const delimiters = [",", "\t", ";", "|"];

    let bestDelimiter = ",";
    let bestConsistency = 0;

    for (const d of delimiters) {
      const counts = firstLines.map((line) => {
        // Count delimiters not inside quotes
        let count = 0;
        let inQuotes = false;
        for (const char of line) {
          if (char === '"') inQuotes = !inQuotes;
          else if (char === d && !inQuotes) count++;
        }
        return count;
      });

      // Check consistency
      const uniqueCounts = new Set(counts.filter((c) => c > 0));
      if (uniqueCounts.size === 1 && counts[0] > 0) {
        const score = counts[0];
        if (score > bestConsistency) {
          bestConsistency = score;
          bestDelimiter = d;
        }
      }
    }

    return bestDelimiter;
  }

  private parseCSV(
    text: string,
    delimiter: string,
    _options: ParseOptions,
  ): unknown[][] {
    const rows: unknown[][] = [];
    let currentRow: unknown[] = [];
    let currentValue = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (inQuotes) {
        if (char === '"') {
          if (nextChar === '"') {
            // Escaped quote
            currentValue += '"';
            i++;
          } else {
            // End of quoted field
            inQuotes = false;
          }
        } else {
          currentValue += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === delimiter) {
          currentRow.push(this.parseValue(currentValue));
          currentValue = "";
        } else if (char === "\r" && nextChar === "\n") {
          currentRow.push(this.parseValue(currentValue));
          rows.push(currentRow);
          currentRow = [];
          currentValue = "";
          i++; // Skip \n
        } else if (char === "\n" || char === "\r") {
          currentRow.push(this.parseValue(currentValue));
          rows.push(currentRow);
          currentRow = [];
          currentValue = "";
        } else {
          currentValue += char;
        }
      }
    }

    // Handle last value/row
    if (currentValue || currentRow.length > 0) {
      currentRow.push(this.parseValue(currentValue));
      rows.push(currentRow);
    }

    return rows;
  }

  private parseValue(value: string): unknown {
    const trimmed = value.trim();

    if (trimmed === "" || trimmed.toLowerCase() === "null") {
      return null;
    }

    // Try to parse as number
    if (/^-?\d+$/.test(trimmed)) {
      return parseInt(trimmed, 10);
    }
    if (/^-?\d+\.\d+$/.test(trimmed)) {
      return parseFloat(trimmed);
    }

    // Try to parse as boolean
    if (trimmed.toLowerCase() === "true") return true;
    if (trimmed.toLowerCase() === "false") return false;

    return trimmed;
  }

  private detectHeaderRow(rows: unknown[][]): {
    headerRowIndex: number | null;
    confidence: number;
  } {
    if (rows.length === 0) return { headerRowIndex: null, confidence: 0 };

    // Heuristics for header detection:
    // 1. First row has all strings
    // 2. First row values look like column names
    // 3. First row has different types than subsequent rows

    const firstRow = rows[0];
    const isAllStrings = firstRow.every(
      (v) => typeof v === "string" || v === null,
    );

    if (!isAllStrings) return { headerRowIndex: null, confidence: 0 };

    // Check if values look like headers
    const headerPatterns = [
      /^[a-z_][a-z0-9_]*$/i, // Snake case
      /^[A-Z][a-zA-Z0-9]*$/, // Pascal case
      /^[a-z]+$/i, // Simple word
      /question|answer|front|back|deck|tag/i, // Common card terms
    ];

    const headerLikeCount = firstRow.filter((v) => {
      if (typeof v !== "string") return false;
      return headerPatterns.some((p) => p.test(v));
    }).length;

    const confidence = headerLikeCount / firstRow.length;

    if (confidence > 0.5) {
      return { headerRowIndex: 0, confidence };
    }

    return { headerRowIndex: null, confidence: 0 };
  }

  private extractColumnSample(
    rows: unknown[][],
    columnIndex: number,
    startRow: number,
    maxRows: number,
  ): CellValue[] {
    const samples: CellValue[] = [];

    for (let i = startRow; i < Math.min(rows.length, startRow + maxRows); i++) {
      const value = rows[i]?.[columnIndex];
      samples.push(this.createCellValue(value, columnIndex, true));
    }

    return samples;
  }

  private createCellValue(
    value: unknown,
    columnIndex: number,
    trim: boolean,
  ): CellValue {
    const isNull = value === null || value === undefined || value === "";
    let displayValue = isNull ? "" : String(value);

    if (trim && typeof value === "string") {
      displayValue = value.trim();
    }

    return {
      columnIndex,
      rawValue: value,
      displayValue,
      formattedValue: null,
      formula: null,
      dataType: this.inferCellType(value),
      style: null,
      isNull,
      isMerged: false,
      mergeSpan: null,
    };
  }

  private inferCellType(value: unknown): InferredDataType {
    if (value === null || value === undefined) return "unknown";
    if (typeof value === "number")
      return Number.isInteger(value) ? "integer" : "number";
    if (typeof value === "boolean") return "boolean";
    if (typeof value === "string") {
      if (/^-?\d+$/.test(value)) return "integer";
      if (/^-?\d+\.\d+$/.test(value)) return "number";
      if (/^(true|false)$/i.test(value)) return "boolean";
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) return "date";
      if (/@/.test(value) && /\.\w+$/.test(value)) return "email";
      if (/^https?:\/\//.test(value)) return "url";
    }
    return "string";
  }

  private quickTypeInference(values: CellValue[]): InferredDataType {
    const nonNull = values.filter((v) => !v.isNull);
    if (nonNull.length === 0) return "unknown";

    const types = nonNull.map((v) => v.dataType);
    const typeCounts = new Map<InferredDataType, number>();

    for (const t of types) {
      typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    }

    let bestType: InferredDataType = "string";
    let bestCount = 0;

    for (const [type, count] of typeCounts) {
      if (count > bestCount) {
        bestCount = count;
        bestType = type;
      }
    }

    return bestType;
  }

  private normalizeColumnName(header: string | null, index: number): string {
    if (!header) return `column_${index + 1}`;

    // Clean up the header
    return (
      header
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, "_")
        .replace(/^_+|_+$/g, "") || `column_${index + 1}`
    );
  }

  private indexToLetter(index: number): string {
    let result = "";
    let n = index;

    while (n >= 0) {
      result = String.fromCharCode(65 + (n % 26)) + result;
      n = Math.floor(n / 26) - 1;
    }

    return result;
  }

  private detectSheetIssues(
    sheet: DataSheet,
    rows: DataRow[],
    warnings: string[],
  ): void {
    // Detect inconsistent column counts
    const columnCounts = rows.map(
      (r) => r.cells.filter((c) => !c.isNull).length,
    );
    const uniqueCounts = new Set(columnCounts.filter((c) => c > 0));

    if (uniqueCounts.size > 1) {
      warnings.push("Rows have inconsistent number of columns");
      (sheet.issues as SheetIssue[]).push({
        code: "INCONSISTENT_COLUMNS",
        severity: "warning",
        message: "Rows have varying number of columns",
        rowRange: null,
        columnRange: null,
      });
    }
  }
}

// =============================================================================
// JSON PARSER
// =============================================================================

/**
 * Parser for JSON files (arrays of objects)
 */
export class JSONParser implements DataParser {
  readonly supportedExtensions = ["json"];
  readonly supportedMimeTypes = ["application/json"];

  canParse(filename: string, mimeType?: string): boolean {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    return (
      this.supportedExtensions.includes(ext) ||
      (mimeType !== undefined && this.supportedMimeTypes.includes(mimeType))
    );
  }

  async parse(
    content: ArrayBuffer | string,
    filename: string,
    options: Partial<ParseOptions> = {},
  ): Promise<ParseResult> {
    const opts = { ...DEFAULT_PARSE_OPTIONS, ...options };
    const errors: ParseError[] = [];
    const warnings: string[] = [];

    let text: string;
    if (content instanceof ArrayBuffer) {
      text = new TextDecoder("utf-8").decode(content);
    } else {
      text = content;
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (e) {
      errors.push({
        code: "PARSE_ERROR",
        message: `Invalid JSON: ${e instanceof Error ? e.message : "Unknown error"}`,
      });
      return {
        success: false,
        sourceType: "json",
        sheets: [],
        encoding: "utf-8",
        errors,
        warnings,
        metadata: {},
      };
    }

    // Handle different JSON structures
    const sheets: DataSheet[] = [];

    if (Array.isArray(data)) {
      // Array of objects
      sheets.push(this.arrayToSheet(data, filename, opts));
    } else if (typeof data === "object" && data !== null) {
      // Object with named arrays
      const obj = data as Record<string, unknown>;
      let sheetIndex = 0;

      for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value)) {
          const sheet = this.arrayToSheet(value, key, opts);
          // Reassign properties using spread to create new object with correct values
          const sheetWithId: DataSheet = {
            ...sheet,
            id: `sheet_${sheetIndex}` as SheetId,
            index: sheetIndex,
          };
          sheets.push(sheetWithId);
          sheetIndex++;
        }
      }

      // If no arrays found, treat the whole object as a single row
      if (sheets.length === 0) {
        sheets.push(this.objectToSheet(obj, filename, opts));
      }
    }

    return {
      success: errors.length === 0,
      sourceType: "json",
      sheets,
      encoding: "utf-8",
      errors,
      warnings,
      metadata: {
        structure: Array.isArray(data) ? "array" : "object",
        totalItems: Array.isArray(data)
          ? data.length
          : Object.keys(data as object).length,
      },
    };
  }

  private arrayToSheet(
    data: unknown[],
    name: string,
    options: ParseOptions,
  ): DataSheet {
    if (data.length === 0) {
      return this.emptySheet(name);
    }

    // Get all unique keys from all objects
    const allKeys = new Set<string>();
    for (const item of data.slice(0, options.maxPreviewRows)) {
      if (typeof item === "object" && item !== null) {
        Object.keys(item as object).forEach((k) => allKeys.add(k));
      }
    }

    const keys = Array.from(allKeys);
    const columns = this.buildColumns(keys, data, options);
    const rows = this.buildRows(data, keys, options);

    return {
      id: "sheet_0" as SheetId,
      sourceId: "" as DataSourceId,
      name,
      index: 0,
      rowCount: data.length,
      columnCount: keys.length,
      headerRow: null, // JSON doesn't have a header row in the data
      dataStartRow: 0,
      dataEndRow: Math.min(data.length, options.maxPreviewRows) - 1,
      columns,
      sampleRows: rows.slice(0, options.maxPreviewRows),
      issues: [],
    };
  }

  private objectToSheet(
    data: Record<string, unknown>,
    name: string,
    options: ParseOptions,
  ): DataSheet {
    const keys = Object.keys(data);
    const values = Object.values(data);

    const columns: DetectedColumn[] = [
      this.buildSingleColumn(
        0,
        "key",
        keys.map((k) => k),
      ),
      this.buildSingleColumn(1, "value", values),
    ];

    const rows: DataRow[] = keys.map((key, index) => ({
      rowIndex: index,
      cells: [this.createCell(key, 0), this.createCell(values[index], 1)],
      rowType: "data" as RowType,
      issues: [],
    }));

    return {
      id: "sheet_0" as SheetId,
      sourceId: "" as DataSourceId,
      name,
      index: 0,
      rowCount: keys.length,
      columnCount: 2,
      headerRow: null,
      dataStartRow: 0,
      dataEndRow: keys.length - 1,
      columns,
      sampleRows: rows.slice(0, options.maxPreviewRows),
      issues: [],
    };
  }

  private emptySheet(name: string): DataSheet {
    return {
      id: "sheet_0" as SheetId,
      sourceId: "" as DataSourceId,
      name,
      index: 0,
      rowCount: 0,
      columnCount: 0,
      headerRow: null,
      dataStartRow: 0,
      dataEndRow: 0,
      columns: [],
      sampleRows: [],
      issues: [
        {
          code: "EMPTY_DATA",
          severity: "warning",
          message: "No data found in JSON",
          rowRange: null,
          columnRange: null,
        },
      ],
    };
  }

  private buildColumns(
    keys: string[],
    data: unknown[],
    options: ParseOptions,
  ): DetectedColumn[] {
    return keys.map((key, index) => {
      const values = data
        .slice(0, options.maxPreviewRows)
        .map((item) => (item as Record<string, unknown>)?.[key]);

      const sampleValues = values.map((v) => this.createCell(v, index));

      return {
        index,
        letter: this.indexToLetter(index),
        headerValue: key,
        normalizedName: this.normalizeColumnName(key),
        inferredType: this.inferColumnType(values),
        typeConfidence: 0.8,
        nullCount: values.filter((v) => v === null || v === undefined).length,
        uniqueCount: new Set(values.map((v) => JSON.stringify(v))).size,
        sampleValues,
        semanticType: null,
        semanticConfidence: 0,
        issues: [],
      };
    });
  }

  private buildRows(
    data: unknown[],
    keys: string[],
    options: ParseOptions,
  ): DataRow[] {
    return data.slice(0, options.maxPreviewRows).map((item, rowIndex) => {
      const obj = item as Record<string, unknown>;
      const cells = keys.map((key, colIndex) =>
        this.createCell(obj?.[key], colIndex),
      );

      return {
        rowIndex,
        cells,
        rowType: "data" as RowType,
        issues: [],
      };
    });
  }

  private buildSingleColumn(
    index: number,
    name: string,
    values: unknown[],
  ): DetectedColumn {
    return {
      index,
      letter: this.indexToLetter(index),
      headerValue: name,
      normalizedName: name,
      inferredType: this.inferColumnType(values),
      typeConfidence: 0.8,
      nullCount: values.filter((v) => v === null || v === undefined).length,
      uniqueCount: new Set(values.map((v) => JSON.stringify(v))).size,
      sampleValues: values.map((v, _) => this.createCell(v, index)),
      semanticType: null,
      semanticConfidence: 0,
      issues: [],
    };
  }

  private createCell(value: unknown, columnIndex: number): CellValue {
    const isNull = value === null || value === undefined;
    let displayValue: string;
    let dataType: InferredDataType;

    if (isNull) {
      displayValue = "";
      dataType = "unknown";
    } else if (typeof value === "object") {
      displayValue = JSON.stringify(value);
      dataType = Array.isArray(value) ? "array" : "json";
    } else {
      displayValue = String(value);
      dataType = this.inferValueType(value);
    }

    return {
      columnIndex,
      rawValue: value,
      displayValue,
      formattedValue: null,
      formula: null,
      dataType,
      style: null,
      isNull,
      isMerged: false,
      mergeSpan: null,
    };
  }

  private inferColumnType(values: unknown[]): InferredDataType {
    const nonNull = values.filter((v) => v !== null && v !== undefined);
    if (nonNull.length === 0) return "unknown";

    const types = nonNull.map((v) => this.inferValueType(v));
    const typeCounts = new Map<InferredDataType, number>();

    for (const t of types) {
      typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    }

    let bestType: InferredDataType = "string";
    let bestCount = 0;

    for (const [type, count] of typeCounts) {
      if (count > bestCount) {
        bestCount = count;
        bestType = type;
      }
    }

    return bestType;
  }

  private inferValueType(value: unknown): InferredDataType {
    if (value === null || value === undefined) return "unknown";
    if (typeof value === "number")
      return Number.isInteger(value) ? "integer" : "number";
    if (typeof value === "boolean") return "boolean";
    if (Array.isArray(value)) return "array";
    if (typeof value === "object") return "json";
    return "string";
  }

  private normalizeColumnName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  private indexToLetter(index: number): string {
    let result = "";
    let n = index;

    while (n >= 0) {
      result = String.fromCharCode(65 + (n % 26)) + result;
      n = Math.floor(n / 26) - 1;
    }

    return result;
  }
}

// =============================================================================
// MARKDOWN PARSER (for flashcard-like content)
// =============================================================================

/**
 * Parser for Markdown files that may contain flashcard content
 */
export class MarkdownFlashcardParser implements DataParser {
  readonly supportedExtensions = ["md", "markdown"];
  readonly supportedMimeTypes = ["text/markdown", "text/x-markdown"];

  canParse(filename: string, mimeType?: string): boolean {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    return (
      this.supportedExtensions.includes(ext) ||
      (mimeType !== undefined && this.supportedMimeTypes.includes(mimeType))
    );
  }

  async parse(
    content: ArrayBuffer | string,
    filename: string,
    options: Partial<ParseOptions> = {},
  ): Promise<ParseResult> {
    const opts = { ...DEFAULT_PARSE_OPTIONS, ...options };
    const warnings: string[] = [];

    let text: string;
    if (content instanceof ArrayBuffer) {
      text = new TextDecoder("utf-8").decode(content);
    } else {
      text = content;
    }

    // Try to detect flashcard patterns
    const cards = this.extractCards(text);

    if (cards.length === 0) {
      // No cards found, treat as sections
      return this.parseAsSections(text, filename, opts);
    }

    // Build sheet from cards
    const columns: DetectedColumn[] = [
      this.buildColumn(
        0,
        "front",
        cards.map((c) => c.front),
      ),
      this.buildColumn(
        1,
        "back",
        cards.map((c) => c.back),
      ),
    ];

    if (cards.some((c) => c.tags.length > 0)) {
      columns.push(
        this.buildColumn(
          2,
          "tags",
          cards.map((c) => c.tags.join(", ")),
        ),
      );
    }

    const rows: DataRow[] = cards
      .slice(0, opts.maxPreviewRows)
      .map((card, index) => ({
        rowIndex: index,
        cells: [
          this.createCell(card.front, 0),
          this.createCell(card.back, 1),
          ...(columns.length > 2
            ? [this.createCell(card.tags.join(", "), 2)]
            : []),
        ],
        rowType: "data" as RowType,
        issues: [],
      }));

    const sheet: DataSheet = {
      id: "sheet_0" as SheetId,
      sourceId: "" as DataSourceId,
      name: filename.replace(/\.[^.]+$/, ""),
      index: 0,
      rowCount: cards.length,
      columnCount: columns.length,
      headerRow: null,
      dataStartRow: 0,
      dataEndRow: Math.min(cards.length, opts.maxPreviewRows) - 1,
      columns,
      sampleRows: rows,
      issues: [],
    };

    return {
      success: true,
      sourceType: "markdown",
      sheets: [sheet],
      encoding: "utf-8",
      errors: [],
      warnings,
      metadata: {
        cardCount: cards.length,
        format: "flashcards",
      },
    };
  }

  private extractCards(
    text: string,
  ): Array<{ front: string; back: string; tags: string[] }> {
    const cards: Array<{ front: string; back: string; tags: string[] }> = [];

    // Pattern 1: Q: / A: format
    const qaPattern = /Q:\s*(.+?)\s*A:\s*(.+?)(?=Q:|$)/gs;
    let match;
    while ((match = qaPattern.exec(text)) !== null) {
      cards.push({
        front: match[1].trim(),
        back: match[2].trim(),
        tags: [],
      });
    }

    if (cards.length > 0) return cards;

    // Pattern 2: ## Question / Answer format
    const headingPattern = /##\s*(.+?)\n([\s\S]+?)(?=##|$)/g;
    while ((match = headingPattern.exec(text)) !== null) {
      const heading = match[1].trim();
      const content = match[2].trim();

      // Skip if heading doesn't look like a question
      if (content.length > 0) {
        cards.push({
          front: heading,
          back: content.split("\n\n")[0].trim(),
          tags: [],
        });
      }
    }

    if (cards.length > 0) return cards;

    // Pattern 3: Term :: Definition (like Obsidian)
    const colonPattern = /^(.+?)\s*::\s*(.+)$/gm;
    while ((match = colonPattern.exec(text)) !== null) {
      cards.push({
        front: match[1].trim(),
        back: match[2].trim(),
        tags: [],
      });
    }

    return cards;
  }

  private parseAsSections(
    text: string,
    filename: string,
    options: ParseOptions,
  ): ParseResult {
    // Split by headings
    const sections: Array<{ title: string; content: string; level: number }> =
      [];
    const headingPattern = /^(#{1,6})\s+(.+)$/gm;
    let match;

    const matches: Array<{ level: number; title: string; index: number }> = [];
    while ((match = headingPattern.exec(text)) !== null) {
      matches.push({
        level: match[1].length,
        title: match[2].trim(),
        index: match.index,
      });
    }

    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      const next = matches[i + 1];
      const contentStart =
        current.index + text.substring(current.index).indexOf("\n") + 1;
      const contentEnd = next?.index ?? text.length;
      const content = text.substring(contentStart, contentEnd).trim();

      sections.push({
        title: current.title,
        content,
        level: current.level,
      });
    }

    if (sections.length === 0) {
      // No headings, treat whole content as one section
      sections.push({
        title: filename,
        content: text.trim(),
        level: 1,
      });
    }

    const columns: DetectedColumn[] = [
      this.buildColumn(
        0,
        "title",
        sections.map((s) => s.title),
      ),
      this.buildColumn(
        1,
        "content",
        sections.map((s) => s.content),
      ),
      this.buildColumn(
        2,
        "level",
        sections.map((s) => s.level),
      ),
    ];

    const rows: DataRow[] = sections
      .slice(0, options.maxPreviewRows)
      .map((section, index) => ({
        rowIndex: index,
        cells: [
          this.createCell(section.title, 0),
          this.createCell(section.content, 1),
          this.createCell(section.level, 2),
        ],
        rowType: "data" as RowType,
        issues: [],
      }));

    const sheet: DataSheet = {
      id: "sheet_0" as SheetId,
      sourceId: "" as DataSourceId,
      name: filename.replace(/\.[^.]+$/, ""),
      index: 0,
      rowCount: sections.length,
      columnCount: 3,
      headerRow: null,
      dataStartRow: 0,
      dataEndRow: Math.min(sections.length, options.maxPreviewRows) - 1,
      columns,
      sampleRows: rows,
      issues: [],
    };

    return {
      success: true,
      sourceType: "markdown",
      sheets: [sheet],
      encoding: "utf-8",
      errors: [],
      warnings: ["No flashcard patterns detected, imported as sections"],
      metadata: {
        sectionCount: sections.length,
        format: "sections",
      },
    };
  }

  private buildColumn(
    index: number,
    name: string,
    values: unknown[],
  ): DetectedColumn {
    return {
      index,
      letter: String.fromCharCode(65 + index),
      headerValue: name,
      normalizedName: name,
      inferredType: this.inferType(values),
      typeConfidence: 0.8,
      nullCount: values.filter((v) => v === null || v === undefined || v === "")
        .length,
      uniqueCount: new Set(values).size,
      sampleValues: values
        .slice(0, 20)
        .map((v, _) => this.createCell(v, index)),
      semanticType:
        name === "front" ? "front" : name === "back" ? "back" : null,
      semanticConfidence: name === "front" || name === "back" ? 0.9 : 0,
      issues: [],
    };
  }

  private createCell(value: unknown, columnIndex: number): CellValue {
    const isNull = value === null || value === undefined || value === "";
    return {
      columnIndex,
      rawValue: value,
      displayValue: isNull ? "" : String(value),
      formattedValue: null,
      formula: null,
      dataType: this.inferValueType(value),
      style: null,
      isNull,
      isMerged: false,
      mergeSpan: null,
    };
  }

  private inferType(values: unknown[]): InferredDataType {
    const nonNull = values.filter(
      (v) => v !== null && v !== undefined && v !== "",
    );
    if (nonNull.length === 0) return "unknown";

    const allNumbers = nonNull.every((v) => typeof v === "number");
    if (allNumbers) return "integer";

    return "string";
  }

  private inferValueType(value: unknown): InferredDataType {
    if (value === null || value === undefined || value === "") return "unknown";
    if (typeof value === "number") return "integer";
    return "string";
  }
}

// =============================================================================
// YAML PARSER
// =============================================================================

/**
 * Parser for YAML files
 * YAML is commonly used for configuration and structured data
 */
export class YAMLParser implements DataParser {
  readonly supportedExtensions = ["yaml", "yml"];
  readonly supportedMimeTypes = [
    "text/yaml",
    "text/x-yaml",
    "application/x-yaml",
    "application/yaml",
  ];

  canParse(filename: string, mimeType?: string): boolean {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    return (
      this.supportedExtensions.includes(ext) ||
      (mimeType !== undefined && this.supportedMimeTypes.includes(mimeType))
    );
  }

  async parse(
    content: ArrayBuffer | string,
    filename: string,
    options: Partial<ParseOptions> = {},
  ): Promise<ParseResult> {
    const opts = { ...DEFAULT_PARSE_OPTIONS, ...options };
    const errors: ParseError[] = [];
    const warnings: string[] = [];

    let text: string;
    if (content instanceof ArrayBuffer) {
      text = new TextDecoder("utf-8").decode(content);
    } else {
      text = content;
    }

    try {
      // Simple YAML parser - handles common cases
      const parsed = this.parseYAML(text);

      if (parsed === null) {
        return {
          success: false,
          sourceType: "yaml",
          sheets: [],
          encoding: "utf-8",
          errors: [{ code: "EMPTY_FILE", message: "YAML file is empty" }],
          warnings: [],
          metadata: {},
        };
      }

      const sheets = this.convertToSheets(parsed, filename, opts);

      return {
        success: true,
        sourceType: "yaml",
        sheets,
        encoding: "utf-8",
        errors,
        warnings,
        metadata: {
          format: "yaml",
          documentCount: sheets.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        sourceType: "yaml",
        sheets: [],
        encoding: "utf-8",
        errors: [
          {
            code: "YAML_PARSE_ERROR",
            message: error instanceof Error ? error.message : "Invalid YAML",
          },
        ],
        warnings: [],
        metadata: {},
      };
    }
  }

  /**
   * Simple YAML parser for common structures
   * Handles: objects, arrays, scalars, multi-document YAML
   */
  private parseYAML(text: string): unknown {
    const trimmed = text.trim();
    if (!trimmed) return null;

    // Handle multi-document YAML
    if (trimmed.includes("\n---\n") || trimmed.startsWith("---\n")) {
      const documents = trimmed
        .split(/^---$/m)
        .map((d) => d.trim())
        .filter((d) => d.length > 0);
      if (documents.length > 1) {
        return documents.map((doc) => this.parseYAMLDocument(doc));
      }
    }

    return this.parseYAMLDocument(trimmed);
  }

  private parseYAMLDocument(text: string): unknown {
    const lines = text.split("\n");
    const result: Record<string, unknown> = {};
    let currentKey: string | null = null;
    let currentArray: unknown[] | null = null;
    let inArray = false;
    let arrayIndent = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Skip comments and empty lines
      if (trimmedLine.startsWith("#") || trimmedLine === "") continue;

      const indent = line.length - line.trimStart().length;

      // Check for array item
      if (trimmedLine.startsWith("- ")) {
        const value = trimmedLine.substring(2).trim();
        if (!inArray || currentKey === null) {
          // New array
          inArray = true;
          arrayIndent = indent;
          currentArray = [];
        }
        if (currentArray) {
          currentArray.push(this.parseValue(value));
          if (currentKey) {
            result[currentKey] = currentArray;
          }
        }
        continue;
      }

      // End array if indent decreases
      if (inArray && indent <= arrayIndent && !trimmedLine.startsWith("- ")) {
        inArray = false;
        currentArray = null;
      }

      // Key-value pair
      const colonIndex = trimmedLine.indexOf(":");
      if (colonIndex > 0) {
        const key = trimmedLine.substring(0, colonIndex).trim();
        const valueStr = trimmedLine.substring(colonIndex + 1).trim();

        if (valueStr === "" || valueStr === "|" || valueStr === ">") {
          // Multi-line value or nested object
          currentKey = key;
          if (valueStr === "|" || valueStr === ">") {
            // Collect multi-line string
            const multiLineValue: string[] = [];
            let j = i + 1;
            const baseIndent = indent + 2;
            while (j < lines.length) {
              const nextLine = lines[j];
              const nextIndent = nextLine.length - nextLine.trimStart().length;
              if (
                nextLine.trim() === "" ||
                (nextLine.trim() !== "" && nextIndent >= baseIndent)
              ) {
                multiLineValue.push(
                  nextIndent >= baseIndent
                    ? nextLine.substring(baseIndent)
                    : nextLine,
                );
                j++;
              } else {
                break;
              }
            }
            result[key] =
              valueStr === "|"
                ? multiLineValue.join("\n")
                : multiLineValue.join(" ").trim();
            i = j - 1;
          }
        } else {
          result[key] = this.parseValue(valueStr);
          currentKey = key;
        }
      }
    }

    // Check if it's actually an array at root level
    if (Object.keys(result).length === 0 && text.trim().startsWith("-")) {
      const items: unknown[] = [];
      const lines2 = text.split("\n");
      for (const line of lines2) {
        const trimmed2 = line.trim();
        if (trimmed2.startsWith("- ")) {
          items.push(this.parseValue(trimmed2.substring(2).trim()));
        }
      }
      return items;
    }

    return result;
  }

  private parseValue(value: string): unknown {
    // Null
    if (value === "null" || value === "~" || value === "") return null;

    // Boolean
    if (value === "true" || value === "True" || value === "TRUE") return true;
    if (value === "false" || value === "False" || value === "FALSE")
      return false;

    // Number
    if (/^-?\d+$/.test(value)) return parseInt(value, 10);
    if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);

    // Quoted string
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }

    // Inline array
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1);
      return inner
        .split(",")
        .map((v) => this.parseValue(v.trim()))
        .filter((v) => v !== null);
    }

    return value;
  }

  private convertToSheets(
    data: unknown,
    filename: string,
    options: ParseOptions,
  ): DataSheet[] {
    const sheets: DataSheet[] = [];

    if (Array.isArray(data)) {
      // Root is an array - treat as single sheet
      const sheet = this.arrayToSheet(data, filename, 0, options);
      if (sheet) sheets.push(sheet);
    } else if (typeof data === "object" && data !== null) {
      // Check for arrays in the object
      const entries = Object.entries(data as Record<string, unknown>);
      let sheetIndex = 0;

      for (const [key, value] of entries) {
        if (Array.isArray(value) && value.length > 0) {
          const sheet = this.arrayToSheet(value, key, sheetIndex++, options);
          if (sheet) sheets.push(sheet);
        }
      }

      // If no arrays found, convert the object itself to a sheet
      if (sheets.length === 0) {
        const sheet = this.objectToSheet(
          data as Record<string, unknown>,
          filename,
          0,
          options,
        );
        if (sheet) sheets.push(sheet);
      }
    }

    return sheets;
  }

  private arrayToSheet(
    data: unknown[],
    name: string,
    index: number,
    options: ParseOptions,
  ): DataSheet | null {
    if (data.length === 0) return null;

    // Determine columns from first few items
    const allKeys = new Set<string>();
    const sampleItems = data.slice(0, 50);

    for (const item of sampleItems) {
      if (typeof item === "object" && item !== null && !Array.isArray(item)) {
        Object.keys(item as Record<string, unknown>).forEach((k) =>
          allKeys.add(k),
        );
      }
    }

    const keys = Array.from(allKeys);
    if (keys.length === 0) {
      // Array of primitives
      keys.push("value");
    }

    const columns: DetectedColumn[] = keys.map((key, colIndex) =>
      this.buildColumn(
        colIndex,
        key,
        data.slice(0, 50).map((item) => {
          if (typeof item === "object" && item !== null) {
            return (item as Record<string, unknown>)[key];
          }
          return key === "value" ? item : null;
        }),
      ),
    );

    const rows: DataRow[] = data
      .slice(0, options.maxPreviewRows)
      .map((item, rowIndex) => ({
        rowIndex,
        cells: keys.map((key, colIndex) => {
          let value: unknown;
          if (typeof item === "object" && item !== null) {
            value = (item as Record<string, unknown>)[key];
          } else {
            value = key === "value" ? item : null;
          }
          return this.createCell(value, colIndex);
        }),
        rowType: "data" as RowType,
        issues: [],
      }));

    return {
      id: `sheet_${index}` as SheetId,
      sourceId: "" as DataSourceId,
      name: name.replace(/\.[^.]+$/, ""),
      index,
      rowCount: data.length,
      columnCount: keys.length,
      headerRow: null,
      dataStartRow: 0,
      dataEndRow: Math.min(data.length, options.maxPreviewRows) - 1,
      columns,
      sampleRows: rows,
      issues: [],
    };
  }

  private objectToSheet(
    data: Record<string, unknown>,
    name: string,
    index: number,
    _options: ParseOptions,
  ): DataSheet | null {
    const entries = Object.entries(data);
    if (entries.length === 0) return null;

    const columns: DetectedColumn[] = [
      this.buildColumn(
        0,
        "key",
        entries.map(([k]) => k),
      ),
      this.buildColumn(
        1,
        "value",
        entries.map(([, v]) => (typeof v === "object" ? JSON.stringify(v) : v)),
      ),
    ];

    const rows: DataRow[] = entries.map(([key, value], rowIndex) => ({
      rowIndex,
      cells: [
        this.createCell(key, 0),
        this.createCell(
          typeof value === "object" ? JSON.stringify(value) : value,
          1,
        ),
      ],
      rowType: "data" as RowType,
      issues: [],
    }));

    return {
      id: `sheet_${index}` as SheetId,
      sourceId: "" as DataSourceId,
      name: name.replace(/\.[^.]+$/, ""),
      index,
      rowCount: entries.length,
      columnCount: 2,
      headerRow: null,
      dataStartRow: 0,
      dataEndRow: entries.length - 1,
      columns,
      sampleRows: rows,
      issues: [],
    };
  }

  private buildColumn(
    index: number,
    name: string,
    values: unknown[],
  ): DetectedColumn {
    return {
      index,
      letter: String.fromCharCode(65 + index),
      headerValue: name,
      normalizedName: name,
      inferredType: this.inferType(values),
      typeConfidence: 0.8,
      nullCount: values.filter((v) => v === null || v === undefined).length,
      uniqueCount: new Set(values.map((v) => JSON.stringify(v))).size,
      sampleValues: values
        .slice(0, 20)
        .map((v, _) => this.createCell(v, index)),
      semanticType: null,
      semanticConfidence: 0,
      issues: [],
    };
  }

  private createCell(value: unknown, columnIndex: number): CellValue {
    const isNull = value === null || value === undefined;
    const displayValue = isNull
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
    return {
      columnIndex,
      rawValue: value,
      displayValue,
      formattedValue: null,
      formula: null,
      dataType: this.inferValueType(value),
      style: null,
      isNull,
      isMerged: false,
      mergeSpan: null,
    };
  }

  private inferType(values: unknown[]): InferredDataType {
    const nonNull = values.filter((v) => v !== null && v !== undefined);
    if (nonNull.length === 0) return "unknown";

    const types = nonNull.map((v) => typeof v);
    const uniqueTypes = new Set(types);

    if (uniqueTypes.size === 1) {
      const type = types[0];
      if (type === "number") return "number";
      if (type === "boolean") return "boolean";
      if (type === "string") {
        // Check for dates
        const datePattern = /^\d{4}-\d{2}-\d{2}/;
        if (nonNull.every((v) => datePattern.test(String(v)))) return "date";
        return "string";
      }
    }

    return "mixed";
  }

  private inferValueType(value: unknown): InferredDataType {
    if (value === null || value === undefined) return "unknown";
    if (typeof value === "number")
      return Number.isInteger(value) ? "integer" : "number";
    if (typeof value === "boolean") return "boolean";
    if (Array.isArray(value)) return "array";
    if (typeof value === "object") return "json";
    return "string";
  }
}

// =============================================================================
// EXCEL/XLSX PARSER
// =============================================================================

/**
 * Parser for Excel files (XLSX, XLS)
 *
 * Note: Full Excel parsing requires external libraries like SheetJS.
 * This is a structural parser that extracts what it can from the binary format.
 * For full support, integrate SheetJS (xlsx) in the runtime environment.
 */
export class ExcelParser implements DataParser {
  readonly supportedExtensions = ["xlsx", "xls", "xlsm", "xlsb"];
  readonly supportedMimeTypes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/vnd.ms-excel.sheet.macroEnabled.12",
    "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
  ];

  canParse(filename: string, mimeType?: string): boolean {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    return (
      this.supportedExtensions.includes(ext) ||
      (mimeType !== undefined && this.supportedMimeTypes.includes(mimeType))
    );
  }

  async parse(
    content: ArrayBuffer | string,
    filename: string,
    options: Partial<ParseOptions> = {},
  ): Promise<ParseResult> {
    const opts = { ...DEFAULT_PARSE_OPTIONS, ...options };
    const warnings: string[] = [];

    // Ensure we have binary data
    let buffer: ArrayBuffer;
    if (typeof content === "string") {
      // If string is base64 encoded
      if (content.startsWith("UEs") || /^[A-Za-z0-9+/=]+$/.test(content)) {
        buffer = this.base64ToArrayBuffer(content);
      } else {
        return {
          success: false,
          sourceType: "excel",
          sheets: [],
          encoding: "binary",
          errors: [
            {
              code: "INVALID_FORMAT",
              message: "Excel files must be provided as binary ArrayBuffer",
            },
          ],
          warnings: [],
          metadata: {},
        };
      }
    } else {
      buffer = content;
    }

    try {
      // Verify this is a valid ZIP (XLSX is a ZIP archive)
      if (!this.isValidZip(buffer)) {
        return {
          success: false,
          sourceType: "excel",
          sheets: [],
          encoding: "binary",
          errors: [
            { code: "INVALID_FORMAT", message: "Not a valid Excel file" },
          ],
          warnings: [],
          metadata: {},
        };
      }

      // Parse the XLSX structure
      const sheets = await this.parseXLSX(buffer, filename, opts);

      if (sheets.length === 0) {
        warnings.push(
          "No data sheets found. For full Excel support, use SheetJS library.",
        );
      }

      return {
        success: true,
        sourceType: "excel",
        sheets,
        encoding: "binary",
        errors: [],
        warnings,
        metadata: {
          format: filename.endsWith(".xls") ? "xls" : "xlsx",
          sheetCount: sheets.length,
          note: "Basic parsing. For full support, integrate SheetJS.",
        },
      };
    } catch (error) {
      return {
        success: false,
        sourceType: "excel",
        sheets: [],
        encoding: "binary",
        errors: [
          {
            code: "EXCEL_PARSE_ERROR",
            message: error instanceof Error ? error.message : "Unknown error",
          },
        ],
        warnings: [],
        metadata: {},
      };
    }
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private isValidZip(buffer: ArrayBuffer): boolean {
    const view = new DataView(buffer);
    // ZIP magic number: PK (0x504B)
    return view.getUint16(0, false) === 0x504b;
  }

  private async parseXLSX(
    buffer: ArrayBuffer,
    filename: string,
    options: ParseOptions,
  ): Promise<DataSheet[]> {
    // Basic XLSX parsing without external libraries
    // XLSX is a ZIP file containing XML files
    // We'll extract what we can from the structure

    const sheets: DataSheet[] = [];

    // For now, create a placeholder sheet indicating that full parsing
    // requires external library integration
    let sheet: DataSheet = {
      id: "sheet_0" as SheetId,
      sourceId: "" as DataSourceId,
      name: filename.replace(/\.[^.]+$/, ""),
      index: 0,
      rowCount: 0,
      columnCount: 0,
      headerRow: null,
      dataStartRow: 0,
      dataEndRow: 0,
      columns: [],
      sampleRows: [],
      issues: [
        {
          code: "NEEDS_LIBRARY",
          severity: "warning",
          message:
            "Full Excel parsing requires SheetJS library. File structure is valid. Install xlsx package for complete Excel support.",
          rowRange: null,
          columnRange: null,
        },
      ],
    };

    // Try to extract sheet names from the ZIP structure
    try {
      const zipContents = this.listZipContents(buffer);
      const sheetFiles = zipContents.filter(
        (f) => f.includes("worksheets/sheet") && f.endsWith(".xml"),
      );

      if (sheetFiles.length > 0) {
        // Update metadata
        const updatedIssue = {
          ...sheet.issues[0],
          message: `Found ${sheetFiles.length} worksheet(s). Full parsing requires SheetJS.`,
        };
        sheet = {
          ...sheet,
          issues: [updatedIssue],
        };
      }
    } catch {
      // Ignore ZIP parsing errors
    }

    sheets.push(sheet);
    return sheets;
  }

  private listZipContents(buffer: ArrayBuffer): string[] {
    // Simplified ZIP directory listing
    const view = new DataView(buffer);
    const contents: string[] = [];

    // Find the end of central directory
    let eocdOffset = buffer.byteLength - 22;
    while (eocdOffset >= 0) {
      if (view.getUint32(eocdOffset, true) === 0x06054b50) {
        break;
      }
      eocdOffset--;
    }

    if (eocdOffset < 0) return contents;

    const cdOffset = view.getUint32(eocdOffset + 16, true);
    const cdEntries = view.getUint16(eocdOffset + 10, true);

    let offset = cdOffset;
    for (let i = 0; i < cdEntries && offset < buffer.byteLength; i++) {
      if (view.getUint32(offset, true) !== 0x02014b50) break;

      const nameLen = view.getUint16(offset + 28, true);
      const extraLen = view.getUint16(offset + 30, true);
      const commentLen = view.getUint16(offset + 32, true);

      const nameBytes = new Uint8Array(buffer, offset + 46, nameLen);
      const name = new TextDecoder().decode(nameBytes);
      contents.push(name);

      offset += 46 + nameLen + extraLen + commentLen;
    }

    return contents;
  }
}

// =============================================================================
// PDF PARSER
// =============================================================================

/**
 * Parser for PDF files
 *
 * Note: Full PDF text extraction requires external libraries like pdf.js or pdfparse.
 * This is a basic parser that identifies the file and extracts what text it can.
 */
export class PDFParser implements DataParser {
  readonly supportedExtensions = ["pdf"];
  readonly supportedMimeTypes = ["application/pdf"];

  canParse(filename: string, mimeType?: string): boolean {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    return (
      this.supportedExtensions.includes(ext) ||
      (mimeType !== undefined && this.supportedMimeTypes.includes(mimeType))
    );
  }

  async parse(
    content: ArrayBuffer | string,
    filename: string,
    options: Partial<ParseOptions> = {},
  ): Promise<ParseResult> {
    const opts = { ...DEFAULT_PARSE_OPTIONS, ...options };
    const warnings: string[] = [];

    // Ensure we have binary data
    let buffer: ArrayBuffer;
    if (typeof content === "string") {
      // If string is base64 encoded
      if (/^[A-Za-z0-9+/=]+$/.test(content)) {
        buffer = this.base64ToArrayBuffer(content);
      } else {
        // Might be raw PDF text (unlikely but handle it)
        const encoder = new TextEncoder();
        buffer = encoder.encode(content).buffer;
      }
    } else {
      buffer = content;
    }

    try {
      // Verify PDF magic number
      if (!this.isValidPDF(buffer)) {
        return {
          success: false,
          sourceType: "pdf",
          sheets: [],
          encoding: "binary",
          errors: [{ code: "INVALID_FORMAT", message: "Not a valid PDF file" }],
          warnings: [],
          metadata: {},
        };
      }

      // Extract text content from PDF
      const textContent = this.extractText(buffer);

      if (!textContent || textContent.trim().length === 0) {
        warnings.push(
          "Could not extract text. PDF may be image-based or encrypted.",
        );
        warnings.push("For full PDF support, use pdf.js or pdfparse library.");
      }

      // Parse extracted text into structured data
      const sheets = this.textToSheets(textContent, filename, opts);

      return {
        success: true,
        sourceType: "pdf",
        sheets,
        encoding: "binary",
        errors: [],
        warnings,
        metadata: {
          format: "pdf",
          extractedTextLength: textContent.length,
          note: "Basic text extraction. For full support, integrate pdf.js.",
        },
      };
    } catch (error) {
      return {
        success: false,
        sourceType: "pdf",
        sheets: [],
        encoding: "binary",
        errors: [
          {
            code: "PDF_PARSE_ERROR",
            message: error instanceof Error ? error.message : "Unknown error",
          },
        ],
        warnings: [],
        metadata: {},
      };
    }
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private isValidPDF(buffer: ArrayBuffer): boolean {
    const view = new Uint8Array(buffer, 0, 5);
    // PDF magic: %PDF-
    return (
      view[0] === 0x25 && // %
      view[1] === 0x50 && // P
      view[2] === 0x44 && // D
      view[3] === 0x46 && // F
      view[4] === 0x2d // -
    );
  }

  private extractText(buffer: ArrayBuffer): string {
    // Basic PDF text extraction
    // PDFs store text in streams, often compressed
    // This is a simplified extractor for uncompressed text

    const bytes = new Uint8Array(buffer);
    const text: string[] = [];

    // Look for text streams (BT...ET blocks)
    const content = new TextDecoder("latin1").decode(bytes);

    // Pattern for text operators
    const textPattern = /\(([^)]*)\)\s*Tj|\[((?:[^[\]]*|\[[^\]]*\])*)\]\s*TJ/g;
    let match;

    while ((match = textPattern.exec(content)) !== null) {
      if (match[1]) {
        // Simple text string
        text.push(this.decodeString(match[1]));
      } else if (match[2]) {
        // Array of text strings
        const arrayContent = match[2];
        const stringPattern = /\(([^)]*)\)/g;
        let strMatch;
        while ((strMatch = stringPattern.exec(arrayContent)) !== null) {
          text.push(this.decodeString(strMatch[1]));
        }
      }
    }

    // Also look for plain text between stream markers
    const streamPattern = /stream\s*\n([\s\S]*?)\nendstream/g;
    while ((match = streamPattern.exec(content)) !== null) {
      const streamContent = match[1];
      // Look for readable text in the stream
      const readableText = streamContent.replace(/[^\x20-\x7E\n\r\t]/g, " ");
      if (readableText.trim().length > 20) {
        text.push(readableText.trim());
      }
    }

    return text.join("\n").replace(/\s+/g, " ").trim();
  }

  private decodeString(str: string): string {
    // Handle PDF string escapes
    return str
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\");
  }

  private textToSheets(
    text: string,
    filename: string,
    options: ParseOptions,
  ): DataSheet[] {
    if (!text || text.trim().length === 0) {
      return [
        {
          id: "sheet_0" as SheetId,
          sourceId: "" as DataSourceId,
          name: filename.replace(/\.[^.]+$/, ""),
          index: 0,
          rowCount: 0,
          columnCount: 0,
          headerRow: null,
          dataStartRow: 0,
          dataEndRow: 0,
          columns: [],
          sampleRows: [],
          issues: [
            {
              code: "NO_TEXT",
              severity: "warning",
              message:
                "No extractable text found in PDF. PDF may be image-based. Consider using OCR.",
              rowRange: null,
              columnRange: null,
            },
          ],
        },
      ];
    }

    // Split text into paragraphs/sections
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const columns: DetectedColumn[] = [
      this.buildColumn(0, "content", paragraphs.slice(0, 50)),
      this.buildColumn(
        1,
        "index",
        paragraphs.slice(0, 50).map((_, i) => i + 1),
      ),
    ];

    const rows: DataRow[] = paragraphs
      .slice(0, options.maxPreviewRows)
      .map((para, index) => ({
        rowIndex: index,
        cells: [this.createCell(para, 0), this.createCell(index + 1, 1)],
        rowType: "data" as RowType,
        issues: [],
      }));

    return [
      {
        id: "sheet_0" as SheetId,
        sourceId: "" as DataSourceId,
        name: filename.replace(/\.[^.]+$/, ""),
        index: 0,
        rowCount: paragraphs.length,
        columnCount: 2,
        headerRow: null,
        dataStartRow: 0,
        dataEndRow: Math.min(paragraphs.length, options.maxPreviewRows) - 1,
        columns,
        sampleRows: rows,
        issues: [],
      },
    ];
  }

  private buildColumn(
    index: number,
    name: string,
    values: unknown[],
  ): DetectedColumn {
    return {
      index,
      letter: String.fromCharCode(65 + index),
      headerValue: name,
      normalizedName: name,
      inferredType: name === "index" ? "integer" : "string",
      typeConfidence: 0.8,
      nullCount: 0,
      uniqueCount: new Set(values).size,
      sampleValues: values
        .slice(0, 20)
        .map((v, _) => this.createCell(v, index)),
      semanticType: name === "content" ? "front" : null,
      semanticConfidence: name === "content" ? 0.5 : 0,
      issues: [],
    };
  }

  private createCell(value: unknown, columnIndex: number): CellValue {
    const isNull = value === null || value === undefined || value === "";
    return {
      columnIndex,
      rawValue: value,
      displayValue: isNull ? "" : String(value),
      formattedValue: null,
      formula: null,
      dataType: typeof value === "number" ? "integer" : "string",
      style: null,
      isNull,
      isMerged: false,
      mergeSpan: null,
    };
  }
}

// =============================================================================
// TYPST PARSER
// =============================================================================

/**
 * Parser for Typst files
 * Typst is a modern markup-based typesetting system
 */
export class TypstParser implements DataParser {
  readonly supportedExtensions = ["typ", "typst"];
  readonly supportedMimeTypes = ["text/typst", "application/x-typst"];

  canParse(filename: string, mimeType?: string): boolean {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    return (
      this.supportedExtensions.includes(ext) ||
      (mimeType !== undefined && this.supportedMimeTypes.includes(mimeType))
    );
  }

  async parse(
    content: ArrayBuffer | string,
    filename: string,
    options: Partial<ParseOptions> = {},
  ): Promise<ParseResult> {
    const opts = { ...DEFAULT_PARSE_OPTIONS, ...options };
    const warnings: string[] = [];

    let text: string;
    if (content instanceof ArrayBuffer) {
      text = new TextDecoder("utf-8").decode(content);
    } else {
      text = content;
    }

    try {
      // Parse Typst content
      const cards = this.extractFlashcards(text);

      if (cards.length > 0) {
        // Found flashcard-like content
        return this.buildFlashcardResult(cards, filename, opts);
      }

      // Parse as document sections
      const sections = this.extractSections(text);

      if (sections.length > 0) {
        return this.buildSectionsResult(sections, filename, opts, warnings);
      }

      // Fall back to raw content
      return this.buildRawResult(text, filename, opts, warnings);
    } catch (error) {
      return {
        success: false,
        sourceType: "typst",
        sheets: [],
        encoding: "utf-8",
        errors: [
          {
            code: "TYPST_PARSE_ERROR",
            message: error instanceof Error ? error.message : "Unknown error",
          },
        ],
        warnings: [],
        metadata: {},
      };
    }
  }

  private extractFlashcards(
    text: string,
  ): Array<{ front: string; back: string; tags: string[] }> {
    const cards: Array<{ front: string; back: string; tags: string[] }> = [];

    // Pattern 1: #card(front: "...", back: "...")
    const cardFuncPattern =
      /#card\s*\(\s*front:\s*["']([^"']+)["']\s*,\s*back:\s*["']([^"']+)["']/g;
    let match;
    while ((match = cardFuncPattern.exec(text)) !== null) {
      cards.push({ front: match[1], back: match[2], tags: [] });
    }

    if (cards.length > 0) return cards;

    // Pattern 2: #flashcard[Question][Answer]
    const bracketPattern = /#flashcard\s*\[([^\]]+)\]\s*\[([^\]]+)\]/g;
    while ((match = bracketPattern.exec(text)) !== null) {
      cards.push({ front: match[1].trim(), back: match[2].trim(), tags: [] });
    }

    if (cards.length > 0) return cards;

    // Pattern 3: === Term / Definition format
    const defPattern = /===\s*(.+?)\n([\s\S]+?)(?====|$)/g;
    while ((match = defPattern.exec(text)) !== null) {
      const term = match[1].trim();
      const def = match[2].trim().split("\n")[0].trim();
      if (term && def) {
        cards.push({ front: term, back: def, tags: [] });
      }
    }

    return cards;
  }

  private extractSections(
    text: string,
  ): Array<{ title: string; content: string; level: number }> {
    const sections: Array<{
      title: string;
      content: string;
      level: number;
    }> = [];

    // Typst headings: = Heading, == Subheading, etc.
    const headingPattern = /^(=+)\s+(.+)$/gm;
    const matches: Array<{
      level: number;
      title: string;
      index: number;
    }> = [];
    let match;

    while ((match = headingPattern.exec(text)) !== null) {
      matches.push({
        level: match[1].length,
        title: match[2].trim(),
        index: match.index,
      });
    }

    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      const next = matches[i + 1];
      const contentStart =
        current.index + text.substring(current.index).indexOf("\n") + 1;
      const contentEnd = next?.index ?? text.length;
      const content = text.substring(contentStart, contentEnd).trim();

      sections.push({
        title: current.title,
        content: this.cleanTypstContent(content),
        level: current.level,
      });
    }

    return sections;
  }

  private cleanTypstContent(content: string): string {
    // Remove Typst markup
    return content
      .replace(/#\w+\[([^\]]*)\]/g, "$1") // #func[content] -> content
      .replace(/#\w+\([^)]*\)/g, "") // #func(...) -> remove
      .replace(/\*([^*]+)\*/g, "$1") // *bold* -> bold
      .replace(/_([^_]+)_/g, "$1") // _italic_ -> italic
      .replace(/`([^`]+)`/g, "$1") // `code` -> code
      .replace(/\$([^$]+)\$/g, "$1") // $math$ -> math
      .trim();
  }

  private buildFlashcardResult(
    cards: Array<{ front: string; back: string; tags: string[] }>,
    filename: string,
    options: ParseOptions,
  ): ParseResult {
    const columns: DetectedColumn[] = [
      this.buildColumn(
        0,
        "front",
        cards.map((c) => c.front),
      ),
      this.buildColumn(
        1,
        "back",
        cards.map((c) => c.back),
      ),
    ];

    if (cards.some((c) => c.tags.length > 0)) {
      columns.push(
        this.buildColumn(
          2,
          "tags",
          cards.map((c) => c.tags.join(", ")),
        ),
      );
    }

    const rows: DataRow[] = cards
      .slice(0, options.maxPreviewRows)
      .map((card, index) => ({
        rowIndex: index,
        cells: [
          this.createCell(card.front, 0),
          this.createCell(card.back, 1),
          ...(columns.length > 2
            ? [this.createCell(card.tags.join(", "), 2)]
            : []),
        ],
        rowType: "data" as RowType,
        issues: [],
      }));

    return {
      success: true,
      sourceType: "typst",
      sheets: [
        {
          id: "sheet_0" as SheetId,
          sourceId: "" as DataSourceId,
          name: filename.replace(/\.[^.]+$/, ""),
          index: 0,
          rowCount: cards.length,
          columnCount: columns.length,
          headerRow: null,
          dataStartRow: 0,
          dataEndRow: Math.min(cards.length, options.maxPreviewRows) - 1,
          columns,
          sampleRows: rows,
          issues: [],
        },
      ],
      encoding: "utf-8",
      errors: [],
      warnings: [],
      metadata: { format: "flashcards", cardCount: cards.length },
    };
  }

  private buildSectionsResult(
    sections: Array<{ title: string; content: string; level: number }>,
    filename: string,
    options: ParseOptions,
    warnings: string[],
  ): ParseResult {
    const columns: DetectedColumn[] = [
      this.buildColumn(
        0,
        "title",
        sections.map((s) => s.title),
      ),
      this.buildColumn(
        1,
        "content",
        sections.map((s) => s.content),
      ),
      this.buildColumn(
        2,
        "level",
        sections.map((s) => s.level),
      ),
    ];

    const rows: DataRow[] = sections
      .slice(0, options.maxPreviewRows)
      .map((section, index) => ({
        rowIndex: index,
        cells: [
          this.createCell(section.title, 0),
          this.createCell(section.content, 1),
          this.createCell(section.level, 2),
        ],
        rowType: "data" as RowType,
        issues: [],
      }));

    warnings.push("Imported as sections. Consider using flashcard format.");

    return {
      success: true,
      sourceType: "typst",
      sheets: [
        {
          id: "sheet_0" as SheetId,
          sourceId: "" as DataSourceId,
          name: filename.replace(/\.[^.]+$/, ""),
          index: 0,
          rowCount: sections.length,
          columnCount: 3,
          headerRow: null,
          dataStartRow: 0,
          dataEndRow: Math.min(sections.length, options.maxPreviewRows) - 1,
          columns,
          sampleRows: rows,
          issues: [],
        },
      ],
      encoding: "utf-8",
      errors: [],
      warnings,
      metadata: { format: "sections", sectionCount: sections.length },
    };
  }

  private buildRawResult(
    text: string,
    filename: string,
    options: ParseOptions,
    warnings: string[],
  ): ParseResult {
    const lines = text.split("\n").filter((l) => l.trim().length > 0);

    const columns: DetectedColumn[] = [
      this.buildColumn(0, "line", lines.slice(0, 50)),
      this.buildColumn(
        1,
        "index",
        lines.slice(0, 50).map((_, i) => i + 1),
      ),
    ];

    const rows: DataRow[] = lines
      .slice(0, options.maxPreviewRows)
      .map((line, index) => ({
        rowIndex: index,
        cells: [this.createCell(line, 0), this.createCell(index + 1, 1)],
        rowType: "data" as RowType,
        issues: [],
      }));

    warnings.push("No structured content detected, imported as raw lines");

    return {
      success: true,
      sourceType: "typst",
      sheets: [
        {
          id: "sheet_0" as SheetId,
          sourceId: "" as DataSourceId,
          name: filename.replace(/\.[^.]+$/, ""),
          index: 0,
          rowCount: lines.length,
          columnCount: 2,
          headerRow: null,
          dataStartRow: 0,
          dataEndRow: Math.min(lines.length, options.maxPreviewRows) - 1,
          columns,
          sampleRows: rows,
          issues: [],
        },
      ],
      encoding: "utf-8",
      errors: [],
      warnings,
      metadata: { format: "raw", lineCount: lines.length },
    };
  }

  private buildColumn(
    index: number,
    name: string,
    values: unknown[],
  ): DetectedColumn {
    return {
      index,
      letter: String.fromCharCode(65 + index),
      headerValue: name,
      normalizedName: name,
      inferredType: name === "level" || name === "index" ? "integer" : "string",
      typeConfidence: 0.8,
      nullCount: values.filter((v) => v === null || v === undefined || v === "")
        .length,
      uniqueCount: new Set(values).size,
      sampleValues: values
        .slice(0, 20)
        .map((v, _) => this.createCell(v, index)),
      semanticType:
        name === "front" ? "front" : name === "back" ? "back" : null,
      semanticConfidence: name === "front" || name === "back" ? 0.9 : 0,
      issues: [],
    };
  }

  private createCell(value: unknown, columnIndex: number): CellValue {
    const isNull = value === null || value === undefined || value === "";
    return {
      columnIndex,
      rawValue: value,
      displayValue: isNull ? "" : String(value),
      formattedValue: null,
      formula: null,
      dataType: typeof value === "number" ? "integer" : "string",
      style: null,
      isNull,
      isMerged: false,
      mergeSpan: null,
    };
  }
}

// =============================================================================
// PLAIN TEXT PARSER
// =============================================================================

/**
 * Enhanced parser for plain text files with structure detection
 */
export class PlainTextParser implements DataParser {
  readonly supportedExtensions = ["txt", "text"];
  readonly supportedMimeTypes = ["text/plain"];

  // Lower priority than CSV parser for txt files
  readonly priority = -1;

  canParse(filename: string, mimeType?: string): boolean {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    // Only handle .txt if it doesn't look like CSV/TSV
    return (
      (ext === "txt" || ext === "text") &&
      (mimeType === undefined || this.supportedMimeTypes.includes(mimeType))
    );
  }

  async parse(
    content: ArrayBuffer | string,
    filename: string,
    options: Partial<ParseOptions> = {},
  ): Promise<ParseResult> {
    const opts = { ...DEFAULT_PARSE_OPTIONS, ...options };
    const warnings: string[] = [];

    let text: string;
    if (content instanceof ArrayBuffer) {
      text = new TextDecoder("utf-8").decode(content);
    } else {
      text = content;
    }

    // Try to detect structure
    const structure = this.detectStructure(text);

    switch (structure.type) {
      case "flashcard":
        return this.parseAsFlashcards(
          text,
          structure.pattern || "default",
          filename,
          opts,
        );
      case "list":
        return this.parseAsList(text, filename, opts, warnings);
      case "paragraphs":
        return this.parseAsParagraphs(text, filename, opts, warnings);
      default:
        return this.parseAsLines(text, filename, opts, warnings);
    }
  }

  private detectStructure(text: string): {
    type: "flashcard" | "list" | "paragraphs" | "lines";
    pattern?: string;
  } {
    // Check for flashcard patterns
    if (/^Q:\s*.+\nA:\s*.+/m.test(text)) {
      return { type: "flashcard", pattern: "qa" };
    }
    if (/^.+\s*::\s*.+$/m.test(text)) {
      return { type: "flashcard", pattern: "double-colon" };
    }
    if (/^.+\t.+$/m.test(text)) {
      // Tab-separated might be flashcards
      const lines = text.split("\n").filter((l) => l.includes("\t"));
      if (lines.length > 2) {
        return { type: "flashcard", pattern: "tab" };
      }
    }

    // Check for list (bullet points or numbered)
    const listLines = text
      .split("\n")
      .filter((l) => /^[\s]*[-*•]\s|^[\s]*\d+[.)]\s/.test(l));
    if (listLines.length > text.split("\n").length * 0.5) {
      return { type: "list" };
    }

    // Check for paragraphs (double newlines)
    if (text.includes("\n\n")) {
      const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
      if (paragraphs.length > 1) {
        return { type: "paragraphs" };
      }
    }

    return { type: "lines" };
  }

  private parseAsFlashcards(
    text: string,
    pattern: string,
    filename: string,
    options: ParseOptions,
  ): ParseResult {
    const cards: Array<{ front: string; back: string }> = [];

    if (pattern === "qa") {
      const qaPattern = /Q:\s*(.+?)\s*\n\s*A:\s*(.+?)(?=\nQ:|$)/gs;
      let match;
      while ((match = qaPattern.exec(text)) !== null) {
        cards.push({ front: match[1].trim(), back: match[2].trim() });
      }
    } else if (pattern === "double-colon") {
      const lines = text.split("\n");
      for (const line of lines) {
        const parts = line.split("::");
        if (parts.length === 2) {
          cards.push({ front: parts[0].trim(), back: parts[1].trim() });
        }
      }
    } else if (pattern === "tab") {
      const lines = text.split("\n");
      for (const line of lines) {
        const parts = line.split("\t");
        if (parts.length >= 2) {
          cards.push({ front: parts[0].trim(), back: parts[1].trim() });
        }
      }
    }

    const columns: DetectedColumn[] = [
      this.buildColumn(
        0,
        "front",
        cards.map((c) => c.front),
      ),
      this.buildColumn(
        1,
        "back",
        cards.map((c) => c.back),
      ),
    ];

    const rows: DataRow[] = cards
      .slice(0, options.maxPreviewRows)
      .map((card, index) => ({
        rowIndex: index,
        cells: [this.createCell(card.front, 0), this.createCell(card.back, 1)],
        rowType: "data" as RowType,
        issues: [],
      }));

    return {
      success: true,
      sourceType: "txt",
      sheets: [
        {
          id: "sheet_0" as SheetId,
          sourceId: "" as DataSourceId,
          name: filename.replace(/\.[^.]+$/, ""),
          index: 0,
          rowCount: cards.length,
          columnCount: 2,
          headerRow: null,
          dataStartRow: 0,
          dataEndRow: Math.min(cards.length, options.maxPreviewRows) - 1,
          columns,
          sampleRows: rows,
          issues: [],
        },
      ],
      encoding: "utf-8",
      errors: [],
      warnings: [],
      metadata: { format: "flashcards", pattern, cardCount: cards.length },
    };
  }

  private parseAsList(
    text: string,
    filename: string,
    options: ParseOptions,
    warnings: string[],
  ): ParseResult {
    const items: string[] = [];
    const lines = text.split("\n");

    for (const line of lines) {
      const match = line.match(/^[\s]*[-*•]\s*(.+)|^[\s]*\d+[.)]\s*(.+)/);
      if (match) {
        items.push((match[1] || match[2]).trim());
      }
    }

    const columns: DetectedColumn[] = [
      this.buildColumn(0, "item", items.slice(0, 50)),
      this.buildColumn(
        1,
        "index",
        items.slice(0, 50).map((_, i) => i + 1),
      ),
    ];

    const rows: DataRow[] = items
      .slice(0, options.maxPreviewRows)
      .map((item, index) => ({
        rowIndex: index,
        cells: [this.createCell(item, 0), this.createCell(index + 1, 1)],
        rowType: "data" as RowType,
        issues: [],
      }));

    warnings.push("Imported as list items");

    return {
      success: true,
      sourceType: "txt",
      sheets: [
        {
          id: "sheet_0" as SheetId,
          sourceId: "" as DataSourceId,
          name: filename.replace(/\.[^.]+$/, ""),
          index: 0,
          rowCount: items.length,
          columnCount: 2,
          headerRow: null,
          dataStartRow: 0,
          dataEndRow: Math.min(items.length, options.maxPreviewRows) - 1,
          columns,
          sampleRows: rows,
          issues: [],
        },
      ],
      encoding: "utf-8",
      errors: [],
      warnings,
      metadata: { format: "list", itemCount: items.length },
    };
  }

  private parseAsParagraphs(
    text: string,
    filename: string,
    options: ParseOptions,
    warnings: string[],
  ): ParseResult {
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const columns: DetectedColumn[] = [
      this.buildColumn(0, "content", paragraphs.slice(0, 50)),
      this.buildColumn(
        1,
        "index",
        paragraphs.slice(0, 50).map((_, i) => i + 1),
      ),
    ];

    const rows: DataRow[] = paragraphs
      .slice(0, options.maxPreviewRows)
      .map((para, index) => ({
        rowIndex: index,
        cells: [this.createCell(para, 0), this.createCell(index + 1, 1)],
        rowType: "data" as RowType,
        issues: [],
      }));

    warnings.push("Imported as paragraphs");

    return {
      success: true,
      sourceType: "txt",
      sheets: [
        {
          id: "sheet_0" as SheetId,
          sourceId: "" as DataSourceId,
          name: filename.replace(/\.[^.]+$/, ""),
          index: 0,
          rowCount: paragraphs.length,
          columnCount: 2,
          headerRow: null,
          dataStartRow: 0,
          dataEndRow: Math.min(paragraphs.length, options.maxPreviewRows) - 1,
          columns,
          sampleRows: rows,
          issues: [],
        },
      ],
      encoding: "utf-8",
      errors: [],
      warnings,
      metadata: { format: "paragraphs", paragraphCount: paragraphs.length },
    };
  }

  private parseAsLines(
    text: string,
    filename: string,
    options: ParseOptions,
    warnings: string[],
  ): ParseResult {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const columns: DetectedColumn[] = [
      this.buildColumn(0, "line", lines.slice(0, 50)),
      this.buildColumn(
        1,
        "index",
        lines.slice(0, 50).map((_, i) => i + 1),
      ),
    ];

    const rows: DataRow[] = lines
      .slice(0, options.maxPreviewRows)
      .map((line, index) => ({
        rowIndex: index,
        cells: [this.createCell(line, 0), this.createCell(index + 1, 1)],
        rowType: "data" as RowType,
        issues: [],
      }));

    warnings.push("Imported as individual lines");

    return {
      success: true,
      sourceType: "txt",
      sheets: [
        {
          id: "sheet_0" as SheetId,
          sourceId: "" as DataSourceId,
          name: filename.replace(/\.[^.]+$/, ""),
          index: 0,
          rowCount: lines.length,
          columnCount: 2,
          headerRow: null,
          dataStartRow: 0,
          dataEndRow: Math.min(lines.length, options.maxPreviewRows) - 1,
          columns,
          sampleRows: rows,
          issues: [],
        },
      ],
      encoding: "utf-8",
      errors: [],
      warnings,
      metadata: { format: "lines", lineCount: lines.length },
    };
  }

  private buildColumn(
    index: number,
    name: string,
    values: unknown[],
  ): DetectedColumn {
    return {
      index,
      letter: String.fromCharCode(65 + index),
      headerValue: name,
      normalizedName: name,
      inferredType: name === "index" ? "integer" : "string",
      typeConfidence: 0.8,
      nullCount: values.filter((v) => v === null || v === undefined || v === "")
        .length,
      uniqueCount: new Set(values).size,
      sampleValues: values
        .slice(0, 20)
        .map((v, _) => this.createCell(v, index)),
      semanticType:
        name === "front"
          ? "front"
          : name === "back"
            ? "back"
            : name === "content"
              ? "front"
              : null,
      semanticConfidence:
        name === "front" || name === "back" || name === "content" ? 0.7 : 0,
      issues: [],
    };
  }

  private createCell(value: unknown, columnIndex: number): CellValue {
    const isNull = value === null || value === undefined || value === "";
    return {
      columnIndex,
      rawValue: value,
      displayValue: isNull ? "" : String(value),
      formattedValue: null,
      formula: null,
      dataType: typeof value === "number" ? "integer" : "string",
      style: null,
      isNull,
      isMerged: false,
      mergeSpan: null,
    };
  }
}

// =============================================================================
// PARSER REGISTRY
// =============================================================================

/**
 * Registry of all available parsers
 */
export class ParserRegistry {
  private readonly parsers: DataParser[] = [];

  constructor() {
    // Register default parsers
    this.register(new CSVParser());
    this.register(new JSONParser());
    this.register(new YAMLParser());
    this.register(new MarkdownFlashcardParser());
    this.register(new TypstParser());
    this.register(new ExcelParser());
    this.register(new PDFParser());
    this.register(new PlainTextParser());
  }

  /**
   * Register a new parser
   */
  register(parser: DataParser): void {
    this.parsers.push(parser);
  }

  /**
   * Find a parser for the given file
   */
  findParser(filename: string, mimeType?: string): DataParser | null {
    for (const parser of this.parsers) {
      if (parser.canParse(filename, mimeType)) {
        return parser;
      }
    }
    return null;
  }

  /**
   * Parse a file using the appropriate parser
   */
  async parse(
    content: ArrayBuffer | string,
    filename: string,
    mimeType?: string,
    options?: Partial<ParseOptions>,
  ): Promise<ParseResult> {
    const parser = this.findParser(filename, mimeType);

    if (!parser) {
      return {
        success: false,
        sourceType: "custom",
        sheets: [],
        encoding: "unknown",
        errors: [
          {
            code: "UNSUPPORTED_FORMAT",
            message: `No parser available for file: ${filename}`,
          },
        ],
        warnings: [],
        metadata: {},
      };
    }

    return parser.parse(content, filename, options);
  }

  /**
   * Get all supported file extensions
   */
  getSupportedExtensions(): string[] {
    return this.parsers.flatMap((p) => p.supportedExtensions);
  }

  /**
   * Get all supported MIME types
   */
  getSupportedMimeTypes(): string[] {
    return this.parsers.flatMap((p) => p.supportedMimeTypes);
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/** Global parser registry */
export const parserRegistry = new ParserRegistry();
