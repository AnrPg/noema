// =============================================================================
// TERRITORY MAP COMPONENT
// =============================================================================
// Visualizes the Knowledge Ecosystem as a territory/treemap
// Core = well-understood, Frontier = active learning, Fog = unexplored

import React, { useMemo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useEcosystemStore, selectTerritory } from "@/stores";
import type {
  TerritoryRegion,
  CategoryId,
  MaturityStage,
} from "@manthanein/shared";

// =============================================================================
// TYPES
// =============================================================================

interface TerritoryMapProps {
  onRegionPress?: (categoryId: CategoryId) => void;
  onRegionLongPress?: (categoryId: CategoryId) => void;
  width?: number;
  height?: number;
  showLabels?: boolean;
  interactive?: boolean;
}

interface RegionProps {
  region: TerritoryRegion;
  containerWidth: number;
  containerHeight: number;
  showFogOfWar: boolean;
  showMasteryHeatmap: boolean;
  showLabels: boolean;
  onPress?: (categoryId: CategoryId) => void;
  onLongPress?: (categoryId: CategoryId) => void;
  depth?: number;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get color based on mastery score (heatmap)
 */
function getMasteryColor(mastery: number, baseColor: string): string {
  // Interpolate from gray (0%) to baseColor (100%)
  const gray = { r: 100, g: 100, b: 100 };

  // Parse hex color
  const hex = baseColor.replace("#", "");
  const target = {
    r: parseInt(hex.substring(0, 2), 16) || 99,
    g: parseInt(hex.substring(2, 4), 16) || 102,
    b: parseInt(hex.substring(4, 6), 16) || 241,
  };

  const r = Math.round(gray.r + (target.r - gray.r) * mastery);
  const g = Math.round(gray.g + (target.g - gray.g) * mastery);
  const b = Math.round(gray.b + (target.b - gray.b) * mastery);

  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Get border style based on maturity stage
 */
function getMaturityBorderStyle(stage: MaturityStage): {
  borderWidth: number;
  borderStyle: "solid" | "dashed" | "dotted";
} {
  switch (stage) {
    case "crystallization":
      return { borderWidth: 2, borderStyle: "solid" };
    case "differentiation":
      return { borderWidth: 1.5, borderStyle: "dashed" };
    case "acquisition":
    default:
      return { borderWidth: 1, borderStyle: "dotted" };
  }
}

/**
 * Get opacity for fog of war effect
 */
function getFogOpacity(region: TerritoryRegion, showFog: boolean): number {
  if (!showFog) return 1;
  if (region.isFogOfWar) return 0.3;
  if (region.isFrontier) return 0.7;
  return 1;
}

// =============================================================================
// REGION COMPONENT
// =============================================================================

const TerritoryRegionView: React.FC<RegionProps> = ({
  region,
  containerWidth,
  containerHeight,
  showFogOfWar,
  showMasteryHeatmap,
  showLabels,
  onPress,
  onLongPress,
  depth = 0,
}) => {
  // Calculate actual pixel positions from percentages
  const x = (region.bounds.x / 100) * containerWidth;
  const y = (region.bounds.y / 100) * containerHeight;
  const width = (region.bounds.width / 100) * containerWidth;
  const height = (region.bounds.height / 100) * containerHeight;

  const borderStyle = getMaturityBorderStyle(region.maturityStage);
  const opacity = getFogOpacity(region, showFogOfWar);
  const backgroundColor = showMasteryHeatmap
    ? getMasteryColor(region.masteryScore, region.color)
    : region.color;

  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = useCallback(() => {
    scale.value = withSpring(0.95, {}, () => {
      scale.value = withSpring(1);
    });
    onPress?.(region.categoryId);
  }, [region.categoryId, onPress, scale]);

  const handleLongPress = useCallback(() => {
    onLongPress?.(region.categoryId);
  }, [region.categoryId, onLongPress]);

  // Don't render if too small
  if (width < 30 || height < 30) return null;

  const showChildrenLabels = width > 80 && height > 80;
  const showCount = width > 50;

  return (
    <Animated.View
      style={[
        styles.region,
        animatedStyle,
        {
          position: "absolute",
          left: x,
          top: y,
          width: width - 2,
          height: height - 2,
          backgroundColor,
          opacity,
          borderWidth: borderStyle.borderWidth,
          borderColor: region.isCore ? "#22c55e" : "#374151",
          borderRadius: 4 + depth * 2,
          zIndex: 10 - depth,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.regionTouchable}
        onPress={handlePress}
        onLongPress={handleLongPress}
        activeOpacity={0.8}
      >
        {/* Region Header */}
        {showLabels && (
          <View style={styles.regionHeader}>
            <Text
              style={[
                styles.regionName,
                { fontSize: Math.max(10, Math.min(14, width / 8)) },
              ]}
              numberOfLines={1}
            >
              {region.name}
            </Text>
            {showCount && (
              <Text style={styles.regionCount}>{region.cardCount} cards</Text>
            )}
          </View>
        )}

        {/* Mastery Indicator */}
        {showMasteryHeatmap && (
          <View style={styles.masteryBar}>
            <View
              style={[
                styles.masteryFill,
                {
                  width: `${region.masteryScore * 100}%`,
                  backgroundColor: region.isCore ? "#22c55e" : "#6366f1",
                },
              ]}
            />
          </View>
        )}

        {/* Status Badges */}
        <View style={styles.badges}>
          {region.isCore && (
            <View style={[styles.badge, styles.coreBadge]}>
              <Text style={styles.badgeText}>✓</Text>
            </View>
          )}
          {region.isFrontier && (
            <View style={[styles.badge, styles.frontierBadge]}>
              <Text style={styles.badgeText}>⚡</Text>
            </View>
          )}
          {region.isFogOfWar && showFogOfWar && (
            <View style={[styles.badge, styles.fogBadge]}>
              <Text style={styles.badgeText}>?</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Nested Children */}
      {region.children.map((child) => (
        <TerritoryRegionView
          key={child.categoryId}
          region={child}
          containerWidth={width}
          containerHeight={height * 0.8}
          showFogOfWar={showFogOfWar}
          showMasteryHeatmap={showMasteryHeatmap}
          showLabels={showChildrenLabels}
          onPress={onPress}
          onLongPress={onLongPress}
          depth={depth + 1}
        />
      ))}
    </Animated.View>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const TerritoryMap: React.FC<TerritoryMapProps> = ({
  onRegionPress,
  onRegionLongPress,
  width: propWidth,
  height: propHeight,
  showLabels = true,
  interactive = true,
}) => {
  const territory = useEcosystemStore(selectTerritory);
  const { regions, showFogOfWar, showMasteryHeatmap } = territory;

  const toggleFogOfWar = useEcosystemStore((s) => s.toggleFogOfWar);
  const toggleMasteryHeatmap = useEcosystemStore((s) => s.toggleMasteryHeatmap);

  // Get screen dimensions
  const screenDimensions = Dimensions.get("window");
  const containerWidth = propWidth || screenDimensions.width - 32;
  const containerHeight = propHeight || screenDimensions.height * 0.5;

  // Gesture handling for pan and zoom
  const scale = useSharedValue(1);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onUpdate((e) => {
          scale.value = Math.max(0.5, Math.min(3, e.scale));
        })
        .enabled(interactive),
    [interactive, scale],
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          offsetX.value = e.translationX;
          offsetY.value = e.translationY;
        })
        .enabled(interactive),
    [interactive, offsetX, offsetY],
  );

  const composedGestures = Gesture.Simultaneous(pinchGesture, panGesture);

  const mapAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.value },
      { translateY: offsetY.value },
      { scale: scale.value },
    ],
  }));

  // Calculate total stats
  const stats = useMemo(() => {
    let totalCards = 0;
    let totalMastery = 0;
    let coreCount = 0;
    let frontierCount = 0;
    let fogCount = 0;

    function traverse(r: TerritoryRegion) {
      totalCards += r.cardCount;
      totalMastery += r.masteryScore;
      if (r.isCore) coreCount++;
      if (r.isFrontier) frontierCount++;
      if (r.isFogOfWar) fogCount++;
      r.children.forEach(traverse);
    }

    regions.forEach(traverse);

    return {
      totalCards,
      avgMastery: regions.length > 0 ? totalMastery / regions.length : 0,
      coreCount,
      frontierCount,
      fogCount,
    };
  }, [regions]);

  if (regions.length === 0) {
    return (
      <View
        style={[
          styles.container,
          { width: containerWidth, height: containerHeight },
        ]}
      >
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No Categories Yet</Text>
          <Text style={styles.emptySubtitle}>
            Create your first category to start building your knowledge
            territory
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      {/* Stats Header */}
      <View style={styles.statsHeader}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.totalCards}</Text>
          <Text style={styles.statLabel}>Cards</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {Math.round(stats.avgMastery * 100)}%
          </Text>
          <Text style={styles.statLabel}>Mastery</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: "#22c55e" }]}>
            {stats.coreCount}
          </Text>
          <Text style={styles.statLabel}>Core</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: "#f59e0b" }]}>
            {stats.frontierCount}
          </Text>
          <Text style={styles.statLabel}>Frontier</Text>
        </View>
      </View>

      {/* Map Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.controlButton, showFogOfWar && styles.controlActive]}
          onPress={toggleFogOfWar}
        >
          <Text style={styles.controlText}>🌫️ Fog</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.controlButton,
            showMasteryHeatmap && styles.controlActive,
          ]}
          onPress={toggleMasteryHeatmap}
        >
          <Text style={styles.controlText}>🔥 Heatmap</Text>
        </TouchableOpacity>
      </View>

      {/* Territory Map */}
      <GestureDetector gesture={composedGestures}>
        <View
          style={[
            styles.container,
            { width: containerWidth, height: containerHeight },
          ]}
        >
          <Animated.View style={[styles.mapContent, mapAnimatedStyle]}>
            {regions.map((region) => (
              <TerritoryRegionView
                key={region.categoryId}
                region={region}
                containerWidth={containerWidth}
                containerHeight={containerHeight}
                showFogOfWar={showFogOfWar}
                showMasteryHeatmap={showMasteryHeatmap}
                showLabels={showLabels}
                onPress={onRegionPress}
                onLongPress={onRegionLongPress}
              />
            ))}
          </Animated.View>
        </View>
      </GestureDetector>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#22c55e" }]} />
          <Text style={styles.legendText}>Core (Mastered)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#f59e0b" }]} />
          <Text style={styles.legendText}>Frontier (Learning)</Text>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: "#6b7280", opacity: 0.5 },
            ]}
          />
          <Text style={styles.legendText}>Unexplored</Text>
        </View>
      </View>
    </View>
  );
};

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  container: {
    backgroundColor: "#1f2937",
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  mapContent: {
    flex: 1,
    position: "relative",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#9ca3af",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },

  // Stats
  statsHeader: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
    backgroundColor: "#111827",
    borderRadius: 8,
    marginBottom: 12,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#f9fafb",
  },
  statLabel: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 2,
  },

  // Controls
  controls: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  controlButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#374151",
    borderRadius: 6,
  },
  controlActive: {
    backgroundColor: "#4f46e5",
  },
  controlText: {
    color: "#f9fafb",
    fontSize: 12,
    fontWeight: "500",
  },

  // Region
  region: {
    overflow: "hidden",
  },
  regionTouchable: {
    flex: 1,
    padding: 6,
  },
  regionHeader: {
    marginBottom: 4,
  },
  regionName: {
    fontWeight: "600",
    color: "#f9fafb",
  },
  regionCount: {
    fontSize: 10,
    color: "#d1d5db",
    marginTop: 2,
  },

  // Mastery Bar
  masteryBar: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    marginTop: 4,
    overflow: "hidden",
  },
  masteryFill: {
    height: "100%",
    borderRadius: 2,
  },

  // Badges
  badges: {
    position: "absolute",
    top: 4,
    right: 4,
    flexDirection: "row",
    gap: 2,
  },
  badge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  coreBadge: {
    backgroundColor: "#22c55e",
  },
  frontierBadge: {
    backgroundColor: "#f59e0b",
  },
  fogBadge: {
    backgroundColor: "#6b7280",
  },
  badgeText: {
    fontSize: 10,
    color: "#fff",
  },

  // Legend
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginTop: 12,
    paddingVertical: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: "#9ca3af",
  },
});

export default TerritoryMap;
