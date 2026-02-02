// =============================================================================
// IMPORT COMPONENTS - PREVIEW CARDS
// =============================================================================

import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import type { PreviewCard } from "@/stores/import.store";

interface PreviewCardsProps {
  cards: PreviewCard[];
  totalCards: number;
  onEditCard?: (cardId: string) => void;
}

export function PreviewCards({
  cards,
  totalCards,
  onEditCard,
}: PreviewCardsProps) {
  const colors = useColors();

  const validCards = cards.filter((c) => !c.hasIssues);
  const cardsWithIssues = cards.filter((c) => c.hasIssues);

  return (
    <View style={styles.container}>
      {/* Summary */}
      <View
        style={[
          styles.summaryCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryNumber, { color: colors.primary }]}>
              {totalCards}
            </Text>
            <Text
              style={[styles.summaryLabel, { color: colors.textSecondary }]}
            >
              Total cards
            </Text>
          </View>
          <View
            style={[styles.summaryDivider, { backgroundColor: colors.border }]}
          />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryNumber, { color: colors.success }]}>
              {validCards.length}
            </Text>
            <Text
              style={[styles.summaryLabel, { color: colors.textSecondary }]}
            >
              Ready to import
            </Text>
          </View>
          {cardsWithIssues.length > 0 && (
            <>
              <View
                style={[
                  styles.summaryDivider,
                  { backgroundColor: colors.border },
                ]}
              />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryNumber, { color: colors.warning }]}>
                  {cardsWithIssues.length}
                </Text>
                <Text
                  style={[styles.summaryLabel, { color: colors.textSecondary }]}
                >
                  With issues
                </Text>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Preview notice */}
      <View
        style={[styles.noticeCard, { backgroundColor: colors.surfaceVariant }]}
      >
        <Ionicons name="information-circle" size={18} color={colors.primary} />
        <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
          Showing preview of {cards.length} cards out of {totalCards} total
        </Text>
      </View>

      {/* Card list */}
      <ScrollView style={styles.cardList} showsVerticalScrollIndicator={false}>
        {cards.map((card, index) => (
          <TouchableOpacity
            key={card.id}
            onPress={() => onEditCard?.(card.id)}
            style={[
              styles.previewCard,
              {
                backgroundColor: colors.card,
                borderColor: card.hasIssues ? colors.warning : colors.border,
                borderWidth: card.hasIssues ? 2 : 1,
              },
            ]}
          >
            {/* Card number */}
            <View
              style={[
                styles.cardNumber,
                {
                  backgroundColor: card.hasIssues
                    ? colors.warningLight
                    : colors.primaryLight + "30",
                },
              ]}
            >
              <Text
                style={[
                  styles.cardNumberText,
                  { color: card.hasIssues ? colors.warning : colors.primary },
                ]}
              >
                #{index + 1}
              </Text>
            </View>

            {/* Front */}
            <View style={styles.cardSide}>
              <Text style={[styles.sideLabel, { color: colors.textMuted }]}>
                Front
              </Text>
              <Text
                style={[styles.sideContent, { color: colors.text }]}
                numberOfLines={2}
              >
                {card.front || "(empty)"}
              </Text>
            </View>

            {/* Divider */}
            <View
              style={[
                styles.cardDivider,
                { backgroundColor: colors.borderLight },
              ]}
            />

            {/* Back */}
            <View style={styles.cardSide}>
              <Text style={[styles.sideLabel, { color: colors.textMuted }]}>
                Back
              </Text>
              <Text
                style={[styles.sideContent, { color: colors.text }]}
                numberOfLines={2}
              >
                {card.back || "(empty)"}
              </Text>
            </View>

            {/* Tags */}
            {card.tags.length > 0 && (
              <View style={styles.tagsRow}>
                {card.tags.slice(0, 3).map((tag, i) => (
                  <View
                    key={i}
                    style={[
                      styles.tag,
                      { backgroundColor: colors.surfaceVariant },
                    ]}
                  >
                    <Text
                      style={[styles.tagText, { color: colors.textSecondary }]}
                    >
                      {tag}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Issues */}
            {card.hasIssues && card.issues.length > 0 && (
              <View
                style={[
                  styles.issuesContainer,
                  { backgroundColor: colors.warningLight },
                ]}
              >
                <Ionicons
                  name="alert-circle"
                  size={16}
                  color={colors.warning}
                />
                <View style={styles.issuesList}>
                  {card.issues.map((issue, i) => (
                    <Text
                      key={i}
                      style={[styles.issueText, { color: colors.warning }]}
                    >
                      • {issue}
                    </Text>
                  ))}
                </View>
              </View>
            )}
          </TouchableOpacity>
        ))}

        {/* More cards notice */}
        {totalCards > cards.length && (
          <View
            style={[
              styles.moreCardsNotice,
              { backgroundColor: colors.surfaceVariant },
            ]}
          >
            <Ionicons name="layers" size={20} color={colors.textMuted} />
            <Text
              style={[styles.moreCardsText, { color: colors.textSecondary }]}
            >
              {totalCards - cards.length} more cards will be imported
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  summaryCard: {
    margin: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  summaryItem: {
    alignItems: "center",
    flex: 1,
  },
  summaryNumber: {
    fontSize: 28,
    fontWeight: "700",
  },
  summaryLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  summaryDivider: {
    width: 1,
    height: 40,
  },
  noticeCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
  },
  cardList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  previewCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardNumber: {
    position: "absolute",
    top: 12,
    right: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  cardNumberText: {
    fontSize: 12,
    fontWeight: "600",
  },
  cardSide: {
    marginBottom: 12,
    paddingRight: 50,
  },
  sideLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  sideContent: {
    fontSize: 15,
    lineHeight: 22,
  },
  cardDivider: {
    height: 1,
    marginBottom: 12,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 12,
  },
  issuesContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    gap: 8,
  },
  issuesList: {
    flex: 1,
  },
  issueText: {
    fontSize: 13,
    marginBottom: 2,
  },
  moreCardsNotice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  moreCardsText: {
    fontSize: 14,
  },
});
