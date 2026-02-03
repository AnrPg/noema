// =============================================================================
// FILTER CONDITION EDITOR
// =============================================================================
// Editor for a single filter condition

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import { haptics } from "@/utils/animation";
import type { FilterConditionEditorProps, FilterField } from "./types";
import { OPERATOR_METADATA, FILTER_FIELDS } from "./types";

// =============================================================================
// FILTER CONDITION EDITOR COMPONENT
// =============================================================================

export function FilterConditionEditor({
  condition,
  fields,
  onUpdate,
  onDelete,
}: FilterConditionEditorProps) {
  const colors = useColors();
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [showOperatorPicker, setShowOperatorPicker] = useState(false);

  const field = fields.find((f) => f.id === condition.fieldId) || fields[0];
  const operatorMeta = OPERATOR_METADATA[condition.operator];

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleFieldChange = useCallback(
    (fieldId: string) => {
      const newField = fields.find((f) => f.id === fieldId);
      if (!newField) return;

      haptics.selection();
      onUpdate({
        ...condition,
        fieldId,
        operator: newField.operators[0],
        value: newField.type === "boolean" ? true : newField.type === "number" ? 0 : "",
        secondValue: undefined,
      });
      setShowFieldPicker(false);
    },
    [condition, fields, onUpdate]
  );

  const handleOperatorChange = useCallback(
    (operator: string) => {
      haptics.selection();
      onUpdate({
        ...condition,
        operator,
        secondValue: OPERATOR_METADATA[operator]?.valueCount === 2 ? "" : undefined,
      });
      setShowOperatorPicker(false);
    },
    [condition, onUpdate]
  );

  const handleValueChange = useCallback(
    (value: any) => {
      onUpdate({ ...condition, value });
    },
    [condition, onUpdate]
  );

  const handleSecondValueChange = useCallback(
    (secondValue: any) => {
      onUpdate({ ...condition, secondValue });
    },
    [condition, onUpdate]
  );

  // ==========================================================================
  // VALUE INPUT RENDERER
  // ==========================================================================

  const renderValueInput = (
    value: any,
    onChange: (val: any) => void,
    placeholder: string = "Value"
  ) => {
    if (field.type === "boolean" || operatorMeta?.valueCount === 0) {
      return null;
    }

    if (field.type === "enum" && field.enumValues) {
      return (
        <View style={styles.enumSelect}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {field.enumValues.map((enumVal) => {
              const isSelected = value === enumVal.value;
              return (
                <TouchableOpacity
                  key={enumVal.value}
                  style={[
                    styles.enumOption,
                    {
                      backgroundColor: isSelected
                        ? colors.primary + "20"
                        : colors.surfaceVariant,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => {
                    haptics.selection();
                    onChange(enumVal.value);
                  }}
                >
                  <Text
                    style={[
                      styles.enumOptionText,
                      { color: isSelected ? colors.primary : colors.text },
                    ]}
                  >
                    {enumVal.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      );
    }

    if (field.type === "number") {
      return (
        <TextInput
          style={[
            styles.valueInput,
            {
              backgroundColor: colors.surfaceVariant,
              color: colors.text,
              borderColor: colors.border,
            },
          ]}
          value={value?.toString() || ""}
          onChangeText={(text) => {
            const num = parseFloat(text);
            onChange(isNaN(num) ? 0 : num);
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
        />
      );
    }

    if (field.type === "date") {
      // For dates, we'll use a simple text input for now
      // In production, you'd use a date picker
      if (condition.operator === "within_days" || condition.operator === "older_than_days") {
        return (
          <View style={styles.daysInput}>
            <TextInput
              style={[
                styles.valueInput,
                styles.narrowInput,
                {
                  backgroundColor: colors.surfaceVariant,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              value={value?.toString() || ""}
              onChangeText={(text) => {
                const num = parseInt(text, 10);
                onChange(isNaN(num) ? 0 : num);
              }}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
            />
            <Text style={[styles.daysLabel, { color: colors.textMuted }]}>
              days
            </Text>
          </View>
        );
      }
      return (
        <TextInput
          style={[
            styles.valueInput,
            {
              backgroundColor: colors.surfaceVariant,
              color: colors.text,
              borderColor: colors.border,
            },
          ]}
          value={value || ""}
          onChangeText={onChange}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textMuted}
        />
      );
    }

    if (field.type === "array") {
      return (
        <TextInput
          style={[
            styles.valueInput,
            {
              backgroundColor: colors.surfaceVariant,
              color: colors.text,
              borderColor: colors.border,
            },
          ]}
          value={Array.isArray(value) ? value.join(", ") : value || ""}
          onChangeText={(text) => {
            onChange(text.split(",").map((s) => s.trim()).filter(Boolean));
          }}
          placeholder="value1, value2, ..."
          placeholderTextColor={colors.textMuted}
        />
      );
    }

    // Default: string
    return (
      <TextInput
        style={[
          styles.valueInput,
          {
            backgroundColor: colors.surfaceVariant,
            color: colors.text,
            borderColor: colors.border,
          },
        ]}
        value={value || ""}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
      />
    );
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  const categoryColors: Record<string, string> = {
    card: "#3b82f6",
    face: "#8b5cf6",
    scheduling: "#f59e0b",
    metadata: "#22c55e",
    custom: "#6b7280",
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      {/* Field Selector */}
      <TouchableOpacity
        style={[
          styles.fieldSelector,
          {
            backgroundColor: colors.surfaceVariant,
            borderColor: colors.border,
          },
        ]}
        onPress={() => setShowFieldPicker(true)}
      >
        <View
          style={[
            styles.fieldIcon,
            { backgroundColor: categoryColors[field.category] + "20" },
          ]}
        >
          <Ionicons
            name={field.icon as any}
            size={14}
            color={categoryColors[field.category]}
          />
        </View>
        <Text style={[styles.fieldLabel, { color: colors.text }]} numberOfLines={1}>
          {field.label}
        </Text>
        <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Operator Selector */}
      <TouchableOpacity
        style={[
          styles.operatorSelector,
          {
            backgroundColor: colors.primary + "10",
            borderColor: colors.primary + "30",
          },
        ]}
        onPress={() => setShowOperatorPicker(true)}
      >
        <Text style={[styles.operatorText, { color: colors.primary }]}>
          {operatorMeta?.label || condition.operator}
        </Text>
        <Ionicons name="chevron-down" size={12} color={colors.primary} />
      </TouchableOpacity>

      {/* Value Input(s) */}
      <View style={styles.valueContainer}>
        {renderValueInput(condition.value, handleValueChange, "Value")}
        {operatorMeta?.valueCount === 2 && (
          <>
            <Text style={[styles.andText, { color: colors.textMuted }]}>and</Text>
            {renderValueInput(condition.secondValue, handleSecondValueChange, "Value")}
          </>
        )}
      </View>

      {/* Delete Button */}
      <TouchableOpacity
        onPress={onDelete}
        style={styles.deleteButton}
      >
        <Ionicons name="close-circle" size={20} color={colors.error} />
      </TouchableOpacity>

      {/* Field Picker Modal */}
      <Modal
        visible={showFieldPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowFieldPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowFieldPicker(false)}
          />
          <View style={[styles.pickerSheet, { backgroundColor: colors.background }]}>
            <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>
                Select Field
              </Text>
              <TouchableOpacity onPress={() => setShowFieldPicker(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pickerContent}>
              {Object.entries(
                fields.reduce((acc, f) => {
                  acc[f.category] = acc[f.category] || [];
                  acc[f.category].push(f);
                  return acc;
                }, {} as Record<string, FilterField[]>)
              ).map(([category, categoryFields]) => (
                <View key={category} style={styles.pickerCategory}>
                  <Text
                    style={[
                      styles.pickerCategoryLabel,
                      { color: categoryColors[category] },
                    ]}
                  >
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </Text>
                  {categoryFields.map((f) => {
                    const isSelected = f.id === condition.fieldId;
                    return (
                      <TouchableOpacity
                        key={f.id}
                        style={[
                          styles.pickerOption,
                          isSelected && {
                            backgroundColor: colors.primary + "10",
                          },
                        ]}
                        onPress={() => handleFieldChange(f.id)}
                      >
                        <Ionicons
                          name={f.icon as any}
                          size={18}
                          color={isSelected ? colors.primary : colors.textMuted}
                        />
                        <View style={styles.pickerOptionText}>
                          <Text
                            style={[
                              styles.pickerOptionLabel,
                              {
                                color: isSelected ? colors.primary : colors.text,
                              },
                            ]}
                          >
                            {f.label}
                          </Text>
                          <Text
                            style={[
                              styles.pickerOptionDesc,
                              { color: colors.textMuted },
                            ]}
                          >
                            {f.description}
                          </Text>
                        </View>
                        {isSelected && (
                          <Ionicons
                            name="checkmark"
                            size={20}
                            color={colors.primary}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Operator Picker Modal */}
      <Modal
        visible={showOperatorPicker}
        animationType="fade"
        transparent
        onRequestClose={() => setShowOperatorPicker(false)}
      >
        <Pressable
          style={styles.operatorOverlay}
          onPress={() => setShowOperatorPicker(false)}
        >
          <View
            style={[
              styles.operatorDropdown,
              { backgroundColor: colors.surface },
            ]}
          >
            {field.operators.map((op) => {
              const opMeta = OPERATOR_METADATA[op];
              const isSelected = op === condition.operator;
              return (
                <TouchableOpacity
                  key={op}
                  style={[
                    styles.operatorOption,
                    isSelected && { backgroundColor: colors.primary + "10" },
                  ]}
                  onPress={() => handleOperatorChange(op)}
                >
                  <Text
                    style={[
                      styles.operatorOptionText,
                      { color: isSelected ? colors.primary : colors.text },
                    ]}
                  >
                    {opMeta?.label || op}
                  </Text>
                  {isSelected && (
                    <Ionicons
                      name="checkmark"
                      size={16}
                      color={colors.primary}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    padding: 10,
    borderRadius: 8,
    gap: 8,
  },
  fieldSelector: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minWidth: 120,
    maxWidth: 180,
  },
  fieldIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  operatorSelector: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  operatorText: {
    fontSize: 12,
    fontWeight: "600",
    marginRight: 4,
  },
  valueContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 8,
    minWidth: 100,
  },
  valueInput: {
    flex: 1,
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
    borderWidth: 1,
    minWidth: 80,
  },
  narrowInput: {
    minWidth: 60,
    flex: 0,
    width: 60,
  },
  daysInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  daysLabel: {
    fontSize: 13,
  },
  andText: {
    fontSize: 12,
  },
  enumSelect: {
    flex: 1,
  },
  enumOption: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 6,
  },
  enumOptionText: {
    fontSize: 12,
    fontWeight: "500",
  },
  deleteButton: {
    padding: 4,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  pickerSheet: {
    maxHeight: "70%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  pickerContent: {
    padding: 16,
  },
  pickerCategory: {
    marginBottom: 20,
  },
  pickerCategoryLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  pickerOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  pickerOptionText: {
    flex: 1,
    marginLeft: 12,
  },
  pickerOptionLabel: {
    fontSize: 15,
    fontWeight: "500",
  },
  pickerOptionDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  // Operator dropdown
  operatorOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  operatorDropdown: {
    borderRadius: 12,
    padding: 8,
    minWidth: 200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  operatorOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 8,
  },
  operatorOptionText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
