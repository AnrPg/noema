// =============================================================================
// MOVE CATEGORY SHEET
// =============================================================================
// Bottom sheet for re-parenting a category in the hierarchy
// Simpler than split/merge - single action with confirmation

import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import { useCategory, useCategories, useMoveCategory } from "@/services/api";

// =============================================================================
// TYPES
// =============================================================================

interface MoveCategorySheetProps {
  categoryId: string;
  categoryName: string;
  currentParentId: string | null;
  onComplete: (result: {
    eventId: string;
    newParentId: string | null;
    previousParentId: string | null;
  }) => void;
  onCancel: () => void;
}

interface CategoryNode {
  id: string;
  name: string;
  iconEmoji?: string;
  color?: string;
  depth: number;
  hasChildren: boolean;
  path: string;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function MoveCategorySheet({
  categoryId,
  categoryName,
  currentParentId,
  onComplete,
  onCancel,
}: MoveCategorySheetProps) {
  const colors = useColors();

  // API hooks
  const { data: categories, isLoading: categoriesLoading } = useCategories();
  const { data: currentCategory } = useCategory(categoryId);
  const { data: currentParent } = useCategory(currentParentId || "");
  const moveMutation = useMoveCategory();

  // State
  const [selectedParentId, setSelectedParentId] = useState<string | null>(
    currentParentId,
  );
  const [reason, setReason] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Build flattened category tree, excluding the category being moved and its descendants
  const availableParents = useMemo(() => {
    if (!categories) return [];

    // Get all descendant IDs to exclude
    const getDescendantIds = (parentId: string): string[] => {
      const children = categories.filter((c: any) => c.parentId === parentId);
      return children.flatMap((c: any) => [c.id, ...getDescendantIds(c.id)]);
    };

    const excludeIds = new Set([categoryId, ...getDescendantIds(categoryId)]);

    // Build tree structure
    const buildTree = (
      parentId: string | null,
      depth: number,
    ): CategoryNode[] => {
      const children = categories.filter(
        (c: any) => c.parentId === parentId && !excludeIds.has(c.id),
      );

      return children.flatMap((c: any) => {
        const hasChildren = categories.some(
          (child: any) => child.parentId === c.id && !excludeIds.has(child.id),
        );
        const node: CategoryNode = {
          id: c.id,
          name: c.name,
          iconEmoji: c.iconEmoji,
          color: c.color,
          depth,
          hasChildren,
          path: c.path || c.name,
        };
        return [node, ...buildTree(c.id, depth + 1)];
      });
    };

    return buildTree(null, 0);
  }, [categories, categoryId]);

  // Filter by search
  const filteredParents = useMemo(() => {
    if (!searchQuery.trim()) return availableParents;
    const query = searchQuery.toLowerCase();
    return availableParents.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.path.toLowerCase().includes(query),
    );
  }, [availableParents, searchQuery]);

  // Check if selection is valid
  const canMove = useMemo(() => {
    // Can't move to the same parent
    if (selectedParentId === currentParentId) return false;
    // Must have selected something (or null for root)
    return true;
  }, [selectedParentId, currentParentId]);

  // Selected parent info
  const selectedParent = useMemo(() => {
    if (selectedParentId === null) return null;
    return availableParents.find((p) => p.id === selectedParentId);
  }, [selectedParentId, availableParents]);

  // =============================================================================
  // HANDLERS
  // =============================================================================

  const handleMove = useCallback(async () => {
    try {
      const result = await moveMutation.mutateAsync({
        categoryId,
        newParentId: selectedParentId,
        reason: reason.trim() || undefined,
        idempotencyKey: `move_${categoryId}_${Date.now()}`,
      });

      if (result.data?.success) {
        onComplete({
          eventId: result.data.data.eventId,
          newParentId: result.data.data.newParentId,
          previousParentId: result.data.data.previousParentId,
        });
      }
    } catch (error: any) {
      Alert.alert(
        "Move Failed",
        error.message || "An error occurred while moving the category.",
      );
    }
  }, [categoryId, selectedParentId, reason, moveMutation, onComplete]);

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Move Category
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
            {categoryName}
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      {/* Current Location */}
      <View
        style={[styles.currentSection, { backgroundColor: colors.surface }]}
      >
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
          Current Location
        </Text>
        <View style={styles.currentPath}>
          <Ionicons name="folder" size={18} color={colors.textSecondary} />
          <Text style={[styles.currentPathText, { color: colors.text }]}>
            {currentParent ? currentParent.name : "Root (Top Level)"}
          </Text>
        </View>
      </View>

      {/* New Parent Selection */}
      <View style={styles.selectionSection}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Move to:
        </Text>

        {/* Search */}
        <View
          style={[styles.searchContainer, { backgroundColor: colors.surface }]}
        >
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search categories..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons
                name="close-circle"
                size={18}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Root Option */}
        <TouchableOpacity
          style={[
            styles.parentOption,
            {
              backgroundColor:
                selectedParentId === null
                  ? colors.primary + "15"
                  : colors.surface,
              borderColor:
                selectedParentId === null ? colors.primary : colors.border,
            },
          ]}
          onPress={() => setSelectedParentId(null)}
        >
          <Ionicons
            name="home"
            size={22}
            color={
              selectedParentId === null ? colors.primary : colors.textMuted
            }
          />
          <View style={styles.parentOptionInfo}>
            <Text
              style={[
                styles.parentOptionName,
                {
                  color:
                    selectedParentId === null ? colors.primary : colors.text,
                },
              ]}
            >
              Root (Top Level)
            </Text>
            <Text
              style={[styles.parentOptionPath, { color: colors.textMuted }]}
            >
              No parent category
            </Text>
          </View>
          {selectedParentId === null && (
            <Ionicons
              name="checkmark-circle"
              size={22}
              color={colors.primary}
            />
          )}
        </TouchableOpacity>

        {/* Category List */}
        {categoriesLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : (
          <ScrollView
            style={styles.parentList}
            showsVerticalScrollIndicator={false}
          >
            {filteredParents.map((parent) => (
              <TouchableOpacity
                key={parent.id}
                style={[
                  styles.parentOption,
                  {
                    backgroundColor:
                      selectedParentId === parent.id
                        ? colors.primary + "15"
                        : colors.surface,
                    borderColor:
                      selectedParentId === parent.id
                        ? colors.primary
                        : colors.border,
                    marginLeft: parent.depth * 16,
                  },
                ]}
                onPress={() => setSelectedParentId(parent.id)}
              >
                <Text style={styles.parentEmoji}>
                  {parent.iconEmoji || "📁"}
                </Text>
                <View style={styles.parentOptionInfo}>
                  <Text
                    style={[
                      styles.parentOptionName,
                      {
                        color:
                          selectedParentId === parent.id
                            ? colors.primary
                            : colors.text,
                      },
                    ]}
                  >
                    {parent.name}
                  </Text>
                  {parent.depth > 0 && (
                    <Text
                      style={[
                        styles.parentOptionPath,
                        { color: colors.textMuted },
                      ]}
                      numberOfLines={1}
                    >
                      {parent.path}
                    </Text>
                  )}
                </View>
                {selectedParentId === parent.id && (
                  <Ionicons
                    name="checkmark-circle"
                    size={22}
                    color={colors.primary}
                  />
                )}
              </TouchableOpacity>
            ))}

            {filteredParents.length === 0 && searchQuery.length > 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="search" size={32} color={colors.textMuted} />
                <Text
                  style={[styles.emptyStateText, { color: colors.textMuted }]}
                >
                  No categories match &quot;{searchQuery}&quot;
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {/* Preview */}
      {selectedParentId !== currentParentId && (
        <View
          style={[styles.previewSection, { backgroundColor: colors.surface }]}
        >
          <View style={styles.previewRow}>
            <View style={styles.previewItem}>
              <Text style={[styles.previewLabel, { color: colors.textMuted }]}>
                From
              </Text>
              <Text style={[styles.previewValue, { color: colors.text }]}>
                {currentParent?.name || "Root"}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color={colors.primary} />
            <View style={styles.previewItem}>
              <Text style={[styles.previewLabel, { color: colors.textMuted }]}>
                To
              </Text>
              <Text style={[styles.previewValue, { color: colors.primary }]}>
                {selectedParent?.name || "Root"}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Reason */}
      <View style={styles.reasonSection}>
        <TextInput
          style={[
            styles.reasonInput,
            { backgroundColor: colors.surface, color: colors.text },
          ]}
          placeholder="Reason for moving (optional)..."
          placeholderTextColor={colors.textMuted}
          value={reason}
          onChangeText={setReason}
        />
      </View>

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.cancelButton, { borderColor: colors.border }]}
          onPress={onCancel}
        >
          <Text style={[styles.cancelButtonText, { color: colors.text }]}>
            Cancel
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.moveButton,
            {
              backgroundColor: canMove ? colors.primary : colors.border,
            },
          ]}
          onPress={handleMove}
          disabled={!canMove || moveMutation.isPending}
        >
          {moveMutation.isPending ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <>
              <Ionicons
                name="move"
                size={18}
                color={canMove ? colors.textInverse : colors.textMuted}
              />
              <Text
                style={[
                  styles.moveButtonText,
                  { color: canMove ? colors.textInverse : colors.textMuted },
                ]}
              >
                Move Category
              </Text>
            </>
          )}
        </TouchableOpacity>
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
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: 4,
  },
  headerCenter: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  headerRight: {
    width: 32,
  },

  // Current Section
  currentSection: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 6,
  },
  currentPath: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  currentPathText: {
    fontSize: 15,
    fontWeight: "500",
  },

  // Selection Section
  selectionSection: {
    flex: 1,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 12,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  parentList: {
    flex: 1,
  },
  parentOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    gap: 10,
  },
  parentEmoji: {
    fontSize: 20,
  },
  parentOptionInfo: {
    flex: 1,
  },
  parentOptionName: {
    fontSize: 15,
    fontWeight: "500",
  },
  parentOptionPath: {
    fontSize: 12,
    marginTop: 2,
  },
  loadingContainer: {
    padding: 20,
    alignItems: "center",
  },
  emptyState: {
    padding: 30,
    alignItems: "center",
    gap: 10,
  },
  emptyStateText: {
    fontSize: 14,
    textAlign: "center",
  },

  // Preview Section
  previewSection: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  previewItem: {
    flex: 1,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: "500",
    marginBottom: 2,
  },
  previewValue: {
    fontSize: 14,
    fontWeight: "600",
  },

  // Reason Section
  reasonSection: {
    paddingHorizontal: 16,
    marginTop: 12,
  },
  reasonInput: {
    padding: 12,
    borderRadius: 10,
    fontSize: 14,
  },

  // Footer
  footer: {
    flexDirection: "row",
    padding: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  moveButton: {
    flex: 2,
    flexDirection: "row",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  moveButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});

export default MoveCategorySheet;
