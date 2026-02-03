// =============================================================================
// EXPLAINABILITY PANEL
// =============================================================================
// Phase 6E: Detailed explainability modal showing why a card was selected

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import type { ExplainabilityPanelProps, SchedulingFactor } from "./types";
import {
  formatRetrievability,
  formatStability,
  getDifficultyLabel,
} from "./types";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// =============================================================================
// FACTOR CARD COMPONENT
// =============================================================================

interface FactorCardProps {
  factor: SchedulingFactor;
  colors: any;
}

const FactorCard: React.FC<FactorCardProps> = ({ factor, colors }) => {
  // Color based on weight
  const getWeightColor = (weight: number): string => {
    if (weight >= 0.3) return "#10B981";
    if (weight >= 0.15) return "#F59E0B";
    return "#6B7280";
  };

  const weightColor = getWeightColor(factor.weight);

  return (
    <View style={[styles.factorCard, { backgroundColor: colors.surface }]}>
      <View style={styles.factorHeader}>
        <View
          style={[
            styles.factorIconContainer,
            { backgroundColor: weightColor + "15" },
          ]}
        >
          <Ionicons
            name={(factor.icon as any) || "analytics-outline"}
            size={18}
            color={weightColor}
          />
        </View>
        <View style={styles.factorInfo}>
          <Text style={[styles.factorName, { color: colors.text }]}>
            {factor.factor}
          </Text>
          <Text style={[styles.factorDescription, { color: colors.textSecondary }]}>
            {factor.description}
          </Text>
        </View>
      </View>

      {/* Weight bar */}
      <View style={styles.weightContainer}>
        <View
          style={[styles.weightBarBg, { backgroundColor: colors.surfaceVariant }]}
        >
          <View
            style={[
              styles.weightBarFill,
              {
                backgroundColor: weightColor,
                width: `${Math.min(factor.weight * 100, 100)}%`,
              },
            ]}
          />
        </View>
        <Text style={[styles.weightText, { color: weightColor }]}>
          {Math.round(factor.weight * 100)}%
        </Text>
      </View>
    </View>
  );
};

// =============================================================================
// MEMORY VISUALIZATION
// =============================================================================

interface MemoryVisualizationProps {
  retrievability: number;
  stability: number;
  difficulty: number;
  colors: any;
}

const MemoryVisualization: React.FC<MemoryVisualizationProps> = ({
  retrievability,
  stability,
  difficulty,
  colors,
}) => {
  return (
    <View style={[styles.memoryViz, { backgroundColor: colors.surface }]}>
      <Text style={[styles.memoryTitle, { color: colors.text }]}>
        Memory State
      </Text>

      {/* Retrievability gauge */}
      <View style={styles.gaugeContainer}>
        <View style={styles.gaugeLabel}>
          <Ionicons name="bulb-outline" size={18} color={colors.primary} />
          <Text style={[styles.gaugeLabelText, { color: colors.text }]}>
            Retrievability
          </Text>
        </View>
        <View
          style={[styles.gaugeBg, { backgroundColor: colors.surfaceVariant }]}
        >
          <View
            style={[
              styles.gaugeFill,
              {
                backgroundColor: colors.primary,
                width: `${retrievability * 100}%`,
              },
            ]}
          />
        </View>
        <Text style={[styles.gaugeValue, { color: colors.primary }]}>
          {formatRetrievability(retrievability)}
        </Text>
      </View>

      {/* Stability indicator */}
      <View style={styles.gaugeContainer}>
        <View style={styles.gaugeLabel}>
          <Ionicons name="shield-outline" size={18} color={colors.success} />
          <Text style={[styles.gaugeLabelText, { color: colors.text }]}>
            Stability
          </Text>
        </View>
        <View style={styles.stabilityValue}>
          <Text style={[styles.stabilityNumber, { color: colors.success }]}>
            {formatStability(stability)}
          </Text>
          <Text style={[styles.stabilityNote, { color: colors.textSecondary }]}>
            until next review
          </Text>
        </View>
      </View>

      {/* Difficulty indicator */}
      <View style={styles.gaugeContainer}>
        <View style={styles.gaugeLabel}>
          <Ionicons name="barbell-outline" size={18} color={colors.warning} />
          <Text style={[styles.gaugeLabelText, { color: colors.text }]}>
            Difficulty
          </Text>
        </View>
        <View
          style={[styles.gaugeBg, { backgroundColor: colors.surfaceVariant }]}
        >
          <View
            style={[
              styles.gaugeFill,
              {
                backgroundColor: colors.warning,
                width: `${difficulty * 100}%`,
              },
            ]}
          />
        </View>
        <Text style={[styles.gaugeValue, { color: colors.warning }]}>
          {getDifficultyLabel(difficulty)}
        </Text>
      </View>
    </View>
  );
};

// =============================================================================
// ALTERNATIVE CARDS SECTION
// =============================================================================

interface AlternativesProps {
  alternatives: { id: string; title?: string; reason: string; retrievability: number }[];
  colors: any;
}

const AlternativesSection: React.FC<AlternativesProps> = ({
  alternatives,
  colors,
}) => {
  return (
    <View style={styles.alternativesSection}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Other Candidates
      </Text>
      <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
        Cards that could have been shown instead
      </Text>

      {alternatives.map((alt, idx) => (
        <View
          key={alt.id}
          style={[styles.alternativeCard, { backgroundColor: colors.surface }]}
        >
          <View style={styles.alternativeHeader}>
            <Text style={[styles.alternativeRank, { color: colors.textMuted }]}>
              #{idx + 2}
            </Text>
            <Text
              style={[styles.alternativeTitle, { color: colors.text }]}
              numberOfLines={1}
            >
              {alt.title || `Card ${alt.id.slice(0, 8)}`}
            </Text>
            <Text style={[styles.alternativeRet, { color: colors.primary }]}>
              {formatRetrievability(alt.retrievability)}
            </Text>
          </View>
          <Text
            style={[styles.alternativeReason, { color: colors.textSecondary }]}
          >
            {alt.reason}
          </Text>
        </View>
      ))}
    </View>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const ExplainabilityPanel: React.FC<ExplainabilityPanelProps> = ({
  explainability,
  visible,
  onClose,
  showAlternatives = true,
}) => {
  const colors = useColors();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View
          style={[styles.header, { borderBottomColor: colors.border }]}
        >
          <View style={styles.headerContent}>
            <Ionicons
              name="analytics-outline"
              size={24}
              color={colors.primary}
            />
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              Card Selection Analysis
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeButton, { backgroundColor: colors.surface }]}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary */}
          <View
            style={[styles.summaryCard, { backgroundColor: colors.primaryLight }]}
          >
            <Ionicons
              name="information-circle"
              size={20}
              color={colors.primary}
            />
            <Text style={[styles.summaryText, { color: colors.primary }]}>
              {explainability.summary}
            </Text>
          </View>

          {/* Memory Visualization */}
          <MemoryVisualization
            retrievability={explainability.memoryPrediction.retrievability}
            stability={explainability.memoryPrediction.stability}
            difficulty={explainability.memoryPrediction.difficulty}
            colors={colors}
          />

          {/* Scheduling Factors */}
          {explainability.schedulingFactors.length > 0 && (
            <View style={styles.factorsSection}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Selection Factors
              </Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                What influenced this card&apos;s selection
              </Text>
              {explainability.schedulingFactors.map((factor, idx) => (
                <FactorCard key={idx} factor={factor} colors={colors} />
              ))}
            </View>
          )}

          {/* Alternative Cards */}
          {showAlternatives &&
            explainability.alternativeCards &&
            explainability.alternativeCards.length > 0 && (
              <AlternativesSection
                alternatives={explainability.alternativeCards}
                colors={colors}
              />
            )}

          {/* Expected Retention */}
          {explainability.memoryPrediction.expectedRetention !== undefined && (
            <View
              style={[
                styles.retentionCard,
                { backgroundColor: colors.successLight },
              ]}
            >
              <View style={styles.retentionHeader}>
                <Ionicons
                  name="trending-up-outline"
                  size={20}
                  color={colors.success}
                />
                <Text style={[styles.retentionTitle, { color: colors.success }]}>
                  Expected Outcome
                </Text>
              </View>
              <Text style={[styles.retentionText, { color: colors.success }]}>
                If you review this card now, your expected retention is{" "}
                <Text style={styles.retentionValue}>
                  {Math.round(
                    explainability.memoryPrediction.expectedRetention * 100
                  )}
                  %
                </Text>
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

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
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    borderRadius: 16,
    gap: 12,
    marginBottom: 20,
  },
  summaryText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500",
  },
  memoryViz: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
  },
  memoryTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
  },
  gaugeContainer: {
    marginBottom: 16,
  },
  gaugeLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  gaugeLabelText: {
    fontSize: 14,
    fontWeight: "500",
  },
  gaugeBg: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  gaugeFill: {
    height: "100%",
    borderRadius: 4,
  },
  gaugeValue: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 6,
    textAlign: "right",
  },
  stabilityValue: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  stabilityNumber: {
    fontSize: 24,
    fontWeight: "bold",
  },
  stabilityNote: {
    fontSize: 13,
  },
  factorsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    marginBottom: 12,
  },
  factorCard: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  factorHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  factorIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  factorInfo: {
    flex: 1,
  },
  factorName: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  factorDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  weightContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  weightBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  weightBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  weightText: {
    fontSize: 13,
    fontWeight: "600",
    minWidth: 40,
    textAlign: "right",
  },
  alternativesSection: {
    marginBottom: 20,
  },
  alternativeCard: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  alternativeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  alternativeRank: {
    fontSize: 12,
    fontWeight: "600",
  },
  alternativeTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  alternativeRet: {
    fontSize: 13,
    fontWeight: "600",
  },
  alternativeReason: {
    fontSize: 12,
    marginLeft: 24,
  },
  retentionCard: {
    padding: 16,
    borderRadius: 16,
  },
  retentionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  retentionTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  retentionText: {
    fontSize: 14,
    lineHeight: 22,
  },
  retentionValue: {
    fontWeight: "bold",
  },
});

export default ExplainabilityPanel;
