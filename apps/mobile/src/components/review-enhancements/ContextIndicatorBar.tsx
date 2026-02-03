// =============================================================================
// CONTEXT INDICATOR BAR
// =============================================================================
// Phase 6E: Display why a card was selected and relevant context

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import type { ContextIndicatorBarProps, CardContext } from "./types";
import { SELECTION_REASON_METADATA, formatRetrievability } from "./types";

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const ContextIndicatorBar: React.FC<ContextIndicatorBarProps> = ({
  context,
  isExpanded,
  onToggleExpand,
  compact = false,
}) => {
  const colors = useColors();
  const reasonMeta = SELECTION_REASON_METADATA[context.selectionReason];

  // Confidence indicator color
  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return "#10B981";
    if (confidence >= 0.5) return "#F59E0B";
    return "#EF4444";
  };

  // Relationship icon
  const getRelationshipIcon = (
    relationship?: string
  ): keyof typeof Ionicons.glyphMap => {
    const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
      prerequisite: "arrow-down-outline",
      sibling: "git-branch-outline",
      extension: "arrow-forward-outline",
      contrast: "swap-horizontal-outline",
    };
    return relationship
      ? iconMap[relationship] || "link-outline"
      : "link-outline";
  };

  return (
    <View style={styles.container}>
      {/* Main bar */}
      <TouchableOpacity
        onPress={onToggleExpand}
        style={[
          styles.mainBar,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
          compact && styles.mainBarCompact,
        ]}
        activeOpacity={0.7}
      >
        {/* Selection reason badge */}
        <View
          style={[
            styles.reasonBadge,
            { backgroundColor: reasonMeta.color + "20" },
          ]}
        >
          <Ionicons
            name={reasonMeta.icon as any}
            size={compact ? 14 : 16}
            color={reasonMeta.color}
          />
          <Text
            style={[
              styles.reasonText,
              { color: reasonMeta.color },
              compact && styles.reasonTextCompact,
            ]}
          >
            {reasonMeta.label}
          </Text>
        </View>

        {/* Confidence indicator */}
        <View style={styles.confidenceContainer}>
          <View
            style={[
              styles.confidenceDot,
              { backgroundColor: getConfidenceColor(context.confidence) },
            ]}
          />
          <Text
            style={[
              styles.confidenceText,
              { color: colors.textSecondary },
              compact && styles.confidenceTextCompact,
            ]}
          >
            {Math.round(context.confidence * 100)}%
          </Text>
        </View>

        {/* Relationship indicator */}
        {context.relationshipToPrevious && (
          <View
            style={[
              styles.relationshipBadge,
              { backgroundColor: colors.primaryLight },
            ]}
          >
            <Ionicons
              name={getRelationshipIcon(context.relationshipToPrevious)}
              size={compact ? 12 : 14}
              color={colors.primary}
            />
          </View>
        )}

        {/* Learning mode indicator */}
        {context.learningMode && (
          <View
            style={[
              styles.modeBadge,
              { backgroundColor: colors.primaryLight },
            ]}
          >
            <Text
              style={[
                styles.modeText,
                { color: colors.primary },
                compact && styles.modeTextCompact,
              ]}
            >
              {context.learningMode}
            </Text>
          </View>
        )}

        {/* Expand/collapse indicator */}
        <Ionicons
          name={isExpanded ? "chevron-up" : "chevron-down"}
          size={compact ? 16 : 20}
          color={colors.textMuted}
          style={styles.expandIcon}
        />
      </TouchableOpacity>

      {/* Expanded content */}
      {isExpanded && (
        <Animated.View
          style={[
            styles.expandedContent,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Description */}
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {reasonMeta.description}
          </Text>

          {/* Memory prediction summary */}
          {context.explainability?.memoryPrediction && (
            <View style={styles.memorySection}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Memory Status
              </Text>
              <View style={styles.memoryGrid}>
                <View style={styles.memoryItem}>
                  <Text
                    style={[styles.memoryLabel, { color: colors.textMuted }]}
                  >
                    Retrievability
                  </Text>
                  <Text style={[styles.memoryValue, { color: colors.primary }]}>
                    {formatRetrievability(
                      context.explainability.memoryPrediction.retrievability
                    )}
                  </Text>
                </View>
                <View style={styles.memoryItem}>
                  <Text
                    style={[styles.memoryLabel, { color: colors.textMuted }]}
                  >
                    Stability
                  </Text>
                  <Text style={[styles.memoryValue, { color: colors.success }]}>
                    {context.explainability.memoryPrediction.stability.toFixed(1)}d
                  </Text>
                </View>
                <View style={styles.memoryItem}>
                  <Text
                    style={[styles.memoryLabel, { color: colors.textMuted }]}
                  >
                    Difficulty
                  </Text>
                  <Text style={[styles.memoryValue, { color: colors.warning }]}>
                    {(
                      context.explainability.memoryPrediction.difficulty * 100
                    ).toFixed(0)}%
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Scheduling factors */}
          {context.explainability?.schedulingFactors &&
            context.explainability.schedulingFactors.length > 0 && (
              <View style={styles.factorsSection}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Why This Card?
                </Text>
                {context.explainability.schedulingFactors.map((factor, idx) => (
                  <View key={idx} style={styles.factorItem}>
                    <View style={styles.factorHeader}>
                      {factor.icon && (
                        <Ionicons
                          name={factor.icon as any}
                          size={14}
                          color={colors.primary}
                        />
                      )}
                      <Text
                        style={[styles.factorName, { color: colors.text }]}
                      >
                        {factor.factor}
                      </Text>
                      <View
                        style={[
                          styles.factorWeight,
                          { backgroundColor: colors.primaryLight },
                        ]}
                      >
                        <Text
                          style={[styles.factorWeightText, { color: colors.primary }]}
                        >
                          {Math.round(factor.weight * 100)}%
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.factorDescription,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {factor.description}
                    </Text>
                  </View>
                ))}
              </View>
            )}

          {/* Session goal context */}
          {context.sessionGoalContext && (
            <View
              style={[
                styles.goalContext,
                { backgroundColor: colors.successLight },
              ]}
            >
              <Ionicons
                name="flag-outline"
                size={14}
                color={colors.success}
              />
              <Text style={[styles.goalText, { color: colors.success }]}>
                {context.sessionGoalContext}
              </Text>
            </View>
          )}

          {/* Related cards hint */}
          {context.relatedCards && context.relatedCards.length > 0 && (
            <View style={styles.relatedSection}>
              <Ionicons
                name="git-branch-outline"
                size={14}
                color={colors.primary}
              />
              <Text style={[styles.relatedText, { color: colors.primary }]}>
                {context.relatedCards.length} related card
                {context.relatedCards.length > 1 ? "s" : ""} in this session
              </Text>
            </View>
          )}
        </Animated.View>
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
  mainBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  mainBarCompact: {
    paddingVertical: 8,
  },
  reasonBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  reasonText: {
    fontSize: 13,
    fontWeight: "600",
  },
  reasonTextCompact: {
    fontSize: 12,
  },
  confidenceContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  confidenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  confidenceText: {
    fontSize: 12,
    fontWeight: "500",
  },
  confidenceTextCompact: {
    fontSize: 11,
  },
  relationshipBadge: {
    padding: 4,
    borderRadius: 6,
  },
  modeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  modeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  modeTextCompact: {
    fontSize: 10,
  },
  expandIcon: {
    marginLeft: "auto",
  },
  expandedContent: {
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
  },
  memorySection: {
    marginBottom: 16,
  },
  memoryGrid: {
    flexDirection: "row",
    gap: 16,
  },
  memoryItem: {
    flex: 1,
    alignItems: "center",
  },
  memoryLabel: {
    fontSize: 11,
    marginBottom: 4,
  },
  memoryValue: {
    fontSize: 18,
    fontWeight: "bold",
  },
  factorsSection: {
    marginBottom: 16,
  },
  factorItem: {
    marginBottom: 10,
  },
  factorHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  factorName: {
    fontSize: 13,
    fontWeight: "500",
  },
  factorWeight: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: "auto",
  },
  factorWeightText: {
    fontSize: 11,
    fontWeight: "600",
  },
  factorDescription: {
    fontSize: 12,
    lineHeight: 18,
    marginLeft: 20,
  },
  goalContext: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    gap: 8,
    marginBottom: 12,
  },
  goalText: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  relatedSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  relatedText: {
    fontSize: 12,
  },
});

export default ContextIndicatorBar;
