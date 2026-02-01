// =============================================================================
// SETTING INFO COMPONENT
// =============================================================================
// Displays information icon with expandable explanations for settings
// Features:
// - Info icon (ⓘ) that shows tooltip on tap
// - "Learn more" expandable section with detailed explanation
// - Tips, warnings, and impact information

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import type { SettingExplanation } from "@manthanein/shared";

// =============================================================================
// TYPES
// =============================================================================

interface SettingInfoProps {
  /** The explanation content */
  explanation: SettingExplanation;
  /** Size of the info icon (default: 16) */
  size?: number;
  /** Color of the info icon (default: theme secondary) */
  color?: string;
  /** Whether to show inline tooltip or modal (default: modal) */
  inline?: boolean;
}

interface LearnMoreProps {
  /** The explanation content */
  explanation: SettingExplanation;
  /** Initial expanded state */
  initialExpanded?: boolean;
}

interface ExplanationModalProps {
  /** The explanation content */
  explanation: SettingExplanation;
  /** Setting name */
  settingName: string;
  /** Whether modal is visible */
  visible: boolean;
  /** Close handler */
  onClose: () => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// =============================================================================
// INFO ICON COMPONENT
// =============================================================================

export function SettingInfo({
  explanation,
  size = 16,
  color = "#6B7280",
  inline = false,
}: SettingInfoProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);

  const handlePress = useCallback(() => {
    if (inline) {
      setTooltipVisible((v) => !v);
    } else {
      setModalVisible(true);
    }
  }, [inline]);

  return (
    <View style={styles.infoContainer}>
      <TouchableOpacity
        onPress={handlePress}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Setting information"
        accessibilityRole="button"
        accessibilityHint="Tap to learn more about this setting"
      >
        <View
          style={[
            styles.infoIcon,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: color,
            },
          ]}
        >
          <Text style={[styles.infoIconText, { fontSize: size * 0.7, color }]}>
            i
          </Text>
        </View>
      </TouchableOpacity>

      {/* Inline Tooltip */}
      {inline && tooltipVisible && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipText}>{explanation.summary}</Text>
          {explanation.tips && explanation.tips.length > 0 && (
            <Text style={styles.tooltipTip}>💡 {explanation.tips[0]}</Text>
          )}
        </View>
      )}

      {/* Modal (for non-inline) */}
      {!inline && (
        <ExplanationModal
          explanation={explanation}
          settingName="Setting"
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
        />
      )}
    </View>
  );
}

// =============================================================================
// LEARN MORE COMPONENT
// =============================================================================

export function LearnMore({
  explanation,
  initialExpanded = false,
}: LearnMoreProps) {
  const expanded = useSharedValue(initialExpanded ? 1 : 0);
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((v) => !v);
    expanded.value = withTiming(isExpanded ? 0 : 1, { duration: 250 });
  }, [isExpanded, expanded]);

  const contentStyle = useAnimatedStyle(() => ({
    maxHeight: interpolate(
      expanded.value,
      [0, 1],
      [0, 500],
      Extrapolation.CLAMP,
    ),
    opacity: expanded.value,
    marginTop: interpolate(
      expanded.value,
      [0, 1],
      [0, 12],
      Extrapolation.CLAMP,
    ),
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${interpolate(expanded.value, [0, 1], [0, 180])}deg` },
    ],
  }));

  return (
    <View style={styles.learnMoreContainer}>
      <TouchableOpacity
        onPress={toggleExpanded}
        style={styles.learnMoreHeader}
        accessibilityLabel={isExpanded ? "Hide details" : "Learn more"}
        accessibilityRole="button"
      >
        <Text style={styles.learnMoreText}>Learn more</Text>
        <Animated.Text style={[styles.chevron, chevronStyle]}>▼</Animated.Text>
      </TouchableOpacity>

      <Animated.View style={[styles.learnMoreContent, contentStyle]}>
        {/* Detailed Explanation */}
        {explanation.detailed && (
          <View style={styles.section}>
            <Text style={styles.detailedText}>{explanation.detailed}</Text>
          </View>
        )}

        {/* Impact */}
        {explanation.impact && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📊 Impact</Text>
            <Text style={styles.sectionText}>{explanation.impact}</Text>
          </View>
        )}

        {/* Tips */}
        {explanation.tips && explanation.tips.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>💡 Tips</Text>
            {explanation.tips.map((tip, index) => (
              <Text key={index} style={styles.tipText}>
                • {tip}
              </Text>
            ))}
          </View>
        )}

        {/* Warnings */}
        {explanation.warnings && explanation.warnings.length > 0 && (
          <View style={styles.warningsSection}>
            <Text style={styles.warningTitle}>⚠️ Warnings</Text>
            {explanation.warnings.map((warning, index) => (
              <Text key={index} style={styles.warningText}>
                • {warning}
              </Text>
            ))}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

// =============================================================================
// EXPLANATION MODAL COMPONENT
// =============================================================================

export function ExplanationModal({
  explanation,
  settingName,
  visible,
  onClose,
}: ExplanationModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          style={styles.modalContent}
          onPress={(e) => e.stopPropagation()}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalScrollContent}
          >
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{settingName}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Summary */}
            <View style={styles.summarySection}>
              <Text style={styles.summaryText}>{explanation.summary}</Text>
            </View>

            {/* Detailed Explanation */}
            {explanation.detailed && (
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Details</Text>
                <Text style={styles.modalSectionText}>
                  {explanation.detailed}
                </Text>
              </View>
            )}

            {/* Impact */}
            {explanation.impact && (
              <View style={styles.modalSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionIcon}>📊</Text>
                  <Text style={styles.modalSectionTitle}>Impact</Text>
                </View>
                <Text style={styles.modalSectionText}>
                  {explanation.impact}
                </Text>
              </View>
            )}

            {/* Tips */}
            {explanation.tips && explanation.tips.length > 0 && (
              <View style={styles.modalSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionIcon}>💡</Text>
                  <Text style={styles.modalSectionTitle}>
                    Tips & Recommendations
                  </Text>
                </View>
                {explanation.tips.map((tip, index) => (
                  <View key={index} style={styles.tipItem}>
                    <Text style={styles.tipBullet}>•</Text>
                    <Text style={styles.tipItemText}>{tip}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Warnings */}
            {explanation.warnings && explanation.warnings.length > 0 && (
              <View style={[styles.modalSection, styles.warningSection]}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionIcon}>⚠️</Text>
                  <Text style={styles.warningModalTitle}>
                    Important Warnings
                  </Text>
                </View>
                {explanation.warnings.map((warning, index) => (
                  <View key={index} style={styles.warningItem}>
                    <Text style={styles.warningBullet}>!</Text>
                    <Text style={styles.warningItemText}>{warning}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// =============================================================================
// OPTION EXPLANATION COMPONENT
// =============================================================================

interface OptionExplanationProps {
  /** Option name */
  name: string;
  /** Option description */
  description: string;
  /** Whether this is the selected option */
  isSelected?: boolean;
  /** When to use this option */
  whenToUse?: string;
}

export function OptionExplanation({
  name,
  description,
  isSelected,
  whenToUse,
}: OptionExplanationProps) {
  return (
    <View style={[styles.optionContainer, isSelected && styles.optionSelected]}>
      <View style={styles.optionHeader}>
        <Text
          style={[styles.optionName, isSelected && styles.optionNameSelected]}
        >
          {name}
        </Text>
        {isSelected && <Text style={styles.selectedBadge}>Selected</Text>}
      </View>
      <Text style={styles.optionDescription}>{description}</Text>
      {whenToUse && (
        <Text style={styles.whenToUse}>
          <Text style={styles.whenToUseLabel}>Best for: </Text>
          {whenToUse}
        </Text>
      )}
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  // Info Icon
  infoContainer: {
    position: "relative",
  },
  infoIcon: {
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  infoIconText: {
    fontWeight: "600",
    fontStyle: "italic",
  },

  // Tooltip
  tooltip: {
    position: "absolute",
    top: "100%",
    right: 0,
    marginTop: 8,
    backgroundColor: "#1F2937",
    borderRadius: 8,
    padding: 12,
    width: 220,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 100,
  },
  tooltipText: {
    color: "#F3F4F6",
    fontSize: 13,
    lineHeight: 18,
  },
  tooltipTip: {
    color: "#FCD34D",
    fontSize: 12,
    marginTop: 8,
    fontStyle: "italic",
  },

  // Learn More
  learnMoreContainer: {
    marginTop: 4,
  },
  learnMoreHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  learnMoreText: {
    color: "#3B82F6",
    fontSize: 13,
    fontWeight: "500",
  },
  chevron: {
    marginLeft: 4,
    color: "#3B82F6",
    fontSize: 10,
  },
  learnMoreContent: {
    overflow: "hidden",
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
  },
  sectionText: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 19,
  },
  detailedText: {
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 20,
  },
  tipText: {
    fontSize: 13,
    color: "#059669",
    marginLeft: 8,
    marginTop: 4,
  },
  warningsSection: {
    backgroundColor: "#FEF3C7",
    padding: 10,
    borderRadius: 6,
    marginBottom: 8,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#92400E",
    marginBottom: 4,
  },
  warningText: {
    fontSize: 12,
    color: "#92400E",
    marginLeft: 8,
    marginTop: 2,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    maxWidth: Math.min(SCREEN_WIDTH - 40, 400),
    maxHeight: SCREEN_HEIGHT * 0.75,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  modalScrollContent: {
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    fontSize: 16,
    color: "#6B7280",
  },
  summarySection: {
    backgroundColor: "#EFF6FF",
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
  },
  summaryText: {
    fontSize: 14,
    color: "#1E40AF",
    lineHeight: 21,
  },
  modalSection: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  modalSectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },
  modalSectionText: {
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 21,
  },
  tipItem: {
    flexDirection: "row",
    marginTop: 6,
  },
  tipBullet: {
    color: "#059669",
    fontSize: 14,
    marginRight: 8,
  },
  tipItemText: {
    flex: 1,
    fontSize: 14,
    color: "#047857",
    lineHeight: 20,
  },
  warningSection: {
    backgroundColor: "#FEF3C7",
    padding: 14,
    borderRadius: 10,
  },
  warningModalTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#92400E",
  },
  warningItem: {
    flexDirection: "row",
    marginTop: 6,
  },
  warningBullet: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#F59E0B",
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 18,
    marginRight: 8,
  },
  warningItemText: {
    flex: 1,
    fontSize: 14,
    color: "#92400E",
    lineHeight: 20,
  },

  // Option Explanation
  optionContainer: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 12,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  optionSelected: {
    backgroundColor: "#EFF6FF",
    borderColor: "#3B82F6",
  },
  optionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  optionName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  optionNameSelected: {
    color: "#1D4ED8",
  },
  selectedBadge: {
    fontSize: 11,
    fontWeight: "500",
    color: "#1D4ED8",
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  optionDescription: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  whenToUse: {
    fontSize: 12,
    color: "#059669",
    marginTop: 6,
    fontStyle: "italic",
  },
  whenToUseLabel: {
    fontWeight: "600",
    fontStyle: "normal",
  },
});
