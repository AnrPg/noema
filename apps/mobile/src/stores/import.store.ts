// =============================================================================
// IMPORT STORE - STATE MANAGEMENT FOR DATA IMPORT
// =============================================================================

import { create } from "zustand";
import { MMKV } from "react-native-mmkv";
import { DataImport } from "@manthanein/shared";

const storage = new MMKV({ id: "import-storage" });

// =============================================================================
// TYPES
// =============================================================================

export type ImportStep =
  | "select"
  | "upload"
  | "parse"
  | "schema"
  | "mapping"
  | "preview"
  | "import"
  | "complete";

export interface SelectedFile {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface ParsedSheet {
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
  sampleRows: Array<Record<string, unknown>>;
}

export interface FieldMapping {
  sourceColumn: string;
  targetField: string;
  transformation?: string;
}

export interface PreviewCard {
  id: string;
  front: string;
  back: string;
  tags: string[];
  hasIssues: boolean;
  issues: string[];
}

export interface ImportProgress {
  phase: string;
  current: number;
  total: number;
  message: string;
}

export interface ImportResult {
  success: boolean;
  cardsCreated: number;
  cardsUpdated: number;
  cardsSkipped: number;
  cardsFailed: number;
  duplicatesSkipped: number;
  errors: string[];
  warnings: string[];
}

/** Simplified schema for local use (without branded types) */
export interface LocalDetectedSchema {
  id: string;
  sourceId: string;
  sheetId: string;
  fields: Array<{
    name: string;
    sourceColumnIndex: number;
    dataType: string;
    semanticType: string | null;
    isRequired: boolean;
    isUnique: boolean;
    defaultValue: unknown | null;
    validValues: unknown[] | null;
    validation: unknown | null;
  }>;
  primaryKeyFields: string[];
  suggestedCardType: string;
  overallConfidence: number;
  isValid: boolean;
  validationIssues: string[];
}

// =============================================================================
// STORE STATE
// =============================================================================

interface ImportState {
  // Current step in the wizard
  currentStep: ImportStep;

  // Selected file
  selectedFile: SelectedFile | null;

  // Upload progress
  uploadProgress: number;
  isUploading: boolean;

  // Parse state
  isParsing: boolean;
  parseError: string | null;
  parsedSheets: ParsedSheet[];
  selectedSheetId: string | null;

  // Schema inference
  isInferringSchema: boolean;
  detectedSchema: LocalDetectedSchema | null;

  // Field mappings
  mappings: FieldMapping[];
  suggestedMappings: FieldMapping[];

  // Target deck
  targetDeckId: string | null;
  createNewDeck: boolean;
  newDeckName: string;

  // Import options
  importMode: "quick" | "guided" | "expert";
  duplicateStrategy: "skip" | "update" | "create_anyway";

  // Preview
  isGeneratingPreview: boolean;
  previewCards: PreviewCard[];
  previewError: string | null;

  // Import execution
  isImporting: boolean;
  importProgress: ImportProgress | null;
  importResult: ImportResult | null;

  // History
  recentImports: Array<{
    id: string;
    filename: string;
    cardCount: number;
    timestamp: string;
    deckId: string;
  }>;
}

interface ImportActions {
  // Navigation
  setStep: (step: ImportStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  reset: () => void;

  // File selection
  setSelectedFile: (file: SelectedFile | null) => void;

  // Upload
  setUploadProgress: (progress: number) => void;
  setIsUploading: (isUploading: boolean) => void;

  // Parse
  setIsParsing: (isParsing: boolean) => void;
  setParseError: (error: string | null) => void;
  setParsedSheets: (sheets: ParsedSheet[]) => void;
  setSelectedSheet: (sheetId: string | null) => void;

  // Schema
  setIsInferringSchema: (isInferring: boolean) => void;
  setDetectedSchema: (schema: LocalDetectedSchema | null) => void;

  // Mappings
  setMappings: (mappings: FieldMapping[]) => void;
  setSuggestedMappings: (mappings: FieldMapping[]) => void;
  updateMapping: (index: number, mapping: Partial<FieldMapping>) => void;
  addMapping: (mapping: FieldMapping) => void;
  removeMapping: (index: number) => void;
  applyMappingSuggestion: (index: number) => void;

  // Target
  setTargetDeckId: (deckId: string | null) => void;
  setCreateNewDeck: (create: boolean) => void;
  setNewDeckName: (name: string) => void;

  // Options
  setImportMode: (mode: "quick" | "guided" | "expert") => void;
  setDuplicateStrategy: (strategy: "skip" | "update" | "create_anyway") => void;

  // Preview
  setIsGeneratingPreview: (isGenerating: boolean) => void;
  setPreviewCards: (cards: PreviewCard[]) => void;
  setPreviewError: (error: string | null) => void;

  // Import
  setIsImporting: (isImporting: boolean) => void;
  setImportProgress: (progress: ImportProgress | null) => void;
  setImportResult: (result: ImportResult | null) => void;

  // History
  addToHistory: (entry: ImportState["recentImports"][0]) => void;
  loadHistory: () => void;
}

// =============================================================================
// STEP ORDER
// =============================================================================

const STEP_ORDER: ImportStep[] = [
  "select",
  "upload",
  "parse",
  "schema",
  "mapping",
  "preview",
  "import",
  "complete",
];

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: ImportState = {
  currentStep: "select",
  selectedFile: null,
  uploadProgress: 0,
  isUploading: false,
  isParsing: false,
  parseError: null,
  parsedSheets: [],
  selectedSheetId: null,
  isInferringSchema: false,
  detectedSchema: null,
  mappings: [],
  suggestedMappings: [],
  targetDeckId: null,
  createNewDeck: false,
  newDeckName: "",
  importMode: "guided",
  duplicateStrategy: "skip",
  isGeneratingPreview: false,
  previewCards: [],
  previewError: null,
  isImporting: false,
  importProgress: null,
  importResult: null,
  recentImports: [],
};

// =============================================================================
// STORE
// =============================================================================

export const useImportStore = create<ImportState & ImportActions>(
  (set, get) => ({
    ...initialState,

    // Navigation
    setStep: (step) => set({ currentStep: step }),

    nextStep: () => {
      const { currentStep } = get();
      const currentIndex = STEP_ORDER.indexOf(currentStep);
      if (currentIndex < STEP_ORDER.length - 1) {
        set({ currentStep: STEP_ORDER[currentIndex + 1] });
      }
    },

    prevStep: () => {
      const { currentStep } = get();
      const currentIndex = STEP_ORDER.indexOf(currentStep);
      if (currentIndex > 0) {
        set({ currentStep: STEP_ORDER[currentIndex - 1] });
      }
    },

    reset: () => set({ ...initialState, recentImports: get().recentImports }),

    // File selection
    setSelectedFile: (file) => set({ selectedFile: file }),

    // Upload
    setUploadProgress: (progress) => set({ uploadProgress: progress }),
    setIsUploading: (isUploading) => set({ isUploading }),

    // Parse
    setIsParsing: (isParsing) => set({ isParsing }),
    setParseError: (error) => set({ parseError: error }),
    setParsedSheets: (sheets) => set({ parsedSheets: sheets }),
    setSelectedSheet: (sheetId) => set({ selectedSheetId: sheetId }),

    // Schema
    setIsInferringSchema: (isInferring) =>
      set({ isInferringSchema: isInferring }),
    setDetectedSchema: (schema) => set({ detectedSchema: schema }),

    // Mappings
    setMappings: (mappings) => set({ mappings }),
    setSuggestedMappings: (mappings) => set({ suggestedMappings: mappings }),

    updateMapping: (index, mapping) => {
      const { mappings } = get();
      const updated = [...mappings];
      updated[index] = { ...updated[index], ...mapping };
      set({ mappings: updated });
    },

    addMapping: (mapping) => {
      const { mappings } = get();
      set({ mappings: [...mappings, mapping] });
    },

    removeMapping: (index) => {
      const { mappings } = get();
      set({ mappings: mappings.filter((_, i) => i !== index) });
    },

    applyMappingSuggestion: (index) => {
      const { suggestedMappings, mappings } = get();
      if (suggestedMappings[index]) {
        set({ mappings: [...mappings, suggestedMappings[index]] });
      }
    },

    // Target
    setTargetDeckId: (deckId) => set({ targetDeckId: deckId }),
    setCreateNewDeck: (create) => set({ createNewDeck: create }),
    setNewDeckName: (name) => set({ newDeckName: name }),

    // Options
    setImportMode: (mode) => set({ importMode: mode }),
    setDuplicateStrategy: (strategy) => set({ duplicateStrategy: strategy }),

    // Preview
    setIsGeneratingPreview: (isGenerating) =>
      set({ isGeneratingPreview: isGenerating }),
    setPreviewCards: (cards) => set({ previewCards: cards }),
    setPreviewError: (error) => set({ previewError: error }),

    // Import
    setIsImporting: (isImporting) => set({ isImporting }),
    setImportProgress: (progress) => set({ importProgress: progress }),
    setImportResult: (result) => set({ importResult: result }),

    // History
    addToHistory: (entry) => {
      const { recentImports } = get();
      const updated = [entry, ...recentImports].slice(0, 10);
      set({ recentImports: updated });
      storage.set("recentImports", JSON.stringify(updated));
    },

    loadHistory: () => {
      try {
        const saved = storage.getString("recentImports");
        if (saved) {
          set({ recentImports: JSON.parse(saved) });
        }
      } catch {
        // Ignore parse errors
      }
    },
  }),
);

// =============================================================================
// SELECTORS
// =============================================================================

export const useCurrentStep = () => useImportStore((s) => s.currentStep);
export const useSelectedFile = () => useImportStore((s) => s.selectedFile);
export const useParsedSheets = () => useImportStore((s) => s.parsedSheets);
export const useMappings = () => useImportStore((s) => s.mappings);
export const usePreviewCards = () => useImportStore((s) => s.previewCards);
export const useImportProgress = () => useImportStore((s) => s.importProgress);
export const useImportResult = () => useImportStore((s) => s.importResult);
export const useRecentImports = () => useImportStore((s) => s.recentImports);

export const useCanProceed = () => {
  const state = useImportStore();

  switch (state.currentStep) {
    case "select":
      return state.selectedFile !== null;
    case "upload":
      return !state.isUploading && state.uploadProgress === 100;
    case "parse":
      return !state.isParsing && state.parsedSheets.length > 0;
    case "schema":
      return !state.isInferringSchema && state.detectedSchema !== null;
    case "mapping":
      return (
        state.mappings.length > 0 &&
        state.mappings.some(
          (m) => m.targetField === "front" || m.targetField === "back",
        )
      );
    case "preview":
      return !state.isGeneratingPreview && state.previewCards.length > 0;
    case "import":
      return !state.isImporting;
    case "complete":
      return true;
    default:
      return false;
  }
};
