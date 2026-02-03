// =============================================================================
// ENHANCED RATING BUTTONS
// =============================================================================
// Phase 6E: Improved rating buttons with confidence slider and better UX

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useColors } from "@/theme/ThemeProvider";
import { haptics } from "@/utils/animation";
import type { EnhancedRatingButtonsProps, RatingButtonConfig } from "./types";
import { RATING_BUTTON_PRESETS, createReviewResponse } from "./types";

// =============================================================================
// RATING BUTTON COMPONENT
// =============================================================================

interface RatingButtonProps {
  config: RatingButtonConfig;
  onPress: () => void;
  isSelected: boolean;
  showSublabel: boolean;
  colors: any;
}

const RatingButton: React.FC<RatingButtonProps> = ({
  config,
  onPress,
  isSelected,
  showSublabel,
  colors,
}) => {
  const scale = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[styles.buttonContainer, { transform: [{ scale }] }]}
    >
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.ratingButton,
          {
            backgroundColor: config.color + "15",
            borderColor: isSelected ? config.color : config.color + "30",
            borderWidth: isSelected ? 3 : 2,
          },
        ]}
        activeOpacity={0.8}
      >
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: config.color + "20" },
          ]}
        >
          <Ionicons name={config.icon as any} size={24} color={config.color} />
        </View>
        <Text style={[styles.ratingLabel, { color: config.color }]}>
          {config.label}
        </Text>
        {showSublabel && config.sublabel && (
          <Text style={[styles.ratingSublabel, { color: config.color + "80" }]}>
            {config.sublabel}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

// =============================================================================
// CONFIDENCE SLIDER COMPONENT
// =============================================================================

interface ConfidenceSliderProps {
  value: number;
  onChange: (value: number) => void;
  colors: any;
}

const ConfidenceSlider: React.FC<ConfidenceSliderProps> = ({
  value,
  onChange,
  colors,
}) => {
  const getConfidenceLabel = (confidence: number): string => {
    if (confidence < 0.25) return "Guessing";
    if (confidence < 0.5) return "Uncertain";
    if (confidence < 0.75) return "Fairly sure";
    return "Confident";
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence < 0.25) return "#EF4444";
    if (confidence < 0.5) return "#F59E0B";
    if (confidence < 0.75) return "#3B82F6";
    return "#10B981";
  };

  return (
    <View style={[styles.confidenceContainer, { backgroundColor: colors.surface }]}>
      <View style={styles.confidenceHeader}>
        <Text style={[styles.confidenceTitle, { color: colors.text }]}>
          How confident were you?
        </Text>
        <View
          style={[
            styles.confidenceBadge,
            { backgroundColor: getConfidenceColor(value) + "20" },
          ]}
        >
          <Text
            style={[
              styles.confidenceValue,
              { color: getConfidenceColor(value) },
            ]}
          >
            {getConfidenceLabel(value)}
          </Text>
        </View>
      </View>

      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={1}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={getConfidenceColor(value)}
        maximumTrackTintColor={colors.surfaceVariant}
        thumbTintColor={getConfidenceColor(value)}
      />

      <View style={styles.sliderLabels}>
        <Text style={[styles.sliderLabel, { color: colors.textMuted }]}>
          Guessing
        </Text>
        <Text style={[styles.sliderLabel, { color: colors.textMuted }]}>
          Confident
        </Text>
      </View>
    </View>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const EnhancedRatingButtons: React.FC<EnhancedRatingButtonsProps> = ({
  onRate,
  faceId,
  responseStartTime,
  hintsRevealedCount,
  activeLensId,
  showConfidenceSlider = false,
  buttonConfig,
}) => {
  const colors = useColors();
  const [selectedRating, setSelectedRating] = useState<1 | 2 | 3 | 4 | null>(
    null
  );
  const [confidence, setConfidence] = useState(0.5);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Merge button config with presets
  const buttons: RatingButtonConfig[] = RATING_BUTTON_PRESETS.map(
    (preset, idx) => ({
      ...preset,
      ...buttonConfig?.[idx],
    })
  );

  const handleRatingPress = useCallback(
    (rating: 1 | 2 | 3 | 4) => {
      const config = buttons.find((b) => b.rating === rating);
      if (config) {
        haptics[config.hapticStyle]();
      }

      if (showConfidenceSlider) {
        setSelectedRating(rating);
        setShowConfirmation(true);
      } else {
        // Submit immediately
        const response = createReviewResponse(
          rating,
          faceId,
          responseStartTime,
          hintsRevealedCount,
          activeLensId
        );
        onRate(response);
      }
    },
    [
      buttons,
      showConfidenceSlider,
      faceId,
      responseStartTime,
      hintsRevealedCount,
      activeLensId,
      onRate,
    ]
  );

  const handleConfirm = useCallback(() => {
    if (selectedRating === null) return;

    const response = createReviewResponse(
      selectedRating,
      faceId,
      responseStartTime,
      hintsRevealedCount,
      activeLensId,
      confidence
    );
    onRate(response);
  }, [
    selectedRating,
    faceId,
    responseStartTime,
    hintsRevealedCount,
    activeLensId,
    confidence,
    onRate,
  ]);

  const handleCancel = useCallback(() => {
    setSelectedRating(null);
    setShowConfirmation(false);
  }, []);

  return (
    <View style={styles.container}>
      {/* Prompt */}
      <Text style={[styles.prompt, { color: colors.textSecondary }]}>
        How well did you remember?
      </Text>

      {/* Hints used indicator */}
      {hintsRevealedCount > 0 && (
        <View style={[styles.hintsUsed, { backgroundColor: colors.warningLight }]}>
          <Ionicons name="bulb-outline" size={14} color={colors.warning} />
          <Text style={[styles.hintsUsedText, { color: colors.warning }]}>
            {hintsRevealedCount} hint{hintsRevealedCount > 1 ? "s" : ""} used
          </Text>
        </View>
      )}

      {/* Rating buttons */}
      {!showConfirmation ? (
        <View style={styles.buttonsRow}>
          {buttons.map((config) => (
            <RatingButton
              key={config.rating}
              config={config}
              onPress={() => handleRatingPress(config.rating)}
              isSelected={selectedRating === config.rating}
              showSublabel={false}
              colors={colors}
            />
          ))}
        </View>
      ) : (
        /* Confirmation view with confidence slider */
        <View style={styles.confirmationContainer}>
          {/* Selected rating display */}
          {selectedRating && (
            <View style={styles.selectedRatingDisplay}>
              {buttons
                .filter((b) => b.rating === selectedRating)
                .map((config) => (
                  <View
                    key={config.rating}
                    style={[
                      styles.selectedRatingBadge,
                      { backgroundColor: config.color + "20" },
                    ]}
                  >
                    <Ionicons
                      name={config.icon as any}
                      size={24}
                      color={config.color}
                    />
                    <Text
                      style={[styles.selectedRatingText, { color: config.color }]}
                    >
                      {config.label}
                    </Text>
                  </View>
                ))}
            </View>
          )}

          {/* Confidence slider */}
          {showConfidenceSlider && (
            <ConfidenceSlider
              value={confidence}
              onChange={setConfidence}
              colors={colors}
            />
          )}

          {/* Action buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              onPress={handleCancel}
              style={[styles.cancelButton, { backgroundColor: colors.surface }]}
            >
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
                Change
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirm}
              style={[styles.confirmButton, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.confirmText, { color: colors.onPrimary }]}>
                Submit
              </Text>
            </TouchableOpacity>
          </View>
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
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  prompt: {
    textAlign: "center",
    marginBottom: 12,
    fontSize: 15,
  },
  hintsUsed: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 6,
    marginBottom: 12,
    alignSelf: "center",
  },
  hintsUsedText: {
    fontSize: 13,
    fontWeight: "500",
  },
  buttonsRow: {
    flexDirection: "row",
    gap: 8,
  },
  buttonContainer: {
    flex: 1,
  },
  ratingButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  ratingLabel: {
    fontWeight: "600",
    fontSize: 14,
  },
  ratingSublabel: {
    fontSize: 11,
    marginTop: 2,
    textAlign: "center",
  },
  confirmationContainer: {
    alignItems: "center",
  },
  selectedRatingDisplay: {
    marginBottom: 16,
  },
  selectedRatingBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    gap: 10,
  },
  selectedRatingText: {
    fontSize: 18,
    fontWeight: "600",
  },
  confidenceContainer: {
    width: "100%",
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  confidenceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  confidenceTitle: {
    fontSize: 15,
    fontWeight: "500",
  },
  confidenceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  confidenceValue: {
    fontSize: 13,
    fontWeight: "600",
  },
  slider: {
    width: "100%",
    height: 40,
  },
  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -4,
  },
  sliderLabel: {
    fontSize: 12,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
  },
  confirmButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  confirmText: {
    fontSize: 15,
    fontWeight: "600",
  },
});

export default EnhancedRatingButtons;
