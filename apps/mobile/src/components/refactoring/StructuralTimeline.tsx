// =============================================================================
// STRUCTURAL TIMELINE COMPONENT
// =============================================================================
// Shows the history of structural refactoring events
// Allows viewing, diffing, and rolling back operations

import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import {
  useRefactorTimeline,
  useStructuralSnapshots,
  useRollbackRefactor,
  useCompareSnapshots,
  useCreateSnapshot,
  RefactorTimelineEntry,
  StructuralSnapshot,
} from "@/services/api";

// =============================================================================
// TYPES
// =============================================================================

interface StructuralTimelineProps {
  categoryId?: string; // Optional filter by category
  onEventPress?: (event: RefactorTimelineEntry) => void;
  onSnapshotPress?: (snapshot: StructuralSnapshot) => void;
}

type TabKey = "timeline" | "snapshots";

// =============================================================================
// CONSTANTS
// =============================================================================

const OPERATION_TYPE_INFO: Record<
  string,
  { icon: string; label: string; color: string }
> = {
  split: { icon: "git-branch", label: "Split", color: "#8b5cf6" },
  merge: { icon: "git-merge", label: "Merge", color: "#06b6d4" },
  move: { icon: "move", label: "Move", color: "#f59e0b" },
  rename: { icon: "pencil", label: "Rename", color: "#22c55e" },
  archive: { icon: "archive", label: "Archive", color: "#6b7280" },
  restore: { icon: "refresh", label: "Restore", color: "#14b8a6" },
  bulk_reassign: { icon: "copy", label: "Bulk Reassign", color: "#ec4899" },
};

// =============================================================================
// EVENT CARD COMPONENT
// =============================================================================

function EventCard({
  event,
  onPress,
  onRollback,
  isRollingBack,
}: {
  event: RefactorTimelineEntry;
  onPress?: () => void;
  onRollback?: () => void;
  isRollingBack?: boolean;
}) {
  const colors = useColors();
  const opInfo = OPERATION_TYPE_INFO[event.eventType] || {
    icon: "help-circle",
    label: event.eventType,
    color: colors.textMuted,
  };

  const isRolledBack = event.wasRolledBack;

  return (
    <TouchableOpacity
      style={[
        styles.eventCard,
        {
          backgroundColor: colors.surface,
          opacity: isRolledBack ? 0.6 : 1,
        },
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.eventHeader}>
        <View
          style={[styles.eventIcon, { backgroundColor: opInfo.color + "20" }]}
        >
          <Ionicons name={opInfo.icon as any} size={18} color={opInfo.color} />
        </View>
        <View style={styles.eventInfo}>
          <View style={styles.eventTitleRow}>
            <Text style={[styles.eventType, { color: colors.text }]}>
              {opInfo.label}
            </Text>
            {isRolledBack && (
              <View
                style={[
                  styles.rolledBackBadge,
                  { backgroundColor: colors.error + "20" },
                ]}
              >
                <Text style={[styles.rolledBackText, { color: colors.error }]}>
                  Rolled Back
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.eventDate, { color: colors.textMuted }]}>
            {new Date(event.timestamp).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
        {!isRolledBack && event.isRollbackable && onRollback && (
          <TouchableOpacity
            style={[
              styles.rollbackButton,
              { backgroundColor: colors.error + "15" },
            ]}
            onPress={onRollback}
            disabled={isRollingBack}
          >
            {isRollingBack ? (
              <ActivityIndicator size="small" color={colors.error} />
            ) : (
              <Ionicons name="arrow-undo" size={16} color={colors.error} />
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Event Details */}
      <View style={styles.eventDetails}>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>
            Category:
          </Text>
          <Text style={[styles.detailValue, { color: colors.text }]}>
            {event.primaryCategoryName}
          </Text>
        </View>
        {event.summary && (
          <Text
            style={[styles.eventSummary, { color: colors.textSecondary }]}
            numberOfLines={2}
          >
            {event.summary}
          </Text>
        )}
        {event.affectedCategoryCount > 1 && (
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>
              Affected:
            </Text>
            <Text style={[styles.detailValue, { color: colors.text }]}>
              {event.affectedCategoryCount} categories,{" "}
              {event.affectedCardCount} cards
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// =============================================================================
// SNAPSHOT CARD COMPONENT
// =============================================================================

function SnapshotCard({
  snapshot,
  onPress,
  onCompare,
  isSelected,
}: {
  snapshot: StructuralSnapshot;
  onPress?: () => void;
  onCompare?: () => void;
  isSelected?: boolean;
}) {
  const colors = useColors();

  return (
    <TouchableOpacity
      style={[
        styles.snapshotCard,
        {
          backgroundColor: colors.surface,
          borderColor: isSelected ? colors.primary : "transparent",
          borderWidth: isSelected ? 2 : 0,
        },
      ]}
      onPress={onPress}
    >
      <View style={styles.snapshotHeader}>
        <View
          style={[
            styles.snapshotIcon,
            {
              backgroundColor: snapshot.isAutomatic
                ? colors.textMuted + "20"
                : colors.primary + "20",
            },
          ]}
        >
          <Ionicons
            name={snapshot.isAutomatic ? "time" : "camera"}
            size={18}
            color={snapshot.isAutomatic ? colors.textMuted : colors.primary}
          />
        </View>
        <View style={styles.snapshotInfo}>
          <Text style={[styles.snapshotName, { color: colors.text }]}>
            {snapshot.name || "Snapshot"}
          </Text>
          <Text style={[styles.snapshotDate, { color: colors.textMuted }]}>
            {new Date(snapshot.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
        {onCompare && (
          <TouchableOpacity
            style={[
              styles.compareButton,
              { backgroundColor: colors.primary + "15" },
            ]}
            onPress={onCompare}
          >
            <Ionicons name="git-compare" size={16} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.snapshotStats}>
        {snapshot.isAutomatic && (
          <View
            style={[
              styles.autoBadge,
              { backgroundColor: colors.textMuted + "20" },
            ]}
          >
            <Text style={[styles.autoBadgeText, { color: colors.textMuted }]}>
              Auto
            </Text>
          </View>
        )}
        {snapshot.stats && (
          <>
            <Text style={[styles.statText, { color: colors.textMuted }]}>
              {snapshot.stats.totalCategories} categories
            </Text>
            <Text style={[styles.statText, { color: colors.textMuted }]}>
              • {snapshot.stats.totalCards} cards
            </Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

// =============================================================================
// DIFF MODAL COMPONENT
// =============================================================================

function DiffModal({
  visible,
  fromSnapshotId,
  toSnapshotId,
  onClose,
}: {
  visible: boolean;
  fromSnapshotId: string;
  toSnapshotId: string;
  onClose: () => void;
}) {
  const colors = useColors();
  const { data: diff, isLoading } = useCompareSnapshots(
    fromSnapshotId,
    toSnapshotId,
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[styles.modalContainer, { backgroundColor: colors.background }]}
      >
        <View
          style={[styles.modalHeader, { borderBottomColor: colors.border }]}
        >
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            Compare Snapshots
          </Text>
          <View style={{ width: 24 }} />
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : diff ? (
          <ScrollView style={styles.modalContent}>
            {/* Summary */}
            <View
              style={[styles.diffSummary, { backgroundColor: colors.surface }]}
            >
              <Text style={[styles.diffSummaryTitle, { color: colors.text }]}>
                Changes Overview
              </Text>
              <View style={styles.diffStats}>
                <View style={styles.diffStat}>
                  <Ionicons name="add-circle" size={20} color="#22c55e" />
                  <Text style={[styles.diffStatValue, { color: "#22c55e" }]}>
                    {diff.summary.categoriesAdded}
                  </Text>
                  <Text
                    style={[styles.diffStatLabel, { color: colors.textMuted }]}
                  >
                    Added
                  </Text>
                </View>
                <View style={styles.diffStat}>
                  <Ionicons name="remove-circle" size={20} color="#ef4444" />
                  <Text style={[styles.diffStatValue, { color: "#ef4444" }]}>
                    {diff.summary.categoriesRemoved}
                  </Text>
                  <Text
                    style={[styles.diffStatLabel, { color: colors.textMuted }]}
                  >
                    Removed
                  </Text>
                </View>
                <View style={styles.diffStat}>
                  <Ionicons name="create" size={20} color="#f59e0b" />
                  <Text style={[styles.diffStatValue, { color: "#f59e0b" }]}>
                    {diff.summary.categoriesModified}
                  </Text>
                  <Text
                    style={[styles.diffStatLabel, { color: colors.textMuted }]}
                  >
                    Modified
                  </Text>
                </View>
                <View style={styles.diffStat}>
                  <Ionicons name="swap-horizontal" size={20} color="#8b5cf6" />
                  <Text style={[styles.diffStatValue, { color: "#8b5cf6" }]}>
                    {diff.summary.cardsMoved}
                  </Text>
                  <Text
                    style={[styles.diffStatLabel, { color: colors.textMuted }]}
                  >
                    Cards Moved
                  </Text>
                </View>
              </View>
            </View>

            {/* Added */}
            {diff.addedCategories.length > 0 && (
              <View style={styles.diffSection}>
                <Text style={[styles.diffSectionTitle, { color: "#22c55e" }]}>
                  ➕ Added Categories ({diff.addedCategories.length})
                </Text>
                {diff.addedCategories.map((item: any) => (
                  <View
                    key={item.id}
                    style={[styles.diffItem, { backgroundColor: "#22c55e10" }]}
                  >
                    <Text style={[styles.diffItemName, { color: colors.text }]}>
                      {item.name}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Removed */}
            {diff.removedCategories.length > 0 && (
              <View style={styles.diffSection}>
                <Text style={[styles.diffSectionTitle, { color: "#ef4444" }]}>
                  ➖ Removed Categories ({diff.removedCategories.length})
                </Text>
                {diff.removedCategories.map((item: any) => (
                  <View
                    key={item.id}
                    style={[styles.diffItem, { backgroundColor: "#ef444410" }]}
                  >
                    <Text style={[styles.diffItemName, { color: colors.text }]}>
                      {item.name}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Modified */}
            {diff.modifiedCategories.length > 0 && (
              <View style={styles.diffSection}>
                <Text style={[styles.diffSectionTitle, { color: "#f59e0b" }]}>
                  ✏️ Modified Categories ({diff.modifiedCategories.length})
                </Text>
                {diff.modifiedCategories.map((item: any) => (
                  <View
                    key={item.categoryId}
                    style={[styles.diffItem, { backgroundColor: "#f59e0b10" }]}
                  >
                    <Text style={[styles.diffItemName, { color: colors.text }]}>
                      Category {item.categoryId}
                    </Text>
                    {item.changes.map((change: any, idx: number) => (
                      <Text
                        key={idx}
                        style={[styles.diffChange, { color: colors.textMuted }]}
                      >
                        {change.field}: {String(change.oldValue)} →{" "}
                        {String(change.newValue)}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            )}

            {/* Card Movements */}
            {diff.cardMovements.length > 0 && (
              <View style={styles.diffSection}>
                <Text style={[styles.diffSectionTitle, { color: "#8b5cf6" }]}>
                  📦 Card Movements ({diff.cardMovements.length})
                </Text>
                {diff.cardMovements.map((item: any) => (
                  <View
                    key={item.cardId}
                    style={[styles.diffItem, { backgroundColor: "#8b5cf610" }]}
                  >
                    <Text style={[styles.diffItemName, { color: colors.text }]}>
                      Card {item.cardId}
                    </Text>
                    <Text
                      style={[styles.diffChange, { color: colors.textMuted }]}
                    >
                      Moved between categories
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        ) : (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyStateText, { color: colors.textMuted }]}>
              No differences found
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function StructuralTimeline({
  categoryId,
  onEventPress,
  onSnapshotPress,
}: StructuralTimelineProps) {
  const colors = useColors();

  // State
  const [activeTab, setActiveTab] = useState<TabKey>("timeline");
  const [refreshing, setRefreshing] = useState(false);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [showCreateSnapshot, setShowCreateSnapshot] = useState(false);
  const [snapshotName, setSnapshotName] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [selectedSnapshots, setSelectedSnapshots] = useState<string[]>([]);
  const [showDiff, setShowDiff] = useState(false);

  // API hooks
  const {
    data: eventsData,
    isLoading: eventsLoading,
    refetch: refetchEvents,
  } = useRefactorTimeline({
    categoryId,
    includeRolledBack: true,
    limit: 50,
  });

  const {
    data: snapshotsData,
    isLoading: snapshotsLoading,
    refetch: refetchSnapshots,
  } = useStructuralSnapshots({ limit: 50 });

  const rollbackMutation = useRollbackRefactor();
  const createSnapshotMutation = useCreateSnapshot();

  const events = eventsData?.entries || [];
  const snapshots = snapshotsData?.snapshots || [];

  // Handlers
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchEvents(), refetchSnapshots()]);
    setRefreshing(false);
  }, [refetchEvents, refetchSnapshots]);

  const handleRollback = useCallback(
    async (eventId: string) => {
      Alert.alert(
        "Rollback Operation",
        "Are you sure you want to rollback this operation? This will undo the changes made by this event.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Rollback",
            style: "destructive",
            onPress: async () => {
              try {
                setRollingBackId(eventId);
                await rollbackMutation.mutateAsync({
                  eventId,
                  reason: "User requested rollback from timeline",
                });
                Alert.alert("Success", "Operation rolled back successfully.");
                refetchEvents();
              } catch (error: any) {
                Alert.alert(
                  "Rollback Failed",
                  error.message || "An error occurred.",
                );
              } finally {
                setRollingBackId(null);
              }
            },
          },
        ],
      );
    },
    [rollbackMutation, refetchEvents],
  );

  const handleCreateSnapshot = useCallback(async () => {
    if (!snapshotName.trim()) {
      Alert.alert("Error", "Please enter a snapshot name.");
      return;
    }

    try {
      await createSnapshotMutation.mutateAsync({
        name: snapshotName.trim(),
      });
      setSnapshotName("");
      setShowCreateSnapshot(false);
      Alert.alert("Success", "Snapshot created successfully.");
      refetchSnapshots();
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to create snapshot.");
    }
  }, [snapshotName, createSnapshotMutation, refetchSnapshots]);

  const handleSnapshotSelect = useCallback((snapshotId: string) => {
    setSelectedSnapshots((prev) => {
      if (prev.includes(snapshotId)) {
        return prev.filter((id) => id !== snapshotId);
      }
      if (prev.length >= 2) {
        return [prev[1], snapshotId];
      }
      return [...prev, snapshotId];
    });
  }, []);

  const handleCompare = useCallback(() => {
    if (selectedSnapshots.length === 2) {
      setShowDiff(true);
    }
  }, [selectedSnapshots]);

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Tab Bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === "timeline" && {
              backgroundColor: colors.primary + "20",
              borderBottomColor: colors.primary,
            },
          ]}
          onPress={() => setActiveTab("timeline")}
        >
          <Ionicons
            name="time"
            size={18}
            color={activeTab === "timeline" ? colors.primary : colors.textMuted}
          />
          <Text
            style={[
              styles.tabText,
              {
                color:
                  activeTab === "timeline" ? colors.primary : colors.textMuted,
              },
            ]}
          >
            Timeline
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === "snapshots" && {
              backgroundColor: colors.primary + "20",
              borderBottomColor: colors.primary,
            },
          ]}
          onPress={() => setActiveTab("snapshots")}
        >
          <Ionicons
            name="camera"
            size={18}
            color={
              activeTab === "snapshots" ? colors.primary : colors.textMuted
            }
          />
          <Text
            style={[
              styles.tabText,
              {
                color:
                  activeTab === "snapshots" ? colors.primary : colors.textMuted,
              },
            ]}
          >
            Snapshots
          </Text>
        </TouchableOpacity>
      </View>

      {/* Timeline Tab */}
      {activeTab === "timeline" && (
        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          showsVerticalScrollIndicator={false}
        >
          {eventsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : events.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons
                name="time-outline"
                size={48}
                color={colors.textMuted}
              />
              <Text style={[styles.emptyStateTitle, { color: colors.text }]}>
                No Structural Changes Yet
              </Text>
              <Text
                style={[styles.emptyStateText, { color: colors.textMuted }]}
              >
                Split, merge, or move categories to see their history here.
              </Text>
            </View>
          ) : (
            <View style={styles.eventList}>
              {events.map((event: RefactorTimelineEntry) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onPress={onEventPress ? () => onEventPress(event) : undefined}
                  onRollback={
                    event.isRollbackable && !event.wasRolledBack
                      ? () => handleRollback(event.id)
                      : undefined
                  }
                  isRollingBack={rollingBackId === event.id}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Snapshots Tab */}
      {activeTab === "snapshots" && (
        <>
          {/* Snapshot Actions */}
          <View
            style={[
              styles.snapshotActions,
              { backgroundColor: colors.surface },
            ]}
          >
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowCreateSnapshot(true)}
            >
              <Ionicons name="add" size={18} color={colors.textInverse} />
              <Text
                style={[styles.actionButtonText, { color: colors.textInverse }]}
              >
                New Snapshot
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionButton,
                {
                  backgroundColor: compareMode
                    ? colors.primary
                    : colors.background,
                  borderWidth: compareMode ? 0 : 1,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => {
                setCompareMode(!compareMode);
                setSelectedSnapshots([]);
              }}
            >
              <Ionicons
                name="git-compare"
                size={18}
                color={compareMode ? colors.textInverse : colors.text}
              />
              <Text
                style={[
                  styles.actionButtonText,
                  { color: compareMode ? colors.textInverse : colors.text },
                ]}
              >
                {compareMode ? "Cancel" : "Compare"}
              </Text>
            </TouchableOpacity>

            {compareMode && selectedSnapshots.length === 2 && (
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { backgroundColor: colors.success },
                ]}
                onPress={handleCompare}
              >
                <Ionicons
                  name="checkmark"
                  size={18}
                  color={colors.textInverse}
                />
                <Text
                  style={[
                    styles.actionButtonText,
                    { color: colors.textInverse },
                  ]}
                >
                  View Diff
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {compareMode && (
            <View
              style={[
                styles.compareHint,
                { backgroundColor: colors.primaryLight + "15" },
              ]}
            >
              <Ionicons
                name="information-circle"
                size={16}
                color={colors.primary}
              />
              <Text style={[styles.compareHintText, { color: colors.primary }]}>
                Select 2 snapshots to compare ({selectedSnapshots.length}/2
                selected)
              </Text>
            </View>
          )}

          <ScrollView
            style={styles.content}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
              />
            }
            showsVerticalScrollIndicator={false}
          >
            {snapshotsLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : snapshots.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons
                  name="camera-outline"
                  size={48}
                  color={colors.textMuted}
                />
                <Text style={[styles.emptyStateTitle, { color: colors.text }]}>
                  No Snapshots Yet
                </Text>
                <Text
                  style={[styles.emptyStateText, { color: colors.textMuted }]}
                >
                  Create a snapshot to save the current state of your category
                  structure.
                </Text>
              </View>
            ) : (
              <View style={styles.snapshotList}>
                {snapshots.map((snapshot: StructuralSnapshot) => (
                  <SnapshotCard
                    key={snapshot.id}
                    snapshot={snapshot}
                    onPress={
                      compareMode
                        ? () => handleSnapshotSelect(snapshot.id)
                        : onSnapshotPress
                          ? () => onSnapshotPress(snapshot)
                          : undefined
                    }
                    isSelected={selectedSnapshots.includes(snapshot.id)}
                  />
                ))}
              </View>
            )}
          </ScrollView>
        </>
      )}

      {/* Create Snapshot Modal */}
      <Modal
        visible={showCreateSnapshot}
        animationType="fade"
        transparent
        onRequestClose={() => setShowCreateSnapshot(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.createSnapshotModal,
              { backgroundColor: colors.surface },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Create Snapshot
            </Text>
            <Text style={[styles.modalDesc, { color: colors.textMuted }]}>
              Save a point-in-time snapshot of your category structure.
            </Text>
            <View
              style={[
                styles.snapshotNameInput,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
              ]}
            >
              <Ionicons name="camera" size={18} color={colors.textMuted} />
              <View style={styles.textInputWrapper}>
                <Text
                  style={[
                    styles.placeholderText,
                    { color: snapshotName ? colors.text : colors.textMuted },
                  ]}
                >
                  {snapshotName || "Snapshot name..."}
                </Text>
              </View>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  { backgroundColor: colors.background },
                ]}
                onPress={() => setShowCreateSnapshot(false)}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleCreateSnapshot}
                disabled={createSnapshotMutation.isPending}
              >
                {createSnapshotMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.textInverse} />
                ) : (
                  <Text
                    style={[
                      styles.modalButtonText,
                      { color: colors.textInverse },
                    ]}
                  >
                    Create
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Diff Modal */}
      {selectedSnapshots.length === 2 && (
        <DiffModal
          visible={showDiff}
          fromSnapshotId={selectedSnapshots[0]}
          toSnapshotId={selectedSnapshots[1]}
          onClose={() => {
            setShowDiff(false);
            setCompareMode(false);
            setSelectedSnapshots([]);
          }}
        />
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
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
  },
  emptyStateText: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },

  // Event Card
  eventList: {
    gap: 12,
    paddingBottom: 20,
  },
  eventCard: {
    borderRadius: 12,
    padding: 14,
  },
  eventHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  eventIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  eventInfo: {
    flex: 1,
  },
  eventTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  eventType: {
    fontSize: 16,
    fontWeight: "600",
  },
  rolledBackBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  rolledBackText: {
    fontSize: 10,
    fontWeight: "600",
  },
  eventDate: {
    fontSize: 12,
    marginTop: 2,
  },
  rollbackButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  eventDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  detailRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 13,
    width: 80,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "500",
  },
  eventSummary: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },

  // Snapshot Card
  snapshotList: {
    gap: 12,
    paddingBottom: 20,
  },
  snapshotCard: {
    borderRadius: 12,
    padding: 14,
  },
  snapshotHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  snapshotIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  snapshotInfo: {
    flex: 1,
  },
  snapshotName: {
    fontSize: 15,
    fontWeight: "600",
  },
  snapshotDate: {
    fontSize: 12,
    marginTop: 2,
  },
  compareButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  snapshotStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 8,
  },
  autoBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  autoBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  statText: {
    fontSize: 12,
  },

  // Snapshot Actions
  snapshotActions: {
    flexDirection: "row",
    padding: 12,
    gap: 10,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  compareHint: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  compareHintText: {
    fontSize: 13,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  createSnapshotModal: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  modalDesc: {
    fontSize: 14,
    marginBottom: 16,
  },
  snapshotNameInput: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  textInputWrapper: {
    flex: 1,
  },
  placeholderText: {
    fontSize: 15,
  },
  modalActions: {
    flexDirection: "row",
    marginTop: 16,
    gap: 10,
  },
  modalButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
  },
  modalButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },

  // Diff Modal
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  diffSummary: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  diffSummaryTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  diffStats: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  diffStat: {
    alignItems: "center",
    gap: 4,
  },
  diffStatValue: {
    fontSize: 20,
    fontWeight: "700",
  },
  diffStatLabel: {
    fontSize: 11,
  },
  diffSection: {
    marginBottom: 20,
  },
  diffSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
  },
  diffItem: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  diffItemName: {
    fontSize: 14,
    fontWeight: "600",
  },
  diffItemPath: {
    fontSize: 12,
    marginTop: 4,
  },
  diffChange: {
    fontSize: 12,
    marginTop: 4,
  },
});

export default StructuralTimeline;
