// =============================================================================
// CATEGORY FORM
// =============================================================================
// Form for creating and editing categories

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
  LearningIntent,
  DepthGoal,
  CategoryId,
} from "@manthanein/shared";

// =============================================================================
// TYPES
// =============================================================================

interface CategoryFormProps {
  mode: "create" | "edit";
  initialValues?: Partial<UpdateCategoryInput> & { id?: string };
  parentId?: CategoryId;
  parentName?: string;
  onSubmit: (
    data: CreateCategoryInput | { id: string; data: UpdateCategoryInput },
  ) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const LEARNING_INTENTS: Array<{
  value: LearningIntent;
  label: string;
  description: string;
}> = [
  {
    value: "foundational",
    label: "🎯 Foundational",
    description: "Core knowledge to build upon",
  },
  {
    value: "contextual",
    label: "🔗 Contextual",
    description: "Supporting knowledge for context",
  },
  {
    value: "reference",
    label: "📖 Reference",
    description: "Look-up material when needed",
  },
];

const DEPTH_GOALS: Array<{
  value: DepthGoal;
  label: string;
  description: string;
}> = [
  {
    value: "recognition",
    label: "👁️ Recognition",
    description: "Can recognize when prompted",
  },
  {
    value: "recall",
    label: "💭 Recall",
    description: "Can recall from memory",
  },
  {
    value: "application",
    label: "⚙️ Application",
    description: "Can apply in new situations",
  },
  {
    value: "synthesis",
    label: "🔮 Synthesis",
    description: "Can combine and create new",
  },
];

const EMOJI_SUGGESTIONS = [
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

const COLOR_SUGGESTIONS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
];

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const CategoryForm: React.FC<CategoryFormProps> = ({
  mode,
  initialValues,
  parentId,
  parentName,
  onSubmit,
  onCancel,
  isLoading = false,
}) => {
  // Form state
  const [name, setName] = useState(initialValues?.name || "");
  const [description, setDescription] = useState(
    initialValues?.description || "",
  );
  const [framingQuestion, setFramingQuestion] = useState(
    initialValues?.framingQuestion || "",
  );
  const [iconEmoji, setIconEmoji] = useState(initialValues?.iconEmoji || "📁");
  const [color, setColor] = useState(initialValues?.color || "#6366f1");
  const [learningIntent, setLearningIntent] = useState<LearningIntent>(
    initialValues?.learningIntent || "foundational",
  );
  const [depthGoal, setDepthGoal] = useState<DepthGoal>(
    initialValues?.depthGoal || "recall",
  );

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = "Name is required";
    } else if (name.length < 2) {
      newErrors.name = "Name must be at least 2 characters";
    } else if (name.length > 100) {
      newErrors.name = "Name must be less than 100 characters";
    }

    if (description && description.length > 500) {
      newErrors.description = "Description must be less than 500 characters";
    }

    if (framingQuestion && framingQuestion.length > 200) {
      newErrors.framingQuestion =
        "Framing question must be less than 200 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, description, framingQuestion]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;

    const data: CreateCategoryInput = {
      name: name.trim(),
      description: description.trim() || undefined,
      framingQuestion: framingQuestion.trim() || undefined,
      iconEmoji,
      color,
      learningIntent,
      depthGoal,
      parentId: parentId || undefined,
    };

    if (mode === "edit" && initialValues?.id) {
      await onSubmit({ id: initialValues.id, data });
    } else {
      await onSubmit(data);
    }
  }, [
    validate,
    mode,
    initialValues?.id,
    name,
    description,
    framingQuestion,
    iconEmoji,
    color,
    learningIntent,
    depthGoal,
    parentId,
    onSubmit,
  ]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>
            {mode === "create" ? "Create Category" : "Edit Category"}
          </Text>
          {parentName && (
            <Text style={styles.subtitle}>
              Creating inside:{" "}
              <Text style={styles.parentName}>{parentName}</Text>
            </Text>
          )}
        </View>

        {/* Name Field */}
        <View style={styles.field}>
          <Text style={styles.label}>Name *</Text>
          <TextInput
            style={[styles.input, errors.name ? styles.inputError : null]}
            value={name}
            onChangeText={setName}
            placeholder="e.g., Linear Algebra, Machine Learning"
            placeholderTextColor="#6b7280"
            autoCapitalize="words"
            maxLength={100}
          />
          {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
        </View>

        {/* Description Field */}
        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              errors.description ? styles.inputError : null,
            ]}
            value={description}
            onChangeText={setDescription}
            placeholder="What does this category cover?"
            placeholderTextColor="#6b7280"
            multiline
            numberOfLines={3}
            maxLength={500}
          />
          {errors.description && (
            <Text style={styles.errorText}>{errors.description}</Text>
          )}
        </View>

        {/* Framing Question */}
        <View style={styles.field}>
          <Text style={styles.label}>Framing Question</Text>
          <Text style={styles.hint}>
            A question that helps relate new cards to this category
          </Text>
          <TextInput
            style={[
              styles.input,
              errors.framingQuestion ? styles.inputError : null,
            ]}
            value={framingQuestion}
            onChangeText={setFramingQuestion}
            placeholder="e.g., How does this help solve optimization problems?"
            placeholderTextColor="#6b7280"
            maxLength={200}
          />
          {errors.framingQuestion && (
            <Text style={styles.errorText}>{errors.framingQuestion}</Text>
          )}
        </View>

        {/* Icon Selection */}
        <View style={styles.field}>
          <Text style={styles.label}>Icon</Text>
          <View style={styles.iconGrid}>
            {EMOJI_SUGGESTIONS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={[
                  styles.iconOption,
                  iconEmoji === emoji && styles.iconOptionSelected,
                ]}
                onPress={() => setIconEmoji(emoji)}
              >
                <Text style={styles.iconEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Color Selection */}
        <View style={styles.field}>
          <Text style={styles.label}>Color</Text>
          <View style={styles.colorGrid}>
            {COLOR_SUGGESTIONS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.colorOption,
                  { backgroundColor: c },
                  color === c && styles.colorOptionSelected,
                ]}
                onPress={() => setColor(c)}
              >
                {color === c && <Text style={styles.colorCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Learning Intent */}
        <View style={styles.field}>
          <Text style={styles.label}>Learning Intent</Text>
          <Text style={styles.hint}>
            How important is this knowledge to your goals?
          </Text>
          <View style={styles.optionsContainer}>
            {LEARNING_INTENTS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionCard,
                  learningIntent === option.value && styles.optionCardSelected,
                ]}
                onPress={() => setLearningIntent(option.value)}
              >
                <Text style={styles.optionLabel}>{option.label}</Text>
                <Text style={styles.optionDescription}>
                  {option.description}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Depth Goal */}
        <View style={styles.field}>
          <Text style={styles.label}>Depth Goal</Text>
          <Text style={styles.hint}>
            How deeply do you want to understand this material?
          </Text>
          <View style={styles.optionsContainer}>
            {DEPTH_GOALS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionCard,
                  depthGoal === option.value && styles.optionCardSelected,
                ]}
                onPress={() => setDepthGoal(option.value)}
              >
                <Text style={styles.optionLabel}>{option.label}</Text>
                <Text style={styles.optionDescription}>
                  {option.description}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Preview */}
        <View style={styles.preview}>
          <Text style={styles.previewTitle}>Preview</Text>
          <View style={styles.previewCard}>
            <View style={[styles.previewIcon, { backgroundColor: color }]}>
              <Text style={styles.previewEmoji}>{iconEmoji}</Text>
            </View>
            <View style={styles.previewInfo}>
              <Text style={styles.previewName}>{name || "Category Name"}</Text>
              <Text style={styles.previewMeta}>
                {
                  LEARNING_INTENTS.find((i) => i.value === learningIntent)
                    ?.label
                }{" "}
                • {DEPTH_GOALS.find((d) => d.value === depthGoal)?.label}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={onCancel}
          disabled={isLoading}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitButton, isLoading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isLoading}
        >
          <Text style={styles.submitButtonText}>
            {isLoading
              ? "Saving..."
              : mode === "create"
                ? "Create Category"
                : "Save Changes"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111827",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },

  // Header
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#f9fafb",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#9ca3af",
  },
  parentName: {
    color: "#6366f1",
    fontWeight: "500",
  },

  // Fields
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#f9fafb",
    marginBottom: 4,
  },
  hint: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#1f2937",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#f9fafb",
    borderWidth: 1,
    borderColor: "#374151",
  },
  inputError: {
    borderColor: "#ef4444",
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  errorText: {
    fontSize: 12,
    color: "#ef4444",
    marginTop: 4,
  },

  // Icon Grid
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#1f2937",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  iconOptionSelected: {
    borderColor: "#6366f1",
    backgroundColor: "rgba(99, 102, 241, 0.2)",
  },
  iconEmoji: {
    fontSize: 22,
  },

  // Color Grid
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  colorOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "transparent",
  },
  colorOptionSelected: {
    borderColor: "#fff",
  },
  colorCheck: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },

  // Options
  optionsContainer: {
    gap: 8,
  },
  optionCard: {
    backgroundColor: "#1f2937",
    borderRadius: 8,
    padding: 12,
    borderWidth: 2,
    borderColor: "#374151",
  },
  optionCardSelected: {
    borderColor: "#6366f1",
    backgroundColor: "rgba(99, 102, 241, 0.1)",
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#f9fafb",
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: 12,
    color: "#9ca3af",
  },

  // Preview
  preview: {
    marginTop: 8,
  },
  previewTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  previewCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1f2937",
    borderRadius: 12,
    padding: 12,
  },
  previewIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  previewEmoji: {
    fontSize: 22,
  },
  previewInfo: {
    flex: 1,
  },
  previewName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#f9fafb",
    marginBottom: 2,
  },
  previewMeta: {
    fontSize: 12,
    color: "#9ca3af",
  },

  // Actions
  actions: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
    backgroundColor: "#111827",
    borderTopWidth: 1,
    borderTopColor: "#1f2937",
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: "#374151",
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#d1d5db",
  },
  submitButton: {
    flex: 2,
    paddingVertical: 14,
    backgroundColor: "#6366f1",
    borderRadius: 8,
    alignItems: "center",
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

export default CategoryForm;
