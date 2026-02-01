import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/theme/ThemeProvider";
import {
  useStudyQueue,
  useTodayProgress,
  useStartStudySession,
  useDecks,
} from "@/services/api";

export default function StudyScreen() {
  const colors = useColors();
  const { data: studyQueue } = useStudyQueue();
  const { data: todayProgress } = useTodayProgress();
  const { data: decksData } = useDecks();
  const startSession = useStartStudySession();

  const counts = (studyQueue as any)?.counts || { new: 0, due: 0, total: 0 };
  const decks = ((decksData as any)?.data || []).filter(
    (d: any) => d.dueCount > 0 || d.newCount > 0,
  );

  const handleStartStudy = async (deckId?: string) => {
    try {
      const response = await startSession.mutateAsync({ deckId });
      // API returns session object directly: { id, userId, deckId, ... }
      const sessionId = response.data.id;
      router.push(`/study/${sessionId}`);
    } catch (error) {
      console.error("Failed to start study session:", error);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 24, paddingTop: 16 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 28,
              fontWeight: "bold",
            }}
          >
            Study
          </Text>
        </View>

        {/* Main Study Card */}
        <TouchableOpacity
          onPress={() => handleStartStudy()}
          disabled={counts.total === 0}
          style={{
            marginHorizontal: 24,
            marginTop: 24,
            opacity: counts.total === 0 ? 0.6 : 1,
          }}
        >
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 20,
              padding: 24,
            }}
          >
            <Text
              style={{
                color: "rgba(255,255,255,0.8)",
                fontSize: 16,
                fontWeight: "500",
              }}
            >
              {counts.total > 0 ? "Ready to review" : "All caught up!"}
            </Text>
            <Text
              style={{
                color: "#fff",
                fontSize: 48,
                fontWeight: "bold",
                marginTop: 8,
              }}
            >
              {counts.total}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 16 }}>
              cards across all decks
            </Text>

            {/* Breakdown */}
            <View
              style={{
                flexDirection: "row",
                marginTop: 20,
                gap: 16,
              }}
            >
              <View
                style={{
                  backgroundColor: "rgba(255,255,255,0.15)",
                  borderRadius: 10,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Ionicons name="time" size={16} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "500" }}>
                  {counts.due} due
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: "rgba(255,255,255,0.15)",
                  borderRadius: 10,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Ionicons name="sparkles" size={16} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "500" }}>
                  {counts.new} new
                </Text>
              </View>
            </View>

            {counts.total > 0 && (
              <View
                style={{
                  flexDirection: "row",
                  marginTop: 16,
                  backgroundColor: "rgba(255,255,255,0.2)",
                  borderRadius: 12,
                  padding: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Ionicons name="play" size={20} color="#fff" />
                <Text
                  style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}
                >
                  Start Study Session
                </Text>
              </View>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Study Modes */}
        <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 18,
              fontWeight: "600",
              marginBottom: 12,
            }}
          >
            Study Modes
          </Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: colors.card,
                borderRadius: 16,
                padding: 16,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Ionicons name="flash" size={24} color={colors.warning} />
              <Text
                style={{
                  color: colors.text,
                  fontSize: 16,
                  fontWeight: "600",
                  marginTop: 8,
                }}
              >
                Cram
              </Text>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 12,
                  marginTop: 4,
                }}
              >
                Review all cards quickly
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: colors.card,
                borderRadius: 16,
                padding: 16,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Ionicons name="bulb" size={24} color={colors.success} />
              <Text
                style={{
                  color: colors.text,
                  fontSize: 16,
                  fontWeight: "600",
                  marginTop: 8,
                }}
              >
                Preview
              </Text>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 12,
                  marginTop: 4,
                }}
              >
                Study without scheduling
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Decks with Due Cards */}
        {decks.length > 0 && (
          <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
            <Text
              style={{
                color: colors.text,
                fontSize: 18,
                fontWeight: "600",
                marginBottom: 12,
              }}
            >
              Study by Deck
            </Text>
            {decks.map((deck: any) => (
              <TouchableOpacity
                key={deck.id}
                onPress={() => handleStartStudy(deck.id)}
                style={{
                  backgroundColor: colors.card,
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 16,
                      fontWeight: "600",
                    }}
                  >
                    {deck.name}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
                    {deck.dueCount > 0 && (
                      <Text style={{ color: colors.warning, fontSize: 14 }}>
                        {deck.dueCount} due
                      </Text>
                    )}
                    {deck.newCount > 0 && (
                      <Text style={{ color: colors.primary, fontSize: 14 }}>
                        {deck.newCount} new
                      </Text>
                    )}
                  </View>
                </View>
                <View
                  style={{
                    backgroundColor: colors.primary,
                    borderRadius: 10,
                    padding: 10,
                  }}
                >
                  <Ionicons name="play" size={20} color={colors.onPrimary} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Today's Progress Summary */}
        <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 18,
              fontWeight: "600",
              marginBottom: 12,
            }}
          >
            Today
          </Text>
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: "row" }}>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Reviewed
                </Text>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 24,
                    fontWeight: "bold",
                    marginTop: 4,
                  }}
                >
                  {(todayProgress as any)?.reviewsCompleted || 0}
                </Text>
              </View>
              <View
                style={{
                  width: 1,
                  backgroundColor: colors.border,
                  marginHorizontal: 16,
                }}
              />
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Goal
                </Text>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 24,
                    fontWeight: "bold",
                    marginTop: 4,
                  }}
                >
                  {(todayProgress as any)?.dailyGoal || 50}
                </Text>
              </View>
              <View
                style={{
                  width: 1,
                  backgroundColor: colors.border,
                  marginHorizontal: 16,
                }}
              />
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  XP
                </Text>
                <Text
                  style={{
                    color: colors.xpGold,
                    fontSize: 24,
                    fontWeight: "bold",
                    marginTop: 4,
                  }}
                >
                  +{(todayProgress as any)?.xpEarned || 0}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
