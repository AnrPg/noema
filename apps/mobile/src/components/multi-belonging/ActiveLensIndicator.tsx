/**
 * ActiveLensIndicator Component
 *
 * Shows which category/lens context is currently active during study.
 * Provides visual feedback about the context being used for performance tracking
 * and allows switching between different category contexts for a card.
 */

import { View, Text, TouchableOpacity, StyleSheet, Modal } from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";

export interface ActiveLensIndicatorProps {
  /** Currently active category being used for context tracking */
  activeLens: { id: string; name: string; color?: string } | null;
  /** All categories this card belongs to */
  availableLenses?: { id: string; name: string; color?: string }[];
  /** Called when user changes the active lens */
  onLensChange?: (lensId: string | null) => void;
  /** Size variant of the indicator */
  size?: "compact" | "normal";
  /** Whether the lens can be changed */
  editable?: boolean;
}

export function ActiveLensIndicator({
  activeLens,
  availableLenses = [],
  onLensChange,
  size = "compact",
  editable = true,
}: ActiveLensIndicatorProps) {
  const colors = useColors();
  const [showPicker, setShowPicker] = useState(false);

  const isCompact = size === "compact";
  const hasMultipleLenses = availableLenses.length > 1;

  // No lens context - card is being studied globally
  if (!activeLens) {
    return (
      <TouchableOpacity
        style={[
          styles.container,
          isCompact && styles.containerCompact,
          { backgroundColor: colors.surfaceVariant },
        ]}
        onPress={
          editable && hasMultipleLenses ? () => setShowPicker(true) : undefined
        }
        disabled={!editable || !hasMultipleLenses}
      >
        <Ionicons
          name="globe-outline"
          size={isCompact ? 14 : 16}
          color={colors.textSecondary}
        />
        <Text
          style={[
            styles.label,
            isCompact && styles.labelCompact,
            { color: colors.textSecondary },
          ]}
        >
          Global
        </Text>
        {editable && hasMultipleLenses && (
          <Ionicons
            name="chevron-down"
            size={12}
            color={colors.textSecondary}
          />
        )}
      </TouchableOpacity>
    );
  }

  const lensColor = activeLens.color || colors.primary;

  return (
    <>
      <TouchableOpacity
        style={[
          styles.container,
          isCompact && styles.containerCompact,
          { backgroundColor: lensColor + "20", borderColor: lensColor + "40" },
        ]}
        onPress={
          editable && hasMultipleLenses ? () => setShowPicker(true) : undefined
        }
        disabled={!editable || !hasMultipleLenses}
      >
        <Ionicons
          name="layers-outline"
          size={isCompact ? 14 : 16}
          color={lensColor}
        />
        <Text
          style={[
            styles.label,
            isCompact && styles.labelCompact,
            { color: lensColor },
          ]}
          numberOfLines={1}
        >
          {activeLens.name}
        </Text>
        {editable && hasMultipleLenses && (
          <Ionicons name="chevron-down" size={12} color={lensColor} />
        )}
      </TouchableOpacity>

      {/* Lens picker modal */}
      <Modal
        visible={showPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPicker(false)}
        >
          <View
            style={[
              styles.pickerContainer,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.pickerTitle, { color: colors.text }]}>
              Study Context
            </Text>
            <Text
              style={[styles.pickerSubtitle, { color: colors.textSecondary }]}
            >
              Select which category&apos;s performance to track
            </Text>

            {/* Global option */}
            <TouchableOpacity
              style={[
                styles.lensOption,
                !activeLens && styles.lensOptionActive,
                {
                  backgroundColor: !activeLens
                    ? colors.primary + "10"
                    : "transparent",
                  borderColor: !activeLens ? colors.primary : colors.border,
                },
              ]}
              onPress={() => {
                onLensChange?.(null);
                setShowPicker(false);
              }}
            >
              <Ionicons
                name="globe-outline"
                size={20}
                color={!activeLens ? colors.primary : colors.textSecondary}
              />
              <View style={styles.lensOptionText}>
                <Text
                  style={[
                    styles.lensOptionName,
                    {
                      color: !activeLens ? colors.primary : colors.text,
                    },
                  ]}
                >
                  Global Context
                </Text>
                <Text
                  style={[
                    styles.lensOptionDesc,
                    { color: colors.textSecondary },
                  ]}
                >
                  Track overall card performance
                </Text>
              </View>
              {!activeLens && (
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={colors.primary}
                />
              )}
            </TouchableOpacity>

            {/* Category options */}
            {availableLenses.map((lens) => {
              const isActive = activeLens?.id === lens.id;
              const color = lens.color || colors.primary;
              return (
                <TouchableOpacity
                  key={lens.id}
                  style={[
                    styles.lensOption,
                    isActive && styles.lensOptionActive,
                    {
                      backgroundColor: isActive ? color + "10" : "transparent",
                      borderColor: isActive ? color : colors.border,
                    },
                  ]}
                  onPress={() => {
                    onLensChange?.(lens.id);
                    setShowPicker(false);
                  }}
                >
                  <View
                    style={[styles.lensColorDot, { backgroundColor: color }]}
                  />
                  <View style={styles.lensOptionText}>
                    <Text
                      style={[
                        styles.lensOptionName,
                        { color: isActive ? color : colors.text },
                      ]}
                    >
                      {lens.name}
                    </Text>
                    <Text
                      style={[
                        styles.lensOptionDesc,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Track performance in this context
                    </Text>
                  </View>
                  {isActive && (
                    <Ionicons name="checkmark-circle" size={20} color={color} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  containerCompact: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    maxWidth: 100,
  },
  labelCompact: {
    fontSize: 11,
    maxWidth: 80,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  pickerContainer: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  pickerSubtitle: {
    fontSize: 13,
    marginBottom: 16,
  },
  lensOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  lensOptionActive: {
    borderWidth: 2,
  },
  lensColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  lensOptionText: {
    flex: 1,
  },
  lensOptionName: {
    fontSize: 15,
    fontWeight: "600",
  },
  lensOptionDesc: {
    fontSize: 12,
    marginTop: 2,
  },
});
