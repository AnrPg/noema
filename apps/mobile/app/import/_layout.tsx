// =============================================================================
// IMPORT WIZARD - LAYOUT
// =============================================================================

import { Stack } from "expo-router";
import { useColors } from "@/theme/ThemeProvider";

export default function ImportLayout() {
  const colors = useColors();

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.card,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: "600",
        },
        contentStyle: {
          backgroundColor: colors.background,
        },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Import Cards",
          presentation: "modal",
        }}
      />
    </Stack>
  );
}
