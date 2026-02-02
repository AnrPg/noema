// =============================================================================
// IMPORT COMPONENTS - STEP INDICATOR
// =============================================================================

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme/ThemeProvider";

interface Step {
  label: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  const colors = useColors();

  return (
    <View style={styles.container}>
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;

        return (
          <React.Fragment key={index}>
            {/* Step circle */}
            <View style={styles.stepWrapper}>
              <View
                style={[
                  styles.stepCircle,
                  {
                    backgroundColor: isCompleted
                      ? colors.success
                      : isCurrent
                        ? colors.primary
                        : colors.surfaceVariant,
                    borderColor: isCompleted
                      ? colors.success
                      : isCurrent
                        ? colors.primary
                        : colors.border,
                  },
                ]}
              >
                {isCompleted ? (
                  <Ionicons
                    name="checkmark"
                    size={16}
                    color={colors.onPrimary}
                  />
                ) : (
                  <Text
                    style={[
                      styles.stepNumber,
                      {
                        color: isCurrent ? colors.onPrimary : colors.textMuted,
                      },
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  {
                    color: isCurrent
                      ? colors.primary
                      : isCompleted
                        ? colors.success
                        : colors.textMuted,
                    fontWeight: isCurrent ? "600" : "400",
                  },
                ]}
              >
                {step.label}
              </Text>
            </View>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <View
                style={[
                  styles.connector,
                  {
                    backgroundColor: isCompleted
                      ? colors.success
                      : colors.border,
                  },
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  stepWrapper: {
    alignItems: "center",
    minWidth: 50,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: "600",
  },
  stepLabel: {
    fontSize: 11,
    marginTop: 4,
    textAlign: "center",
  },
  connector: {
    height: 2,
    flex: 1,
    maxWidth: 30,
    marginHorizontal: 2,
    marginBottom: 18,
  },
});
