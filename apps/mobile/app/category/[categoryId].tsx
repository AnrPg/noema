// =============================================================================
// CATEGORY DETAIL SCREEN
// =============================================================================
// View and manage a specific category

import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import {
  useCategory,
  useCategoryCards,
  useCategoryRelations,
  useLearningNavigation,
  useStartEcosystemStudySession,
  useAnnotationsByCategory,
  useEmphasisRules,
  useAIGenerateAnnotation,
} from "@/services/api";

// Local type definitions
type SemanticIntent =
  | "mastery"
  | "reference"
  | "exploration"
  | "connection"
  | "application";
type CategoryRelationType =
  | "strong_containment"
  | "weak_association"
  | "prepares_for"
  | "is_like"
  | "contrasts_with";

// =============================================================================
// HELPERS
// =============================================================================

const RELATION_TYPE_INFO: Record<
  CategoryRelationType,
  { icon: string; label: string }
> = {
  strong_containment: { icon: "🏠", label: "Contains" },
  weak_association: { icon: "🔗", label: "Related" },
  prepares_for: { icon: "📚", label: "Prepares For" },
  is_like: { icon: "🔄", label: "Similar To" },
  contrasts_with: { icon: "⚡", label: "Contrasts With" },
};

const SEMANTIC_ROLE_INFO: Record<string, { icon: string; color: string }> = {
  foundational: { icon: "🎯", color: "#22c55e" },
  application: { icon: "⚙️", color: "#3b82f6" },
  example: { icon: "💡", color: "#8b5cf6" },
  edge_case: { icon: "⚠️", color: "#f59e0b" },
  counterexample: { icon: "❌", color: "#ef4444" },
  concept: { icon: "📚", color: "#6366f1" },
};

const SEMANTIC_INTENT_INFO: Record<
  SemanticIntent,
  {
    icon: string;
    label: string;
    color: string;
    description: string;
  }
> = {
  mastery: {
    icon: "school",
    label: "Mastery",
    color: "#22c55e",
    description: "Deep understanding & retention",
  },
  reference: {
    icon: "bookmark",
    label: "Reference",
    color: "#3b82f6",
    description: "Quick lookup & recall",
  },
  exploration: {
    icon: "compass",
    label: "Exploration",
    color: "#8b5cf6",
    description: "Discovery & curiosity-driven",
  },
  connection: {
    icon: "git-merge",
    label: "Connection",
    color: "#f59e0b",
    description: "Cross-domain synthesis",
  },
  application: {
    icon: "construct",
    label: "Application",
    color: "#ef4444",
    description: "Practical use & skills",
  },
};

const ANNOTATION_TYPE_INFO: Record<
  string,
  { icon: string; color: string; label: string }
> = {
  note: { icon: "document-text", color: "#6b7280", label: "Note" },
  question: { icon: "help-circle", color: "#f59e0b", label: "Question" },
  insight: { icon: "bulb", color: "#8b5cf6", label: "Insight" },
  connection: { icon: "link", color: "#3b82f6", label: "Connection" },
  correction: { icon: "close-circle", color: "#ef4444", label: "Correction" },
  example: { icon: "code", color: "#22c55e", label: "Example" },
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function CategoryDetailScreen() {
  const colors = useColors();
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();

  // API queries
  const {
    data: category,
    isLoading: _isLoading,
    refetch,
  } = useCategory(categoryId || "");
  const { data: cards } = useCategoryCards(categoryId || "");
  const { data: relations } = useCategoryRelations(categoryId || "");
  const { data: navigation } = useLearningNavigation(categoryId || "");

  // Lens-specific queries
  const { data: annotations } = useAnnotationsByCategory(categoryId || "");
  const { data: emphasisRules } = useEmphasisRules(categoryId || "");

  // Mutations
  const startStudySession = useStartEcosystemStudySession();
  const generateAnnotation = useAIGenerateAnnotation();

  // Local state
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "cards" | "lens" | "relations" | "navigation"
  >("cards");
  const [_showAnnotationForm, setShowAnnotationForm] = useState(false);
  const [_selectedCardForAnnotation, setSelectedCardForAnnotation] = useState<
    string | null
  >(null);

  // Handlers
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleStartStudy = useCallback(async () => {
    if (!categoryId) return;

    try {
      const session = await startStudySession.mutateAsync({
        categoryId,
        mode: "goal_driven",
        maxCards: 20,
      });
      router.push(`/study/${session.data.id}` as any);
    } catch (error) {
      Alert.alert("Error", "Failed to start study session");
    }
  }, [categoryId, startStudySession]);

  const handleCardPress = useCallback((cardId: string) => {
    router.push(`/card/${cardId}` as any);
  }, []);

  const handleRelatedCategoryPress = useCallback((catId: string) => {
    router.push(`/category/${catId}` as any);
  }, []);

  const handleAddAnnotation = useCallback((cardId: string) => {
    setSelectedCardForAnnotation(cardId);
    setShowAnnotationForm(true);
  }, []);

  const handleGenerateAnnotation = useCallback(
    async (cardId: string) => {
      if (!categoryId) return;

      try {
        await generateAnnotation.mutateAsync({
          cardId,
          categoryId,
          type: "insight",
        });
        Alert.alert("Success", "AI-generated annotation added!");
      } catch (error) {
        Alert.alert("Error", "Failed to generate annotation");
      }
    },
    [categoryId, generateAnnotation],
  );

  // Stats
  const stats = useMemo(() => {
    if (!cards) return null;

    const roleDistribution = cards.reduce(
      (acc: Record<string, number>, c: any) => {
        acc[c.semanticRole] = (acc[c.semanticRole] || 0) + 1;
        return acc;
      },
      {},
    );

    const avgMastery =
      cards.length > 0
        ? cards.reduce(
            (sum: number, c: any) => sum + (c.contextMastery || 0),
            0,
          ) / cards.length
        : 0;

    return {
      totalCards: cards.length,
      avgMastery,
      roleDistribution,
    };
  }, [cards]);

  if (!categoryId) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <Text style={{ color: colors.text }}>Invalid category</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <Stack.Screen
        options={{
          title: category?.name || "Category",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerRight: () => (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => router.push(`/category/${categoryId}/edit` as any)}
            >
              <Ionicons
                name="settings-outline"
                size={22}
                color={colors.primary}
              />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header Card */}
        {category && (
          <View style={[styles.headerCard, { backgroundColor: colors.card }]}>
            <View style={styles.headerTop}>
              <View
                style={[
                  styles.categoryIcon,
                  { backgroundColor: category.color || "#6366f1" },
                ]}
              >
                <Text style={styles.categoryEmoji}>
                  {category.iconEmoji || "📁"}
                </Text>
              </View>
              <View style={styles.headerInfo}>
                <Text style={[styles.categoryName, { color: colors.text }]}>
                  {category.name}
                </Text>
                {category.description && (
                  <Text
                    style={[
                      styles.categoryDescription,
                      { color: colors.textMuted },
                    ]}
                    numberOfLines={2}
                  >
                    {category.description}
                  </Text>
                )}
                <View style={styles.metaTags}>
                  <View
                    style={[
                      styles.metaTag,
                      { backgroundColor: colors.background },
                    ]}
                  >
                    <Text
                      style={[styles.metaTagText, { color: colors.textMuted }]}
                    >
                      {category.learningIntent}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.metaTag,
                      { backgroundColor: colors.background },
                    ]}
                  >
                    <Text
                      style={[styles.metaTagText, { color: colors.textMuted }]}
                    >
                      {category.depthGoal}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Mastery Progress */}
            <View style={styles.masterySection}>
              <View style={styles.masteryHeader}>
                <Text
                  style={[styles.masteryLabel, { color: colors.textMuted }]}
                >
                  Mastery
                </Text>
                <Text style={[styles.masteryValue, { color: colors.text }]}>
                  {Math.round(category.masteryScore * 100)}%
                </Text>
              </View>
              <View
                style={[
                  styles.masteryBar,
                  { backgroundColor: colors.background },
                ]}
              >
                <View
                  style={[
                    styles.masteryFill,
                    {
                      width: `${category.masteryScore * 100}%`,
                      backgroundColor:
                        category.masteryScore > 0.7
                          ? "#22c55e"
                          : category.masteryScore > 0.4
                            ? "#f59e0b"
                            : "#ef4444",
                    },
                  ]}
                />
              </View>
            </View>

            {/* Quick Stats */}
            <View style={styles.quickStats}>
              <View style={styles.quickStat}>
                <Text style={[styles.quickStatValue, { color: colors.text }]}>
                  {category.cardCount}
                </Text>
                <Text
                  style={[styles.quickStatLabel, { color: colors.textMuted }]}
                >
                  Cards
                </Text>
              </View>
              <View style={styles.quickStat}>
                <Text style={[styles.quickStatValue, { color: colors.text }]}>
                  {Math.round(category.totalStudyTime / 60)}m
                </Text>
                <Text
                  style={[styles.quickStatLabel, { color: colors.textMuted }]}
                >
                  Study Time
                </Text>
              </View>
              <View style={styles.quickStat}>
                <Text style={[styles.quickStatValue, { color: colors.text }]}>
                  {category.maturityStage}
                </Text>
                <Text
                  style={[styles.quickStatLabel, { color: colors.textMuted }]}
                >
                  Stage
                </Text>
              </View>
            </View>

            {/* Study Button */}
            <TouchableOpacity
              style={[styles.studyButton, { backgroundColor: colors.primary }]}
              onPress={handleStartStudy}
              disabled={startStudySession.isPending}
            >
              <Ionicons name="play" size={20} color="#fff" />
              <Text style={styles.studyButtonText}>
                {startStudySession.isPending ? "Starting..." : "Study Now"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Framing Question */}
        {category?.framingQuestion && (
          <View style={[styles.framingCard, { backgroundColor: colors.card }]}>
            <Ionicons name="help-circle" size={20} color={colors.primary} />
            <Text style={[styles.framingText, { color: colors.text }]}>
              {category.framingQuestion}
            </Text>
          </View>
        )}

        {/* Tabs */}
        <View style={[styles.tabs, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "cards" && styles.tabActive]}
            onPress={() => setActiveTab("cards")}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color:
                    activeTab === "cards" ? colors.primary : colors.textMuted,
                },
              ]}
            >
              Cards ({cards?.length || 0})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "relations" && styles.tabActive]}
            onPress={() => setActiveTab("relations")}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color:
                    activeTab === "relations"
                      ? colors.primary
                      : colors.textMuted,
                },
              ]}
            >
              Relations
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "navigation" && styles.tabActive]}
            onPress={() => setActiveTab("navigation")}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color:
                    activeTab === "navigation"
                      ? colors.primary
                      : colors.textMuted,
                },
              ]}
            >
              Path
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "lens" && styles.tabActive]}
            onPress={() => setActiveTab("lens")}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color:
                    activeTab === "lens" ? colors.primary : colors.textMuted,
                },
              ]}
            >
              Lens
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        <View style={styles.tabContent}>
          {activeTab === "cards" && (
            <View>
              {/* Role Distribution */}
              {stats && Object.keys(stats.roleDistribution).length > 0 && (
                <View
                  style={[
                    styles.roleDistribution,
                    { backgroundColor: colors.card },
                  ]}
                >
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Card Roles
                  </Text>
                  <View style={styles.roleItems}>
                    {Object.entries(stats.roleDistribution).map(
                      ([role, count]) => (
                        <View key={role} style={styles.roleItem}>
                          <Text style={styles.roleIcon}>
                            {SEMANTIC_ROLE_INFO[role]?.icon || "📄"}
                          </Text>
                          <Text
                            style={[
                              styles.roleLabel,
                              { color: colors.textMuted },
                            ]}
                          >
                            {role.replace("_", " ")}
                          </Text>
                          <Text
                            style={[styles.roleCount, { color: colors.text }]}
                          >
                            {count as number}
                          </Text>
                        </View>
                      ),
                    )}
                  </View>
                </View>
              )}

              {/* Card List */}
              {cards && cards.length > 0 ? (
                <View style={styles.cardList}>
                  {cards.slice(0, 10).map((card: any) => (
                    <TouchableOpacity
                      key={card.id}
                      style={[
                        styles.cardItem,
                        { backgroundColor: colors.card },
                      ]}
                      onPress={() => handleCardPress(card.cardId)}
                    >
                      <View
                        style={[
                          styles.cardRoleIndicator,
                          {
                            backgroundColor:
                              SEMANTIC_ROLE_INFO[card.semanticRole]?.color ||
                              "#6b7280",
                          },
                        ]}
                      />
                      <View style={styles.cardInfo}>
                        <Text
                          style={[styles.cardPreview, { color: colors.text }]}
                          numberOfLines={2}
                        >
                          {card.card?.content?.front ||
                            card.card?.content?.question ||
                            "Card"}
                        </Text>
                        <View style={styles.cardMeta}>
                          <Text
                            style={[
                              styles.cardRole,
                              { color: colors.textMuted },
                            ]}
                          >
                            {card.semanticRole}
                          </Text>
                          {card.isPrimary && (
                            <Text style={styles.primaryBadge}>⭐ Primary</Text>
                          )}
                        </View>
                      </View>
                      <Text
                        style={[
                          styles.cardMastery,
                          { color: colors.textMuted },
                        ]}
                      >
                        {Math.round(card.contextMastery * 100)}%
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {cards.length > 10 && (
                    <TouchableOpacity
                      style={[
                        styles.showMoreButton,
                        { backgroundColor: colors.card },
                      ]}
                    >
                      <Text
                        style={[styles.showMoreText, { color: colors.primary }]}
                      >
                        Show all {cards.length} cards
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View
                  style={[styles.emptyState, { backgroundColor: colors.card }]}
                >
                  <Ionicons
                    name="documents-outline"
                    size={48}
                    color={colors.textMuted}
                  />
                  <Text
                    style={[styles.emptyTitle, { color: colors.textMuted }]}
                  >
                    No cards yet
                  </Text>
                  <Text
                    style={[styles.emptySubtitle, { color: colors.textMuted }]}
                  >
                    Add cards to this category to start studying
                  </Text>
                </View>
              )}
            </View>
          )}

          {activeTab === "relations" && (
            <View>
              {relations && (
                <>
                  {/* Outgoing Relations */}
                  {relations.outgoing && relations.outgoing.length > 0 && (
                    <View
                      style={[
                        styles.relationSection,
                        { backgroundColor: colors.card },
                      ]}
                    >
                      <Text
                        style={[styles.sectionTitle, { color: colors.text }]}
                      >
                        This Category...
                      </Text>
                      {relations.outgoing.map((rel: any) => (
                        <TouchableOpacity
                          key={rel.id}
                          style={styles.relationItem}
                          onPress={() =>
                            handleRelatedCategoryPress(rel.targetCategoryId)
                          }
                        >
                          <Text style={styles.relationIcon}>
                            {
                              RELATION_TYPE_INFO[
                                rel.relationType as CategoryRelationType
                              ]?.icon
                            }
                          </Text>
                          <View style={styles.relationInfo}>
                            <Text
                              style={[
                                styles.relationLabel,
                                { color: colors.textMuted },
                              ]}
                            >
                              {
                                RELATION_TYPE_INFO[
                                  rel.relationType as CategoryRelationType
                                ]?.label
                              }
                            </Text>
                            <Text
                              style={[
                                styles.relationTarget,
                                { color: colors.text },
                              ]}
                            >
                              {rel.targetCategory?.name || "Unknown"}
                            </Text>
                          </View>
                          <Ionicons
                            name="chevron-forward"
                            size={20}
                            color={colors.textMuted}
                          />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Incoming Relations */}
                  {relations.incoming && relations.incoming.length > 0 && (
                    <View
                      style={[
                        styles.relationSection,
                        { backgroundColor: colors.card },
                      ]}
                    >
                      <Text
                        style={[styles.sectionTitle, { color: colors.text }]}
                      >
                        Related By...
                      </Text>
                      {relations.incoming.map((rel: any) => (
                        <TouchableOpacity
                          key={rel.id}
                          style={styles.relationItem}
                          onPress={() =>
                            handleRelatedCategoryPress(rel.sourceCategoryId)
                          }
                        >
                          <Text style={styles.relationIcon}>
                            {
                              RELATION_TYPE_INFO[
                                rel.relationType as CategoryRelationType
                              ]?.icon
                            }
                          </Text>
                          <View style={styles.relationInfo}>
                            <Text
                              style={[
                                styles.relationLabel,
                                { color: colors.textMuted },
                              ]}
                            >
                              {rel.sourceCategory?.name || "Unknown"}
                            </Text>
                            <Text
                              style={[
                                styles.relationTarget,
                                { color: colors.text },
                              ]}
                            >
                              {
                                RELATION_TYPE_INFO[
                                  rel.relationType as CategoryRelationType
                                ]?.label
                              }
                            </Text>
                          </View>
                          <Ionicons
                            name="chevron-forward"
                            size={20}
                            color={colors.textMuted}
                          />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {(!relations.outgoing || relations.outgoing.length === 0) &&
                    (!relations.incoming ||
                      relations.incoming.length === 0) && (
                      <View
                        style={[
                          styles.emptyState,
                          { backgroundColor: colors.card },
                        ]}
                      >
                        <Ionicons
                          name="git-network-outline"
                          size={48}
                          color={colors.textMuted}
                        />
                        <Text
                          style={[
                            styles.emptyTitle,
                            { color: colors.textMuted },
                          ]}
                        >
                          No relations
                        </Text>
                        <Text
                          style={[
                            styles.emptySubtitle,
                            { color: colors.textMuted },
                          ]}
                        >
                          Connect this category to others
                        </Text>
                      </View>
                    )}
                </>
              )}
            </View>
          )}

          {activeTab === "navigation" && (
            <View>
              {navigation && (
                <>
                  {/* Prerequisites */}
                  {navigation.prerequisitePath &&
                    navigation.prerequisitePath.length > 0 && (
                      <View
                        style={[
                          styles.pathSection,
                          { backgroundColor: colors.card },
                        ]}
                      >
                        <Text
                          style={[styles.sectionTitle, { color: colors.text }]}
                        >
                          📚 Prerequisites
                        </Text>
                        <Text
                          style={[
                            styles.sectionSubtitle,
                            { color: colors.textMuted },
                          ]}
                        >
                          Study these first for best results
                        </Text>
                        {navigation.prerequisitePath.map(
                          (cat: any, i: number) => (
                            <TouchableOpacity
                              key={cat.id}
                              style={styles.pathItem}
                              onPress={() => handleRelatedCategoryPress(cat.id)}
                            >
                              <View style={styles.pathIndex}>
                                <Text style={styles.pathIndexText}>
                                  {i + 1}
                                </Text>
                              </View>
                              <Text
                                style={[
                                  styles.pathName,
                                  { color: colors.text },
                                ]}
                              >
                                {cat.name}
                              </Text>
                              <Ionicons
                                name="chevron-forward"
                                size={20}
                                color={colors.textMuted}
                              />
                            </TouchableOpacity>
                          ),
                        )}
                      </View>
                    )}

                  {/* What This Prepares You For */}
                  {navigation.dependentPath &&
                    navigation.dependentPath.length > 0 && (
                      <View
                        style={[
                          styles.pathSection,
                          { backgroundColor: colors.card },
                        ]}
                      >
                        <Text
                          style={[styles.sectionTitle, { color: colors.text }]}
                        >
                          🎯 Opens Paths To
                        </Text>
                        <Text
                          style={[
                            styles.sectionSubtitle,
                            { color: colors.textMuted },
                          ]}
                        >
                          Master this to unlock these topics
                        </Text>
                        {navigation.dependentPath.map((cat: any) => (
                          <TouchableOpacity
                            key={cat.id}
                            style={styles.pathItem}
                            onPress={() => handleRelatedCategoryPress(cat.id)}
                          >
                            <View
                              style={[
                                styles.pathIndex,
                                { backgroundColor: "#22c55e" },
                              ]}
                            >
                              <Ionicons
                                name="arrow-forward"
                                size={14}
                                color="#fff"
                              />
                            </View>
                            <Text
                              style={[styles.pathName, { color: colors.text }]}
                            >
                              {cat.name}
                            </Text>
                            <Ionicons
                              name="chevron-forward"
                              size={20}
                              color={colors.textMuted}
                            />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                  {/* Suggested Next */}
                  {navigation.suggestedNext &&
                    navigation.suggestedNext.length > 0 && (
                      <View
                        style={[
                          styles.pathSection,
                          { backgroundColor: colors.card },
                        ]}
                      >
                        <Text
                          style={[styles.sectionTitle, { color: colors.text }]}
                        >
                          💡 Suggested Next
                        </Text>
                        {navigation.suggestedNext.map((cat: any) => (
                          <TouchableOpacity
                            key={cat.id}
                            style={styles.pathItem}
                            onPress={() => handleRelatedCategoryPress(cat.id)}
                          >
                            <View
                              style={[
                                styles.pathIndex,
                                { backgroundColor: "#8b5cf6" },
                              ]}
                            >
                              <Ionicons name="bulb" size={14} color="#fff" />
                            </View>
                            <Text
                              style={[styles.pathName, { color: colors.text }]}
                            >
                              {cat.name}
                            </Text>
                            <Ionicons
                              name="chevron-forward"
                              size={20}
                              color={colors.textMuted}
                            />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                </>
              )}
            </View>
          )}

          {/* Lens Tab - Category as Interpretive Lens */}
          {activeTab === "lens" && (
            <View>
              {/* Lens Philosophy Card */}
              <View
                style={[
                  styles.lensPhilosophy,
                  { backgroundColor: colors.card },
                ]}
              >
                <Ionicons name="eye" size={24} color={colors.primary} />
                <View style={styles.lensPhilosophyContent}>
                  <Text
                    style={[styles.lensPhilosophyTitle, { color: colors.text }]}
                  >
                    This Category as a Lens
                  </Text>
                  <Text
                    style={[
                      styles.lensPhilosophyText,
                      { color: colors.textMuted },
                    ]}
                  >
                    Cards don&apos;t live here—they&apos;re viewed through this
                    interpretive context
                  </Text>
                </View>
              </View>

              {/* Semantic Intent Card */}
              {category && (
                <View
                  style={[
                    styles.semanticIntentCard,
                    { backgroundColor: colors.card },
                  ]}
                >
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Semantic Intent
                  </Text>
                  {(() => {
                    const intentInfo =
                      SEMANTIC_INTENT_INFO[
                        (category.semanticIntent as SemanticIntent) ||
                          "exploration"
                      ];
                    return (
                      <View style={styles.intentDisplay}>
                        <View
                          style={[
                            styles.intentIconLarge,
                            { backgroundColor: `${intentInfo.color}20` },
                          ]}
                        >
                          <Ionicons
                            name={intentInfo.icon as any}
                            size={28}
                            color={intentInfo.color}
                          />
                        </View>
                        <View style={styles.intentInfo}>
                          <Text
                            style={[styles.intentLabel, { color: colors.text }]}
                          >
                            {intentInfo.label}
                          </Text>
                          <Text
                            style={[
                              styles.intentDescription,
                              { color: colors.textMuted },
                            ]}
                          >
                            {intentInfo.description}
                          </Text>
                        </View>
                      </View>
                    );
                  })()}
                </View>
              )}

              {/* Marginalia (Annotations) Section */}
              <View
                style={[styles.marginalia, { backgroundColor: colors.card }]}
              >
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    <Ionicons name="create" size={16} color={colors.primary} />{" "}
                    Marginalia
                  </Text>
                  <Text
                    style={[styles.sectionCount, { color: colors.textMuted }]}
                  >
                    {annotations?.data?.length || 0} notes
                  </Text>
                </View>

                {annotations?.data && annotations.data.length > 0 ? (
                  <View style={styles.annotationsList}>
                    {annotations.data.slice(0, 5).map((ann: any) => {
                      const typeInfo =
                        ANNOTATION_TYPE_INFO[ann.annotationType] ||
                        ANNOTATION_TYPE_INFO.note;
                      return (
                        <View key={ann.id} style={styles.annotationItem}>
                          <View
                            style={[
                              styles.annotationTypeIcon,
                              { backgroundColor: `${typeInfo.color}20` },
                            ]}
                          >
                            <Ionicons
                              name={typeInfo.icon as any}
                              size={14}
                              color={typeInfo.color}
                            />
                          </View>
                          <View style={styles.annotationContent}>
                            <Text
                              style={[
                                styles.annotationText,
                                { color: colors.text },
                              ]}
                              numberOfLines={2}
                            >
                              {ann.content}
                            </Text>
                            <Text
                              style={[
                                styles.annotationMeta,
                                { color: colors.textMuted },
                              ]}
                            >
                              {typeInfo.label} •{" "}
                              {new Date(ann.createdAt).toLocaleDateString()}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                    {annotations.data.length > 5 && (
                      <TouchableOpacity style={styles.viewMoreButton}>
                        <Text
                          style={[
                            styles.viewMoreText,
                            { color: colors.primary },
                          ]}
                        >
                          View all {annotations.data.length} annotations
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  <View style={styles.emptyAnnotations}>
                    <Ionicons
                      name="document-text-outline"
                      size={32}
                      color={colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.emptyAnnotationsText,
                        { color: colors.textMuted },
                      ]}
                    >
                      No marginalia yet
                    </Text>
                    <Text
                      style={[
                        styles.emptyAnnotationsHint,
                        { color: colors.textMuted },
                      ]}
                    >
                      Add personal notes to cards in this context
                    </Text>
                  </View>
                )}
              </View>

              {/* Emphasis Rules Section */}
              <View
                style={[
                  styles.emphasisSection,
                  { backgroundColor: colors.card },
                ]}
              >
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    <Ionicons name="options" size={16} color={colors.primary} />{" "}
                    Emphasis Rules
                  </Text>
                  <TouchableOpacity>
                    <Ionicons
                      name="add-circle"
                      size={22}
                      color={colors.primary}
                    />
                  </TouchableOpacity>
                </View>

                {emphasisRules && emphasisRules.length > 0 ? (
                  <View style={styles.emphasisRulesList}>
                    {emphasisRules.map((rule: any) => (
                      <View key={rule.id} style={styles.emphasisRuleItem}>
                        <View style={styles.emphasisRuleHeader}>
                          <Text
                            style={[
                              styles.emphasisRuleName,
                              { color: colors.text },
                            ]}
                          >
                            {rule.name}
                          </Text>
                          <View
                            style={[
                              styles.emphasisMultiplier,
                              {
                                backgroundColor:
                                  rule.priority > 5 ? "#22c55e20" : "#ef444420",
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.emphasisMultiplierText,
                                {
                                  color:
                                    rule.priority > 5 ? "#22c55e" : "#ef4444",
                                },
                              ]}
                            >
                              Priority: {rule.priority}
                            </Text>
                          </View>
                        </View>
                        {rule.targetValue && (
                          <Text
                            style={[
                              styles.emphasisRuleDesc,
                              { color: colors.textMuted },
                            ]}
                            numberOfLines={1}
                          >
                            Target: {rule.targetValue}
                          </Text>
                        )}
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyEmphasis}>
                    <Text
                      style={[
                        styles.emptyEmphasisText,
                        { color: colors.textMuted },
                      ]}
                    >
                      No custom emphasis rules
                    </Text>
                    <Text
                      style={[
                        styles.emptyEmphasisHint,
                        { color: colors.textMuted },
                      ]}
                    >
                      Create rules to highlight or de-emphasize cards in this
                      lens
                    </Text>
                  </View>
                )}
              </View>

              {/* Cards Through This Lens */}
              {cards && cards.length > 0 && (
                <View
                  style={[
                    styles.lensCardsSection,
                    { backgroundColor: colors.card },
                  ]}
                >
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    Cards Through This Lens
                  </Text>
                  <Text
                    style={[
                      styles.sectionSubtitle,
                      { color: colors.textMuted },
                    ]}
                  >
                    How each card appears in this interpretive context
                  </Text>

                  {cards.slice(0, 5).map((card: any) => (
                    <TouchableOpacity
                      key={card.id}
                      style={styles.lensCardItem}
                      onPress={() => handleCardPress(card.id)}
                      onLongPress={() => handleAddAnnotation(card.id)}
                    >
                      <View style={styles.lensCardContent}>
                        <Text
                          style={[styles.lensCardTitle, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          {card.front || card.title}
                        </Text>
                        <View style={styles.lensCardMeta}>
                          <View
                            style={[
                              styles.roleTag,
                              {
                                backgroundColor: `${SEMANTIC_ROLE_INFO[card.semanticRole]?.color || "#6366f1"}20`,
                              },
                            ]}
                          >
                            <Text style={styles.roleTagEmoji}>
                              {SEMANTIC_ROLE_INFO[card.semanticRole]?.icon ||
                                "📄"}
                            </Text>
                            <Text
                              style={[
                                styles.roleTagText,
                                {
                                  color:
                                    SEMANTIC_ROLE_INFO[card.semanticRole]
                                      ?.color || "#6366f1",
                                },
                              ]}
                            >
                              {card.semanticRole?.replace("_", " ") ||
                                "concept"}
                            </Text>
                          </View>
                          {card.emphasis && card.emphasis !== 1.0 && (
                            <View
                              style={[
                                styles.emphasisTag,
                                {
                                  backgroundColor:
                                    card.emphasis > 1
                                      ? "#22c55e20"
                                      : "#ef444420",
                                },
                              ]}
                            >
                              <Ionicons
                                name={
                                  card.emphasis > 1 ? "arrow-up" : "arrow-down"
                                }
                                size={10}
                                color={
                                  card.emphasis > 1 ? "#22c55e" : "#ef4444"
                                }
                              />
                              <Text
                                style={[
                                  styles.emphasisTagText,
                                  {
                                    color:
                                      card.emphasis > 1 ? "#22c55e" : "#ef4444",
                                  },
                                ]}
                              >
                                {Math.round(card.emphasis * 100)}%
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={styles.lensCardActions}>
                        <TouchableOpacity
                          style={styles.lensCardAction}
                          onPress={() => handleAddAnnotation(card.id)}
                        >
                          <Ionicons
                            name="create-outline"
                            size={18}
                            color={colors.textMuted}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.lensCardAction}
                          onPress={() => handleGenerateAnnotation(card.id)}
                        >
                          <Ionicons
                            name="sparkles"
                            size={18}
                            color={colors.primary}
                          />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  ))}

                  {cards.length > 5 && (
                    <TouchableOpacity style={styles.viewMoreButton}>
                      <Text
                        style={[styles.viewMoreText, { color: colors.primary }]}
                      >
                        View all {cards.length} cards in this lens
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },

  // Header Card
  headerCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  headerTop: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  categoryIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryEmoji: {
    fontSize: 28,
  },
  headerInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  categoryDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  metaTags: {
    flexDirection: "row",
    gap: 8,
  },
  metaTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  metaTagText: {
    fontSize: 11,
    fontWeight: "500",
    textTransform: "capitalize",
  },

  // Mastery
  masterySection: {
    marginBottom: 16,
  },
  masteryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  masteryLabel: {
    fontSize: 13,
  },
  masteryValue: {
    fontSize: 13,
    fontWeight: "600",
  },
  masteryBar: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  masteryFill: {
    height: "100%",
    borderRadius: 4,
  },

  // Quick Stats
  quickStats: {
    flexDirection: "row",
    marginBottom: 16,
  },
  quickStat: {
    flex: 1,
    alignItems: "center",
  },
  quickStatValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  quickStatLabel: {
    fontSize: 11,
    marginTop: 2,
  },

  // Study Button
  studyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  studyButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },

  // Framing
  framingCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    gap: 10,
    marginBottom: 16,
  },
  framingText: {
    flex: 1,
    fontSize: 14,
    fontStyle: "italic",
  },

  // Tabs
  tabs: {
    flexDirection: "row",
    borderRadius: 10,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: "rgba(99, 102, 241, 0.15)",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
  },
  tabContent: {
    minHeight: 200,
  },

  // Role Distribution
  roleDistribution: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
  },
  sectionSubtitle: {
    fontSize: 12,
    marginBottom: 12,
    marginTop: -6,
  },
  roleItems: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  roleItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roleIcon: {
    fontSize: 12,
  },
  roleLabel: {
    fontSize: 11,
    textTransform: "capitalize",
  },
  roleCount: {
    fontSize: 11,
    fontWeight: "600",
  },

  // Card List
  cardList: {
    gap: 8,
  },
  cardItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    gap: 10,
  },
  cardRoleIndicator: {
    width: 4,
    height: 40,
    borderRadius: 2,
  },
  cardInfo: {
    flex: 1,
  },
  cardPreview: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 4,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardRole: {
    fontSize: 11,
    textTransform: "capitalize",
  },
  primaryBadge: {
    fontSize: 11,
    color: "#fbbf24",
  },
  cardMastery: {
    fontSize: 12,
    fontWeight: "600",
  },
  showMoreButton: {
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  showMoreText: {
    fontSize: 13,
    fontWeight: "600",
  },

  // Relations
  relationSection: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  relationItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
    gap: 10,
  },
  relationIcon: {
    fontSize: 20,
  },
  relationInfo: {
    flex: 1,
  },
  relationLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  relationTarget: {
    fontSize: 14,
    fontWeight: "500",
  },

  // Path
  pathSection: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  pathItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 10,
  },
  pathIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#4f46e5",
    alignItems: "center",
    justifyContent: "center",
  },
  pathIndexText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  pathName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },

  // Empty State
  emptyState: {
    borderRadius: 12,
    padding: 32,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: "center",
  },

  // Lens Tab Styles
  lensPhilosophy: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    gap: 12,
  },
  lensPhilosophyContent: {
    flex: 1,
  },
  lensPhilosophyTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  lensPhilosophyText: {
    fontSize: 12,
  },

  // Semantic Intent
  semanticIntentCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  intentDisplay: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  intentIconLarge: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  intentInfo: {
    flex: 1,
  },
  intentLabel: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 2,
  },
  intentDescription: {
    fontSize: 13,
  },

  // Marginalia
  marginalia: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionCount: {
    fontSize: 12,
  },
  annotationsList: {
    gap: 10,
  },
  annotationItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  annotationTypeIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  annotationContent: {
    flex: 1,
  },
  annotationText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 2,
  },
  annotationMeta: {
    fontSize: 11,
  },
  emptyAnnotations: {
    alignItems: "center",
    paddingVertical: 20,
  },
  emptyAnnotationsText: {
    fontSize: 14,
    fontWeight: "500",
    marginTop: 8,
  },
  emptyAnnotationsHint: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
  },
  viewMoreButton: {
    paddingVertical: 10,
    alignItems: "center",
  },
  viewMoreText: {
    fontSize: 13,
    fontWeight: "600",
  },

  // Emphasis Section
  emphasisSection: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  emphasisRulesList: {
    gap: 10,
  },
  emphasisRuleItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  emphasisRuleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  emphasisRuleName: {
    fontSize: 14,
    fontWeight: "600",
  },
  emphasisMultiplier: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  emphasisMultiplierText: {
    fontSize: 12,
    fontWeight: "600",
  },
  emphasisRuleDesc: {
    fontSize: 12,
  },
  emptyEmphasis: {
    alignItems: "center",
    paddingVertical: 16,
  },
  emptyEmphasisText: {
    fontSize: 14,
    fontWeight: "500",
  },
  emptyEmphasisHint: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
  },

  // Lens Cards Section
  lensCardsSection: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  lensCardItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  lensCardContent: {
    flex: 1,
  },
  lensCardTitle: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 6,
  },
  lensCardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  roleTag: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  roleTagEmoji: {
    fontSize: 10,
  },
  roleTagText: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  emphasisTag: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 2,
  },
  emphasisTagText: {
    fontSize: 10,
    fontWeight: "600",
  },
  lensCardActions: {
    flexDirection: "row",
    gap: 8,
  },
  lensCardAction: {
    padding: 6,
  },
});
