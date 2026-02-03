// =============================================================================
// FACE EDITOR
// =============================================================================
// Editor for individual card faces with progressive disclosure

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import { haptics } from "@/utils/animation";
import { ContentPrimitiveEditor } from "./ContentPrimitiveEditor";
import { DepthLevelSelector } from "./DepthLevelSelector";
import { FacePreview } from "./FacePreview";
import type {
  FaceEditorProps,
  EditableFace,
  EditablePrimitive,
  CardFaceType,
} from "./types";
import {
  createEditablePrimitive,
  FACE_TYPE_METADATA,
  DEPTH_LEVEL_METADATA,
} from "./types";

// =============================================================================
// FACE TYPE SELECTOR (Compact)
// =============================================================================

interface FaceTypeSelectorProps {
  value: CardFaceType;
  onChange: (type: CardFaceType) => void;
  compact?: boolean;
}

function FaceTypeSelector({
  value,
  onChange,
  compact = false,
}: FaceTypeSelectorProps) {
  const colors = useColors();
  const [showPicker, setShowPicker] = useState(false);

  const selectedMeta = FACE_TYPE_METADATA[value];

  if (compact) {
    return (
      <TouchableOpacity
        style={[
          styles.compactSelector,
          { backgroundColor: selectedMeta.color + "20", borderColor: selectedMeta.color },
        ]}
        onPress={() => setShowPicker(!showPicker)}
      >
        <Ionicons
          name={selectedMeta.icon as any}
          size={16}
          color={selectedMeta.color}
        />
        <Text style={[styles.compactSelectorText, { color: selectedMeta.color }]}>
          {selectedMeta.label}
        </Text>
        <Ionicons
          name="chevron-down"
          size={14}
          color={selectedMeta.color}
        />
      </TouchableOpacity>
    );
  }

  const categories = ["recognition", "recall", "application", "synthesis", "meta"];

  return (
    <View style={styles.faceTypeSelector}>
      <TouchableOpacity
        style={[
          styles.selectedType,
          { backgroundColor: selectedMeta.color + "20", borderColor: selectedMeta.color },
        ]}
        onPress={() => setShowPicker(!showPicker)}
      >
        <Ionicons
          name={selectedMeta.icon as any}
          size={20}
          color={selectedMeta.color}
        />
        <View style={styles.selectedTypeText}>
          <Text style={[styles.selectedTypeLabel, { color: selectedMeta.color }]}>
            {selectedMeta.label}
          </Text>
          <Text style={[styles.selectedTypeDesc, { color: colors.textMuted }]}>
            {selectedMeta.description}
          </Text>
        </View>
        <Ionicons
          name={showPicker ? "chevron-up" : "chevron-down"}
          size={20}
          color={selectedMeta.color}
        />
      </TouchableOpacity>

      {showPicker && (
        <View style={[styles.typePicker, { backgroundColor: colors.surface }]}>
          {categories.map((category) => (
            <View key={category} style={styles.typeCategory}>
              <Text
                style={[
                  styles.typeCategoryLabel,
                  { color: colors.textSecondary },
                ]}
              >
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </Text>
              <View style={styles.typeOptions}>
                {Object.entries(FACE_TYPE_METADATA)
                  .filter(([_, meta]) => meta.category === category)
                  .map(([type, meta]) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.typeOption,
                        {
                          backgroundColor:
                            type === value ? meta.color + "20" : colors.surfaceVariant,
                          borderColor: type === value ? meta.color : colors.border,
                        },
                      ]}
                      onPress={() => {
                        haptics.selection();
                        onChange(type as CardFaceType);
                        setShowPicker(false);
                      }}
                    >
                      <Ionicons
                        name={meta.icon as any}
                        size={16}
                        color={type === value ? meta.color : colors.textMuted}
                      />
                      <Text
                        style={[
                          styles.typeOptionLabel,
                          { color: type === value ? meta.color : colors.text },
                        ]}
                      >
                        {meta.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// =============================================================================
// FACE EDITOR COMPONENT
// =============================================================================

export function FaceEditor({
  face,
  canonicalPrimitives,
  onUpdate,
  onDelete,
  canDelete,
  isExpanded,
  onToggleExpanded,
  expertiseLevel,
}: FaceEditorProps) {
  const colors = useColors();
  const [previewSide, setPreviewSide] = useState<"question" | "answer">("question");
  const [showMiniPreview, setShowMiniPreview] = useState(false);

  const faceMeta = FACE_TYPE_METADATA[face.faceType];
  const depthMeta = DEPTH_LEVEL_METADATA[face.depthLevel];

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleNameChange = useCallback(
    (name: string) => {
      onUpdate({ ...face, name, isDirty: true });
    },
    [face, onUpdate]
  );

  const handleFaceTypeChange = useCallback(
    (faceType: CardFaceType) => {
      onUpdate({ ...face, faceType, isDirty: true });
    },
    [face, onUpdate]
  );

  const handleDepthChange = useCallback(
    (depthLevel: typeof face.depthLevel) => {
      onUpdate({ ...face, depthLevel, isDirty: true });
    },
    [face, onUpdate]
  );

  const handleScaffoldingChange = useCallback(
    (level: number) => {
      onUpdate({ ...face, scaffoldingLevel: level, isDirty: true });
    },
    [face, onUpdate]
  );

  const handlePrimitiveUpdate = useCallback(
    (
      side: "question" | "answer",
      index: number,
      primitive: EditablePrimitive
    ) => {
      const key = side === "question" ? "questionPrimitives" : "answerPrimitives";
      const newPrimitives = [...face[key]];
      newPrimitives[index] = primitive;
      onUpdate({ ...face, [key]: newPrimitives, isDirty: true });
    },
    [face, onUpdate]
  );

  const handlePrimitiveDelete = useCallback(
    (side: "question" | "answer", index: number) => {
      const key = side === "question" ? "questionPrimitives" : "answerPrimitives";
      if (face[key].length <= 1) {
        return; // Must have at least one primitive
      }
      const newPrimitives = face[key].filter((_, i) => i !== index);
      onUpdate({ ...face, [key]: newPrimitives, isDirty: true });
    },
    [face, onUpdate]
  );

  const handleAddPrimitive = useCallback(
    (side: "question" | "answer") => {
      haptics.light();
      const key = side === "question" ? "questionPrimitives" : "answerPrimitives";
      const newPrimitive = createEditablePrimitive("text", face[key].length);
      onUpdate({ ...face, [key]: [...face[key], newPrimitive], isDirty: true });
    },
    [face, onUpdate]
  );

  const handleMovePrimitive = useCallback(
    (side: "question" | "answer", index: number, direction: "up" | "down") => {
      const key = side === "question" ? "questionPrimitives" : "answerPrimitives";
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= face[key].length) return;

      const newPrimitives = [...face[key]];
      const temp = newPrimitives[index];
      newPrimitives[index] = newPrimitives[newIndex];
      newPrimitives[newIndex] = temp;
      // Update order values
      newPrimitives.forEach((p, i) => (p.order = i));
      onUpdate({ ...face, [key]: newPrimitives, isDirty: true });
    },
    [face, onUpdate]
  );

  const handleHintAdd = useCallback(() => {
    haptics.light();
    onUpdate({ ...face, hints: [...face.hints, ""], isDirty: true });
  }, [face, onUpdate]);

  const handleHintUpdate = useCallback(
    (index: number, hint: string) => {
      const newHints = [...face.hints];
      newHints[index] = hint;
      onUpdate({ ...face, hints: newHints, isDirty: true });
    },
    [face, onUpdate]
  );

  const handleHintDelete = useCallback(
    (index: number) => {
      const newHints = face.hints.filter((_, i) => i !== index);
      onUpdate({ ...face, hints: newHints, isDirty: true });
    },
    [face, onUpdate]
  );

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <View style={styles.container}>
      {/* Header */}
      <TouchableOpacity
        style={[styles.header, { borderBottomColor: colors.border }]}
        onPress={onToggleExpanded}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <View
            style={[styles.faceIcon, { backgroundColor: faceMeta.color + "20" }]}
          >
            <Ionicons
              name={faceMeta.icon as any}
              size={20}
              color={faceMeta.color}
            />
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.faceName, { color: colors.text }]}>
              {face.name}
            </Text>
            <Text style={[styles.faceMeta, { color: colors.textMuted }]}>
              {faceMeta.label} • {depthMeta.shortLabel}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {face.isDefault && (
            <View
              style={[
                styles.defaultBadge,
                { backgroundColor: colors.primary + "20" },
              ]}
            >
              <Text style={[styles.defaultBadgeText, { color: colors.primary }]}>
                Default
              </Text>
            </View>
          )}
          <Ionicons
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={20}
            color={colors.textMuted}
          />
        </View>
      </TouchableOpacity>

      {/* Expanded Content */}
      {isExpanded && (
        <View style={styles.content}>
          {/* Face Name */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              Face Name
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surfaceVariant,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              value={face.name}
              onChangeText={handleNameChange}
              placeholder="Face name"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          {/* Face Type - Only for intermediate+ */}
          {expertiseLevel !== "novice" && (
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                Face Type
              </Text>
              <FaceTypeSelector
                value={face.faceType}
                onChange={handleFaceTypeChange}
                compact={expertiseLevel === "intermediate"}
              />
            </View>
          )}

          {/* Depth Level - Only for advanced */}
          {expertiseLevel === "advanced" && (
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                Cognitive Depth
              </Text>
              <DepthLevelSelector
                value={face.depthLevel}
                onChange={handleDepthChange}
                showDescriptions
              />
            </View>
          )}

          {/* Question Content */}
          <View style={styles.fieldGroup}>
            <View style={styles.fieldHeader}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                Question / Front
              </Text>
              <TouchableOpacity
                onPress={() => handleAddPrimitive("question")}
                style={styles.addButton}
              >
                <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>
            {face.questionPrimitives.map((primitive, index) => (
              <ContentPrimitiveEditor
                key={primitive.tempId}
                primitive={primitive}
                onUpdate={(p: EditablePrimitive) => handlePrimitiveUpdate("question", index, p)}
                onDelete={() => handlePrimitiveDelete("question", index)}
                onMoveUp={() => handleMovePrimitive("question", index, "up")}
                onMoveDown={() => handleMovePrimitive("question", index, "down")}
                canMoveUp={index > 0}
                canMoveDown={index < face.questionPrimitives.length - 1}
              />
            ))}
          </View>

          {/* Answer Content */}
          <View style={styles.fieldGroup}>
            <View style={styles.fieldHeader}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                Answer / Back
              </Text>
              <TouchableOpacity
                onPress={() => handleAddPrimitive("answer")}
                style={styles.addButton}
              >
                <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>
            {face.answerPrimitives.map((primitive, index) => (
              <ContentPrimitiveEditor
                key={primitive.tempId}
                primitive={primitive}
                onUpdate={(p: EditablePrimitive) => handlePrimitiveUpdate("answer", index, p)}
                onDelete={() => handlePrimitiveDelete("answer", index)}
                onMoveUp={() => handleMovePrimitive("answer", index, "up")}
                onMoveDown={() => handleMovePrimitive("answer", index, "down")}
                canMoveUp={index > 0}
                canMoveDown={index < face.answerPrimitives.length - 1}
              />
            ))}
          </View>

          {/* Scaffolding - Only for advanced */}
          {expertiseLevel === "advanced" && (
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                Scaffolding Level
              </Text>
              <View style={styles.scaffoldingSelector}>
                {[0, 1, 2, 3].map((level) => (
                  <TouchableOpacity
                    key={level}
                    style={[
                      styles.scaffoldingOption,
                      {
                        backgroundColor:
                          face.scaffoldingLevel === level
                            ? colors.primary
                            : colors.surfaceVariant,
                        borderColor:
                          face.scaffoldingLevel === level
                            ? colors.primary
                            : colors.border,
                      },
                    ]}
                    onPress={() => handleScaffoldingChange(level)}
                  >
                    <Text
                      style={[
                        styles.scaffoldingOptionText,
                        {
                          color:
                            face.scaffoldingLevel === level
                              ? colors.onPrimary
                              : colors.text,
                        },
                      ]}
                    >
                      {level === 0
                        ? "None"
                        : level === 1
                        ? "Minimal"
                        : level === 2
                        ? "Moderate"
                        : "Maximum"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Hints - Only for intermediate+ */}
          {expertiseLevel !== "novice" && (
            <View style={styles.fieldGroup}>
              <View style={styles.fieldHeader}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  Hints
                </Text>
                <TouchableOpacity onPress={handleHintAdd} style={styles.addButton}>
                  <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                </TouchableOpacity>
              </View>
              {face.hints.length === 0 ? (
                <Text style={[styles.emptyHints, { color: colors.textMuted }]}>
                  No hints added
                </Text>
              ) : (
                face.hints.map((hint, index) => (
                  <View key={index} style={styles.hintRow}>
                    <TextInput
                      style={[
                        styles.hintInput,
                        {
                          backgroundColor: colors.surfaceVariant,
                          color: colors.text,
                          borderColor: colors.border,
                        },
                      ]}
                      value={hint}
                      onChangeText={(text) => handleHintUpdate(index, text)}
                      placeholder={`Hint ${index + 1}`}
                      placeholderTextColor={colors.textMuted}
                    />
                    <TouchableOpacity
                      onPress={() => handleHintDelete(index)}
                      style={styles.hintDelete}
                    >
                      <Ionicons name="close-circle" size={20} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}

          {/* Mini Preview Toggle */}
          <TouchableOpacity
            style={[styles.previewToggle, { borderColor: colors.border }]}
            onPress={() => setShowMiniPreview(!showMiniPreview)}
          >
            <Ionicons
              name={showMiniPreview ? "eye" : "eye-outline"}
              size={16}
              color={colors.primary}
            />
            <Text style={[styles.previewToggleText, { color: colors.primary }]}>
              {showMiniPreview ? "Hide Preview" : "Show Preview"}
            </Text>
          </TouchableOpacity>

          {showMiniPreview && (
            <View style={styles.miniPreview}>
              <View style={styles.previewSideToggle}>
                <TouchableOpacity
                  style={[
                    styles.previewSideButton,
                    previewSide === "question" && {
                      backgroundColor: colors.primary,
                    },
                  ]}
                  onPress={() => setPreviewSide("question")}
                >
                  <Text
                    style={{
                      color:
                        previewSide === "question"
                          ? colors.onPrimary
                          : colors.text,
                    }}
                  >
                    Question
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.previewSideButton,
                    previewSide === "answer" && {
                      backgroundColor: colors.primary,
                    },
                  ]}
                  onPress={() => setPreviewSide("answer")}
                >
                  <Text
                    style={{
                      color:
                        previewSide === "answer"
                          ? colors.onPrimary
                          : colors.text,
                    }}
                  >
                    Answer
                  </Text>
                </TouchableOpacity>
              </View>
              <FacePreview face={face} side={previewSide} size="medium" />
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            {canDelete && (
              <TouchableOpacity
                style={[styles.deleteButton, { borderColor: colors.error }]}
                onPress={onDelete}
              >
                <Ionicons name="trash-outline" size={16} color={colors.error} />
                <Text style={[styles.deleteButtonText, { color: colors.error }]}>
                  Delete Face
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  faceIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  faceName: {
    fontSize: 16,
    fontWeight: "600",
  },
  faceMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  defaultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  defaultBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  content: {
    padding: 16,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  fieldHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
  },
  input: {
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
  },
  addButton: {
    padding: 4,
  },
  faceTypeSelector: {
    gap: 8,
  },
  selectedType: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  selectedTypeText: {
    flex: 1,
    marginLeft: 12,
  },
  selectedTypeLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  selectedTypeDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  compactSelector: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  compactSelectorText: {
    fontSize: 14,
    fontWeight: "500",
    marginHorizontal: 6,
  },
  typePicker: {
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  typeCategory: {
    marginBottom: 12,
  },
  typeCategoryLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  typeOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  typeOptionLabel: {
    fontSize: 13,
    marginLeft: 6,
  },
  scaffoldingSelector: {
    flexDirection: "row",
    gap: 8,
  },
  scaffoldingOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  scaffoldingOptionText: {
    fontSize: 12,
    fontWeight: "500",
  },
  emptyHints: {
    fontSize: 14,
    fontStyle: "italic",
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  hintInput: {
    flex: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    borderWidth: 1,
    marginRight: 8,
  },
  hintDelete: {
    padding: 4,
  },
  previewToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    marginTop: 8,
  },
  previewToggleText: {
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 6,
  },
  miniPreview: {
    marginTop: 12,
  },
  previewSideToggle: {
    flexDirection: "row",
    marginBottom: 12,
  },
  previewSideButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  actions: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.1)",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 6,
  },
});
