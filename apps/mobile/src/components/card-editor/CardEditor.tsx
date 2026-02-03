// =============================================================================
// CARD EDITOR
// =============================================================================
// Main card editor component with face management and progressive disclosure

import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import { haptics } from "@/utils/animation";
import { FaceEditor } from "./FaceEditor";
import { FaceSelector } from "./FaceSelector";
import { CardPreviewSheet } from "./CardPreviewSheet";
import type {
  CardEditorProps,
  EditableCard,
  EditableFace,
} from "./types";
import {
  createEditableCard,
  createEditableFace,
  generateTempId,
} from "./types";

// =============================================================================
// EXPERTISE LEVEL CONTEXT
// =============================================================================

type ExpertiseLevel = "novice" | "intermediate" | "advanced";

const ExpertiseLevelContext = React.createContext<{
  level: ExpertiseLevel;
  setLevel: (level: ExpertiseLevel) => void;
}>({
  level: "novice",
  setLevel: () => {},
});

export function useExpertiseLevel() {
  return React.useContext(ExpertiseLevelContext);
}

// =============================================================================
// CARD EDITOR COMPONENT
// =============================================================================

export function CardEditor({
  card: initialCard,
  onSave,
  onCancel,
  showAdvanced = false,
  isLoading = false,
}: CardEditorProps) {
  const colors = useColors();

  // Convert existing card to editable format or create new
  const [editableCard, setEditableCard] = useState<EditableCard>(() => {
    if (initialCard) {
      // Convert canonical card to editable format
      return convertToEditable(initialCard);
    }
    return createEditableCard();
  });

  // UI state
  const [selectedFaceTempId, setSelectedFaceTempId] = useState(
    editableCard.defaultFaceTempId
  );
  const [showPreview, setShowPreview] = useState(false);
  const [expertiseLevel, setExpertiseLevel] = useState<ExpertiseLevel>(
    showAdvanced ? "advanced" : "novice"
  );
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(showAdvanced);

  // Get selected face
  const selectedFace = useMemo(
    () => editableCard.faces.find((f) => f.tempId === selectedFaceTempId),
    [editableCard.faces, selectedFaceTempId]
  );

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleTitleChange = useCallback((title: string) => {
    setEditableCard((prev) => ({ ...prev, title, isDirty: true }));
  }, []);

  const handleDescriptionChange = useCallback((description: string) => {
    setEditableCard((prev) => ({ ...prev, description, isDirty: true }));
  }, []);

  const handleFaceUpdate = useCallback((updatedFace: EditableFace) => {
    setEditableCard((prev) => ({
      ...prev,
      faces: prev.faces.map((f) =>
        f.tempId === updatedFace.tempId ? updatedFace : f
      ),
      isDirty: true,
    }));
  }, []);

  const handleFaceDelete = useCallback(
    (faceTempId: string) => {
      if (editableCard.faces.length <= 1) {
        Alert.alert("Cannot Delete", "A card must have at least one face.");
        return;
      }

      Alert.alert(
        "Delete Face",
        "Are you sure you want to delete this face?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              haptics.warning();
              setEditableCard((prev) => {
                const newFaces = prev.faces.filter(
                  (f) => f.tempId !== faceTempId
                );
                // If we deleted the default face, make the first face default
                const newDefaultId =
                  prev.defaultFaceTempId === faceTempId
                    ? newFaces[0].tempId
                    : prev.defaultFaceTempId;
                // If we deleted the selected face, select the first face
                if (selectedFaceTempId === faceTempId) {
                  setSelectedFaceTempId(newFaces[0].tempId);
                }
                return {
                  ...prev,
                  faces: newFaces.map((f) => ({
                    ...f,
                    isDefault: f.tempId === newDefaultId,
                  })),
                  defaultFaceTempId: newDefaultId,
                  isDirty: true,
                };
              });
            },
          },
        ]
      );
    },
    [editableCard.faces.length, selectedFaceTempId]
  );

  const handleAddFace = useCallback(() => {
    haptics.light();
    const newFace = createEditableFace(false, editableCard.faces.length);
    setEditableCard((prev) => ({
      ...prev,
      faces: [...prev.faces, newFace],
      isDirty: true,
    }));
    setSelectedFaceTempId(newFace.tempId);
  }, [editableCard.faces.length]);

  const handleSetDefaultFace = useCallback((faceTempId: string) => {
    setEditableCard((prev) => ({
      ...prev,
      faces: prev.faces.map((f) => ({
        ...f,
        isDefault: f.tempId === faceTempId,
      })),
      defaultFaceTempId: faceTempId,
      isDirty: true,
    }));
  }, []);

  const handleToggleFaceExpanded = useCallback((faceTempId: string) => {
    setEditableCard((prev) => ({
      ...prev,
      faces: prev.faces.map((f) =>
        f.tempId === faceTempId ? { ...f, isExpanded: !f.isExpanded } : f
      ),
    }));
  }, []);

  const handleTagsChange = useCallback((tagsString: string) => {
    const tags = tagsString
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    setEditableCard((prev) => ({ ...prev, tags, isDirty: true }));
  }, []);

  const handleSave = useCallback(async () => {
    // Validate
    if (!editableCard.title.trim()) {
      Alert.alert("Validation Error", "Please enter a card title.");
      return;
    }

    if (editableCard.faces.length === 0) {
      Alert.alert("Validation Error", "A card must have at least one face.");
      return;
    }

    // Check that all faces have content
    for (const face of editableCard.faces) {
      if (
        face.questionPrimitives.length === 0 ||
        face.answerPrimitives.length === 0
      ) {
        Alert.alert(
          "Validation Error",
          `Face "${face.name}" must have both question and answer content.`
        );
        return;
      }
    }

    haptics.success();
    await onSave(editableCard);
  }, [editableCard, onSave]);

  const handleCancel = useCallback(() => {
    if (editableCard.isDirty) {
      Alert.alert(
        "Unsaved Changes",
        "You have unsaved changes. Are you sure you want to discard them?",
        [
          { text: "Keep Editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              haptics.warning();
              onCancel();
            },
          },
        ]
      );
    } else {
      onCancel();
    }
  }, [editableCard.isDirty, onCancel]);

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <ExpertiseLevelContext.Provider
      value={{ level: expertiseLevel, setLevel: setExpertiseLevel }}
    >
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.surface }]}>
          <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
            <Text style={[styles.headerButtonText, { color: colors.error }]}>
              Cancel
            </Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {editableCard.isNew ? "New Card" : "Edit Card"}
          </Text>
          <TouchableOpacity
            onPress={handleSave}
            style={styles.headerButton}
            disabled={isLoading}
          >
            <Text
              style={[
                styles.headerButtonText,
                { color: isLoading ? colors.textMuted : colors.primary },
              ]}
            >
              {isLoading ? "Saving..." : "Save"}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Basic Info Section */}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Basic Info
            </Text>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Title *
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
                value={editableCard.title}
                onChangeText={handleTitleChange}
                placeholder="Card title"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Progressive disclosure: Description only for intermediate+ */}
            {expertiseLevel !== "novice" && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Description
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.textArea,
                    {
                      backgroundColor: colors.surfaceVariant,
                      color: colors.text,
                      borderColor: colors.border,
                    },
                  ]}
                  value={editableCard.description || ""}
                  onChangeText={handleDescriptionChange}
                  placeholder="Optional description"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={3}
                />
              </View>
            )}

            {/* Progressive disclosure: Tags only for advanced */}
            {expertiseLevel === "advanced" && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Tags
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
                  value={editableCard.tags.join(", ")}
                  onChangeText={handleTagsChange}
                  placeholder="Comma-separated tags"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            )}
          </View>

          {/* Face Selector */}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Card Faces
              </Text>
              <TouchableOpacity
                onPress={() => setShowPreview(true)}
                style={[styles.previewButton, { borderColor: colors.primary }]}
              >
                <Ionicons name="eye-outline" size={16} color={colors.primary} />
                <Text
                  style={[styles.previewButtonText, { color: colors.primary }]}
                >
                  Preview
                </Text>
              </TouchableOpacity>
            </View>

            <FaceSelector
              faces={editableCard.faces}
              selectedFaceTempId={selectedFaceTempId}
              onSelect={setSelectedFaceTempId}
              onAddFace={handleAddFace}
              canAdd={expertiseLevel !== "novice" || editableCard.faces.length < 2}
            />
          </View>

          {/* Face Editor */}
          {selectedFace && (
            <View style={[styles.section, { backgroundColor: colors.surface }]}>
              <FaceEditor
                face={selectedFace}
                canonicalPrimitives={editableCard.canonicalPrimitives}
                onUpdate={handleFaceUpdate}
                onDelete={() => handleFaceDelete(selectedFace.tempId)}
                canDelete={editableCard.faces.length > 1}
                isExpanded={selectedFace.isExpanded ?? true}
                onToggleExpanded={() =>
                  handleToggleFaceExpanded(selectedFace.tempId)
                }
                expertiseLevel={expertiseLevel}
              />
            </View>
          )}

          {/* Expertise Level Toggle */}
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <TouchableOpacity
              style={styles.advancedToggle}
              onPress={() => {
                haptics.selection();
                const levels: ExpertiseLevel[] = [
                  "novice",
                  "intermediate",
                  "advanced",
                ];
                const currentIndex = levels.indexOf(expertiseLevel);
                const nextIndex = (currentIndex + 1) % levels.length;
                setExpertiseLevel(levels[nextIndex]);
              }}
            >
              <Ionicons
                name={
                  expertiseLevel === "advanced"
                    ? "build"
                    : expertiseLevel === "intermediate"
                    ? "build-outline"
                    : "sparkles-outline"
                }
                size={20}
                color={colors.primary}
              />
              <Text
                style={[styles.advancedToggleText, { color: colors.primary }]}
              >
                {expertiseLevel === "novice"
                  ? "Simple Mode"
                  : expertiseLevel === "intermediate"
                  ? "Standard Mode"
                  : "Advanced Mode"}
              </Text>
              <Text
                style={[
                  styles.advancedToggleHint,
                  { color: colors.textMuted },
                ]}
              >
                Tap to switch
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Preview Sheet */}
        <CardPreviewSheet
          card={editableCard}
          visible={showPreview}
          onClose={() => setShowPreview(false)}
        />
      </KeyboardAvoidingView>
    </ExpertiseLevelContext.Provider>
  );
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function convertToEditable(card: any): EditableCard {
  // Convert a canonical card to editable format
  // This is a simplified implementation
  const defaultFace = createEditableFace(true, 0);
  
  return {
    id: card.id,
    title: card.title || card.name || "",
    description: card.description,
    canonicalPrimitives: [],
    faces: [defaultFace],
    defaultFaceTempId: defaultFace.tempId,
    tags: card.tags || [],
    isNew: false,
    isDirty: false,
  };
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
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  headerButton: {
    padding: 8,
    minWidth: 60,
  },
  headerButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  section: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
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
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  previewButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  previewButtonText: {
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 4,
  },
  advancedToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  advancedToggleText: {
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 8,
  },
  advancedToggleHint: {
    fontSize: 12,
    marginLeft: 8,
  },
});
