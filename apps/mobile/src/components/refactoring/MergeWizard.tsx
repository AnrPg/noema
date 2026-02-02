// =============================================================================
// MERGE WIZARD COMPONENT
// =============================================================================
// Multi-step wizard for merging multiple categories into one
// Handles duplicate cards, annotations, and emphasis rule conflicts

import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import {
  useCategory,
  useCategoryCards,
  useMergeCategories,
  MergeCategoriesInput,
} from "@/services/api";

// =============================================================================
// TYPES
// =============================================================================

interface MergeWizardProps {
  sourceCategoryIds: string[];
  onComplete: (result: {
    eventId: string;
    targetCategory: { id: string; name: string };
  }) => void;
  onCancel: () => void;
}

interface WizardStep {
  key: "select" | "target" | "conflicts" | "review";
  title: string;
  description: string;
}

interface CategoryInfo {
  id: string;
  name: string;
  cardCount: number;
  iconEmoji?: string;
  color?: string;
  description?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const WIZARD_STEPS: WizardStep[] = [
  {
    key: "select",
    title: "Confirm Sources",
    description: "Review categories to merge",
  },
  {
    key: "target",
    title: "Define Target",
    description: "Set up the merged category",
  },
  {
    key: "conflicts",
    title: "Handle Conflicts",
    description: "Resolve duplicates and overlaps",
  },
  {
    key: "review",
    title: "Review & Merge",
    description: "Confirm and execute the merge",
  },
];

const DUPLICATE_HANDLING_OPTIONS = [
  {
    value: "keep_highest_mastery" as const,
    label: "Keep Highest Mastery",
    description:
      "When a card exists in multiple sources, keep the one with best learning progress",
    icon: "trending-up",
  },
  {
    value: "keep_all_participations" as const,
    label: "Keep All Participations",
    description:
      "Preserve all category-card relationships (card appears once but with multiple contexts)",
    icon: "copy",
  },
  {
    value: "merge_participations" as const,
    label: "Merge Participations",
    description: "Combine learning data from all participations into one",
    icon: "git-merge",
  },
];

const ANNOTATION_HANDLING_OPTIONS = [
  {
    value: "keep_all" as const,
    label: "Keep All",
    description: "Preserve all annotations from all sources",
    icon: "documents",
  },
  {
    value: "keep_most_recent" as const,
    label: "Keep Most Recent",
    description: "When duplicates exist, keep the most recently updated",
    icon: "time",
  },
  {
    value: "merge_by_type" as const,
    label: "Merge by Type",
    description: "Combine annotations of the same type intelligently",
    icon: "layers",
  },
];

const EMPHASIS_HANDLING_OPTIONS = [
  {
    value: "keep_all" as const,
    label: "Keep All Rules",
    description: "All emphasis rules remain active",
    icon: "options",
  },
  {
    value: "keep_from_primary" as const,
    label: "Keep Primary Only",
    description: "Only keep rules from the primary (first selected) category",
    icon: "star",
  },
  {
    value: "disable_all" as const,
    label: "Disable All",
    description: "Reset emphasis rules for a fresh start",
    icon: "refresh",
  },
];

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
];

// =============================================================================
// SOURCE CATEGORY CARD COMPONENT
// =============================================================================

function SourceCategoryCard({
  categoryId,
  isFirst,
  onRemove,
  canRemove,
}: {
  categoryId: string;
  isFirst: boolean;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const colors = useColors();
  const { data: category, isLoading } = useCategory(categoryId);
  const { data: cards } = useCategoryCards(categoryId);

  if (isLoading) {
    return (
      <View
        style={[styles.sourceCategoryCard, { backgroundColor: colors.surface }]}
      >
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (!category) return null;

  return (
    <View
      style={[
        styles.sourceCategoryCard,
        {
          backgroundColor: colors.surface,
          borderLeftColor: category.color || colors.primary,
        },
      ]}
    >
      <View style={styles.sourceCategoryHeader}>
        <Text style={styles.sourceCategoryEmoji}>
          {category.iconEmoji || "📁"}
        </Text>
        <View style={styles.sourceCategoryInfo}>
          <View style={styles.sourceCategoryNameRow}>
            <Text style={[styles.sourceCategoryName, { color: colors.text }]}>
              {category.name}
            </Text>
            {isFirst && (
              <View
                style={[
                  styles.primaryBadge,
                  { backgroundColor: colors.primary + "20" },
                ]}
              >
                <Text
                  style={[styles.primaryBadgeText, { color: colors.primary }]}
                >
                  Primary
                </Text>
              </View>
            )}
          </View>
          <Text
            style={[styles.sourceCategoryMeta, { color: colors.textMuted }]}
          >
            {cards?.length || 0} cards
          </Text>
        </View>
        {canRemove && (
          <TouchableOpacity
            onPress={onRemove}
            style={styles.removeSourceButton}
          >
            <Ionicons name="close-circle" size={22} color={colors.error} />
          </TouchableOpacity>
        )}
      </View>
      {category.description && (
        <Text
          style={[styles.sourceCategoryDesc, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
          {category.description}
        </Text>
      )}
    </View>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function MergeWizard({
  sourceCategoryIds: initialSourceIds,
  onComplete,
  onCancel,
}: MergeWizardProps) {
  const colors = useColors();

  // API hooks
  const mergeMutation = useMergeCategories();

  // Wizard state
  const [currentStep, setCurrentStep] = useState(0);
  const [sourceCategoryIds, setSourceCategoryIds] =
    useState<string[]>(initialSourceIds);

  // Target configuration
  const [targetMode, setTargetMode] = useState<"existing" | "new">("new");
  const [targetExistingId, setTargetExistingId] = useState<string | null>(null);
  const [targetName, setTargetName] = useState("");
  const [targetDescription, setTargetDescription] = useState("");
  const [targetEmoji, setTargetEmoji] = useState(
    EMOJI_OPTIONS[Math.floor(Math.random() * EMOJI_OPTIONS.length)],
  );
  const [targetColor, setTargetColor] = useState(
    COLOR_OPTIONS[Math.floor(Math.random() * COLOR_OPTIONS.length)],
  );
  const [targetFramingQuestion, setTargetFramingQuestion] = useState("");

  // Conflict handling
  const [duplicateHandling, setDuplicateHandling] = useState<
    MergeCategoriesInput["duplicateHandling"]
  >("keep_highest_mastery");
  const [annotationHandling, setAnnotationHandling] =
    useState<MergeCategoriesInput["annotationHandling"]>("keep_all");
  const [emphasisHandling, setEmphasisHandling] =
    useState<MergeCategoriesInput["emphasisHandling"]>("keep_all");

  // Rationale
  const [rationale, setRationale] = useState("");

  // Computed values
  const step = WIZARD_STEPS[currentStep];

  // Validation
  const canProceed = useMemo(() => {
    switch (step.key) {
      case "select":
        return sourceCategoryIds.length >= 2;
      case "target":
        if (targetMode === "existing") {
          return !!targetExistingId;
        }
        return targetName.trim().length > 0;
      case "conflicts":
        return true; // All have defaults
      case "review":
        return true;
      default:
        return false;
    }
  }, [step.key, sourceCategoryIds, targetMode, targetExistingId, targetName]);

  // =============================================================================
  // HANDLERS
  // =============================================================================

  const removeSource = useCallback((categoryId: string) => {
    setSourceCategoryIds((prev) => {
      if (prev.length <= 2) {
        Alert.alert(
          "Minimum Sources",
          "A merge requires at least 2 source categories.",
        );
        return prev;
      }
      return prev.filter((id) => id !== categoryId);
    });
  }, []);

  const handleNext = useCallback(() => {
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  }, [currentStep]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const handleMerge = useCallback(async () => {
    try {
      const input: MergeCategoriesInput = {
        sourceCategoryIds,
        target:
          targetMode === "existing"
            ? { existingCategoryId: targetExistingId! }
            : {
                name: targetName,
                description: targetDescription || undefined,
                framingQuestion: targetFramingQuestion || undefined,
                iconEmoji: targetEmoji,
                color: targetColor,
              },
        duplicateHandling,
        annotationHandling,
        emphasisHandling,
        rationale: rationale.trim() || undefined,
        idempotencyKey: `merge_${sourceCategoryIds.join("_")}_${Date.now()}`,
      };

      const result = await mergeMutation.mutateAsync(input);

      if (result.data?.success) {
        onComplete({
          eventId: result.data.data.eventId,
          targetCategory: {
            id: result.data.data.mergedCategoryId,
            name: targetName || "Merged Category",
          },
        });
      }
    } catch (error: any) {
      Alert.alert(
        "Merge Failed",
        error.message || "An error occurred while merging the categories.",
      );
    }
  }, [
    sourceCategoryIds,
    targetMode,
    targetExistingId,
    targetName,
    targetDescription,
    targetFramingQuestion,
    targetEmoji,
    targetColor,
    duplicateHandling,
    annotationHandling,
    emphasisHandling,
    rationale,
    mergeMutation,
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

  const renderSelectStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={[styles.stepDescription, { color: colors.textSecondary }]}>
        These categories will be merged into one. The first category is
        considered the &quot;primary&quot; and may influence some default
        behaviors.
      </Text>

      {sourceCategoryIds.map((id, idx) => (
        <SourceCategoryCard
          key={id}
          categoryId={id}
          isFirst={idx === 0}
          onRemove={() => removeSource(id)}
          canRemove={sourceCategoryIds.length > 2}
        />
      ))}

      <View
        style={[
          styles.mergePreview,
          { backgroundColor: colors.primaryLight + "15" },
        ]}
      >
        <Ionicons name="git-merge" size={32} color={colors.primary} />
        <Text style={[styles.mergePreviewText, { color: colors.primary }]}>
          {sourceCategoryIds.length} categories → 1 merged category
        </Text>
      </View>
    </ScrollView>
  );

  const renderTargetStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      {/* Target Mode Selection */}
      <View style={styles.targetModeSection}>
        <TouchableOpacity
          style={[
            styles.targetModeOption,
            {
              backgroundColor:
                targetMode === "new" ? colors.primary + "15" : colors.surface,
              borderColor:
                targetMode === "new" ? colors.primary : colors.border,
            },
          ]}
          onPress={() => setTargetMode("new")}
        >
          <Ionicons
            name="add-circle"
            size={28}
            color={targetMode === "new" ? colors.primary : colors.textMuted}
          />
          <Text
            style={[
              styles.targetModeLabel,
              { color: targetMode === "new" ? colors.primary : colors.text },
            ]}
          >
            Create New Category
          </Text>
          <Text style={[styles.targetModeDesc, { color: colors.textMuted }]}>
            Merge into a brand new category
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.targetModeOption,
            {
              backgroundColor:
                targetMode === "existing"
                  ? colors.primary + "15"
                  : colors.surface,
              borderColor:
                targetMode === "existing" ? colors.primary : colors.border,
            },
          ]}
          onPress={() => setTargetMode("existing")}
        >
          <Ionicons
            name="folder"
            size={28}
            color={
              targetMode === "existing" ? colors.primary : colors.textMuted
            }
          />
          <Text
            style={[
              styles.targetModeLabel,
              {
                color: targetMode === "existing" ? colors.primary : colors.text,
              },
            ]}
          >
            Merge into Existing
          </Text>
          <Text style={[styles.targetModeDesc, { color: colors.textMuted }]}>
            Absorb into one of the sources
          </Text>
        </TouchableOpacity>
      </View>

      {/* New Category Form */}
      {targetMode === "new" && (
        <View style={styles.targetForm}>
          <View
            style={[styles.formSection, { backgroundColor: colors.surface }]}
          >
            <Text style={[styles.formLabel, { color: colors.text }]}>
              Category Name *
            </Text>
            <TextInput
              style={[
                styles.formInput,
                { backgroundColor: colors.background, color: colors.text },
              ]}
              placeholder="Name for the merged category..."
              placeholderTextColor={colors.textMuted}
              value={targetName}
              onChangeText={setTargetName}
            />
          </View>

          <View
            style={[styles.formSection, { backgroundColor: colors.surface }]}
          >
            <Text style={[styles.formLabel, { color: colors.text }]}>
              Description
            </Text>
            <TextInput
              style={[
                styles.formTextArea,
                { backgroundColor: colors.background, color: colors.text },
              ]}
              placeholder="What does this unified category represent?"
              placeholderTextColor={colors.textMuted}
              value={targetDescription}
              onChangeText={setTargetDescription}
              multiline
              numberOfLines={3}
            />
          </View>

          <View
            style={[styles.formSection, { backgroundColor: colors.surface }]}
          >
            <Text style={[styles.formLabel, { color: colors.text }]}>
              Framing Question
            </Text>
            <TextInput
              style={[
                styles.formInput,
                { backgroundColor: colors.background, color: colors.text },
              ]}
              placeholder="What question does this category answer?"
              placeholderTextColor={colors.textMuted}
              value={targetFramingQuestion}
              onChangeText={setTargetFramingQuestion}
            />
          </View>

          <View
            style={[styles.formSection, { backgroundColor: colors.surface }]}
          >
            <Text style={[styles.formLabel, { color: colors.text }]}>Icon</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {EMOJI_OPTIONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    styles.emojiOption,
                    {
                      backgroundColor:
                        targetEmoji === emoji
                          ? colors.primary + "30"
                          : colors.background,
                    },
                  ]}
                  onPress={() => setTargetEmoji(emoji)}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View
            style={[styles.formSection, { backgroundColor: colors.surface }]}
          >
            <Text style={[styles.formLabel, { color: colors.text }]}>
              Color
            </Text>
            <View style={styles.colorOptions}>
              {COLOR_OPTIONS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color },
                    targetColor === color && styles.colorOptionSelected,
                  ]}
                  onPress={() => setTargetColor(color)}
                />
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Existing Category Selection */}
      {targetMode === "existing" && (
        <View style={styles.existingSelection}>
          <Text style={[styles.existingLabel, { color: colors.textSecondary }]}>
            Select which category to keep (others will be merged into it):
          </Text>
          {sourceCategoryIds.map((id) => (
            <ExistingCategoryOption
              key={id}
              categoryId={id}
              isSelected={targetExistingId === id}
              onSelect={() => setTargetExistingId(id)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );

  const renderConflictsStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={[styles.stepDescription, { color: colors.textSecondary }]}>
        Configure how to handle potential conflicts when merging the categories.
      </Text>

      {/* Duplicate Cards */}
      <View style={styles.conflictSection}>
        <Text style={[styles.conflictTitle, { color: colors.text }]}>
          📋 Duplicate Cards
        </Text>
        <Text style={[styles.conflictDesc, { color: colors.textMuted }]}>
          When the same card exists in multiple source categories
        </Text>
        {DUPLICATE_HANDLING_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.conflictOption,
              {
                backgroundColor:
                  duplicateHandling === option.value
                    ? colors.primary + "15"
                    : colors.surface,
                borderColor:
                  duplicateHandling === option.value
                    ? colors.primary
                    : colors.border,
              },
            ]}
            onPress={() => setDuplicateHandling(option.value)}
          >
            <Ionicons
              name={option.icon as any}
              size={20}
              color={
                duplicateHandling === option.value
                  ? colors.primary
                  : colors.textMuted
              }
            />
            <View style={styles.conflictOptionText}>
              <Text
                style={[
                  styles.conflictOptionLabel,
                  {
                    color:
                      duplicateHandling === option.value
                        ? colors.primary
                        : colors.text,
                  },
                ]}
              >
                {option.label}
              </Text>
              <Text
                style={[styles.conflictOptionDesc, { color: colors.textMuted }]}
              >
                {option.description}
              </Text>
            </View>
            {duplicateHandling === option.value && (
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={colors.primary}
              />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Annotations */}
      <View style={styles.conflictSection}>
        <Text style={[styles.conflictTitle, { color: colors.text }]}>
          📝 Annotations
        </Text>
        <Text style={[styles.conflictDesc, { color: colors.textMuted }]}>
          How to handle notes, insights, and other annotations
        </Text>
        {ANNOTATION_HANDLING_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.conflictOption,
              {
                backgroundColor:
                  annotationHandling === option.value
                    ? colors.primary + "15"
                    : colors.surface,
                borderColor:
                  annotationHandling === option.value
                    ? colors.primary
                    : colors.border,
              },
            ]}
            onPress={() => setAnnotationHandling(option.value)}
          >
            <Ionicons
              name={option.icon as any}
              size={20}
              color={
                annotationHandling === option.value
                  ? colors.primary
                  : colors.textMuted
              }
            />
            <View style={styles.conflictOptionText}>
              <Text
                style={[
                  styles.conflictOptionLabel,
                  {
                    color:
                      annotationHandling === option.value
                        ? colors.primary
                        : colors.text,
                  },
                ]}
              >
                {option.label}
              </Text>
              <Text
                style={[styles.conflictOptionDesc, { color: colors.textMuted }]}
              >
                {option.description}
              </Text>
            </View>
            {annotationHandling === option.value && (
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={colors.primary}
              />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Emphasis Rules */}
      <View style={styles.conflictSection}>
        <Text style={[styles.conflictTitle, { color: colors.text }]}>
          🎯 Emphasis Rules
        </Text>
        <Text style={[styles.conflictDesc, { color: colors.textMuted }]}>
          What to do with card emphasis/weighting rules
        </Text>
        {EMPHASIS_HANDLING_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.conflictOption,
              {
                backgroundColor:
                  emphasisHandling === option.value
                    ? colors.primary + "15"
                    : colors.surface,
                borderColor:
                  emphasisHandling === option.value
                    ? colors.primary
                    : colors.border,
              },
            ]}
            onPress={() => setEmphasisHandling(option.value)}
          >
            <Ionicons
              name={option.icon as any}
              size={20}
              color={
                emphasisHandling === option.value
                  ? colors.primary
                  : colors.textMuted
              }
            />
            <View style={styles.conflictOptionText}>
              <Text
                style={[
                  styles.conflictOptionLabel,
                  {
                    color:
                      emphasisHandling === option.value
                        ? colors.primary
                        : colors.text,
                  },
                ]}
              >
                {option.label}
              </Text>
              <Text
                style={[styles.conflictOptionDesc, { color: colors.textMuted }]}
              >
                {option.description}
              </Text>
            </View>
            {emphasisHandling === option.value && (
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={colors.primary}
              />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );

  const renderReviewStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      {/* Summary */}
      <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.summaryTitle, { color: colors.text }]}>
          Merge Summary
        </Text>

        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
            Source Categories:
          </Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
            {sourceCategoryIds.length}
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
            Target:
          </Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
            {targetMode === "new" ? `New: ${targetName}` : "Existing category"}
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
            Duplicates:
          </Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
            {
              DUPLICATE_HANDLING_OPTIONS.find(
                (o) => o.value === duplicateHandling,
              )?.label
            }
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
            Annotations:
          </Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
            {
              ANNOTATION_HANDLING_OPTIONS.find(
                (o) => o.value === annotationHandling,
              )?.label
            }
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
            Emphasis Rules:
          </Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
            {
              EMPHASIS_HANDLING_OPTIONS.find(
                (o) => o.value === emphasisHandling,
              )?.label
            }
          </Text>
        </View>
      </View>

      {/* Target Preview */}
      {targetMode === "new" && (
        <View
          style={[
            styles.targetPreview,
            { backgroundColor: colors.surface, borderLeftColor: targetColor },
          ]}
        >
          <View style={styles.targetPreviewHeader}>
            <Text style={styles.targetPreviewEmoji}>{targetEmoji}</Text>
            <View>
              <Text style={[styles.targetPreviewName, { color: colors.text }]}>
                {targetName}
              </Text>
              {targetDescription && (
                <Text
                  style={[
                    styles.targetPreviewDesc,
                    { color: colors.textMuted },
                  ]}
                >
                  {targetDescription}
                </Text>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Rationale */}
      <Text style={[styles.rationaleLabel, { color: colors.text }]}>
        Rationale (Optional)
      </Text>
      <TextInput
        style={[
          styles.rationaleInput,
          { backgroundColor: colors.surface, color: colors.text },
        ]}
        placeholder="Why are you merging these categories?"
        placeholderTextColor={colors.textMuted}
        value={rationale}
        onChangeText={setRationale}
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
            Merge Categories
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
      {step.key === "select" && renderSelectStep()}
      {step.key === "target" && renderTargetStep()}
      {step.key === "conflicts" && renderConflictsStep()}
      {step.key === "review" && renderReviewStep()}

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
          onPress={step.key === "review" ? handleMerge : handleNext}
          disabled={!canProceed || mergeMutation.isPending}
        >
          {mergeMutation.isPending ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <Text
              style={[
                styles.nextButtonText,
                { color: canProceed ? colors.textInverse : colors.textMuted },
              ]}
            >
              {step.key === "review" ? "Merge Categories" : "Continue"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// =============================================================================
// EXISTING CATEGORY OPTION COMPONENT
// =============================================================================

function ExistingCategoryOption({
  categoryId,
  isSelected,
  onSelect,
}: {
  categoryId: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const colors = useColors();
  const { data: category, isLoading } = useCategory(categoryId);
  const { data: cards } = useCategoryCards(categoryId);

  if (isLoading) {
    return (
      <View
        style={[styles.existingOption, { backgroundColor: colors.surface }]}
      >
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (!category) return null;

  return (
    <TouchableOpacity
      style={[
        styles.existingOption,
        {
          backgroundColor: isSelected ? colors.primary + "15" : colors.surface,
          borderColor: isSelected ? colors.primary : colors.border,
        },
      ]}
      onPress={onSelect}
    >
      <Text style={styles.existingOptionEmoji}>
        {category.iconEmoji || "📁"}
      </Text>
      <View style={styles.existingOptionInfo}>
        <Text style={[styles.existingOptionName, { color: colors.text }]}>
          {category.name}
        </Text>
        <Text style={[styles.existingOptionMeta, { color: colors.textMuted }]}>
          {cards?.length || 0} cards
        </Text>
      </View>
      {isSelected && (
        <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
      )}
    </TouchableOpacity>
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
    marginBottom: 16,
    lineHeight: 20,
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

  // Source Category Card
  sourceCategoryCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
  },
  sourceCategoryHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  sourceCategoryEmoji: {
    fontSize: 28,
    marginRight: 12,
  },
  sourceCategoryInfo: {
    flex: 1,
  },
  sourceCategoryNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sourceCategoryName: {
    fontSize: 16,
    fontWeight: "600",
  },
  primaryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  primaryBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  sourceCategoryMeta: {
    fontSize: 13,
    marginTop: 2,
  },
  sourceCategoryDesc: {
    fontSize: 13,
    marginTop: 8,
    lineHeight: 18,
  },
  removeSourceButton: {
    padding: 4,
  },
  mergePreview: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    borderRadius: 12,
    marginTop: 10,
    gap: 12,
  },
  mergePreviewText: {
    fontSize: 16,
    fontWeight: "600",
  },

  // Target Mode
  targetModeSection: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  targetModeOption: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  targetModeLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8,
    textAlign: "center",
  },
  targetModeDesc: {
    fontSize: 11,
    marginTop: 4,
    textAlign: "center",
  },

  // Target Form
  targetForm: {
    gap: 12,
  },
  formSection: {
    borderRadius: 12,
    padding: 14,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  formInput: {
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
  },
  formTextArea: {
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
  emojiOption: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  emojiText: {
    fontSize: 22,
  },
  colorOptions: {
    flexDirection: "row",
    gap: 10,
  },
  colorOption: {
    width: 32,
    height: 32,
    borderRadius: 16,
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

  // Existing Selection
  existingSelection: {
    gap: 10,
  },
  existingLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  existingOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  existingOptionEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  existingOptionInfo: {
    flex: 1,
  },
  existingOptionName: {
    fontSize: 15,
    fontWeight: "600",
  },
  existingOptionMeta: {
    fontSize: 12,
    marginTop: 2,
  },

  // Conflict Section
  conflictSection: {
    marginBottom: 24,
  },
  conflictTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  conflictDesc: {
    fontSize: 13,
    marginBottom: 12,
  },
  conflictOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  conflictOptionText: {
    flex: 1,
  },
  conflictOptionLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  conflictOptionDesc: {
    fontSize: 12,
    marginTop: 2,
  },

  // Summary
  summaryCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
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
  targetPreview: {
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    marginBottom: 16,
  },
  targetPreviewHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  targetPreviewEmoji: {
    fontSize: 28,
    marginRight: 12,
  },
  targetPreviewName: {
    fontSize: 16,
    fontWeight: "600",
  },
  targetPreviewDesc: {
    fontSize: 13,
    marginTop: 4,
  },
  rationaleLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  rationaleInput: {
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
});

export default MergeWizard;
