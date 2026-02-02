// =============================================================================
// CATEGORIES SCREEN
// =============================================================================
// Main screen for managing the Knowledge Ecosystem

import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  RefreshControl,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import {
  TerritoryMap,
  CategoryTree,
  LearningModeSelector,
  CategoryForm,
} from "@/components/ecosystem";
import {
  useEcosystemStore,
  selectCategories,
  selectNavigation,
  selectIsLoading,
  selectNeedsAttentionCategories,
} from "@/stores";
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useAnnotationStats,
} from "@/services/api";

// Local type definitions (these should eventually come from @manthanein/shared)
type CategoryId = string;
type SemanticIntent =
  | "learning"
  | "review"
  | "reference"
  | "exploration"
  | "mastery"
  | "connection"
  | "application"
  | "teaching";
type LearningIntent = "foundational" | "contextual" | "reference";
type DepthGoal = "recognition" | "recall" | "application" | "synthesis";

interface CreateCategoryInput {
  name: string;
  description?: string;
  parentId?: string;
  iconEmoji?: string;
  color?: string;
  learningIntent?: LearningIntent;
  depthGoal?: DepthGoal;
  semanticIntent?: SemanticIntent;
}

interface UpdateCategoryInput extends Partial<CreateCategoryInput> {}

// =============================================================================
// SEMANTIC INTENT CONFIGURATION
// =============================================================================

const SEMANTIC_INTENT_INFO: Record<
  SemanticIntent,
  {
    icon: string;
    label: string;
    color: string;
    description: string;
  }
> = {
  learning: {
    icon: "school",
    label: "Learning",
    color: "#10b981",
    description: "Active knowledge acquisition",
  },
  review: {
    icon: "refresh",
    label: "Review",
    color: "#6366f1",
    description: "Spaced repetition & maintenance",
  },
  mastery: {
    icon: "trophy",
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
  teaching: {
    icon: "people",
    label: "Teaching",
    color: "#f97316",
    description: "Explain to solidify understanding",
  },
};

// =============================================================================
// TYPES
// =============================================================================

type ViewMode = "tree" | "territory" | "modes" | "lens";

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function CategoriesScreen() {
  const colors = useColors();

  // Store state
  const categories = useEcosystemStore(selectCategories);
  const navigation = useEcosystemStore(selectNavigation);
  const storeIsLoading = useEcosystemStore(selectIsLoading);
  const setCategories = useEcosystemStore((s) => s.setCategories);
  const _setLoading = useEcosystemStore((s) => s.setLoading);
  const _setError = useEcosystemStore((s) => s.setError);

  // Lens-specific selectors
  const needsAttentionCategories = useEcosystemStore(
    selectNeedsAttentionCategories,
  );

  // API queries
  const {
    data: apiCategories,
    isLoading: _isLoadingCategories,
    refetch,
  } = useCategories();

  // Annotation stats for Lens view
  const { data: annotationStats } = useAnnotationStats();

  // API mutations
  const createCategoryMutation = useCreateCategory();
  const updateCategoryMutation = useUpdateCategory();
  const deleteCategoryMutation = useDeleteCategory();

  // Local state
  const [viewMode, setViewMode] = useState<ViewMode>("tree");
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [parentForNew, setParentForNew] = useState<{
    id: CategoryId;
    name: string;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIntent, setSelectedIntent] = useState<SemanticIntent | null>(
    null,
  );

  // Filter categories by semantic intent
  const filteredCategories = useMemo(() => {
    if (!selectedIntent) return categories;
    return categories.filter((c: any) => c.semanticIntent === selectedIntent);
  }, [categories, selectedIntent]);

  // Group categories by semantic intent for Lens view
  const categoriesByIntent = useMemo(() => {
    const grouped: Record<SemanticIntent, any[]> = {
      learning: [],
      review: [],
      mastery: [],
      reference: [],
      exploration: [],
      connection: [],
      application: [],
      teaching: [],
    };

    categories.forEach((cat: any) => {
      const intent = (cat.semanticIntent || "exploration") as SemanticIntent;
      if (grouped[intent]) {
        grouped[intent].push(cat);
      }
    });

    return grouped;
  }, [categories]);

  // Sync API data to store
  useEffect(() => {
    if (apiCategories) {
      setCategories(apiCategories as any[]);
    }
  }, [apiCategories, setCategories]);

  // Handlers
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleAddCategory = useCallback(
    (parentId?: CategoryId) => {
      if (parentId) {
        const parent = categories.find((c) => c.id === parentId);
        if (parent) {
          setParentForNew({ id: parentId, name: parent.name });
        }
      } else {
        setParentForNew(null);
      }
      setEditingCategory(null);
      setShowCategoryForm(true);
    },
    [categories],
  );

  const handleEditCategory = useCallback(
    (categoryId: CategoryId) => {
      const category = categories.find((c) => c.id === categoryId);
      if (category) {
        setEditingCategory(category);
        setParentForNew(null);
        setShowCategoryForm(true);
      }
    },
    [categories],
  );

  const handleCategoryPress = useCallback((categoryId: CategoryId) => {
    // Navigate to category detail or study
    router.push(`/category/${categoryId}` as any);
  }, []);

  const handleDeleteCategoryInternal = useCallback(
    async (categoryId: CategoryId) => {
      const category = categories.find((c) => c.id === categoryId);
      if (!category) return;

      Alert.alert(
        "Delete Category",
        `Are you sure you want to delete "${category.name}"? This will also remove all cards from this category.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteCategoryMutation.mutateAsync(categoryId);
                await refetch();
              } catch (error) {
                Alert.alert("Error", "Failed to delete category");
              }
            },
          },
        ],
      );
    },
    [categories, deleteCategoryMutation, refetch],
  );

  const handleCategoryLongPress = useCallback(
    (categoryId: CategoryId) => {
      const category = categories.find((c) => c.id === categoryId);
      if (!category) return;

      Alert.alert(
        category.name,
        "What would you like to do?",
        [
          {
            text: "Edit",
            onPress: () => handleEditCategory(categoryId),
          },
          {
            text: "Add Sub-category",
            onPress: () => handleAddCategory(categoryId),
          },
          {
            text: "Study",
            onPress: () => router.push(`/study/category/${categoryId}` as any),
          },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => handleDeleteCategoryInternal(categoryId),
          },
          {
            text: "Cancel",
            style: "cancel",
          },
        ],
        { cancelable: true },
      );
    },
    [
      categories,
      handleEditCategory,
      handleAddCategory,
      handleDeleteCategoryInternal,
    ],
  );

  const handleFormSubmit = useCallback(
    async (
      data: CreateCategoryInput | { id: string; data: UpdateCategoryInput },
    ) => {
      try {
        if ("id" in data) {
          await updateCategoryMutation.mutateAsync({
            id: data.id,
            data: data.data,
          });
        } else {
          await createCategoryMutation.mutateAsync(data);
        }
        setShowCategoryForm(false);
        setEditingCategory(null);
        setParentForNew(null);
        await refetch();
      } catch (error) {
        Alert.alert("Error", "Failed to save category");
      }
    },
    [createCategoryMutation, updateCategoryMutation, refetch],
  );

  const handleFormCancel = useCallback(() => {
    setShowCategoryForm(false);
    setEditingCategory(null);
    setParentForNew(null);
  }, []);

  const _isLoading = storeIsLoading;
  const isMutating =
    createCategoryMutation.isPending ||
    updateCategoryMutation.isPending ||
    deleteCategoryMutation.isPending;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <Stack.Screen
        options={{
          title: "Knowledge Map",
          headerShown: true,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerRight: () => (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => handleAddCategory()}
            >
              <Ionicons name="add" size={24} color={colors.primary} />
            </TouchableOpacity>
          ),
        }}
      />

      {/* View Mode Tabs */}
      <View style={[styles.tabs, { backgroundColor: colors.card }]}>
        <TouchableOpacity
          style={[styles.tab, viewMode === "tree" && styles.tabActive]}
          onPress={() => setViewMode("tree")}
        >
          <Ionicons
            name="git-branch-outline"
            size={18}
            color={viewMode === "tree" ? colors.primary : colors.textMuted}
          />
          <Text
            style={[
              styles.tabText,
              {
                color: viewMode === "tree" ? colors.primary : colors.textMuted,
              },
            ]}
          >
            Tree
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, viewMode === "territory" && styles.tabActive]}
          onPress={() => setViewMode("territory")}
        >
          <Ionicons
            name="map-outline"
            size={18}
            color={viewMode === "territory" ? colors.primary : colors.textMuted}
          />
          <Text
            style={[
              styles.tabText,
              {
                color:
                  viewMode === "territory" ? colors.primary : colors.textMuted,
              },
            ]}
          >
            Territory
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, viewMode === "modes" && styles.tabActive]}
          onPress={() => setViewMode("modes")}
        >
          <Ionicons
            name="compass-outline"
            size={18}
            color={viewMode === "modes" ? colors.primary : colors.textMuted}
          />
          <Text
            style={[
              styles.tabText,
              {
                color: viewMode === "modes" ? colors.primary : colors.textMuted,
              },
            ]}
          >
            Modes
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, viewMode === "lens" && styles.tabActive]}
          onPress={() => setViewMode("lens")}
        >
          <Ionicons
            name="eye-outline"
            size={18}
            color={viewMode === "lens" ? colors.primary : colors.textMuted}
          />
          <Text
            style={[
              styles.tabText,
              {
                color: viewMode === "lens" ? colors.primary : colors.textMuted,
              },
            ]}
          >
            Lens
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {viewMode === "tree" && (
          <View style={styles.section}>
            <CategoryTree
              onCategoryPress={handleCategoryPress}
              onCategoryLongPress={handleCategoryLongPress}
              onAddPress={handleAddCategory}
              showAddButton={true}
            />
          </View>
        )}

        {viewMode === "territory" && (
          <View style={styles.section}>
            <TerritoryMap
              onRegionPress={handleCategoryPress}
              onRegionLongPress={handleCategoryLongPress}
              height={Dimensions.get("window").height * 0.55}
            />
          </View>
        )}

        {viewMode === "modes" && (
          <View style={styles.section}>
            <LearningModeSelector />

            {/* Quick Actions based on mode */}
            <View style={styles.quickActions}>
              <Text style={[styles.quickActionsTitle, { color: colors.text }]}>
                Quick Actions
              </Text>

              {navigation.mode === "exploration" && (
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    { backgroundColor: colors.card },
                  ]}
                  onPress={() => router.push("/study/explore")}
                >
                  <Ionicons name="compass" size={24} color="#8b5cf6" />
                  <View style={styles.actionInfo}>
                    <Text style={[styles.actionTitle, { color: colors.text }]}>
                      Start Exploring
                    </Text>
                    <Text
                      style={[
                        styles.actionDescription,
                        { color: colors.textMuted },
                      ]}
                    >
                      Wander through your knowledge territories
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
              )}

              {navigation.mode === "goal_driven" && (
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    { backgroundColor: colors.card },
                  ]}
                  onPress={() => router.push("/study/goals")}
                >
                  <Ionicons name="flag" size={24} color="#3b82f6" />
                  <View style={styles.actionInfo}>
                    <Text style={[styles.actionTitle, { color: colors.text }]}>
                      Set Learning Goal
                    </Text>
                    <Text
                      style={[
                        styles.actionDescription,
                        { color: colors.textMuted },
                      ]}
                    >
                      Choose a target category to master
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
              )}

              {navigation.mode === "exam_oriented" && (
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    { backgroundColor: colors.card },
                  ]}
                  onPress={() => router.push("/study/exam")}
                >
                  <Ionicons name="alarm" size={24} color="#f59e0b" />
                  <View style={styles.actionInfo}>
                    <Text style={[styles.actionTitle, { color: colors.text }]}>
                      Exam Cramming
                    </Text>
                    <Text
                      style={[
                        styles.actionDescription,
                        { color: colors.textMuted },
                      ]}
                    >
                      Focus on cards most likely to be forgotten
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
              )}

              {navigation.mode === "synthesis" && (
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    { backgroundColor: colors.card },
                  ]}
                  onPress={() => router.push("/study/synthesis")}
                >
                  <Ionicons name="git-merge" size={24} color="#22c55e" />
                  <View style={styles.actionInfo}>
                    <Text style={[styles.actionTitle, { color: colors.text }]}>
                      Connect Ideas
                    </Text>
                    <Text
                      style={[
                        styles.actionDescription,
                        { color: colors.textMuted },
                      ]}
                    >
                      Find bridges between knowledge areas
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Lens View - Category = Lens paradigm */}
        {viewMode === "lens" && (
          <View style={styles.section}>
            {/* Lens Philosophy Banner */}
            <View style={[styles.lensBanner, { backgroundColor: colors.card }]}>
              <Ionicons name="eye" size={24} color={colors.primary} />
              <View style={styles.lensBannerContent}>
                <Text style={[styles.lensBannerTitle, { color: colors.text }]}>
                  Category as Lens, Not Container
                </Text>
                <Text
                  style={[styles.lensBannerText, { color: colors.textMuted }]}
                >
                  Cards exist once. Categories define how you see them.
                </Text>
              </View>
            </View>

            {/* Semantic Intent Filter */}
            <View style={styles.intentFilter}>
              <Text style={[styles.intentFilterTitle, { color: colors.text }]}>
                Filter by Intent
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.intentPills}
              >
                <TouchableOpacity
                  style={[
                    styles.intentPill,
                    !selectedIntent && styles.intentPillActive,
                    { borderColor: colors.primary },
                  ]}
                  onPress={() => setSelectedIntent(null)}
                >
                  <Text
                    style={[
                      styles.intentPillText,
                      {
                        color: !selectedIntent
                          ? colors.primary
                          : colors.textMuted,
                      },
                    ]}
                  >
                    All
                  </Text>
                </TouchableOpacity>
                {(
                  Object.entries(SEMANTIC_INTENT_INFO) as [
                    SemanticIntent,
                    (typeof SEMANTIC_INTENT_INFO)[SemanticIntent],
                  ][]
                ).map(([intent, info]) => (
                  <TouchableOpacity
                    key={intent}
                    style={[
                      styles.intentPill,
                      selectedIntent === intent && styles.intentPillActive,
                      { borderColor: info.color },
                    ]}
                    onPress={() =>
                      setSelectedIntent(
                        selectedIntent === intent ? null : intent,
                      )
                    }
                  >
                    <Ionicons
                      name={info.icon as any}
                      size={14}
                      color={
                        selectedIntent === intent
                          ? info.color
                          : colors.textMuted
                      }
                    />
                    <Text
                      style={[
                        styles.intentPillText,
                        {
                          color:
                            selectedIntent === intent
                              ? info.color
                              : colors.textMuted,
                        },
                      ]}
                    >
                      {info.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Categories grouped by Semantic Intent */}
            {!selectedIntent ? (
              // Show all grouped by intent
              Object.entries(categoriesByIntent).map(([intent, cats]) => {
                if (cats.length === 0) return null;
                const intentInfo =
                  SEMANTIC_INTENT_INFO[intent as SemanticIntent];
                return (
                  <View key={intent} style={styles.intentGroup}>
                    <View style={styles.intentGroupHeader}>
                      <View
                        style={[
                          styles.intentIcon,
                          { backgroundColor: `${intentInfo.color}20` },
                        ]}
                      >
                        <Ionicons
                          name={intentInfo.icon as any}
                          size={18}
                          color={intentInfo.color}
                        />
                      </View>
                      <View style={styles.intentGroupInfo}>
                        <Text
                          style={[
                            styles.intentGroupTitle,
                            { color: colors.text },
                          ]}
                        >
                          {intentInfo.label}
                        </Text>
                        <Text
                          style={[
                            styles.intentGroupDesc,
                            { color: colors.textMuted },
                          ]}
                        >
                          {intentInfo.description}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.intentCount,
                          { color: colors.textMuted },
                        ]}
                      >
                        {cats.length}
                      </Text>
                    </View>
                    <View style={styles.lensCards}>
                      {cats.slice(0, 3).map((cat: any) => (
                        <TouchableOpacity
                          key={cat.id}
                          style={[
                            styles.lensCard,
                            { backgroundColor: colors.card },
                          ]}
                          onPress={() => handleCategoryPress(cat.id)}
                          onLongPress={() => handleCategoryLongPress(cat.id)}
                        >
                          <View
                            style={[
                              styles.lensCardIcon,
                              {
                                backgroundColor: cat.color || intentInfo.color,
                              },
                            ]}
                          >
                            <Text style={styles.lensCardEmoji}>
                              {cat.iconEmoji || "📚"}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.lensCardName,
                              { color: colors.text },
                            ]}
                            numberOfLines={1}
                          >
                            {cat.name}
                          </Text>
                          <Text
                            style={[
                              styles.lensCardMeta,
                              { color: colors.textMuted },
                            ]}
                          >
                            {cat.cardCount} cards
                          </Text>
                          {cat.emphasisScore && cat.emphasisScore > 0.7 && (
                            <View
                              style={[
                                styles.emphasisBadge,
                                { backgroundColor: "#f59e0b20" },
                              ]}
                            >
                              <Text style={styles.emphasisBadgeText}>★</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      ))}
                      {cats.length > 3 && (
                        <TouchableOpacity
                          style={[
                            styles.lensCardMore,
                            { backgroundColor: colors.card },
                          ]}
                          onPress={() =>
                            setSelectedIntent(intent as SemanticIntent)
                          }
                        >
                          <Text
                            style={[
                              styles.lensCardMoreText,
                              { color: colors.primary },
                            ]}
                          >
                            +{cats.length - 3} more
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            ) : (
              // Show filtered categories
              <View style={styles.filteredCategories}>
                {filteredCategories.map((cat: any) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.filteredCategoryCard,
                      { backgroundColor: colors.card },
                    ]}
                    onPress={() => handleCategoryPress(cat.id)}
                    onLongPress={() => handleCategoryLongPress(cat.id)}
                  >
                    <View
                      style={[
                        styles.filteredCategoryIcon,
                        { backgroundColor: cat.color || colors.primary },
                      ]}
                    >
                      <Text style={styles.filteredCategoryEmoji}>
                        {cat.iconEmoji || "📚"}
                      </Text>
                    </View>
                    <View style={styles.filteredCategoryInfo}>
                      <Text
                        style={[
                          styles.filteredCategoryName,
                          { color: colors.text },
                        ]}
                      >
                        {cat.name}
                      </Text>
                      {cat.framingQuestion && (
                        <Text
                          style={[
                            styles.filteredCategoryQuestion,
                            { color: colors.textMuted },
                          ]}
                          numberOfLines={1}
                        >
                          {cat.framingQuestion}
                        </Text>
                      )}
                      <View style={styles.filteredCategoryMeta}>
                        <Text
                          style={[
                            styles.filteredCategoryMetaText,
                            { color: colors.textMuted },
                          ]}
                        >
                          {cat.cardCount} cards
                        </Text>
                        <Text
                          style={[
                            styles.filteredCategoryMetaText,
                            { color: colors.textMuted },
                          ]}
                        >
                          •
                        </Text>
                        <Text
                          style={[
                            styles.filteredCategoryMetaText,
                            { color: colors.textMuted },
                          ]}
                        >
                          {Math.round(cat.masteryScore * 100)}% mastery
                        </Text>
                      </View>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={colors.textMuted}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Needs Attention Section */}
            {needsAttentionCategories.length > 0 && (
              <View style={styles.needsAttention}>
                <Text
                  style={[styles.needsAttentionTitle, { color: colors.text }]}
                >
                  <Ionicons name="alert-circle" size={16} color="#f59e0b" />{" "}
                  Needs Attention
                </Text>
                {needsAttentionCategories.slice(0, 3).map((cat: any) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.attentionCard,
                      { backgroundColor: colors.card },
                    ]}
                    onPress={() => handleCategoryPress(cat.id)}
                  >
                    <View
                      style={[
                        styles.attentionIndicator,
                        { backgroundColor: "#f59e0b" },
                      ]}
                    />
                    <Text
                      style={[styles.attentionName, { color: colors.text }]}
                    >
                      {cat.name}
                    </Text>
                    <Text
                      style={[
                        styles.attentionReason,
                        { color: colors.textMuted },
                      ]}
                    >
                      Low retention
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Annotation Stats */}
            {annotationStats && (
              <View
                style={[
                  styles.annotationStats,
                  { backgroundColor: colors.card },
                ]}
              >
                <Text
                  style={[styles.annotationStatsTitle, { color: colors.text }]}
                >
                  <Ionicons
                    name="create-outline"
                    size={16}
                    color={colors.primary}
                  />{" "}
                  Marginalia
                </Text>
                <View style={styles.annotationStatsRow}>
                  <View style={styles.annotationStat}>
                    <Text
                      style={[
                        styles.annotationStatValue,
                        { color: colors.text },
                      ]}
                    >
                      {annotationStats.totalAnnotations || 0}
                    </Text>
                    <Text
                      style={[
                        styles.annotationStatLabel,
                        { color: colors.textMuted },
                      ]}
                    >
                      Annotations
                    </Text>
                  </View>
                  <View style={styles.annotationStat}>
                    <Text
                      style={[
                        styles.annotationStatValue,
                        { color: colors.text },
                      ]}
                    >
                      {annotationStats.activeCategories || 0}
                    </Text>
                    <Text
                      style={[
                        styles.annotationStatLabel,
                        { color: colors.textMuted },
                      ]}
                    >
                      Categories
                    </Text>
                  </View>
                  <View style={styles.annotationStat}>
                    <Text
                      style={[
                        styles.annotationStatValue,
                        { color: colors.text },
                      ]}
                    >
                      {annotationStats.recentActivity || 0}
                    </Text>
                    <Text
                      style={[
                        styles.annotationStatLabel,
                        { color: colors.textMuted },
                      ]}
                    >
                      This Week
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Stats Summary */}
        {categories.length > 0 && (
          <View style={[styles.statsCard, { backgroundColor: colors.card }]}>
            <View style={styles.statRow}>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {categories.length}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                  Categories
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {categories.reduce((sum, c) => sum + c.cardCount, 0)}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                  Total Cards
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {Math.round(
                    (categories.reduce((sum, c) => sum + c.masteryScore, 0) /
                      categories.length) *
                      100,
                  )}
                  %
                </Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                  Avg Mastery
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Category Form Modal */}
      <Modal
        visible={showCategoryForm}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleFormCancel}
      >
        <CategoryForm
          mode={editingCategory ? "edit" : "create"}
          initialValues={editingCategory}
          parentId={parentForNew?.id}
          parentName={parentForNew?.name}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
          isLoading={isMutating}
        />
      </Modal>
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

  // Tabs
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  tabActive: {
    backgroundColor: "rgba(99, 102, 241, 0.15)",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },

  // Quick Actions
  quickActions: {
    marginTop: 24,
    gap: 12,
  },
  quickActionsTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  actionInfo: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  actionDescription: {
    fontSize: 13,
  },

  // Stats
  statsCard: {
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: "#374151",
  },

  // Lens View Styles
  lensBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 12,
  },
  lensBannerContent: {
    flex: 1,
  },
  lensBannerTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  lensBannerText: {
    fontSize: 13,
  },

  // Intent Filter
  intentFilter: {
    marginBottom: 20,
  },
  intentFilterTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
  },
  intentPills: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 16,
  },
  intentPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  intentPillActive: {
    backgroundColor: "rgba(99, 102, 241, 0.1)",
  },
  intentPillText: {
    fontSize: 13,
    fontWeight: "500",
  },

  // Intent Groups
  intentGroup: {
    marginBottom: 20,
  },
  intentGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 10,
  },
  intentIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  intentGroupInfo: {
    flex: 1,
  },
  intentGroupTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  intentGroupDesc: {
    fontSize: 12,
    marginTop: 1,
  },
  intentCount: {
    fontSize: 13,
    fontWeight: "600",
  },

  // Lens Cards (horizontal scroll)
  lensCards: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  lensCard: {
    width: 100,
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    position: "relative",
  },
  lensCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  lensCardEmoji: {
    fontSize: 20,
  },
  lensCardName: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  lensCardMeta: {
    fontSize: 10,
    marginTop: 2,
  },
  emphasisBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  emphasisBadgeText: {
    fontSize: 10,
    color: "#f59e0b",
  },
  lensCardMore: {
    width: 100,
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  lensCardMoreText: {
    fontSize: 13,
    fontWeight: "600",
  },

  // Filtered Categories (list view)
  filteredCategories: {
    gap: 10,
  },
  filteredCategoryCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  filteredCategoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  filteredCategoryEmoji: {
    fontSize: 18,
  },
  filteredCategoryInfo: {
    flex: 1,
  },
  filteredCategoryName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  filteredCategoryQuestion: {
    fontSize: 12,
    fontStyle: "italic",
    marginBottom: 4,
  },
  filteredCategoryMeta: {
    flexDirection: "row",
    gap: 6,
  },
  filteredCategoryMetaText: {
    fontSize: 11,
  },

  // Needs Attention
  needsAttention: {
    marginTop: 20,
    marginBottom: 10,
  },
  needsAttentionTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
  },
  attentionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    gap: 10,
  },
  attentionIndicator: {
    width: 4,
    height: 24,
    borderRadius: 2,
  },
  attentionName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  attentionReason: {
    fontSize: 12,
  },

  // Annotation Stats
  annotationStats: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
  },
  annotationStatsTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
  },
  annotationStatsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  annotationStat: {
    alignItems: "center",
  },
  annotationStatValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  annotationStatLabel: {
    fontSize: 11,
    marginTop: 2,
  },
});
