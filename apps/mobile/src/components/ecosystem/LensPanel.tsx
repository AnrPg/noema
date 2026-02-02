// =============================================================================
// LENS PANEL COMPONENT
// =============================================================================
// Displays how a card is viewed through different category lenses
// Core implementation of "Category = Lens, Not Container" paradigm

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import {
  useAnnotationsByCard,
  useEmphasisRulesForCard,
  useMultiContextPerformance,
} from "@/services/api";
// SemanticIntent type defined locally below

// =============================================================================
// TYPES

// Semantic intent types for category lenses
type SemanticIntent =
  | "learning"
  | "review"
  | "reference"
  | "exploration"
  | "mastery"
  | "connection"
  | "application"
  | "teaching";

// =============================================================================

interface LensPanelProps {
  cardId: string;
  onLensPress?: (categoryId: string) => void;
  showAnnotations?: boolean;
  showEmphasis?: boolean;
  showPerformance?: boolean;
  compact?: boolean;
}

interface LensView {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  categoryEmoji: string;
  semanticIntent: SemanticIntent;
  emphasis: number;
  semanticRole: string;
  annotations: AnnotationPreview[];
  contextMastery: number;
  lastReviewedInContext?: Date;
}

interface AnnotationPreview {
  id: string;
  type:
    | "note"
    | "question"
    | "insight"
    | "connection"
    | "correction"
    | "example";
  content: string;
  createdAt: Date;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const SEMANTIC_INTENT_CONFIG: Record<
  SemanticIntent,
  {
    icon: string;
    color: string;
    verb: string;
  }
> = {
  mastery: { icon: "school", color: "#22c55e", verb: "master" },
  reference: { icon: "bookmark", color: "#3b82f6", verb: "reference" },
  exploration: { icon: "compass", color: "#8b5cf6", verb: "explore" },
  connection: { icon: "git-merge", color: "#f59e0b", verb: "connect" },
  learning: { icon: "school", color: "#10b981", verb: "learn" },
  review: { icon: "refresh", color: "#6366f1", verb: "review" },
  teaching: { icon: "people", color: "#f97316", verb: "teach" },
  application: { icon: "construct", color: "#ef4444", verb: "apply" },
};

const ANNOTATION_ICONS: Record<string, { icon: string; color: string }> = {
  note: { icon: "document-text", color: "#6b7280" },
  question: { icon: "help-circle", color: "#f59e0b" },
  insight: { icon: "bulb", color: "#8b5cf6" },
  connection: { icon: "link", color: "#3b82f6" },
  correction: { icon: "close-circle", color: "#ef4444" },
  example: { icon: "code", color: "#22c55e" },
};

const SEMANTIC_ROLE_CONFIG: Record<string, { label: string; emoji: string }> = {
  foundational: { label: "Foundation", emoji: "🎯" },
  application: { label: "Application", emoji: "⚙️" },
  example: { label: "Example", emoji: "💡" },
  edge_case: { label: "Edge Case", emoji: "⚠️" },
  counterexample: { label: "Counterexample", emoji: "❌" },
  concept: { label: "Concept", emoji: "📚" },
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function LensPanel({
  cardId,
  onLensPress,
  showAnnotations = true,
  showEmphasis = true,
  showPerformance = true,
  compact = false,
}: LensPanelProps) {
  const colors = useColors();

  // Fetch data
  const { data: annotationsData, isLoading: loadingAnnotations } =
    useAnnotationsByCard(cardId);
  const { data: _emphasisData, isLoading: loadingEmphasis } =
    useEmphasisRulesForCard(cardId);
  const { data: performanceData, isLoading: loadingPerformance } =
    useMultiContextPerformance(cardId);

  // State
  const [expandedLens, setExpandedLens] = useState<string | null>(null);

  // Transform data into lens views
  const lensViews = useMemo((): LensView[] => {
    const views: LensView[] = [];

    // Group annotations by category
    const annotationsByCategory = new Map<string, AnnotationPreview[]>();
    if (annotationsData && Array.isArray(annotationsData) && annotationsData) {
      annotationsData.forEach((ann: any) => {
        const existing = annotationsByCategory.get(ann.categoryId) || [];
        existing.push({
          id: ann.id,
          type: ann.annotationType,
          content: ann.content,
          createdAt: new Date(ann.createdAt),
        });
        annotationsByCategory.set(ann.categoryId, existing);
      });
    }

    // Build lens views from performance data
    if (performanceData && Array.isArray(performanceData) && performanceData) {
      performanceData.forEach((perf: any) => {
        views.push({
          categoryId: perf.categoryId,
          categoryName: perf.category?.name || "Unknown",
          categoryColor: perf.category?.color || "#6366f1",
          categoryEmoji: perf.category?.iconEmoji || "📚",
          semanticIntent: perf.category?.semanticIntent || "exploration",
          emphasis: perf.emphasis || 1.0,
          semanticRole: perf.semanticRole || "concept",
          annotations: annotationsByCategory.get(perf.categoryId) || [],
          contextMastery: perf.contextMastery || 0,
          lastReviewedInContext: perf.lastReviewedAt
            ? new Date(perf.lastReviewedAt)
            : undefined,
        });
      });
    }

    return views.sort((a, b) => b.emphasis - a.emphasis);
  }, [annotationsData, performanceData]);

  const isLoading = loadingAnnotations || loadingEmphasis || loadingPerformance;

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.card }]}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>
          Loading lenses...
        </Text>
      </View>
    );
  }

  if (lensViews.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.card }]}>
        <Ionicons name="eye-off" size={32} color={colors.textMuted} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          No Lenses Yet
        </Text>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
          Add this card to categories to see it through different lenses
        </Text>
      </View>
    );
  }

  if (compact) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.compactContainer}
      >
        {lensViews.map((lens) => (
          <LensCompactCard
            key={lens.categoryId}
            lens={lens}
            onPress={() => onLensPress?.(lens.categoryId)}
          />
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="eye" size={18} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Viewing Through {lensViews.length}{" "}
            {lensViews.length === 1 ? "Lens" : "Lenses"}
          </Text>
        </View>
      </View>

      {/* Lens Cards */}
      <View style={styles.lensCards}>
        {lensViews.map((lens) => (
          <LensCard
            key={lens.categoryId}
            lens={lens}
            isExpanded={expandedLens === lens.categoryId}
            onToggleExpand={() =>
              setExpandedLens(
                expandedLens === lens.categoryId ? null : lens.categoryId,
              )
            }
            onPress={() => onLensPress?.(lens.categoryId)}
            showAnnotations={showAnnotations}
            showEmphasis={showEmphasis}
            showPerformance={showPerformance}
          />
        ))}
      </View>
    </View>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface LensCardProps {
  lens: LensView;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onPress?: () => void;
  showAnnotations: boolean;
  showEmphasis: boolean;
  showPerformance: boolean;
}

function LensCard({
  lens,
  isExpanded,
  onToggleExpand,
  onPress,
  showAnnotations,
  showEmphasis,
  showPerformance,
}: LensCardProps) {
  const colors = useColors();
  const intentConfig = SEMANTIC_INTENT_CONFIG[lens.semanticIntent];
  const roleConfig =
    SEMANTIC_ROLE_CONFIG[lens.semanticRole] || SEMANTIC_ROLE_CONFIG.concept;

  return (
    <View style={[styles.lensCard, { backgroundColor: colors.card }]}>
      {/* Card Header */}
      <TouchableOpacity
        style={styles.lensCardHeader}
        onPress={onToggleExpand}
        onLongPress={onPress}
      >
        <View
          style={[styles.lensIcon, { backgroundColor: lens.categoryColor }]}
        >
          <Text style={styles.lensEmoji}>{lens.categoryEmoji}</Text>
        </View>

        <View style={styles.lensInfo}>
          <Text style={[styles.lensName, { color: colors.text }]}>
            {lens.categoryName}
          </Text>
          <View style={styles.lensMeta}>
            <View
              style={[
                styles.intentBadge,
                { backgroundColor: `${intentConfig.color}20` },
              ]}
            >
              <Ionicons
                name={intentConfig.icon as any}
                size={10}
                color={intentConfig.color}
              />
              <Text
                style={[styles.intentBadgeText, { color: intentConfig.color }]}
              >
                {intentConfig.verb}
              </Text>
            </View>
            <Text style={[styles.roleBadge, { color: colors.textMuted }]}>
              {roleConfig.emoji} {roleConfig.label}
            </Text>
          </View>
        </View>

        {/* Emphasis Indicator */}
        {showEmphasis && lens.emphasis !== 1.0 && (
          <View style={styles.emphasisIndicator}>
            {lens.emphasis > 1 ? (
              <View
                style={[styles.emphasisBadge, { backgroundColor: "#22c55e20" }]}
              >
                <Ionicons name="arrow-up" size={12} color="#22c55e" />
                <Text style={[styles.emphasisText, { color: "#22c55e" }]}>
                  {Math.round(lens.emphasis * 100)}%
                </Text>
              </View>
            ) : (
              <View
                style={[styles.emphasisBadge, { backgroundColor: "#ef444420" }]}
              >
                <Ionicons name="arrow-down" size={12} color="#ef4444" />
                <Text style={[styles.emphasisText, { color: "#ef4444" }]}>
                  {Math.round(lens.emphasis * 100)}%
                </Text>
              </View>
            )}
          </View>
        )}

        <Ionicons
          name={isExpanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.textMuted}
        />
      </TouchableOpacity>

      {/* Expanded Content */}
      {isExpanded && (
        <View style={styles.expandedContent}>
          {/* Context Mastery */}
          {showPerformance && (
            <View style={styles.masterySection}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                Context Mastery
              </Text>
              <View style={styles.masteryBar}>
                <View
                  style={[
                    styles.masteryBarBg,
                    { backgroundColor: colors.background },
                  ]}
                >
                  <View
                    style={[
                      styles.masteryBarFill,
                      {
                        width: `${lens.contextMastery * 100}%`,
                        backgroundColor:
                          lens.contextMastery > 0.7
                            ? "#22c55e"
                            : lens.contextMastery > 0.4
                              ? "#f59e0b"
                              : "#ef4444",
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.masteryText, { color: colors.text }]}>
                  {Math.round(lens.contextMastery * 100)}%
                </Text>
              </View>
              {lens.lastReviewedInContext && (
                <Text
                  style={[styles.lastReviewed, { color: colors.textMuted }]}
                >
                  Last reviewed:{" "}
                  {formatRelativeDate(lens.lastReviewedInContext)}
                </Text>
              )}
            </View>
          )}

          {/* Annotations */}
          {showAnnotations && lens.annotations.length > 0 && (
            <View style={styles.annotationsSection}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                Marginalia ({lens.annotations.length})
              </Text>
              {lens.annotations.slice(0, 3).map((ann) => {
                const annConfig =
                  ANNOTATION_ICONS[ann.type] || ANNOTATION_ICONS.note;
                return (
                  <View key={ann.id} style={styles.annotationItem}>
                    <Ionicons
                      name={annConfig.icon as any}
                      size={14}
                      color={annConfig.color}
                    />
                    <Text
                      style={[styles.annotationText, { color: colors.text }]}
                      numberOfLines={2}
                    >
                      {ann.content}
                    </Text>
                  </View>
                );
              })}
              {lens.annotations.length > 3 && (
                <Text
                  style={[styles.moreAnnotations, { color: colors.primary }]}
                >
                  +{lens.annotations.length - 3} more
                </Text>
              )}
            </View>
          )}

          {/* View in Category Button */}
          <TouchableOpacity
            style={[styles.viewButton, { backgroundColor: colors.primary }]}
            onPress={onPress}
          >
            <Text style={styles.viewButtonText}>View in Category</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

interface LensCompactCardProps {
  lens: LensView;
  onPress?: () => void;
}

function LensCompactCard({ lens, onPress }: LensCompactCardProps) {
  const colors = useColors();
  const intentConfig = SEMANTIC_INTENT_CONFIG[lens.semanticIntent];

  return (
    <TouchableOpacity
      style={[styles.compactCard, { backgroundColor: colors.card }]}
      onPress={onPress}
    >
      <View
        style={[styles.compactIcon, { backgroundColor: lens.categoryColor }]}
      >
        <Text style={styles.compactEmoji}>{lens.categoryEmoji}</Text>
      </View>
      <Text
        style={[styles.compactName, { color: colors.text }]}
        numberOfLines={1}
      >
        {lens.categoryName}
      </Text>
      <View style={styles.compactMeta}>
        <Ionicons
          name={intentConfig.icon as any}
          size={10}
          color={intentConfig.color}
        />
        {lens.annotations.length > 0 && (
          <View style={styles.compactAnnotationBadge}>
            <Text style={styles.compactAnnotationText}>
              {lens.annotations.length}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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

  // Lens Cards
  lensCards: {
    gap: 10,
  },
  lensCard: {
    borderRadius: 12,
    overflow: "hidden",
  },
  lensCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 10,
  },
  lensIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  lensEmoji: {
    fontSize: 18,
  },
  lensInfo: {
    flex: 1,
  },
  lensName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  lensMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  intentBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 3,
  },
  intentBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  roleBadge: {
    fontSize: 11,
  },

  // Emphasis
  emphasisIndicator: {
    marginRight: 4,
  },
  emphasisBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 2,
  },
  emphasisText: {
    fontSize: 10,
    fontWeight: "600",
  },

  // Expanded Content
  expandedContent: {
    padding: 12,
    paddingTop: 0,
    gap: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Mastery
  masterySection: {},
  masteryBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  masteryBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  masteryBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  masteryText: {
    fontSize: 13,
    fontWeight: "600",
    width: 40,
    textAlign: "right",
  },
  lastReviewed: {
    fontSize: 11,
    marginTop: 4,
  },

  // Annotations
  annotationsSection: {},
  annotationItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 8,
    paddingLeft: 4,
  },
  annotationText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  moreAnnotations: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 4,
  },

  // View Button
  viewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  viewButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },

  // Compact View
  compactContainer: {
    paddingHorizontal: 4,
    gap: 8,
  },
  compactCard: {
    width: 90,
    padding: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  compactIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  compactEmoji: {
    fontSize: 16,
  },
  compactName: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 4,
  },
  compactMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  compactAnnotationBadge: {
    backgroundColor: "#6366f1",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  compactAnnotationText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "700",
  },

  // Loading & Empty States
  loadingContainer: {
    padding: 24,
    borderRadius: 12,
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyContainer: {
    padding: 24,
    borderRadius: 12,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  emptyText: {
    fontSize: 13,
    textAlign: "center",
  },
});
