import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/theme/ThemeProvider';
import { useAuthStore } from '@/stores/auth.store';
import { useTodayProgress, useXPInfo, useStreak, useStudyQueue } from '@/services/api';
import { useState, useCallback } from 'react';

export default function HomeScreen() {
  const colors = useColors();
  const { user } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  
  const { data: todayProgress, refetch: refetchProgress } = useTodayProgress();
  const { data: xpInfo, refetch: refetchXP } = useXPInfo();
  const { data: streak, refetch: refetchStreak } = useStreak();
  const { data: studyQueue, refetch: refetchQueue } = useStudyQueue();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refetchProgress(),
      refetchXP(),
      refetchStreak(),
      refetchQueue(),
    ]);
    setRefreshing(false);
  }, []);

  const cardsToStudy = (studyQueue as any)?.counts?.total || 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {/* Header */}
        <View style={{ paddingHorizontal: 24, paddingTop: 16 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 16 }}>
            Welcome back,
          </Text>
          <Text
            style={{
              color: colors.text,
              fontSize: 28,
              fontWeight: 'bold',
              marginTop: 4,
            }}
          >
            {user?.displayName || 'Learner'}
          </Text>
        </View>

        {/* Quick Study Card */}
        <TouchableOpacity
          onPress={() => router.push('/study')}
          style={{ marginHorizontal: 24, marginTop: 24 }}
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View>
                <Text
                  style={{
                    color: 'rgba(255,255,255,0.8)',
                    fontSize: 14,
                    fontWeight: '500',
                  }}
                >
                  Ready to study
                </Text>
                <Text
                  style={{
                    color: '#fff',
                    fontSize: 42,
                    fontWeight: 'bold',
                    marginTop: 4,
                  }}
                >
                  {cardsToStudy}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16 }}>
                  cards waiting
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  borderRadius: 16,
                  width: 56,
                  height: 56,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="play" size={28} color="#fff" />
              </View>
            </View>
            <View
              style={{
                flexDirection: 'row',
                marginTop: 20,
                backgroundColor: 'rgba(255,255,255,0.15)',
                borderRadius: 12,
                padding: 12,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '600', flex: 1 }}>
                Start Study Session →
              </Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Stats Row */}
        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: 24,
            marginTop: 24,
            gap: 12,
          }}
        >
          {/* XP Card */}
          <View
            style={{
              flex: 1,
              backgroundColor: colors.card,
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Ionicons name="flash" size={24} color={colors.xpGold} />
            <Text
              style={{
                color: colors.text,
                fontSize: 24,
                fontWeight: 'bold',
                marginTop: 8,
              }}
            >
              {(xpInfo as any)?.totalXP || 0}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
              Total XP
            </Text>
          </View>

          {/* Level Card */}
          <View
            style={{
              flex: 1,
              backgroundColor: colors.card,
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Ionicons name="trophy" size={24} color={colors.primary} />
            <Text
              style={{
                color: colors.text,
                fontSize: 24,
                fontWeight: 'bold',
                marginTop: 8,
              }}
            >
              {(xpInfo as any)?.level || 1}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
              Level
            </Text>
          </View>

          {/* Streak Card */}
          <View
            style={{
              flex: 1,
              backgroundColor: colors.card,
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Ionicons name="flame" size={24} color={colors.warning} />
            <Text
              style={{
                color: colors.text,
                fontSize: 24,
                fontWeight: 'bold',
                marginTop: 8,
              }}
            >
              {(streak as any)?.currentStreak || 0}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
              Day Streak
            </Text>
          </View>
        </View>

        {/* Today's Progress */}
        <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 18,
              fontWeight: '600',
              marginBottom: 12,
            }}
          >
            Today's Progress
          </Text>
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              padding: 20,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <Text style={{ color: colors.textSecondary }}>Reviews</Text>
              <Text style={{ color: colors.text, fontWeight: '600' }}>
                {(todayProgress as any)?.reviewsCompleted || 0} / {(todayProgress as any)?.dailyGoal || 50}
              </Text>
            </View>
            <View
              style={{
                height: 8,
                backgroundColor: colors.surfaceVariant,
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: '100%',
                  width: `${(todayProgress as any)?.goalProgress || 0}%`,
                  backgroundColor: colors.primary,
                  borderRadius: 4,
                }}
              />
            </View>
            <View style={{ flexDirection: 'row', marginTop: 16, gap: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  XP Earned
                </Text>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>
                  +{(todayProgress as any)?.xpEarned || 0}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Remaining
                </Text>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>
                  {(todayProgress as any)?.totalRemaining || 0}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 18,
              fontWeight: '600',
              marginBottom: 12,
            }}
          >
            Quick Actions
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              onPress={() => router.push('/decks')}
              style={{
                flex: 1,
                backgroundColor: colors.card,
                borderRadius: 16,
                padding: 16,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  backgroundColor: colors.primaryLight + '20',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="add" size={24} color={colors.primary} />
              </View>
              <Text
                style={{
                  color: colors.text,
                  fontWeight: '500',
                  marginTop: 8,
                }}
              >
                New Deck
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/progress')}
              style={{
                flex: 1,
                backgroundColor: colors.card,
                borderRadius: 16,
                padding: 16,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  backgroundColor: colors.success + '20',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="bar-chart" size={24} color={colors.success} />
              </View>
              <Text
                style={{
                  color: colors.text,
                  fontWeight: '500',
                  marginTop: 8,
                }}
              >
                Statistics
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('/profile')}
              style={{
                flex: 1,
                backgroundColor: colors.card,
                borderRadius: 16,
                padding: 16,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  backgroundColor: colors.accent + '20',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="trophy" size={24} color={colors.accent} />
              </View>
              <Text
                style={{
                  color: colors.text,
                  fontWeight: '500',
                  marginTop: 8,
                }}
              >
                Achievements
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
