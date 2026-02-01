import { View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/theme/ThemeProvider';
import { useXPInfo, useAchievements, useStreak, useLeaderboard } from '@/services/api';

const { width } = Dimensions.get('window');

export default function ProgressScreen() {
  const colors = useColors();
  const { data: xpInfo } = useXPInfo();
  const { data: achievementsData } = useAchievements();
  const { data: streak } = useStreak();
  const { data: leaderboard } = useLeaderboard('xp');

  const achievements = (achievementsData as any)?.achievements || [];
  const achievementStats = (achievementsData as any)?.stats || { total: 0, unlocked: 0, percentComplete: 0 };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 24, paddingTop: 16 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 28,
              fontWeight: 'bold',
            }}
          >
            Progress
          </Text>
        </View>

        {/* XP & Level Card */}
        <View
          style={{
            marginHorizontal: 24,
            marginTop: 24,
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 20,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: colors.xpGold + '20',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 28 }}>⚡</Text>
            </View>
            <View style={{ marginLeft: 16, flex: 1 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                Level {(xpInfo as any)?.level || 1}
              </Text>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 32,
                  fontWeight: 'bold',
                }}
              >
                {(xpInfo as any)?.totalXP?.toLocaleString() || 0} XP
              </Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={{ marginTop: 16 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                Level Progress
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                {(xpInfo as any)?.currentLevelXP || 0} / {(xpInfo as any)?.nextLevelXP || 100}
              </Text>
            </View>
            <View
              style={{
                height: 10,
                backgroundColor: colors.surfaceVariant,
                borderRadius: 5,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: '100%',
                  width: `${(xpInfo as any)?.progressPercent || 0}%`,
                  backgroundColor: colors.xpGold,
                  borderRadius: 5,
                }}
              />
            </View>
          </View>
        </View>

        {/* Stats Grid */}
        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: 24,
            marginTop: 16,
            gap: 12,
          }}
        >
          <View
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
            <Ionicons name="flame" size={28} color={colors.warning} />
            <Text
              style={{
                color: colors.text,
                fontSize: 28,
                fontWeight: 'bold',
                marginTop: 8,
              }}
            >
              {(streak as any)?.currentStreak || 0}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              Day Streak
            </Text>
          </View>

          <View
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
            <Ionicons name="trophy" size={28} color={colors.accent} />
            <Text
              style={{
                color: colors.text,
                fontSize: 28,
                fontWeight: 'bold',
                marginTop: 8,
              }}
            >
              {achievementStats.unlocked}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              Achievements
            </Text>
          </View>
        </View>

        {/* Achievements Section */}
        <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 18,
                fontWeight: '600',
              }}
            >
              Recent Achievements
            </Text>
            <TouchableOpacity>
              <Text style={{ color: colors.primary, fontWeight: '500' }}>
                See All
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12 }}
          >
            {achievements.slice(0, 6).map((achievement: any, index: number) => (
              <View
                key={achievement.id || index}
                style={{
                  width: 120,
                  backgroundColor: achievement.isUnlocked
                    ? colors.card
                    : colors.surfaceVariant,
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: achievement.isUnlocked
                    ? colors.xpGold + '40'
                    : colors.border,
                  alignItems: 'center',
                  opacity: achievement.isUnlocked ? 1 : 0.5,
                }}
              >
                <Text style={{ fontSize: 32 }}>{achievement.icon || '🏆'}</Text>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 12,
                    fontWeight: '600',
                    marginTop: 8,
                    textAlign: 'center',
                  }}
                  numberOfLines={2}
                >
                  {achievement.name || 'Achievement'}
                </Text>
                {!achievement.isUnlocked && achievement.progress && (
                  <View style={{ width: '100%', marginTop: 8 }}>
                    <View
                      style={{
                        height: 4,
                        backgroundColor: colors.border,
                        borderRadius: 2,
                      }}
                    >
                      <View
                        style={{
                          height: '100%',
                          width: `${achievement.progress.percentage || 0}%`,
                          backgroundColor: colors.primary,
                          borderRadius: 2,
                        }}
                      />
                    </View>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Leaderboard Preview */}
        <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 18,
                fontWeight: '600',
              }}
            >
              Leaderboard
            </Text>
            <TouchableOpacity>
              <Text style={{ color: colors.primary, fontWeight: '500' }}>
                See All
              </Text>
            </TouchableOpacity>
          </View>

          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden',
            }}
          >
            {((leaderboard as any)?.entries || []).slice(0, 5).map((entry: any, index: number) => (
              <View
                key={entry.userId || index}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 12,
                  borderBottomWidth: index < 4 ? 1 : 0,
                  borderBottomColor: colors.borderLight,
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor:
                      entry.rank === 1
                        ? colors.xpGold
                        : entry.rank === 2
                        ? colors.xpSilver
                        : entry.rank === 3
                        ? colors.xpBronze
                        : colors.surfaceVariant,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: entry.rank <= 3 ? '#fff' : colors.text,
                      fontWeight: 'bold',
                      fontSize: 14,
                    }}
                  >
                    {entry.rank}
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ color: colors.text, fontWeight: '500' }}>
                    {entry.displayName || 'User'}
                  </Text>
                </View>
                <Text style={{ color: colors.xpGold, fontWeight: '600' }}>
                  {entry.score?.toLocaleString() || 0} XP
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Memory Integrity */}
        <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 18,
              fontWeight: '600',
              marginBottom: 12,
            }}
          >
            Memory Health
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
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  borderWidth: 6,
                  borderColor: colors.success,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 24,
                    fontWeight: 'bold',
                  }}
                >
                  75%
                </Text>
              </View>
              <View style={{ marginLeft: 20, flex: 1 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 16,
                    fontWeight: '600',
                  }}
                >
                  Memory Integrity
                </Text>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 14,
                    marginTop: 4,
                  }}
                >
                  Your retention rate is above average. Keep up the good work!
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
