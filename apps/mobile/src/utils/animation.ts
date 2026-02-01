// =============================================================================
// ANIMATION UTILITIES
// =============================================================================
// Platform-aware animation configuration to handle web vs native differences

import { Platform, ViewStyle } from "react-native";

/**
 * Determines whether to use the native animation driver.
 * - On iOS/Android: uses native driver for better performance
 * - On Web: uses JS driver since native modules aren't available
 */
export const useNativeDriver = Platform.OS !== "web";

/**
 * Creates animation config with platform-appropriate native driver setting.
 * Use this when creating Animated.timing/spring configs.
 *
 * @example
 * Animated.timing(value, {
 *   toValue: 1,
 *   duration: 300,
 *   ...animationConfig,
 * }).start();
 */
export const animationConfig = {
  useNativeDriver,
};

/**
 * Creates platform-aware shadow styles.
 * - On iOS: uses shadow* props
 * - On Android: uses elevation
 * - On Web: uses boxShadow
 *
 * @example
 * <View style={[styles.card, createShadow(colors.shadow, 4, 0.1, 12)]} />
 */
export function createShadow(
  color: string,
  offsetY: number = 4,
  opacity: number = 0.1,
  radius: number = 12,
  elevation: number = 5,
): ViewStyle {
  if (Platform.OS === "web") {
    // Convert color with opacity for web
    // color is typically rgba or hex, we'll create a proper rgba
    const rgbaColor = color.startsWith("rgba")
      ? color
      : `rgba(0, 0, 0, ${opacity})`;
    return {
      boxShadow: `0px ${offsetY}px ${radius}px ${rgbaColor}`,
    } as ViewStyle;
  }

  if (Platform.OS === "android") {
    return {
      elevation,
    };
  }

  // iOS
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: offsetY },
    shadowOpacity: opacity,
    shadowRadius: radius,
  };
}

/**
 * Pre-defined shadow presets for common use cases
 */
export const shadows = {
  small: (color: string = "rgba(0,0,0,0.1)") =>
    createShadow(color, 2, 0.08, 4, 2),
  medium: (color: string = "rgba(0,0,0,0.1)") =>
    createShadow(color, 4, 0.1, 12, 5),
  large: (color: string = "rgba(0,0,0,0.15)") =>
    createShadow(color, 8, 0.15, 24, 10),
};

/**
 * Helper to create a complete timing animation config
 */
export function createTimingConfig(
  toValue: number,
  duration: number = 300,
  easing?: (value: number) => number,
) {
  return {
    toValue,
    duration,
    useNativeDriver,
    ...(easing && { easing }),
  };
}

/**
 * Helper to create a complete spring animation config
 */
export function createSpringConfig(
  toValue: number,
  options?: {
    friction?: number;
    tension?: number;
    speed?: number;
    bounciness?: number;
  },
) {
  return {
    toValue,
    useNativeDriver,
    ...options,
  };
}
