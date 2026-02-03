// =============================================================================
// REVIEW FACE SELECTOR
// =============================================================================
// Phase 6E: Face selection for multi-face cards during review

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import { haptics } from "@/utils/animation";
import type { ReviewFaceSelectorProps, ReviewFace } from "./types";

// =============================================================================
// FACE TAB COMPONENT
// =============================================================================

interface FaceTabProps {
  face: ReviewFace;
  index: number;
  isActive: boolean;
  onSelect: () => void;
  disabled: boolean;
  colors: any;
}

const FaceTab: React.FC<FaceTabProps> = ({
  face,
  index,
  isActive,
  onSelect,
  disabled,
  colors,
}) => {
  const getTypeIcon = (type: string): string => {
    const iconMap: Record<string, string> = {
      recognition: "eye-outline",
      recall: "bulb-outline",
      cloze: "code-slash-outline",
      application: "construct-outline",
      synthesis: "git-merge-outline",
      definition: "book-outline",
      true_false: "checkmark-done-outline",
      problem_solving: "calculator-outline",
    };
    return iconMap[type] || "help-outline";
  };

  const getDepthColor = (depth: string): string => {
    const colorMap: Record<string, string> = {
      remember: "#3B82F6",
      understand: "#8B5CF6",
      apply: "#10B981",
      analyze: "#F59E0B",
      evaluate: "#EF4444",
      create: "#EC4899",
    };
    return colorMap[depth] || colors.textMuted;
  };

  const depthColor = getDepthColor(face.depthLevel);

  return (
    <TouchableOpacity
      onPress={() => {
        if (!disabled) {
          haptics.light();
          onSelect();
        }
      }}
      disabled={disabled}
      style={[
        styles.faceTab,
        {
          backgroundColor: isActive
            ? depthColor + "20"
            : colors.surface,
          borderColor: isActive ? depthColor : colors.border,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      activeOpacity={0.7}
    >
      {/* Face number */}
      <View
        style={[
          styles.faceNumber,
          {
            backgroundColor: isActive ? depthColor : colors.surfaceVariant,
          },
        ]}
      >
        <Text
          style={[
            styles.faceNumberText,
            { color: isActive ? "#FFF" : colors.textMuted },
          ]}
        >
          {index + 1}
        </Text>
      </View>

      {/* Face info */}
      <View style={styles.faceInfo}>
        <View style={styles.faceTypeRow}>
          <Ionicons
            name={getTypeIcon(face.type) as any}
            size={14}
            color={isActive ? depthColor : colors.textSecondary}
          />
          <Text
            style={[
              styles.faceType,
              { color: isActive ? depthColor : colors.textSecondary },
            ]}
            numberOfLines={1}
          >
            {face.type.replace("_", " ")}
          </Text>
        </View>
        <Text
          style={[
            styles.faceDepth,
            { color: isActive ? depthColor : colors.textMuted },
          ]}
        >
          {face.depthLevel}
        </Text>
      </View>

      {/* Scaffolding indicator */}
      {face.scaffoldingLevel > 0 && (
        <View style={styles.scaffoldingIndicator}>
          {[...Array(Math.min(face.scaffoldingLevel, 3))].map((_, i) => (
            <View
              key={i}
              style={[
                styles.scaffoldingDot,
                {
                  backgroundColor: isActive
                    ? depthColor
                    : colors.textMuted,
                },
              ]}
            />
          ))}
        </View>
      )}

      {/* Active indicator */}
      {isActive && (
        <View
          style={[styles.activeIndicator, { backgroundColor: depthColor }]}
        />
      )}
    </TouchableOpacity>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const ReviewFaceSelector: React.FC<ReviewFaceSelectorProps> = ({
  faces,
  activeFaceIndex,
  onFaceSelect,
  disabled = false,
}) => {
  const colors = useColors();

  // Don't show selector for single-face cards
  if (faces.length <= 1) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerText, { color: colors.textSecondary }]}>
          Select Face
        </Text>
        <Text style={[styles.faceCount, { color: colors.textMuted }]}>
          {activeFaceIndex + 1} of {faces.length}
        </Text>
      </View>

      {/* Face tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsContainer}
      >
        {faces.map((face, index) => (
          <FaceTab
            key={face.id}
            face={face}
            index={index}
            isActive={index === activeFaceIndex}
            onSelect={() => onFaceSelect(index)}
            disabled={disabled}
            colors={colors}
          />
        ))}
      </ScrollView>

      {/* Disabled hint */}
      {disabled && (
        <View
          style={[styles.disabledHint, { backgroundColor: colors.warningLight }]}
        >
          <Ionicons name="lock-closed" size={12} color={colors.warning} />
          <Text style={[styles.disabledHintText, { color: colors.warning }]}>
            Rate current face before switching
          </Text>
        </View>
      )}
    </View>
  );
};

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  headerText: {
    fontSize: 13,
    fontWeight: "500",
  },
  faceCount: {
    fontSize: 12,
  },
  tabsContainer: {
    paddingHorizontal: 12,
    gap: 8,
  },
  faceTab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    marginHorizontal: 4,
    minWidth: 120,
    position: "relative",
    overflow: "hidden",
  },
  faceNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  faceNumberText: {
    fontSize: 12,
    fontWeight: "bold",
  },
  faceInfo: {
    flex: 1,
  },
  faceTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  faceType: {
    fontSize: 13,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  faceDepth: {
    fontSize: 11,
    textTransform: "capitalize",
    marginTop: 2,
  },
  scaffoldingIndicator: {
    flexDirection: "row",
    gap: 3,
    marginLeft: 8,
  },
  scaffoldingDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  activeIndicator: {
    position: "absolute",
    bottom: 0,
    left: 12,
    right: 12,
    height: 3,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  disabledHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    gap: 6,
  },
  disabledHintText: {
    fontSize: 12,
    fontWeight: "500",
  },
});

export default ReviewFaceSelector;
