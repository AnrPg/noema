// =============================================================================
// HINT REVEALER
// =============================================================================
// Phase 6E: Progressive hint revelation component

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors, ThemeColors } from "@/theme/ThemeProvider";
import { haptics } from "@/utils/animation";
import type { HintRevealerProps, ContentPrimitive } from "./types";

// =============================================================================
// HINT ITEM COMPONENT
// =============================================================================

interface HintItemProps {
  hint: ContentPrimitive;
  index: number;
  isRevealed: boolean;
  colors: ThemeColors;
}

const HintItem: React.FC<HintItemProps> = ({
  hint,
  index,
  isRevealed,
  colors,
}) => {
  const animatedOpacity = React.useRef(new Animated.Value(0)).current;
  const animatedScale = React.useRef(new Animated.Value(0.9)).current;

  React.useEffect(() => {
    if (isRevealed) {
      Animated.parallel([
        Animated.timing(animatedOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(animatedScale, {
          toValue: 1,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isRevealed, animatedOpacity, animatedScale]);

  if (!isRevealed) {
    return (
      <View
        style={[
          styles.hintItemHidden,
          { backgroundColor: colors.surfaceVariant },
        ]}
      >
        <View
          style={[styles.hintNumber, { backgroundColor: colors.textMuted + "20" }]}
        >
          <Text style={[styles.hintNumberText, { color: colors.textMuted }]}>
            {index + 1}
          </Text>
        </View>
        <View style={styles.hintContentHidden}>
          <View
            style={[styles.hiddenLine, { backgroundColor: colors.textMuted + "30" }]}
          />
          <View
            style={[
              styles.hiddenLineShort,
              { backgroundColor: colors.textMuted + "20" },
            ]}
          />
        </View>
        <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.hintItem,
        {
          backgroundColor: colors.warningLight,
          opacity: animatedOpacity,
          transform: [{ scale: animatedScale }],
        },
      ]}
    >
      <View
        style={[styles.hintNumber, { backgroundColor: colors.warning + "30" }]}
      >
        <Text style={[styles.hintNumberText, { color: colors.warning }]}>
          {index + 1}
        </Text>
      </View>
      <View style={styles.hintContent}>
        {hint.type === "text" && (
          <Text style={[styles.hintText, { color: colors.text }]}>
            {hint.content}
          </Text>
        )}
        {hint.type === "markdown" && (
          <Text style={[styles.hintText, { color: colors.text }]}>
            {hint.content}
          </Text>
        )}
        {/* Other primitive types can be added here */}
      </View>
    </Animated.View>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const HintRevealer: React.FC<HintRevealerProps> = ({
  hints,
  revealedCount,
  onRevealNext,
  allRevealed,
}) => {
  const colors = useColors();
  const totalHints = hints.length;

  const handleRevealNext = () => {
    if (!allRevealed) {
      haptics.light();
      onRevealNext();
    }
  };

  if (totalHints === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="bulb" size={18} color={colors.warning} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Hints
          </Text>
          <View
            style={[styles.countBadge, { backgroundColor: colors.warning + "20" }]}
          >
            <Text style={[styles.countText, { color: colors.warning }]}>
              {revealedCount}/{totalHints}
            </Text>
          </View>
        </View>

        {/* Progress dots */}
        <View style={styles.progressDots}>
          {hints.map((_, idx) => (
            <View
              key={idx}
              style={[
                styles.progressDot,
                {
                  backgroundColor:
                    idx < revealedCount ? colors.warning : colors.surfaceVariant,
                },
              ]}
            />
          ))}
        </View>
      </View>

      {/* Hints list */}
      <View style={styles.hintsList}>
        {hints.map((hint, idx) => (
          <HintItem
            key={idx}
            hint={hint}
            index={idx}
            isRevealed={idx < revealedCount}
            colors={colors}
          />
        ))}
      </View>

      {/* Reveal button */}
      {!allRevealed && (
        <TouchableOpacity
          onPress={handleRevealNext}
          style={[styles.revealButton, { backgroundColor: colors.warning + "20" }]}
          activeOpacity={0.7}
        >
          <Ionicons name="eye-outline" size={18} color={colors.warning} />
          <Text style={[styles.revealButtonText, { color: colors.warning }]}>
            Reveal Next Hint
          </Text>
          <Text style={[styles.revealCount, { color: colors.warning + "80" }]}>
            ({totalHints - revealedCount} remaining)
          </Text>
        </TouchableOpacity>
      )}

      {/* All revealed message */}
      {allRevealed && (
        <View
          style={[styles.allRevealedBanner, { backgroundColor: colors.successLight }]}
        >
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={[styles.allRevealedText, { color: colors.success }]}>
            All hints revealed
          </Text>
        </View>
      )}

      {/* Hint penalty warning */}
      {revealedCount > 0 && !allRevealed && (
        <View style={[styles.penaltyWarning, { backgroundColor: colors.primaryLight + "20" }]}>
          <Ionicons
            name="information-circle"
            size={14}
            color={colors.primary}
          />
          <Text style={[styles.penaltyText, { color: colors.primary }]}>
            Using hints may affect your review score
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
    marginTop: 16,
    paddingHorizontal: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  countText: {
    fontSize: 12,
    fontWeight: "600",
  },
  progressDots: {
    flexDirection: "row",
    gap: 4,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  hintsList: {
    gap: 8,
  },
  hintItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    borderRadius: 12,
    gap: 10,
  },
  hintItemHidden: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    gap: 10,
  },
  hintNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  hintNumberText: {
    fontSize: 12,
    fontWeight: "bold",
  },
  hintContent: {
    flex: 1,
  },
  hintContentHidden: {
    flex: 1,
    gap: 6,
  },
  hiddenLine: {
    height: 10,
    borderRadius: 5,
    width: "80%",
  },
  hiddenLineShort: {
    height: 10,
    borderRadius: 5,
    width: "50%",
  },
  hintText: {
    fontSize: 14,
    lineHeight: 20,
  },
  revealButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
    marginTop: 12,
  },
  revealButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  revealCount: {
    fontSize: 12,
  },
  allRevealedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 6,
    marginTop: 12,
  },
  allRevealedText: {
    fontSize: 13,
    fontWeight: "500",
  },
  penaltyWarning: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
    marginTop: 8,
  },
  penaltyText: {
    fontSize: 12,
  },
});

export default HintRevealer;
