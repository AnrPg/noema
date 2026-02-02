// =============================================================================
// IMPORT COMPONENTS - DECK SELECTOR
// =============================================================================

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import { useDecks } from "@/services/api";

export type DuplicateStrategy = "skip" | "update" | "create_anyway";

interface DeckSelectorProps {
  /** Currently selected deck ID */
  selectedDeckId: string | null;
  /** Whether creating a new deck */
  createNewDeck: boolean;
  /** New deck name when creating */
  newDeckName: string;
  /** Current duplicate strategy */
  duplicateStrategy?: DuplicateStrategy;
  /** Called when a deck is selected */
  onSelectDeck: (deckId: string | null) => void;
  /** Called when toggling create new deck */
  onToggleCreateNew: (create: boolean) => void;
  /** Called when new deck name changes */
  onNewDeckNameChange: (name: string) => void;
  /** Called when duplicate strategy changes */
  onDuplicateStrategyChange?: (strategy: DuplicateStrategy) => void;
}

interface Deck {
  id: string;
  name: string;
  description?: string;
  iconEmoji?: string;
  color?: string;
  cardCount: number;
}

export function DeckSelector({
  selectedDeckId,
  createNewDeck,
  newDeckName,
  duplicateStrategy = "skip",
  onSelectDeck,
  onToggleCreateNew,
  onNewDeckNameChange,
  onDuplicateStrategyChange,
}: DeckSelectorProps) {
  const colors = useColors();
  const { data: decksData, isLoading } = useDecks();
  const [searchQuery, setSearchQuery] = useState("");

  const decks: Deck[] =
    (decksData as { data?: Deck[] } | undefined)?.data || [];

  // Filter decks by search
  const filteredDecks = decks.filter(
    (deck) =>
      deck.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      deck.description?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleSelectDeck = useCallback(
    (deckId: string) => {
      onToggleCreateNew(false);
      onSelectDeck(deckId);
    },
    [onSelectDeck, onToggleCreateNew],
  );

  const handleCreateNew = useCallback(() => {
    onToggleCreateNew(true);
    onSelectDeck(null);
  }, [onSelectDeck, onToggleCreateNew]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <Text style={[styles.title, { color: colors.text }]}>
        Choose Destination Deck
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Select an existing deck or create a new one
      </Text>

      {/* Create New Deck Option */}
      <TouchableOpacity
        onPress={handleCreateNew}
        style={[
          styles.createNewCard,
          {
            backgroundColor: createNewDeck
              ? colors.primaryLight + "30"
              : colors.card,
            borderColor: createNewDeck ? colors.primary : colors.border,
            borderWidth: createNewDeck ? 2 : 1,
          },
        ]}
      >
        <View
          style={[
            styles.createNewIcon,
            { backgroundColor: colors.primary + "20" },
          ]}
        >
          <Ionicons name="add" size={24} color={colors.primary} />
        </View>
        <View style={styles.createNewContent}>
          <Text style={[styles.createNewTitle, { color: colors.text }]}>
            Create New Deck
          </Text>
          <Text
            style={[styles.createNewSubtitle, { color: colors.textSecondary }]}
          >
            Import cards into a fresh deck
          </Text>
        </View>
        {createNewDeck && (
          <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
        )}
      </TouchableOpacity>

      {/* New Deck Name Input */}
      {createNewDeck && (
        <View style={styles.newDeckNameContainer}>
          <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
            Deck Name
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            value={newDeckName}
            onChangeText={onNewDeckNameChange}
            placeholder="Enter deck name..."
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
        </View>
      )}

      {/* Divider */}
      <View style={styles.dividerContainer}>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Text style={[styles.dividerText, { color: colors.textMuted }]}>
          or select existing
        </Text>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
      </View>

      {/* Search */}
      <View
        style={[
          styles.searchContainer,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search decks..."
          placeholderTextColor={colors.textMuted}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Deck List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading decks...
          </Text>
        </View>
      ) : filteredDecks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons
            name="folder-open-outline"
            size={40}
            color={colors.textMuted}
          />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {searchQuery
              ? "No decks match your search"
              : "No existing decks found"}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.deckList}
          showsVerticalScrollIndicator={false}
        >
          {filteredDecks.map((deck) => (
            <TouchableOpacity
              key={deck.id}
              onPress={() => handleSelectDeck(deck.id)}
              style={[
                styles.deckCard,
                {
                  backgroundColor:
                    selectedDeckId === deck.id && !createNewDeck
                      ? colors.primaryLight + "30"
                      : colors.card,
                  borderColor:
                    selectedDeckId === deck.id && !createNewDeck
                      ? colors.primary
                      : colors.border,
                  borderWidth:
                    selectedDeckId === deck.id && !createNewDeck ? 2 : 1,
                },
              ]}
            >
              {/* Deck Icon */}
              <View
                style={[
                  styles.deckIcon,
                  { backgroundColor: deck.color || colors.primaryLight + "30" },
                ]}
              >
                <Text style={styles.deckEmoji}>{deck.iconEmoji || "📚"}</Text>
              </View>

              {/* Deck Info */}
              <View style={styles.deckInfo}>
                <Text
                  style={[styles.deckName, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {deck.name}
                </Text>
                <Text
                  style={[styles.deckStats, { color: colors.textSecondary }]}
                >
                  {deck.cardCount} {deck.cardCount === 1 ? "card" : "cards"}
                </Text>
              </View>

              {/* Selection indicator */}
              {selectedDeckId === deck.id && !createNewDeck && (
                <Ionicons
                  name="checkmark-circle"
                  size={24}
                  color={colors.primary}
                />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Duplicate Strategy Section - only show when selecting existing deck with cards */}
      {!createNewDeck && selectedDeckId && onDuplicateStrategyChange && (
        <View style={styles.duplicateSection}>
          <View style={[styles.dividerContainer, { marginTop: 8 }]}>
            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
            />
            <Text style={[styles.dividerText, { color: colors.textMuted }]}>
              duplicate handling
            </Text>
            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
            />
          </View>

          <Text style={[styles.duplicateTitle, { color: colors.text }]}>
            What to do with duplicates?
          </Text>
          <Text
            style={[styles.duplicateSubtitle, { color: colors.textSecondary }]}
          >
            Cards with matching front &amp; back content
          </Text>

          {/* Strategy Options */}
          <View style={styles.strategyOptions}>
            <TouchableOpacity
              onPress={() => onDuplicateStrategyChange("skip")}
              style={[
                styles.strategyOption,
                {
                  backgroundColor:
                    duplicateStrategy === "skip"
                      ? colors.primaryLight + "30"
                      : colors.card,
                  borderColor:
                    duplicateStrategy === "skip"
                      ? colors.primary
                      : colors.border,
                  borderWidth: duplicateStrategy === "skip" ? 2 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.strategyIcon,
                  { backgroundColor: colors.warning + "20" },
                ]}
              >
                <Ionicons name="eye-off" size={20} color={colors.warning} />
              </View>
              <View style={styles.strategyContent}>
                <Text style={[styles.strategyTitle, { color: colors.text }]}>
                  Skip Duplicates
                </Text>
                <Text
                  style={[styles.strategyDesc, { color: colors.textSecondary }]}
                >
                  Don&apos;t import cards that already exist
                </Text>
              </View>
              {duplicateStrategy === "skip" && (
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={colors.primary}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => onDuplicateStrategyChange("update")}
              style={[
                styles.strategyOption,
                {
                  backgroundColor:
                    duplicateStrategy === "update"
                      ? colors.primaryLight + "30"
                      : colors.card,
                  borderColor:
                    duplicateStrategy === "update"
                      ? colors.primary
                      : colors.border,
                  borderWidth: duplicateStrategy === "update" ? 2 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.strategyIcon,
                  { backgroundColor: colors.primary + "20" },
                ]}
              >
                <Ionicons name="refresh" size={20} color={colors.primary} />
              </View>
              <View style={styles.strategyContent}>
                <Text style={[styles.strategyTitle, { color: colors.text }]}>
                  Update Existing
                </Text>
                <Text
                  style={[styles.strategyDesc, { color: colors.textSecondary }]}
                >
                  Update tags, notes, source for duplicates
                </Text>
              </View>
              {duplicateStrategy === "update" && (
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={colors.primary}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => onDuplicateStrategyChange("create_anyway")}
              style={[
                styles.strategyOption,
                {
                  backgroundColor:
                    duplicateStrategy === "create_anyway"
                      ? colors.primaryLight + "30"
                      : colors.card,
                  borderColor:
                    duplicateStrategy === "create_anyway"
                      ? colors.primary
                      : colors.border,
                  borderWidth: duplicateStrategy === "create_anyway" ? 2 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.strategyIcon,
                  { backgroundColor: colors.success + "20" },
                ]}
              >
                <Ionicons name="duplicate" size={20} color={colors.success} />
              </View>
              <View style={styles.strategyContent}>
                <Text style={[styles.strategyTitle, { color: colors.text }]}>
                  Create Anyway
                </Text>
                <Text
                  style={[styles.strategyDesc, { color: colors.textSecondary }]}
                >
                  Import all cards, even duplicates
                </Text>
              </View>
              {duplicateStrategy === "create_anyway" && (
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={colors.primary}
                />
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
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
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 20,
  },
  createNewCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  createNewIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  createNewContent: {
    flex: 1,
  },
  createNewTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  createNewSubtitle: {
    fontSize: 13,
  },
  newDeckNameContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 12,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    textAlign: "center",
  },
  deckList: {
    flex: 1,
  },
  deckCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  deckIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  deckEmoji: {
    fontSize: 22,
  },
  deckInfo: {
    flex: 1,
  },
  deckName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  deckStats: {
    fontSize: 13,
  },
  duplicateSection: {
    marginTop: 8,
    paddingTop: 8,
  },
  duplicateTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  duplicateSubtitle: {
    fontSize: 13,
    marginBottom: 12,
  },
  strategyOptions: {
    gap: 8,
  },
  strategyOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
  },
  strategyIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  strategyContent: {
    flex: 1,
  },
  strategyTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  strategyDesc: {
    fontSize: 12,
  },
});
