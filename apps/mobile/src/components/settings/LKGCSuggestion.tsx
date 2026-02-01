// =============================================================================
// LKGC SUGGESTION COMPONENT
// =============================================================================
// Displays LKGC (Last Known Good Configuration) suggestions and management
// Features:
// - User-friendly explanation of LKGC
// - Auto-suggestion when criteria are met
// - Easy acceptance/dismissal
// - Current LKGC indicator

import React, { useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  Dimensions,
} from "react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import type { LKGCEntry, LKGCSuggestion } from "@manthanein/shared";
import { useLKGC, useLKGCSuggestion, useSettingsStore } from "@/stores";

// =============================================================================
// TYPES
// =============================================================================

interface LKGCSuggestionBannerProps {
  suggestion: LKGCSuggestion;
  onAccept: () => void;
  onDismiss: () => void;
}

interface LKGCIndicatorProps {
  entry: LKGCEntry;
  onPress?: () => void;
}

interface LKGCModalProps {
  visible: boolean;
  onClose: () => void;
  currentLKGC?: LKGCEntry | null;
  onRestoreLKGC?: () => void;
  onClearLKGC?: () => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// =============================================================================
// LKGC SUGGESTION BANNER
// =============================================================================

export function LKGCSuggestionBanner({
  suggestion,
  onAccept,
  onDismiss,
}: LKGCSuggestionBannerProps) {
  return (
    <Animated.View
      entering={FadeInDown.duration(300)}
      exiting={FadeOutUp.duration(200)}
    >
      <View style={styles.banner}>
        <View style={styles.bannerHeader}>
          <Text style={styles.bannerIcon}>⭐</Text>
          <Text style={styles.bannerTitle}>Save Your Good Settings?</Text>
        </View>

        <Text style={styles.bannerText}>{suggestion.explanation}</Text>

        {/* Considerations */}
        {suggestion.considerations && suggestion.considerations.length > 0 && (
          <View style={styles.criteriaList}>
            {suggestion.considerations.map((detail, index) => (
              <View key={index} style={styles.criteriaItem}>
                <Text style={styles.criteriaCheck}>✓</Text>
                <Text style={styles.criteriaText}>{detail}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.bannerActions}>
          <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
            <Text style={styles.dismissButtonText}>Not Now</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.acceptButton} onPress={onAccept}>
            <Text style={styles.acceptButtonText}>⭐ Save as LKGC</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

// =============================================================================
// LKGC INDICATOR
// =============================================================================

export function LKGCIndicator({ entry, onPress }: LKGCIndicatorProps) {
  const formatDate = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { dateStyle: "medium" });
  };

  return (
    <TouchableOpacity
      style={styles.indicator}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.indicatorContent}>
        <Text style={styles.indicatorIcon}>⭐</Text>
        <View style={styles.indicatorInfo}>
          <Text style={styles.indicatorTitle}>LKGC Active</Text>
          <Text style={styles.indicatorDate}>
            Saved {formatDate(entry.taggedAt)}
          </Text>
        </View>
      </View>
      {onPress && <Text style={styles.indicatorChevron}>›</Text>}
    </TouchableOpacity>
  );
}

// =============================================================================
// LKGC INFO MODAL
// =============================================================================

export function LKGCModal({
  visible,
  onClose,
  currentLKGC,
  onRestoreLKGC,
  onClearLKGC,
}: LKGCModalProps) {
  const formatDate = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
      dateStyle: "long",
      timeStyle: "short",
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {currentLKGC ? "Your Saved Configuration" : "What is LKGC?"}
              </Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Explanation */}
            <View style={styles.explanationSection}>
              <Text style={styles.explanationTitle}>
                ⭐ Last Known Good Configuration
              </Text>
              <Text style={styles.explanationText}>
                LKGC (Last Known Good Configuration) is a safety feature that
                remembers your settings when they&apos;re working well for you.
              </Text>

              <View style={styles.benefitsList}>
                <View style={styles.benefitItem}>
                  <Text style={styles.benefitIcon}>🔄</Text>
                  <View style={styles.benefitInfo}>
                    <Text style={styles.benefitTitle}>Easy Recovery</Text>
                    <Text style={styles.benefitText}>
                      If you change settings and things don&apos;t work as well,
                      you can instantly go back to what was working.
                    </Text>
                  </View>
                </View>

                <View style={styles.benefitItem}>
                  <Text style={styles.benefitIcon}>🧪</Text>
                  <View style={styles.benefitInfo}>
                    <Text style={styles.benefitTitle}>
                      Safe Experimentation
                    </Text>
                    <Text style={styles.benefitText}>
                      Try new settings without fear—your good configuration is
                      always saved.
                    </Text>
                  </View>
                </View>

                <View style={styles.benefitItem}>
                  <Text style={styles.benefitIcon}>📊</Text>
                  <View style={styles.benefitInfo}>
                    <Text style={styles.benefitTitle}>Smart Suggestions</Text>
                    <Text style={styles.benefitText}>
                      We&apos;ll suggest saving when your stats show consistent
                      good performance.
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Current LKGC */}
            {currentLKGC && (
              <View style={styles.currentLKGCSection}>
                <Text style={styles.sectionTitle}>
                  Current Saved Configuration
                </Text>

                <View style={styles.lkgcDetails}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Saved:</Text>
                    <Text style={styles.detailValue}>
                      {formatDate(currentLKGC.taggedAt)}
                    </Text>
                  </View>

                  {currentLKGC.reason && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Reason:</Text>
                      <Text style={styles.detailValue}>
                        {currentLKGC.reason}
                      </Text>
                    </View>
                  )}

                  {currentLKGC.notes && (
                    <View style={styles.notesBox}>
                      <Text style={styles.notesText}>{currentLKGC.notes}</Text>
                    </View>
                  )}

                  {currentLKGC.performanceSnapshot && (
                    <View style={styles.statsGrid}>
                      <Text style={styles.statsTitle}>
                        Performance at save time:
                      </Text>
                      <View style={styles.statRow}>
                        <Text style={styles.statLabel}>Accuracy</Text>
                        <Text style={styles.statValue}>
                          {Math.round(
                            currentLKGC.performanceSnapshot.averageAccuracy *
                              100,
                          )}
                          %
                        </Text>
                      </View>
                      <View style={styles.statRow}>
                        <Text style={styles.statLabel}>Retention</Text>
                        <Text style={styles.statValue}>
                          {Math.round(
                            currentLKGC.performanceSnapshot.averageRetention *
                              100,
                          )}
                          %
                        </Text>
                      </View>
                      <View style={styles.statRow}>
                        <Text style={styles.statLabel}>Cards/day</Text>
                        <Text style={styles.statValue}>
                          {currentLKGC.performanceSnapshot.cardsReviewedPerDay}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* Actions */}
                <View style={styles.lkgcActions}>
                  {onRestoreLKGC && (
                    <TouchableOpacity
                      style={styles.restoreButton}
                      onPress={onRestoreLKGC}
                    >
                      <Text style={styles.restoreButtonText}>
                        ↩️ Restore This Configuration
                      </Text>
                    </TouchableOpacity>
                  )}
                  {onClearLKGC && (
                    <TouchableOpacity
                      style={styles.clearButton}
                      onPress={onClearLKGC}
                    >
                      <Text style={styles.clearButtonText}>Remove LKGC</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {/* No LKGC state */}
            {!currentLKGC && (
              <View style={styles.noLKGCSection}>
                <Text style={styles.noLKGCIcon}>💡</Text>
                <Text style={styles.noLKGCText}>
                  You don&apos;t have a saved configuration yet. Keep using the
                  app with your current settings, and we&apos;ll suggest saving
                  when your performance looks good!
                </Text>
                <Text style={styles.noLKGCTip}>
                  You can also create one manually from the History screen by
                  tagging any checkpoint as LKGC.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// =============================================================================
// INTEGRATED LKGC SECTION (for embedding in settings screen)
// =============================================================================

export function LKGCSection() {
  const lkgc = useLKGC();
  const suggestion = useLKGCSuggestion();
  const { acceptLKGCSuggestion, dismissLKGCSuggestion, clearLKGC } =
    useSettingsStore();
  const [modalVisible, setModalVisible] = React.useState(false);

  const handleAcceptSuggestion = useCallback(() => {
    acceptLKGCSuggestion();
  }, [acceptLKGCSuggestion]);

  const handleDismissSuggestion = useCallback(() => {
    dismissLKGCSuggestion();
  }, [dismissLKGCSuggestion]);

  const handleClearLKGC = useCallback(() => {
    clearLKGC();
    setModalVisible(false);
  }, [clearLKGC]);

  return (
    <View style={styles.lkgcSection}>
      {/* Suggestion Banner */}
      {suggestion && (
        <LKGCSuggestionBanner
          suggestion={suggestion}
          onAccept={handleAcceptSuggestion}
          onDismiss={handleDismissSuggestion}
        />
      )}

      {/* Current LKGC Indicator */}
      {lkgc && (
        <LKGCIndicator entry={lkgc} onPress={() => setModalVisible(true)} />
      )}

      {/* No LKGC - Info button */}
      {!lkgc && !suggestion && (
        <TouchableOpacity
          style={styles.learnMoreButton}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.learnMoreIcon}>⭐</Text>
          <Text style={styles.learnMoreText}>Learn about LKGC</Text>
          <Text style={styles.learnMoreChevron}>›</Text>
        </TouchableOpacity>
      )}

      {/* Modal */}
      <LKGCModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        currentLKGC={lkgc}
        onClearLKGC={lkgc ? handleClearLKGC : undefined}
      />
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  // Banner
  banner: {
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    padding: 16,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  bannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  bannerIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#92400E",
  },
  bannerText: {
    fontSize: 14,
    color: "#78350F",
    lineHeight: 20,
    marginBottom: 12,
  },
  criteriaList: {
    marginBottom: 14,
  },
  criteriaItem: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 3,
  },
  criteriaCheck: {
    fontSize: 14,
    color: "#059669",
    marginRight: 8,
    fontWeight: "600",
  },
  criteriaText: {
    fontSize: 13,
    color: "#78350F",
  },
  bannerActions: {
    flexDirection: "row",
    gap: 10,
  },
  dismissButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D97706",
  },
  dismissButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#92400E",
  },
  acceptButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#F59E0B",
    alignItems: "center",
  },
  acceptButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  // Indicator
  indicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  indicatorContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  indicatorIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  indicatorInfo: {
    flex: 1,
  },
  indicatorTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#92400E",
  },
  indicatorDate: {
    fontSize: 13,
    color: "#B45309",
    marginTop: 2,
  },
  indicatorChevron: {
    fontSize: 24,
    color: "#D97706",
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
    maxWidth: Math.min(SCREEN_WIDTH - 40, 420),
    maxHeight: "85%",
    width: "100%",
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

  // Explanation
  explanationSection: {
    marginBottom: 20,
  },
  explanationTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#F59E0B",
    marginBottom: 10,
  },
  explanationText: {
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 21,
    marginBottom: 16,
  },
  benefitsList: {
    gap: 14,
  },
  benefitItem: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  benefitIcon: {
    fontSize: 20,
    marginRight: 12,
    marginTop: 2,
  },
  benefitInfo: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 2,
  },
  benefitText: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },

  // Current LKGC
  currentLKGCSection: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 12,
  },
  lkgcDetails: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 14,
  },
  detailRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  detailLabel: {
    width: 70,
    fontSize: 13,
    color: "#6B7280",
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    color: "#374151",
    fontWeight: "500",
  },
  notesBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  notesText: {
    fontSize: 13,
    color: "#4B5563",
    fontStyle: "italic",
  },
  statsGrid: {
    marginTop: 12,
  },
  statsTitle: {
    fontSize: 12,
    color: "#9CA3AF",
    marginBottom: 6,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  statLabel: {
    fontSize: 13,
    color: "#6B7280",
  },
  statValue: {
    fontSize: 13,
    color: "#059669",
    fontWeight: "600",
  },
  lkgcActions: {
    marginTop: 16,
    gap: 10,
  },
  restoreButton: {
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#3B82F6",
    alignItems: "center",
  },
  restoreButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  clearButton: {
    paddingVertical: 10,
    alignItems: "center",
  },
  clearButtonText: {
    fontSize: 13,
    color: "#EF4444",
  },

  // No LKGC
  noLKGCSection: {
    alignItems: "center",
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  noLKGCIcon: {
    fontSize: 36,
    marginBottom: 12,
  },
  noLKGCText: {
    fontSize: 14,
    color: "#4B5563",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 12,
  },
  noLKGCTip: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    fontStyle: "italic",
  },

  // LKGC Section
  lkgcSection: {
    marginVertical: 8,
  },
  learnMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF7ED",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#FDBA74",
  },
  learnMoreIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  learnMoreText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#C2410C",
  },
  learnMoreChevron: {
    fontSize: 20,
    color: "#EA580C",
  },
});
