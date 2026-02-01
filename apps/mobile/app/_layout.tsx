import "react-native-gesture-handler";
import { useEffect, useState, useCallback } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LogBox, Platform, View, Text } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import * as Font from "expo-font";
import { Ionicons } from "@expo/vector-icons";

import { useAuthStore } from "@/stores/auth.store";
import { ThemeProvider } from "@/theme/ThemeProvider";
import "../global.css";

// Suppress deprecation warnings from libraries
LogBox.ignoreLogs([
  "props.pointerEvents is deprecated",
  "Animated: `useNativeDriver`",
]);

// Suppress console warnings/errors on web for known issues
if (Platform.OS === "web") {
  const originalWarn = console.warn;
  console.warn = (...args) => {
    const msg = args[0];
    if (typeof msg === "string") {
      if (msg.includes("pointerEvents is deprecated")) return;
      if (msg.includes("useNativeDriver")) return;
    }
    originalWarn.apply(console, args);
  };

  const originalError = console.error;
  console.error = (...args) => {
    const msg = args[0];
    if (typeof msg === "string") {
      if (msg.includes("pointerEvents is deprecated")) return;
      if (msg.includes("useNativeDriver")) return;
      if (msg.includes("timeout exceeded")) return; // Font loading timeout
    }
    originalError.apply(console, args);
  };

  // Suppress unhandled promise rejections for font timeouts
  window.addEventListener("unhandledrejection", (event) => {
    if (event.reason?.message?.includes("timeout exceeded")) {
      event.preventDefault();
    }
  });
}

// Keep splash screen visible while loading resources
SplashScreen.preventAutoHideAsync();

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Create React Query client with proper error handling
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 60, // 1 hour (formerly cacheTime)
      retry: (failureCount, error) => {
        // Don't retry on auth errors
        if (error instanceof Error && error.message.includes("Unauthorized")) {
          return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  const { hydrate, isHydrated } = useAuthStore();
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [fontError, setFontError] = useState(false);

  // Load fonts with timeout and fallback
  const loadFonts = useCallback(async () => {
    try {
      // Load Ionicons font with 15 second timeout (increased for slower networks)
      await Promise.race([
        Font.loadAsync({
          ...Ionicons.font,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Font loading timeout")), 15000),
        ),
      ]);
      setFontsLoaded(true);
    } catch (error) {
      console.warn("Font loading failed, using system fallbacks:", error);
      setFontError(true);
      // Continue anyway - system fonts will be used as fallback
      setFontsLoaded(true);
    }
  }, []);

  useEffect(() => {
    async function prepare() {
      try {
        console.log("Starting hydration...");
        // Load fonts and hydrate auth in parallel
        await Promise.all([loadFonts(), hydrate()]);
        console.log("Hydration complete");
      } catch (error) {
        console.error("Error during preparation:", error);
      } finally {
        // Hide splash screen
        await SplashScreen.hideAsync();
      }
    }

    prepare();
  }, [hydrate, loadFonts]);

  if (!isHydrated || !fontsLoaded) {
    // Show a simple loading view while fonts and auth hydrate
    return (
      <GestureHandlerRootView
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#1a1a2e",
        }}
      >
        <StatusBar style="light" />
        <Text style={{ color: "#666", fontSize: 14 }}>Loading...</Text>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <StatusBar style="auto" />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: "slide_from_right",
              contentStyle: { backgroundColor: "transparent" },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
            <Stack.Screen
              name="study"
              options={{
                presentation: "fullScreenModal",
                animation: "slide_from_bottom",
              }}
            />
            <Stack.Screen
              name="deck/[deckId]"
              options={{ animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="card/[cardId]"
              options={{
                presentation: "modal",
                animation: "slide_from_bottom",
              }}
            />
          </Stack>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
