// =============================================================================
// DEPTH LEVEL SELECTOR
// =============================================================================
// Selector for cognitive depth levels (Bloom's taxonomy inspired)

import React, { useState } from "react";
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
import type { DepthLevel } from "./types";
import { DEPTH_LEVEL_METADATA } from "./types";

// =============================================================================
// TYPES
// =============================================================================

export interface DepthLevelSelectorProps {
  value: DepthLevel;
  onChange: (level: DepthLevel) => void;
  showDescriptions?: boolean;
  compact?: boolean;
  disabled?: boolean;
}

// =============================================================================
// DEPTH LEVEL SELECTOR
// =============================================================================

export function DepthLevelSelector({
  value,
  onChange,
  showDescriptions = false,
  compact = false,
  disabled = false,
}: DepthLevelSelectorProps) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  const levels: DepthLevel[] = [
    "remember",
    "understand",
    "apply",
    "analyze",
    "evaluate",
    "create",
  ];

  const selectedMeta = DEPTH_LEVEL_METADATA[value];

  // ==========================================================================
  // COMPACT MODE
  // ==========================================================================

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <TouchableOpacity
          style={[
            styles.compactSelector,
            {
              backgroundColor: selectedMeta.color + "15",
              borderColor: selectedMeta.color,
            },
            disabled && styles.disabled,
          ]}
          onPress={() => !disabled && setExpanded(!expanded)}
          activeOpacity={disabled ? 1 : 0.7}
        >
          <View
            style={[
              styles.compactIndicator,
              { backgroundColor: selectedMeta.color },
            ]}
          />
          <Text
            style={[styles.compactLabel, { color: selectedMeta.color }]}
          >
            {selectedMeta.shortLabel}
          </Text>
          {!disabled && (
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={14}
              color={selectedMeta.color}
            />
          )}
        </TouchableOpacity>

        {expanded && !disabled && (
          <View
            style={[styles.compactDropdown, { backgroundColor: colors.surface }]}
          >
            {levels.map((level) => {
              const meta = DEPTH_LEVEL_METADATA[level];
              const isSelected = level === value;
              return (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.compactOption,
                    isSelected && { backgroundColor: meta.color + "15" },
                  ]}
                  onPress={() => {
                    haptics.selection();
                    onChange(level);
                    setExpanded(false);
                  }}
                >
                  <View
                    style={[
                      styles.compactIndicator,
                      { backgroundColor: meta.color },
                    ]}
                  />
                  <Text
                    style={[
                      styles.compactOptionLabel,
                      { color: isSelected ? meta.color : colors.text },
                    ]}
                  >
                    {meta.shortLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  }

  // ==========================================================================
  // FULL MODE
  // ==========================================================================

  return (
    <View style={styles.container}>
      {/* Visual Progress Bar */}
      <View style={[styles.progressBar, { backgroundColor: colors.surfaceVariant }]}>
        {levels.map((level, index) => {
          const meta = DEPTH_LEVEL_METADATA[level];
          const isSelected = level === value;
          const isBeforeSelected = levels.indexOf(value) > index;

          return (
            <TouchableOpacity
              key={level}
              style={[
                styles.progressSegment,
                {
                  backgroundColor: isSelected || isBeforeSelected
                    ? meta.color
                    : colors.surfaceVariant,
                  borderColor: isSelected ? meta.color : "transparent",
                },
                isSelected && styles.progressSegmentSelected,
              ]}
              onPress={() => {
                if (!disabled) {
                  haptics.selection();
                  onChange(level);
                }
              }}
              activeOpacity={disabled ? 1 : 0.7}
            >
              {isSelected && (
                <Ionicons name="checkmark" size={12} color="#fff" />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Labels */}
      <View style={styles.labelsRow}>
        <Text style={[styles.labelStart, { color: colors.textMuted }]}>
          Basic
        </Text>
        <Text style={[styles.labelEnd, { color: colors.textMuted }]}>
          Complex
        </Text>
      </View>

      {/* Selected Level Details */}
      <View
        style={[
          styles.selectedDetails,
          {
            backgroundColor: selectedMeta.color + "10",
            borderColor: selectedMeta.color + "30",
          },
        ]}
      >
        <View style={styles.selectedHeader}>
          <View
            style={[
              styles.selectedIndicator,
              { backgroundColor: selectedMeta.color },
            ]}
          />
          <Text style={[styles.selectedLabel, { color: selectedMeta.color }]}>
            {selectedMeta.label}
          </Text>
          <Text style={[styles.selectedShort, { color: colors.textMuted }]}>
            ({selectedMeta.shortLabel})
          </Text>
        </View>

        {showDescriptions && (
          <>
            <Text style={[styles.selectedDescription, { color: colors.text }]}>
              {selectedMeta.description}
            </Text>

            {/* Cognitive Verbs */}
            <View style={styles.verbsContainer}>
              <Text style={[styles.verbsLabel, { color: colors.textSecondary }]}>
                Cognitive verbs:
              </Text>
              <View style={styles.verbsList}>
                {selectedMeta.verbs.map((verb, index) => (
                  <View
                    key={index}
                    style={[
                      styles.verbChip,
                      { backgroundColor: selectedMeta.color + "15" },
                    ]}
                  >
                    <Text
                      style={[styles.verbText, { color: selectedMeta.color }]}
                    >
                      {verb}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}
      </View>

      {/* Level Grid (only if showDescriptions) */}
      {showDescriptions && (
        <View style={styles.levelGrid}>
          {levels.map((level) => {
            const meta = DEPTH_LEVEL_METADATA[level];
            const isSelected = level === value;
            return (
              <TouchableOpacity
                key={level}
                style={[
                  styles.levelCard,
                  {
                    backgroundColor: isSelected
                      ? meta.color + "15"
                      : colors.surfaceVariant,
                    borderColor: isSelected ? meta.color : colors.border,
                  },
                  disabled && styles.disabled,
                ]}
                onPress={() => {
                  if (!disabled) {
                    haptics.selection();
                    onChange(level);
                  }
                }}
                activeOpacity={disabled ? 1 : 0.7}
              >
                <View
                  style={[
                    styles.levelIndicator,
                    { backgroundColor: meta.color },
                  ]}
                />
                <Text
                  style={[
                    styles.levelLabel,
                    { color: isSelected ? meta.color : colors.text },
                  ]}
                  numberOfLines={1}
                >
                  {meta.shortLabel}
                </Text>
                {isSelected && (
                  <Ionicons
                    name="checkmark-circle"
                    size={14}
                    color={meta.color}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

// =============================================================================
// DEPTH LEVEL BADGE (For display only)
// =============================================================================

export interface DepthLevelBadgeProps {
  level: DepthLevel;
  size?: "small" | "medium";
  showLabel?: boolean;
}

export function DepthLevelBadge({
  level,
  size = "medium",
  showLabel = true,
}: DepthLevelBadgeProps) {
  const meta = DEPTH_LEVEL_METADATA[level];

  const indicatorSize = size === "small" ? 8 : 10;
  const fontSize = size === "small" ? 10 : 12;
  const padding = size === "small" ? { paddingHorizontal: 6, paddingVertical: 2 } : { paddingHorizontal: 8, paddingVertical: 4 };

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: meta.color + "15" },
        padding,
      ]}
    >
      <View
        style={[
          styles.badgeIndicator,
          { backgroundColor: meta.color, width: indicatorSize, height: indicatorSize },
        ]}
      />
      {showLabel && (
        <Text style={[styles.badgeLabel, { color: meta.color, fontSize }]}>
          {meta.shortLabel}
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
  // Progress bar styles
  progressBar: {
    flexDirection: "row",
    height: 24,
    borderRadius: 12,
    overflow: "hidden",
    gap: 2,
    padding: 2,
  },
  progressSegment: {
    flex: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  progressSegmentSelected: {
    borderWidth: 2,
  },
  labelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    marginHorizontal: 4,
  },
  labelStart: {
    fontSize: 10,
  },
  labelEnd: {
    fontSize: 10,
  },
  // Selected details
  selectedDetails: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  selectedHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  selectedIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  selectedLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  selectedShort: {
    fontSize: 12,
    marginLeft: 6,
  },
  selectedDescription: {
    fontSize: 13,
    marginTop: 8,
    lineHeight: 18,
  },
  verbsContainer: {
    marginTop: 10,
  },
  verbsLabel: {
    fontSize: 11,
    marginBottom: 6,
  },
  verbsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  verbChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  verbText: {
    fontSize: 11,
    fontWeight: "500",
  },
  // Level grid
  levelGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 12,
  },
  levelCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: "30%",
    flexGrow: 1,
  },
  levelIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  levelLabel: {
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
  },
  // Compact styles
  compactContainer: {
    position: "relative",
  },
  compactSelector: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  compactIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  compactLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginRight: 4,
  },
  compactDropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    marginTop: 4,
    borderRadius: 8,
    padding: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 100,
    minWidth: 120,
  },
  compactOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
  },
  compactOptionLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  // Badge styles
  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
  },
  badgeIndicator: {
    borderRadius: 10,
    marginRight: 4,
  },
  badgeLabel: {
    fontWeight: "600",
  },
  // Disabled
  disabled: {
    opacity: 0.5,
  },
});
