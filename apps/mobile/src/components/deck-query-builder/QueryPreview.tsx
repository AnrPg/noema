// =============================================================================
// QUERY PREVIEW
// =============================================================================
// Preview component showing query results

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import type { QueryPreviewProps, QueryPreviewCard } from "./types";
import { FILTER_FIELDS, OPERATOR_METADATA } from "./types";

// =============================================================================
// QUERY PREVIEW COMPONENT
// =============================================================================

export function QueryPreview({
  query,
  matchCount,
  sampleCards,
  isLoading,
  onRefresh,
}: QueryPreviewProps) {
  const colors = useColors();

  // ==========================================================================
  // RENDER QUERY SUMMARY
  // ==========================================================================

  const renderQuerySummary = () => {
    const conditions: string[] = [];

    const processGroup = (
      group: typeof query.filters,
      logic: string
    ): string => {
      const parts: string[] = [];

      for (const cond of group.conditions) {
        const field = FILTER_FIELDS.find((f) => f.id === cond.fieldId);
        const op = OPERATOR_METADATA[cond.operator];
        if (field && op) {
          let value = cond.value;
          if (field.type === "enum" && field.enumValues) {
            const enumVal = field.enumValues.find((e) => e.value === value);
            value = enumVal?.label || value;
          }
          parts.push(
            `${field.label} ${op.label}${op.valueCount > 0 ? ` "${value}"` : ""}`
          );
        }
      }

      for (const nestedGroup of group.groups) {
        parts.push(`(${processGroup(nestedGroup, nestedGroup.logic)})`);
      }

      return parts.join(` ${logic.toUpperCase()} `);
    };

    const summary = processGroup(query.filters, query.filters.logic);
    return summary || "No filters applied";
  };

  // ==========================================================================
  // RENDER CARD PREVIEW
  // ==========================================================================

  const renderCard = (card: QueryPreviewCard) => {
    return (
      <View
        key={card.id}
        style={[styles.cardItem, { backgroundColor: colors.surface }]}
      >
        <View style={styles.cardHeader}>
          <Text
            style={[styles.cardTitle, { color: colors.text }]}
            numberOfLines={1}
          >
            {card.title}
          </Text>
          <View style={styles.cardBadges}>
            <View
              style={[styles.badge, { backgroundColor: colors.primary + "20" }]}
            >
              <Text style={[styles.badgeText, { color: colors.primary }]}>
                {card.faceCount} faces
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.cardMeta}>
          {card.nextReview && (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={12} color={colors.textMuted} />
              <Text style={[styles.metaText, { color: colors.textMuted }]}>
                Due: {card.nextReview.toLocaleDateString()}
              </Text>
            </View>
          )}
          {card.stability !== undefined && (
            <View style={styles.metaItem}>
              <Ionicons name="shield-outline" size={12} color={colors.textMuted} />
              <Text style={[styles.metaText, { color: colors.textMuted }]}>
                S: {card.stability.toFixed(1)}
              </Text>
            </View>
          )}
          {card.difficulty !== undefined && (
            <View style={styles.metaItem}>
              <Ionicons name="barbell-outline" size={12} color={colors.textMuted} />
              <Text style={[styles.metaText, { color: colors.textMuted }]}>
                D: {card.difficulty.toFixed(2)}
              </Text>
            </View>
          )}
        </View>

        {card.tags.length > 0 && (
          <View style={styles.tagsRow}>
            {card.tags.slice(0, 3).map((tag) => (
              <View
                key={tag}
                style={[
                  styles.tagChip,
                  { backgroundColor: colors.surfaceVariant },
                ]}
              >
                <Text style={[styles.tagText, { color: colors.textSecondary }]}>
                  {tag}
                </Text>
              </View>
            ))}
            {card.tags.length > 3 && (
              <Text style={[styles.moreText, { color: colors.textMuted }]}>
                +{card.tags.length - 3}
              </Text>
            )}
          </View>
        )}
      </View>
    );
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <View style={styles.container}>
      {/* Query Summary */}
      <View style={[styles.summarySection, { backgroundColor: colors.surface }]}>
        <View style={styles.summaryHeader}>
          <Ionicons name="code-slash-outline" size={18} color={colors.primary} />
          <Text style={[styles.summaryTitle, { color: colors.text }]}>
            Query Summary
          </Text>
        </View>
        <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
          {renderQuerySummary()}
        </Text>

        {query.sorts.length > 0 && (
          <View style={styles.sortsSummary}>
            <Text style={[styles.sortsLabel, { color: colors.textMuted }]}>
              Sorted by:
            </Text>
            {query.sorts.map((sort, index) => {
              const field = FILTER_FIELDS.find((f) => f.id === sort.fieldId);
              return (
                <View
                  key={index}
                  style={[
                    styles.sortChip,
                    { backgroundColor: colors.surfaceVariant },
                  ]}
                >
                  <Text style={[styles.sortChipText, { color: colors.text }]}>
                    {field?.label || sort.fieldId}
                  </Text>
                  <Ionicons
                    name={sort.direction === "asc" ? "arrow-up" : "arrow-down"}
                    size={12}
                    color={colors.primary}
                  />
                </View>
              );
            })}
          </View>
        )}

        {query.limit && (
          <Text style={[styles.limitText, { color: colors.textMuted }]}>
            Limited to {query.limit} cards
          </Text>
        )}
      </View>

      {/* Results */}
      <View style={styles.resultsSection}>
        <View style={styles.resultsHeader}>
          <Text style={[styles.resultsTitle, { color: colors.text }]}>
            Preview Results
          </Text>
          {onRefresh && (
            <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
              <Ionicons name="refresh" size={18} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>
              Running query...
            </Text>
          </View>
        ) : matchCount !== undefined ? (
          <View style={styles.countContainer}>
            <Text style={[styles.countNumber, { color: colors.primary }]}>
              {matchCount.toLocaleString()}
            </Text>
            <Text style={[styles.countLabel, { color: colors.textMuted }]}>
              cards match this query
            </Text>
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={32} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Run query to see results
            </Text>
          </View>
        )}

        {/* Sample Cards */}
        {sampleCards && sampleCards.length > 0 && (
          <ScrollView style={styles.cardsList}>
            <Text style={[styles.sampleLabel, { color: colors.textSecondary }]}>
              Sample matches:
            </Text>
            {sampleCards.map(renderCard)}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  summarySection: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginLeft: 8,
  },
  summaryText: {
    fontSize: 13,
    lineHeight: 20,
  },
  sortsSummary: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 10,
    gap: 6,
  },
  sortsLabel: {
    fontSize: 12,
  },
  sortChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  sortChipText: {
    fontSize: 12,
  },
  limitText: {
    fontSize: 12,
    marginTop: 8,
  },
  resultsSection: {
    flex: 1,
  },
  resultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  refreshButton: {
    padding: 8,
  },
  loadingContainer: {
    alignItems: "center",
    padding: 40,
  },
  loadingText: {
    fontSize: 14,
    marginTop: 12,
  },
  countContainer: {
    alignItems: "center",
    padding: 24,
  },
  countNumber: {
    fontSize: 48,
    fontWeight: "700",
  },
  countLabel: {
    fontSize: 14,
    marginTop: 4,
  },
  emptyContainer: {
    alignItems: "center",
    padding: 40,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 8,
  },
  cardsList: {
    marginTop: 16,
  },
  sampleLabel: {
    fontSize: 12,
    marginBottom: 8,
  },
  cardItem: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "500",
    flex: 1,
  },
  cardBadges: {
    flexDirection: "row",
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  cardMeta: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 11,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 8,
  },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 11,
  },
  moreText: {
    fontSize: 11,
    alignSelf: "center",
  },
});
