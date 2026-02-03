// =============================================================================
// SORT EDITOR
// =============================================================================
// Editor for sort configuration

import React, { useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import { haptics } from "@/utils/animation";
import type { SortConfig, FilterField } from "./types";

// =============================================================================
// TYPES
// =============================================================================

export interface SortEditorProps {
  sorts: SortConfig[];
  onUpdate: (sorts: SortConfig[]) => void;
  fields: FilterField[];
  maxSorts?: number;
}

// =============================================================================
// SORT EDITOR COMPONENT
// =============================================================================

export function SortEditor({
  sorts,
  onUpdate,
  fields,
  maxSorts = 3,
}: SortEditorProps) {
  const colors = useColors();

  // Sortable fields (numbers and dates make the most sense)
  const sortableFields = fields.filter((f) =>
    ["number", "date", "string"].includes(f.type)
  );

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleAddSort = useCallback(
    (fieldId: string) => {
      if (sorts.length >= maxSorts) return;
      if (sorts.some((s) => s.fieldId === fieldId)) return;

      haptics.light();
      onUpdate([...sorts, { fieldId, direction: "asc" }]);
    },
    [sorts, maxSorts, onUpdate]
  );

  const handleRemoveSort = useCallback(
    (index: number) => {
      haptics.warning();
      onUpdate(sorts.filter((_, i) => i !== index));
    },
    [sorts, onUpdate]
  );

  const handleToggleDirection = useCallback(
    (index: number) => {
      haptics.selection();
      const newSorts = [...sorts];
      newSorts[index] = {
        ...newSorts[index],
        direction: newSorts[index].direction === "asc" ? "desc" : "asc",
      };
      onUpdate(newSorts);
    },
    [sorts, onUpdate]
  );

  const handleMoveSort = useCallback(
    (index: number, direction: "up" | "down") => {
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= sorts.length) return;

      haptics.light();
      const newSorts = [...sorts];
      const temp = newSorts[index];
      newSorts[index] = newSorts[newIndex];
      newSorts[newIndex] = temp;
      onUpdate(newSorts);
    },
    [sorts, onUpdate]
  );

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
    <View style={styles.container}>
      {/* Current Sorts */}
      {sorts.length > 0 && (
        <View style={styles.sortsList}>
          {sorts.map((sort, index) => {
            const field = fields.find((f) => f.id === sort.fieldId);
            if (!field) return null;

            return (
              <View
                key={sort.fieldId}
                style={[
                  styles.sortItem,
                  { backgroundColor: colors.surface },
                ]}
              >
                <View style={styles.sortOrder}>
                  <Text style={[styles.sortOrderText, { color: colors.textMuted }]}>
                    {index + 1}
                  </Text>
                </View>

                <View
                  style={[
                    styles.sortField,
                    { backgroundColor: categoryColors[field.category] + "15" },
                  ]}
                >
                  <Ionicons
                    name={field.icon as any}
                    size={14}
                    color={categoryColors[field.category]}
                  />
                  <Text
                    style={[
                      styles.sortFieldText,
                      { color: categoryColors[field.category] },
                    ]}
                  >
                    {field.label}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.directionButton,
                    { backgroundColor: colors.primary + "15" },
                  ]}
                  onPress={() => handleToggleDirection(index)}
                >
                  <Ionicons
                    name={sort.direction === "asc" ? "arrow-up" : "arrow-down"}
                    size={16}
                    color={colors.primary}
                  />
                  <Text style={[styles.directionText, { color: colors.primary }]}>
                    {sort.direction === "asc" ? "Asc" : "Desc"}
                  </Text>
                </TouchableOpacity>

                <View style={styles.sortActions}>
                  {index > 0 && (
                    <TouchableOpacity
                      onPress={() => handleMoveSort(index, "up")}
                      style={styles.actionButton}
                    >
                      <Ionicons
                        name="chevron-up"
                        size={18}
                        color={colors.textMuted}
                      />
                    </TouchableOpacity>
                  )}
                  {index < sorts.length - 1 && (
                    <TouchableOpacity
                      onPress={() => handleMoveSort(index, "down")}
                      style={styles.actionButton}
                    >
                      <Ionicons
                        name="chevron-down"
                        size={18}
                        color={colors.textMuted}
                      />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => handleRemoveSort(index)}
                    style={styles.actionButton}
                  >
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color={colors.error}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Empty State */}
      {sorts.length === 0 && (
        <View style={[styles.emptyState, { backgroundColor: colors.surfaceVariant }]}>
          <Ionicons name="swap-vertical-outline" size={24} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No sort order defined
          </Text>
          <Text style={[styles.emptyHint, { color: colors.textMuted }]}>
            Cards will appear in default order
          </Text>
        </View>
      )}

      {/* Add Sort */}
      {sorts.length < maxSorts && (
        <View style={styles.addSection}>
          <Text style={[styles.addLabel, { color: colors.textSecondary }]}>
            Add sort field:
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.fieldsScroll}
          >
            {sortableFields
              .filter((f) => !sorts.some((s) => s.fieldId === f.id))
              .map((field) => (
                <TouchableOpacity
                  key={field.id}
                  style={[
                    styles.fieldChip,
                    {
                      backgroundColor: colors.surfaceVariant,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => handleAddSort(field.id)}
                >
                  <Ionicons
                    name={field.icon as any}
                    size={14}
                    color={categoryColors[field.category]}
                  />
                  <Text
                    style={[styles.fieldChipText, { color: colors.text }]}
                  >
                    {field.label}
                  </Text>
                </TouchableOpacity>
              ))}
          </ScrollView>
        </View>
      )}

      {/* Max Sorts Note */}
      {sorts.length >= maxSorts && (
        <Text style={[styles.limitNote, { color: colors.textMuted }]}>
          Maximum {maxSorts} sort fields allowed
        </Text>
      )}
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {},
  sortsList: {
    gap: 8,
    marginBottom: 16,
  },
  sortItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 10,
    gap: 10,
  },
  sortOrder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sortOrderText: {
    fontSize: 12,
    fontWeight: "700",
  },
  sortField: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    flex: 1,
  },
  sortFieldText: {
    fontSize: 13,
    fontWeight: "500",
  },
  directionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  directionText: {
    fontSize: 12,
    fontWeight: "600",
  },
  sortActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionButton: {
    padding: 4,
  },
  emptyState: {
    alignItems: "center",
    padding: 24,
    borderRadius: 10,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "500",
    marginTop: 8,
  },
  emptyHint: {
    fontSize: 12,
    marginTop: 4,
  },
  addSection: {
    marginTop: 8,
  },
  addLabel: {
    fontSize: 13,
    marginBottom: 8,
  },
  fieldsScroll: {
    gap: 8,
    paddingRight: 16,
  },
  fieldChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  fieldChipText: {
    fontSize: 13,
  },
  limitNote: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },
});
