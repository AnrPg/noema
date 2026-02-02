// =============================================================================
// IMPORT WIZARD - MAIN SCREEN
// =============================================================================

import React, { useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "@/theme/ThemeProvider";
import {
  useImportStore,
  useCurrentStep,
  useCanProceed,
  type ImportStep,
} from "@/stores/import.store";
import {
  StepIndicator,
  FileSelector,
  SheetSelector,
  FieldMappingEditor,
  PreviewCards,
  ImportSummary,
  DeckSelector,
} from "@/components/import";
import { pickFile, useParseFileLocally } from "@/services/import.service";
import { useCreateDeck, useBulkCreateCards } from "@/services/api";

// =============================================================================
// STEP CONFIGURATION
// =============================================================================

const STEPS: Array<{ key: ImportStep; label: string }> = [
  { key: "select", label: "Select" },
  { key: "parse", label: "Parse" },
  { key: "mapping", label: "Mapping" },
  { key: "preview", label: "Preview" },
  { key: "import", label: "Deck" },
  { key: "complete", label: "Import" },
];

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function ImportWizardScreen() {
  const colors = useColors();
  const currentStep = useCurrentStep();
  const canProceed = useCanProceed();
  const store = useImportStore();

  // React Query mutations
  const parseFileMutation = useParseFileLocally();
  const createDeckMutation = useCreateDeck();
  const bulkCreateCardsMutation = useBulkCreateCards();

  // Reset on mount
  useEffect(() => {
    store.reset();
    store.loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle file selection
  const handleSelectFile = useCallback(async () => {
    try {
      const file = await pickFile();
      if (file) {
        store.setSelectedFile(file);
        store.setParseError(null);
      }
    } catch {
      Alert.alert("Error", "Failed to select file. Please try again.");
    }
  }, [store]);

  const handleRemoveFile = useCallback(() => {
    store.setSelectedFile(null);
    store.setParseError(null);
  }, [store]);

  // Handle proceed to parse
  const handleProceedToParse = useCallback(() => {
    const file = store.selectedFile;
    if (!file) return;

    store.nextStep();
    parseFileMutation.mutate(file);
  }, [store, parseFileMutation]);

  // Handle sheet selection and schema analysis
  const handleSheetSelected = useCallback(
    (sheetId: string) => {
      store.setSelectedSheet(sheetId);
    },
    [store],
  );

  // Handle proceed to mapping (combines schema analysis)
  const handleProceedToMapping = useCallback(() => {
    const { selectedSheetId, parsedSheets } = store;
    if (!selectedSheetId) return;

    const sheet = parsedSheets.find((s) => s.id === selectedSheetId);
    if (!sheet) return;

    // Auto-suggest mappings based on column names
    const columns = sheet.columns.map((c) => ({
      name: c.name,
      index: c.index,
      inferredType: c.inferredType,
      sampleValues: c.sampleValues,
    }));

    const suggestedMappings = suggestMappings(columns);
    store.setSuggestedMappings(suggestedMappings);

    // Apply suggested mappings as initial mappings
    if (store.mappings.length === 0 && suggestedMappings.length > 0) {
      store.setMappings(suggestedMappings);
    }

    store.nextStep();
  }, [store]);

  // Handle update mappings
  const handleUpdateMappings = useCallback(
    (mappings: Array<{ sourceColumn: string; targetField: string }>) => {
      store.setMappings(mappings);
    },
    [store],
  );

  // Handle proceed to preview
  const handleProceedToPreview = useCallback(() => {
    store.nextStep();

    // Generate preview cards from mappings
    store.setIsGeneratingPreview(true);
    try {
      const { parsedSheets, selectedSheetId, mappings } = store;
      const sheet = parsedSheets.find((s) => s.id === selectedSheetId);
      if (!sheet) throw new Error("Sheet not found");

      // Generate preview cards locally
      const previewCards = generateLocalPreview(sheet, mappings);
      store.setPreviewCards(previewCards);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to generate preview";
      store.setPreviewError(errorMessage);
    } finally {
      store.setIsGeneratingPreview(false);
    }
  }, [store]);

  // Handle proceed to deck selection
  const handleProceedToDeckSelection = useCallback(() => {
    store.nextStep();
  }, [store]);

  // Handle deck selection
  const handleSelectDeck = useCallback(
    (deckId: string | null) => {
      store.setTargetDeckId(deckId);
    },
    [store],
  );

  const handleToggleCreateNewDeck = useCallback(
    (create: boolean) => {
      store.setCreateNewDeck(create);
    },
    [store],
  );

  const handleNewDeckNameChange = useCallback(
    (name: string) => {
      store.setNewDeckName(name);
    },
    [store],
  );

  // Handle duplicate strategy change
  const handleDuplicateStrategyChange = useCallback(
    (strategy: "skip" | "update" | "create_anyway") => {
      store.setDuplicateStrategy(strategy);
    },
    [store],
  );

  // Handle execute import
  const handleExecuteImport = useCallback(async () => {
    store.setIsImporting(true);
    store.setImportProgress({
      phase: "preparing",
      current: 0,
      total: 100,
      message: "Preparing import...",
    });

    try {
      let targetDeckId = store.targetDeckId;

      // Step 1: Create new deck if needed
      if (store.createNewDeck) {
        store.setImportProgress({
          phase: "creating_deck",
          current: 10,
          total: 100,
          message: "Creating new deck...",
        });

        const newDeckResponse = await createDeckMutation.mutateAsync({
          name: store.newDeckName || "Imported Cards",
          description: `Imported from ${store.selectedFile?.name || "file"}`,
        });

        targetDeckId = (newDeckResponse.data as { id: string }).id;
        store.setTargetDeckId(targetDeckId);
      }

      if (!targetDeckId) {
        throw new Error("No deck selected for import");
      }

      // Step 2: Prepare cards for import
      store.setImportProgress({
        phase: "preparing_cards",
        current: 20,
        total: 100,
        message: "Preparing cards...",
      });

      const validCards = store.previewCards.filter((c) => !c.hasIssues);

      // Convert preview cards to API format
      const cardsToCreate = validCards.map((card) => ({
        cardType: "basic",
        content: {
          front: { text: card.front },
          back: { text: card.back },
        },
        tags: card.tags,
        source: `Imported from ${store.selectedFile?.name || "file"}`,
      }));

      // Step 3: Bulk create cards
      store.setImportProgress({
        phase: "importing",
        current: 40,
        total: 100,
        message: `Importing ${cardsToCreate.length} cards...`,
      });

      const result = await bulkCreateCardsMutation.mutateAsync({
        deckId: targetDeckId,
        cards: cardsToCreate,
        duplicateStrategy: store.duplicateStrategy,
      });

      store.setImportProgress({
        phase: "finalizing",
        current: 90,
        total: 100,
        message: "Finalizing import...",
      });

      const cardsFailed = store.previewCards.filter((c) => c.hasIssues).length;

      store.setImportResult({
        success: true,
        cardsCreated: result.created,
        cardsSkipped: result.skipped,
        cardsFailed,
        cardsUpdated: result.updated,
        duplicatesSkipped: result.skipped,
        errors: [],
        warnings: [],
      });

      // Add to history
      store.addToHistory({
        id: Date.now().toString(),
        filename: store.selectedFile?.name || "Unknown",
        cardCount: result.created,
        timestamp: new Date().toISOString(),
        deckId: targetDeckId,
      });

      store.nextStep();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Import failed";
      store.setImportResult({
        success: false,
        cardsCreated: 0,
        cardsSkipped: 0,
        cardsFailed: store.previewCards.length,
        cardsUpdated: 0,
        duplicatesSkipped: 0,
        errors: [errorMessage],
        warnings: [],
      });
    } finally {
      store.setIsImporting(false);
      store.setImportProgress(null);
    }
  }, [store, createDeckMutation, bulkCreateCardsMutation]);

  // Handle done
  const handleDone = useCallback(() => {
    store.reset();
    router.back();
  }, [store]);

  // Handle view cards
  const handleViewCards = useCallback(() => {
    const deckId = store.targetDeckId || "default";
    store.reset();
    router.replace(`/deck/${deckId}`);
  }, [store]);

  // Get current step index
  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep);

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case "select":
        return (
          <View style={styles.stepContent}>
            <FileSelector
              selectedFile={store.selectedFile}
              onSelectFile={handleSelectFile}
              onRemoveFile={handleRemoveFile}
              error={store.parseError}
            />
          </View>
        );

      case "upload":
      case "parse":
        return (
          <View style={styles.stepContent}>
            {store.isParsing ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.text }]}>
                  Parsing file...
                </Text>
              </View>
            ) : store.parseError ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={48} color={colors.error} />
                <Text style={[styles.errorText, { color: colors.error }]}>
                  {store.parseError}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.retryButton,
                    { backgroundColor: colors.primary },
                  ]}
                  onPress={() => store.prevStep()}
                >
                  <Text style={styles.retryButtonText}>Try Again</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <SheetSelector
                sheets={store.parsedSheets}
                selectedSheetId={store.selectedSheetId}
                onSelectSheet={handleSheetSelected}
              />
            )}
          </View>
        );

      case "mapping": {
        const selectedSheet = store.parsedSheets.find(
          (s) => s.id === store.selectedSheetId,
        );
        return (
          <View style={styles.stepContent}>
            {selectedSheet && (
              <FieldMappingEditor
                sheet={selectedSheet}
                mappings={store.mappings}
                suggestedMappings={store.suggestedMappings}
                onUpdateMappings={handleUpdateMappings}
              />
            )}
          </View>
        );
      }

      case "preview":
        return (
          <View style={styles.stepContent}>
            {store.isGeneratingPreview ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.text }]}>
                  Generating preview...
                </Text>
              </View>
            ) : (
              <PreviewCards
                cards={store.previewCards}
                totalCards={store.previewCards.length}
              />
            )}
          </View>
        );

      case "import":
        return (
          <View style={styles.stepContent}>
            {store.isImporting ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.text }]}>
                  {store.importProgress?.message || "Importing..."}
                </Text>
                {store.importProgress && (
                  <View
                    style={[
                      styles.progressBar,
                      { backgroundColor: colors.border },
                    ]}
                  >
                    <View
                      style={[
                        styles.progressFill,
                        {
                          backgroundColor: colors.primary,
                          width: `${(store.importProgress.current / store.importProgress.total) * 100}%`,
                        },
                      ]}
                    />
                  </View>
                )}
              </View>
            ) : (
              <DeckSelector
                selectedDeckId={store.targetDeckId}
                createNewDeck={store.createNewDeck}
                newDeckName={store.newDeckName}
                duplicateStrategy={store.duplicateStrategy}
                onSelectDeck={handleSelectDeck}
                onToggleCreateNew={handleToggleCreateNewDeck}
                onNewDeckNameChange={handleNewDeckNameChange}
                onDuplicateStrategyChange={handleDuplicateStrategyChange}
              />
            )}
          </View>
        );

      case "complete":
        return (
          <View style={styles.stepContent}>
            <ImportSummary
              importResult={store.importResult}
              onViewCards={handleViewCards}
              onDone={handleDone}
            />
          </View>
        );

      default:
        return null;
    }
  };

  // Check if can proceed to import
  const canProceedToImport = store.createNewDeck
    ? store.newDeckName.trim().length > 0
    : store.targetDeckId !== null;

  // Get next action based on current step
  const getNextAction = (): {
    label: string;
    handler: () => void;
    disabled?: boolean;
  } | null => {
    switch (currentStep) {
      case "select":
        return { label: "Parse File", handler: handleProceedToParse };
      case "parse":
        return { label: "Configure Mapping", handler: handleProceedToMapping };
      case "mapping":
        return { label: "Preview Cards", handler: handleProceedToPreview };
      case "preview":
        return { label: "Select Deck", handler: handleProceedToDeckSelection };
      case "import":
        return {
          label: "Import Cards",
          handler: handleExecuteImport,
          disabled: !canProceedToImport || store.isImporting,
        };
      case "complete":
        return null;
      default:
        return null;
    }
  };

  const nextAction = getNextAction();
  const canGoBack = currentStepIndex > 0 && currentStep !== "complete";

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            onPress={() =>
              currentStep === "select" ? router.back() : store.prevStep()
            }
            style={styles.headerButton}
          >
            <Ionicons
              name={currentStep === "select" ? "close" : "arrow-back"}
              size={24}
              color={colors.text}
            />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Import Cards
          </Text>
          <View style={styles.headerButton} />
        </View>

        {/* Step Indicator */}
        <StepIndicator
          steps={STEPS.map((s) => ({ label: s.label }))}
          currentStep={currentStepIndex}
        />

        {/* Content */}
        <View style={styles.content}>{renderStepContent()}</View>

        {/* Footer */}
        {nextAction && (
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            {canGoBack && (
              <TouchableOpacity
                onPress={() => store.prevStep()}
                disabled={store.isImporting}
                style={[
                  styles.footerButton,
                  styles.secondaryButton,
                  { borderColor: colors.border },
                ]}
              >
                <Ionicons name="arrow-back" size={18} color={colors.text} />
                <Text style={[styles.footerButtonText, { color: colors.text }]}>
                  Back
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={nextAction.handler}
              disabled={!canProceed || nextAction.disabled}
              style={[
                styles.footerButton,
                styles.primaryButton,
                {
                  backgroundColor:
                    canProceed && !nextAction.disabled
                      ? colors.primary
                      : colors.primaryLight,
                  flex: canGoBack ? 1 : undefined,
                },
                !canGoBack && styles.fullWidthButton,
              ]}
            >
              <Text
                style={[
                  styles.footerButtonText,
                  {
                    color: "#fff",
                    opacity: canProceed && !nextAction.disabled ? 1 : 0.5,
                  },
                ]}
              >
                {nextAction.label}
              </Text>
              <Ionicons
                name="arrow-forward"
                size={18}
                color="#fff"
                style={{
                  opacity: canProceed && !nextAction.disabled ? 1 : 0.5,
                }}
              />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Suggest field mappings based on column names
 */
function suggestMappings(
  columns: Array<{ name: string; index: number; inferredType: string }>,
): Array<{ sourceColumn: string; targetField: string }> {
  const mappings: Array<{ sourceColumn: string; targetField: string }> = [];

  const frontPatterns = [
    /^(front|question|q|term|prompt|cue|stimulus)$/i,
    /front|question/i,
  ];
  const backPatterns = [
    /^(back|answer|a|definition|response|target)$/i,
    /back|answer|definition/i,
  ];
  const tagPatterns = [/^(tags?|labels?|categories?|topics?)$/i];
  const notePatterns = [/^(notes?|comments?|remarks?)$/i];
  const hintPatterns = [/^(hints?|clues?|tips?)$/i];

  for (const col of columns) {
    if (frontPatterns.some((p) => p.test(col.name))) {
      mappings.push({ sourceColumn: col.name, targetField: "front" });
    } else if (backPatterns.some((p) => p.test(col.name))) {
      mappings.push({ sourceColumn: col.name, targetField: "back" });
    } else if (tagPatterns.some((p) => p.test(col.name))) {
      mappings.push({ sourceColumn: col.name, targetField: "tags" });
    } else if (notePatterns.some((p) => p.test(col.name))) {
      mappings.push({ sourceColumn: col.name, targetField: "notes" });
    } else if (hintPatterns.some((p) => p.test(col.name))) {
      mappings.push({ sourceColumn: col.name, targetField: "hint" });
    }
  }

  // If no front/back found, use first two columns
  if (!mappings.some((m) => m.targetField === "front") && columns.length >= 1) {
    mappings.push({ sourceColumn: columns[0].name, targetField: "front" });
  }
  if (!mappings.some((m) => m.targetField === "back") && columns.length >= 2) {
    mappings.push({ sourceColumn: columns[1].name, targetField: "back" });
  }

  return mappings;
}

/**
 * Generate preview cards locally from sheet data and mappings
 */
function generateLocalPreview(
  sheet: {
    sampleRows: Array<Record<string, unknown>>;
    columns: Array<{ name: string }>;
  },
  mappings: Array<{ sourceColumn: string; targetField: string }>,
): Array<{
  id: string;
  front: string;
  back: string;
  tags: string[];
  hasIssues: boolean;
  issues: string[];
}> {
  const frontMapping = mappings.find((m) => m.targetField === "front");
  const backMapping = mappings.find((m) => m.targetField === "back");
  const tagsMapping = mappings.find((m) => m.targetField === "tags");

  return (sheet.sampleRows || []).slice(0, 10).map((row, index) => {
    const issues: string[] = [];
    const front = frontMapping
      ? String(row[frontMapping.sourceColumn] || "")
      : "";
    const back = backMapping ? String(row[backMapping.sourceColumn] || "") : "";
    const tagsRaw = tagsMapping ? row[tagsMapping.sourceColumn] : "";
    const tags = tagsRaw
      ? String(tagsRaw)
          .split(/[,;]/)
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    if (!front.trim()) {
      issues.push("Front side is empty");
    }
    if (!back.trim()) {
      issues.push("Back side is empty");
    }

    return {
      id: `preview-${index}`,
      front,
      back,
      tags,
      hasIssues: issues.length > 0,
      issues,
    };
  });
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  stepContent: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  schemaContent: {
    flex: 1,
    padding: 16,
  },
  schemaTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  schemaSubtitle: {
    fontSize: 14,
    marginBottom: 16,
  },
  schemaColumn: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  columnName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  columnType: {
    fontSize: 13,
    marginBottom: 4,
  },
  progressBar: {
    width: "80%",
    height: 6,
    borderRadius: 3,
    marginTop: 16,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  footer: {
    flexDirection: "row",
    padding: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  footerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  primaryButton: {},
  secondaryButton: {
    borderWidth: 1,
  },
  fullWidthButton: {
    flex: 1,
  },
  footerButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
