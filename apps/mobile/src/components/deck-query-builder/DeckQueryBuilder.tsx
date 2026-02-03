// =============================================================================
// DECK QUERY BUILDER
// =============================================================================
// Visual deck query builder with live preview and progressive disclosure

import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Dimensions,
  Pressable,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import { haptics } from "@/utils/animation";
import { FilterGroupEditor } from "./FilterGroupEditor";
import { QueryPreview } from "./QueryPreview";
import { SortEditor } from "./SortEditor";
import type { DeckQueryBuilderProps, DeckQuery, SortConfig } from "./types";
import {
  createDeckQuery,
  createFilterGroup,
  validateDeckQuery,
  FILTER_FIELDS,
} from "./types";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// =============================================================================
// DECK QUERY BUILDER COMPONENT
// =============================================================================

export function DeckQueryBuilder({
  initialQuery,
  deckIds,
  onSave,
  onClose,
  enablePreview = true,
  expertiseLevel = "intermediate",
}: DeckQueryBuilderProps) {
  const colors = useColors();

  // Query state
  const [query, setQuery] = useState<DeckQuery>(() =>
    initialQuery ? { ...initialQuery } : createDeckQuery()
  );

  // UI state
  const [activeTab, setActiveTab] = useState<"filters" | "sort" | "options">(
    "filters"
  );
  const [showPreview, setShowPreview] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Validate on changes
  useEffect(() => {
    const validationErrors = validateDeckQuery(query);
    setErrors(validationErrors);
  }, [query]);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleNameChange = useCallback((name: string) => {
    setQuery((prev) => ({ ...prev, name }));
  }, []);

  const handleDescriptionChange = useCallback((description: string) => {
    setQuery((prev) => ({ ...prev, description }));
  }, []);

  const handleFiltersUpdate = useCallback(
    (filters: DeckQuery["filters"]) => {
      setQuery((prev) => ({ ...prev, filters }));
    },
    []
  );

  const handleSortsUpdate = useCallback((sorts: SortConfig[]) => {
    setQuery((prev) => ({ ...prev, sorts }));
  }, []);

  const handleLimitChange = useCallback((limitStr: string) => {
    const limit = parseInt(limitStr, 10);
    setQuery((prev) => ({
      ...prev,
      limit: isNaN(limit) ? undefined : Math.max(0, limit),
    }));
  }, []);

  const handleIncludeSubdecksToggle = useCallback((value: boolean) => {
    setQuery((prev) => ({ ...prev, includeSubdecks: value }));
  }, []);

  const handleSave = useCallback(() => {
    const validationErrors = validateDeckQuery(query);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    haptics.success();
    onSave(query);
  }, [query, onSave]);

  // ==========================================================================
  // COMPUTED VALUES
  // ==========================================================================

  const isValid = errors.length === 0;
  const filterCount = useMemo(() => {
    const countConditions = (group: DeckQuery["filters"]): number => {
      return (
        group.conditions.length +
        group.groups.reduce((acc, g) => acc + countConditions(g), 0)
      );
    };
    return countConditions(query.filters);
  }, [query.filters]);

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <TouchableOpacity onPress={onClose} style={styles.headerButton}>
          <Text style={[styles.headerButtonText, { color: colors.error }]}>
            Cancel
          </Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Query Builder
        </Text>
        <TouchableOpacity
          onPress={handleSave}
          style={styles.headerButton}
          disabled={!isValid}
        >
          <Text
            style={[
              styles.headerButtonText,
              { color: isValid ? colors.primary : colors.textMuted },
            ]}
          >
            Save
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Query Name */}
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Query Name *
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surfaceVariant,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              value={query.name}
              onChangeText={handleNameChange}
              placeholder="My Query"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          {expertiseLevel !== "novice" && (
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Description
              </Text>
              <TextInput
                style={[
                  styles.input,
                  styles.textArea,
                  {
                    backgroundColor: colors.surfaceVariant,
                    color: colors.text,
                    borderColor: colors.border,
                  },
                ]}
                value={query.description || ""}
                onChangeText={handleDescriptionChange}
                placeholder="What does this query select?"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={2}
              />
            </View>
          )}
        </View>

        {/* Tabs */}
        <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
          {["filters", "sort", "options"].map((tab) => {
            const isActive = activeTab === tab;
            const tabLabel =
              tab === "filters"
                ? `Filters${filterCount > 0 ? ` (${filterCount})` : ""}`
                : tab === "sort"
                ? `Sort${query.sorts.length > 0 ? ` (${query.sorts.length})` : ""}`
                : "Options";

            return (
              <TouchableOpacity
                key={tab}
                style={[
                  styles.tab,
                  isActive && [styles.tabActive, { borderBottomColor: colors.primary }],
                ]}
                onPress={() => {
                  haptics.selection();
                  setActiveTab(tab as any);
                }}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: isActive ? colors.primary : colors.textMuted },
                  ]}
                >
                  {tabLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Tab Content */}
        {activeTab === "filters" && (
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Filter Conditions
            </Text>
            <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
              Add conditions to filter which cards are included
            </Text>

            <FilterGroupEditor
              group={query.filters}
              fields={FILTER_FIELDS}
              onUpdate={handleFiltersUpdate}
              isRoot
              depth={0}
            />
          </View>
        )}

        {activeTab === "sort" && (
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Sort Order
            </Text>
            <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
              Specify how to order the matching cards
            </Text>

            <SortEditor
              sorts={query.sorts}
              onUpdate={handleSortsUpdate}
              fields={FILTER_FIELDS}
            />
          </View>
        )}

        {activeTab === "options" && (
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Query Options
            </Text>

            {/* Include Subdecks */}
            <View style={styles.optionRow}>
              <View style={styles.optionInfo}>
                <Ionicons
                  name="folder-open-outline"
                  size={20}
                  color={colors.textMuted}
                />
                <View style={styles.optionText}>
                  <Text style={[styles.optionLabel, { color: colors.text }]}>
                    Include Subdecks
                  </Text>
                  <Text
                    style={[styles.optionDescription, { color: colors.textMuted }]}
                  >
                    Include cards from child decks
                  </Text>
                </View>
              </View>
              <Switch
                value={query.includeSubdecks}
                onValueChange={handleIncludeSubdecksToggle}
                trackColor={{ false: colors.border, true: colors.primary + "80" }}
                thumbColor={query.includeSubdecks ? colors.primary : colors.textMuted}
              />
            </View>

            {/* Limit */}
            <View style={styles.optionRow}>
              <View style={styles.optionInfo}>
                <Ionicons
                  name="funnel-outline"
                  size={20}
                  color={colors.textMuted}
                />
                <View style={styles.optionText}>
                  <Text style={[styles.optionLabel, { color: colors.text }]}>
                    Max Cards
                  </Text>
                  <Text
                    style={[styles.optionDescription, { color: colors.textMuted }]}
                  >
                    Limit the number of cards (0 = no limit)
                  </Text>
                </View>
              </View>
              <TextInput
                style={[
                  styles.numberInput,
                  {
                    backgroundColor: colors.surfaceVariant,
                    color: colors.text,
                    borderColor: colors.border,
                  },
                ]}
                value={query.limit?.toString() || ""}
                onChangeText={handleLimitChange}
                placeholder="∞"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
              />
            </View>
          </View>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <View style={[styles.errorsSection, { backgroundColor: colors.error + "10" }]}>
            {errors.map((error, index) => (
              <View key={index} style={styles.errorRow}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={[styles.errorText, { color: colors.error }]}>
                  {error}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Preview Button */}
        {enablePreview && (
          <TouchableOpacity
            style={[styles.previewButton, { borderColor: colors.primary }]}
            onPress={() => {
              haptics.light();
              setShowPreview(true);
            }}
          >
            <Ionicons name="eye-outline" size={20} color={colors.primary} />
            <Text style={[styles.previewButtonText, { color: colors.primary }]}>
              Preview Results
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Preview Modal */}
      {showPreview && (
        <Modal
          visible={showPreview}
          animationType="slide"
          transparent
          onRequestClose={() => setShowPreview(false)}
        >
          <View style={styles.modalOverlay}>
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => setShowPreview(false)}
            />
            <View
              style={[
                styles.previewSheet,
                { backgroundColor: colors.background },
              ]}
            >
              <View style={[styles.previewHeader, { borderBottomColor: colors.border }]}>
                <TouchableOpacity
                  onPress={() => setShowPreview(false)}
                  style={styles.previewClose}
                >
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.previewTitle, { color: colors.text }]}>
                  Query Preview
                </Text>
                <View style={styles.previewClose} />
              </View>
              <QueryPreview
                query={query}
                isLoading={false}
                onRefresh={() => {}}
              />
            </View>
          </View>
        </Modal>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  headerButton: {
    padding: 8,
    minWidth: 60,
  },
  headerButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  section: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 13,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
  },
  input: {
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  optionInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  optionText: {
    marginLeft: 12,
    flex: 1,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: "500",
  },
  optionDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  numberInput: {
    width: 80,
    borderRadius: 8,
    padding: 8,
    fontSize: 16,
    textAlign: "center",
    borderWidth: 1,
  },
  errorsSection: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  errorText: {
    fontSize: 13,
    marginLeft: 8,
  },
  previewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  previewButtonText: {
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  previewSheet: {
    maxHeight: SCREEN_HEIGHT * 0.8,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
  },
  previewClose: {
    width: 40,
    alignItems: "center",
  },
  previewTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
});
