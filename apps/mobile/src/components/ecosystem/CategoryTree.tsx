// =============================================================================
// CATEGORY TREE COMPONENT
// =============================================================================
// Interactive tree view for navigating category hierarchy

import React, { useCallback, memo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
  interpolate,
  FadeIn,
  FadeOut,
  Layout,
} from "react-native-reanimated";
import { useEcosystemStore, selectCategoryTree } from "@/stores";
import type { CategoryId, CategorySummary } from "@manthanein/shared";

// =============================================================================
// TYPES
// =============================================================================

interface CategoryTreeNode extends CategorySummary {
  children: CategoryTreeNode[];
  isExpanded: boolean;
  isSelected: boolean;
}

interface CategoryTreeProps {
  onCategoryPress?: (categoryId: CategoryId) => void;
  onCategoryLongPress?: (categoryId: CategoryId) => void;
  onAddPress?: (parentId?: CategoryId) => void;
  showAddButton?: boolean;
  selectable?: boolean;
  multiSelect?: boolean;
  selectedIds?: CategoryId[];
  onSelectionChange?: (ids: CategoryId[]) => void;
  maxDepth?: number;
  compactMode?: boolean;
}

interface TreeNodeProps {
  node: CategoryTreeNode;
  depth: number;
  onPress?: (categoryId: CategoryId) => void;
  onLongPress?: (categoryId: CategoryId) => void;
  onToggleExpand: (categoryId: CategoryId) => void;
  onAddChild?: (parentId: CategoryId) => void;
  showAddButton?: boolean;
  selectable?: boolean;
  selectedIds?: CategoryId[];
  onToggleSelect?: (categoryId: CategoryId) => void;
  maxDepth?: number;
  compactMode?: boolean;
}

// =============================================================================
// HELPERS
// =============================================================================

function getMasteryColor(mastery: number): string {
  if (mastery >= 0.8) return "#22c55e"; // Green
  if (mastery >= 0.5) return "#f59e0b"; // Amber
  if (mastery >= 0.2) return "#ef4444"; // Red
  return "#6b7280"; // Gray
}

function getDepthIndent(depth: number): number {
  return depth * 20;
}

// =============================================================================
// TREE NODE COMPONENT
// =============================================================================

const TreeNode = memo(function TreeNode({
  node,
  depth,
  onPress,
  onLongPress,
  onToggleExpand,
  onAddChild,
  showAddButton,
  selectable,
  selectedIds,
  onToggleSelect,
  maxDepth = 10,
  compactMode,
}: TreeNodeProps) {
  const hasChildren = node.children.length > 0;
  const isSelected = selectedIds?.includes(node.id);
  const canExpand = hasChildren && depth < maxDepth;

  const rotateAnim = useSharedValue(node.isExpanded ? 1 : 0);

  const handlePress = useCallback(() => {
    if (selectable) {
      onToggleSelect?.(node.id);
    } else if (canExpand) {
      rotateAnim.value = withTiming(node.isExpanded ? 0 : 1, { duration: 200 });
      onToggleExpand(node.id);
    }
    onPress?.(node.id);
  }, [
    node.id,
    node.isExpanded,
    selectable,
    canExpand,
    onToggleSelect,
    onToggleExpand,
    onPress,
    rotateAnim,
  ]);

  const handleLongPress = useCallback(() => {
    onLongPress?.(node.id);
  }, [node.id, onLongPress]);

  const handleAddChild = useCallback(() => {
    onAddChild?.(node.id);
  }, [node.id, onAddChild]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${interpolate(rotateAnim.value, [0, 1], [0, 90])}deg` },
    ],
  }));

  const nodeHeight = compactMode ? 40 : 52;

  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} layout={Layout}>
      <TouchableOpacity
        style={[
          styles.nodeContainer,
          {
            paddingLeft: 12 + getDepthIndent(depth),
            height: nodeHeight,
          },
          isSelected && styles.nodeSelected,
        ]}
        onPress={handlePress}
        onLongPress={handleLongPress}
        activeOpacity={0.7}
      >
        {/* Expand/Collapse Chevron */}
        <View style={styles.chevronContainer}>
          {canExpand ? (
            <Animated.Text style={[styles.chevron, chevronStyle]}>
              ›
            </Animated.Text>
          ) : (
            <View style={styles.chevronPlaceholder} />
          )}
        </View>

        {/* Category Icon/Emoji */}
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: node.color || "#6366f1" },
          ]}
        >
          <Text style={styles.iconText}>{node.iconEmoji || "📁"}</Text>
        </View>

        {/* Category Info */}
        <View style={styles.nodeInfo}>
          <Text
            style={[styles.nodeName, compactMode && styles.nodeNameCompact]}
            numberOfLines={1}
          >
            {node.name}
          </Text>
          {!compactMode && (
            <View style={styles.nodeStats}>
              <Text style={styles.cardCount}>{node.cardCount} cards</Text>
              <View style={styles.masteryPill}>
                <View
                  style={[
                    styles.masteryDot,
                    { backgroundColor: getMasteryColor(node.masteryScore) },
                  ]}
                />
                <Text style={styles.masteryText}>
                  {Math.round(node.masteryScore * 100)}%
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Selection Checkbox */}
        {selectable && (
          <View
            style={[styles.checkbox, isSelected && styles.checkboxSelected]}
          >
            {isSelected && <Text style={styles.checkmark}>✓</Text>}
          </View>
        )}

        {/* Add Child Button */}
        {showAddButton && !selectable && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={handleAddChild}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.addButtonText}>+</Text>
          </TouchableOpacity>
        )}

        {/* Depth Indicator Line */}
        {depth > 0 && (
          <View
            style={[styles.depthLine, { left: getDepthIndent(depth) - 10 }]}
          />
        )}
      </TouchableOpacity>

      {/* Children */}
      {node.isExpanded &&
        node.children.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            onPress={onPress}
            onLongPress={onLongPress}
            onToggleExpand={onToggleExpand}
            onAddChild={onAddChild}
            showAddButton={showAddButton}
            selectable={selectable}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
            maxDepth={maxDepth}
            compactMode={compactMode}
          />
        ))}
    </Animated.View>
  );
});

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const CategoryTree: React.FC<CategoryTreeProps> = ({
  onCategoryPress,
  onCategoryLongPress,
  onAddPress,
  showAddButton = true,
  selectable = false,
  multiSelect = false,
  selectedIds: externalSelectedIds,
  onSelectionChange,
  maxDepth = 10,
  compactMode = false,
}) => {
  const categoryTree = useEcosystemStore(selectCategoryTree);
  const toggleCategoryExpanded = useEcosystemStore(
    (s) => s.toggleCategoryExpanded,
  );
  const selectCategory = useEcosystemStore((s) => s.selectCategory);
  const deselectCategory = useEcosystemStore((s) => s.deselectCategory);
  const navigation = useEcosystemStore((s) => s.navigation);

  // Use external selection if provided, otherwise use store
  const selectedIds = externalSelectedIds || navigation.selectedCategoryIds;

  const handleToggleSelect = useCallback(
    (categoryId: CategoryId) => {
      if (externalSelectedIds && onSelectionChange) {
        // External control
        const isSelected = externalSelectedIds.includes(categoryId);
        if (isSelected) {
          onSelectionChange(
            externalSelectedIds.filter((id) => id !== categoryId),
          );
        } else {
          if (multiSelect) {
            onSelectionChange([...externalSelectedIds, categoryId]);
          } else {
            onSelectionChange([categoryId]);
          }
        }
      } else {
        // Store control
        if (selectedIds.includes(categoryId)) {
          deselectCategory(categoryId);
        } else {
          selectCategory(categoryId);
        }
      }
    },
    [
      externalSelectedIds,
      onSelectionChange,
      multiSelect,
      selectedIds,
      selectCategory,
      deselectCategory,
    ],
  );

  const handleAddChild = useCallback(
    (parentId: CategoryId) => {
      onAddPress?.(parentId);
    },
    [onAddPress],
  );

  if (categoryTree.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>📂</Text>
        <Text style={styles.emptyTitle}>No Categories</Text>
        <Text style={styles.emptySubtitle}>
          Create your first category to organize your knowledge
        </Text>
        {showAddButton && (
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => onAddPress?.()}
          >
            <Text style={styles.createButtonText}>+ Create Category</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with Add Root Button */}
      {showAddButton && (
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Categories</Text>
          <TouchableOpacity
            style={styles.headerAddButton}
            onPress={() => onAddPress?.()}
          >
            <Text style={styles.headerAddText}>+ Add</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tree */}
      <FlatList
        data={categoryTree}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TreeNode
            node={item}
            depth={0}
            onPress={onCategoryPress}
            onLongPress={onCategoryLongPress}
            onToggleExpand={toggleCategoryExpanded}
            onAddChild={handleAddChild}
            showAddButton={showAddButton}
            selectable={selectable}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            maxDepth={maxDepth}
            compactMode={compactMode}
          />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111827",
  },
  listContent: {
    paddingBottom: 24,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#f9fafb",
  },
  headerAddButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#4f46e5",
    borderRadius: 6,
  },
  headerAddText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },

  // Node
  nodeContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1f2937",
    position: "relative",
  },
  nodeSelected: {
    backgroundColor: "rgba(99, 102, 241, 0.2)",
  },

  // Chevron
  chevronContainer: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  chevron: {
    fontSize: 18,
    color: "#9ca3af",
    fontWeight: "600",
  },
  chevronPlaceholder: {
    width: 18,
  },

  // Icon
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  iconText: {
    fontSize: 16,
  },

  // Info
  nodeInfo: {
    flex: 1,
    justifyContent: "center",
  },
  nodeName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#f9fafb",
  },
  nodeNameCompact: {
    fontSize: 13,
  },
  nodeStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  cardCount: {
    fontSize: 11,
    color: "#9ca3af",
    marginRight: 12,
  },
  masteryPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "#1f2937",
    borderRadius: 8,
  },
  masteryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  masteryText: {
    fontSize: 10,
    color: "#d1d5db",
  },

  // Checkbox
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#4b5563",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  checkboxSelected: {
    backgroundColor: "#4f46e5",
    borderColor: "#4f46e5",
  },
  checkmark: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },

  // Add Button
  addButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  addButtonText: {
    color: "#9ca3af",
    fontSize: 16,
    fontWeight: "600",
  },

  // Depth Line
  depthLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "#374151",
  },

  // Empty State
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#9ca3af",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 24,
  },
  createButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#4f46e5",
    borderRadius: 8,
  },
  createButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});

export default CategoryTree;
