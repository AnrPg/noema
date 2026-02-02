// =============================================================================
// IMPORT SESSION MANAGER
// =============================================================================
// Orchestrates the entire import workflow from file upload to card creation.
// Manages state, progress tracking, and user interactions.

import type {
  ImportSession,
  ImportSessionId,
  ImportSessionStatus,
  ImportMode,
  ImportTargetConfig,
  DataSource,
  DataSourceId,
  DataSheet,
  SheetId,
  DetectedSchema,
  FieldMapping,
  MappingId,
  PreviewCard,
  PreviewCardId,
  ImportProgress,
  ImportIssue,
  ImportAuditEntry,
  ImportAuditAction,
  ImportResult,
  ImportStatistics,
  SuggestedMapping,
  CardTargetField,
  FieldTransformation,
  PreviewCardStatus,
  CardQualityIssue,
} from "./types";
import type { CardType, CardContent } from "../types/card.types";
import type { DeckId, UserId, CardId } from "../types/user.types";
import {
  SchemaInferenceEngine,
  type SchemaInferenceConfig,
} from "./schema-inference";
import { ParserRegistry, type ParseOptions } from "./parsers";

// =============================================================================
// IMPORT SESSION MANAGER
// =============================================================================

/**
 * Events emitted by the import session manager
 */
export type ImportSessionEvent =
  | {
      type: "status_changed";
      status: ImportSessionStatus;
      previousStatus: ImportSessionStatus;
    }
  | { type: "progress_updated"; progress: ImportProgress }
  | { type: "source_added"; source: DataSource }
  | { type: "schema_detected"; schema: DetectedSchema }
  | { type: "mapping_suggested"; mappings: readonly SuggestedMapping[] }
  | { type: "preview_ready"; cards: readonly PreviewCard[] }
  | { type: "issue_added"; issue: ImportIssue }
  | { type: "import_completed"; result: ImportResult }
  | { type: "import_failed"; error: string };

/**
 * Listener for import events
 */
export type ImportEventListener = (event: ImportSessionEvent) => void;

/**
 * Storage interface for persisting import sessions
 */
export interface ImportSessionStorage {
  save(session: ImportSession): Promise<void>;
  load(id: ImportSessionId): Promise<ImportSession | null>;
  delete(id: ImportSessionId): Promise<void>;
  listByUser(userId: UserId): Promise<ImportSessionId[]>;
}

/**
 * Card storage interface for creating cards
 */
export interface CardStorage {
  createDeck(
    userId: UserId,
    name: string,
    description?: string,
    parentId?: DeckId,
  ): Promise<DeckId>;
  createCards(
    deckId: DeckId,
    cards: Array<{ type: CardType; content: CardContent; tags: string[] }>,
  ): Promise<CardId[]>;
  findDuplicates(
    deckId: DeckId,
    content: Partial<CardContent>,
    matchFields: string[],
  ): Promise<CardId[]>;
  updateCard(cardId: CardId, content: Partial<CardContent>): Promise<void>;
}

/**
 * Configuration for the import session manager
 */
export interface ImportManagerConfig {
  /** Maximum file size in bytes */
  maxFileSize: number;
  /** Maximum files per import */
  maxFiles: number;
  /** Maximum preview cards to generate */
  maxPreviewCards: number;
  /** Schema inference configuration */
  schemaConfig: Partial<SchemaInferenceConfig>;
  /** Parse options */
  parseOptions: Partial<ParseOptions>;
}

const DEFAULT_MANAGER_CONFIG: ImportManagerConfig = {
  maxFileSize: 50 * 1024 * 1024, // 50MB
  maxFiles: 10,
  maxPreviewCards: 100,
  schemaConfig: {},
  parseOptions: {},
};

/**
 * Import Session Manager
 *
 * Orchestrates the complete import workflow with proper state management.
 */
export class ImportSessionManager {
  private readonly config: ImportManagerConfig;
  private readonly storage: ImportSessionStorage;
  private readonly cardStorage: CardStorage;
  private readonly parserRegistry: ParserRegistry;
  private readonly schemaEngine: SchemaInferenceEngine;
  private readonly listeners: Set<ImportEventListener> = new Set();

  private session: ImportSession | null = null;

  constructor(
    storage: ImportSessionStorage,
    cardStorage: CardStorage,
    config: Partial<ImportManagerConfig> = {},
  ) {
    this.config = { ...DEFAULT_MANAGER_CONFIG, ...config };
    this.storage = storage;
    this.cardStorage = cardStorage;
    this.parserRegistry = new ParserRegistry();
    this.schemaEngine = new SchemaInferenceEngine(this.config.schemaConfig);
  }

  // ===========================================================================
  // EVENT HANDLING
  // ===========================================================================

  /**
   * Subscribe to import events
   */
  subscribe(listener: ImportEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: ImportSessionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error("Import event listener error:", e);
      }
    }
  }

  // ===========================================================================
  // SESSION LIFECYCLE
  // ===========================================================================

  /**
   * Create a new import session
   */
  async createSession(
    userId: UserId,
    mode: ImportMode = "guided",
  ): Promise<ImportSession> {
    const id = this.generateSessionId();

    const session: ImportSession = {
      id,
      userId,
      status: "created",
      mode,
      sources: [],
      detectedSchemas: [],
      mappings: [],
      targetConfig: this.defaultTargetConfig(),
      previewCards: [],
      progress: this.initialProgress(),
      issues: [],
      auditLog: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
    };

    this.session = session;
    this.addAuditEntry("session_created", { mode });
    await this.saveSession();

    return session;
  }

  /**
   * Load an existing session
   */
  async loadSession(id: ImportSessionId): Promise<ImportSession | null> {
    const session = await this.storage.load(id);
    if (session) {
      this.session = session;
    }
    return session;
  }

  /**
   * Get the current session
   */
  getSession(): ImportSession | null {
    return this.session;
  }

  /**
   * Cancel the current import
   */
  async cancelImport(): Promise<void> {
    if (!this.session) return;

    await this.updateStatus("cancelled");
    this.addAuditEntry("import_cancelled", {});
    await this.saveSession();
  }

  // ===========================================================================
  // FILE HANDLING
  // ===========================================================================

  /**
   * Add a file to the import session
   */
  async addFile(
    file: {
      content: ArrayBuffer | string;
      filename: string;
      mimeType?: string;
      size: number;
    },
    storageKey: string,
  ): Promise<DataSource> {
    this.requireSession();

    // Validate file
    if (file.size > this.config.maxFileSize) {
      throw new ImportError(
        "FILE_TOO_LARGE",
        `File exceeds maximum size of ${this.config.maxFileSize} bytes`,
      );
    }

    if (this.session!.sources.length >= this.config.maxFiles) {
      throw new ImportError(
        "TOO_MANY_FILES",
        `Maximum ${this.config.maxFiles} files allowed`,
      );
    }

    // Update status
    await this.updateStatus("uploading");

    // Parse the file
    const parseResult = await this.parserRegistry.parse(
      file.content,
      file.filename,
      file.mimeType,
      this.config.parseOptions,
    );

    if (!parseResult.success) {
      const error = parseResult.errors[0];
      throw new ImportError(
        "PARSE_ERROR",
        error?.message ?? "Failed to parse file",
      );
    }

    // Create data source
    const sourceId = this.generateSourceId();
    const source: DataSource = {
      id: sourceId,
      sessionId: this.session!.id,
      filename: file.filename,
      originalFilename: file.filename,
      mimeType: file.mimeType ?? "application/octet-stream",
      size: file.size,
      uploadedAt: new Date(),
      sourceType: parseResult.sourceType,
      sheets: parseResult.sheets.map((sheet) => ({
        ...sheet,
        id: `${sourceId}_${sheet.index}` as SheetId,
        sourceId,
      })),
      analysisStatus: "pending",
      analysisResults: null,
      storageKey,
    };

    // Add to session
    const updatedSources = [...this.session!.sources, source];
    this.session = {
      ...this.session!,
      sources: updatedSources,
      updatedAt: new Date(),
    };

    this.addAuditEntry("file_uploaded", {
      filename: file.filename,
      size: file.size,
    });
    this.emit({ type: "source_added", source });

    await this.saveSession();

    return source;
  }

  /**
   * Remove a file from the import session
   */
  async removeFile(sourceId: DataSourceId): Promise<void> {
    this.requireSession();

    const updatedSources = this.session!.sources.filter(
      (s) => s.id !== sourceId,
    );
    this.session = {
      ...this.session!,
      sources: updatedSources,
      updatedAt: new Date(),
    };

    // Remove associated schemas and mappings
    const sheetsToRemove =
      this.session!.sources.find((s) => s.id === sourceId)?.sheets.map(
        (s) => s.id,
      ) ?? [];

    const updatedSchemas = this.session!.detectedSchemas.filter(
      (s) => !sheetsToRemove.includes(s.sheetId),
    );
    const updatedMappings = this.session!.mappings.filter(
      (m) => !sheetsToRemove.includes(m.sheetId),
    );

    this.session = {
      ...this.session!,
      detectedSchemas: updatedSchemas,
      mappings: updatedMappings,
    };

    await this.saveSession();
  }

  // ===========================================================================
  // SCHEMA DETECTION
  // ===========================================================================

  /**
   * Analyze all uploaded files and detect schemas
   */
  async analyzeFiles(): Promise<readonly DetectedSchema[]> {
    this.requireSession();

    if (this.session!.sources.length === 0) {
      throw new ImportError("NO_FILES", "No files to analyze");
    }

    await this.updateStatus("analyzing");
    this.addAuditEntry("analysis_started", {});

    const schemas: DetectedSchema[] = [];

    for (const source of this.session!.sources) {
      // Update source analysis status
      const updatedSource = { ...source, analysisStatus: "analyzing" as const };
      this.updateSource(updatedSource);

      for (const sheet of source.sheets) {
        try {
          // Analyze the sheet
          const schema = this.schemaEngine.analyzeSheet(sheet);
          const fullSchema: DetectedSchema = {
            ...schema,
            sourceId: source.id,
            sheetId: sheet.id,
          };

          schemas.push(fullSchema);
          this.emit({ type: "schema_detected", schema: fullSchema });
        } catch (e) {
          this.addIssue({
            id: this.generateId(),
            timestamp: new Date(),
            phase: "detecting_schema",
            severity: "error",
            code: "SCHEMA_DETECTION_FAILED",
            message: `Failed to analyze sheet "${sheet.name}": ${e instanceof Error ? e.message : "Unknown error"}`,
            details: null,
            sourceId: source.id,
            sheetId: sheet.id,
            rowIndex: null,
            columnIndex: null,
            isResolved: false,
            resolution: null,
            canAutoResolve: false,
            suggestedAction: "Try manually configuring field mappings",
          });
        }
      }

      // Mark source as analyzed
      this.updateSource({
        ...updatedSource,
        analysisStatus: "completed",
      });
    }

    // Update session with schemas
    this.session = {
      ...this.session!,
      detectedSchemas: schemas,
      updatedAt: new Date(),
    };

    await this.updateStatus("schema_detected");
    this.addAuditEntry("schema_detected", { schemaCount: schemas.length });
    this.addAuditEntry("analysis_completed", {});

    // Generate suggested mappings
    const suggestedMappings = this.generateSuggestedMappings(schemas);
    this.emit({ type: "mapping_suggested", mappings: suggestedMappings });

    await this.saveSession();

    return schemas;
  }

  // ===========================================================================
  // MAPPING CONFIGURATION
  // ===========================================================================

  /**
   * Apply suggested mappings automatically
   */
  async applySuggestedMappings(
    suggestions: readonly SuggestedMapping[],
    sheetId: SheetId,
  ): Promise<readonly FieldMapping[]> {
    this.requireSession();

    const mappings: FieldMapping[] = suggestions.map((s) => ({
      id: this.generateMappingId(),
      sessionId: this.session!.id,
      sheetId,
      sourceColumnIndex: s.sourceColumnIndex,
      sourceColumnName: s.sourceColumnName,
      targetField: s.suggestedTarget,
      targetCardType: s.suggestedCardType,
      transformation: null,
      isValid: true,
      validationErrors: [],
      isAutoSuggested: true,
      userConfirmed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await this.setMappings(sheetId, mappings);
    return mappings;
  }

  /**
   * Set field mappings for a sheet
   */
  async setMappings(
    sheetId: SheetId,
    mappings: readonly FieldMapping[],
  ): Promise<void> {
    this.requireSession();

    // Remove existing mappings for this sheet
    const otherMappings = this.session!.mappings.filter(
      (m) => m.sheetId !== sheetId,
    );
    const allMappings = [...otherMappings, ...mappings];

    this.session = {
      ...this.session!,
      mappings: allMappings,
      updatedAt: new Date(),
    };

    this.addAuditEntry("mapping_configured", {
      sheetId,
      mappingCount: mappings.length,
    });

    await this.saveSession();
  }

  /**
   * Update a single mapping
   */
  async updateMapping(
    mappingId: MappingId,
    updates: Partial<
      Pick<
        FieldMapping,
        "targetField" | "targetCardType" | "transformation" | "userConfirmed"
      >
    >,
  ): Promise<FieldMapping> {
    this.requireSession();

    const mappingIndex = this.session!.mappings.findIndex(
      (m) => m.id === mappingId,
    );
    if (mappingIndex === -1) {
      throw new ImportError("MAPPING_NOT_FOUND", "Mapping not found");
    }

    const existingMapping = this.session!.mappings[mappingIndex];

    // Build updated mapping with validation
    const tempMapping: FieldMapping = {
      ...existingMapping,
      ...updates,
      updatedAt: new Date(),
      isValid: true, // Will be updated below
      validationErrors: [],
    };

    // Validate the mapping
    const validation = this.validateMapping(tempMapping);

    // Create final mapping with validation results
    const updatedMapping: FieldMapping = {
      ...tempMapping,
      isValid: validation.isValid,
      validationErrors: validation.errors,
    };

    const updatedMappings = [...this.session!.mappings];
    updatedMappings[mappingIndex] = updatedMapping;

    this.session = {
      ...this.session!,
      mappings: updatedMappings,
      updatedAt: new Date(),
    };

    await this.saveSession();
    return updatedMapping;
  }

  /**
   * Confirm all mappings and proceed
   */
  async confirmMappings(): Promise<void> {
    this.requireSession();

    // Validate all mappings
    const invalidMappings = this.session!.mappings.filter((m) => !m.isValid);
    if (invalidMappings.length > 0) {
      throw new ImportError(
        "INVALID_MAPPINGS",
        `${invalidMappings.length} mappings have validation errors`,
      );
    }

    // Check for required fields
    const hasFront = this.session!.mappings.some(
      (m) => m.targetField === "front" || m.targetField === "cloze_text",
    );

    if (!hasFront) {
      throw new ImportError(
        "MISSING_REQUIRED_FIELD",
        "At least one field must be mapped to front/question content",
      );
    }

    // Mark all as confirmed
    const confirmedMappings = this.session!.mappings.map((m) => ({
      ...m,
      userConfirmed: true,
      updatedAt: new Date(),
    }));

    this.session = {
      ...this.session!,
      mappings: confirmedMappings,
      updatedAt: new Date(),
    };

    await this.updateStatus("mapping_complete");
    this.addAuditEntry("mapping_confirmed", {});

    await this.saveSession();
  }

  // ===========================================================================
  // TARGET CONFIGURATION
  // ===========================================================================

  /**
   * Update target configuration
   */
  async updateTargetConfig(
    updates: Partial<ImportTargetConfig>,
  ): Promise<ImportTargetConfig> {
    this.requireSession();

    const updatedConfig: ImportTargetConfig = {
      ...this.session!.targetConfig,
      ...updates,
    };

    this.session = {
      ...this.session!,
      targetConfig: updatedConfig,
      updatedAt: new Date(),
    };

    this.addAuditEntry("settings_changed", { changes: Object.keys(updates) });
    await this.saveSession();

    return updatedConfig;
  }

  // ===========================================================================
  // PREVIEW GENERATION
  // ===========================================================================

  /**
   * Generate preview cards based on current mappings
   */
  async generatePreview(): Promise<readonly PreviewCard[]> {
    this.requireSession();

    if (this.session!.mappings.length === 0) {
      throw new ImportError("NO_MAPPINGS", "No field mappings configured");
    }

    await this.updateStatus("previewing");

    const previewCards: PreviewCard[] = [];
    const config = this.session!.targetConfig;

    for (const source of this.session!.sources) {
      for (const sheet of source.sheets) {
        const sheetMappings = this.session!.mappings.filter(
          (m) => m.sheetId === sheet.id,
        );

        if (sheetMappings.length === 0) continue;

        // Generate preview cards from sample rows
        const dataRows = sheet.sampleRows.filter((r) => r.rowType === "data");
        const rowsToPreview = dataRows.slice(0, this.config.maxPreviewCards);

        for (const row of rowsToPreview) {
          try {
            const card = this.buildPreviewCard(
              row,
              sheetMappings,
              sheet,
              config,
            );
            previewCards.push(card);
          } catch (e) {
            this.addIssue({
              id: this.generateId(),
              timestamp: new Date(),
              phase: "generating_preview",
              severity: "warning",
              code: "CARD_GENERATION_FAILED",
              message: `Failed to generate card from row ${row.rowIndex}: ${e instanceof Error ? e.message : "Unknown error"}`,
              details: null,
              sourceId: source.id,
              sheetId: sheet.id,
              rowIndex: row.rowIndex,
              columnIndex: null,
              isResolved: false,
              resolution: null,
              canAutoResolve: false,
              suggestedAction: "Check field mappings for this row",
            });
          }
        }
      }
    }

    // Update session
    this.session = {
      ...this.session!,
      previewCards,
      updatedAt: new Date(),
    };

    await this.updateStatus("preview_ready");
    this.emit({ type: "preview_ready", cards: previewCards });

    await this.saveSession();

    return previewCards;
  }

  /**
   * Build a preview card from a data row
   */
  private buildPreviewCard(
    row: import("./types").DataRow,
    mappings: readonly FieldMapping[],
    sheet: DataSheet,
    config: ImportTargetConfig,
  ): PreviewCard {
    const cardId = this.generatePreviewCardId();
    const content: Record<string, unknown> = {};
    let tags: string[] = [...config.defaultTags];
    let deckName = config.newDeckName ?? "Imported Cards";
    let cardType = config.defaultCardType;

    // Process each mapping
    for (const mapping of mappings) {
      const cell = row.cells[mapping.sourceColumnIndex];
      if (!cell || cell.isNull) continue;

      let value = cell.rawValue;

      // Apply transformation if configured
      if (mapping.transformation) {
        value = this.applyTransformation(value, mapping.transformation);
      }

      // Map to target field
      switch (mapping.targetField) {
        case "front":
          content.front = value;
          break;
        case "back":
          content.back = value;
          break;
        case "cloze_text":
          content.text = value;
          cardType = "cloze";
          break;
        case "hint":
          content.hint = value;
          break;
        case "mnemonic":
          content.mnemonic = value;
          break;
        case "explanation":
          content.explanation = value;
          break;
        case "notes":
          content.notes = value;
          break;
        case "tags": {
          const tagValue = String(value);
          const newTags = tagValue
            .split(/[,;]/)
            .map((t) => t.trim())
            .filter(Boolean);
          tags = [...tags, ...newTags];
          break;
        }
        case "deck":
          deckName = String(value);
          break;
        case "ignore":
          // Skip
          break;
      }

      // Override card type if specified in mapping
      if (mapping.targetCardType) {
        cardType = mapping.targetCardType;
      }
    }

    // Assess quality
    const qualityIssues = this.assessCardQuality(content, cardType);
    const qualityScore = this.calculateQualityScore(qualityIssues);

    return {
      id: cardId,
      sessionId: this.session!.id,
      sourceRowIndex: row.rowIndex,
      sheetId: sheet.id,
      cardType,
      content: content as Partial<CardContent>,
      tags,
      targetDeck: deckName,
      qualityScore,
      qualityIssues,
      status: "pending",
      userAction: null,
      potentialDuplicates: [],
      sourceData: Object.fromEntries(
        row.cells.map((c, i) => [
          sheet.columns[i]?.normalizedName ?? `col_${i}`,
          c.rawValue,
        ]),
      ),
    };
  }

  /**
   * Apply a transformation to a value
   */
  private applyTransformation(
    value: unknown,
    transformation: FieldTransformation,
  ): unknown {
    const strValue = String(value ?? "");

    switch (transformation.type) {
      case "none":
        return value;
      case "trim":
        return strValue.trim();
      case "lowercase":
        return strValue.toLowerCase();
      case "uppercase":
        return strValue.toUpperCase();
      case "capitalize":
        return (
          strValue.charAt(0).toUpperCase() + strValue.slice(1).toLowerCase()
        );
      case "strip_html":
        return strValue.replace(/<[^>]*>/g, "");
      case "split_tags": {
        const delimiter = transformation.config.delimiter ?? ",";
        return strValue
          .split(delimiter)
          .map((s) => s.trim())
          .filter(Boolean);
      }
      case "regex_replace":
        if (
          transformation.config.pattern &&
          transformation.config.replacement !== undefined
        ) {
          const regex = new RegExp(transformation.config.pattern, "g");
          return strValue.replace(regex, transformation.config.replacement);
        }
        return value;
      default:
        return value;
    }
  }

  /**
   * Assess quality of a card
   */
  private assessCardQuality(
    content: Record<string, unknown>,
    cardType: CardType,
  ): CardQualityIssue[] {
    const issues: CardQualityIssue[] = [];

    // Check for empty front
    if (!content.front && !content.text) {
      issues.push({
        code: "EMPTY_FRONT",
        severity: "error",
        field: "front",
        message: "Card has no front/question content",
        suggestion: "Map a field to front content",
        autoFixable: false,
      });
    }

    // Check for empty back (for non-cloze cards)
    if (cardType !== "cloze" && !content.back) {
      issues.push({
        code: "EMPTY_BACK",
        severity: "warning",
        field: "back",
        message: "Card has no back/answer content",
        suggestion: "Map a field to back content",
        autoFixable: false,
      });
    }

    // Check for very short content
    const front = String(content.front ?? "");
    if (front.length > 0 && front.length < 3) {
      issues.push({
        code: "SHORT_FRONT",
        severity: "info",
        field: "front",
        message: "Front content is very short",
        suggestion: null,
        autoFixable: false,
      });
    }

    // Check for duplicate front/back
    if (content.front && content.front === content.back) {
      issues.push({
        code: "DUPLICATE_CONTENT",
        severity: "warning",
        field: "both",
        message: "Front and back content are identical",
        suggestion: "Ensure front and back have different content",
        autoFixable: false,
      });
    }

    return issues;
  }

  /**
   * Calculate quality score from issues
   */
  private calculateQualityScore(issues: readonly CardQualityIssue[]): number {
    let score = 100;

    for (const issue of issues) {
      switch (issue.severity) {
        case "error":
          score -= 40;
          break;
        case "warning":
          score -= 20;
          break;
        case "info":
          score -= 5;
          break;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  // ===========================================================================
  // PREVIEW ACTIONS
  // ===========================================================================

  /**
   * Approve a preview card
   */
  async approveCard(cardId: PreviewCardId): Promise<void> {
    await this.updatePreviewCardStatus(cardId, "approved", "approve");
  }

  /**
   * Reject a preview card
   */
  async rejectCard(cardId: PreviewCardId): Promise<void> {
    await this.updatePreviewCardStatus(cardId, "rejected", "reject");
  }

  /**
   * Flag a preview card for review
   */
  async flagCard(cardId: PreviewCardId): Promise<void> {
    await this.updatePreviewCardStatus(cardId, "flagged", "flag");
  }

  /**
   * Update preview card content
   */
  async updatePreviewCard(
    cardId: PreviewCardId,
    updates: Partial<
      Pick<PreviewCard, "content" | "tags" | "targetDeck" | "cardType">
    >,
  ): Promise<PreviewCard> {
    this.requireSession();

    const cardIndex = this.session!.previewCards.findIndex(
      (c) => c.id === cardId,
    );
    if (cardIndex === -1) {
      throw new ImportError("CARD_NOT_FOUND", "Preview card not found");
    }

    const existingCard = this.session!.previewCards[cardIndex];

    // Build temp card for quality assessment
    const tempCard = {
      ...existingCard,
      ...updates,
      status: "modified" as const,
      userAction: "approve_with_edit" as const,
    };

    // Re-assess quality
    const qualityIssues = this.assessCardQuality(
      tempCard.content as Record<string, unknown>,
      tempCard.cardType,
    );
    const qualityScore = this.calculateQualityScore(qualityIssues);

    // Create final updated card
    const updatedCard: PreviewCard = {
      ...tempCard,
      qualityIssues,
      qualityScore,
    };

    const updatedCards = [...this.session!.previewCards];
    updatedCards[cardIndex] = updatedCard;

    this.session = {
      ...this.session!,
      previewCards: updatedCards,
      updatedAt: new Date(),
    };

    await this.saveSession();
    return updatedCard;
  }

  /**
   * Approve all pending cards
   */
  async approveAllPending(): Promise<number> {
    this.requireSession();

    let count = 0;
    const updatedCards = this.session!.previewCards.map((card) => {
      if (card.status === "pending" && card.qualityScore >= 60) {
        count++;
        return {
          ...card,
          status: "approved" as PreviewCardStatus,
          userAction: "approve" as const,
        };
      }
      return card;
    });

    this.session = {
      ...this.session!,
      previewCards: updatedCards,
      updatedAt: new Date(),
    };

    this.addAuditEntry("cards_approved", { count });
    await this.saveSession();

    return count;
  }

  private async updatePreviewCardStatus(
    cardId: PreviewCardId,
    status: PreviewCardStatus,
    action: import("./types").PreviewCardAction,
  ): Promise<void> {
    this.requireSession();

    const cardIndex = this.session!.previewCards.findIndex(
      (c) => c.id === cardId,
    );
    if (cardIndex === -1) {
      throw new ImportError("CARD_NOT_FOUND", "Preview card not found");
    }

    const updatedCards = [...this.session!.previewCards];
    updatedCards[cardIndex] = {
      ...updatedCards[cardIndex],
      status,
      userAction: action,
    };

    this.session = {
      ...this.session!,
      previewCards: updatedCards,
      updatedAt: new Date(),
    };

    await this.saveSession();
  }

  // ===========================================================================
  // IMPORT EXECUTION
  // ===========================================================================

  /**
   * Execute the import
   */
  async executeImport(): Promise<ImportResult> {
    this.requireSession();

    const approvedCards = this.session!.previewCards.filter(
      (c) => c.status === "approved" || c.status === "modified",
    );

    if (approvedCards.length === 0) {
      throw new ImportError(
        "NO_APPROVED_CARDS",
        "No cards approved for import",
      );
    }

    await this.updateStatus("importing");
    this.addAuditEntry("import_started", { cardCount: approvedCards.length });

    const startTime = Date.now();
    const config = this.session!.targetConfig;

    // Use mutable stats internally
    const mutableStats = {
      totalSourceRows: this.session!.sources.reduce(
        (sum, s) => sum + s.sheets.reduce((ss, sh) => ss + sh.rowCount, 0),
        0,
      ),
      totalCardsAttempted: approvedCards.length,
      totalCardsCreated: 0,
      cardsByType: {} as Record<CardType, number>,
      cardsByDeck: {} as Record<string, number>,
      duplicatesHandled: 0,
      transformationsApplied: 0,
      averageCardQualityScore: 0,
    };

    const createdDecks: Array<{ id: DeckId; name: string; cardCount: number }> =
      [];
    const errors: ImportIssue[] = [];
    const warnings: ImportIssue[] = [];

    try {
      // Group cards by deck
      const cardsByDeck = new Map<string, PreviewCard[]>();
      for (const card of approvedCards) {
        const deck = card.targetDeck;
        const existing = cardsByDeck.get(deck) ?? [];
        cardsByDeck.set(deck, [...existing, card]);
      }

      // Create decks and cards
      for (const [deckName, deckCards] of cardsByDeck) {
        // Create or get deck
        let deckId: DeckId;

        if (config.targetDeckId && !config.createNewDeck) {
          deckId = config.targetDeckId;
        } else {
          deckId = await this.cardStorage.createDeck(
            this.session!.userId,
            deckName,
            config.newDeckDescription ?? undefined,
          );
        }

        // Create cards
        const cardsToCreate = deckCards.map((pc) => ({
          type: pc.cardType,
          content: this.buildCardContent(pc),
          tags: [...pc.tags],
        }));

        const createdIds = await this.cardStorage.createCards(
          deckId,
          cardsToCreate,
        );

        mutableStats.totalCardsCreated += createdIds.length;
        mutableStats.cardsByDeck[deckName] = createdIds.length;

        for (const card of deckCards) {
          mutableStats.cardsByType[card.cardType] =
            (mutableStats.cardsByType[card.cardType] ?? 0) + 1;
          mutableStats.averageCardQualityScore += card.qualityScore;
        }

        createdDecks.push({
          id: deckId,
          name: deckName,
          cardCount: createdIds.length,
        });

        // Update progress
        this.updateProgress({
          successfulCards: mutableStats.totalCardsCreated,
        });
      }

      // Finalize stats
      mutableStats.averageCardQualityScore =
        approvedCards.length > 0
          ? mutableStats.averageCardQualityScore / approvedCards.length
          : 0;

      await this.updateStatus("completed");
    } catch (e) {
      await this.updateStatus("failed");

      errors.push({
        id: this.generateId(),
        timestamp: new Date(),
        phase: "creating_cards",
        severity: "critical",
        code: "IMPORT_FAILED",
        message: e instanceof Error ? e.message : "Import failed",
        details: null,
        sourceId: null,
        sheetId: null,
        rowIndex: null,
        columnIndex: null,
        isResolved: false,
        resolution: null,
        canAutoResolve: false,
        suggestedAction: "Try again or contact support",
      });

      this.emit({
        type: "import_failed",
        error: e instanceof Error ? e.message : "Unknown error",
      });
      this.addAuditEntry("import_failed", {
        error: e instanceof Error ? e.message : "Unknown",
      });
    }

    // Convert mutable stats to readonly ImportStatistics
    const stats: ImportStatistics = {
      totalSourceRows: mutableStats.totalSourceRows,
      totalCardsAttempted: mutableStats.totalCardsAttempted,
      totalCardsCreated: mutableStats.totalCardsCreated,
      cardsByType: mutableStats.cardsByType,
      cardsByDeck: mutableStats.cardsByDeck,
      duplicatesHandled: mutableStats.duplicatesHandled,
      transformationsApplied: mutableStats.transformationsApplied,
      averageCardQualityScore: mutableStats.averageCardQualityScore,
    };

    const result: ImportResult = {
      sessionId: this.session!.id,
      success: errors.filter((e) => e.severity === "critical").length === 0,
      completedAt: new Date(),
      durationMs: Date.now() - startTime,
      createdDecks,
      createdCards: stats.totalCardsCreated,
      updatedCards: 0,
      skippedCards: approvedCards.length - stats.totalCardsCreated,
      errors,
      warnings,
      canUndo: true,
      undoDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      stats,
    };

    this.session = {
      ...this.session!,
      completedAt: new Date(),
      updatedAt: new Date(),
    };

    this.emit({ type: "import_completed", result });
    this.addAuditEntry("import_completed", {
      cardCount: stats.totalCardsCreated,
      deckCount: createdDecks.length,
    });

    await this.saveSession();

    return result;
  }

  /**
   * Build card content from preview card
   */
  private buildCardContent(previewCard: PreviewCard): CardContent {
    const content = previewCard.content;

    // Build content based on card type
    // Helper to create proper RichText
    const createRichText = (
      text: string,
    ): {
      format: "plain";
      content: string;
      attachments: readonly [];
      mathBlocks: readonly [];
    } => ({
      format: "plain",
      content: text,
      attachments: [],
      mathBlocks: [],
    });

    // Access content as Record for flexible property access
    const rawContent = content as Record<string, unknown>;

    switch (previewCard.cardType) {
      case "atomic":
        return {
          type: "atomic",
          front: createRichText(String(rawContent["front"] ?? "")),
          back: createRichText(String(rawContent["back"] ?? "")),
          bidirectional: false,
          hint: rawContent["hint"] ? String(rawContent["hint"]) : null,
          mnemonic: rawContent["mnemonic"]
            ? String(rawContent["mnemonic"])
            : null,
          sourceReference: null,
        } as unknown as CardContent;

      case "cloze":
        return {
          type: "cloze",
          text: String(rawContent["text"] ?? ""),
          clozes: [], // Will be parsed by the system
          context: null,
          showAllClozesAtOnce: false,
          syntaxHighlighting: null,
        } as unknown as CardContent;

      default:
        // For other types, return as atomic with available fields
        return {
          type: "atomic",
          front: createRichText(String(rawContent["front"] ?? "")),
          back: createRichText(String(rawContent["back"] ?? "")),
          bidirectional: false,
          hint: rawContent["hint"] ? String(rawContent["hint"]) : null,
          mnemonic: rawContent["mnemonic"]
            ? String(rawContent["mnemonic"])
            : null,
          sourceReference: null,
        } as unknown as CardContent;
    }
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private requireSession(): void {
    if (!this.session) {
      throw new ImportError("NO_SESSION", "No import session active");
    }
  }

  private async updateStatus(status: ImportSessionStatus): Promise<void> {
    if (!this.session) return;

    const previousStatus = this.session.status;
    this.session = {
      ...this.session,
      status,
      updatedAt: new Date(),
    };

    this.emit({ type: "status_changed", status, previousStatus });
    await this.saveSession();
  }

  private updateProgress(updates: Partial<ImportProgress>): void {
    if (!this.session) return;

    const progress = {
      ...this.session.progress,
      ...updates,
    };

    this.session = {
      ...this.session,
      progress,
      updatedAt: new Date(),
    };

    this.emit({ type: "progress_updated", progress });
  }

  private updateSource(source: DataSource): void {
    if (!this.session) return;

    const index = this.session.sources.findIndex((s) => s.id === source.id);
    if (index === -1) return;

    const sources = [...this.session.sources];
    sources[index] = source;

    this.session = { ...this.session, sources };
  }

  private addIssue(issue: ImportIssue): void {
    if (!this.session) return;

    this.session = {
      ...this.session,
      issues: [...this.session.issues, issue],
    };

    this.emit({ type: "issue_added", issue });
  }

  private addAuditEntry(
    action: ImportAuditAction,
    details: Record<string, unknown>,
  ): void {
    if (!this.session) return;

    const entry: ImportAuditEntry = {
      timestamp: new Date(),
      action,
      userId: this.session.userId,
      details,
    };

    this.session = {
      ...this.session,
      auditLog: [...this.session.auditLog, entry],
    };
  }

  private async saveSession(): Promise<void> {
    if (this.session) {
      await this.storage.save(this.session);
    }
  }

  private defaultTargetConfig(): ImportTargetConfig {
    return {
      targetDeckId: null,
      createNewDeck: true,
      newDeckName: null,
      newDeckDescription: null,
      deckHierarchy: null,
      defaultCardType: "atomic",
      cardTypeMapping: null,
      defaultTags: [],
      tagFieldMapping: null,
      duplicateStrategy: "skip",
      duplicateMatchFields: ["front"],
      preserveSourceMetadata: true,
      generateBidirectional: false,
      aiEnhancementLevel: "none",
    };
  }

  private initialProgress(): ImportProgress {
    return {
      phase: "idle",
      phaseName: "Ready",
      phaseProgress: 0,
      overallProgress: 0,
      totalRows: 0,
      processedRows: 0,
      successfulCards: 0,
      skippedCards: 0,
      failedCards: 0,
      duplicatesFound: 0,
      startedAt: null,
      estimatedCompletion: null,
      currentRate: 0,
    };
  }

  private generateSuggestedMappings(
    schemas: readonly DetectedSchema[],
  ): SuggestedMapping[] {
    const mappings: SuggestedMapping[] = [];

    for (const schema of schemas) {
      for (const field of schema.fields) {
        if (field.semanticType && field.semanticType !== "unknown") {
          const targetField = this.semanticToTarget(field.semanticType);
          if (targetField) {
            mappings.push({
              sourceColumnIndex: field.sourceColumnIndex,
              sourceColumnName: field.name,
              suggestedTarget: targetField,
              suggestedCardType: null,
              confidence: 0.8,
              reasoning: `Column "${field.name}" appears to be ${field.semanticType}`,
              alternatives: [],
            });
          }
        }
      }
    }

    return mappings;
  }

  private semanticToTarget(
    semantic: import("./types").SemanticFieldType,
  ): CardTargetField | null {
    const map: Partial<
      Record<import("./types").SemanticFieldType, CardTargetField>
    > = {
      question: "front",
      answer: "back",
      front: "front",
      back: "back",
      cloze_text: "cloze_text",
      hint: "hint",
      mnemonic: "mnemonic",
      explanation: "explanation",
      tags: "tags",
      deck_name: "deck",
      deck_path: "deck",
      source: "source",
      notes: "notes",
    };
    return map[semantic] ?? null;
  }

  private validateMapping(mapping: FieldMapping): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check that source column exists
    const sheet = this.session?.sources
      .flatMap((s) => s.sheets)
      .find((s) => s.id === mapping.sheetId);

    if (!sheet) {
      errors.push("Sheet not found");
      return { isValid: false, errors };
    }

    if (mapping.sourceColumnIndex >= sheet.columnCount) {
      errors.push("Source column does not exist");
    }

    // Validate transformation if present
    if (mapping.transformation) {
      if (mapping.transformation.type === "regex_replace") {
        if (!mapping.transformation.config.pattern) {
          errors.push("Regex pattern is required");
        } else {
          try {
            new RegExp(mapping.transformation.config.pattern);
          } catch {
            errors.push("Invalid regex pattern");
          }
        }
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  // ===========================================================================
  // ID GENERATION
  // ===========================================================================

  private generateSessionId(): ImportSessionId {
    return `import_${Date.now()}_${this.generateId()}` as ImportSessionId;
  }

  private generateSourceId(): DataSourceId {
    return `source_${Date.now()}_${this.generateId()}` as DataSourceId;
  }

  private generateMappingId(): MappingId {
    return `mapping_${Date.now()}_${this.generateId()}` as MappingId;
  }

  private generatePreviewCardId(): PreviewCardId {
    return `preview_${Date.now()}_${this.generateId()}` as PreviewCardId;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 11);
  }
}

// =============================================================================
// ERROR CLASS
// =============================================================================

/**
 * Import-specific error
 */
export class ImportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ImportError";
  }
}
