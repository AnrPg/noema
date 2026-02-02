/**
 * BridgeCardCreator Component
 *
 * A wizard-style interface for creating bridge cards that connect
 * concepts across multiple categories/domains.
 *
 * Features:
 * - Multi-step wizard flow
 * - Category/card selection
 * - Connection type selector
 * - AI suggestion integration
 * - Preview before creation
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  useCreateBridgeCard,
  useBridgeCardSuggestions,
  useAcceptBridgeSuggestion,
  type BridgeCardSuggestion,
  type BridgeCard,
} from "@/services/api";

type IconName = keyof typeof Ionicons.glyphMap;

// Connection types with visual configs
const CONNECTION_TYPES = [
  {
    type: "CONCEPTUAL_SIMILARITY",
    icon: "copy",
    color: "#3498DB",
    label: "Similar Concepts",
    description: "Ideas that share fundamental principles",
  },
  {
    type: "CAUSAL_RELATIONSHIP",
    icon: "arrow-forward",
    color: "#E74C3C",
    label: "Cause & Effect",
    description: "One concept leads to or causes another",
  },
  {
    type: "HIERARCHICAL",
    icon: "git-branch",
    color: "#9B59B6",
    label: "Hierarchical",
    description: "Parent-child or general-specific relationships",
  },
  {
    type: "ANALOGICAL",
    icon: "swap-horizontal",
    color: "#F39C12",
    label: "Analogical",
    description: "Concepts that work similarly in different domains",
  },
  {
    type: "CONTRASTING",
    icon: "git-compare",
    color: "#E67E22",
    label: "Contrasting",
    description: "Opposites or concepts that differ meaningfully",
  },
  {
    type: "APPLICATION",
    icon: "construct",
    color: "#27AE60",
    label: "Application",
    description: "Theory applied to practice in different domains",
  },
  {
    type: "SYNTHESIS",
    icon: "git-network",
    color: "#8E44AD",
    label: "Synthesis",
    description: "Combined concepts that create new understanding",
  },
  {
    type: "PREREQUISITE",
    icon: "arrow-back",
    color: "#95A5A6",
    label: "Prerequisite",
    description: "One concept must be understood before another",
  },
  {
    type: "EXTENSION",
    icon: "arrow-forward",
    color: "#1ABC9C",
    label: "Extension",
    description: "One concept extends or builds upon another",
  },
] as const;

type ConnectionType = (typeof CONNECTION_TYPES)[number]["type"];

interface Category {
  id: string;
  name: string;
  cardCount?: number;
}

interface Card {
  id: string;
  front: string;
  back?: string;
}

interface SelectedSource {
  categoryId: string;
  categoryName: string;
  cardId?: string;
  cardQuestion?: string;
  context?: string;
}

interface BridgeCardCreatorProps {
  userId: string;
  availableCategories: Category[];
  onLoadCategoryCards?: (categoryId: string) => Promise<Card[]>;
  onBridgeCardCreated?: (bridgeCard: BridgeCard) => void;
  onClose?: () => void;
  initialSuggestion?: BridgeCardSuggestion;
}

type WizardStep = "sources" | "connection" | "content" | "preview";

export function BridgeCardCreator({
  userId,
  availableCategories,
  onLoadCategoryCards,
  onBridgeCardCreated,
  onClose,
  initialSuggestion,
}: BridgeCardCreatorProps) {
  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>("sources");
  const [selectedSources, setSelectedSources] = useState<SelectedSource[]>([]);
  const [connectionType, setConnectionType] = useState<ConnectionType | null>(
    null,
  );
  const [bridgeQuestion, setBridgeQuestion] = useState("");
  const [bridgeAnswer, setBridgeAnswer] = useState("");
  const [connectionStrength, setConnectionStrength] = useState(0.7);

  // UI state
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showCardPicker, setShowCardPicker] = useState(false);
  const [editingSourceIndex, setEditingSourceIndex] = useState<number | null>(
    null,
  );
  const [categoryCards, setCategoryCards] = useState<Card[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);

  // API hooks
  const createBridgeCard = useCreateBridgeCard();
  const { data: suggestions, isLoading: loadingSuggestions } =
    useBridgeCardSuggestions(userId, {
      enabled: currentStep === "sources" && selectedSources.length === 0,
    });
  const acceptSuggestion = useAcceptBridgeSuggestion();

  // Initialize from suggestion if provided
  useEffect(() => {
    if (initialSuggestion) {
      // Pre-populate from suggestion - handle both property naming conventions
      const question =
        initialSuggestion.suggestedBridgeQuestion ||
        initialSuggestion.suggestedQuestion ||
        "";
      const answer =
        initialSuggestion.suggestedBridgeAnswer ||
        initialSuggestion.suggestedAnswer ||
        "";
      const confidence =
        initialSuggestion.confidence ??
        initialSuggestion.confidenceScore ??
        0.7;
      const categoryIds =
        initialSuggestion.sourceCategoryIds ||
        initialSuggestion.suggestedCategoryIds ||
        [];

      setBridgeQuestion(question);
      setBridgeAnswer(answer);
      setConnectionType(
        (initialSuggestion.suggestedConnectionType as ConnectionType) || null,
      );
      setConnectionStrength(confidence);

      // Set up sources from suggestion
      const sources: SelectedSource[] = [];
      if (categoryIds.length > 0) {
        categoryIds.forEach((catId: string) => {
          const cat = availableCategories.find((c) => c.id === catId);
          if (cat) {
            sources.push({
              categoryId: catId,
              categoryName: cat.name,
            });
          }
        });
      }
      if (sources.length > 0) {
        setSelectedSources(sources);
      }
    }
  }, [initialSuggestion, availableCategories]);

  // Load cards for a category
  const loadCardsForCategory = useCallback(
    async (categoryId: string) => {
      if (!onLoadCategoryCards) return;

      setLoadingCards(true);
      try {
        const cards = await onLoadCategoryCards(categoryId);
        setCategoryCards(cards);
      } catch (error) {
        console.error("Failed to load cards:", error);
        setCategoryCards([]);
      } finally {
        setLoadingCards(false);
      }
    },
    [onLoadCategoryCards],
  );

  // Add a source category
  const handleAddSource = useCallback((category: Category) => {
    setSelectedSources((prev) => [
      ...prev,
      {
        categoryId: category.id,
        categoryName: category.name,
      },
    ]);
    setShowCategoryPicker(false);
  }, []);

  // Remove a source
  const handleRemoveSource = useCallback((index: number) => {
    setSelectedSources((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Select a card for a source
  const handleSelectCard = useCallback(
    (card: Card) => {
      if (editingSourceIndex === null) return;

      setSelectedSources((prev) =>
        prev.map((source, index) =>
          index === editingSourceIndex
            ? { ...source, cardId: card.id, cardQuestion: card.front }
            : source,
        ),
      );
      setShowCardPicker(false);
      setEditingSourceIndex(null);
    },
    [editingSourceIndex],
  );

  // Update source context
  const handleUpdateContext = useCallback((index: number, context: string) => {
    setSelectedSources((prev) =>
      prev.map((source, i) => (i === index ? { ...source, context } : source)),
    );
  }, []);

  // Accept an AI suggestion
  const handleAcceptSuggestion = useCallback(
    async (suggestion: BridgeCardSuggestion) => {
      try {
        const response = await acceptSuggestion.mutateAsync({
          suggestionId: suggestion.id,
        });

        // Extract data from response (handle both direct data and AxiosResponse)
        const result =
          (response as { data?: BridgeCard })?.data ??
          (response as unknown as BridgeCard);
        onBridgeCardCreated?.(result);
        onClose?.();
      } catch (error) {
        console.error("Failed to accept suggestion:", error);
      }
    },
    [acceptSuggestion, onBridgeCardCreated, onClose],
  );

  // Navigate steps
  const canProceedToConnection = selectedSources.length >= 2;
  const canProceedToContent = connectionType !== null;
  const canProceedToPreview =
    bridgeQuestion.trim().length > 0 && bridgeAnswer.trim().length > 0;
  const canCreate = canProceedToPreview;

  const handleNext = useCallback(() => {
    switch (currentStep) {
      case "sources":
        if (canProceedToConnection) setCurrentStep("connection");
        break;
      case "connection":
        if (canProceedToContent) setCurrentStep("content");
        break;
      case "content":
        if (canProceedToPreview) setCurrentStep("preview");
        break;
    }
  }, [
    currentStep,
    canProceedToConnection,
    canProceedToContent,
    canProceedToPreview,
  ]);

  const handleBack = useCallback(() => {
    switch (currentStep) {
      case "connection":
        setCurrentStep("sources");
        break;
      case "content":
        setCurrentStep("connection");
        break;
      case "preview":
        setCurrentStep("content");
        break;
    }
  }, [currentStep]);

  // Create the bridge card
  const handleCreate = useCallback(async () => {
    if (!canCreate || !connectionType) return;

    try {
      const response = await createBridgeCard.mutateAsync({
        bridgeQuestion,
        bridgeAnswer,
        connectionType,
        connectionStrength,
        sourceCardIds: selectedSources
          .filter((s) => s.cardId)
          .map((s) => s.cardId!),
        categoryIds: selectedSources.map((s) => s.categoryId),
        contexts: selectedSources.reduce(
          (acc, s, _i) => {
            if (s.context) {
              acc[s.categoryId] = s.context;
            }
            return acc;
          },
          {} as Record<string, string>,
        ),
      });

      // Extract data from response (handle both direct data and AxiosResponse)
      const result =
        (response as { data?: BridgeCard })?.data ??
        (response as unknown as BridgeCard);
      onBridgeCardCreated?.(result);
      onClose?.();
    } catch (error) {
      console.error("Failed to create bridge card:", error);
    }
  }, [
    canCreate,
    connectionType,
    bridgeQuestion,
    bridgeAnswer,
    connectionStrength,
    selectedSources,
    createBridgeCard,
    onBridgeCardCreated,
    onClose,
  ]);

  // Render step indicator
  const renderStepIndicator = () => {
    const steps = [
      { key: "sources", label: "Sources" },
      { key: "connection", label: "Connection" },
      { key: "content", label: "Content" },
      { key: "preview", label: "Preview" },
    ];

    const currentIndex = steps.findIndex((s) => s.key === currentStep);

    return (
      <View style={styles.stepIndicator}>
        {steps.map((step, index) => (
          <React.Fragment key={step.key}>
            <View
              style={[
                styles.stepDot,
                index <= currentIndex && styles.stepDotActive,
              ]}
            >
              {index < currentIndex ? (
                <Ionicons name="checkmark" size={12} color="#FFF" />
              ) : (
                <Text
                  style={[
                    styles.stepDotText,
                    index <= currentIndex && styles.stepDotTextActive,
                  ]}
                >
                  {index + 1}
                </Text>
              )}
            </View>
            {index < steps.length - 1 && (
              <View
                style={[
                  styles.stepLine,
                  index < currentIndex && styles.stepLineActive,
                ]}
              />
            )}
          </React.Fragment>
        ))}
      </View>
    );
  };

  // Render sources step
  const renderSourcesStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Select Source Domains</Text>
      <Text style={styles.stepDescription}>
        Choose at least two categories/domains to connect. You can optionally
        select specific cards from each.
      </Text>

      {/* AI Suggestions */}
      {suggestions &&
        Array.isArray(suggestions) &&
        suggestions.length > 0 &&
        selectedSources.length === 0 && (
          <View style={styles.suggestionsSection}>
            <View style={styles.sectionHeader}>
              <Ionicons name="sparkles" size={20} color="#8E44AD" />
              <Text style={styles.sectionTitle}>AI Suggestions</Text>
            </View>

            {loadingSuggestions ? (
              <ActivityIndicator size="small" color="#8E44AD" />
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.suggestionsScroll}
              >
                {suggestions
                  .slice(0, 3)
                  .map((suggestion: BridgeCardSuggestion) => (
                    <TouchableOpacity
                      key={suggestion.id}
                      style={styles.suggestionCard}
                      onPress={() => handleAcceptSuggestion(suggestion)}
                    >
                      <View style={styles.suggestionHeader}>
                        <Ionicons name="bulb" size={16} color="#F39C12" />
                        <Text style={styles.suggestionConfidence}>
                          {Math.round(
                            (suggestion.confidence ??
                              suggestion.confidenceScore) * 100,
                          )}
                          % match
                        </Text>
                      </View>
                      <Text style={styles.suggestionText} numberOfLines={2}>
                        {suggestion.suggestedBridgeQuestion ||
                          suggestion.suggestedQuestion}
                      </Text>
                      <Text style={styles.useSuggestionText}>
                        Tap to use this suggestion
                      </Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            )}
          </View>
        )}

      {/* Selected Sources */}
      <View style={styles.selectedSources}>
        {selectedSources.map((source, index) => (
          <View key={`${source.categoryId}-${index}`} style={styles.sourceItem}>
            <View style={styles.sourceHeader}>
              <View style={styles.sourceInfo}>
                <Ionicons name="folder" size={20} color="#3498DB" />
                <Text style={styles.sourceName}>{source.categoryName}</Text>
              </View>
              <TouchableOpacity
                onPress={() => handleRemoveSource(index)}
                style={styles.removeButton}
              >
                <Ionicons name="close-circle" size={20} color="#E74C3C" />
              </TouchableOpacity>
            </View>

            {source.cardId ? (
              <View style={styles.selectedCard}>
                <Ionicons name="card" size={14} color="#666" />
                <Text style={styles.selectedCardText} numberOfLines={1}>
                  {source.cardQuestion}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.selectCardButton}
                onPress={async () => {
                  setEditingSourceIndex(index);
                  await loadCardsForCategory(source.categoryId);
                  setShowCardPicker(true);
                }}
              >
                <Ionicons name="add-circle" size={14} color="#3498DB" />
                <Text style={styles.selectCardButtonText}>
                  Select specific card (optional)
                </Text>
              </TouchableOpacity>
            )}

            <TextInput
              style={styles.contextInput}
              placeholder="Add context for this domain..."
              value={source.context || ""}
              onChangeText={(text) => handleUpdateContext(index, text)}
              multiline
            />
          </View>
        ))}

        <TouchableOpacity
          style={styles.addSourceButton}
          onPress={() => setShowCategoryPicker(true)}
        >
          <Ionicons name="add" size={24} color="#3498DB" />
          <Text style={styles.addSourceText}>Add Domain</Text>
        </TouchableOpacity>
      </View>

      {selectedSources.length < 2 && (
        <Text style={styles.hintText}>
          Add at least {2 - selectedSources.length} more domain
          {2 - selectedSources.length !== 1 ? "s" : ""} to continue
        </Text>
      )}
    </View>
  );

  // Render connection type step
  const renderConnectionStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Select Connection Type</Text>
      <Text style={styles.stepDescription}>
        How are these domains related? This helps structure the bridge card.
      </Text>

      <View style={styles.connectionGrid}>
        {CONNECTION_TYPES.map((conn) => (
          <TouchableOpacity
            key={conn.type}
            style={[
              styles.connectionOption,
              connectionType === conn.type && styles.connectionOptionSelected,
              { borderColor: conn.color },
            ]}
            onPress={() => setConnectionType(conn.type)}
          >
            <View
              style={[
                styles.connectionIcon,
                { backgroundColor: conn.color },
                connectionType === conn.type && styles.connectionIconSelected,
              ]}
            >
              <Ionicons name={conn.icon as IconName} size={20} color="#FFF" />
            </View>
            <Text
              style={[
                styles.connectionLabel,
                connectionType === conn.type && { color: conn.color },
              ]}
            >
              {conn.label}
            </Text>
            <Text style={styles.connectionDescription}>{conn.description}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // Render content step
  const renderContentStep = () => {
    const selectedConnection = CONNECTION_TYPES.find(
      (c) => c.type === connectionType,
    );

    return (
      <KeyboardAvoidingView
        style={styles.stepContent}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Text style={styles.stepTitle}>Create Bridge Content</Text>
        <Text style={styles.stepDescription}>
          Write a question that connects these domains and an answer that
          explains the connection.
        </Text>

        {selectedConnection && (
          <View
            style={[
              styles.connectionBadge,
              { backgroundColor: selectedConnection.color + "20" },
            ]}
          >
            <Ionicons
              name={selectedConnection.icon as IconName}
              size={16}
              color={selectedConnection.color}
            />
            <Text
              style={[
                styles.connectionBadgeText,
                { color: selectedConnection.color },
              ]}
            >
              {selectedConnection.label}
            </Text>
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Bridge Question</Text>
          <TextInput
            style={styles.questionInput}
            placeholder="What question connects these domains? E.g., 'How does the concept of X in Domain A relate to Y in Domain B?'"
            value={bridgeQuestion}
            onChangeText={setBridgeQuestion}
            multiline
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>
            {bridgeQuestion.length} characters
          </Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Bridge Answer</Text>
          <TextInput
            style={styles.answerInput}
            placeholder="Explain the connection between these concepts..."
            value={bridgeAnswer}
            onChangeText={setBridgeAnswer}
            multiline
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{bridgeAnswer.length} characters</Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>
            Connection Strength: {Math.round(connectionStrength * 100)}%
          </Text>
          <View style={styles.strengthSlider}>
            {[0.3, 0.5, 0.7, 0.85, 1.0].map((value) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.strengthOption,
                  connectionStrength === value && styles.strengthOptionSelected,
                ]}
                onPress={() => setConnectionStrength(value)}
              >
                <Text
                  style={[
                    styles.strengthOptionText,
                    connectionStrength === value &&
                      styles.strengthOptionTextSelected,
                  ]}
                >
                  {Math.round(value * 100)}%
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  };

  // Render preview step
  const renderPreviewStep = () => {
    const selectedConnection = CONNECTION_TYPES.find(
      (c) => c.type === connectionType,
    );

    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Preview Bridge Card</Text>
        <Text style={styles.stepDescription}>
          Review your bridge card before creating it.
        </Text>

        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            {selectedConnection && (
              <View
                style={[
                  styles.previewConnectionIcon,
                  { backgroundColor: selectedConnection.color },
                ]}
              >
                <Ionicons
                  name={selectedConnection.icon as IconName}
                  size={24}
                  color="#FFF"
                />
              </View>
            )}
            <View style={styles.previewHeaderText}>
              <Text style={styles.previewConnectionType}>
                {selectedConnection?.label || "Connection"}
              </Text>
              <Text style={styles.previewStrength}>
                {Math.round(connectionStrength * 100)}% strength
              </Text>
            </View>
          </View>

          <View style={styles.previewDomains}>
            {selectedSources.map((source) => (
              <View key={source.categoryId} style={styles.previewDomain}>
                <Ionicons name="folder" size={16} color="#666" />
                <Text style={styles.previewDomainText}>
                  {source.categoryName}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.previewQuestion}>
            <Text style={styles.previewLabel}>Question</Text>
            <Text style={styles.previewQuestionText}>{bridgeQuestion}</Text>
          </View>

          <View style={styles.previewAnswer}>
            <Text style={styles.previewLabel}>Answer</Text>
            <Text style={styles.previewAnswerText}>{bridgeAnswer}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.headerButton}>
          <Ionicons name="close" size={24} color="#666" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Bridge Card</Text>
        <View style={styles.headerButton} />
      </View>

      {/* Step Indicator */}
      {renderStepIndicator()}

      {/* Step Content */}
      <ScrollView
        style={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {currentStep === "sources" && renderSourcesStep()}
        {currentStep === "connection" && renderConnectionStep()}
        {currentStep === "content" && renderContentStep()}
        {currentStep === "preview" && renderPreviewStep()}
      </ScrollView>

      {/* Navigation Buttons */}
      <View style={styles.navigation}>
        {currentStep !== "sources" && (
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={20} color="#666" />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        )}

        <View style={styles.navigationSpacer} />

        {currentStep !== "preview" ? (
          <TouchableOpacity
            style={[
              styles.nextButton,
              ((currentStep === "sources" && !canProceedToConnection) ||
                (currentStep === "connection" && !canProceedToContent) ||
                (currentStep === "content" && !canProceedToPreview)) &&
                styles.nextButtonDisabled,
            ]}
            onPress={handleNext}
            disabled={
              (currentStep === "sources" && !canProceedToConnection) ||
              (currentStep === "connection" && !canProceedToContent) ||
              (currentStep === "content" && !canProceedToPreview)
            }
          >
            <Text style={styles.nextButtonText}>Next</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFF" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.createButton,
              createBridgeCard.isPending && styles.createButtonDisabled,
            ]}
            onPress={handleCreate}
            disabled={createBridgeCard.isPending}
          >
            {createBridgeCard.isPending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color="#FFF" />
                <Text style={styles.createButtonText}>Create Bridge Card</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Category Picker Modal */}
      <Modal
        visible={showCategoryPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCategoryPicker(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Category</Text>
            <TouchableOpacity onPress={() => setShowCategoryPicker(false)}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={availableCategories.filter(
              (cat) => !selectedSources.find((s) => s.categoryId === cat.id),
            )}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.categoryItem}
                onPress={() => handleAddSource(item)}
              >
                <Ionicons name="folder" size={24} color="#3498DB" />
                <View style={styles.categoryItemInfo}>
                  <Text style={styles.categoryItemName}>{item.name}</Text>
                  {item.cardCount !== undefined && (
                    <Text style={styles.categoryItemCount}>
                      {item.cardCount} cards
                    </Text>
                  )}
                </View>
                <Ionicons name="add-circle" size={24} color="#27AE60" />
              </TouchableOpacity>
            )}
            ListEmptyComponent={() => (
              <View style={styles.emptyList}>
                <Text style={styles.emptyListText}>
                  No more categories available
                </Text>
              </View>
            )}
          />
        </View>
      </Modal>

      {/* Card Picker Modal */}
      <Modal
        visible={showCardPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowCardPicker(false);
          setEditingSourceIndex(null);
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Card</Text>
            <TouchableOpacity
              onPress={() => {
                setShowCardPicker(false);
                setEditingSourceIndex(null);
              }}
            >
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {loadingCards ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#3498DB" />
            </View>
          ) : (
            <FlatList
              data={categoryCards}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.cardItem}
                  onPress={() => handleSelectCard(item)}
                >
                  <Ionicons name="card" size={20} color="#3498DB" />
                  <Text style={styles.cardItemText} numberOfLines={2}>
                    {item.front}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={() => (
                <View style={styles.emptyList}>
                  <Text style={styles.emptyListText}>
                    No cards in this category
                  </Text>
                </View>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  headerButton: {
    width: 40,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  stepIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    backgroundColor: "#FFF",
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E0E0E0",
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: {
    backgroundColor: "#3498DB",
  },
  stepDotText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
  },
  stepDotTextActive: {
    color: "#FFF",
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: "#E0E0E0",
    marginHorizontal: 4,
  },
  stepLineActive: {
    backgroundColor: "#3498DB",
  },
  scrollContent: {
    flex: 1,
  },
  stepContent: {
    padding: 20,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
    marginBottom: 24,
  },
  suggestionsSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  suggestionsScroll: {
    flexDirection: "row",
  },
  suggestionCard: {
    width: 200,
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 12,
    marginRight: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  suggestionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  suggestionConfidence: {
    fontSize: 12,
    color: "#27AE60",
    fontWeight: "500",
  },
  suggestionText: {
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
    marginBottom: 8,
  },
  useSuggestionText: {
    fontSize: 12,
    color: "#3498DB",
    fontWeight: "500",
  },
  selectedSources: {
    gap: 12,
  },
  sourceItem: {
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  sourceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sourceInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sourceName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  removeButton: {
    padding: 4,
  },
  selectedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F0F7FF",
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  selectedCardText: {
    flex: 1,
    fontSize: 13,
    color: "#333",
  },
  selectCardButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  selectCardButtonText: {
    fontSize: 13,
    color: "#3498DB",
  },
  contextInput: {
    backgroundColor: "#F8F9FA",
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
    color: "#333",
    minHeight: 60,
  },
  addSourceButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#3498DB",
    borderStyle: "dashed",
    gap: 8,
  },
  addSourceText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#3498DB",
  },
  hintText: {
    marginTop: 16,
    fontSize: 13,
    color: "#888",
    textAlign: "center",
  },
  connectionGrid: {
    gap: 12,
  },
  connectionOption: {
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E0E0E0",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  connectionOptionSelected: {
    borderWidth: 2,
    backgroundColor: "#F0F7FF",
  },
  connectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  connectionIconSelected: {
    transform: [{ scale: 1.1 }],
  },
  connectionLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  connectionDescription: {
    display: "none",
  },
  connectionBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    marginBottom: 20,
  },
  connectionBadgeText: {
    fontSize: 13,
    fontWeight: "500",
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  questionInput: {
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 12,
    fontSize: 15,
    color: "#333",
    minHeight: 100,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    textAlignVertical: "top",
  },
  answerInput: {
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 12,
    fontSize: 15,
    color: "#333",
    minHeight: 150,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    textAlignVertical: "top",
  },
  charCount: {
    marginTop: 6,
    fontSize: 12,
    color: "#888",
    textAlign: "right",
  },
  strengthSlider: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  strengthOption: {
    flex: 1,
    padding: 12,
    backgroundColor: "#FFF",
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  strengthOptionSelected: {
    backgroundColor: "#3498DB",
    borderColor: "#3498DB",
  },
  strengthOptionText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#666",
  },
  strengthOptionTextSelected: {
    color: "#FFF",
  },
  previewCard: {
    backgroundColor: "#FFF",
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  previewConnectionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  previewHeaderText: {
    marginLeft: 12,
  },
  previewConnectionType: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  previewStrength: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  previewDomains: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  previewDomain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F0F7FF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  previewDomainText: {
    fontSize: 13,
    color: "#333",
    fontWeight: "500",
  },
  previewQuestion: {
    marginBottom: 16,
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#888",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  previewQuestionText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#333",
    lineHeight: 24,
  },
  previewAnswer: {},
  previewAnswerText: {
    fontSize: 15,
    color: "#333",
    lineHeight: 22,
  },
  navigation: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: 12,
  },
  backButtonText: {
    fontSize: 15,
    color: "#666",
    fontWeight: "500",
  },
  navigationSpacer: {
    flex: 1,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3498DB",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  nextButtonDisabled: {
    backgroundColor: "#B0B0B0",
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFF",
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#27AE60",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  createButtonDisabled: {
    backgroundColor: "#B0B0B0",
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFF",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  categoryItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
    gap: 12,
  },
  categoryItemInfo: {
    flex: 1,
  },
  categoryItemName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
  categoryItemCount: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  cardItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
    gap: 12,
  },
  cardItemText: {
    flex: 1,
    fontSize: 15,
    color: "#333",
    lineHeight: 21,
  },
  emptyList: {
    padding: 32,
    alignItems: "center",
  },
  emptyListText: {
    fontSize: 14,
    color: "#888",
  },
});

export default BridgeCardCreator;
