import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Switch,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColors, useTheme } from "@/theme/ThemeProvider";
import { useAuthStore } from "@/stores/auth.store";
import { useUser, useUserStats } from "@/services/api";
import { useStudySettings, useSettingsStore } from "@/stores/settings.store";

export default function ProfileScreen() {
  const colors = useColors();
  const { theme, setTheme, isDark } = useTheme();
  const { user, logout } = useAuthStore();
  const { data: userStats } = useUserStats();
  const studySettings = useStudySettings();
  const { updateStudySettings } = useSettingsStore();

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  const SettingItem = ({
    icon,
    iconColor = colors.primary,
    title,
    subtitle,
    onPress,
    rightElement,
  }: {
    icon: any;
    iconColor?: string;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    rightElement?: React.ReactNode;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress && !rightElement}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: iconColor + "20",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "500" }}>
          {title}
        </Text>
        {subtitle && (
          <Text
            style={{ color: colors.textSecondary, fontSize: 14, marginTop: 2 }}
          >
            {subtitle}
          </Text>
        )}
      </View>
      {rightElement ||
        (onPress && (
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        ))}
    </TouchableOpacity>
  );

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
            Profile
          </Text>
        </View>

        {/* User Info Card */}
        <View
          style={{
            marginHorizontal: 24,
            marginTop: 24,
            backgroundColor: colors.card,
            borderRadius: 20,
            padding: 20,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
          }}
        >
          {user?.avatarUrl ? (
            <Image
              source={{ uri: user.avatarUrl }}
              style={{ width: 80, height: 80, borderRadius: 40 }}
            />
          ) : (
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: colors.onPrimary,
                  fontSize: 32,
                  fontWeight: "bold",
                }}
              >
                {user?.displayName?.charAt(0).toUpperCase() || "U"}
              </Text>
            </View>
          )}
          <Text
            style={{
              color: colors.text,
              fontSize: 24,
              fontWeight: "bold",
              marginTop: 12,
            }}
          >
            {user?.displayName || "User"}
          </Text>
          <Text style={{ color: colors.textSecondary, marginTop: 4 }}>
            {user?.email}
          </Text>

          {/* Quick Stats */}
          <View
            style={{
              flexDirection: "row",
              marginTop: 20,
              paddingTop: 20,
              borderTopWidth: 1,
              borderTopColor: colors.borderLight,
              width: "100%",
            }}
          >
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text
                style={{ color: colors.text, fontSize: 20, fontWeight: "bold" }}
              >
                {(userStats as any)?.totalCards || 0}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                Cards
              </Text>
            </View>
            <View
              style={{
                width: 1,
                backgroundColor: colors.borderLight,
                marginHorizontal: 12,
              }}
            />
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text
                style={{ color: colors.text, fontSize: 20, fontWeight: "bold" }}
              >
                {(userStats as any)?.totalReviews || 0}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                Reviews
              </Text>
            </View>
            <View
              style={{
                width: 1,
                backgroundColor: colors.borderLight,
                marginHorizontal: 12,
              }}
            />
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text
                style={{ color: colors.text, fontSize: 20, fontWeight: "bold" }}
              >
                {((userStats as any)?.accuracy * 100 || 0).toFixed(0)}%
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                Accuracy
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={{
              marginTop: 16,
              backgroundColor: colors.surfaceVariant,
              borderRadius: 12,
              paddingVertical: 10,
              paddingHorizontal: 20,
            }}
          >
            <Text style={{ color: colors.primary, fontWeight: "600" }}>
              Edit Profile
            </Text>
          </TouchableOpacity>
        </View>

        {/* Settings Sections */}
        <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 14,
                fontWeight: "600",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Quick Settings
            </Text>
            <TouchableOpacity onPress={() => router.push("/settings")}>
              <Text
                style={{
                  color: colors.primary,
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                See All
              </Text>
            </TouchableOpacity>
          </View>
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              paddingHorizontal: 16,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <SettingItem
              icon="settings"
              title="All Settings"
              subtitle="Study, display, notifications, and more"
              onPress={() => router.push("/settings")}
            />
            <SettingItem
              icon="moon"
              iconColor={colors.accent}
              title="Dark Mode"
              rightElement={
                <Switch
                  value={isDark}
                  onValueChange={(value) => setTheme(value ? "dark" : "light")}
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={isDark ? colors.primary : colors.textMuted}
                />
              }
            />
            <SettingItem
              icon="calendar"
              iconColor={colors.success}
              title="Daily Goal"
              subtitle={`${studySettings.dailyGoal} cards per day`}
              onPress={() => router.push("/settings")}
            />
            <SettingItem
              icon="speedometer"
              iconColor={colors.warning}
              title="Algorithm"
              subtitle={studySettings.schedulerType.toUpperCase()}
              onPress={() => router.push("/settings")}
            />
          </View>
        </View>

        <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 14,
              fontWeight: "600",
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Data & Privacy
          </Text>
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              paddingHorizontal: 16,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <SettingItem
              icon="cloud-upload"
              title="Backup & Sync"
              subtitle="Last synced: Just now"
              onPress={() => router.push("/settings")}
            />
            <SettingItem
              icon="download"
              title="Export Data"
              subtitle="Download your cards"
              onPress={() => router.push("/settings")}
            />
            <SettingItem
              icon="shield-checkmark"
              iconColor={colors.success}
              title="Privacy Settings"
              subtitle="Analytics, sharing, visibility"
              onPress={() => router.push("/settings")}
            />
            <SettingItem
              icon="trash"
              iconColor={colors.error}
              title="Delete Account"
              onPress={() =>
                Alert.alert(
                  "Delete Account",
                  "This action cannot be undone. Please contact support to delete your account.",
                )
              }
            />
          </View>
        </View>

        <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 14,
              fontWeight: "600",
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Support
          </Text>
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              paddingHorizontal: 16,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <SettingItem
              icon="help-circle"
              title="Help Center"
              onPress={() => {}}
            />
            <SettingItem
              icon="chatbubble"
              title="Contact Support"
              onPress={() => {}}
            />
            <SettingItem
              icon="document-text"
              title="Terms of Service"
              onPress={() => {}}
            />
            <SettingItem
              icon="shield-checkmark"
              title="Privacy Policy"
              onPress={() => {}}
            />
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          onPress={handleLogout}
          style={{
            marginHorizontal: 24,
            marginTop: 24,
            backgroundColor: colors.errorLight,
            borderRadius: 16,
            paddingVertical: 16,
            alignItems: "center",
          }}
        >
          <Text
            style={{ color: colors.error, fontWeight: "600", fontSize: 16 }}
          >
            Sign Out
          </Text>
        </TouchableOpacity>

        {/* App Version */}
        <Text
          style={{
            color: colors.textMuted,
            textAlign: "center",
            marginTop: 24,
            fontSize: 12,
          }}
        >
          Manthanein v1.0.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
