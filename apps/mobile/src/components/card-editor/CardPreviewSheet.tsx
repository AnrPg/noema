// =============================================================================
// CARD PREVIEW SHEET
// =============================================================================
// Bottom sheet for previewing a card with face flipping simulation

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Dimensions,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import { haptics } from "@/utils/animation";
import { FacePreview, FaceCardPreview } from "./FacePreview";
import type { CardPreviewSheetProps, EditableFace } from "./types";
import { FACE_TYPE_METADATA, DEPTH_LEVEL_METADATA } from "./types";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// =============================================================================
// CARD PREVIEW SHEET
// =============================================================================

export function CardPreviewSheet({
  card,
  visible,
  onClose,
}: CardPreviewSheetProps) {
  const colors = useColors();
  const [selectedFaceIndex, setSelectedFaceIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const selectedFace = card.faces[selectedFaceIndex];

  const handleFlip = useCallback(() => {
    haptics.light();
    setIsFlipped((prev) => !prev);
  }, []);

  const handleNextFace = useCallback(() => {
    haptics.selection();
    setSelectedFaceIndex((prev) => (prev + 1) % card.faces.length);
    setIsFlipped(false);
  }, [card.faces.length]);

  const handlePrevFace = useCallback(() => {
    haptics.selection();
    setSelectedFaceIndex(
      (prev) => (prev - 1 + card.faces.length) % card.faces.length
    );
    setIsFlipped(false);
  }, [card.faces.length]);

  if (!selectedFace) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.background },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              Preview
            </Text>
            <View style={styles.closeButton} />
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
          >
            {/* Card Info */}
            <View style={[styles.cardInfo, { backgroundColor: colors.surface }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                {card.title || "Untitled Card"}
              </Text>
              {card.description && (
                <Text
                  style={[styles.cardDescription, { color: colors.textSecondary }]}
                  numberOfLines={2}
                >
                  {card.description}
                </Text>
              )}
            </View>

            {/* Face Selector Pills */}
            {card.faces.length > 1 && (
              <View style={styles.facePills}>
                {card.faces.map((face, index) => {
                  const isSelected = index === selectedFaceIndex;
                  const faceMeta = FACE_TYPE_METADATA[face.faceType];
                  return (
                    <TouchableOpacity
                      key={face.tempId}
                      style={[
                        styles.facePill,
                        {
                          backgroundColor: isSelected
                            ? faceMeta.color + "20"
                            : colors.surfaceVariant,
                          borderColor: isSelected
                            ? faceMeta.color
                            : colors.border,
                        },
                      ]}
                      onPress={() => {
                        haptics.selection();
                        setSelectedFaceIndex(index);
                        setIsFlipped(false);
                      }}
                    >
                      <Ionicons
                        name={faceMeta.icon as any}
                        size={14}
                        color={isSelected ? faceMeta.color : colors.textMuted}
                      />
                      <Text
                        style={[
                          styles.facePillText,
                          { color: isSelected ? faceMeta.color : colors.text },
                        ]}
                        numberOfLines={1}
                      >
                        {face.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Face Preview Card */}
            <Pressable onPress={handleFlip} style={styles.previewCard}>
              <FaceCardPreview
                face={selectedFace}
                isFlipped={isFlipped}
                showControls
              />
            </Pressable>

            {/* Face Navigation */}
            {card.faces.length > 1 && (
              <View style={styles.faceNav}>
                <TouchableOpacity
                  onPress={handlePrevFace}
                  style={[
                    styles.faceNavButton,
                    { backgroundColor: colors.surfaceVariant },
                  ]}
                >
                  <Ionicons
                    name="chevron-back"
                    size={20}
                    color={colors.text}
                  />
                </TouchableOpacity>
                <Text style={[styles.faceCounter, { color: colors.textMuted }]}>
                  Face {selectedFaceIndex + 1} of {card.faces.length}
                </Text>
                <TouchableOpacity
                  onPress={handleNextFace}
                  style={[
                    styles.faceNavButton,
                    { backgroundColor: colors.surfaceVariant },
                  ]}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={colors.text}
                  />
                </TouchableOpacity>
              </View>
            )}

            {/* Face Details */}
            <View style={[styles.faceDetails, { backgroundColor: colors.surface }]}>
              <Text style={[styles.faceDetailsTitle, { color: colors.text }]}>
                Face Details
              </Text>
              
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                  Type
                </Text>
                <View style={styles.detailValue}>
                  <View
                    style={[
                      styles.detailBadge,
                      {
                        backgroundColor:
                          FACE_TYPE_METADATA[selectedFace.faceType].color + "15",
                      },
                    ]}
                  >
                    <Ionicons
                      name={FACE_TYPE_METADATA[selectedFace.faceType].icon as any}
                      size={14}
                      color={FACE_TYPE_METADATA[selectedFace.faceType].color}
                    />
                    <Text
                      style={[
                        styles.detailBadgeText,
                        {
                          color: FACE_TYPE_METADATA[selectedFace.faceType].color,
                        },
                      ]}
                    >
                      {FACE_TYPE_METADATA[selectedFace.faceType].label}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                  Depth
                </Text>
                <View style={styles.detailValue}>
                  <View
                    style={[
                      styles.detailBadge,
                      {
                        backgroundColor:
                          DEPTH_LEVEL_METADATA[selectedFace.depthLevel].color + "15",
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.depthDot,
                        {
                          backgroundColor:
                            DEPTH_LEVEL_METADATA[selectedFace.depthLevel].color,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.detailBadgeText,
                        {
                          color:
                            DEPTH_LEVEL_METADATA[selectedFace.depthLevel].color,
                        },
                      ]}
                    >
                      {DEPTH_LEVEL_METADATA[selectedFace.depthLevel].label}
                    </Text>
                  </View>
                </View>
              </View>

              {selectedFace.scaffoldingLevel > 0 && (
                <View style={styles.detailRow}>
                  <Text
                    style={[styles.detailLabel, { color: colors.textSecondary }]}
                  >
                    Scaffolding
                  </Text>
                  <Text style={[styles.detailText, { color: colors.text }]}>
                    Level {selectedFace.scaffoldingLevel}
                  </Text>
                </View>
              )}

              {selectedFace.hints.length > 0 && (
                <View style={styles.detailRow}>
                  <Text
                    style={[styles.detailLabel, { color: colors.textSecondary }]}
                  >
                    Hints
                  </Text>
                  <Text style={[styles.detailText, { color: colors.text }]}>
                    {selectedFace.hints.length} available
                  </Text>
                </View>
              )}
            </View>

            {/* Hints Preview */}
            {selectedFace.hints.length > 0 && (
              <View style={[styles.hintsSection, { backgroundColor: colors.surface }]}>
                <Text style={[styles.hintsTitle, { color: colors.text }]}>
                  <Ionicons name="bulb-outline" size={16} color={colors.warning} />{" "}
                  Hints
                </Text>
                {selectedFace.hints.map((hint, index) => (
                  <View
                    key={index}
                    style={[
                      styles.hintItem,
                      { backgroundColor: colors.surfaceVariant },
                    ]}
                  >
                    <Text style={[styles.hintNumber, { color: colors.textMuted }]}>
                      {index + 1}.
                    </Text>
                    <Text style={[styles.hintText, { color: colors.text }]}>
                      {hint}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Flip Button */}
          <View style={[styles.footer, { backgroundColor: colors.surface }]}>
            <TouchableOpacity
              style={[styles.flipButton, { backgroundColor: colors.primary }]}
              onPress={handleFlip}
            >
              <Ionicons name="swap-horizontal" size={20} color="#fff" />
              <Text style={styles.flipButtonText}>
                Show {isFlipped ? "Question" : "Answer"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  sheet: {
    maxHeight: SCREEN_HEIGHT * 0.9,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
  },
  closeButton: {
    width: 40,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  cardInfo: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  cardDescription: {
    fontSize: 14,
    marginTop: 4,
  },
  facePills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  facePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  facePillText: {
    fontSize: 13,
    fontWeight: "500",
    marginLeft: 6,
    maxWidth: 100,
  },
  previewCard: {
    marginBottom: 16,
  },
  faceNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginBottom: 16,
  },
  faceNavButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  faceCounter: {
    fontSize: 14,
  },
  faceDetails: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  faceDetailsTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 14,
  },
  detailValue: {},
  detailBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  detailBadgeText: {
    fontSize: 13,
    fontWeight: "500",
    marginLeft: 4,
  },
  depthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  detailText: {
    fontSize: 14,
  },
  hintsSection: {
    padding: 16,
    borderRadius: 12,
  },
  hintsTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 12,
  },
  hintItem: {
    flexDirection: "row",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  hintNumber: {
    fontSize: 14,
    fontWeight: "600",
    marginRight: 8,
  },
  hintText: {
    fontSize: 14,
    flex: 1,
  },
  footer: {
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.1)",
  },
  flipButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
  },
  flipButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
});
