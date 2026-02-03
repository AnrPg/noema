// =============================================================================
// FACE SELECTOR
// =============================================================================
// Horizontal selector for switching between card faces

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import { haptics } from "@/utils/animation";
import type { EditableFace } from "./types";
import { FACE_TYPE_METADATA, DEPTH_LEVEL_METADATA } from "./types";

// =============================================================================
// TYPES
// =============================================================================

export interface FaceSelectorProps {
  faces: EditableFace[];
  selectedFaceTempId: string;
  onSelect: (faceTempId: string) => void;
  onAddFace: () => void;
  canAdd?: boolean;
}

// =============================================================================
// FACE SELECTOR COMPONENT
// =============================================================================

export function FaceSelector({
  faces,
  selectedFaceTempId,
  onSelect,
  onAddFace,
  canAdd = true,
}: FaceSelectorProps) {
  const colors = useColors();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {faces.map((face, index) => {
        const isSelected = face.tempId === selectedFaceTempId;
        const faceMeta = FACE_TYPE_METADATA[face.faceType];
        const depthMeta = DEPTH_LEVEL_METADATA[face.depthLevel];

        return (
          <TouchableOpacity
            key={face.tempId}
            style={[
              styles.faceItem,
              {
                backgroundColor: isSelected
                  ? faceMeta.color + "15"
                  : colors.surfaceVariant,
                borderColor: isSelected ? faceMeta.color : colors.border,
              },
            ]}
            onPress={() => {
              haptics.selection();
              onSelect(face.tempId);
            }}
            activeOpacity={0.7}
          >
            {/* Face Icon */}
            <View
              style={[
                styles.faceIcon,
                {
                  backgroundColor: isSelected
                    ? faceMeta.color + "20"
                    : colors.surface,
                },
              ]}
            >
              <Ionicons
                name={faceMeta.icon as any}
                size={18}
                color={isSelected ? faceMeta.color : colors.textMuted}
              />
            </View>

            {/* Face Info */}
            <View style={styles.faceInfo}>
              <View style={styles.faceNameRow}>
                <Text
                  style={[
                    styles.faceName,
                    { color: isSelected ? faceMeta.color : colors.text },
                  ]}
                  numberOfLines={1}
                >
                  {face.name}
                </Text>
                {face.isDefault && (
                  <View
                    style={[
                      styles.defaultBadge,
                      { backgroundColor: colors.primary + "20" },
                    ]}
                  >
                    <Text
                      style={[styles.defaultBadgeText, { color: colors.primary }]}
                    >
                      ★
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.faceMeta}>
                <View
                  style={[
                    styles.depthIndicator,
                    { backgroundColor: depthMeta.color },
                  ]}
                />
                <Text
                  style={[styles.faceMetaText, { color: colors.textMuted }]}
                  numberOfLines={1}
                >
                  {depthMeta.shortLabel}
                </Text>
              </View>
            </View>

            {/* Selection indicator */}
            {isSelected && (
              <View
                style={[
                  styles.selectionIndicator,
                  { backgroundColor: faceMeta.color },
                ]}
              />
            )}
          </TouchableOpacity>
        );
      })}

      {/* Add Face Button */}
      {canAdd && (
        <TouchableOpacity
          style={[
            styles.addButton,
            {
              backgroundColor: colors.surfaceVariant,
              borderColor: colors.border,
            },
          ]}
          onPress={() => {
            haptics.light();
            onAddFace();
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={24} color={colors.primary} />
          <Text style={[styles.addButtonText, { color: colors.primary }]}>
            Add Face
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

// =============================================================================
// FACE TABS (Alternative horizontal tabs view)
// =============================================================================

export interface FaceTabsProps {
  faces: EditableFace[];
  selectedFaceTempId: string;
  onSelect: (faceTempId: string) => void;
}

export function FaceTabs({
  faces,
  selectedFaceTempId,
  onSelect,
}: FaceTabsProps) {
  const colors = useColors();

  return (
    <View style={[styles.tabsContainer, { borderBottomColor: colors.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsContent}
      >
        {faces.map((face, index) => {
          const isSelected = face.tempId === selectedFaceTempId;
          const faceMeta = FACE_TYPE_METADATA[face.faceType];

          return (
            <TouchableOpacity
              key={face.tempId}
              style={[
                styles.tab,
                isSelected && [
                  styles.tabSelected,
                  { borderBottomColor: faceMeta.color },
                ],
              ]}
              onPress={() => {
                haptics.selection();
                onSelect(face.tempId);
              }}
            >
              <Ionicons
                name={faceMeta.icon as any}
                size={16}
                color={isSelected ? faceMeta.color : colors.textMuted}
              />
              <Text
                style={[
                  styles.tabText,
                  { color: isSelected ? faceMeta.color : colors.textMuted },
                ]}
                numberOfLines={1}
              >
                {face.name}
              </Text>
              {face.isDefault && (
                <Text
                  style={[styles.tabDefaultStar, { color: colors.warning }]}
                >
                  ★
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    gap: 8,
  },
  faceItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 140,
    maxWidth: 180,
    marginRight: 8,
    position: "relative",
    overflow: "hidden",
  },
  faceIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  faceInfo: {
    flex: 1,
  },
  faceNameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  faceName: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  defaultBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 4,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  faceMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  depthIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  faceMetaText: {
    fontSize: 11,
  },
  selectionIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  addButton: {
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    minWidth: 100,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 4,
  },
  // Tabs styles
  tabsContainer: {
    borderBottomWidth: 1,
  },
  tabsContent: {
    paddingHorizontal: 4,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 4,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabSelected: {
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "500",
    marginLeft: 6,
    maxWidth: 80,
  },
  tabDefaultStar: {
    fontSize: 10,
    marginLeft: 4,
  },
});
