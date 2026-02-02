/**
 * ParticipationPanel Component
 *
 * Displays and manages a card's participation in multiple categories.
 * Shows all categories a card belongs to with semantic roles and context-specific metrics.
 *
 * Features:
 * - List of category participations with roles
 * - Add/remove participations
 * - Drag-to-reorder (priority)
 * - Context-specific performance indicators
 * - Quick actions for common operations
 */

import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  useCardParticipations,
  useAddParticipation,
  useRemoveParticipation,
  useUpdateParticipation,
  useCategories,
  type Participation,
} from "@/services/api";

// Export props type for external use
export interface ParticipationPanelProps {
  cardId: string;
  cardTitle?: string;
  onClose?: () => void;
  onParticipationChange?: () => void;
  readOnly?: boolean;
}

// Semantic role options with descriptions
const SEMANTIC_ROLES = [
  {
    value: "CORE_CONCEPT",
    label: "Core Concept",
    icon: "star",
    color: "#FFD700",
  },
  {
    value: "SUPPORTING_DETAIL",
    label: "Supporting Detail",
    icon: "layers",
    color: "#4ECDC4",
  },
  { value: "EXAMPLE", label: "Example", icon: "bulb", color: "#F7DC6F" },
  { value: "DEFINITION", label: "Definition", icon: "book", color: "#9B59B6" },
  {
    value: "APPLICATION",
    label: "Application",
    icon: "construct",
    color: "#3498DB",
  },
  {
    value: "BRIDGING_CONCEPT",
    label: "Bridging Concept",
    icon: "git-merge",
    color: "#E74C3C",
  },
  {
    value: "PREREQUISITE",
    label: "Prerequisite",
    icon: "arrow-back",
    color: "#95A5A6",
  },
  {
    value: "EXTENSION",
    label: "Extension",
    icon: "arrow-forward",
    color: "#1ABC9C",
  },
  { value: "MNEMONIC", label: "Mnemonic", icon: "flash", color: "#E67E22" },
  {
    value: "SYNTHESIS",
    label: "Synthesis",
    icon: "git-network",
    color: "#8E44AD",
  },
] as const;

export function ParticipationPanel({
  cardId,
  cardTitle,
  onClose,
  onParticipationChange,
  readOnly = false,
}: ParticipationPanelProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRoleSelector, setShowRoleSelector] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch participations
  const {
    data: participations,
    isLoading: isLoadingParticipations,
    error: participationsError,
    refetch: refetchParticipations,
  } = useCardParticipations(cardId);

  // Fetch available categories for adding
  const { data: allCategories, isLoading: isLoadingCategories } = useCategories(
    {},
  );

  // Mutations
  const addParticipation = useAddParticipation();
  const removeParticipation = useRemoveParticipation();
  const updateParticipation = useUpdateParticipation();

  // Get categories where card doesn't participate yet
  const availableCategories = useMemo(() => {
    if (!allCategories || !participations) return [];

    const participatingCategoryIds = new Set(
      participations.map((p: Participation) => p.categoryId),
    );

    return (
      allCategories as Array<{ id: string; name: string; description?: string }>
    ).filter((cat) => !participatingCategoryIds.has(cat.id));
  }, [allCategories, participations]);

  // Filter categories by search
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return availableCategories;

    const query = searchQuery.toLowerCase();
    return availableCategories.filter(
      (cat) =>
        cat.name.toLowerCase().includes(query) ||
        cat.description?.toLowerCase().includes(query),
    );
  }, [availableCategories, searchQuery]);

  // Handle adding participation
  const handleAddParticipation = useCallback(
    async (categoryId: string, semanticRole = "CORE_CONCEPT") => {
      try {
        await addParticipation.mutateAsync({
          cardId,
          categoryId,
          semanticRole,
          isPrimary: false,
        });
        setShowAddModal(false);
        setSearchQuery("");
        onParticipationChange?.();
      } catch (error) {
        Alert.alert("Error", "Failed to add participation. Please try again.");
      }
    },
    [cardId, addParticipation, onParticipationChange],
  );

  // Handle removing participation
  const handleRemoveParticipation = useCallback(
    async (participation: Participation) => {
      if (participation.isPrimary) {
        Alert.alert(
          "Cannot Remove",
          "This is the primary category for this card. Change the primary first.",
        );
        return;
      }

      Alert.alert(
        "Remove Participation",
        `Remove this card from "${participation.category?.name}"?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              try {
                await removeParticipation.mutateAsync(participation.id);
                onParticipationChange?.();
              } catch (error) {
                Alert.alert("Error", "Failed to remove participation.");
              }
            },
          },
        ],
      );
    },
    [removeParticipation, onParticipationChange],
  );

  // Handle role change
  const handleRoleChange = useCallback(
    async (participationId: string, newRole: string) => {
      try {
        await updateParticipation.mutateAsync({
          participationId,
          data: { semanticRole: newRole },
        });
        setShowRoleSelector(null);
        onParticipationChange?.();
      } catch (error) {
        Alert.alert("Error", "Failed to update role.");
      }
    },
    [updateParticipation, onParticipationChange],
  );

  // Handle set as primary
  const handleSetPrimary = useCallback(
    async (participation: Participation) => {
      if (participation.isPrimary) return;

      Alert.alert(
        "Set as Primary",
        `Make "${participation.category?.name}" the primary category for this card?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Set Primary",
            onPress: async () => {
              try {
                // First, unset current primary
                const currentPrimary = participations?.find(
                  (p: Participation) => p.isPrimary,
                );
                if (currentPrimary) {
                  await updateParticipation.mutateAsync({
                    participationId: currentPrimary.id,
                    data: { isPrimary: false },
                  });
                }

                // Then set new primary
                await updateParticipation.mutateAsync({
                  participationId: participation.id,
                  data: { isPrimary: true },
                });
                onParticipationChange?.();
              } catch (error) {
                Alert.alert("Error", "Failed to update primary category.");
              }
            },
          },
        ],
      );
    },
    [participations, updateParticipation, onParticipationChange],
  );

  // Get role info
  const getRoleInfo = (role: string) => {
    return (
      SEMANTIC_ROLES.find((r) => r.value === role) || {
        value: role,
        label: role,
        icon: "help-circle",
        color: "#888",
      }
    );
  };

  // Calculate context mastery percentage
  const getContextMastery = (participation: Participation): number => {
    if (
      !participation.contextReviewCount ||
      participation.contextReviewCount === 0
    ) {
      return 0;
    }
    return Math.round(
      ((participation.contextCorrectCount || 0) /
        participation.contextReviewCount) *
        100,
    );
  };

  // Render participation item
  const renderParticipationItem = ({ item }: { item: Participation }) => {
    const roleInfo = getRoleInfo(item.semanticRole);
    const mastery = getContextMastery(item);

    return (
      <View style={styles.participationItem}>
        <View style={styles.participationHeader}>
          <View style={styles.categoryInfo}>
            <Text style={styles.categoryName}>
              {item.category?.name || "Unknown"}
            </Text>
            {item.isPrimary && (
              <View style={styles.primaryBadge}>
                <Text style={styles.primaryBadgeText}>Primary</Text>
              </View>
            )}
          </View>

          {!readOnly && (
            <View style={styles.itemActions}>
              {!item.isPrimary && (
                <TouchableOpacity
                  onPress={() => handleSetPrimary(item)}
                  style={styles.iconButton}
                >
                  <Ionicons name="star-outline" size={18} color="#666" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => handleRemoveParticipation(item)}
                style={styles.iconButton}
              >
                <Ionicons
                  name="close-circle-outline"
                  size={18}
                  color="#E74C3C"
                />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.roleChip, { backgroundColor: roleInfo.color + "20" }]}
          onPress={() => !readOnly && setShowRoleSelector(item.id)}
          disabled={readOnly}
        >
          <Ionicons
            name={roleInfo.icon as keyof typeof Ionicons.glyphMap}
            size={14}
            color={roleInfo.color}
          />
          <Text style={[styles.roleText, { color: roleInfo.color }]}>
            {roleInfo.label}
          </Text>
          {!readOnly && (
            <Ionicons name="chevron-down" size={14} color={roleInfo.color} />
          )}
        </TouchableOpacity>

        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Context Mastery</Text>
            <View style={styles.masteryBar}>
              <View
                style={[
                  styles.masteryFill,
                  {
                    width: `${mastery}%`,
                    backgroundColor:
                      mastery >= 80
                        ? "#27AE60"
                        : mastery >= 50
                          ? "#F39C12"
                          : "#E74C3C",
                  },
                ]}
              />
            </View>
            <Text style={styles.metricValue}>{mastery}%</Text>
          </View>

          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Reviews</Text>
            <Text style={styles.metricValue}>
              {item.contextReviewCount || 0}
            </Text>
          </View>

          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Difficulty</Text>
            <Text style={styles.metricValue}>
              {((item.contextSpecificDifficulty || 0.5) * 100).toFixed(0)}%
            </Text>
          </View>
        </View>

        {/* Role Selector Modal */}
        {showRoleSelector === item.id && (
          <View style={styles.roleSelector}>
            {SEMANTIC_ROLES.map((role) => (
              <TouchableOpacity
                key={role.value}
                style={[
                  styles.roleSelectorItem,
                  item.semanticRole === role.value &&
                    styles.roleSelectorItemActive,
                ]}
                onPress={() => handleRoleChange(item.id, role.value)}
              >
                <Ionicons
                  name={role.icon as keyof typeof Ionicons.glyphMap}
                  size={16}
                  color={role.color}
                />
                <Text style={styles.roleSelectorText}>{role.label}</Text>
                {item.semanticRole === role.value && (
                  <Ionicons name="checkmark" size={16} color="#27AE60" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  // Render add category item
  const renderAddCategoryItem = ({
    item,
  }: {
    item: { id: string; name: string; description?: string };
  }) => (
    <TouchableOpacity
      style={styles.addCategoryItem}
      onPress={() => handleAddParticipation(item.id)}
    >
      <View style={styles.addCategoryInfo}>
        <Text style={styles.addCategoryName}>{item.name}</Text>
        {item.description && (
          <Text style={styles.addCategoryDescription} numberOfLines={1}>
            {item.description}
          </Text>
        )}
      </View>
      <Ionicons name="add-circle" size={24} color="#3498DB" />
    </TouchableOpacity>
  );

  // Loading state
  if (isLoadingParticipations) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3498DB" />
          <Text style={styles.loadingText}>Loading participations...</Text>
        </View>
      </View>
    );
  }

  // Error state
  if (participationsError) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#E74C3C" />
          <Text style={styles.errorText}>Failed to load participations</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => refetchParticipations()}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="layers" size={24} color="#3498DB" />
          <View style={styles.headerText}>
            <Text style={styles.title}>Participations</Text>
            {cardTitle && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {cardTitle}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.countBadge}>
            {participations?.length || 0} categories
          </Text>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Participation List */}
      <FlatList
        data={participations as Participation[]}
        keyExtractor={(item) => item.id}
        renderItem={renderParticipationItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-open-outline" size={48} color="#CCC" />
            <Text style={styles.emptyText}>No category participations</Text>
            <Text style={styles.emptySubtext}>
              Add this card to categories to see it in different contexts
            </Text>
          </View>
        }
      />

      {/* Add Button */}
      {!readOnly && availableCategories.length > 0 && (
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
        >
          <Ionicons name="add" size={24} color="#FFF" />
          <Text style={styles.addButtonText}>Add to Category</Text>
        </TouchableOpacity>
      )}

      {/* Add Category Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowAddModal(false);
          setSearchQuery("");
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add to Category</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowAddModal(false);
                  setSearchQuery("");
                }}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#888" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search categories..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Ionicons name="close-circle" size={20} color="#888" />
                </TouchableOpacity>
              )}
            </View>

            {isLoadingCategories ? (
              <ActivityIndicator
                size="small"
                color="#3498DB"
                style={styles.modalLoading}
              />
            ) : filteredCategories.length === 0 ? (
              <View style={styles.noResultsContainer}>
                <Ionicons name="search" size={48} color="#CCC" />
                <Text style={styles.noResultsText}>
                  {searchQuery
                    ? "No matching categories"
                    : "No available categories"}
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredCategories}
                keyExtractor={(item) => item.id}
                renderItem={renderAddCategoryItem}
                style={styles.categoryList}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
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
    padding: 24,
  },
  errorText: {
    marginTop: 12,
    color: "#E74C3C",
    fontSize: 16,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: "#3498DB",
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#FFF",
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  headerText: {
    marginLeft: 12,
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  subtitle: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  countBadge: {
    fontSize: 13,
    color: "#666",
    backgroundColor: "#E8F4FD",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  closeButton: {
    padding: 4,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  participationItem: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  participationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  categoryInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  primaryBadge: {
    backgroundColor: "#FFD700",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  primaryBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#333",
  },
  itemActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    padding: 4,
  },
  roleChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    marginBottom: 12,
  },
  roleText: {
    fontSize: 12,
    fontWeight: "600",
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  metric: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 10,
    color: "#888",
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  masteryBar: {
    height: 4,
    backgroundColor: "#E0E0E0",
    borderRadius: 2,
    marginBottom: 4,
    overflow: "hidden",
  },
  masteryFill: {
    height: "100%",
    borderRadius: 2,
  },
  roleSelector: {
    marginTop: 8,
    padding: 8,
    backgroundColor: "#F8F9FA",
    borderRadius: 8,
  },
  roleSelectorItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    gap: 10,
    borderRadius: 6,
  },
  roleSelectorItemActive: {
    backgroundColor: "#E8F4FD",
  },
  roleSelectorText: {
    flex: 1,
    fontSize: 14,
    color: "#333",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 48,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
  emptySubtext: {
    marginTop: 4,
    fontSize: 13,
    color: "#888",
    textAlign: "center",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3498DB",
    margin: 16,
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  addButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F0F0",
    margin: 16,
    padding: 10,
    borderRadius: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#333",
  },
  modalLoading: {
    padding: 24,
  },
  noResultsContainer: {
    alignItems: "center",
    padding: 48,
  },
  noResultsText: {
    marginTop: 12,
    fontSize: 14,
    color: "#888",
  },
  categoryList: {
    maxHeight: 400,
  },
  addCategoryItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  addCategoryInfo: {
    flex: 1,
  },
  addCategoryName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  addCategoryDescription: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
});

export default ParticipationPanel;
