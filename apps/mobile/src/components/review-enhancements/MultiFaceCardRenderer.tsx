// =============================================================================
// MULTI-FACE CARD RENDERER
// =============================================================================
// Phase 6E: Enhanced card renderer supporting multiple faces with rich content

import React, { useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";
import { shadows, haptics } from "@/utils/animation";
import type {
  MultiFaceCardRendererProps,
  ReviewFace,
  CardContext,
  ContentPrimitive,
} from "./types";
import { ContextIndicatorBar } from "./ContextIndicatorBar";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// =============================================================================
// CONTENT PRIMITIVE RENDERER
// =============================================================================

interface ContentRendererProps {
  primitives: ContentPrimitive[];
  colors: any;
}

/**
 * Helper to extract text content from various primitive types
 */
const getTextContent = (primitive: ContentPrimitive): string => {
  switch (primitive.type) {
    case "text":
    case "markdown":
    case "latex":
    case "code":
      return primitive.content;
    case "formula":
      return primitive.content;
    case "image":
      return primitive.url || "Image";
    case "audio":
      return primitive.transcript || "Audio content";
    case "cloze_region":
      return primitive.fullText;
    default:
      return "";
  }
};

const ContentRenderer: React.FC<ContentRendererProps> = ({
  primitives,
  colors,
}) => {
  return (
    <View style={styles.contentContainer}>
      {primitives.map((primitive, index) => (
        <View key={primitive.id || index} style={styles.primitiveWrapper}>
          {primitive.type === "text" && (
            <Text style={[styles.textContent, { color: colors.text }]}>
              {primitive.content}
            </Text>
          )}
          {primitive.type === "markdown" && (
            <Text style={[styles.markdownContent, { color: colors.text }]}>
              {primitive.content}
            </Text>
          )}
          {primitive.type === "latex" && (
            <View
              style={[
                styles.latexContainer,
                { backgroundColor: colors.surfaceVariant },
              ]}
            >
              <Text
                style={[styles.latexContent, { color: colors.textSecondary }]}
              >
                {primitive.content}
              </Text>
            </View>
          )}
          {primitive.type === "code" && (
            <View
              style={[
                styles.codeContainer,
                { backgroundColor: colors.codeBackground || "#1E1E1E" },
              ]}
            >
              <Text style={[styles.codeContent, { color: "#D4D4D4" }]}>
                {primitive.content}
              </Text>
            </View>
          )}
          {primitive.type === "image" && (
            <View
              style={[
                styles.imagePlaceholder,
                { backgroundColor: colors.surfaceVariant },
              ]}
            >
              <Ionicons
                name="image-outline"
                size={40}
                color={colors.textMuted}
              />
              <Text style={{ color: colors.textMuted, marginTop: 8 }}>
                Image: {primitive.url}
              </Text>
            </View>
          )}
          {primitive.type === "audio" && (
            <View
              style={[
                styles.mediaContainer,
                { backgroundColor: colors.surfaceVariant },
              ]}
            >
              <Ionicons
                name="volume-high-outline"
                size={24}
                color={colors.primary}
              />
              <Text
                style={{ color: colors.textSecondary, marginLeft: 12, flex: 1 }}
              >
                {primitive.transcript || "Audio content"}
              </Text>
              <TouchableOpacity
                style={[styles.playButton, { backgroundColor: colors.primary }]}
              >
                <Ionicons name="play" size={16} color="#FFF" />
              </TouchableOpacity>
            </View>
          )}
          {primitive.type === "cloze_region" && (
            <Text style={[styles.clozeContent, { color: colors.text }]}>
              {primitive.fullText.replace(/\{\{(.+?)\}\}/g, "___")}
            </Text>
          )}
          {primitive.type === "formula" && (
            <View
              style={[
                styles.latexContainer,
                { backgroundColor: colors.surfaceVariant },
              ]}
            >
              <Text
                style={[styles.latexContent, { color: colors.textSecondary }]}
              >
                {primitive.content}
              </Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
};

// =============================================================================
// FACE TYPE INDICATOR
// =============================================================================

interface FaceTypeIndicatorProps {
  face: ReviewFace;
  colors: any;
}

const FaceTypeIndicator: React.FC<FaceTypeIndicatorProps> = ({
  face,
  colors,
}) => {
  const getTypeIcon = (type: string): string => {
    const iconMap: Record<string, string> = {
      recognition: "eye-outline",
      recall: "bulb-outline",
      cloze: "code-slash-outline",
      application: "construct-outline",
      synthesis: "git-merge-outline",
      definition: "book-outline",
      true_false: "checkmark-done-outline",
      problem_solving: "calculator-outline",
    };
    return iconMap[type] || "help-outline";
  };

  const getDepthColor = (depth: string): string => {
    const colorMap: Record<string, string> = {
      remember: "#3B82F6",
      understand: "#8B5CF6",
      apply: "#10B981",
      analyze: "#F59E0B",
      evaluate: "#EF4444",
      create: "#EC4899",
    };
    return colorMap[depth] || colors.textMuted;
  };

  return (
    <View style={styles.faceTypeContainer}>
      <View
        style={[
          styles.faceTypeBadge,
          { backgroundColor: getDepthColor(face.depthLevel) + "20" },
        ]}
      >
        <Ionicons
          name={getTypeIcon(face.type) as any}
          size={14}
          color={getDepthColor(face.depthLevel)}
        />
        <Text
          style={[
            styles.faceTypeText,
            { color: getDepthColor(face.depthLevel) },
          ]}
        >
          {face.type.replace("_", " ")}
        </Text>
      </View>
      <View
        style={[
          styles.depthBadge,
          { backgroundColor: getDepthColor(face.depthLevel) + "15" },
        ]}
      >
        <Text
          style={[
            styles.depthText,
            { color: getDepthColor(face.depthLevel) },
          ]}
        >
          {face.depthLevel}
        </Text>
      </View>
    </View>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const MultiFaceCardRenderer: React.FC<MultiFaceCardRendererProps> = ({
  card,
  isFlipped,
  onFlip,
  onShowHint,
  hintsRevealed,
  context,
  showContextIndicators = true,
  animationStyle = "flip",
}) => {
  const colors = useColors();
  const flipAnimation = useRef(new Animated.Value(isFlipped ? 180 : 0)).current;
  const [contextExpanded, setContextExpanded] = React.useState(false);

  const activeFace = card.faces[card.activeFaceIndex];
  const hasHints =
    activeFace?.hints && activeFace.hints.length > 0;
  const allHintsRevealed =
    hasHints && hintsRevealed >= (activeFace.hints?.length || 0);

  // Animate flip
  React.useEffect(() => {
    Animated.spring(flipAnimation, {
      toValue: isFlipped ? 180 : 0,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();
  }, [isFlipped, flipAnimation]);

  const frontInterpolate = flipAnimation.interpolate({
    inputRange: [0, 180],
    outputRange: ["0deg", "180deg"],
  });

  const backInterpolate = flipAnimation.interpolate({
    inputRange: [0, 180],
    outputRange: ["180deg", "360deg"],
  });

  const handleFlip = useCallback(() => {
    haptics.light();
    onFlip();
  }, [onFlip]);

  const handleShowHint = useCallback(() => {
    if (onShowHint && hasHints && !allHintsRevealed) {
      haptics.light();
      onShowHint();
    }
  }, [onShowHint, hasHints, allHintsRevealed]);

  if (!activeFace) {
    return (
      <View
        style={[
          styles.errorContainer,
          { backgroundColor: colors.errorLight + "30" },
        ]}
      >
        <Ionicons name="alert-circle" size={48} color={colors.error} />
        <Text style={[styles.errorText, { color: colors.error }]}>
          No active face found
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Context indicator bar */}
      {showContextIndicators && context && (
        <ContextIndicatorBar
          context={context}
          isExpanded={contextExpanded}
          onToggleExpand={() => setContextExpanded(!contextExpanded)}
          compact={true}
        />
      )}

      {/* Card container */}
      <TouchableOpacity
        onPress={handleFlip}
        activeOpacity={0.9}
        style={styles.cardTouchable}
      >
        {/* Front of card (Question) */}
        <Animated.View
          style={[
            styles.cardFace,
            {
              backfaceVisibility: "hidden",
              transform: [{ rotateY: frontInterpolate }],
            },
          ]}
        >
          <View
            style={[
              styles.cardContent,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                ...shadows.medium(colors.shadow),
              },
            ]}
          >
            {/* Face type indicator */}
            <FaceTypeIndicator face={activeFace} colors={colors} />

            {/* Question content */}
            <ScrollView
              style={styles.scrollContainer}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <ContentRenderer
                primitives={activeFace.question}
                colors={colors}
              />
            </ScrollView>

            {/* Hints section */}
            {hasHints && hintsRevealed > 0 && (
              <View
                style={[
                  styles.hintsContainer,
                  { backgroundColor: colors.warningLight },
                ]}
              >
                <View style={styles.hintsHeader}>
                  <Ionicons
                    name="bulb-outline"
                    size={16}
                    color={colors.warning}
                  />
                  <Text style={[styles.hintsTitle, { color: colors.warning }]}>
                    Hints ({hintsRevealed}/{activeFace.hints?.length || 0})
                  </Text>
                </View>
                {activeFace.hints?.slice(0, hintsRevealed).map((hint, idx) => (
                  <View key={idx} style={styles.hintItem}>
                    <Text style={[styles.hintNumber, { color: colors.warning }]}>
                      {idx + 1}.
                    </Text>
                    <ContentRenderer primitives={[hint]} colors={colors} />
                  </View>
                ))}
              </View>
            )}

            {/* Bottom actions */}
            <View style={styles.cardActions}>
              {hasHints && !allHintsRevealed && !isFlipped && (
                <TouchableOpacity
                  onPress={handleShowHint}
                  style={[
                    styles.hintButton,
                    { backgroundColor: colors.warning + "20" },
                  ]}
                >
                  <Ionicons
                    name="bulb-outline"
                    size={18}
                    color={colors.warning}
                  />
                  <Text style={[styles.hintButtonText, { color: colors.warning }]}>
                    Show Hint
                  </Text>
                </TouchableOpacity>
              )}

              <Text style={[styles.tapHint, { color: colors.textMuted }]}>
                Tap to reveal answer
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Back of card (Answer) */}
        <Animated.View
          style={[
            styles.cardFace,
            styles.cardFaceBack,
            {
              backfaceVisibility: "hidden",
              transform: [{ rotateY: backInterpolate }],
            },
          ]}
        >
          <View
            style={[
              styles.cardContent,
              {
                backgroundColor: colors.surface,
                borderColor: colors.primary + "40",
                borderWidth: 2,
              },
            ]}
          >
            {/* Face type indicator */}
            <FaceTypeIndicator face={activeFace} colors={colors} />

            {/* Answer content */}
            <ScrollView
              style={styles.scrollContainer}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <ContentRenderer
                primitives={activeFace.answer}
                colors={colors}
              />

              {/* Explanation if available */}
              {activeFace.explanation && activeFace.explanation.length > 0 && (
                <View
                  style={[
                    styles.explanationContainer,
                    { backgroundColor: colors.primaryLight },
                  ]}
                >
                  <View style={styles.explanationHeader}>
                    <Ionicons
                      name="information-circle-outline"
                      size={16}
                      color={colors.primary}
                    />
                    <Text
                      style={[styles.explanationTitle, { color: colors.primary }]}
                    >
                      Explanation
                    </Text>
                  </View>
                  <ContentRenderer
                    primitives={activeFace.explanation}
                    colors={colors}
                  />
                </View>
              )}
            </ScrollView>
          </View>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
};

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  cardTouchable: {
    flex: 1,
    maxHeight: SCREEN_HEIGHT * 0.55,
  },
  cardFace: {
    position: "absolute",
    width: "100%",
    height: "100%",
  },
  cardFaceBack: {
    // Back face styling
  },
  cardContent: {
    flex: 1,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
  },
  faceTypeContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 8,
  },
  faceTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  faceTypeText: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  depthBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  depthText: {
    fontSize: 11,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  contentContainer: {
    gap: 12,
  },
  primitiveWrapper: {
    // Wrapper for each primitive
  },
  textContent: {
    fontSize: 20,
    lineHeight: 28,
    textAlign: "center",
  },
  markdownContent: {
    fontSize: 18,
    lineHeight: 26,
  },
  latexContainer: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  latexContent: {
    fontSize: 18,
    fontFamily: "monospace",
  },
  codeContainer: {
    padding: 16,
    borderRadius: 12,
  },
  codeContent: {
    fontSize: 14,
    fontFamily: "monospace",
    lineHeight: 20,
  },
  imagePlaceholder: {
    height: 150,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
  },
  playButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  clozeContent: {
    fontSize: 20,
    lineHeight: 28,
    textAlign: "center",
  },
  hintsContainer: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
  },
  hintsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  hintsTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  hintItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 8,
    gap: 8,
  },
  hintNumber: {
    fontSize: 14,
    fontWeight: "600",
  },
  cardActions: {
    marginTop: 16,
    alignItems: "center",
    gap: 12,
  },
  hintButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  hintButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  tapHint: {
    fontSize: 14,
  },
  explanationContainer: {
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
  },
  explanationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  explanationTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    borderRadius: 24,
  },
  errorText: {
    fontSize: 16,
    marginTop: 12,
  },
});

export default MultiFaceCardRenderer;
