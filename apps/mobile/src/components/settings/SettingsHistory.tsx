// =============================================================================
// SETTINGS HISTORY COMPONENT
// =============================================================================
// Displays configuration change history with checkpoints
// Features:
// - Checkpoint list view
// - Expandable change details grouped by category
// - Rollback functionality
// - LKGC tagging

import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Dimensions,
  Alert,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import type {
  ConfigChange,
  ConfigCheckpoint,
  SettingsCategory,
  ConfigSnapshotId,
} from "@manthanein/shared";
import { useHistoryStore, useCheckpoints, useRecentChanges } from "@/stores";

// =============================================================================
// TYPES
// =============================================================================

interface HistoryModalProps {
  visible: boolean;
  onClose: () => void;
  onRollback?: (checkpointId: ConfigSnapshotId) => void;
  onTagLKGC?: (checkpointId: ConfigSnapshotId) => void;
}

interface CheckpointItemProps {
  checkpoint: ConfigCheckpoint;
  changes: ConfigChange[]; // Changes retrieved by changesSummary.changeIds
  isExpanded: boolean;
  onToggle: () => void;
  onRollback?: () => void;
  onTagLKGC?: () => void;
}

interface ChangeItemProps {
  change: ConfigChange;
  showDetails?: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const { width: _SCREEN_WIDTH, height: _SCREEN_HEIGHT } =
  Dimensions.get("window");

const CATEGORY_ICONS: Record<SettingsCategory, string> = {
  study: "📚",
  display: "🎨",
  audio: "🔊",
  notifications: "🔔",
  privacy: "🔒",
  sync: "🔄",
  accessibility: "♿",
  ai: "🤖",
  advanced: "⚙️",
  plugins: "🧩",
};

const CATEGORY_LABELS: Record<SettingsCategory, string> = {
  study: "Study",
  display: "Display",
  audio: "Audio",
  notifications: "Notifications",
  privacy: "Privacy",
  sync: "Sync",
  accessibility: "Accessibility",
  ai: "AI Features",
  advanced: "Advanced",
  plugins: "Plugins",
};

// =============================================================================
// CHANGE ITEM COMPONENT
// =============================================================================

export function ChangeItem({ change, showDetails = false }: ChangeItemProps) {
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return "not set";
    if (typeof value === "boolean") return value ? "enabled" : "disabled";
    if (typeof value === "number") return value.toString();
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  };

  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  const getSettingLabel = (key: string): string => {
    // Convert camelCase to readable format
    const setting = key.split(".").pop() || key;
    return setting
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (s) => s.toUpperCase());
  };

  return (
    <View style={styles.changeItem}>
      <View style={styles.changeHeader}>
        <Text style={styles.changeIcon}>
          {change.category ? CATEGORY_ICONS[change.category] : "📝"}
        </Text>
        <View style={styles.changeInfo}>
          <Text style={styles.changeKey} numberOfLines={1}>
            {getSettingLabel(change.settingKey)}
          </Text>
          <Text style={styles.changeTime}>{formatTime(change.timestamp)}</Text>
        </View>
      </View>

      {showDetails && (
        <View style={styles.changeDetails}>
          <View style={styles.valueRow}>
            <Text style={styles.valueLabel}>From:</Text>
            <Text style={styles.previousValue}>
              {formatValue(change.previousValue)}
            </Text>
          </View>
          <View style={styles.valueRow}>
            <Text style={styles.valueLabel}>To:</Text>
            <Text style={styles.newValue}>{formatValue(change.newValue)}</Text>
          </View>
          {change.description && (
            <Text style={styles.changeDescription}>{change.description}</Text>
          )}
        </View>
      )}
    </View>
  );
}

// =============================================================================
// CHECKPOINT ITEM COMPONENT
// =============================================================================

export function CheckpointItem({
  checkpoint,
  changes,
  isExpanded,
  onToggle,
  onRollback,
  onTagLKGC,
}: CheckpointItemProps) {
  const expandAnim = useSharedValue(isExpanded ? 1 : 0);

  React.useEffect(() => {
    expandAnim.value = withTiming(isExpanded ? 1 : 0, { duration: 200 });
  }, [isExpanded, expandAnim]);

  const contentStyle = useAnimatedStyle(() => ({
    maxHeight: expandAnim.value * 400,
    opacity: expandAnim.value,
  }));

  // Group changes by category
  const changesByCategory = useMemo(() => {
    const grouped: Record<string, ConfigChange[]> = {};
    changes.forEach((change) => {
      const category = change.category || "other";
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(change);
    });
    return grouped;
  }, [changes]);

  const formatDate = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  return (
    <View
      style={[
        styles.checkpointItem,
        checkpoint.isLKGC && styles.checkpointLKGC,
      ]}
    >
      <TouchableOpacity onPress={onToggle} style={styles.checkpointHeader}>
        <View style={styles.checkpointInfo}>
          <View style={styles.checkpointTitleRow}>
            {checkpoint.isLKGC && <Text style={styles.lkgcBadge}>⭐ LKGC</Text>}
            <Text style={styles.checkpointName}>{checkpoint.name}</Text>
          </View>
          <Text style={styles.checkpointDate}>
            {formatDate(checkpoint.timestamp)}
          </Text>
          {checkpoint.description && (
            <Text
              style={styles.checkpointDescription}
              numberOfLines={isExpanded ? undefined : 1}
            >
              {checkpoint.description}
            </Text>
          )}
        </View>
        <Text style={styles.expandIcon}>{isExpanded ? "▼" : "▶"}</Text>
      </TouchableOpacity>

      <Animated.View style={[styles.checkpointContent, contentStyle]}>
        {/* Summary */}
        {checkpoint.changesSummary && (
          <View style={styles.summarySection}>
            <Text style={styles.summaryTitle}>Changes Summary</Text>
            <Text style={styles.changeCount}>
              {checkpoint.changesSummary.totalChanges} change
              {checkpoint.changesSummary.totalChanges !== 1 ? "s" : ""} in{" "}
              {Object.keys(changesByCategory).length} categor
              {Object.keys(changesByCategory).length !== 1 ? "ies" : "y"}
            </Text>
          </View>
        )}

        {/* Changes by category */}
        <View style={styles.categoriesSection}>
          {Object.entries(changesByCategory).map(([category, changes]) => (
            <View key={category} style={styles.categoryGroup}>
              <View style={styles.categoryHeader}>
                <Text style={styles.categoryIcon}>
                  {CATEGORY_ICONS[category as SettingsCategory] || "📝"}
                </Text>
                <Text style={styles.categoryLabel}>
                  {CATEGORY_LABELS[category as SettingsCategory] || category}
                </Text>
                <Text style={styles.categoryCount}>({changes.length})</Text>
              </View>
              {changes.map((change) => (
                <ChangeItem key={change.id} change={change} showDetails />
              ))}
            </View>
          ))}
        </View>

        {/* Actions */}
        <View style={styles.checkpointActions}>
          {!checkpoint.isLKGC && onTagLKGC && (
            <TouchableOpacity style={styles.actionButton} onPress={onTagLKGC}>
              <Text style={styles.actionButtonText}>⭐ Tag as LKGC</Text>
            </TouchableOpacity>
          )}
          {onRollback && (
            <TouchableOpacity
              style={[styles.actionButton, styles.rollbackButton]}
              onPress={onRollback}
            >
              <Text
                style={[styles.actionButtonText, styles.rollbackButtonText]}
              >
                ↩️ Restore this configuration
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

// =============================================================================
// HISTORY MODAL COMPONENT
// =============================================================================

export function HistoryModal({
  visible,
  onClose,
  onRollback,
  onTagLKGC,
}: HistoryModalProps) {
  const checkpoints = useCheckpoints();
  const recentChanges = useRecentChanges(100); // Get more changes to find them by ID
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"checkpoints" | "changes">(
    "checkpoints",
  );

  // Helper to get changes for a checkpoint by their IDs
  const getChangesForCheckpoint = useCallback(
    (checkpoint: ConfigCheckpoint): ConfigChange[] => {
      if (!checkpoint.changesSummary?.changeIds) return [];
      const changeIds = new Set(checkpoint.changesSummary.changeIds);
      return recentChanges.filter((change) => changeIds.has(change.id));
    },
    [recentChanges],
  );

  const handleRollback = useCallback(
    (checkpointId: ConfigSnapshotId) => {
      Alert.alert(
        "Restore Configuration",
        "Are you sure you want to restore this configuration? Your current settings will be replaced.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Restore",
            style: "destructive",
            onPress: () => {
              onRollback?.(checkpointId);
              onClose();
            },
          },
        ],
      );
    },
    [onRollback, onClose],
  );

  const handleTagLKGC = useCallback(
    (checkpointId: ConfigSnapshotId) => {
      Alert.alert(
        "Tag as LKGC",
        "Mark this configuration as your Last Known Good Configuration? You can restore to this point if issues occur.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Tag as LKGC",
            onPress: () => onTagLKGC?.(checkpointId),
          },
        ],
      );
    },
    [onTagLKGC],
  );

  const createManualCheckpoint = useCallback(() => {
    Alert.prompt(
      "Create Checkpoint",
      "Give this configuration checkpoint a name:",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Create",
          onPress: (name) => {
            if (name) {
              useHistoryStore
                .getState()
                .createCheckpoint(name, "Manual checkpoint");
            }
          },
        },
      ],
      "plain-text",
      `Checkpoint ${new Date().toLocaleDateString()}`,
    );
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Configuration History</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === "checkpoints" && styles.tabActive,
              ]}
              onPress={() => setActiveTab("checkpoints")}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "checkpoints" && styles.tabTextActive,
                ]}
              >
                Checkpoints
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === "changes" && styles.tabActive]}
              onPress={() => setActiveTab("changes")}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "changes" && styles.tabTextActive,
                ]}
              >
                Recent Changes
              </Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          {activeTab === "checkpoints" ? (
            <>
              {/* Create checkpoint button */}
              <TouchableOpacity
                style={styles.createCheckpointButton}
                onPress={createManualCheckpoint}
              >
                <Text style={styles.createCheckpointText}>
                  + Create Checkpoint
                </Text>
              </TouchableOpacity>

              <FlatList
                data={checkpoints}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <CheckpointItem
                    checkpoint={item}
                    changes={getChangesForCheckpoint(item)}
                    isExpanded={expandedId === item.id}
                    onToggle={() =>
                      setExpandedId(expandedId === item.id ? null : item.id)
                    }
                    onRollback={() => handleRollback(item.id)}
                    onTagLKGC={() => handleTagLKGC(item.id)}
                  />
                )}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyIcon}>📋</Text>
                    <Text style={styles.emptyText}>No checkpoints yet</Text>
                    <Text style={styles.emptySubtext}>
                      Checkpoints save snapshots of your configuration that you
                      can restore later.
                    </Text>
                  </View>
                }
              />
            </>
          ) : (
            <FlatList
              data={recentChanges}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Animated.View entering={FadeIn} exiting={FadeOut}>
                  <ChangeItem change={item} showDetails />
                </Animated.View>
              )}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>📝</Text>
                  <Text style={styles.emptyText}>No recent changes</Text>
                  <Text style={styles.emptySubtext}>
                    Changes to your settings will appear here.
                  </Text>
                </View>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

// =============================================================================
// HISTORY BUTTON COMPONENT (for embedding in settings screen)
// =============================================================================

interface HistoryButtonProps {
  pendingChangesCount?: number;
}

export function HistoryButton({ pendingChangesCount }: HistoryButtonProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const { rollbackToCheckpoint, tagCheckpointAsLKGC } = useHistoryStore();

  const handleRollback = useCallback(
    (checkpointId: ConfigSnapshotId) => {
      const restored = rollbackToCheckpoint(checkpointId);
      if (restored) {
        // Apply restored settings
        // This would need to be connected to the settings store
        console.log("Would restore settings:", restored);
      }
    },
    [rollbackToCheckpoint],
  );

  const handleTagLKGC = useCallback(
    (checkpointId: ConfigSnapshotId) => {
      tagCheckpointAsLKGC(checkpointId, "User marked as good configuration");
    },
    [tagCheckpointAsLKGC],
  );

  return (
    <>
      <TouchableOpacity
        style={styles.historyButton}
        onPress={() => setModalVisible(true)}
      >
        <Text style={styles.historyButtonIcon}>📋</Text>
        <Text style={styles.historyButtonText}>History</Text>
        {pendingChangesCount && pendingChangesCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pendingChangesCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      <HistoryModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onRollback={handleRollback}
        onTagLKGC={handleTagLKGC}
      />
    </>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  // Change Item
  changeItem: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 12,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  changeHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  changeIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  changeInfo: {
    flex: 1,
  },
  changeKey: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  changeTime: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
  },
  changeDetails: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  valueRow: {
    flexDirection: "row",
    marginVertical: 2,
  },
  valueLabel: {
    width: 40,
    fontSize: 12,
    color: "#6B7280",
  },
  previousValue: {
    flex: 1,
    fontSize: 12,
    color: "#EF4444",
    textDecorationLine: "line-through",
  },
  newValue: {
    flex: 1,
    fontSize: 12,
    color: "#10B981",
    fontWeight: "500",
  },
  changeDescription: {
    marginTop: 8,
    fontSize: 12,
    color: "#6B7280",
    fontStyle: "italic",
  },

  // Checkpoint Item
  checkpointItem: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  checkpointLKGC: {
    borderColor: "#F59E0B",
    borderWidth: 2,
  },
  checkpointHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  checkpointInfo: {
    flex: 1,
  },
  checkpointTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  lkgcBadge: {
    fontSize: 12,
    fontWeight: "600",
    color: "#F59E0B",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  checkpointName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  checkpointDate: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  checkpointDescription: {
    fontSize: 13,
    color: "#4B5563",
    marginTop: 4,
  },
  expandIcon: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  checkpointContent: {
    overflow: "hidden",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  summarySection: {
    padding: 14,
    backgroundColor: "#F9FAFB",
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
  },
  summaryText: {
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 19,
  },
  changeCount: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 8,
  },
  categoriesSection: {
    padding: 14,
  },
  categoryGroup: {
    marginBottom: 16,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  categoryIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  categoryCount: {
    fontSize: 12,
    color: "#9CA3AF",
    marginLeft: 4,
  },
  checkpointActions: {
    flexDirection: "row",
    padding: 14,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  rollbackButton: {
    backgroundColor: "#EFF6FF",
  },
  rollbackButtonText: {
    color: "#1D4ED8",
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    flex: 1,
    marginTop: 60,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    fontSize: 18,
    color: "#6B7280",
  },
  tabs: {
    flexDirection: "row",
    padding: 10,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "#3B82F6",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
  tabTextActive: {
    color: "#FFFFFF",
  },
  createCheckpointButton: {
    margin: 10,
    marginBottom: 0,
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
    alignItems: "center",
  },
  createCheckpointText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
  listContent: {
    padding: 10,
  },
  emptyState: {
    alignItems: "center",
    padding: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },

  // History Button
  historyButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
  },
  historyButtonIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  historyButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  badge: {
    marginLeft: 8,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
