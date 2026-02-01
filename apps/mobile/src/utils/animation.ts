// =============================================================================
// ANIMATION UTILITIES
// =============================================================================
// Platform-aware animation configuration to handle web vs native differences

import { Platform } from "react-native";

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
