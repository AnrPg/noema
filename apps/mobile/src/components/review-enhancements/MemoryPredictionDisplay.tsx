// =============================================================================
// MEMORY PREDICTION DISPLAY
// =============================================================================
// Phase 6E: Visual display of FSRS memory model predictions

import React from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors, ThemeColors } from "@/theme/ThemeProvider";
import Svg, { Circle, G, Text as SvgText } from "react-native-svg";
import type { MemoryPredictionDisplayProps, MemoryPrediction } from "./types";
import {
  formatRetrievability,
  formatStability,
  getDifficultyLabel,
} from "./types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// =============================================================================
// CIRCULAR GAUGE COMPONENT
// =============================================================================

interface CircularGaugeProps {
  value: number; // 0-1
  size: number;
  strokeWidth: number;
  color: string;
  backgroundColor: string;
  label: string;
  valueLabel: string;
}

const CircularGauge: React.FC<CircularGaugeProps> = ({
  value,
  size,
  strokeWidth,
  color,
  backgroundColor,
  label,
  valueLabel,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - value);
  const center = size / 2;

  return (
    <View style={styles.gaugeContainer}>
      <Svg width={size} height={size}>
        <G rotation="-90" origin={`${center}, ${center}`}>
          {/* Background circle */}
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={backgroundColor}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Progress circle */}
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </G>
        {/* Center text */}
        <SvgText
          x={center}
          y={center + 4}
          textAnchor="middle"
          fontSize={size / 4}
          fontWeight="bold"
          fill={color}
        >
          {valueLabel}
        </SvgText>
      </Svg>
      <Text style={[styles.gaugeLabel, { color }]}>{label}</Text>
    </View>
  );
};

// =============================================================================
// COMPACT MODE COMPONENT
// =============================================================================

interface CompactDisplayProps {
  prediction: MemoryPrediction;
  colors: ThemeColors;
}

const CompactDisplay: React.FC<CompactDisplayProps> = ({
  prediction,
  colors,
}) => {
  return (
    <View style={[styles.compactContainer, { backgroundColor: colors.surface }]}>
      <View style={styles.compactItem}>
        <Ionicons name="bulb-outline" size={16} color={colors.primary} />
        <Text style={[styles.compactValue, { color: colors.primary }]}>
          {formatRetrievability(prediction.retrievability)}
        </Text>
      </View>
      <View style={styles.compactDivider} />
      <View style={styles.compactItem}>
        <Ionicons name="shield-outline" size={16} color={colors.success} />
        <Text style={[styles.compactValue, { color: colors.success }]}>
          {formatStability(prediction.stability)}
        </Text>
      </View>
      <View style={styles.compactDivider} />
      <View style={styles.compactItem}>
        <Ionicons name="barbell-outline" size={16} color={colors.warning} />
        <Text style={[styles.compactValue, { color: colors.warning }]}>
          {(prediction.difficulty * 100).toFixed(0)}%
        </Text>
      </View>
    </View>
  );
};

// =============================================================================
// DETAILED MODE COMPONENT
// =============================================================================

interface DetailedDisplayProps {
  prediction: MemoryPrediction;
  colors: ThemeColors;
}

const DetailedDisplay: React.FC<DetailedDisplayProps> = ({
  prediction,
  colors,
}) => {
  return (
    <View style={[styles.detailedContainer, { backgroundColor: colors.surface }]}>
      <Text style={[styles.detailedTitle, { color: colors.text }]}>
        Memory Status
      </Text>

      {/* Retrievability */}
      <View style={styles.detailedRow}>
        <View style={styles.detailedLabel}>
          <Ionicons name="bulb-outline" size={18} color={colors.primary} />
          <Text style={[styles.detailedLabelText, { color: colors.text }]}>
            Retrievability
          </Text>
        </View>
        <View style={styles.detailedValueContainer}>
          <View
            style={[styles.progressBar, { backgroundColor: colors.surfaceVariant }]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.primary,
                  width: `${prediction.retrievability * 100}%`,
                },
              ]}
            />
          </View>
          <Text style={[styles.detailedValue, { color: colors.primary }]}>
            {formatRetrievability(prediction.retrievability)}
          </Text>
        </View>
      </View>

      {/* Stability */}
      <View style={styles.detailedRow}>
        <View style={styles.detailedLabel}>
          <Ionicons name="shield-outline" size={18} color={colors.success} />
          <Text style={[styles.detailedLabelText, { color: colors.text }]}>
            Stability
          </Text>
        </View>
        <Text style={[styles.detailedValueLarge, { color: colors.success }]}>
          {formatStability(prediction.stability)}
        </Text>
      </View>

      {/* Difficulty */}
      <View style={styles.detailedRow}>
        <View style={styles.detailedLabel}>
          <Ionicons name="barbell-outline" size={18} color={colors.warning} />
          <Text style={[styles.detailedLabelText, { color: colors.text }]}>
            Difficulty
          </Text>
        </View>
        <View style={styles.detailedValueContainer}>
          <View
            style={[styles.progressBar, { backgroundColor: colors.surfaceVariant }]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.warning,
                  width: `${prediction.difficulty * 100}%`,
                },
              ]}
            />
          </View>
          <Text style={[styles.detailedValue, { color: colors.warning }]}>
            {getDifficultyLabel(prediction.difficulty)}
          </Text>
        </View>
      </View>

      {/* Optimal review time if available */}
      {prediction.optimalReviewTime && (
        <View
          style={[
            styles.optimalReviewBanner,
            { backgroundColor: colors.primaryLight },
          ]}
        >
          <Ionicons name="time-outline" size={16} color={colors.primary} />
          <Text style={[styles.optimalReviewText, { color: colors.primary }]}>
            Optimal review:{" "}
            {new Date(prediction.optimalReviewTime).toLocaleDateString()}
          </Text>
        </View>
      )}
    </View>
  );
};

// =============================================================================
// VISUAL MODE COMPONENT
// =============================================================================

interface VisualDisplayProps {
  prediction: MemoryPrediction;
  colors: ThemeColors;
}

const VisualDisplay: React.FC<VisualDisplayProps> = ({
  prediction,
  colors,
}) => {
  const gaugeSize = (SCREEN_WIDTH - 80) / 3;

  return (
    <View style={[styles.visualContainer, { backgroundColor: colors.surface }]}>
      <Text style={[styles.visualTitle, { color: colors.text }]}>
        Memory Prediction
      </Text>

      <View style={styles.gaugesRow}>
        <CircularGauge
          value={prediction.retrievability}
          size={gaugeSize}
          strokeWidth={8}
          color={colors.primary}
          backgroundColor={colors.surfaceVariant}
          label="Recall"
          valueLabel={formatRetrievability(prediction.retrievability)}
        />
        <CircularGauge
          value={Math.min(prediction.stability / 365, 1)}
          size={gaugeSize}
          strokeWidth={8}
          color={colors.success}
          backgroundColor={colors.surfaceVariant}
          label="Stability"
          valueLabel={formatStability(prediction.stability)}
        />
        <CircularGauge
          value={prediction.difficulty}
          size={gaugeSize}
          strokeWidth={8}
          color={colors.warning}
          backgroundColor={colors.surfaceVariant}
          label="Difficulty"
          valueLabel={`${(prediction.difficulty * 100).toFixed(0)}%`}
        />
      </View>

      {/* Expected retention after review */}
      {prediction.expectedRetention !== undefined && (
        <View
          style={[
            styles.expectedRetention,
            { backgroundColor: colors.successLight },
          ]}
        >
          <View style={styles.expectedHeader}>
            <Ionicons
              name="trending-up-outline"
              size={18}
              color={colors.success}
            />
            <Text style={[styles.expectedTitle, { color: colors.success }]}>
              After Review
            </Text>
          </View>
          <Text style={[styles.expectedValue, { color: colors.success }]}>
            {Math.round(prediction.expectedRetention * 100)}% retention
          </Text>
        </View>
      )}
    </View>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const MemoryPredictionDisplay: React.FC<MemoryPredictionDisplayProps> = ({
  prediction,
  mode,
}) => {
  const colors = useColors();

  switch (mode) {
    case "compact":
      return <CompactDisplay prediction={prediction} colors={colors} />;
    case "detailed":
      return <DetailedDisplay prediction={prediction} colors={colors} />;
    case "visual":
      return <VisualDisplay prediction={prediction} colors={colors} />;
    default:
      return <CompactDisplay prediction={prediction} colors={colors} />;
  }
};

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  // Compact styles
  compactContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  compactItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    justifyContent: "center",
  },
  compactValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  compactDivider: {
    width: 1,
    height: 20,
    backgroundColor: "#E5E7EB",
  },

  // Detailed styles
  detailedContainer: {
    padding: 16,
    borderRadius: 16,
  },
  detailedTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
  },
  detailedRow: {
    marginBottom: 16,
  },
  detailedLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  detailedLabelText: {
    fontSize: 14,
    fontWeight: "500",
  },
  detailedValueContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  detailedValue: {
    fontSize: 14,
    fontWeight: "600",
    minWidth: 50,
    textAlign: "right",
  },
  detailedValueLarge: {
    fontSize: 24,
    fontWeight: "bold",
  },
  optimalReviewBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  optimalReviewText: {
    fontSize: 13,
    fontWeight: "500",
  },

  // Visual styles
  visualContainer: {
    padding: 16,
    borderRadius: 16,
  },
  visualTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
    textAlign: "center",
  },
  gaugesRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
  },
  gaugeContainer: {
    alignItems: "center",
  },
  gaugeLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 8,
  },
  expectedRetention: {
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  expectedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  expectedTitle: {
    fontSize: 14,
    fontWeight: "500",
  },
  expectedValue: {
    fontSize: 20,
    fontWeight: "bold",
  },
});

export default MemoryPredictionDisplay;
