// =============================================================================
// IMPORT SERVICE - API & FILE HANDLING FOR DATA IMPORT
// =============================================================================

import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { apiClient } from "./api";
import { useImportStore, type ImportResult } from "@/stores/import.store";
import { DataImport } from "@manthanein/shared";

// Re-export types that are used in return values
export type ParseResult = DataImport.ParseResult;
export type DetectedSchema = DataImport.DetectedSchema;

// =============================================================================
// FILE PICKER
// =============================================================================

export interface PickedFile {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
}

/**
 * Open document picker and select a file for import
 */
export async function pickFile(): Promise<PickedFile | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "text/csv",
        "text/tab-separated-values",
        "application/json",
        "text/yaml",
        "application/x-yaml",
        "text/markdown",
        "text/plain",
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "*/*", // Fallback for other types
      ],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];
    return {
      uri: asset.uri,
      name: asset.name,
      size: asset.size || 0,
      mimeType: asset.mimeType || "application/octet-stream",
    };
  } catch (error) {
    console.error("Error picking file:", error);
    throw new Error("Failed to pick file");
  }
}

/**
 * Read file content as string
 */
export async function readFileAsString(uri: string): Promise<string> {
  try {
    const content = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return content;
  } catch (error) {
    console.error("Error reading file:", error);
    throw new Error("Failed to read file");
  }
}

/**
 * Read file content as base64 (for binary files)
 */
export async function readFileAsBase64(uri: string): Promise<string> {
  try {
    const content = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return content;
  } catch (error) {
    console.error("Error reading file:", error);
    throw new Error("Failed to read file");
  }
}

/**
 * Check if file extension is supported
 */
export function isFileSupported(filename: string): boolean {
  return DataImport.isFileTypeSupported(filename);
}

/**
 * Get supported file extensions
 */
export function getSupportedExtensions(): string[] {
  return DataImport.getSupportedExtensions();
}

// =============================================================================
// LOCAL PARSING (Client-side)
// =============================================================================

/**
 * Parse file content locally using the shared DataImport module
 */
export async function parseFileLocally(
  content: string | ArrayBuffer,
  filename: string,
  mimeType?: string,
): Promise<DataImport.ParseResult> {
  try {
    return await DataImport.parseFile(content, filename, mimeType);
  } catch (error) {
    console.error("Error parsing file:", error);
    throw new Error("Failed to parse file");
  }
}

/**
 * Infer schema from a data sheet
 */
export function inferSchema(
  sheet: DataImport.DataSheet,
): DataImport.DetectedSchema {
  const engine = new DataImport.SchemaInferenceEngine();
  return engine.analyzeSheet(sheet);
}

/**
 * Convert DetectedSchema to LocalDetectedSchema (removes branded types)
 */
import type { LocalDetectedSchema } from "@/stores/import.store";

export function toLocalSchema(
  schema: DataImport.DetectedSchema,
): LocalDetectedSchema {
  return {
    id: String(schema.id),
    sourceId: String(schema.sourceId),
    sheetId: String(schema.sheetId),
    fields: schema.fields.map((f) => ({
      name: f.name,
      sourceColumnIndex: f.sourceColumnIndex,
      dataType: String(f.dataType),
      semanticType: f.semanticType,
      isRequired: f.isRequired,
      isUnique: f.isUnique,
      defaultValue: f.defaultValue,
      validValues: f.validValues ? [...f.validValues] : null,
      validation: f.validation,
    })),
    primaryKeyFields: [...schema.primaryKeyFields],
    suggestedCardType: String(schema.suggestedCardType),
    overallConfidence: schema.overallConfidence,
    isValid: schema.isValid,
    validationIssues: [...schema.validationIssues],
  };
}

// =============================================================================
// API CALLS
// =============================================================================

interface UploadResponse {
  sessionId: string;
  sheets: Array<{
    id: string;
    name: string;
    rowCount: number;
    columnCount: number;
    columns: Array<{
      index: number;
      name: string;
      inferredType: string;
      sampleValues: string[];
    }>;
  }>;
}

interface SchemaResponse {
  schema: DataImport.DetectedSchema;
  suggestedMappings: Array<{
    sourceColumn: string;
    targetField: string;
    confidence: number;
  }>;
}

interface PreviewResponse {
  cards: Array<{
    id: string;
    front: string;
    back: string;
    tags: string[];
    hasIssues: boolean;
    issues: string[];
  }>;
  totalCards: number;
  validCards: number;
  issueCount: number;
}

interface ImportResponse {
  success: boolean;
  cardsCreated: number;
  cardsUpdated: number;
  cardsSkipped: number;
  cardsFailed: number;
  duplicatesSkipped: number;
  errors: string[];
  warnings: string[];
  deckId: string;
}

/**
 * Upload file to server for processing
 */
export async function uploadFileToServer(
  file: PickedFile,
  onProgress?: (progress: number) => void,
): Promise<UploadResponse> {
  try {
    const response = await apiClient.uploadFile(
      "/import/upload",
      {
        uri: file.uri,
        name: file.name,
        type: file.mimeType,
      },
      onProgress,
    );
    return response.data as UploadResponse;
  } catch (error: any) {
    throw new Error(error.response?.data?.message || "Failed to upload file");
  }
}

/**
 * Get schema analysis for a sheet
 */
export async function analyzeSchema(
  sessionId: string,
  sheetId: string,
): Promise<SchemaResponse> {
  try {
    const response = await apiClient.post<SchemaResponse>(
      `/import/${sessionId}/analyze`,
      { sheetId },
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error.response?.data?.message || "Failed to analyze schema",
    );
  }
}

/**
 * Generate preview cards
 */
export async function generatePreview(
  sessionId: string,
  sheetId: string,
  mappings: Array<{
    sourceColumn: string;
    targetField: string;
    transformation?: string;
  }>,
): Promise<PreviewResponse> {
  try {
    const response = await apiClient.post<PreviewResponse>(
      `/import/${sessionId}/preview`,
      { sheetId, mappings },
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error.response?.data?.message || "Failed to generate preview",
    );
  }
}

/**
 * Execute the import
 */
export async function executeImport(
  sessionId: string,
  config: {
    sheetId: string;
    mappings: Array<{
      sourceColumn: string;
      targetField: string;
      transformation?: string;
    }>;
    targetDeckId?: string;
    newDeckName?: string;
    duplicateStrategy: "skip" | "update" | "create_anyway";
  },
): Promise<ImportResponse> {
  try {
    const response = await apiClient.post<ImportResponse>(
      `/import/${sessionId}/execute`,
      config,
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      error.response?.data?.message || "Failed to execute import",
    );
  }
}

// =============================================================================
// REACT QUERY HOOKS
// =============================================================================

/**
 * Hook for file upload
 */
export function useUploadFile() {
  const store = useImportStore();

  return useMutation({
    mutationFn: async (file: PickedFile) => {
      store.setIsUploading(true);
      store.setUploadProgress(0);

      try {
        const result = await uploadFileToServer(file, (progress) => {
          store.setUploadProgress(progress);
        });
        return result;
      } finally {
        store.setIsUploading(false);
      }
    },
    onSuccess: (data) => {
      store.setParsedSheets(
        data.sheets.map((sheet) => ({
          id: sheet.id,
          name: sheet.name,
          rowCount: sheet.rowCount,
          columnCount: sheet.columnCount,
          columns: sheet.columns,
          sampleRows: [],
        })),
      );
      if (data.sheets.length > 0) {
        store.setSelectedSheet(data.sheets[0].id);
      }
      store.nextStep();
    },
    onError: (error: Error) => {
      store.setParseError(error.message);
    },
  });
}

/**
 * Hook for local file parsing
 */
export function useParseFileLocally(): ReturnType<
  typeof useMutation<ParseResult, Error, PickedFile>
> {
  const store = useImportStore();

  return useMutation<ParseResult, Error, PickedFile>({
    mutationFn: async (file: PickedFile): Promise<ParseResult> => {
      store.setIsParsing(true);
      store.setParseError(null);

      try {
        // Determine if file is binary
        const isBinary = /\.(xlsx?|xlsm|xlsb|pdf)$/i.test(file.name);

        let content: string | ArrayBuffer;
        if (isBinary) {
          const base64 = await readFileAsBase64(file.uri);
          // Convert base64 to ArrayBuffer
          const binaryString = atob(base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          content = bytes.buffer;
        } else {
          content = await readFileAsString(file.uri);
        }

        const result = await parseFileLocally(
          content,
          file.name,
          file.mimeType,
        );

        if (!result.success) {
          throw new Error(result.errors[0]?.message || "Failed to parse file");
        }

        return result;
      } finally {
        store.setIsParsing(false);
      }
    },
    onSuccess: (data) => {
      const sheets = data.sheets.map((sheet) => ({
        id: sheet.id,
        name: sheet.name,
        rowCount: sheet.rowCount,
        columnCount: sheet.columnCount,
        columns: sheet.columns.map((col) => ({
          index: col.index,
          name: col.headerValue || col.normalizedName,
          inferredType: col.inferredType,
          sampleValues: col.sampleValues.map((v) => v.displayValue),
        })),
        sampleRows: sheet.sampleRows.map((row) =>
          Object.fromEntries(
            row.cells.map((cell, i) => [
              sheet.columns[i]?.normalizedName || `col_${i}`,
              cell.displayValue,
            ]),
          ),
        ),
      }));

      store.setParsedSheets(sheets);
      if (sheets.length > 0) {
        store.setSelectedSheet(sheets[0].id);
      }
      store.nextStep();
    },
    onError: (error: Error) => {
      store.setParseError(error.message);
    },
  });
}

/**
 * Hook for schema analysis
 */
export function useAnalyzeSchema() {
  const store = useImportStore();

  return useMutation({
    mutationFn: async ({
      sessionId,
      sheetId,
    }: {
      sessionId?: string;
      sheetId: string;
    }) => {
      store.setIsInferringSchema(true);

      // If we have sessionId, use server-side analysis
      if (sessionId) {
        return analyzeSchema(sessionId, sheetId);
      }

      // Otherwise, do local inference
      const sheet = store.parsedSheets.find((s) => s.id === sheetId);
      if (!sheet) {
        throw new Error("Sheet not found");
      }

      // Create a minimal DataSheet for inference
      const dataSheet: DataImport.DataSheet = {
        id: sheetId as DataImport.SheetId,
        sourceId: "local" as DataImport.DataSourceId,
        name: sheet.name,
        index: 0,
        rowCount: sheet.rowCount,
        columnCount: sheet.columnCount,
        headerRow: 0,
        dataStartRow: 1,
        dataEndRow: sheet.rowCount - 1,
        columns: sheet.columns.map((col) => ({
          index: col.index,
          letter: String.fromCharCode(65 + col.index),
          headerValue: col.name,
          normalizedName: col.name.toLowerCase().replace(/\s+/g, "_"),
          inferredType: col.inferredType as DataImport.InferredDataType,
          typeConfidence: 0.8,
          nullCount: 0,
          uniqueCount: new Set(col.sampleValues).size,
          sampleValues: col.sampleValues.map((v, i) => ({
            columnIndex: col.index,
            rawValue: v,
            displayValue: v,
            formattedValue: null,
            formula: null,
            dataType: col.inferredType as DataImport.InferredDataType,
            style: null,
            isNull: v === "" || v === null,
            isMerged: false,
            mergeSpan: null,
          })),
          semanticType: null,
          semanticConfidence: 0,
          issues: [],
        })),
        sampleRows: [],
        issues: [],
      };

      const schema = inferSchema(dataSheet);

      // Generate suggested mappings based on semantic types
      const suggestedMappings: Array<{
        sourceColumn: string;
        targetField: string;
        confidence: number;
      }> = [];

      for (const field of schema.fields) {
        const column = sheet.columns[field.sourceColumnIndex];
        if (!column) continue;

        let targetField: string | null = null;
        let confidence = 0.5;

        // Map semantic types to target fields
        if (
          field.semanticType === "question" ||
          field.semanticType === "front"
        ) {
          targetField = "front";
          confidence = 0.9;
        } else if (
          field.semanticType === "answer" ||
          field.semanticType === "back"
        ) {
          targetField = "back";
          confidence = 0.9;
        } else if (
          field.semanticType === "tags" ||
          field.semanticType === "category"
        ) {
          targetField = "tags";
          confidence = 0.8;
        } else if (
          field.semanticType === "notes" ||
          field.semanticType === "explanation"
        ) {
          targetField = "extra";
          confidence = 0.7;
        } else {
          // Fallback: use column name heuristics
          const name = column.name.toLowerCase();
          if (
            name.includes("front") ||
            name.includes("question") ||
            name.includes("term")
          ) {
            targetField = "front";
            confidence = 0.7;
          } else if (
            name.includes("back") ||
            name.includes("answer") ||
            name.includes("definition")
          ) {
            targetField = "back";
            confidence = 0.7;
          } else if (name.includes("tag")) {
            targetField = "tags";
            confidence = 0.6;
          }
        }

        if (targetField) {
          suggestedMappings.push({
            sourceColumn: column.name,
            targetField,
            confidence,
          });
        }
      }

      return { schema, suggestedMappings };
    },
    onSuccess: (data) => {
      store.setDetectedSchema(toLocalSchema(data.schema));
      store.setSuggestedMappings(
        data.suggestedMappings.map((m) => ({
          sourceColumn: m.sourceColumn,
          targetField: m.targetField,
        })),
      );

      // Auto-apply high-confidence suggestions
      const autoMappings = data.suggestedMappings
        .filter((m) => m.confidence > 0.7)
        .map((m) => ({
          sourceColumn: m.sourceColumn,
          targetField: m.targetField,
        }));
      store.setMappings(autoMappings);

      store.setIsInferringSchema(false);
      store.nextStep();
    },
    onError: (error: Error) => {
      store.setIsInferringSchema(false);
      store.setParseError(error.message);
    },
  });
}

/**
 * Hook for generating preview
 */
export function useGeneratePreview() {
  const store = useImportStore();

  return useMutation({
    mutationFn: async ({
      sessionId,
      sheetId,
      mappings,
    }: {
      sessionId?: string;
      sheetId: string;
      mappings: Array<{
        sourceColumn: string;
        targetField: string;
        transformation?: string;
      }>;
    }) => {
      store.setIsGeneratingPreview(true);
      store.setPreviewError(null);

      // If we have sessionId, use server-side preview
      if (sessionId) {
        return generatePreview(sessionId, sheetId, mappings);
      }

      // Otherwise, generate preview locally
      const sheet = store.parsedSheets.find((s) => s.id === sheetId);
      if (!sheet) {
        throw new Error("Sheet not found");
      }

      // Generate preview cards from sample rows
      const cards = sheet.sampleRows.slice(0, 10).map((row, index) => {
        const frontMapping = mappings.find((m) => m.targetField === "front");
        const backMapping = mappings.find((m) => m.targetField === "back");
        const tagsMappings = mappings.filter((m) => m.targetField === "tags");

        const front = frontMapping
          ? String(row[frontMapping.sourceColumn] || "")
          : "";
        const back = backMapping
          ? String(row[backMapping.sourceColumn] || "")
          : "";
        const tags = tagsMappings
          .map((m) => String(row[m.sourceColumn] || ""))
          .filter((t) => t.length > 0);

        const issues: string[] = [];
        if (!front) issues.push("Missing front content");
        if (!back) issues.push("Missing back content");

        return {
          id: `preview_${index}`,
          front,
          back,
          tags,
          hasIssues: issues.length > 0,
          issues,
        };
      });

      return {
        cards,
        totalCards: sheet.rowCount,
        validCards: cards.filter((c) => !c.hasIssues).length,
        issueCount: cards.filter((c) => c.hasIssues).length,
      };
    },
    onSuccess: (data) => {
      store.setPreviewCards(data.cards);
      store.setIsGeneratingPreview(false);
      store.nextStep();
    },
    onError: (error: Error) => {
      store.setIsGeneratingPreview(false);
      store.setPreviewError(error.message);
    },
  });
}

/**
 * Hook for executing import
 */
export function useExecuteImport() {
  const store = useImportStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      config,
    }: {
      sessionId?: string;
      config: {
        sheetId: string;
        mappings: Array<{
          sourceColumn: string;
          targetField: string;
          transformation?: string;
        }>;
        targetDeckId?: string;
        newDeckName?: string;
        duplicateStrategy: "skip" | "update" | "create_anyway";
      };
    }) => {
      store.setIsImporting(true);
      store.setImportProgress({
        phase: "preparing",
        current: 0,
        total: 100,
        message: "Preparing import...",
      });

      if (sessionId) {
        return executeImport(sessionId, config);
      }

      // Simulate local import (in reality, this would call the API)
      // For now, return mock success
      await new Promise((resolve) => setTimeout(resolve, 2000));

      store.setImportProgress({
        phase: "importing",
        current: 50,
        total: 100,
        message: "Creating cards...",
      });

      await new Promise((resolve) => setTimeout(resolve, 1500));

      const sheet = store.parsedSheets.find((s) => s.id === config.sheetId);

      return {
        success: true,
        cardsCreated: sheet?.rowCount || 0,
        cardsUpdated: 0,
        cardsSkipped: 0,
        cardsFailed: 0,
        duplicatesSkipped: 0,
        errors: [],
        warnings: [],
        deckId: config.targetDeckId || "new-deck-id",
      };
    },
    onSuccess: (data) => {
      store.setImportResult({
        success: data.success,
        cardsCreated: data.cardsCreated,
        cardsUpdated: data.cardsUpdated || 0,
        cardsSkipped: data.cardsSkipped,
        cardsFailed: data.cardsFailed,
        duplicatesSkipped: data.duplicatesSkipped || 0,
        errors: data.errors,
        warnings: data.warnings,
      });

      // Add to history
      const { selectedFile } = store;
      if (selectedFile) {
        store.addToHistory({
          id: Date.now().toString(),
          filename: selectedFile.name,
          cardCount: data.cardsCreated,
          timestamp: new Date().toISOString(),
          deckId: data.deckId,
        });
      }

      store.setIsImporting(false);
      store.setImportProgress(null);
      store.nextStep();

      // Invalidate deck queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["decks"] });
      queryClient.invalidateQueries({ queryKey: ["cards"] });
    },
    onError: (error: Error) => {
      store.setIsImporting(false);
      store.setImportProgress(null);
      store.setImportResult({
        success: false,
        cardsCreated: 0,
        cardsUpdated: 0,
        cardsSkipped: 0,
        cardsFailed: 0,
        duplicatesSkipped: 0,
        errors: [error.message],
        warnings: [],
      });
    },
  });
}
