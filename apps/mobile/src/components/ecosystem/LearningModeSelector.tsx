// =============================================================================
// LEARNING MODE SELECTOR
// =============================================================================
// UI for selecting and configuring learning modes

import React, { useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from "react-native-reanimated";
import { useEcosystemStore, selectNavigation } from "@/stores";
import type { LearningMode, ViewLens } from "@manthanein/shared";

// =============================================================================
// TYPES
// =============================================================================

interface LearnigModeSelectorProps {
  onModeChange?: (mode: LearningMode) => void;
  onLensChange?: (lens: ViewLens) => void;
  compact?: boolean;
}

interface ModeOption {
  mode: LearningMode;
  icon: string;
  label: string;
  description: string;
  color: string;
}

interface LensOption {
  lens: ViewLens;
  icon: string;
  label: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const MODE_OPTIONS: ModeOption[] = [
  {
    mode: "exploration",
    icon: "🧭",
    label: "Exploration",
    description: "Wander freely, follow curiosity",
    color: "#8b5cf6", // Purple
  },
  {
    mode: "goal_driven",
    icon: "🎯",
    label: "Goal-Driven",
    description: "Work toward a target skill",
    color: "#3b82f6", // Blue
  },
  {
    mode: "exam_oriented",
    icon: "📚",
    label: "Exam Prep",
    description: "Time-bounded cramming mode",
    color: "#f59e0b", // Amber
  },
  {
    mode: "synthesis",
    icon: "🔗",
    label: "Synthesis",
    description: "Connect and integrate knowledge",
    color: "#22c55e", // Green
  },
];

const LENS_OPTIONS: LensOption[] = [
  { lens: "structure", icon: "🏗️", label: "Structure" },
  { lens: "flow", icon: "⏳", label: "Flow" },
  { lens: "bridge", icon: "🌉", label: "Bridge" },
  { lens: "progress", icon: "📊", label: "Progress" },
];

// =============================================================================
// MODE CARD COMPONENT
// =============================================================================

interface ModeCardProps {
  option: ModeOption;
  isActive: boolean;
  onPress: () => void;
  compact?: boolean;
}

const ModeCard: React.FC<ModeCardProps> = ({
  option,
  isActive,
  onPress,
  compact,
}) => {
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.95);
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1);
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: isActive ? option.color : "#1f2937",
    borderColor: isActive ? option.color : "#374151",
  }));

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={0.9}
    >
      <Animated.View
        style={[
          styles.modeCard,
          compact && styles.modeCardCompact,
          animatedStyle,
        ]}
      >
        <Text style={[styles.modeIcon, compact && styles.modeIconCompact]}>
          {option.icon}
        </Text>
        <Text
          style={[
            styles.modeLabel,
            compact && styles.modeLabelCompact,
            isActive && styles.modeLabelActive,
          ]}
        >
          {option.label}
        </Text>
        {!compact && (
          <Text
            style={[
              styles.modeDescription,
              isActive && styles.modeDescriptionActive,
            ]}
            numberOfLines={2}
          >
            {option.description}
          </Text>
        )}
        {isActive && (
          <View style={[styles.activeIndicator, { backgroundColor: "#fff" }]} />
        )}
      </Animated.View>
    </TouchableOpacity>
  );
};

// =============================================================================
// LENS PILL COMPONENT
// =============================================================================

interface LensPillProps {
  option: LensOption;
  isActive: boolean;
  onPress: () => void;
}

const LensPill: React.FC<LensPillProps> = ({ option, isActive, onPress }) => {
  return (
    <TouchableOpacity
      style={[styles.lensPill, isActive && styles.lensPillActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.lensIcon}>{option.icon}</Text>
      <Text style={[styles.lensLabel, isActive && styles.lensLabelActive]}>
        {option.label}
      </Text>
    </TouchableOpacity>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const LearningModeSelector: React.FC<LearnigModeSelectorProps> = ({
  onModeChange,
  onLensChange,
  compact = false,
}) => {
  const navigation = useEcosystemStore(selectNavigation);
  const setLearningMode = useEcosystemStore((s) => s.setLearningMode);
  const setViewLens = useEcosystemStore((s) => s.setViewLens);

  const handleModeSelect = useCallback(
    (mode: LearningMode) => {
      setLearningMode(mode);
      onModeChange?.(mode);
    },
    [setLearningMode, onModeChange],
  );

  const handleLensSelect = useCallback(
    (lens: ViewLens) => {
      setViewLens(lens);
      onLensChange?.(lens);
    },
    [setViewLens, onLensChange],
  );

  const activeMode = MODE_OPTIONS.find((o) => o.mode === navigation.mode);

  return (
    <View style={styles.container}>
      {/* Mode Selection */}
      <View style={styles.section}>
        {!compact && <Text style={styles.sectionTitle}>Learning Mode</Text>}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.modesContainer}
        >
          {MODE_OPTIONS.map((option) => (
            <ModeCard
              key={option.mode}
              option={option}
              isActive={navigation.mode === option.mode}
              onPress={() => handleModeSelect(option.mode)}
              compact={compact}
            />
          ))}
        </ScrollView>
      </View>

      {/* View Lens Selection */}
      <View style={styles.section}>
        {!compact && <Text style={styles.sectionTitle}>View Lens</Text>}
        <View style={styles.lensContainer}>
          {LENS_OPTIONS.map((option) => (
            <LensPill
              key={option.lens}
              option={option}
              isActive={navigation.lens === option.lens}
              onPress={() => handleLensSelect(option.lens)}
            />
          ))}
        </View>
      </View>

      {/* Current Mode Description */}
      {!compact && activeMode && (
        <View
          style={[
            styles.currentModeInfo,
            { borderLeftColor: activeMode.color },
          ]}
        >
          <View style={styles.currentModeHeader}>
            <Text style={styles.currentModeIcon}>{activeMode.icon}</Text>
            <Text style={styles.currentModeLabel}>{activeMode.label} Mode</Text>
          </View>
          <Text style={styles.currentModeDescription}>
            {getDetailedDescription(activeMode.mode)}
          </Text>
        </View>
      )}
    </View>
  );
};

// =============================================================================
// HELPERS
// =============================================================================

function getDetailedDescription(mode: LearningMode): string {
  switch (mode) {
    case "exploration":
      return "Browse freely through your knowledge territories. Let curiosity guide you to unexpected connections. Great for discovering new relationships between concepts.";
    case "goal_driven":
      return "Focus on a specific target category or skill. The system will show prerequisites and build a path to mastery. Perfect for deliberate practice.";
    case "exam_oriented":
      return "Maximize retention before a deadline. Prioritizes cards most likely to be forgotten, with increased review frequency. Ideal for test preparation.";
    case "synthesis":
      return "Connect disparate knowledge areas. Focus on cards that bridge multiple categories. Perfect for building deep understanding and creative insights.";
    default:
      return "";
  }
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 4,
  },

  // Modes
  modesContainer: {
    gap: 12,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  modeCard: {
    width: 130,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    position: "relative",
    overflow: "hidden",
  },
  modeCardCompact: {
    width: 80,
    padding: 8,
    alignItems: "center",
  },
  modeIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  modeIconCompact: {
    fontSize: 20,
    marginBottom: 4,
  },
  modeLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#f9fafb",
    marginBottom: 4,
  },
  modeLabelCompact: {
    fontSize: 11,
    marginBottom: 0,
    textAlign: "center",
  },
  modeLabelActive: {
    color: "#fff",
  },
  modeDescription: {
    fontSize: 11,
    color: "#9ca3af",
    lineHeight: 15,
  },
  modeDescriptionActive: {
    color: "rgba(255, 255, 255, 0.8)",
  },
  activeIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },

  // Lenses
  lensContainer: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    paddingHorizontal: 4,
  },
  lensPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#1f2937",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#374151",
    gap: 6,
  },
  lensPillActive: {
    backgroundColor: "#4f46e5",
    borderColor: "#4f46e5",
  },
  lensIcon: {
    fontSize: 14,
  },
  lensLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#d1d5db",
  },
  lensLabelActive: {
    color: "#fff",
  },

  // Current Mode Info
  currentModeInfo: {
    backgroundColor: "#1f2937",
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    marginHorizontal: 4,
  },
  currentModeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  currentModeIcon: {
    fontSize: 20,
  },
  currentModeLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#f9fafb",
  },
  currentModeDescription: {
    fontSize: 13,
    color: "#9ca3af",
    lineHeight: 20,
  },
});

export default LearningModeSelector;
