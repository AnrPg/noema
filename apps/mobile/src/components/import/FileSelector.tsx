// =============================================================================
// IMPORT COMPONENTS - FILE SELECTOR
// =============================================================================

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import type { SelectedFile } from "@/stores/import.store";

// Supported file types (subset for UI display)
const SUPPORTED_EXTENSIONS = [
  { extension: "csv", label: "CSV" },
  { extension: "xlsx", label: "Excel" },
  { extension: "json", label: "JSON" },
  { extension: "yaml", label: "YAML" },
  { extension: "md", label: "Markdown" },
  { extension: "pdf", label: "PDF" },
  { extension: "txt", label: "Text" },
  { extension: "tsv", label: "TSV" },
] as const;

export interface FileSelectorProps {
  selectedFile: SelectedFile | null;
  onSelectFile: () => void;
  onRemoveFile?: () => void;
  isLoading?: boolean;
  error?: string | null;
}

export function FileSelector({
  selectedFile,
  onSelectFile,
  onRemoveFile,
  isLoading,
  error,
}: FileSelectorProps) {
  const colors = useColors();

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (filename: string): string => {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    switch (ext) {
      case "csv":
      case "tsv":
        return "grid-outline";
      case "json":
        return "code-slash-outline";
      case "yaml":
      case "yml":
        return "document-text-outline";
      case "md":
      case "markdown":
        return "logo-markdown";
      case "xlsx":
      case "xls":
        return "document-outline";
      case "pdf":
        return "document-attach-outline";
      case "txt":
        return "text-outline";
      default:
        return "document-outline";
    }
  };

  return (
    <View style={styles.container}>
      {/* Drop Zone / Select Area */}
      {!selectedFile ? (
        <TouchableOpacity
          style={[
            styles.dropZone,
            {
              backgroundColor: colors.surfaceVariant,
              borderColor: colors.border,
            },
          ]}
          onPress={onSelectFile}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : (
            <>
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: colors.primaryLight + "30" },
                ]}
              >
                <Ionicons
                  name="cloud-upload-outline"
                  size={40}
                  color={colors.primary}
                />
              </View>
              <Text style={[styles.dropTitle, { color: colors.text }]}>
                Select a file to import
              </Text>
              <Text
                style={[styles.dropSubtitle, { color: colors.textSecondary }]}
              >
                Tap to browse your files
              </Text>
            </>
          )}
        </TouchableOpacity>
      ) : (
        /* Selected File Card */
        <View
          style={[
            styles.fileCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.fileInfo}>
            <View
              style={[
                styles.fileIconContainer,
                { backgroundColor: colors.primaryLight + "30" },
              ]}
            >
              <Ionicons
                name={getFileIcon(selectedFile.name) as any}
                size={24}
                color={colors.primary}
              />
            </View>
            <View style={styles.fileDetails}>
              <Text
                style={[styles.fileName, { color: colors.text }]}
                numberOfLines={1}
              >
                {selectedFile.name}
              </Text>
              <Text style={[styles.fileSize, { color: colors.textSecondary }]}>
                {formatFileSize(selectedFile.size)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onRemoveFile}
              style={[
                styles.removeButton,
                { backgroundColor: colors.errorLight },
              ]}
            >
              <Ionicons name="close" size={18} color={colors.error} />
            </TouchableOpacity>
          </View>

          {/* Change File Button */}
          <TouchableOpacity
            onPress={onSelectFile}
            style={[styles.changeButton, { borderColor: colors.border }]}
          >
            <Ionicons name="swap-horizontal" size={18} color={colors.primary} />
            <Text style={[styles.changeButtonText, { color: colors.primary }]}>
              Change file
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Error Message */}
      {error && (
        <View
          style={[
            styles.errorContainer,
            { backgroundColor: colors.errorLight },
          ]}
        >
          <Ionicons name="alert-circle" size={18} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>
            {error}
          </Text>
        </View>
      )}

      {/* Supported Formats */}
      <View style={styles.formatsSection}>
        <Text style={[styles.formatsTitle, { color: colors.textSecondary }]}>
          Supported formats
        </Text>
        <View style={styles.formatsList}>
          {SUPPORTED_EXTENSIONS.map((type, index) => (
            <View
              key={index}
              style={[
                styles.formatTag,
                { backgroundColor: colors.surfaceVariant },
              ]}
            >
              <Text
                style={[styles.formatText, { color: colors.textSecondary }]}
              >
                .{type.extension}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  dropZone: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  dropTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  dropSubtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  fileCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  fileInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  fileIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  fileDetails: {
    flex: 1,
    marginLeft: 12,
  },
  fileName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  fileSize: {
    fontSize: 13,
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  changeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  changeButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
  },
  formatsSection: {
    marginTop: 24,
  },
  formatsTitle: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 12,
  },
  formatsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  formatTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  formatText: {
    fontSize: 12,
    fontWeight: "500",
  },
});
