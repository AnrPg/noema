// =============================================================================
// FILTER GROUP EDITOR
// =============================================================================
// Editor for filter groups with AND/OR logic and nested groups

import React, { useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import { haptics } from "@/utils/animation";
import { FilterConditionEditor } from "./FilterConditionEditor";
import type {
  FilterGroupEditorProps,
  FilterGroup,
  FilterCondition,
} from "./types";
import { createFilterCondition, createFilterGroup } from "./types";

// =============================================================================
// FILTER GROUP EDITOR COMPONENT
// =============================================================================

export function FilterGroupEditor({
  group,
  fields,
  onUpdate,
  onDelete,
  isRoot = false,
  depth = 0,
}: FilterGroupEditorProps) {
  const colors = useColors();
  const maxDepth = 2; // Prevent deeply nested groups

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleLogicToggle = useCallback(() => {
    haptics.selection();
    onUpdate({
      ...group,
      logic: group.logic === "and" ? "or" : "and",
    });
  }, [group, onUpdate]);

  const handleAddCondition = useCallback(() => {
    haptics.light();
    const newCondition = createFilterCondition();
    onUpdate({
      ...group,
      conditions: [...group.conditions, newCondition],
    });
  }, [group, onUpdate]);

  const handleConditionUpdate = useCallback(
    (index: number, condition: FilterCondition) => {
      const newConditions = [...group.conditions];
      newConditions[index] = condition;
      onUpdate({ ...group, conditions: newConditions });
    },
    [group, onUpdate]
  );

  const handleConditionDelete = useCallback(
    (index: number) => {
      haptics.warning();
      onUpdate({
        ...group,
        conditions: group.conditions.filter((_, i) => i !== index),
      });
    },
    [group, onUpdate]
  );

  const handleAddGroup = useCallback(() => {
    haptics.light();
    const newGroup = createFilterGroup(group.logic === "and" ? "or" : "and");
    onUpdate({
      ...group,
      groups: [...group.groups, newGroup],
    });
  }, [group, onUpdate]);

  const handleGroupUpdate = useCallback(
    (index: number, updatedGroup: FilterGroup) => {
      const newGroups = [...group.groups];
      newGroups[index] = updatedGroup;
      onUpdate({ ...group, groups: newGroups });
    },
    [group, onUpdate]
  );

  const handleGroupDelete = useCallback(
    (index: number) => {
      haptics.warning();
      onUpdate({
        ...group,
        groups: group.groups.filter((_, i) => i !== index),
      });
    },
    [group, onUpdate]
  );

  // ==========================================================================
  // RENDER
  // ==========================================================================

  const isEmpty =
    group.conditions.length === 0 && group.groups.length === 0;
  const logicColor = group.logic === "and" ? colors.primary : colors.warning;

  return (
    <View
      style={[
        styles.container,
        !isRoot && [
          styles.nestedContainer,
          {
            borderLeftColor: logicColor,
            backgroundColor: colors.surfaceVariant + "50",
          },
        ],
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[
            styles.logicToggle,
            { backgroundColor: logicColor + "20", borderColor: logicColor },
          ]}
          onPress={handleLogicToggle}
        >
          <Text style={[styles.logicText, { color: logicColor }]}>
            {group.logic.toUpperCase()}
          </Text>
          <Ionicons name="chevron-down" size={14} color={logicColor} />
        </TouchableOpacity>

        <Text style={[styles.logicDescription, { color: colors.textMuted }]}>
          {group.logic === "and"
            ? "Match ALL of the following"
            : "Match ANY of the following"}
        </Text>

        {!isRoot && onDelete && (
          <TouchableOpacity onPress={onDelete} style={styles.deleteButton}>
            <Ionicons name="trash-outline" size={18} color={colors.error} />
          </TouchableOpacity>
        )}
      </View>

      {/* Conditions */}
      {group.conditions.map((condition, index) => (
        <View key={condition.id} style={styles.conditionWrapper}>
          <FilterConditionEditor
            condition={condition}
            fields={fields}
            onUpdate={(c: FilterCondition) => handleConditionUpdate(index, c)}
            onDelete={() => handleConditionDelete(index)}
          />
          {(index < group.conditions.length - 1 || group.groups.length > 0) && (
            <View style={styles.logicDivider}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text
                style={[
                  styles.dividerText,
                  { color: logicColor, backgroundColor: colors.surface },
                ]}
              >
                {group.logic.toUpperCase()}
              </Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>
          )}
        </View>
      ))}

      {/* Nested Groups */}
      {group.groups.map((nestedGroup, index) => (
        <View key={nestedGroup.id} style={styles.nestedGroupWrapper}>
          <FilterGroupEditor
            group={nestedGroup}
            fields={fields}
            onUpdate={(g) => handleGroupUpdate(index, g)}
            onDelete={() => handleGroupDelete(index)}
            depth={depth + 1}
          />
          {index < group.groups.length - 1 && (
            <View style={styles.logicDivider}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text
                style={[
                  styles.dividerText,
                  { color: logicColor, backgroundColor: colors.surface },
                ]}
              >
                {group.logic.toUpperCase()}
              </Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>
          )}
        </View>
      ))}

      {/* Empty State */}
      {isEmpty && (
        <View style={[styles.emptyState, { backgroundColor: colors.surfaceVariant }]}>
          <Ionicons name="filter-outline" size={24} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No filters added yet
          </Text>
          <Text style={[styles.emptyHint, { color: colors.textMuted }]}>
            Add conditions to filter your cards
          </Text>
        </View>
      )}

      {/* Add Buttons */}
      <View style={styles.addButtons}>
        <TouchableOpacity
          style={[
            styles.addButton,
            { backgroundColor: colors.primary + "15", borderColor: colors.primary },
          ]}
          onPress={handleAddCondition}
        >
          <Ionicons name="add" size={18} color={colors.primary} />
          <Text style={[styles.addButtonText, { color: colors.primary }]}>
            Add Condition
          </Text>
        </TouchableOpacity>

        {depth < maxDepth && (
          <TouchableOpacity
            style={[
              styles.addButton,
              { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
            ]}
            onPress={handleAddGroup}
          >
            <Ionicons name="git-branch-outline" size={18} color={colors.text} />
            <Text style={[styles.addButtonText, { color: colors.text }]}>
              Add Group
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {},
  nestedContainer: {
    borderLeftWidth: 3,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  logicToggle: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  logicText: {
    fontSize: 12,
    fontWeight: "700",
    marginRight: 4,
  },
  logicDescription: {
    fontSize: 12,
    flex: 1,
    marginLeft: 10,
  },
  deleteButton: {
    padding: 8,
  },
  conditionWrapper: {
    marginBottom: 8,
  },
  nestedGroupWrapper: {
    marginBottom: 8,
  },
  logicDivider: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 10,
    fontWeight: "700",
    paddingHorizontal: 12,
  },
  emptyState: {
    alignItems: "center",
    padding: 24,
    borderRadius: 8,
    marginBottom: 12,
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
  addButtons: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: "500",
    marginLeft: 6,
  },
});
