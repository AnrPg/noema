// =============================================================================
// IMPORT COMPONENTS - IMPORT SUMMARY
// =============================================================================

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import type { ImportResult } from "@/stores/import.store";

interface ImportSummaryProps {
  /** Summary data before import */
  preImportSummary?: {
    fileName: string;
    fileType: string;
    sheetName: string;
    totalRows: number;
    mappedFields: number;
    cardsToCreate: number;
    cardsWithIssues: number;
    targetDeckName: string;
  };
  /** Result after import completes */
  importResult?: ImportResult | null;
  /** Is import in progress */
  isImporting?: boolean;
  /** Start import callback */
  onStartImport?: () => void;
  /** View imported cards callback */
  onViewCards?: () => void;
  /** Done callback */
  onDone?: () => void;
}

export function ImportSummary({
  preImportSummary,
  importResult,
  isImporting = false,
  onStartImport,
  onViewCards,
  onDone,
}: ImportSummaryProps) {
  const colors = useColors();

  // Render importing state
  if (isImporting) {
    return (
      <View
        style={[styles.centerContainer, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.importingText, { color: colors.text }]}>
          Importing cards...
        </Text>
        <Text
          style={[styles.importingSubtext, { color: colors.textSecondary }]}
        >
          This may take a moment
        </Text>
      </View>
    );
  }

  // Render success state
  if (importResult?.success) {
    return (
      <View
        style={[styles.resultContainer, { backgroundColor: colors.background }]}
      >
        {/* Success Icon */}
        <View
          style={[
            styles.successIcon,
            { backgroundColor: colors.successLight + "30" },
          ]}
        >
          <Ionicons name="checkmark-circle" size={60} color={colors.success} />
        </View>

        <Text style={[styles.successTitle, { color: colors.text }]}>
          Import Complete!
        </Text>
        <Text style={[styles.successSubtitle, { color: colors.textSecondary }]}>
          Your cards have been successfully imported
        </Text>

        {/* Stats */}
        <View
          style={[
            styles.statsCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <StatRow
            icon="documents"
            label="Cards created"
            value={String(importResult.cardsCreated)}
            color={colors.success}
            colors={colors}
          />
          {importResult.cardsUpdated > 0 && (
            <StatRow
              icon="refresh"
              label="Cards updated"
              value={String(importResult.cardsUpdated)}
              color={colors.primary}
              colors={colors}
            />
          )}
          {importResult.cardsFailed > 0 && (
            <StatRow
              icon="alert-circle"
              label="Failed"
              value={String(importResult.cardsFailed)}
              color={colors.error}
              colors={colors}
            />
          )}
          {importResult.duplicatesSkipped > 0 && (
            <StatRow
              icon="copy"
              label="Duplicates skipped"
              value={String(importResult.duplicatesSkipped)}
              color={colors.warning}
              colors={colors}
            />
          )}
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              { backgroundColor: colors.primaryLight + "30" },
            ]}
            onPress={onViewCards}
          >
            <Ionicons name="eye" size={20} color={colors.primary} />
            <Text style={[styles.actionButtonText, { color: colors.primary }]}>
              View Cards
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.primaryButton,
              { backgroundColor: colors.primary },
            ]}
            onPress={onDone}
          >
            <Ionicons name="checkmark" size={20} color="#fff" />
            <Text style={[styles.actionButtonText, { color: "#fff" }]}>
              Done
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Render error state
  if (importResult && !importResult.success) {
    return (
      <View
        style={[styles.resultContainer, { backgroundColor: colors.background }]}
      >
        <View
          style={[
            styles.errorIcon,
            { backgroundColor: colors.errorLight + "30" },
          ]}
        >
          <Ionicons name="close-circle" size={60} color={colors.error} />
        </View>

        <Text style={[styles.errorTitle, { color: colors.text }]}>
          Import Failed
        </Text>
        <Text style={[styles.errorSubtitle, { color: colors.textSecondary }]}>
          There was an error importing your cards
        </Text>

        {importResult.errors.length > 0 && (
          <View
            style={[
              styles.errorList,
              { backgroundColor: colors.errorLight + "20" },
            ]}
          >
            {importResult.errors.slice(0, 5).map((error, i) => (
              <Text key={i} style={[styles.errorText, { color: colors.error }]}>
                • {error}
              </Text>
            ))}
            {importResult.errors.length > 5 && (
              <Text style={[styles.moreErrors, { color: colors.textMuted }]}>
                +{importResult.errors.length - 5} more errors
              </Text>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={onDone}
        >
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Render pre-import summary
  if (preImportSummary) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.contentContainer}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          Ready to Import
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Review the import details before proceeding
        </Text>

        {/* File info */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Ionicons name="document" size={20} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Source File
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
              File name
            </Text>
            <Text
              style={[styles.detailValue, { color: colors.text }]}
              numberOfLines={1}
            >
              {preImportSummary.fileName}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
              Format
            </Text>
            <Text style={[styles.detailValue, { color: colors.text }]}>
              {preImportSummary.fileType.toUpperCase()}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
              Sheet
            </Text>
            <Text style={[styles.detailValue, { color: colors.text }]}>
              {preImportSummary.sheetName}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
              Total rows
            </Text>
            <Text style={[styles.detailValue, { color: colors.text }]}>
              {preImportSummary.totalRows}
            </Text>
          </View>
        </View>

        {/* Mapping info */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Ionicons name="git-compare" size={20} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Field Mapping
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
              Mapped fields
            </Text>
            <Text style={[styles.detailValue, { color: colors.text }]}>
              {preImportSummary.mappedFields}
            </Text>
          </View>
        </View>

        {/* Import summary */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Ionicons name="layers" size={20} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Cards to Create
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
              Target deck
            </Text>
            <Text style={[styles.detailValue, { color: colors.text }]}>
              {preImportSummary.targetDeckName}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
              Cards ready
            </Text>
            <Text style={[styles.detailValue, { color: colors.success }]}>
              {preImportSummary.cardsToCreate -
                preImportSummary.cardsWithIssues}
            </Text>
          </View>
          {preImportSummary.cardsWithIssues > 0 && (
            <View style={styles.detailRow}>
              <Text
                style={[styles.detailLabel, { color: colors.textSecondary }]}
              >
                Cards with issues
              </Text>
              <Text style={[styles.detailValue, { color: colors.warning }]}>
                {preImportSummary.cardsWithIssues}
              </Text>
            </View>
          )}
        </View>

        {/* Warning */}
        {preImportSummary.cardsWithIssues > 0 && (
          <View
            style={[
              styles.warningCard,
              { backgroundColor: colors.warningLight },
            ]}
          >
            <Ionicons name="alert-circle" size={20} color={colors.warning} />
            <Text style={[styles.warningText, { color: colors.warning }]}>
              {preImportSummary.cardsWithIssues} cards have issues and may not
              import correctly. You can go back to fix them.
            </Text>
          </View>
        )}

        {/* Import button */}
        <TouchableOpacity
          style={[styles.importButton, { backgroundColor: colors.primary }]}
          onPress={onStartImport}
        >
          <Ionicons name="cloud-upload" size={20} color="#fff" />
          <Text style={styles.importButtonText}>Start Import</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return null;
}

interface StatRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color: string;
  colors: ReturnType<typeof useColors>;
}

function StatRow({ icon, label, value, color, colors }: StatRowProps) {
  return (
    <View style={styles.statRow}>
      <View style={styles.statLeft}>
        <Ionicons name={icon} size={18} color={color} />
        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
          {label}
        </Text>
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  resultContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 20,
  },
  sectionCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 14,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "500",
    maxWidth: "60%",
  },
  warningCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    borderRadius: 10,
    marginBottom: 20,
    gap: 10,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  importButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  importButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  importingText: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 20,
  },
  importingSubtext: {
    fontSize: 14,
    marginTop: 8,
  },
  successIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 15,
    marginBottom: 24,
    textAlign: "center",
  },
  statsCard: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  statLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statLabel: {
    fontSize: 14,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  primaryButton: {},
  actionButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
  errorIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 15,
    marginBottom: 24,
    textAlign: "center",
  },
  errorList: {
    width: "100%",
    borderRadius: 10,
    padding: 14,
    marginBottom: 24,
  },
  errorText: {
    fontSize: 13,
    marginBottom: 6,
  },
  moreErrors: {
    fontSize: 12,
    marginTop: 4,
    fontStyle: "italic",
  },
  retryButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
