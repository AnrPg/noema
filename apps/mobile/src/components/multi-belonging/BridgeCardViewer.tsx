/**
 * BridgeCardViewer Component
 *
 * Displays a bridge card with its connected concepts and visualization.
 * Shows the relationship between two or more categories through the lens
 * of a unifying concept.
 *
 * Features:
 * - Visual connection diagram
 * - Connection strength indicator
 * - Traversal interface
 * - Context information for linked cards/categories
 */

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  useBridgeCard,
  useTraverseBridgeCard,
  type BridgeCard,
} from "@/services/api";

type IconName = keyof typeof Ionicons.glyphMap;

// Connection type visual configurations
const CONNECTION_VISUALS = {
  CONCEPTUAL_SIMILARITY: {
    icon: "copy",
    color: "#3498DB",
    label: "Similar Concepts",
    lineStyle: "solid",
  },
  CAUSAL_RELATIONSHIP: {
    icon: "arrow-forward",
    color: "#E74C3C",
    label: "Cause & Effect",
    lineStyle: "arrow",
  },
  HIERARCHICAL: {
    icon: "git-branch",
    color: "#9B59B6",
    label: "Hierarchical",
    lineStyle: "tree",
  },
  ANALOGICAL: {
    icon: "swap-horizontal",
    color: "#F39C12",
    label: "Analogical",
    lineStyle: "dashed",
  },
  CONTRASTING: {
    icon: "git-compare",
    color: "#E67E22",
    label: "Contrasting",
    lineStyle: "dotted",
  },
  APPLICATION: {
    icon: "construct",
    color: "#27AE60",
    label: "Application",
    lineStyle: "solid",
  },
  SYNTHESIS: {
    icon: "git-network",
    color: "#8E44AD",
    label: "Synthesis",
    lineStyle: "double",
  },
  PREREQUISITE: {
    icon: "arrow-back",
    color: "#95A5A6",
    label: "Prerequisite",
    lineStyle: "arrow-reverse",
  },
  EXTENSION: {
    icon: "arrow-forward",
    color: "#1ABC9C",
    label: "Extension",
    lineStyle: "arrow",
  },
} as const;

interface BridgeCardViewerProps {
  bridgeCardId?: string;
  bridgeCard?: BridgeCard;
  currentCategoryId?: string;
  onNavigateToCard?: (cardId: string) => void;
  onNavigateToCategory?: (categoryId: string) => void;
  onClose?: () => void;
  showStudyMode?: boolean;
}

export function BridgeCardViewer({
  bridgeCardId,
  bridgeCard: propBridgeCard,
  currentCategoryId,
  onNavigateToCard,
  onNavigateToCategory,
  onClose,
  showStudyMode = false,
}: BridgeCardViewerProps) {
  const [showAnswer, setShowAnswer] = useState(!showStudyMode);
  const [expandedContext, setExpandedContext] = useState<string | null>(null);

  // Fetch bridge card if ID provided
  const {
    data: fetchedBridgeCard,
    isLoading,
    error,
  } = useBridgeCard(bridgeCardId!, {
    enabled: !!bridgeCardId && !propBridgeCard,
  });

  // Traverse mutation for tracking
  const traverseBridge = useTraverseBridgeCard();

  const bridgeCard = propBridgeCard || fetchedBridgeCard;

  // Get connection visual config
  const connectionVisual =
    CONNECTION_VISUALS[
      bridgeCard?.connectionType as keyof typeof CONNECTION_VISUALS
    ] || CONNECTION_VISUALS.SYNTHESIS;

  // Handle reveal answer
  const handleRevealAnswer = useCallback(() => {
    setShowAnswer(true);
  }, []);

  // Handle traverse to category
  const handleTraverseToCategory = useCallback(
    async (categoryId: string) => {
      if (!bridgeCard) return;

      try {
        // Track traversal
        await traverseBridge.mutateAsync({
          bridgeCardId: bridgeCard.id,
          fromCategoryId:
            currentCategoryId || bridgeCard.linkedCategories?.[0]?.id,
          toCategoryId: categoryId,
        });

        onNavigateToCategory?.(categoryId);
      } catch (error) {
        // Continue navigation even if tracking fails
        onNavigateToCategory?.(categoryId);
      }
    },
    [bridgeCard, currentCategoryId, traverseBridge, onNavigateToCategory],
  );

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3498DB" />
          <Text style={styles.loadingText}>Loading bridge card...</Text>
        </View>
      </View>
    );
  }

  // Error state
  if (error || !bridgeCard) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#E74C3C" />
          <Text style={styles.errorText}>Failed to load bridge card</Text>
        </View>
      </View>
    );
  }

  // Calculate connection strength display
  const strengthPercentage = Math.round(
    (bridgeCard.connectionStrength || 0.5) * 100,
  );
  const strengthColor =
    strengthPercentage >= 70
      ? "#27AE60"
      : strengthPercentage >= 40
        ? "#F39C12"
        : "#E74C3C";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.connectionIcon,
              { backgroundColor: connectionVisual.color },
            ]}
          >
            <Ionicons
              name={connectionVisual.icon as IconName}
              size={24}
              color="#FFF"
            />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.connectionType}>{connectionVisual.label}</Text>
            <Text style={styles.bridgeLabel}>Bridge Card</Text>
          </View>
        </View>

        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      {/* Connection Strength */}
      <View style={styles.strengthSection}>
        <View style={styles.strengthHeader}>
          <Ionicons name="fitness" size={16} color="#666" />
          <Text style={styles.strengthLabel}>Connection Strength</Text>
        </View>
        <View style={styles.strengthBar}>
          <View
            style={[
              styles.strengthFill,
              {
                width: `${strengthPercentage}%`,
                backgroundColor: strengthColor,
              },
            ]}
          />
        </View>
        <Text style={[styles.strengthValue, { color: strengthColor }]}>
          {strengthPercentage}%
        </Text>
      </View>

      {/* Bridge Question */}
      <View style={styles.questionSection}>
        <View style={styles.sectionHeader}>
          <Ionicons name="help-circle" size={20} color="#3498DB" />
          <Text style={styles.sectionTitle}>Bridge Question</Text>
        </View>
        <Text style={styles.questionText}>{bridgeCard.bridgeQuestion}</Text>
      </View>

      {/* Bridge Answer (conditionally shown) */}
      {showStudyMode && !showAnswer ? (
        <TouchableOpacity
          style={styles.revealButton}
          onPress={handleRevealAnswer}
        >
          <Ionicons name="eye" size={20} color="#FFF" />
          <Text style={styles.revealButtonText}>Reveal Connection</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.answerSection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="bulb" size={20} color="#F39C12" />
            <Text style={styles.sectionTitle}>Connection Insight</Text>
          </View>
          <Text style={styles.answerText}>{bridgeCard.bridgeAnswer}</Text>
        </View>
      )}

      {/* Visual Connection Diagram */}
      {showAnswer &&
        bridgeCard.linkedCategories &&
        bridgeCard.linkedCategories.length > 0 && (
          <View style={styles.diagramSection}>
            <View style={styles.sectionHeader}>
              <Ionicons name="git-network" size={20} color="#8E44AD" />
              <Text style={styles.sectionTitle}>Connected Domains</Text>
            </View>

            <View style={styles.diagram}>
              {bridgeCard.linkedCategories.map((link, index) => (
                <React.Fragment key={link.categoryId || index}>
                  <TouchableOpacity
                    style={[
                      styles.categoryNode,
                      link.categoryId === currentCategoryId &&
                        styles.categoryNodeCurrent,
                    ]}
                    onPress={() =>
                      link.categoryId &&
                      handleTraverseToCategory(link.categoryId)
                    }
                  >
                    <Ionicons
                      name="folder"
                      size={20}
                      color={
                        link.categoryId === currentCategoryId
                          ? "#FFF"
                          : connectionVisual.color
                      }
                    />
                    <Text
                      style={[
                        styles.categoryNodeText,
                        link.categoryId === currentCategoryId &&
                          styles.categoryNodeTextCurrent,
                      ]}
                      numberOfLines={2}
                    >
                      {link.category?.name || "Unknown"}
                    </Text>
                    {link.isPrimary && (
                      <View style={styles.primaryIndicator}>
                        <Ionicons name="star" size={10} color="#FFD700" />
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* Connection line */}
                  {index < bridgeCard.linkedCategories!.length - 1 && (
                    <View style={styles.connectionLine}>
                      <View
                        style={[
                          styles.line,
                          { backgroundColor: connectionVisual.color },
                        ]}
                      />
                      <Ionicons
                        name={connectionVisual.icon as IconName}
                        size={16}
                        color={connectionVisual.color}
                      />
                      <View
                        style={[
                          styles.line,
                          { backgroundColor: connectionVisual.color },
                        ]}
                      />
                    </View>
                  )}
                </React.Fragment>
              ))}
            </View>
          </View>
        )}

      {/* Source Cards */}
      {showAnswer &&
        bridgeCard.sourceCards &&
        bridgeCard.sourceCards.length > 0 && (
          <View style={styles.sourceCardsSection}>
            <View style={styles.sectionHeader}>
              <Ionicons name="card" size={20} color="#27AE60" />
              <Text style={styles.sectionTitle}>Source Cards</Text>
            </View>

            {bridgeCard.sourceCards.map((source) => (
              <TouchableOpacity
                key={source.cardId}
                style={styles.sourceCard}
                onPress={() => {
                  if (expandedContext === source.cardId) {
                    setExpandedContext(null);
                  } else {
                    setExpandedContext(source.cardId);
                  }
                }}
              >
                <View style={styles.sourceCardHeader}>
                  <Text style={styles.sourceCardQuestion} numberOfLines={2}>
                    {source.card?.front || "Card"}
                  </Text>
                  <Ionicons
                    name={
                      expandedContext === source.cardId
                        ? "chevron-up"
                        : "chevron-down"
                    }
                    size={16}
                    color="#666"
                  />
                </View>

                {expandedContext === source.cardId && source.context && (
                  <View style={styles.sourceCardContext}>
                    <Text style={styles.contextLabel}>Context:</Text>
                    <Text style={styles.contextText}>{source.context}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.viewCardButton}
                  onPress={() =>
                    source.cardId && onNavigateToCard?.(source.cardId)
                  }
                >
                  <Text style={styles.viewCardButtonText}>View Card</Text>
                  <Ionicons name="arrow-forward" size={14} color="#3498DB" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

      {/* Statistics */}
      {showAnswer && (
        <View style={styles.statsSection}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {bridgeCard.traversalCount || 0}
            </Text>
            <Text style={styles.statLabel}>Traversals</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {bridgeCard.linkedCategories?.length || 0}
            </Text>
            <Text style={styles.statLabel}>Linked Domains</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {bridgeCard.sourceCards?.length || 0}
            </Text>
            <Text style={styles.statLabel}>Source Cards</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 48,
  },
  loadingText: {
    marginTop: 12,
    color: "#666",
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 48,
  },
  errorText: {
    marginTop: 12,
    color: "#E74C3C",
    fontSize: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  connectionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    marginLeft: 12,
  },
  connectionType: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  bridgeLabel: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  closeButton: {
    padding: 8,
  },
  strengthSection: {
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  strengthHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  strengthLabel: {
    fontSize: 13,
    color: "#666",
  },
  strengthBar: {
    height: 8,
    backgroundColor: "#E0E0E0",
    borderRadius: 4,
    overflow: "hidden",
  },
  strengthFill: {
    height: "100%",
    borderRadius: 4,
  },
  strengthValue: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 6,
    textAlign: "right",
  },
  questionSection: {
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  questionText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    lineHeight: 26,
  },
  revealButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3498DB",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  revealButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFF",
  },
  answerSection: {
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  answerText: {
    fontSize: 16,
    color: "#333",
    lineHeight: 24,
  },
  diagramSection: {
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  diagram: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
  },
  categoryNode: {
    alignItems: "center",
    padding: 12,
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E0E0E0",
    minWidth: 100,
    maxWidth: 140,
    position: "relative",
  },
  categoryNodeCurrent: {
    backgroundColor: "#3498DB",
    borderColor: "#3498DB",
  },
  categoryNodeText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#333",
    textAlign: "center",
    marginTop: 8,
  },
  categoryNodeTextCurrent: {
    color: "#FFF",
  },
  primaryIndicator: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#FFF",
    borderRadius: 10,
    padding: 2,
  },
  connectionLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  line: {
    width: 20,
    height: 2,
    borderRadius: 1,
  },
  sourceCardsSection: {
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  sourceCard: {
    backgroundColor: "#F8F9FA",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  sourceCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  sourceCardQuestion: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    marginRight: 8,
  },
  sourceCardContext: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  contextLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#888",
    marginBottom: 4,
  },
  contextText: {
    fontSize: 13,
    color: "#666",
    lineHeight: 20,
  },
  viewCardButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 12,
    gap: 4,
  },
  viewCardButtonText: {
    fontSize: 13,
    color: "#3498DB",
    fontWeight: "500",
  },
  statsSection: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 12,
    justifyContent: "space-around",
    alignItems: "center",
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
  },
  statLabel: {
    fontSize: 12,
    color: "#888",
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: "#E0E0E0",
  },
});

export default BridgeCardViewer;
