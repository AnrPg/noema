// =============================================================================
// FACE PREVIEW
// =============================================================================
// Preview rendering for card faces with realistic representation

import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/theme/ThemeProvider";
import type { EditableFace, EditablePrimitive } from "./types";
import { FACE_TYPE_METADATA, DEPTH_LEVEL_METADATA } from "./types";

// =============================================================================
// TYPES
// =============================================================================

export interface FacePreviewProps {
  face: EditableFace;
  side: "question" | "answer";
  size?: "compact" | "medium" | "full";
  showMetadata?: boolean;
}

export interface PrimitiveRendererProps {
  primitive: EditablePrimitive;
  size: "compact" | "medium" | "full";
}

// =============================================================================
// PRIMITIVE RENDERER
// =============================================================================

function PrimitiveRenderer({ primitive, size }: PrimitiveRendererProps) {
  const colors = useColors();

  const fontSize = size === "compact" ? 12 : size === "medium" ? 14 : 16;
  const padding = size === "compact" ? 4 : size === "medium" ? 8 : 12;

  switch (primitive.type) {
    case "text":
      return (
        <Text
          style={[
            styles.textPrimitive,
            { color: colors.text, fontSize },
          ]}
        >
          {primitive.content || "Text content"}
        </Text>
      );

    case "richtext":
      // Simplified rich text rendering - would use a proper markdown renderer in production
      return (
        <View style={styles.richTextPrimitive}>
          <Text
            style={[
              styles.textPrimitive,
              { color: colors.text, fontSize },
            ]}
          >
            {primitive.content || "Rich text content"}
          </Text>
        </View>
      );

    case "latex":
      return (
        <View
          style={[
            styles.latexContainer,
            { backgroundColor: colors.surfaceVariant, padding },
          ]}
        >
          <Ionicons name="calculator-outline" size={fontSize} color={colors.textMuted} />
          <Text
            style={[
              styles.latexText,
              { color: colors.text, fontSize: fontSize - 2 },
            ]}
            numberOfLines={size === "compact" ? 1 : undefined}
          >
            {primitive.content || "LaTeX formula"}
          </Text>
        </View>
      );

    case "image": {
      const imageHeight = size === "compact" ? 40 : size === "medium" ? 80 : 120;
      if (primitive.mediaUrl) {
        return (
          <Image
            source={{ uri: primitive.mediaUrl }}
            style={[styles.imagePrimitive, { height: imageHeight }]}
            resizeMode="contain"
          />
        );
      }
      return (
        <View
          style={[
            styles.imagePlaceholder,
            { backgroundColor: colors.surfaceVariant, height: imageHeight },
          ]}
        >
          <Ionicons name="image-outline" size={24} color={colors.textMuted} />
          <Text style={[styles.placeholderText, { color: colors.textMuted }]}>
            {primitive.altText || "Image"}
          </Text>
        </View>
      );
    }

    case "audio":
      return (
        <View
          style={[
            styles.mediaContainer,
            { backgroundColor: colors.surfaceVariant, padding },
          ]}
        >
          <Ionicons name="volume-medium-outline" size={20} color={colors.primary} />
          <Text style={[styles.mediaLabel, { color: colors.text }]}>
            Audio clip
          </Text>
        </View>
      );

    case "video":
      return (
        <View
          style={[
            styles.mediaContainer,
            { backgroundColor: colors.surfaceVariant, padding },
          ]}
        >
          <Ionicons name="videocam-outline" size={20} color={colors.primary} />
          <Text style={[styles.mediaLabel, { color: colors.text }]}>
            Video clip
          </Text>
        </View>
      );

    case "code":
      return (
        <View
          style={[
            styles.codeContainer,
            { backgroundColor: "#1e1e1e", padding },
          ]}
        >
          <Text
            style={[styles.codeText, { fontSize: fontSize - 2 }]}
            numberOfLines={size === "compact" ? 2 : undefined}
          >
            {primitive.content || "// Code snippet"}
          </Text>
        </View>
      );

    case "cloze": {
      // Render cloze as text with blanks
      const clozeContent = primitive.content || "{{c1::answer}}";
      const displayContent = clozeContent.replace(
        /\{\{c\d+::([^}]+)\}\}/g,
        size === "compact" ? "[...]" : "[_____]"
      );
      return (
        <Text
          style={[
            styles.textPrimitive,
            { color: colors.text, fontSize },
          ]}
        >
          {displayContent}
        </Text>
      );
    }

    case "diagram":
      return (
        <View
          style={[
            styles.diagramPlaceholder,
            { backgroundColor: colors.surfaceVariant, padding: padding * 2 },
          ]}
        >
          <Ionicons name="git-branch-outline" size={24} color={colors.textMuted} />
          <Text style={[styles.placeholderText, { color: colors.textMuted }]}>
            Diagram
          </Text>
        </View>
      );

    default:
      return (
        <Text style={[styles.textPrimitive, { color: colors.textMuted }]}>
          Unknown content type
        </Text>
      );
  }
}

// =============================================================================
// FACE PREVIEW COMPONENT
// =============================================================================

export function FacePreview({
  face,
  side,
  size = "medium",
  showMetadata = false,
}: FacePreviewProps) {
  const colors = useColors();

  const faceMeta = FACE_TYPE_METADATA[face.faceType];
  const depthMeta = DEPTH_LEVEL_METADATA[face.depthLevel];

  const primitives =
    side === "question" ? face.questionPrimitives : face.answerPrimitives;

  const containerStyle = useMemo(() => {
    const baseStyle = {
      backgroundColor: colors.surface,
      borderRadius: size === "compact" ? 4 : 8,
      borderWidth: 1,
      borderColor: colors.border,
    };

    if (size === "compact") {
      return { ...baseStyle, padding: 8 };
    } else if (size === "medium") {
      return { ...baseStyle, padding: 12 };
    } else {
      return { ...baseStyle, padding: 16 };
    }
  }, [colors, size]);

  const hasHints = side === "question" && face.hints.length > 0;

  return (
    <View style={[styles.container, containerStyle]}>
      {/* Metadata Header */}
      {showMetadata && (
        <View style={[styles.metaHeader, { borderBottomColor: colors.border }]}>
          <View style={styles.metaLeft}>
            <View
              style={[styles.typeIndicator, { backgroundColor: faceMeta.color }]}
            />
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
              {faceMeta.label}
            </Text>
            <Text style={[styles.metaDot, { color: colors.textMuted }]}>•</Text>
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
              {depthMeta.shortLabel}
            </Text>
          </View>
          <View
            style={[
              styles.sideBadge,
              {
                backgroundColor:
                  side === "question" ? colors.primary + "20" : colors.success + "20",
              },
            ]}
          >
            <Text
              style={[
                styles.sideBadgeText,
                { color: side === "question" ? colors.primary : colors.success },
              ]}
            >
              {side === "question" ? "Q" : "A"}
            </Text>
          </View>
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        {primitives.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No content
          </Text>
        ) : (
          primitives.map((primitive) => (
            <View key={primitive.tempId} style={styles.primitiveWrapper}>
              <PrimitiveRenderer primitive={primitive} size={size} />
            </View>
          ))
        )}
      </View>

      {/* Hints indicator for question side */}
      {hasHints && size !== "compact" && (
        <View style={[styles.hintsIndicator, { borderTopColor: colors.border }]}>
          <Ionicons name="bulb-outline" size={14} color={colors.warning} />
          <Text style={[styles.hintsText, { color: colors.textMuted }]}>
            {face.hints.length} hint{face.hints.length > 1 ? "s" : ""} available
          </Text>
        </View>
      )}

      {/* Scaffolding indicator */}
      {face.scaffoldingLevel > 0 && size === "full" && (
        <View style={[styles.scaffoldingIndicator, { backgroundColor: colors.primary + "10" }]}>
          <Ionicons name="layers-outline" size={14} color={colors.primary} />
          <Text style={[styles.scaffoldingText, { color: colors.primary }]}>
            Scaffolding level {face.scaffoldingLevel}
          </Text>
        </View>
      )}
    </View>
  );
}

// =============================================================================
// FACE CARD PREVIEW (Full card simulation)
// =============================================================================

export interface FaceCardPreviewProps {
  face: EditableFace;
  isFlipped: boolean;
  onFlip?: () => void;
  showControls?: boolean;
}

export function FaceCardPreview({
  face,
  isFlipped,
  onFlip,
  showControls = true,
}: FaceCardPreviewProps) {
  const colors = useColors();
  const faceMeta = FACE_TYPE_METADATA[face.faceType];
  const depthMeta = DEPTH_LEVEL_METADATA[face.depthLevel];

  return (
    <View style={styles.cardPreviewContainer}>
      {/* Card Header */}
      <View style={[styles.cardHeader, { backgroundColor: faceMeta.color + "20" }]}>
        <View style={styles.cardHeaderLeft}>
          <Ionicons
            name={faceMeta.icon as any}
            size={16}
            color={faceMeta.color}
          />
          <Text style={[styles.cardHeaderText, { color: faceMeta.color }]}>
            {face.name}
          </Text>
        </View>
        <View style={styles.cardHeaderRight}>
          <View
            style={[
              styles.depthBadge,
              { backgroundColor: depthMeta.color + "20" },
            ]}
          >
            <Text style={[styles.depthBadgeText, { color: depthMeta.color }]}>
              {depthMeta.shortLabel}
            </Text>
          </View>
        </View>
      </View>

      {/* Card Content */}
      <View style={[styles.cardContent, { backgroundColor: colors.surface }]}>
        <FacePreview
          face={face}
          side={isFlipped ? "answer" : "question"}
          size="full"
        />
      </View>

      {/* Card Footer */}
      {showControls && (
        <View style={[styles.cardFooter, { backgroundColor: colors.surfaceVariant }]}>
          <Text style={[styles.cardSideLabel, { color: colors.textMuted }]}>
            {isFlipped ? "Answer" : "Question"}
          </Text>
          {onFlip && (
            <View style={styles.flipHint}>
              <Ionicons name="swap-horizontal" size={14} color={colors.textMuted} />
              <Text style={[styles.flipHintText, { color: colors.textMuted }]}>
                Tap to flip
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  metaHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
  },
  metaLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  typeIndicator: {
    width: 4,
    height: 12,
    borderRadius: 2,
    marginRight: 6,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  metaDot: {
    marginHorizontal: 4,
  },
  sideBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  sideBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  content: {
    gap: 8,
  },
  primitiveWrapper: {
    // Individual primitive spacing
  },
  emptyText: {
    fontSize: 14,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 20,
  },
  hintsIndicator: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 8,
    marginTop: 8,
    borderTopWidth: 1,
  },
  hintsText: {
    fontSize: 12,
    marginLeft: 4,
  },
  scaffoldingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  scaffoldingText: {
    fontSize: 12,
    marginLeft: 4,
  },
  // Primitive styles
  textPrimitive: {
    lineHeight: 22,
  },
  richTextPrimitive: {},
  latexContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 4,
  },
  latexText: {
    fontFamily: "monospace",
    marginLeft: 8,
    flex: 1,
  },
  imagePrimitive: {
    width: "100%",
    borderRadius: 4,
  },
  imagePlaceholder: {
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    fontSize: 12,
    marginTop: 4,
  },
  mediaContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 4,
  },
  mediaLabel: {
    fontSize: 14,
    marginLeft: 8,
  },
  codeContainer: {
    borderRadius: 4,
    overflow: "hidden",
  },
  codeText: {
    fontFamily: "monospace",
    color: "#d4d4d4",
  },
  diagramPlaceholder: {
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  // Card preview styles
  cardPreviewContainer: {
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardHeaderText: {
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 8,
  },
  cardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  depthBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  depthBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  cardContent: {
    padding: 16,
    minHeight: 150,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
  },
  cardSideLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  flipHint: {
    flexDirection: "row",
    alignItems: "center",
  },
  flipHintText: {
    fontSize: 12,
    marginLeft: 4,
  },
});
