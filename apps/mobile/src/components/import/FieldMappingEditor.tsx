// =============================================================================
// IMPORT COMPONENTS - FIELD MAPPING EDITOR
// =============================================================================

import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import type { FieldMapping, ParsedSheet } from "@/stores/import.store";

// Target fields for flashcard mapping
const TARGET_FIELDS = [
  {
    value: "front",
    label: "Front (Question)",
    group: "content",
    required: true,
  },
  { value: "back", label: "Back (Answer)", group: "content", required: true },
  { value: "hint", label: "Hint", group: "content", required: false },
  { value: "notes", label: "Notes", group: "content", required: false },
  { value: "tags", label: "Tags", group: "metadata", required: false },
  { value: "deck", label: "Deck Name", group: "metadata", required: false },
  {
    value: "source",
    label: "Source/Reference",
    group: "metadata",
    required: false,
  },
] as const;

export interface FieldMappingEditorProps {
  sheet: ParsedSheet;
  mappings: FieldMapping[];
  suggestedMappings: FieldMapping[];
  onUpdateMappings: (mappings: FieldMapping[]) => void;
}

export function FieldMappingEditor({
  sheet,
  mappings,
  suggestedMappings,
  onUpdateMappings,
}: FieldMappingEditorProps) {
  const colors = useColors();
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);

  const getMappingForColumn = (
    columnName: string,
  ): FieldMapping | undefined => {
    return mappings.find((m) => m.sourceColumn === columnName);
  };

  const getTargetFieldInfo = (fieldValue: string) => {
    return TARGET_FIELDS.find((f) => f.value === fieldValue);
  };

  const handleColumnPress = (columnName: string) => {
    setSelectedColumn(columnName);
    setShowFieldPicker(true);
  };

  const handleSelectTargetField = (targetField: string) => {
    if (!selectedColumn) return;

    const existingIndex = mappings.findIndex(
      (m) => m.sourceColumn === selectedColumn,
    );

    let newMappings: FieldMapping[];
    if (targetField === "ignore") {
      // Remove mapping
      newMappings = mappings.filter((m) => m.sourceColumn !== selectedColumn);
    } else if (existingIndex >= 0) {
      // Update existing mapping
      newMappings = [...mappings];
      newMappings[existingIndex] = {
        ...newMappings[existingIndex],
        targetField,
      };
    } else {
      // Add new mapping
      newMappings = [
        ...mappings,
        { sourceColumn: selectedColumn, targetField },
      ];
    }

    onUpdateMappings(newMappings);
    setShowFieldPicker(false);
    setSelectedColumn(null);
  };

  const handleApplySuggestions = () => {
    onUpdateMappings([...suggestedMappings]);
  };

  const hasFrontMapping = mappings.some((m) => m.targetField === "front");
  const hasBackMapping = mappings.some((m) => m.targetField === "back");

  const contentFields = TARGET_FIELDS.filter((f) => f.group === "content");
  const metadataFields = TARGET_FIELDS.filter((f) => f.group === "metadata");

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          Map your columns
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Tell us which columns contain your flashcard content
        </Text>
      </View>

      {/* Validation Messages */}
      {(!hasFrontMapping || !hasBackMapping) && (
        <View
          style={[
            styles.validationCard,
            { backgroundColor: colors.warningLight },
          ]}
        >
          <Ionicons name="warning-outline" size={20} color={colors.warning} />
          <View style={styles.validationContent}>
            <Text style={[styles.validationTitle, { color: colors.warning }]}>
              Required mappings missing
            </Text>
            <Text style={[styles.validationText, { color: colors.warning }]}>
              {!hasFrontMapping && "• Front side is required\n"}
              {!hasBackMapping && "• Back side is required"}
            </Text>
          </View>
        </View>
      )}

      {/* Suggestions */}
      {suggestedMappings.length > 0 && mappings.length === 0 && (
        <TouchableOpacity
          onPress={handleApplySuggestions}
          style={[
            styles.suggestionCard,
            {
              backgroundColor: colors.primaryLight + "20",
              borderColor: colors.primary,
            },
          ]}
        >
          <View style={styles.suggestionHeader}>
            <Ionicons name="sparkles" size={20} color={colors.primary} />
            <Text style={[styles.suggestionTitle, { color: colors.primary }]}>
              Auto-detected mappings
            </Text>
          </View>
          <Text
            style={[styles.suggestionText, { color: colors.textSecondary }]}
          >
            We detected {suggestedMappings.length} potential field mappings. Tap
            to apply them.
          </Text>
        </TouchableOpacity>
      )}

      {/* Column List */}
      <ScrollView
        style={styles.columnList}
        showsVerticalScrollIndicator={false}
      >
        {sheet.columns.map((column) => {
          const mapping = getMappingForColumn(column.name);
          const targetInfo = mapping
            ? getTargetFieldInfo(mapping.targetField)
            : null;

          return (
            <TouchableOpacity
              key={column.index}
              onPress={() => handleColumnPress(column.name)}
              style={[
                styles.columnCard,
                {
                  backgroundColor: colors.card,
                  borderColor: mapping ? colors.primary : colors.border,
                  borderWidth: mapping ? 2 : 1,
                },
              ]}
            >
              <View style={styles.columnInfo}>
                <Text style={[styles.columnName, { color: colors.text }]}>
                  {column.name}
                </Text>
                <Text style={[styles.columnType, { color: colors.textMuted }]}>
                  {column.inferredType} • {column.sampleValues.length} samples
                </Text>
                {/* Sample values */}
                <Text
                  style={[styles.sampleValue, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  &quot;{column.sampleValues[0] || "empty"}&quot;
                </Text>
              </View>

              <View style={styles.mappingArrow}>
                <Ionicons
                  name="arrow-forward"
                  size={16}
                  color={colors.textMuted}
                />
              </View>

              <View style={styles.targetField}>
                {mapping ? (
                  <View
                    style={[
                      styles.targetBadge,
                      { backgroundColor: colors.primaryLight },
                    ]}
                  >
                    <Text
                      style={[styles.targetText, { color: colors.primary }]}
                    >
                      {targetInfo?.label || mapping.targetField}
                    </Text>
                  </View>
                ) : (
                  <View
                    style={[
                      styles.targetBadge,
                      { backgroundColor: colors.surfaceVariant },
                    ]}
                  >
                    <Text
                      style={[styles.targetText, { color: colors.textMuted }]}
                    >
                      Select field
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Field Picker Modal */}
      <Modal
        visible={showFieldPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowFieldPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.background },
            ]}
          >
            <View
              style={[styles.modalHeader, { borderBottomColor: colors.border }]}
            >
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Select target field
              </Text>
              <TouchableOpacity
                onPress={() => setShowFieldPicker(false)}
                style={styles.modalClose}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.fieldList}>
              {/* Content fields */}
              <Text
                style={[styles.fieldGroupTitle, { color: colors.textMuted }]}
              >
                Content
              </Text>
              {contentFields.map((field) => (
                <TouchableOpacity
                  key={field.value}
                  onPress={() => handleSelectTargetField(field.value)}
                  style={[
                    styles.fieldOption,
                    { borderBottomColor: colors.borderLight },
                  ]}
                >
                  <View style={styles.fieldOptionInfo}>
                    <Text
                      style={[styles.fieldOptionLabel, { color: colors.text }]}
                    >
                      {field.label}
                    </Text>
                  </View>
                  {field.required && (
                    <View
                      style={[
                        styles.requiredBadge,
                        { backgroundColor: colors.warningLight },
                      ]}
                    >
                      <Text
                        style={[styles.requiredText, { color: colors.warning }]}
                      >
                        Required
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}

              {/* Metadata fields */}
              <Text
                style={[styles.fieldGroupTitle, { color: colors.textMuted }]}
              >
                Metadata
              </Text>
              {metadataFields.map((field) => (
                <TouchableOpacity
                  key={field.value}
                  onPress={() => handleSelectTargetField(field.value)}
                  style={[
                    styles.fieldOption,
                    { borderBottomColor: colors.borderLight },
                  ]}
                >
                  <View style={styles.fieldOptionInfo}>
                    <Text
                      style={[styles.fieldOptionLabel, { color: colors.text }]}
                    >
                      {field.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}

              {/* Ignore option */}
              <Text
                style={[styles.fieldGroupTitle, { color: colors.textMuted }]}
              >
                Other
              </Text>
              <TouchableOpacity
                onPress={() => handleSelectTargetField("ignore")}
                style={[
                  styles.fieldOption,
                  { borderBottomColor: colors.borderLight },
                ]}
              >
                <View style={styles.fieldOptionInfo}>
                  <Text
                    style={[styles.fieldOptionLabel, { color: colors.text }]}
                  >
                    Ignore this column
                  </Text>
                  <Text
                    style={[
                      styles.fieldOptionDesc,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Do not import data from this column
                  </Text>
                </View>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  validationCard: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  validationContent: {
    flex: 1,
  },
  validationTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  validationText: {
    fontSize: 13,
  },
  suggestionCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  suggestionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  suggestionText: {
    fontSize: 13,
    marginLeft: 28,
  },
  columnList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  columnCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  columnInfo: {
    flex: 1,
  },
  columnName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  columnType: {
    fontSize: 12,
    marginBottom: 4,
  },
  sampleValue: {
    fontSize: 12,
    fontStyle: "italic",
  },
  mappingArrow: {
    paddingHorizontal: 12,
  },
  targetField: {
    minWidth: 100,
    alignItems: "flex-end",
  },
  targetBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  targetText: {
    fontSize: 13,
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    maxHeight: "70%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  modalClose: {
    padding: 4,
  },
  fieldList: {
    padding: 16,
  },
  fieldGroupTitle: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    marginTop: 8,
    marginBottom: 8,
  },
  fieldOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  fieldOptionInfo: {
    flex: 1,
  },
  fieldOptionLabel: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 2,
  },
  fieldOptionDesc: {
    fontSize: 13,
  },
  requiredBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  requiredText: {
    fontSize: 11,
    fontWeight: "600",
  },
});
