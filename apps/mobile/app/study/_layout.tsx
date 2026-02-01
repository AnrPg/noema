import { Stack, Redirect } from "expo-router";
import { useAuthStore } from "@/stores/auth.store";

export default function StudyLayout() {
  const { isAuthenticated, isHydrated } = useAuthStore();

  // Wait for auth hydration
  if (!isHydrated) {
    return null;
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="[sessionId]" />
    </Stack>
  );
}
