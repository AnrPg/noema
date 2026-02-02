/**
 * SynthesisPromptUI Component
 *
 * Displays synthesis prompts and captures user responses.
 * Part of the anti-fragmentation system that helps users connect
 * concepts across different contexts.
 *
 * Features:
 * - Beautiful prompt presentation
 * - Rich text response input
 * - Option to create bridge cards from responses
 * - Quality self-rating
 * - Dismissal with reason tracking
 */

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

type IconName = keyof typeof Ionicons.glyphMap;

import {
  useSubmitSynthesisResponse,
  useUpdatePromptStatus,
  type SynthesisPrompt,
} from "@/services/api";

// Prompt type configurations
const PROMPT_TYPE_CONFIG = {
  SYNTHESIS: {
    icon: "git-network",
    color: "#8E44AD",
    title: "Synthesis",
    description: "Connect ideas across contexts",
  },
  BRIDGE: {
    icon: "git-merge",
    color: "#E74C3C",
    title: "Bridge",
    description: "Link related concepts",
  },
  UNIFICATION: {
    icon: "infinite",
    color: "#3498DB",
    title: "Unification",
    description: "Merge understanding",
  },
  METACOGNITION: {
    icon: "bulb",
    color: "#F39C12",
    title: "Metacognition",
    description: "Reflect on learning",
  },
  DIVERGENCE_REFLECTION: {
    icon: "git-compare",
    color: "#E67E22",
    title: "Divergence Reflection",
    description: "Explore performance differences",
  },
  CROSS_CONTEXT: {
    icon: "layers",
    color: "#27AE60",
    title: "Cross-Context",
    description: "Apply across domains",
  },
  INSIGHT_CAPTURE: {
    icon: "flash",
    color: "#9B59B6",
    title: "Insight Capture",
    description: "Record your insights",
  },
} as const;

// Connection type options for bridge cards
const CONNECTION_TYPES = [
  { value: "CONCEPTUAL_SIMILARITY", label: "Similar Concepts", icon: "copy" },
  {
    value: "CAUSAL_RELATIONSHIP",
    label: "Cause & Effect",
    icon: "arrow-forward",
  },
  { value: "HIERARCHICAL", label: "Parent/Child", icon: "git-branch" },
  { value: "ANALOGICAL", label: "Analogy", icon: "swap-horizontal" },
  { value: "CONTRASTING", label: "Contrast", icon: "git-compare" },
  { value: "APPLICATION", label: "Application", icon: "construct" },
  { value: "SYNTHESIS", label: "Synthesis", icon: "git-network" },
] as const;

// Export props types for external use
export interface SynthesisPromptUIProps {
  prompt: SynthesisPrompt;
  userId: string;
  linkedCategories?: Array<{ id: string; name: string }>;
  onComplete?: () => void;
  onDismiss?: () => void;
}

export interface SynthesisPromptDisplayProps {
  prompt: SynthesisPrompt;
  showFullContext?: boolean;
}

export function SynthesisPromptUI({
  prompt,
  userId,
  linkedCategories = [],
  onComplete,
  onDismiss,
}: SynthesisPromptUIProps) {
  const [responseText, setResponseText] = useState("");
  const [qualityRating, setQualityRating] = useState(0);
  const [createBridgeCard, setCreateBridgeCard] = useState(false);
  const [bridgeQuestion, setBridgeQuestion] = useState("");
  const [bridgeAnswer, setBridgeAnswer] = useState("");
  const [selectedConnectionType, setSelectedConnectionType] =
    useState("SYNTHESIS");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showDismissModal, setShowDismissModal] = useState(false);
  const [dismissReason, setDismissReason] = useState("");
  const [isExpanded, setIsExpanded] = useState(true);

  // Mutations
  const submitResponse = useSubmitSynthesisResponse();
  const updateStatus = useUpdatePromptStatus();

  const isSubmitting = submitResponse.isPending || updateStatus.isPending;

  // Get prompt type config
  const typeConfig =
    PROMPT_TYPE_CONFIG[prompt.promptType as keyof typeof PROMPT_TYPE_CONFIG] ||
    PROMPT_TYPE_CONFIG.SYNTHESIS;

  // Validate response
  const isResponseValid = responseText.trim().length >= 10;
  const isBridgeCardValid =
    !createBridgeCard ||
    (bridgeQuestion.trim().length >= 5 &&
      bridgeAnswer.trim().length >= 5 &&
      selectedCategories.length >= 2);

  const canSubmit = isResponseValid && isBridgeCardValid && !isSubmitting;

  // Handle submit
  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    try {
      await submitResponse.mutateAsync({
        promptId: prompt.id,
        userId,
        responseText: responseText.trim(),
        qualityRating: qualityRating > 0 ? qualityRating : undefined,
        createBridgeCard,
        bridgeCardData: createBridgeCard
          ? {
              bridgeQuestion: bridgeQuestion.trim(),
              bridgeAnswer: bridgeAnswer.trim(),
              connectionType: selectedConnectionType,
              linkedCategoryIds: selectedCategories,
            }
          : undefined,
      });

      onComplete?.();
    } catch (error) {
      Alert.alert("Error", "Failed to submit response. Please try again.");
    }
  }, [
    canSubmit,
    submitResponse,
    prompt.id,
    userId,
    responseText,
    qualityRating,
    createBridgeCard,
    bridgeQuestion,
    bridgeAnswer,
    selectedConnectionType,
    selectedCategories,
    onComplete,
  ]);

  // Handle dismiss
  const handleDismiss = useCallback(async () => {
    try {
      await updateStatus.mutateAsync({
        promptId: prompt.id,
        status: "DISMISSED",
        dismissReason: dismissReason.trim() || undefined,
      });

      setShowDismissModal(false);
      onDismiss?.();
    } catch (error) {
      Alert.alert("Error", "Failed to dismiss prompt.");
    }
  }, [updateStatus, prompt.id, dismissReason, onDismiss]);

  // Handle mark as shown
  const handleMarkShown = useCallback(async () => {
    if (prompt.status === "PENDING") {
      try {
        await updateStatus.mutateAsync({
          promptId: prompt.id,
          status: "SHOWN",
        });
      } catch (error) {
        // Silent failure for status update
      }
    }
  }, [updateStatus, prompt.id, prompt.status]);

  // Mark as shown when component mounts
  React.useEffect(() => {
    handleMarkShown();
  }, [handleMarkShown]);

  // Toggle category selection
  const toggleCategory = (categoryId: string) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId],
    );
  };

  // Quality rating stars
  const renderQualityRating = () => (
    <View style={styles.ratingContainer}>
      <Text style={styles.ratingLabel}>How insightful is your response?</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => setQualityRating(star)}
            style={styles.starButton}
          >
            <Ionicons
              name={star <= qualityRating ? "star" : "star-outline"}
              size={28}
              color={star <= qualityRating ? "#FFD700" : "#CCC"}
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View
          style={[styles.header, { backgroundColor: typeConfig.color + "15" }]}
        >
          <View style={styles.headerLeft}>
            <View
              style={[styles.iconCircle, { backgroundColor: typeConfig.color }]}
            >
              <Ionicons
                name={typeConfig.icon as IconName}
                size={20}
                color="#FFF"
              />
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.typeLabel, { color: typeConfig.color }]}>
                {typeConfig.title}
              </Text>
              <Text style={styles.typeDescription}>
                {typeConfig.description}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => setIsExpanded(!isExpanded)}
            style={styles.expandButton}
          >
            <Ionicons
              name={isExpanded ? "chevron-up" : "chevron-down"}
              size={24}
              color="#666"
            />
          </TouchableOpacity>
        </View>

        {isExpanded && (
          <>
            {/* Card Context */}
            {prompt.card && (
              <View style={styles.cardContext}>
                <Ionicons name="card" size={16} color="#888" />
                <Text style={styles.cardContextText} numberOfLines={2}>
                  {prompt.card.front}
                </Text>
              </View>
            )}

            {/* Prompt Text */}
            <View style={styles.promptSection}>
              <Text style={styles.promptText}>{prompt.promptText}</Text>
            </View>

            {/* Response Input */}
            <View style={styles.responseSection}>
              <Text style={styles.sectionTitle}>Your Response</Text>
              <TextInput
                style={styles.responseInput}
                placeholder="Share your thoughts, connections, or insights..."
                placeholderTextColor="#AAA"
                value={responseText}
                onChangeText={setResponseText}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>
                {responseText.length} characters (minimum 10)
              </Text>
            </View>

            {/* Quality Rating */}
            {renderQualityRating()}

            {/* Bridge Card Option */}
            <View style={styles.bridgeSection}>
              <TouchableOpacity
                style={styles.bridgeToggle}
                onPress={() => setCreateBridgeCard(!createBridgeCard)}
              >
                <View style={styles.checkbox}>
                  {createBridgeCard && (
                    <Ionicons name="checkmark" size={16} color="#FFF" />
                  )}
                </View>
                <View style={styles.bridgeToggleText}>
                  <Text style={styles.bridgeToggleTitle}>
                    Create a Bridge Card
                  </Text>
                  <Text style={styles.bridgeToggleSubtitle}>
                    Turn this insight into a reusable connection
                  </Text>
                </View>
              </TouchableOpacity>

              {createBridgeCard && (
                <View style={styles.bridgeForm}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Bridge Question</Text>
                    <TextInput
                      style={styles.bridgeInput}
                      placeholder="How does X relate to Y?"
                      value={bridgeQuestion}
                      onChangeText={setBridgeQuestion}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Bridge Answer</Text>
                    <TextInput
                      style={[styles.bridgeInput, styles.bridgeAnswerInput]}
                      placeholder="Explain the connection..."
                      value={bridgeAnswer}
                      onChangeText={setBridgeAnswer}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Connection Type</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.connectionTypesScroll}
                    >
                      {CONNECTION_TYPES.map((type) => (
                        <TouchableOpacity
                          key={type.value}
                          style={[
                            styles.connectionTypeChip,
                            selectedConnectionType === type.value &&
                              styles.connectionTypeChipActive,
                          ]}
                          onPress={() => setSelectedConnectionType(type.value)}
                        >
                          <Ionicons
                            name={type.icon as IconName}
                            size={14}
                            color={
                              selectedConnectionType === type.value
                                ? "#FFF"
                                : "#666"
                            }
                          />
                          <Text
                            style={[
                              styles.connectionTypeText,
                              selectedConnectionType === type.value &&
                                styles.connectionTypeTextActive,
                            ]}
                          >
                            {type.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  {linkedCategories.length > 0 && (
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>
                        Link to Categories (select at least 2)
                      </Text>
                      <View style={styles.categoriesGrid}>
                        {linkedCategories.map((cat) => (
                          <TouchableOpacity
                            key={cat.id}
                            style={[
                              styles.categoryChip,
                              selectedCategories.includes(cat.id) &&
                                styles.categoryChipActive,
                            ]}
                            onPress={() => toggleCategory(cat.id)}
                          >
                            <Text
                              style={[
                                styles.categoryChipText,
                                selectedCategories.includes(cat.id) &&
                                  styles.categoryChipTextActive,
                              ]}
                            >
                              {cat.name}
                            </Text>
                            {selectedCategories.includes(cat.id) && (
                              <Ionicons
                                name="checkmark"
                                size={14}
                                color="#FFF"
                              />
                            )}
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Action Buttons */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.dismissButton}
                onPress={() => setShowDismissModal(true)}
                disabled={isSubmitting}
              >
                <Text style={styles.dismissButtonText}>Skip</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  !canSubmit && styles.submitButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={!canSubmit}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                    <Text style={styles.submitButtonText}>Submit</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {/* Dismiss Modal */}
      <Modal
        visible={showDismissModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDismissModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Skip this prompt?</Text>
            <Text style={styles.modalSubtitle}>
              Help us improve by telling us why (optional)
            </Text>

            <TextInput
              style={styles.dismissReasonInput}
              placeholder="Not relevant, too difficult, etc."
              value={dismissReason}
              onChangeText={setDismissReason}
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowDismissModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={handleDismiss}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Skip</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    marginLeft: 12,
    flex: 1,
  },
  typeLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
  typeDescription: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  expandButton: {
    padding: 8,
  },
  cardContext: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  cardContextText: {
    flex: 1,
    fontSize: 13,
    color: "#666",
    fontStyle: "italic",
  },
  promptSection: {
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  promptText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#333",
  },
  responseSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
  },
  responseInput: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    lineHeight: 22,
    color: "#333",
    minHeight: 150,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  charCount: {
    fontSize: 12,
    color: "#888",
    textAlign: "right",
    marginTop: 4,
  },
  ratingContainer: {
    marginBottom: 16,
  },
  ratingLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
  },
  stars: {
    flexDirection: "row",
    gap: 8,
  },
  starButton: {
    padding: 4,
  },
  bridgeSection: {
    marginBottom: 24,
  },
  bridgeToggle: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "#3498DB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  bridgeToggleText: {
    flex: 1,
  },
  bridgeToggleTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  bridgeToggleSubtitle: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  bridgeForm: {
    marginTop: 12,
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3498DB",
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    marginBottom: 6,
  },
  bridgeInput: {
    backgroundColor: "#F8F9FA",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#333",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  bridgeAnswerInput: {
    minHeight: 80,
  },
  connectionTypesScroll: {
    flexDirection: "row",
  },
  connectionTypeChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#F0F0F0",
    borderRadius: 20,
    marginRight: 8,
    gap: 6,
  },
  connectionTypeChipActive: {
    backgroundColor: "#3498DB",
  },
  connectionTypeText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#666",
  },
  connectionTypeTextActive: {
    color: "#FFF",
  },
  categoriesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#F0F0F0",
    borderRadius: 16,
    gap: 6,
  },
  categoryChipActive: {
    backgroundColor: "#27AE60",
  },
  categoryChipText: {
    fontSize: 13,
    color: "#666",
  },
  categoryChipTextActive: {
    color: "#FFF",
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  dismissButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
  },
  dismissButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
  submitButton: {
    flex: 2,
    flexDirection: "row",
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#27AE60",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: "#CCC",
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFF",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
  },
  dismissReasonInput: {
    backgroundColor: "#F8F9FA",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#333",
    minHeight: 80,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    marginBottom: 16,
    textAlignVertical: "top",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#666",
  },
  modalConfirmButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#E74C3C",
    alignItems: "center",
  },
  modalConfirmText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFF",
  },
});

export default SynthesisPromptUI;
