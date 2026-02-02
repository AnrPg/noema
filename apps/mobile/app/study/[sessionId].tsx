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
import { useColors } from "@/theme/ThemeProvider";
import {
  useStudyQueue,
  useSubmitReview,
  useEndStudySession,
  useCardParticipations,
} from "@/services/api";
import { useNativeDriver, shadows, haptics } from "@/utils/animation";
import { useRequireAuth } from "@/components/AuthGuard";
import { ActiveLensIndicator } from "@/components/multi-belonging";
import { useEcosystemStore } from "@/stores/ecosystem.store";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface CardCategory {
  id: string;
  name: string;
  color?: string;
}

interface Card {
  id: string;
  front: string;
  back: string;
  type: string;
  deckName?: string;
  categories?: CardCategory[];
}

export default function StudySessionScreen() {
  // Auth protection - redirects to login if not authenticated
  const { isAuthenticated, isLoading: authLoading } = useRequireAuth();

  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const colors = useColors();
  const { data: studyQueue, isLoading: queueLoading } = useStudyQueue();
  const submitReview = useSubmitReview();
  const endSession = useEndStudySession();

  // Get the focused category from ecosystem store as initial active lens
  const focusedCategoryId = useEcosystemStore(
    (state) => state.navigation.focusedCategoryId,
  );
  const categories = useEcosystemStore((state) => state.categories);

  // Active lens state - which category context to track performance for
  const [activeLensId, setActiveLensId] = useState<string | null>(
    focusedCategoryId || null,
  );

  // Store session cards locally to avoid issues with queue refetching
  const [sessionCards, setSessionCards] = useState<Card[]>([]);
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

  // Initialize session cards from queue (only once when queue loads)
  useEffect(() => {
    if (studyQueue && sessionCards.length === 0) {
      const queue = (studyQueue as any)?.queue || [];
      if (queue.length > 0) {
        setSessionCards(
          queue.map((card: any) => {
            // Handle content structure: can be {front: {text: "..."}} or {front: "..."}
            const frontContent = card.content?.front;
            const backContent = card.content?.back;
            const front =
              typeof frontContent === "object" && frontContent?.text
                ? frontContent.text
                : typeof frontContent === "string"
                  ? frontContent
                  : "No front content";
            const back =
              typeof backContent === "object" && backContent?.text
                ? backContent.text
                : typeof backContent === "string"
                  ? backContent
                  : "No back content";

            // Extract categories from participations
            const cardCategories: CardCategory[] =
              card.participations
                ?.filter((p: any) => p.category)
                .map((p: any) => ({
                  id: p.category.id,
                  name: p.category.name,
                  color: p.category.color,
                })) || [];

            return {
              id: card.id,
              front,
              back,
              type: card.cardType || "basic",
              deckName: card.deck?.name,
              categories: cardCategories,
            };
          }),
        );
      }
    }
  }, [studyQueue, sessionCards.length]);

  const flipAnimation = useRef(new Animated.Value(0)).current;
  const slideAnimation = useRef(new Animated.Value(0)).current;

  // Use local session cards for navigation
  const cards = sessionCards;
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
    haptics.light();
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
    if (rating >= 3) {
      haptics.medium();
    } else {
      haptics.heavy();
    }

    // Determine the effective category for context tracking
    // If activeLensId is set and the card participates in that category, use it
    const effectiveCategoryId =
      activeLensId && currentCard.categories?.some((c) => c.id === activeLensId)
        ? activeLensId
        : null;

    try {
      await submitReview.mutateAsync({
        cardId: currentCard.id,
        rating,
        responseTimeMs,
        studySessionId: sessionId,
        // Include category context for multi-belonging tracking
        ...(effectiveCategoryId && { categoryId: effectiveCategoryId }),
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

  // Show loading while checking auth or loading queue
  if (authLoading || !isAuthenticated) {
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

  // Show loading while queue is loading and we don't have session cards yet
  if (queueLoading && sessionCards.length === 0) {
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
        <Text style={{ color: colors.textSecondary, marginTop: 16 }}>
          Loading cards...
        </Text>
      </SafeAreaView>
    );
  }

  // Show empty state if no cards to study
  if (!queueLoading && sessionCards.length === 0) {
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
          <Ionicons name="checkmark-circle" size={80} color={colors.success} />
          <Text
            style={{
              color: colors.text,
              fontSize: 24,
              fontWeight: "bold",
              marginTop: 24,
              textAlign: "center",
            }}
          >
            All caught up!
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 16,
              marginTop: 8,
              textAlign: "center",
            }}
          >
            No cards due for review right now.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              backgroundColor: colors.primary,
              paddingHorizontal: 32,
              paddingVertical: 16,
              borderRadius: 12,
              marginTop: 32,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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

      {/* Active Lens Indicator - shows which category context is being tracked */}
      {currentCard.categories && currentCard.categories.length > 0 && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 16,
            paddingVertical: 8,
          }}
        >
          <ActiveLensIndicator
            activeLens={
              activeLensId
                ? currentCard.categories.find((c) => c.id === activeLensId) ||
                  null
                : null
            }
            availableLenses={currentCard.categories}
            onLensChange={(lensId) => setActiveLensId(lensId)}
            size="compact"
          />
        </View>
      )}

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
