import { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useColors } from "@/theme/ThemeProvider";
import {
  useStudyQueue,
  useSubmitReview,
  useEndStudySession,
} from "@/services/api";
import { useNativeDriver, shadows } from "@/utils/animation";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface Card {
  id: string;
  front: string;
  back: string;
  type: string;
  deckName?: string;
}

export default function StudySessionScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const colors = useColors();
  const { data: studyQueue, refetch } = useStudyQueue();
  const submitReview = useSubmitReview();
  const endSession = useEndStudySession();

  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewStartTime, setReviewStartTime] = useState(Date.now());
  const [sessionStats, setSessionStats] = useState({
    reviewed: 0,
    correct: 0,
    xpEarned: 0,
    combo: 0,
    maxCombo: 0,
  });
  const [isFinished, setIsFinished] = useState(false);

  const flipAnimation = useRef(new Animated.Value(0)).current;
  const slideAnimation = useRef(new Animated.Value(0)).current;

  const cards = (studyQueue as any)?.queue || [];
  const currentCard: Card | undefined = cards[currentCardIndex];

  const frontInterpolate = flipAnimation.interpolate({
    inputRange: [0, 180],
    outputRange: ["0deg", "180deg"],
  });

  const backInterpolate = flipAnimation.interpolate({
    inputRange: [0, 180],
    outputRange: ["180deg", "360deg"],
  });

  const flipCard = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(flipAnimation, {
      toValue: isFlipped ? 0 : 180,
      friction: 8,
      tension: 10,
      useNativeDriver,
    }).start();
    setIsFlipped(!isFlipped);
  }, [isFlipped, flipAnimation]);

  const handleRating = async (rating: 1 | 2 | 3 | 4) => {
    if (!currentCard) return;

    const responseTimeMs = Date.now() - reviewStartTime;
    Haptics.impactAsync(
      rating >= 3
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Heavy,
    );

    try {
      await submitReview.mutateAsync({
        cardId: currentCard.id,
        rating,
        responseTimeMs,
        studySessionId: sessionId,
      });

      const isCorrect = rating >= 3;
      const newCombo = isCorrect ? sessionStats.combo + 1 : 0;

      setSessionStats((prev) => ({
        reviewed: prev.reviewed + 1,
        correct: prev.correct + (isCorrect ? 1 : 0),
        xpEarned: prev.xpEarned + (isCorrect ? 10 + Math.min(newCombo, 10) : 2),
        combo: newCombo,
        maxCombo: Math.max(prev.maxCombo, newCombo),
      }));

      // Animate to next card
      Animated.timing(slideAnimation, {
        toValue: -SCREEN_WIDTH,
        duration: 200,
        useNativeDriver,
      }).start(() => {
        if (currentCardIndex < cards.length - 1) {
          setCurrentCardIndex((prev) => prev + 1);
          setIsFlipped(false);
          flipAnimation.setValue(0);
          slideAnimation.setValue(SCREEN_WIDTH);
          Animated.timing(slideAnimation, {
            toValue: 0,
            duration: 200,
            useNativeDriver,
          }).start();
        } else {
          setIsFinished(true);
        }
        setReviewStartTime(Date.now());
      });
    } catch (error) {
      console.error("Failed to submit review:", error);
    }
  };

  const handleEndSession = async () => {
    try {
      await endSession.mutateAsync(sessionId);
      router.back();
    } catch (error) {
      console.error("Failed to end session:", error);
      router.back();
    }
  };

  const RatingButton = ({
    rating,
    label,
    color,
    icon,
  }: {
    rating: 1 | 2 | 3 | 4;
    label: string;
    color: string;
    icon: any;
  }) => (
    <TouchableOpacity
      onPress={() => handleRating(rating)}
      style={{
        flex: 1,
        backgroundColor: color + "15",
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: "center",
        marginHorizontal: 4,
        borderWidth: 2,
        borderColor: color + "30",
      }}
    >
      <Ionicons name={icon} size={24} color={color} />
      <Text
        style={{
          color,
          fontWeight: "600",
          marginTop: 4,
          fontSize: 12,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  if (isFinished) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              width: 100,
              height: 100,
              borderRadius: 50,
              backgroundColor: colors.successLight,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 24,
            }}
          >
            <Text style={{ fontSize: 48 }}>🎉</Text>
          </View>
          <Text
            style={{
              color: colors.text,
              fontSize: 28,
              fontWeight: "bold",
              marginBottom: 8,
            }}
          >
            Session Complete!
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 16,
              textAlign: "center",
              marginBottom: 32,
            }}
          >
            Great job! You&apos;ve completed this study session.
          </Text>

          {/* Stats */}
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 20,
              padding: 24,
              width: "100%",
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: "row", marginBottom: 16 }}>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 32,
                    fontWeight: "bold",
                  }}
                >
                  {sessionStats.reviewed}
                </Text>
                <Text style={{ color: colors.textSecondary }}>Cards</Text>
              </View>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text
                  style={{
                    color: colors.success,
                    fontSize: 32,
                    fontWeight: "bold",
                  }}
                >
                  {sessionStats.reviewed > 0
                    ? Math.round(
                        (sessionStats.correct / sessionStats.reviewed) * 100,
                      )
                    : 0}
                  %
                </Text>
                <Text style={{ color: colors.textSecondary }}>Accuracy</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row" }}>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text
                  style={{
                    color: colors.xpGold,
                    fontSize: 32,
                    fontWeight: "bold",
                  }}
                >
                  +{sessionStats.xpEarned}
                </Text>
                <Text style={{ color: colors.textSecondary }}>XP Earned</Text>
              </View>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text
                  style={{
                    color: colors.warning,
                    fontSize: 32,
                    fontWeight: "bold",
                  }}
                >
                  {sessionStats.maxCombo}x
                </Text>
                <Text style={{ color: colors.textSecondary }}>Max Combo</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            onPress={handleEndSession}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 16,
              paddingVertical: 16,
              paddingHorizontal: 48,
              marginTop: 32,
            }}
          >
            <Text
              style={{
                color: colors.onPrimary,
                fontWeight: "600",
                fontSize: 16,
              }}
            >
              Done
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!currentCard) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <TouchableOpacity onPress={handleEndSession} style={{ padding: 8 }}>
          <Ionicons name="close" size={28} color={colors.text} />
        </TouchableOpacity>

        {/* Progress */}
        <View style={{ flex: 1, marginHorizontal: 16 }}>
          <View
            style={{
              height: 6,
              backgroundColor: colors.surfaceVariant,
              borderRadius: 3,
            }}
          >
            <View
              style={{
                height: "100%",
                width: `${((currentCardIndex + 1) / cards.length) * 100}%`,
                backgroundColor: colors.primary,
                borderRadius: 3,
              }}
            />
          </View>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 12,
              textAlign: "center",
              marginTop: 4,
            }}
          >
            {currentCardIndex + 1} / {cards.length}
          </Text>
        </View>

        {/* Combo */}
        {sessionStats.combo > 0 && (
          <View
            style={{
              backgroundColor: colors.warning + "20",
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 12,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Ionicons name="flame" size={16} color={colors.warning} />
            <Text
              style={{
                color: colors.warning,
                fontWeight: "bold",
                marginLeft: 4,
              }}
            >
              {sessionStats.combo}x
            </Text>
          </View>
        )}
      </View>

      {/* Card */}
      <View
        style={{
          flex: 1,
          paddingHorizontal: 16,
          justifyContent: "center",
        }}
      >
        <Animated.View
          style={{
            transform: [{ translateX: slideAnimation }],
          }}
        >
          <TouchableOpacity
            onPress={flipCard}
            activeOpacity={0.9}
            style={{ height: SCREEN_HEIGHT * 0.5 }}
          >
            {/* Front of card */}
            <Animated.View
              style={{
                position: "absolute",
                width: "100%",
                height: "100%",
                backfaceVisibility: "hidden",
                transform: [{ rotateY: frontInterpolate }],
              }}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: colors.card,
                  borderRadius: 24,
                  padding: 24,
                  justifyContent: "center",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: colors.border,
                  ...shadows.medium(colors.shadow),
                }}
              >
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 24,
                    fontWeight: "600",
                    textAlign: "center",
                  }}
                >
                  {currentCard.front}
                </Text>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 14,
                    marginTop: 24,
                  }}
                >
                  Tap to reveal answer
                </Text>
              </View>
            </Animated.View>

            {/* Back of card */}
            <Animated.View
              style={{
                position: "absolute",
                width: "100%",
                height: "100%",
                backfaceVisibility: "hidden",
                transform: [{ rotateY: backInterpolate }],
              }}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: colors.surface,
                  borderRadius: 24,
                  padding: 24,
                  justifyContent: "center",
                  alignItems: "center",
                  borderWidth: 2,
                  borderColor: colors.primary + "40",
                }}
              >
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 24,
                    fontWeight: "600",
                    textAlign: "center",
                  }}
                >
                  {currentCard.back}
                </Text>
              </View>
            </Animated.View>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Rating Buttons */}
      {isFlipped && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <Text
            style={{
              color: colors.textSecondary,
              textAlign: "center",
              marginBottom: 12,
            }}
          >
            How well did you remember?
          </Text>
          <View style={{ flexDirection: "row" }}>
            <RatingButton
              rating={1}
              label="Again"
              color={colors.error}
              icon="close-circle"
            />
            <RatingButton
              rating={2}
              label="Hard"
              color={colors.warning}
              icon="alert-circle"
            />
            <RatingButton
              rating={3}
              label="Good"
              color={colors.success}
              icon="checkmark-circle"
            />
            <RatingButton
              rating={4}
              label="Easy"
              color={colors.primary}
              icon="star"
            />
          </View>
        </View>
      )}

      {/* Show answer button when not flipped */}
      {!isFlipped && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <TouchableOpacity
            onPress={flipCard}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 16,
              paddingVertical: 18,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: colors.onPrimary,
                fontWeight: "600",
                fontSize: 16,
              }}
            >
              Show Answer
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
