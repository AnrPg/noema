// =============================================================================
// SETTINGS SCREEN
// =============================================================================
// Comprehensive settings page with all configurations grouped by categories

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useColors, useTheme } from "@/theme/ThemeProvider";
import { haptics } from "@/utils/animation";
import {
  useSettingsStore,
  useHistoryStore,
  useStudySettings,
  useDisplaySettings,
  useAudioSettings,
  useNotificationSettings,
  usePrivacySettings,
  useSyncSettings,
  useAccessibilitySettings,
  useAISettings,
  useAdvancedSettings,
  usePluginSettings,
  useLKGC,
  useLKGCSuggestion,
  useRecentChanges,
  useCheckpoints,
  SchedulerType,
  ThemeMode,
  FontSize,
  CardAnimation,
  ReviewOrder,
} from "@/stores";

import {
  SettingInfo,
  LearnMore,
  HistoryButton,
  LKGCSection,
} from "@/components/settings";

import {
  STUDY_METADATA,
  DISPLAY_METADATA,
  AUDIO_METADATA,
  NOTIFICATION_METADATA,
  PRIVACY_METADATA,
  SYNC_METADATA,
  ACCESSIBILITY_METADATA,
  AI_METADATA,
  ADVANCED_METADATA,
} from "@manthanein/shared";

// =============================================================================
// COMPONENT TYPES
// =============================================================================

interface SettingItemProps {
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

interface SliderSettingProps {
  title: string;
  subtitle?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onValueChange: (value: number) => void;
  rightElement?: React.ReactNode;
}

interface PickerOption<T> {
  label: string;
  value: T;
  description?: string;
}

interface PickerModalProps<T> {
  visible: boolean;
  title: string;
  options: PickerOption<T>[];
  value: T;
  onSelect: (value: T) => void;
  onClose: () => void;
}

// =============================================================================
// REUSABLE COMPONENTS
// =============================================================================

function SettingItem({
  icon,
  iconColor,
  title,
  subtitle,
  onPress,
  rightElement,
  disabled = false,
  danger = false,
}: SettingItemProps) {
  const colors = useColors();
  const effectiveIconColor = danger
    ? colors.error
    : iconColor || colors.primary;
  const textColor = danger ? colors.error : colors.text;

  return (
    <TouchableOpacity
      onPress={() => {
        if (!disabled && onPress) {
          haptics.selection();
          onPress();
        }
      }}
      disabled={disabled || (!onPress && !rightElement)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 16,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon && (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            backgroundColor: effectiveIconColor + "15",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
          }}
        >
          <Ionicons name={icon} size={18} color={effectiveIconColor} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: textColor,
            fontSize: 16,
            fontWeight: "500",
          }}
        >
          {title}
        </Text>
        {subtitle && (
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 13,
              marginTop: 2,
            }}
          >
            {subtitle}
          </Text>
        )}
      </View>
      {rightElement ||
        (onPress && (
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        ))}
    </TouchableOpacity>
  );
}

function Section({ title, children }: SectionProps) {
  const colors = useColors();

  return (
    <View style={{ marginTop: 24 }}>
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 13,
          fontWeight: "600",
          marginBottom: 8,
          marginHorizontal: 20,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {title}
      </Text>
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: 16,
          marginHorizontal: 16,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
        }}
      >
        {children}
      </View>
    </View>
  );
}

function Divider() {
  const colors = useColors();
  return (
    <View
      style={{
        height: 1,
        backgroundColor: colors.borderLight,
        marginLeft: 64,
      }}
    />
  );
}

function SliderSetting({
  title,
  subtitle,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onValueChange,
  rightElement,
}: SliderSettingProps) {
  const colors = useColors();

  return (
    <View style={{ paddingVertical: 14, paddingHorizontal: 16 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "500" }}>
            {title}
          </Text>
          {subtitle && (
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 13,
                marginTop: 2,
              }}
            >
              {subtitle}
            </Text>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              backgroundColor: colors.primary + "20",
              paddingHorizontal: 12,
              paddingVertical: 4,
              borderRadius: 8,
            }}
          >
            <Text
              style={{
                color: colors.primary,
                fontSize: 14,
                fontWeight: "600",
              }}
            >
              {value}
              {unit}
            </Text>
          </View>
          {rightElement}
        </View>
      </View>
      <Slider
        style={{ marginTop: 8, height: 40 }}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        onValueChange={onValueChange}
        minimumTrackTintColor={colors.primary}
        maximumTrackTintColor={colors.surfaceVariant}
        thumbTintColor={colors.primary}
      />
    </View>
  );
}

function PickerModal<T extends string | number>({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
}: PickerModalProps<T>) {
  const colors = useColors();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.overlay,
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: colors.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingBottom: Platform.OS === "ios" ? 34 : 24,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 20,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text
              style={{ color: colors.text, fontSize: 18, fontWeight: "600" }}
            >
              {title}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 400 }}>
            {options.map((option, index) => (
              <TouchableOpacity
                key={String(option.value)}
                onPress={() => {
                  haptics.selection();
                  onSelect(option.value);
                  onClose();
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 16,
                  paddingHorizontal: 20,
                  borderBottomWidth: index < options.length - 1 ? 1 : 0,
                  borderBottomColor: colors.borderLight,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 16,
                      fontWeight: value === option.value ? "600" : "400",
                    }}
                  >
                    {option.label}
                  </Text>
                  {option.description && (
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontSize: 13,
                        marginTop: 2,
                      }}
                    >
                      {option.description}
                    </Text>
                  )}
                </View>
                {value === option.value && (
                  <Ionicons
                    name="checkmark-circle"
                    size={24}
                    color={colors.primary}
                  />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// =============================================================================
// PICKER OPTIONS
// =============================================================================

const schedulerOptions: PickerOption<SchedulerType>[] = [
  {
    label: "FSRS",
    value: "fsrs",
    description: "Free Spaced Repetition Scheduler - Most accurate",
  },
  {
    label: "SM-2",
    value: "sm2",
    description: "SuperMemo 2 - Classic algorithm",
  },
  {
    label: "HLR",
    value: "hlr",
    description: "Half-Life Regression - Duolingo's algorithm",
  },
];

const themeOptions: PickerOption<ThemeMode>[] = [
  { label: "Light", value: "light", description: "Always use light theme" },
  { label: "Dark", value: "dark", description: "Always use dark theme" },
  { label: "System", value: "system", description: "Follow system settings" },
];

const fontSizeOptions: PickerOption<FontSize>[] = [
  { label: "Small", value: "small" },
  { label: "Medium", value: "medium" },
  { label: "Large", value: "large" },
  { label: "Extra Large", value: "xlarge" },
];

const cardAnimationOptions: PickerOption<CardAnimation>[] = [
  { label: "Flip", value: "flip", description: "3D card flip effect" },
  { label: "Slide", value: "slide", description: "Slide to reveal" },
  { label: "Fade", value: "fade", description: "Fade transition" },
  { label: "None", value: "none", description: "Instant reveal" },
];

const reviewOrderOptions: PickerOption<ReviewOrder>[] = [
  {
    label: "Due Date",
    value: "due_date",
    description: "Most overdue cards first",
  },
  { label: "Random", value: "random", description: "Shuffle all due cards" },
  {
    label: "Difficulty",
    value: "difficulty",
    description: "Hardest cards first",
  },
  {
    label: "Deck Order",
    value: "deck_order",
    description: "Follow deck organization",
  },
];

const syncFrequencyOptions: PickerOption<
  "realtime" | "hourly" | "daily" | "manual"
>[] = [
  {
    label: "Real-time",
    value: "realtime",
    description: "Sync immediately after changes",
  },
  { label: "Hourly", value: "hourly", description: "Sync every hour" },
  { label: "Daily", value: "daily", description: "Sync once a day" },
  { label: "Manual", value: "manual", description: "Only when you choose" },
];

const emailDigestOptions: PickerOption<
  "daily" | "weekly" | "monthly" | "never"
>[] = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Never", value: "never" },
];

const leechActionOptions: PickerOption<"tag" | "suspend">[] = [
  { label: "Tag Only", value: "tag", description: "Mark card as leech" },
  {
    label: "Suspend",
    value: "suspend",
    description: "Suspend card from reviews",
  },
];

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function SettingsScreen() {
  const colors = useColors();
  const { setTheme } = useTheme();

  // Store access
  const studySettings = useStudySettings();
  const displaySettings = useDisplaySettings();
  const audioSettings = useAudioSettings();
  const notificationSettings = useNotificationSettings();
  const privacySettings = usePrivacySettings();
  const syncSettings = useSyncSettings();
  const accessibilitySettings = useAccessibilitySettings();
  const advancedSettings = useAdvancedSettings();

  const {
    updateStudySettings,
    updateDisplaySettings,
    updateAudioSettings,
    updateNotificationSettings,
    updatePrivacySettings,
    updateSyncSettings,
    updateAccessibilitySettings,
    updateAdvancedSettings,
    resetToDefaults,
    exportSettings,
  } = useSettingsStore();

  // Modal states
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Handlers
  const handleResetSettings = useCallback(() => {
    Alert.alert(
      "Reset All Settings",
      "This will reset all settings to their default values. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => {
            resetToDefaults();
            haptics.warning();
          },
        },
      ],
    );
  }, [resetToDefaults]);

  const handleExportSettings = useCallback(() => {
    const settingsJson = exportSettings();
    // In a real app, you'd copy to clipboard or share
    Alert.alert(
      "Settings Exported",
      `Settings exported (${settingsJson.length} characters). Copy functionality coming soon.`,
    );
  }, [exportSettings]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Settings",
          headerShown: true,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />

      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.background }}
        edges={["bottom"]}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ============================================================= */}
          {/* SETTINGS HISTORY & LKGC */}
          {/* ============================================================= */}
          <View style={{ marginHorizontal: 16, marginTop: 16 }}>
            <HistoryButton />
            <LKGCSection />
          </View>

          {/* ============================================================= */}
          {/* STUDY SETTINGS */}
          {/* ============================================================= */}
          <Section title="Study Goals">
            <SliderSetting
              title="Daily Card Goal"
              subtitle={STUDY_METADATA.dailyGoal.explanation.summary}
              value={studySettings.dailyGoal}
              min={10}
              max={500}
              step={10}
              unit=" cards"
              onValueChange={(v) => updateStudySettings({ dailyGoal: v })}
              rightElement={
                <SettingInfo
                  explanation={STUDY_METADATA.dailyGoal.explanation}
                />
              }
            />
            <Divider />
            <SliderSetting
              title="New Cards Per Day"
              subtitle={STUDY_METADATA.newCardsPerDay.explanation.summary}
              value={studySettings.newCardsPerDay}
              min={0}
              max={100}
              step={5}
              unit=" cards"
              onValueChange={(v) => updateStudySettings({ newCardsPerDay: v })}
              rightElement={
                <SettingInfo
                  explanation={STUDY_METADATA.newCardsPerDay.explanation}
                />
              }
            />
            <Divider />
            <SliderSetting
              title="Max Reviews Per Day"
              subtitle={STUDY_METADATA.maxReviewsPerDay.explanation.summary}
              value={studySettings.maxReviewsPerDay}
              min={50}
              max={500}
              step={25}
              unit=" cards"
              onValueChange={(v) =>
                updateStudySettings({ maxReviewsPerDay: v })
              }
              rightElement={
                <SettingInfo
                  explanation={STUDY_METADATA.maxReviewsPerDay.explanation}
                />
              }
            />
            <Divider />
            <SliderSetting
              title="Session Duration"
              subtitle={STUDY_METADATA.sessionDuration.explanation.summary}
              value={studySettings.sessionDuration}
              min={5}
              max={120}
              step={5}
              unit=" min"
              onValueChange={(v) => updateStudySettings({ sessionDuration: v })}
              rightElement={
                <SettingInfo
                  explanation={STUDY_METADATA.sessionDuration.explanation}
                />
              }
            />
          </Section>

          <Section title="Review Behavior">
            <SettingItem
              icon="swap-vertical"
              title="Review Order"
              subtitle={
                reviewOrderOptions.find(
                  (o) => o.value === studySettings.reviewOrder,
                )?.label
              }
              onPress={() => setActiveModal("reviewOrder")}
              rightElement={
                <SettingInfo
                  explanation={STUDY_METADATA.reviewOrder.explanation}
                />
              }
            />
            <Divider />
            <SettingItem
              icon="shuffle"
              title="Mix New and Review Cards"
              subtitle={STUDY_METADATA.mixNewAndReview.explanation.summary}
              rightElement={
                <>
                  <Switch
                    value={studySettings.mixNewAndReview}
                    onValueChange={(v) =>
                      updateStudySettings({ mixNewAndReview: v })
                    }
                    trackColor={{
                      false: colors.surfaceVariant,
                      true: colors.primaryLight,
                    }}
                    thumbColor={
                      studySettings.mixNewAndReview
                        ? colors.primary
                        : colors.textMuted
                    }
                  />
                  <SettingInfo
                    explanation={STUDY_METADATA.mixNewAndReview.explanation}
                  />
                </>
              }
            />
            <Divider />
            <SettingItem
              icon="timer"
              title="Show Session Timer"
              subtitle={STUDY_METADATA.enableSessionTimer.explanation.summary}
              rightElement={
                <>
                  <Switch
                    value={studySettings.enableSessionTimer}
                    onValueChange={(v) =>
                      updateStudySettings({ enableSessionTimer: v })
                    }
                    trackColor={{
                      false: colors.surfaceVariant,
                      true: colors.primaryLight,
                    }}
                    thumbColor={
                      studySettings.enableSessionTimer
                        ? colors.primary
                        : colors.textMuted
                    }
                  />
                  <SettingInfo
                    explanation={STUDY_METADATA.enableSessionTimer.explanation}
                  />
                </>
              }
            />
            <Divider />
            <SettingItem
              icon="bar-chart"
              title="Show Session Progress"
              subtitle={STUDY_METADATA.showSessionProgress.explanation.summary}
              rightElement={
                <>
                  <Switch
                    value={studySettings.showSessionProgress}
                    onValueChange={(v) =>
                      updateStudySettings({ showSessionProgress: v })
                    }
                    trackColor={{
                      false: colors.surfaceVariant,
                      true: colors.primaryLight,
                    }}
                    thumbColor={
                      studySettings.showSessionProgress
                        ? colors.primary
                        : colors.textMuted
                    }
                  />
                  <SettingInfo
                    explanation={STUDY_METADATA.showSessionProgress.explanation}
                  />
                </>
              }
            />
          </Section>

          <Section title="Scheduling Algorithm">
            <SettingItem
              icon="speedometer"
              iconColor={colors.warning}
              title="Scheduler"
              subtitle={
                schedulerOptions.find(
                  (o) => o.value === studySettings.schedulerType,
                )?.label
              }
              onPress={() => setActiveModal("scheduler")}
            />
            <Divider />
            <SliderSetting
              title="Target Retention"
              subtitle="Desired probability of remembering cards"
              value={Math.round(
                studySettings.fsrsParameters.requestRetention * 100,
              )}
              min={70}
              max={99}
              step={1}
              unit="%"
              onValueChange={(v) =>
                updateStudySettings({
                  fsrsParameters: {
                    ...studySettings.fsrsParameters,
                    requestRetention: v / 100,
                  },
                })
              }
            />
            <Divider />
            <SettingItem
              icon="dice"
              title="Enable Interval Fuzz"
              subtitle="Add small randomness to prevent bunching"
              rightElement={
                <Switch
                  value={studySettings.enableFuzz}
                  onValueChange={(v) => updateStudySettings({ enableFuzz: v })}
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    studySettings.enableFuzz ? colors.primary : colors.textMuted
                  }
                />
              }
            />
          </Section>

          <Section title="Learning Steps">
            <SliderSetting
              title="Graduating Interval"
              subtitle="Days until card graduates to review"
              value={studySettings.graduatingInterval}
              min={1}
              max={14}
              step={1}
              unit=" days"
              onValueChange={(v) =>
                updateStudySettings({ graduatingInterval: v })
              }
            />
            <Divider />
            <SliderSetting
              title="Easy Interval"
              subtitle="Days when rating Easy on new card"
              value={studySettings.easyInterval}
              min={1}
              max={30}
              step={1}
              unit=" days"
              onValueChange={(v) => updateStudySettings({ easyInterval: v })}
            />
          </Section>

          <Section title="Lapses">
            <SliderSetting
              title="Leech Threshold"
              subtitle="Lapses before marking card as leech"
              value={studySettings.leechThreshold}
              min={3}
              max={20}
              step={1}
              unit=" lapses"
              onValueChange={(v) => updateStudySettings({ leechThreshold: v })}
            />
            <Divider />
            <SettingItem
              icon="warning"
              iconColor={colors.warning}
              title="Leech Action"
              subtitle={
                leechActionOptions.find(
                  (o) => o.value === studySettings.leechAction,
                )?.label
              }
              onPress={() => setActiveModal("leechAction")}
            />
            <Divider />
            <SliderSetting
              title="Minimum Interval"
              subtitle="Minimum days after lapse"
              value={studySettings.minimumInterval}
              min={1}
              max={7}
              step={1}
              unit=" days"
              onValueChange={(v) => updateStudySettings({ minimumInterval: v })}
            />
          </Section>

          {/* ============================================================= */}
          {/* DISPLAY SETTINGS */}
          {/* ============================================================= */}
          <Section title="Appearance">
            <SettingItem
              icon="moon"
              iconColor={colors.accent}
              title="Theme"
              subtitle={
                themeOptions.find((o) => o.value === displaySettings.theme)
                  ?.label
              }
              onPress={() => setActiveModal("theme")}
            />
            <Divider />
            <SettingItem
              icon="text"
              title="Font Size"
              subtitle={
                fontSizeOptions.find(
                  (o) => o.value === displaySettings.fontSize,
                )?.label
              }
              onPress={() => setActiveModal("fontSize")}
            />
            <Divider />
            <SettingItem
              icon="sparkles"
              title="Animations"
              subtitle="Enable UI animations"
              rightElement={
                <Switch
                  value={displaySettings.animationsEnabled}
                  onValueChange={(v) =>
                    updateDisplaySettings({ animationsEnabled: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    displaySettings.animationsEnabled
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
            <Divider />
            <SettingItem
              icon="albums"
              title="Card Animation"
              subtitle={
                cardAnimationOptions.find(
                  (o) => o.value === displaySettings.cardAnimation,
                )?.label
              }
              onPress={() => setActiveModal("cardAnimation")}
            />
          </Section>

          <Section title="Card Display">
            <SettingItem
              icon="pricetags"
              title="Show Card Tags"
              subtitle="Display tags on card view"
              rightElement={
                <Switch
                  value={displaySettings.showCardTags}
                  onValueChange={(v) =>
                    updateDisplaySettings({ showCardTags: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    displaySettings.showCardTags
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
            <Divider />
            <SettingItem
              icon="folder"
              title="Show Deck Name"
              subtitle="Display deck name during study"
              rightElement={
                <Switch
                  value={displaySettings.showDeckName}
                  onValueChange={(v) =>
                    updateDisplaySettings({ showDeckName: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    displaySettings.showDeckName
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
            <Divider />
            <SettingItem
              icon="time"
              title="Show Button Times"
              subtitle='Display intervals like "10m", "1d" on buttons'
              rightElement={
                <Switch
                  value={displaySettings.showButtonTimes}
                  onValueChange={(v) =>
                    updateDisplaySettings({ showButtonTimes: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    displaySettings.showButtonTimes
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
            <Divider />
            <SettingItem
              icon="list"
              title="Show Remaining Count"
              subtitle="Display cards remaining in session"
              rightElement={
                <Switch
                  value={displaySettings.showRemainingCount}
                  onValueChange={(v) =>
                    updateDisplaySettings({ showRemainingCount: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    displaySettings.showRemainingCount
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
          </Section>

          {/* ============================================================= */}
          {/* AUDIO SETTINGS */}
          {/* ============================================================= */}
          <Section title="Sound & Haptics">
            <SettingItem
              icon="volume-high"
              title="Sound Effects"
              subtitle="Play sounds on actions"
              rightElement={
                <>
                  <Switch
                    value={audioSettings.soundEnabled}
                    onValueChange={(v) =>
                      updateAudioSettings({ soundEnabled: v })
                    }
                    trackColor={{
                      false: colors.surfaceVariant,
                      true: colors.primaryLight,
                    }}
                    thumbColor={
                      audioSettings.soundEnabled
                        ? colors.primary
                        : colors.textMuted
                    }
                  />
                  <SettingInfo
                    explanation={{
                      summary:
                        "Enable or disable sound effects for app interactions.",
                      detailed:
                        "When enabled, the app will play sound effects for actions like button presses and card flips.",
                      impact: "Provides audio feedback during interactions.",
                    }}
                  />
                </>
              }
            />
            {audioSettings.soundEnabled && (
              <>
                <Divider />
                <SliderSetting
                  title="Sound Volume"
                  value={audioSettings.soundVolume}
                  min={0}
                  max={100}
                  step={5}
                  unit="%"
                  onValueChange={(v) => updateAudioSettings({ soundVolume: v })}
                />
              </>
            )}
            <Divider />
            <SettingItem
              icon="phone-portrait"
              title="Haptic Feedback"
              subtitle="Vibration on interactions"
              rightElement={
                <Switch
                  value={audioSettings.hapticsEnabled}
                  onValueChange={(v) =>
                    updateAudioSettings({ hapticsEnabled: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    audioSettings.hapticsEnabled
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
          </Section>

          <Section title="Text-to-Speech">
            <SettingItem
              icon="mic"
              title="Enable TTS"
              subtitle="Read card content aloud"
              rightElement={
                <Switch
                  value={audioSettings.ttsEnabled}
                  onValueChange={(v) => updateAudioSettings({ ttsEnabled: v })}
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    audioSettings.ttsEnabled ? colors.primary : colors.textMuted
                  }
                />
              }
            />
            {audioSettings.ttsEnabled && (
              <>
                <Divider />
                <SettingItem
                  icon="play"
                  title="Auto-play TTS"
                  subtitle="Automatically read cards"
                  rightElement={
                    <Switch
                      value={audioSettings.ttsAutoplay}
                      onValueChange={(v) =>
                        updateAudioSettings({ ttsAutoplay: v })
                      }
                      trackColor={{
                        false: colors.surfaceVariant,
                        true: colors.primaryLight,
                      }}
                      thumbColor={
                        audioSettings.ttsAutoplay
                          ? colors.primary
                          : colors.textMuted
                      }
                    />
                  }
                />
                <Divider />
                <SliderSetting
                  title="Speech Rate"
                  value={audioSettings.ttsSpeed}
                  min={0.5}
                  max={2}
                  step={0.1}
                  unit="x"
                  onValueChange={(v) => updateAudioSettings({ ttsSpeed: v })}
                />
              </>
            )}
          </Section>

          {/* ============================================================= */}
          {/* NOTIFICATION SETTINGS */}
          {/* ============================================================= */}
          <Section title="Notifications">
            <SettingItem
              icon="notifications"
              title="Push Notifications"
              subtitle="Receive notifications on this device"
              rightElement={
                <Switch
                  value={notificationSettings.pushEnabled}
                  onValueChange={(v) =>
                    updateNotificationSettings({ pushEnabled: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    notificationSettings.pushEnabled
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
            <Divider />
            <SettingItem
              icon="alarm"
              title="Daily Study Reminder"
              subtitle={
                notificationSettings.dailyReminderEnabled
                  ? `Daily at ${notificationSettings.dailyReminderTime}`
                  : "Disabled"
              }
              rightElement={
                <Switch
                  value={notificationSettings.dailyReminderEnabled}
                  onValueChange={(v) =>
                    updateNotificationSettings({ dailyReminderEnabled: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    notificationSettings.dailyReminderEnabled
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
            <Divider />
            <SettingItem
              icon="flame"
              iconColor={colors.warning}
              title="Streak Reminder"
              subtitle={
                notificationSettings.streakReminderEnabled
                  ? `Daily at ${notificationSettings.streakReminderTime}`
                  : "Disabled"
              }
              rightElement={
                <Switch
                  value={notificationSettings.streakReminderEnabled}
                  onValueChange={(v) =>
                    updateNotificationSettings({ streakReminderEnabled: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    notificationSettings.streakReminderEnabled
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
            <Divider />
            <SettingItem
              icon="trophy"
              iconColor={colors.xpGold}
              title="Achievement Notifications"
              subtitle="Notify when earning achievements"
              rightElement={
                <Switch
                  value={notificationSettings.achievementNotifications}
                  onValueChange={(v) =>
                    updateNotificationSettings({ achievementNotifications: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    notificationSettings.achievementNotifications
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
          </Section>

          <Section title="Email">
            <SettingItem
              icon="mail"
              title="Email Notifications"
              subtitle="Receive emails about your progress"
              rightElement={
                <Switch
                  value={notificationSettings.emailEnabled}
                  onValueChange={(v) =>
                    updateNotificationSettings({ emailEnabled: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    notificationSettings.emailEnabled
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
            {notificationSettings.emailEnabled && (
              <>
                <Divider />
                <SettingItem
                  icon="calendar"
                  title="Email Digest"
                  subtitle={
                    emailDigestOptions.find(
                      (o) =>
                        o.value === notificationSettings.emailDigestFrequency,
                    )?.label
                  }
                  onPress={() => setActiveModal("emailDigest")}
                />
              </>
            )}
          </Section>

          {/* ============================================================= */}
          {/* SYNC SETTINGS */}
          {/* ============================================================= */}
          <Section title="Sync & Backup">
            <SettingItem
              icon="cloud-upload"
              title="Auto Sync"
              subtitle="Automatically sync your data"
              rightElement={
                <Switch
                  value={syncSettings.autoSyncEnabled}
                  onValueChange={(v) =>
                    updateSyncSettings({ autoSyncEnabled: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    syncSettings.autoSyncEnabled
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
            {syncSettings.autoSyncEnabled && (
              <>
                <Divider />
                <SettingItem
                  icon="sync"
                  title="Sync Frequency"
                  subtitle={
                    syncFrequencyOptions.find(
                      (o) => o.value === syncSettings.syncFrequency,
                    )?.label
                  }
                  onPress={() => setActiveModal("syncFrequency")}
                />
                <Divider />
                <SettingItem
                  icon="wifi"
                  title="WiFi Only"
                  subtitle="Only sync when connected to WiFi"
                  rightElement={
                    <Switch
                      value={syncSettings.syncOnWifiOnly}
                      onValueChange={(v) =>
                        updateSyncSettings({ syncOnWifiOnly: v })
                      }
                      trackColor={{
                        false: colors.surfaceVariant,
                        true: colors.primaryLight,
                      }}
                      thumbColor={
                        syncSettings.syncOnWifiOnly
                          ? colors.primary
                          : colors.textMuted
                      }
                    />
                  }
                />
              </>
            )}
            <Divider />
            <SettingItem
              icon="airplane"
              title="Offline Mode"
              subtitle="Continue studying without internet"
              rightElement={
                <Switch
                  value={syncSettings.offlineModeEnabled}
                  onValueChange={(v) =>
                    updateSyncSettings({ offlineModeEnabled: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    syncSettings.offlineModeEnabled
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
            {syncSettings.offlineModeEnabled && (
              <>
                <Divider />
                <SettingItem
                  icon="download"
                  title="Download Media for Offline"
                  subtitle="Pre-download images and audio"
                  rightElement={
                    <Switch
                      value={syncSettings.downloadMediaForOffline}
                      onValueChange={(v) =>
                        updateSyncSettings({ downloadMediaForOffline: v })
                      }
                      trackColor={{
                        false: colors.surfaceVariant,
                        true: colors.primaryLight,
                      }}
                      thumbColor={
                        syncSettings.downloadMediaForOffline
                          ? colors.primary
                          : colors.textMuted
                      }
                    />
                  }
                />
              </>
            )}
          </Section>

          {/* ============================================================= */}
          {/* PRIVACY SETTINGS */}
          {/* ============================================================= */}
          <Section title="Privacy">
            <SettingItem
              icon="analytics"
              title="Usage Analytics"
              subtitle="Help improve the app with anonymous data"
              rightElement={
                <Switch
                  value={privacySettings.analyticsEnabled}
                  onValueChange={(v) =>
                    updatePrivacySettings({ analyticsEnabled: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    privacySettings.analyticsEnabled
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
            <Divider />
            <SettingItem
              icon="bug"
              title="Crash Reporting"
              subtitle="Send crash reports to help fix bugs"
              rightElement={
                <Switch
                  value={privacySettings.crashReportingEnabled}
                  onValueChange={(v) =>
                    updatePrivacySettings({ crashReportingEnabled: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    privacySettings.crashReportingEnabled
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
          </Section>

          <Section title="Social & Leaderboard">
            <SettingItem
              icon="people"
              title="Public Profile"
              subtitle="Allow others to view your profile"
              rightElement={
                <Switch
                  value={privacySettings.profilePublic}
                  onValueChange={(v) =>
                    updatePrivacySettings({ profilePublic: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    privacySettings.profilePublic
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
            <Divider />
            <SettingItem
              icon="podium"
              title="Show on Leaderboard"
              subtitle="Appear in public rankings"
              rightElement={
                <Switch
                  value={privacySettings.showOnLeaderboard}
                  onValueChange={(v) =>
                    updatePrivacySettings({ showOnLeaderboard: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    privacySettings.showOnLeaderboard
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
            <Divider />
            <SettingItem
              icon="flame"
              iconColor={colors.warning}
              title="Show Streak Publicly"
              subtitle="Display your streak on profile"
              rightElement={
                <Switch
                  value={privacySettings.showStreak}
                  onValueChange={(v) =>
                    updatePrivacySettings({ showStreak: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    privacySettings.showStreak
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
          </Section>

          {/* ============================================================= */}
          {/* ACCESSIBILITY SETTINGS */}
          {/* ============================================================= */}
          <Section title="Accessibility">
            <SettingItem
              icon="contrast"
              title="High Contrast"
              subtitle="Increase visual contrast"
              rightElement={
                <Switch
                  value={accessibilitySettings.highContrast}
                  onValueChange={(v) =>
                    updateAccessibilitySettings({ highContrast: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    accessibilitySettings.highContrast
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
            <Divider />
            <SettingItem
              icon="text"
              title="Large Text"
              subtitle="Increase text size throughout app"
              rightElement={
                <Switch
                  value={accessibilitySettings.largeText}
                  onValueChange={(v) =>
                    updateAccessibilitySettings({ largeText: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    accessibilitySettings.largeText
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
            <Divider />
            <SettingItem
              icon="remove-circle"
              title="Reduce Motion"
              subtitle="Minimize animations and movement"
              rightElement={
                <Switch
                  value={accessibilitySettings.reduceMotion}
                  onValueChange={(v) =>
                    updateAccessibilitySettings({ reduceMotion: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    accessibilitySettings.reduceMotion
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
          </Section>

          <Section title="Interaction">
            <SettingItem
              icon="hand-left"
              title="Tap to Flip"
              subtitle="Tap card to reveal answer"
              rightElement={
                <Switch
                  value={accessibilitySettings.tapToFlip}
                  onValueChange={(v) =>
                    updateAccessibilitySettings({ tapToFlip: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    accessibilitySettings.tapToFlip
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
            <Divider />
            <SettingItem
              icon="swap-horizontal"
              title="Swipe to Rate"
              subtitle="Swipe gestures for rating cards"
              rightElement={
                <Switch
                  value={accessibilitySettings.swipeToRate}
                  onValueChange={(v) =>
                    updateAccessibilitySettings({ swipeToRate: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    accessibilitySettings.swipeToRate
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
            <Divider />
            <SliderSetting
              title="Long Press Delay"
              subtitle="Time to trigger long press actions"
              value={accessibilitySettings.longPressDelay}
              min={200}
              max={1000}
              step={100}
              unit="ms"
              onValueChange={(v) =>
                updateAccessibilitySettings({ longPressDelay: v })
              }
            />
          </Section>

          {/* ============================================================= */}
          {/* ADVANCED SETTINGS */}
          {/* ============================================================= */}
          <Section title="Advanced">
            <SettingItem
              icon="flask"
              iconColor={colors.accent}
              title="Experimental Features"
              subtitle="Try new features before they're ready"
              rightElement={
                <Switch
                  value={advancedSettings.experimentalFeatures}
                  onValueChange={(v) =>
                    updateAdvancedSettings({ experimentalFeatures: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    advancedSettings.experimentalFeatures
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
            <Divider />
            <SettingItem
              icon="code-slash"
              title="Debug Mode"
              subtitle="Show technical information"
              rightElement={
                <Switch
                  value={advancedSettings.debugMode}
                  onValueChange={(v) =>
                    updateAdvancedSettings({ debugMode: v })
                  }
                  trackColor={{
                    false: colors.surfaceVariant,
                    true: colors.primaryLight,
                  }}
                  thumbColor={
                    advancedSettings.debugMode
                      ? colors.primary
                      : colors.textMuted
                  }
                />
              }
            />
            {advancedSettings.debugMode && (
              <>
                <Divider />
                <SettingItem
                  icon="finger-print"
                  title="Show Card IDs"
                  subtitle="Display internal card identifiers"
                  rightElement={
                    <Switch
                      value={advancedSettings.showCardIds}
                      onValueChange={(v) =>
                        updateAdvancedSettings({ showCardIds: v })
                      }
                      trackColor={{
                        false: colors.surfaceVariant,
                        true: colors.primaryLight,
                      }}
                      thumbColor={
                        advancedSettings.showCardIds
                          ? colors.primary
                          : colors.textMuted
                      }
                    />
                  }
                />
                <Divider />
                <SettingItem
                  icon="document-text"
                  title="Log Reviews"
                  subtitle="Save detailed review logs"
                  rightElement={
                    <Switch
                      value={advancedSettings.logReviews}
                      onValueChange={(v) =>
                        updateAdvancedSettings({ logReviews: v })
                      }
                      trackColor={{
                        false: colors.surfaceVariant,
                        true: colors.primaryLight,
                      }}
                      thumbColor={
                        advancedSettings.logReviews
                          ? colors.primary
                          : colors.textMuted
                      }
                    />
                  }
                />
              </>
            )}
          </Section>

          <Section title="Data Management">
            <SliderSetting
              title="Cache Size"
              subtitle="Maximum storage for cached data"
              value={advancedSettings.cacheSize}
              min={50}
              max={500}
              step={50}
              unit=" MB"
              onValueChange={(v) => updateAdvancedSettings({ cacheSize: v })}
            />
            <Divider />
            <SettingItem
              icon="trash-bin"
              title="Clear Cache"
              subtitle="Free up storage space"
              onPress={() =>
                Alert.alert("Clear Cache", "Cache cleared successfully!")
              }
            />
            <Divider />
            <SettingItem
              icon="download"
              title="Export Settings"
              subtitle="Save your settings to a file"
              onPress={handleExportSettings}
            />
          </Section>

          {/* ============================================================= */}
          {/* DANGER ZONE */}
          {/* ============================================================= */}
          <Section title="Reset">
            <SettingItem
              icon="refresh"
              iconColor={colors.warning}
              title="Reset All Settings"
              subtitle="Restore all settings to defaults"
              onPress={handleResetSettings}
              danger
            />
          </Section>

          {/* Version Info */}
          <Text
            style={{
              color: colors.textMuted,
              textAlign: "center",
              marginTop: 24,
              fontSize: 12,
            }}
          >
            Manthanein v1.0.0 • Build 1
          </Text>
        </ScrollView>

        {/* ============================================================= */}
        {/* MODALS */}
        {/* ============================================================= */}
        <PickerModal
          visible={activeModal === "scheduler"}
          title="Select Scheduler"
          options={schedulerOptions}
          value={studySettings.schedulerType}
          onSelect={(v) => updateStudySettings({ schedulerType: v })}
          onClose={() => setActiveModal(null)}
        />

        <PickerModal
          visible={activeModal === "theme"}
          title="Select Theme"
          options={themeOptions}
          value={displaySettings.theme}
          onSelect={(v) => {
            updateDisplaySettings({ theme: v });
            setTheme(v);
          }}
          onClose={() => setActiveModal(null)}
        />

        <PickerModal
          visible={activeModal === "fontSize"}
          title="Select Font Size"
          options={fontSizeOptions}
          value={displaySettings.fontSize}
          onSelect={(v) => updateDisplaySettings({ fontSize: v })}
          onClose={() => setActiveModal(null)}
        />

        <PickerModal
          visible={activeModal === "cardAnimation"}
          title="Card Animation"
          options={cardAnimationOptions}
          value={displaySettings.cardAnimation}
          onSelect={(v) => updateDisplaySettings({ cardAnimation: v })}
          onClose={() => setActiveModal(null)}
        />

        <PickerModal
          visible={activeModal === "reviewOrder"}
          title="Review Order"
          options={reviewOrderOptions}
          value={studySettings.reviewOrder}
          onSelect={(v) => updateStudySettings({ reviewOrder: v })}
          onClose={() => setActiveModal(null)}
        />

        <PickerModal
          visible={activeModal === "leechAction"}
          title="Leech Action"
          options={leechActionOptions}
          value={studySettings.leechAction}
          onSelect={(v) => updateStudySettings({ leechAction: v })}
          onClose={() => setActiveModal(null)}
        />

        <PickerModal
          visible={activeModal === "syncFrequency"}
          title="Sync Frequency"
          options={syncFrequencyOptions}
          value={syncSettings.syncFrequency}
          onSelect={(v) => updateSyncSettings({ syncFrequency: v })}
          onClose={() => setActiveModal(null)}
        />

        <PickerModal
          visible={activeModal === "emailDigest"}
          title="Email Digest Frequency"
          options={emailDigestOptions}
          value={notificationSettings.emailDigestFrequency}
          onSelect={(v) =>
            updateNotificationSettings({ emailDigestFrequency: v })
          }
          onClose={() => setActiveModal(null)}
        />
      </SafeAreaView>
    </>
  );
}
