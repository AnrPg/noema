// =============================================================================
// IMPORT COMPONENTS - SHEET SELECTOR
// =============================================================================

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import type { ParsedSheet } from "@/stores/import.store";

interface SheetSelectorProps {
  sheets: ParsedSheet[];
  selectedSheetId: string | null;
  onSelectSheet: (sheetId: string) => void;
}

export function SheetSelector({
  sheets,
  selectedSheetId,
  onSelectSheet,
}: SheetSelectorProps) {
  const colors = useColors();

  if (sheets.length === 0) {
    return (
      <View
        style={[
          styles.emptyContainer,
          { backgroundColor: colors.surfaceVariant },
        ]}
      >
        <Ionicons name="document-outline" size={48} color={colors.textMuted} />
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          No sheets found in file
        </Text>
      </View>
    );
  }

  if (sheets.length === 1) {
    // Single sheet - show info only
    const sheet = sheets[0];
    return (
      <View
        style={[
          styles.singleSheet,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.sheetHeader}>
          <View
            style={[
              styles.sheetIcon,
              { backgroundColor: colors.primaryLight + "30" },
            ]}
          >
            <Ionicons name="grid-outline" size={20} color={colors.primary} />
          </View>
          <View style={styles.sheetInfo}>
            <Text style={[styles.sheetName, { color: colors.text }]}>
              {sheet.name}
            </Text>
            <Text style={[styles.sheetStats, { color: colors.textSecondary }]}>
              {sheet.rowCount} rows • {sheet.columnCount} columns
            </Text>
          </View>
          <View
            style={[
              styles.selectedBadge,
              { backgroundColor: colors.successLight },
            ]}
          >
            <Ionicons name="checkmark" size={14} color={colors.success} />
          </View>
        </View>
      </View>
    );
  }

  // Multiple sheets - show selector
  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.text }]}>
        Select a sheet to import
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {sheets.length} sheets found in your file
      </Text>

      <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
        {sheets.map((sheet) => {
          const isSelected = sheet.id === selectedSheetId;
          return (
            <TouchableOpacity
              key={sheet.id}
              onPress={() => onSelectSheet(sheet.id)}
              style={[
                styles.sheetCard,
                {
                  backgroundColor: colors.card,
                  borderColor: isSelected ? colors.primary : colors.border,
                  borderWidth: isSelected ? 2 : 1,
                },
              ]}
            >
              <View style={styles.sheetHeader}>
                <View
                  style={[
                    styles.sheetIcon,
                    {
                      backgroundColor: isSelected
                        ? colors.primaryLight + "30"
                        : colors.surfaceVariant,
                    },
                  ]}
                >
                  <Ionicons
                    name="grid-outline"
                    size={20}
                    color={isSelected ? colors.primary : colors.textMuted}
                  />
                </View>
                <View style={styles.sheetInfo}>
                  <Text style={[styles.sheetName, { color: colors.text }]}>
                    {sheet.name}
                  </Text>
                  <Text
                    style={[styles.sheetStats, { color: colors.textSecondary }]}
                  >
                    {sheet.rowCount} rows • {sheet.columnCount} columns
                  </Text>
                </View>
                {isSelected && (
                  <View
                    style={[
                      styles.selectedBadge,
                      { backgroundColor: colors.primaryLight },
                    ]}
                  >
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color={colors.primary}
                    />
                  </View>
                )}
              </View>

              {/* Column preview */}
              <View style={styles.columnPreview}>
                {sheet.columns.slice(0, 4).map((col, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.columnTag,
                      { backgroundColor: colors.surfaceVariant },
                    ]}
                  >
                    <Text
                      style={[
                        styles.columnName,
                        { color: colors.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {col.name}
                    </Text>
                  </View>
                ))}
                {sheet.columns.length > 4 && (
                  <Text
                    style={[styles.moreColumns, { color: colors.textMuted }]}
                  >
                    +{sheet.columns.length - 4} more
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 16,
  },
  sheetList: {
    flex: 1,
  },
  sheetCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  singleSheet: {
    margin: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  sheetIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetInfo: {
    flex: 1,
    marginLeft: 12,
  },
  sheetName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  sheetStats: {
    fontSize: 13,
  },
  selectedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  columnPreview: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
    gap: 8,
    alignItems: "center",
  },
  columnTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    maxWidth: 100,
  },
  columnName: {
    fontSize: 12,
  },
  moreColumns: {
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    margin: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
  },
});
