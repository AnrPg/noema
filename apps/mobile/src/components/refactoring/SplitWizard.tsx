// =============================================================================
// SPLIT WIZARD COMPONENT
// =============================================================================
// Multi-step wizard for splitting a category into subcategories
// Guides users through defining children, assigning cards, and articulating distinctions

import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  FlatList,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import {
  useCategoryCardsForRefactor,
  useAISplitSuggestions,
  useSplitCategory,
  SplitChildDefinition,
  SplitDistinction,
} from "@/services/api";

// =============================================================================
// TYPES
// =============================================================================

interface SplitWizardProps {
  categoryId: string;
  categoryName: string;
  onComplete: (result: {
    eventId: string;
    childCategories: Array<{ categoryId: string; name: string }>;
  }) => void;
  onCancel: () => void;
}

interface WizardStep {
  key: "define" | "assign" | "distinguish" | "review";
  title: string;
  description: string;
}

interface ChildDraft extends SplitChildDefinition {
  isExpanded?: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const WIZARD_STEPS: WizardStep[] = [
  {
    key: "define",
    title: "Define Children",
    description: "Name and describe the new subcategories",
  },
  {
    key: "assign",
    title: "Assign Cards",
    description: "Distribute cards among subcategories",
  },
  {
    key: "distinguish",
    title: "Articulate Distinctions",
    description: "Explain what makes each category unique",
  },
  {
    key: "review",
    title: "Review & Split",
    description: "Confirm and execute the split",
  },
];

const LEARNING_INTENTS = [
  {
    value: "foundational",
    label: "🎯 Foundational",
    description: "Core knowledge",
  },
  {
    value: "contextual",
    label: "🔗 Contextual",
    description: "Supporting context",
  },
  {
    value: "reference",
    label: "📖 Reference",
    description: "Look-up material",
  },
] as const;

const DEPTH_GOALS = [
  { value: "recognition", label: "👁️ Recognition" },
  { value: "recall", label: "💭 Recall" },
  { value: "application", label: "⚙️ Application" },
  { value: "synthesis", label: "🔮 Synthesis" },
] as const;

const PARENT_DISPOSITIONS = [
  {
    value: "keep_as_container",
    label: "Keep as Container",
    description: "Parent becomes an organizational folder",
    icon: "folder-open",
  },
  {
    value: "archive",
    label: "Archive Parent",
    description: "Parent is archived but preserved",
    icon: "archive",
  },
  {
    value: "convert_to_first_child",
    label: "Convert to Child",
    description: "Parent becomes one of the children",
    icon: "return-down-forward",
  },
] as const;

const EMOJI_OPTIONS = [
  "📚",
  "🧠",
  "💡",
  "🎯",
  "🔬",
  "🎨",
  "🌍",
  "💻",
  "📊",
  "🎵",
  "🧪",
  "📐",
  "🔧",
  "🌱",
  "⚡",
  "🔥",
  "📝",
  "🎓",
  "🔍",
  "⭐",
  "🏆",
  "🎪",
  "🌈",
  "🎸",
];

const COLOR_OPTIONS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#a855f7",
  "#f43f5e",
  "#84cc16",
];

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function SplitWizard({
  categoryId,
  categoryName,
  onComplete,
  onCancel,
}: SplitWizardProps) {
  const colors = useColors();

  // API hooks
  const { data: cards, isLoading: cardsLoading } =
    useCategoryCardsForRefactor(categoryId);
  const { data: aiSuggestions, isLoading: aiLoading } =
    useAISplitSuggestions(categoryId);
  const splitMutation = useSplitCategory();

  // Wizard state
  const [currentStep, setCurrentStep] = useState(0);
  const [children, setChildren] = useState<ChildDraft[]>([
    createEmptyChild("1"),
    createEmptyChild("2"),
  ]);
  const [distinctions, setDistinctions] = useState<SplitDistinction[]>([]);
  const [parentDisposition, setParentDisposition] = useState<
    "keep_as_container" | "archive" | "convert_to_first_child"
  >("keep_as_container");
  const [reason, setReason] = useState("");
  const [showAISuggestions, setShowAISuggestions] = useState(false);

  // Computed values
  const step = WIZARD_STEPS[currentStep];
  const allCards = cards || [];
  const assignedCardIds = useMemo(
    () => new Set(children.flatMap((c) => c.cardIds)),
    [children],
  );
  const unassignedCards = useMemo(
    () => allCards.filter((c: any) => !assignedCardIds.has(c.id)),
    [allCards, assignedCardIds],
  );

  // Validation
  const canProceed = useMemo(() => {
    switch (step.key) {
      case "define":
        return (
          children.length >= 2 &&
          children.every((c) => c.name.trim().length > 0)
        );
      case "assign":
        // All cards should be assigned
        return (
          unassignedCards.length === 0 &&
          children.every((c) => c.cardIds.length > 0)
        );
      case "distinguish":
        // At least one distinction statement
        return (
          distinctions.length > 0 &&
          distinctions.some((d) => d.distinctionStatement.trim().length > 0)
        );
      case "review":
        return true;
      default:
        return false;
    }
  }, [step.key, children, unassignedCards, distinctions]);

  // =============================================================================
  // HANDLERS
  // =============================================================================

  function createEmptyChild(tempId: string): ChildDraft {
    return {
      tempId,
      name: "",
      description: "",
      framingQuestion: "",
      iconEmoji:
        EMOJI_OPTIONS[Math.floor(Math.random() * EMOJI_OPTIONS.length)],
      color: COLOR_OPTIONS[Math.floor(Math.random() * COLOR_OPTIONS.length)],
      cardIds: [],
      learningIntent: "foundational",
      depthGoal: "recall",
      isExpanded: true,
    };
  }

  const addChild = useCallback(() => {
    const newId = String(Date.now());
    setChildren((prev) => [...prev, createEmptyChild(newId)]);
  }, []);

  const removeChild = useCallback((tempId: string) => {
    setChildren((prev) => {
      if (prev.length <= 2) {
        Alert.alert(
          "Minimum Children",
          "A split requires at least 2 children.",
        );
        return prev;
      }
      const child = prev.find((c) => c.tempId === tempId);
      if (child && child.cardIds.length > 0) {
        Alert.alert(
          "Cards Assigned",
          "This child has cards assigned. Remove the cards first or they will be unassigned.",
        );
      }
      return prev.filter((c) => c.tempId !== tempId);
    });
  }, []);

  const updateChild = useCallback(
    (tempId: string, updates: Partial<ChildDraft>) => {
      setChildren((prev) =>
        prev.map((c) => (c.tempId === tempId ? { ...c, ...updates } : c)),
      );
    },
    [],
  );

  const assignCard = useCallback((cardId: string, childTempId: string) => {
    setChildren((prev) =>
      prev.map((c) => {
        if (c.tempId === childTempId) {
          return { ...c, cardIds: [...c.cardIds, cardId] };
        }
        // Remove from other children
        return { ...c, cardIds: c.cardIds.filter((id) => id !== cardId) };
      }),
    );
  }, []);

  const unassignCard = useCallback((cardId: string) => {
    setChildren((prev) =>
      prev.map((c) => ({
        ...c,
        cardIds: c.cardIds.filter((id) => id !== cardId),
      })),
    );
  }, []);

  const addDistinction = useCallback(() => {
    setDistinctions((prev) => [
      ...prev,
      { distinctionStatement: "", exemplarCardIds: [] },
    ]);
  }, []);

  const updateDistinction = useCallback((index: number, statement: string) => {
    setDistinctions((prev) =>
      prev.map((d, i) =>
        i === index ? { ...d, distinctionStatement: statement } : d,
      ),
    );
  }, []);

  const removeDistinction = useCallback((index: number) => {
    setDistinctions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const applyAISuggestion = useCallback(
    (suggestion: NonNullable<typeof aiSuggestions>["suggestions"][0]) => {
      const newChildren: ChildDraft[] = suggestion.suggestedChildren.map(
        (sc, idx) => ({
          tempId: `ai_${idx}_${Date.now()}`,
          name: sc.name,
          description: sc.description,
          cardIds: sc.cardIds,
          iconEmoji: EMOJI_OPTIONS[idx % EMOJI_OPTIONS.length],
          color: COLOR_OPTIONS[idx % COLOR_OPTIONS.length],
          learningIntent: "foundational" as const,
          depthGoal: "recall" as const,
          isExpanded: true,
        }),
      );
      setChildren(newChildren);

      // Create distinctions from AI
      const newDistinctions: SplitDistinction[] =
        suggestion.suggestedChildren.map((sc) => ({
          distinctionStatement: sc.distinctionFromSiblings,
          aiConfidence: suggestion.confidence,
        }));
      setDistinctions(newDistinctions);
      setShowAISuggestions(false);
    },
    [],
  );

  const handleNext = useCallback(() => {
    if (currentStep < WIZARD_STEPS.length - 1) {
      // Initialize distinctions when entering distinguish step
      if (
        WIZARD_STEPS[currentStep + 1].key === "distinguish" &&
        distinctions.length === 0
      ) {
        setDistinctions([{ distinctionStatement: "", exemplarCardIds: [] }]);
      }
      setCurrentStep((prev) => prev + 1);
    }
  }, [currentStep, distinctions.length]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const handleSplit = useCallback(async () => {
    try {
      const result = await splitMutation.mutateAsync({
        categoryId,
        children: children.map(({ isExpanded, ...c }) => c),
        distinctions: distinctions.filter((d) => d.distinctionStatement.trim()),
        parentDisposition,
        reason: reason.trim() || undefined,
        requestAIAnalysis: false,
        idempotencyKey: `split_${categoryId}_${Date.now()}`,
      });

      if (result.data?.success) {
        onComplete({
          eventId: result.data.data.eventId,
          childCategories: result.data.data.childCategories.map((c) => ({
            categoryId: c.categoryId,
            name: c.name,
          })),
        });
      }
    } catch (error: any) {
      Alert.alert(
        "Split Failed",
        error.message || "An error occurred while splitting the category.",
      );
    }
  }, [
    categoryId,
    children,
    distinctions,
    parentDisposition,
    reason,
    splitMutation,
    onComplete,
  ]);

  // =============================================================================
  // RENDER HELPERS
  // =============================================================================

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {WIZARD_STEPS.map((s, idx) => (
        <View key={s.key} style={styles.stepItem}>
          <View
            style={[
              styles.stepCircle,
              {
                backgroundColor:
                  idx < currentStep
                    ? colors.success
                    : idx === currentStep
                      ? colors.primary
                      : colors.border,
              },
            ]}
          >
            {idx < currentStep ? (
              <Ionicons name="checkmark" size={14} color={colors.textInverse} />
            ) : (
              <Text
                style={[
                  styles.stepNumber,
                  {
                    color:
                      idx === currentStep
                        ? colors.textInverse
                        : colors.textMuted,
                  },
                ]}
              >
                {idx + 1}
              </Text>
            )}
          </View>
          {idx < WIZARD_STEPS.length - 1 && (
            <View
              style={[
                styles.stepLine,
                {
                  backgroundColor:
                    idx < currentStep ? colors.success : colors.border,
                },
              ]}
            />
          )}
        </View>
      ))}
    </View>
  );

  const renderDefineStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      {/* AI Suggestions Banner */}
      {aiSuggestions && aiSuggestions.suggestions.length > 0 && (
        <TouchableOpacity
          style={[
            styles.aiBanner,
            { backgroundColor: colors.primaryLight + "20" },
          ]}
          onPress={() => setShowAISuggestions(true)}
        >
          <Ionicons name="sparkles" size={20} color={colors.primary} />
          <Text style={[styles.aiBannerText, { color: colors.primary }]}>
            AI found {aiSuggestions.suggestions.length} split suggestion(s)
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primary} />
        </TouchableOpacity>
      )}

      {/* Children List */}
      {children.map((child, idx) => (
        <View
          key={child.tempId}
          style={[styles.childCard, { backgroundColor: colors.surface }]}
        >
          <TouchableOpacity
            style={styles.childHeader}
            onPress={() =>
              updateChild(child.tempId, { isExpanded: !child.isExpanded })
            }
          >
            <View style={styles.childHeaderLeft}>
              <TouchableOpacity
                style={[
                  styles.emojiPicker,
                  { backgroundColor: child.color + "30" },
                ]}
                onPress={() => {
                  // Simple emoji cycle for now
                  const currentIdx = EMOJI_OPTIONS.indexOf(
                    child.iconEmoji || "📚",
                  );
                  const nextIdx = (currentIdx + 1) % EMOJI_OPTIONS.length;
                  updateChild(child.tempId, {
                    iconEmoji: EMOJI_OPTIONS[nextIdx],
                  });
                }}
              >
                <Text style={styles.emoji}>{child.iconEmoji || "📚"}</Text>
              </TouchableOpacity>
              <TextInput
                style={[styles.childNameInput, { color: colors.text }]}
                placeholder={`Child ${idx + 1} name...`}
                placeholderTextColor={colors.textMuted}
                value={child.name}
                onChangeText={(text) =>
                  updateChild(child.tempId, { name: text })
                }
              />
            </View>
            <View style={styles.childHeaderRight}>
              {children.length > 2 && (
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => removeChild(child.tempId)}
                >
                  <Ionicons
                    name="close-circle"
                    size={22}
                    color={colors.error}
                  />
                </TouchableOpacity>
              )}
              <Ionicons
                name={child.isExpanded ? "chevron-up" : "chevron-down"}
                size={20}
                color={colors.textMuted}
              />
            </View>
          </TouchableOpacity>

          {child.isExpanded && (
            <View style={styles.childDetails}>
              <TextInput
                style={[
                  styles.textArea,
                  { backgroundColor: colors.background, color: colors.text },
                ]}
                placeholder="Description (optional)..."
                placeholderTextColor={colors.textMuted}
                value={child.description}
                onChangeText={(text) =>
                  updateChild(child.tempId, { description: text })
                }
                multiline
                numberOfLines={2}
              />
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.background, color: colors.text },
                ]}
                placeholder="Framing question (optional)..."
                placeholderTextColor={colors.textMuted}
                value={child.framingQuestion}
                onChangeText={(text) =>
                  updateChild(child.tempId, { framingQuestion: text })
                }
              />

              {/* Color Picker */}
              <View style={styles.colorRow}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Color:
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {COLOR_OPTIONS.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.colorOption,
                        { backgroundColor: c },
                        child.color === c && styles.colorOptionSelected,
                      ]}
                      onPress={() => updateChild(child.tempId, { color: c })}
                    />
                  ))}
                </ScrollView>
              </View>

              {/* Learning Intent */}
              <View style={styles.optionRow}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Intent:
                </Text>
                <View style={styles.optionButtons}>
                  {LEARNING_INTENTS.map((li) => (
                    <TouchableOpacity
                      key={li.value}
                      style={[
                        styles.optionButton,
                        {
                          backgroundColor:
                            child.learningIntent === li.value
                              ? colors.primary
                              : colors.background,
                          borderColor: colors.border,
                        },
                      ]}
                      onPress={() =>
                        updateChild(child.tempId, { learningIntent: li.value })
                      }
                    >
                      <Text
                        style={[
                          styles.optionButtonText,
                          {
                            color:
                              child.learningIntent === li.value
                                ? colors.textInverse
                                : colors.text,
                          },
                        ]}
                      >
                        {li.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* Card count badge */}
          <View
            style={[
              styles.cardCountBadge,
              { backgroundColor: colors.primaryLight + "30" },
            ]}
          >
            <Ionicons name="copy-outline" size={14} color={colors.primary} />
            <Text style={[styles.cardCountText, { color: colors.primary }]}>
              {child.cardIds.length} cards
            </Text>
          </View>
        </View>
      ))}

      {/* Add Child Button */}
      <TouchableOpacity
        style={[styles.addChildButton, { borderColor: colors.border }]}
        onPress={addChild}
      >
        <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
        <Text style={[styles.addChildText, { color: colors.primary }]}>
          Add Another Child
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderAssignStep = () => (
    <View style={styles.assignContainer}>
      {/* Unassigned Cards */}
      <View
        style={[styles.unassignedSection, { backgroundColor: colors.surface }]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Unassigned Cards ({unassignedCards.length})
        </Text>
        <FlatList
          data={unassignedCards}
          keyExtractor={(item: any) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }: { item: any }) => (
            <View
              style={[styles.cardChip, { backgroundColor: colors.background }]}
            >
              <Text
                style={[styles.cardChipText, { color: colors.text }]}
                numberOfLines={2}
              >
                {item.content?.front || item.content?.question || "Card"}
              </Text>
              <View style={styles.cardChipActions}>
                {children.map((child) => (
                  <TouchableOpacity
                    key={child.tempId}
                    style={[
                      styles.assignButton,
                      { backgroundColor: child.color + "40" },
                    ]}
                    onPress={() => assignCard(item.id, child.tempId)}
                  >
                    <Text style={styles.assignButtonText}>
                      {child.iconEmoji}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons
                name="checkmark-circle"
                size={32}
                color={colors.success}
              />
              <Text style={[styles.emptyStateText, { color: colors.success }]}>
                All cards assigned!
              </Text>
            </View>
          }
        />
      </View>

      {/* Children with their cards */}
      <ScrollView style={styles.childrenCards}>
        {children.map((child) => (
          <View
            key={child.tempId}
            style={[
              styles.childCardsSection,
              { backgroundColor: colors.surface, borderLeftColor: child.color },
            ]}
          >
            <View style={styles.childCardHeader}>
              <Text style={styles.childCardEmoji}>{child.iconEmoji}</Text>
              <Text style={[styles.childCardName, { color: colors.text }]}>
                {child.name || "Unnamed"}
              </Text>
              <Text
                style={[styles.childCardCount, { color: colors.textMuted }]}
              >
                ({child.cardIds.length})
              </Text>
            </View>
            <FlatList
              data={child.cardIds}
              keyExtractor={(cardId) => cardId}
              horizontal
              showsHorizontalScrollIndicator={false}
              renderItem={({ item: cardId }) => {
                const card = allCards.find((c: any) => c.id === cardId);
                return (
                  <View
                    style={[
                      styles.assignedCardChip,
                      { backgroundColor: child.color + "20" },
                    ]}
                  >
                    <Text
                      style={[styles.cardChipText, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {card?.content?.front ||
                        card?.content?.question ||
                        "Card"}
                    </Text>
                    <TouchableOpacity
                      style={styles.unassignButton}
                      onPress={() => unassignCard(cardId)}
                    >
                      <Ionicons name="close" size={14} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={[styles.noCardsText, { color: colors.textMuted }]}>
                  No cards assigned yet
                </Text>
              }
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );

  const renderDistinguishStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={[styles.stepDescription, { color: colors.textSecondary }]}>
        Articulate what makes each child category unique. This helps you (and
        AI) understand the cognitive distinctions.
      </Text>

      {distinctions.map((distinction, idx) => (
        <View
          key={idx}
          style={[styles.distinctionCard, { backgroundColor: colors.surface }]}
        >
          <View style={styles.distinctionHeader}>
            <Text style={[styles.distinctionLabel, { color: colors.text }]}>
              Distinction {idx + 1}
            </Text>
            {distinctions.length > 1 && (
              <TouchableOpacity onPress={() => removeDistinction(idx)}>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </TouchableOpacity>
            )}
          </View>
          <TextInput
            style={[
              styles.distinctionInput,
              { backgroundColor: colors.background, color: colors.text },
            ]}
            placeholder="What distinguishes these categories? e.g., 'Category A focuses on theory while B covers practical applications'"
            placeholderTextColor={colors.textMuted}
            value={distinction.distinctionStatement}
            onChangeText={(text) => updateDistinction(idx, text)}
            multiline
            numberOfLines={3}
          />
          {distinction.aiConfidence !== undefined && (
            <View style={styles.aiConfidenceBadge}>
              <Ionicons name="sparkles" size={12} color={colors.primary} />
              <Text
                style={[styles.aiConfidenceText, { color: colors.primary }]}
              >
                AI Confidence: {Math.round(distinction.aiConfidence * 100)}%
              </Text>
            </View>
          )}
        </View>
      ))}

      <TouchableOpacity
        style={[styles.addDistinctionButton, { borderColor: colors.border }]}
        onPress={addDistinction}
      >
        <Ionicons name="add" size={20} color={colors.primary} />
        <Text style={[styles.addDistinctionText, { color: colors.primary }]}>
          Add Another Distinction
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderReviewStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      {/* Summary Card */}
      <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.summaryTitle, { color: colors.text }]}>
          Split Summary
        </Text>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
            Parent Category:
          </Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
            {categoryName}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
            Children to Create:
          </Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
            {children.length}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
            Total Cards:
          </Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
            {allCards.length}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
            Distinctions:
          </Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
            {distinctions.filter((d) => d.distinctionStatement.trim()).length}
          </Text>
        </View>
      </View>

      {/* Children Preview */}
      <Text style={[styles.previewTitle, { color: colors.text }]}>
        New Categories
      </Text>
      {children.map((child) => (
        <View
          key={child.tempId}
          style={[
            styles.previewChild,
            { backgroundColor: colors.surface, borderLeftColor: child.color },
          ]}
        >
          <View style={styles.previewChildHeader}>
            <Text style={styles.previewChildEmoji}>{child.iconEmoji}</Text>
            <View style={styles.previewChildInfo}>
              <Text style={[styles.previewChildName, { color: colors.text }]}>
                {child.name}
              </Text>
              <Text
                style={[styles.previewChildMeta, { color: colors.textMuted }]}
              >
                {child.cardIds.length} cards • {child.learningIntent}
              </Text>
            </View>
          </View>
          {child.description && (
            <Text
              style={[styles.previewChildDesc, { color: colors.textSecondary }]}
            >
              {child.description}
            </Text>
          )}
        </View>
      ))}

      {/* Parent Disposition */}
      <Text style={[styles.previewTitle, { color: colors.text }]}>
        Parent Handling
      </Text>
      <View style={styles.dispositionOptions}>
        {PARENT_DISPOSITIONS.map((pd) => (
          <TouchableOpacity
            key={pd.value}
            style={[
              styles.dispositionOption,
              {
                backgroundColor:
                  parentDisposition === pd.value
                    ? colors.primary + "20"
                    : colors.surface,
                borderColor:
                  parentDisposition === pd.value
                    ? colors.primary
                    : colors.border,
              },
            ]}
            onPress={() => setParentDisposition(pd.value)}
          >
            <Ionicons
              name={pd.icon as any}
              size={24}
              color={
                parentDisposition === pd.value
                  ? colors.primary
                  : colors.textMuted
              }
            />
            <Text
              style={[
                styles.dispositionLabel,
                {
                  color:
                    parentDisposition === pd.value
                      ? colors.primary
                      : colors.text,
                },
              ]}
            >
              {pd.label}
            </Text>
            <Text style={[styles.dispositionDesc, { color: colors.textMuted }]}>
              {pd.description}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Reason */}
      <Text style={[styles.previewTitle, { color: colors.text }]}>
        Reason (Optional)
      </Text>
      <TextInput
        style={[
          styles.reasonInput,
          { backgroundColor: colors.surface, color: colors.text },
        ]}
        placeholder="Why are you splitting this category?"
        placeholderTextColor={colors.textMuted}
        value={reason}
        onChangeText={setReason}
        multiline
        numberOfLines={2}
      />

      {/* Warning */}
      <View
        style={[
          styles.warningBox,
          { backgroundColor: colors.warningLight + "30" },
        ]}
      >
        <Ionicons name="information-circle" size={20} color={colors.warning} />
        <Text style={[styles.warningText, { color: colors.warning }]}>
          This operation can be rolled back. Your learning progress and card
          histories will be preserved.
        </Text>
      </View>
    </ScrollView>
  );

  // =============================================================================
  // MAIN RENDER
  // =============================================================================

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Split Category
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
            {categoryName}
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      {/* Step Indicator */}
      {renderStepIndicator()}

      {/* Step Title */}
      <View style={styles.stepHeader}>
        <Text style={[styles.stepTitle, { color: colors.text }]}>
          {step.title}
        </Text>
        <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
          {step.description}
        </Text>
      </View>

      {/* Step Content */}
      {cardsLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>
            Loading cards...
          </Text>
        </View>
      ) : (
        <>
          {step.key === "define" && renderDefineStep()}
          {step.key === "assign" && renderAssignStep()}
          {step.key === "distinguish" && renderDistinguishStep()}
          {step.key === "review" && renderReviewStep()}
        </>
      )}

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.backButton, { borderColor: colors.border }]}
          onPress={currentStep === 0 ? onCancel : handleBack}
        >
          <Text style={[styles.backButtonText, { color: colors.text }]}>
            {currentStep === 0 ? "Cancel" : "Back"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.nextButton,
            {
              backgroundColor: canProceed ? colors.primary : colors.border,
            },
          ]}
          onPress={step.key === "review" ? handleSplit : handleNext}
          disabled={!canProceed || splitMutation.isPending}
        >
          {splitMutation.isPending ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <Text
              style={[
                styles.nextButtonText,
                { color: canProceed ? colors.textInverse : colors.textMuted },
              ]}
            >
              {step.key === "review" ? "Split Category" : "Continue"}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* AI Suggestions Modal */}
      <Modal
        visible={showAISuggestions}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAISuggestions(false)}
      >
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: colors.background },
          ]}
        >
          <View
            style={[styles.modalHeader, { borderBottomColor: colors.border }]}
          >
            <TouchableOpacity onPress={() => setShowAISuggestions(false)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              AI Split Suggestions
            </Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView style={styles.modalContent}>
            {aiLoading ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : (
              aiSuggestions?.suggestions.map((suggestion, idx) => (
                <View
                  key={suggestion.id || idx}
                  style={[
                    styles.suggestionCard,
                    { backgroundColor: colors.surface },
                  ]}
                >
                  <View style={styles.suggestionHeader}>
                    <View style={styles.confidenceBadge}>
                      <Text
                        style={[
                          styles.confidenceText,
                          { color: colors.primary },
                        ]}
                      >
                        {Math.round(suggestion.confidence * 100)}% confident
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.suggestionReasoning,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {suggestion.reasoning}
                  </Text>
                  <Text
                    style={[
                      styles.suggestionBenefit,
                      { color: colors.success },
                    ]}
                  >
                    💡 {suggestion.expectedBenefit}
                  </Text>
                  <View style={styles.suggestedChildren}>
                    {suggestion.suggestedChildren.map((sc, scIdx) => (
                      <View
                        key={scIdx}
                        style={[
                          styles.suggestedChild,
                          { backgroundColor: colors.background },
                        ]}
                      >
                        <Text
                          style={[
                            styles.suggestedChildName,
                            { color: colors.text },
                          ]}
                        >
                          {sc.name}
                        </Text>
                        <Text
                          style={[
                            styles.suggestedChildDesc,
                            { color: colors.textMuted },
                          ]}
                        >
                          {sc.cardIds.length} cards
                        </Text>
                      </View>
                    ))}
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.applySuggestionButton,
                      { backgroundColor: colors.primary },
                    ]}
                    onPress={() => applyAISuggestion(suggestion)}
                  >
                    <Ionicons
                      name="sparkles"
                      size={16}
                      color={colors.textInverse}
                    />
                    <Text
                      style={[
                        styles.applySuggestionText,
                        { color: colors.textInverse },
                      ]}
                    >
                      Apply This Suggestion
                    </Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
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
  closeButton: {
    padding: 4,
  },
  headerCenter: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  headerRight: {
    width: 32,
  },
  stepIndicator: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  stepItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: "600",
  },
  stepLine: {
    width: 40,
    height: 2,
    marginHorizontal: 4,
  },
  stepHeader: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  stepSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  stepContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  stepDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  footer: {
    flexDirection: "row",
    padding: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  backButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  nextButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },

  // AI Banner
  aiBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    gap: 8,
  },
  aiBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },

  // Child Cards
  childCard: {
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
  },
  childHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
  },
  childHeaderLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  childHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  emojiPicker: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  emoji: {
    fontSize: 20,
  },
  childNameInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    padding: 0,
  },
  removeButton: {
    padding: 4,
  },
  childDetails: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 10,
  },
  textArea: {
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: "top",
  },
  input: {
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
  },
  colorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    minWidth: 50,
  },
  colorOption: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: "white",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  optionButtons: {
    flexDirection: "row",
    flex: 1,
    gap: 6,
  },
  optionButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  optionButtonText: {
    fontSize: 12,
    fontWeight: "500",
  },
  cardCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 12,
    marginBottom: 10,
    gap: 4,
  },
  cardCountText: {
    fontSize: 12,
    fontWeight: "500",
  },
  addChildButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    marginBottom: 20,
    gap: 8,
  },
  addChildText: {
    fontSize: 15,
    fontWeight: "500",
  },

  // Assign Step
  assignContainer: {
    flex: 1,
  },
  unassignedSection: {
    padding: 12,
    marginHorizontal: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
  },
  cardChip: {
    width: 140,
    padding: 10,
    borderRadius: 8,
    marginRight: 8,
  },
  cardChipText: {
    fontSize: 12,
    marginBottom: 8,
  },
  cardChipActions: {
    flexDirection: "row",
    gap: 4,
  },
  assignButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  assignButtonText: {
    fontSize: 14,
  },
  emptyState: {
    alignItems: "center",
    padding: 20,
  },
  emptyStateText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "500",
  },
  childrenCards: {
    flex: 1,
    paddingHorizontal: 16,
  },
  childCardsSection: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
  },
  childCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  childCardEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  childCardName: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  childCardCount: {
    fontSize: 13,
  },
  assignedCardChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 6,
    maxWidth: 150,
  },
  unassignButton: {
    marginLeft: 6,
    padding: 2,
  },
  noCardsText: {
    fontSize: 13,
    fontStyle: "italic",
  },

  // Distinction Step
  distinctionCard: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  distinctionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  distinctionLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  distinctionInput: {
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
  aiConfidenceBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 4,
  },
  aiConfidenceText: {
    fontSize: 12,
    fontWeight: "500",
  },
  addDistinctionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    marginBottom: 20,
    gap: 6,
  },
  addDistinctionText: {
    fontSize: 14,
    fontWeight: "500",
  },

  // Review Step
  summaryCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 10,
  },
  previewChild: {
    padding: 12,
    borderRadius: 10,
    borderLeftWidth: 4,
    marginBottom: 8,
  },
  previewChildHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  previewChildEmoji: {
    fontSize: 24,
    marginRight: 10,
  },
  previewChildInfo: {
    flex: 1,
  },
  previewChildName: {
    fontSize: 15,
    fontWeight: "600",
  },
  previewChildMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  previewChildDesc: {
    fontSize: 13,
    marginTop: 8,
    lineHeight: 18,
  },
  dispositionOptions: {
    gap: 10,
    marginBottom: 20,
  },
  dispositionOption: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  dispositionLabel: {
    fontSize: 15,
    fontWeight: "600",
    marginTop: 8,
  },
  dispositionDesc: {
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
  reasonInput: {
    padding: 12,
    borderRadius: 10,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  warningBox: {
    flexDirection: "row",
    padding: 12,
    borderRadius: 10,
    gap: 10,
    marginBottom: 20,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },

  // Modal
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  suggestionCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  suggestionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  confidenceText: {
    fontSize: 12,
    fontWeight: "600",
  },
  suggestionReasoning: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  suggestionBenefit: {
    fontSize: 13,
    marginBottom: 12,
  },
  suggestedChildren: {
    gap: 6,
    marginBottom: 12,
  },
  suggestedChild: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 10,
    borderRadius: 8,
  },
  suggestedChildName: {
    fontSize: 14,
    fontWeight: "500",
  },
  suggestedChildDesc: {
    fontSize: 12,
  },
  applySuggestionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: 10,
    gap: 6,
  },
  applySuggestionText: {
    fontSize: 14,
    fontWeight: "600",
  },
});

export default SplitWizard;
