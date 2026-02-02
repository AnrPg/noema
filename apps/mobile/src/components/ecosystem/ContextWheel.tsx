// =============================================================================
// CONTEXT WHEEL COMPONENT
// =============================================================================
// Radial visualization of a card's multi-category participation
// Shows how a single card appears in different semantic contexts

import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle, Path, G, Text as SvgText } from "react-native-svg";
import type {
  CardId,
  CategoryId,
  SemanticRole,
  ParticipationWithCategory,
} from "@manthanein/shared";

// =============================================================================
// TYPES
// =============================================================================

interface ContextWheelProps {
  cardId: CardId;
  participations: ParticipationWithCategory[];
  activeParticipationId?: string;
  size?: number;
  onParticipationSelect?: (participation: ParticipationWithCategory) => void;
  onParticipationLongPress?: (participation: ParticipationWithCategory) => void;
  showLabels?: boolean;
  showMastery?: boolean;
  interactive?: boolean;
}

interface WheelSegmentProps {
  participation: ParticipationWithCategory;
  index: number;
  total: number;
  centerX: number;
  centerY: number;
  innerRadius: number;
  outerRadius: number;
  isActive: boolean;
  showLabel: boolean;
  showMastery: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}

// =============================================================================
// HELPERS
// =============================================================================

const SEMANTIC_ROLE_COLORS: Record<SemanticRole, string> = {
  foundational: "#22c55e", // Green - core concepts
  application: "#3b82f6", // Blue - applied
  example: "#8b5cf6", // Purple - illustrative
  edge_case: "#f59e0b", // Amber - special cases
  counterexample: "#ef4444", // Red - opposites
  concept: "#6366f1", // Indigo - general
};

const SEMANTIC_ROLE_ICONS: Record<SemanticRole, string> = {
  foundational: "🎯",
  application: "⚙️",
  example: "💡",
  edge_case: "⚠️",
  counterexample: "❌",
  concept: "📚",
};

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number,
): { x: number; y: number } {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeArc(
  x: number,
  y: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  const innerStart = polarToCartesian(x, y, innerRadius, endAngle);
  const innerEnd = polarToCartesian(x, y, innerRadius, startAngle);
  const outerStart = polarToCartesian(x, y, outerRadius, endAngle);
  const outerEnd = polarToCartesian(x, y, outerRadius, startAngle);

  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M",
    outerStart.x,
    outerStart.y,
    "A",
    outerRadius,
    outerRadius,
    0,
    largeArcFlag,
    0,
    outerEnd.x,
    outerEnd.y,
    "L",
    innerEnd.x,
    innerEnd.y,
    "A",
    innerRadius,
    innerRadius,
    0,
    largeArcFlag,
    1,
    innerStart.x,
    innerStart.y,
    "Z",
  ].join(" ");
}

function getMasteryOpacity(mastery: number): number {
  return 0.4 + mastery * 0.6;
}

// =============================================================================
// WHEEL SEGMENT COMPONENT
// =============================================================================

const WheelSegment: React.FC<WheelSegmentProps> = ({
  participation,
  index,
  total,
  centerX,
  centerY,
  innerRadius,
  outerRadius,
  isActive,
  showLabel,
  showMastery,
  onPress,
  onLongPress,
}) => {
  const segmentAngle = 360 / total;
  const gap = total > 1 ? 2 : 0; // Gap between segments
  const startAngle = index * segmentAngle + gap / 2;
  const endAngle = (index + 1) * segmentAngle - gap / 2;
  const midAngle = (startAngle + endAngle) / 2;

  const baseColor = SEMANTIC_ROLE_COLORS[participation.semanticRole];
  const icon = SEMANTIC_ROLE_ICONS[participation.semanticRole];
  const opacity = showMastery
    ? getMasteryOpacity(participation.contextMastery)
    : 1;

  // Position for label
  const labelRadius = outerRadius + 20;
  const labelPos = polarToCartesian(centerX, centerY, labelRadius, midAngle);

  // Position for icon
  const iconRadius = (innerRadius + outerRadius) / 2;
  const iconPos = polarToCartesian(centerX, centerY, iconRadius, midAngle);

  const pathD = describeArc(
    centerX,
    centerY,
    innerRadius,
    isActive ? outerRadius + 8 : outerRadius,
    startAngle,
    endAngle,
  );

  return (
    <G onPress={onPress} onLongPress={onLongPress}>
      {/* Segment Arc */}
      <Path
        d={pathD}
        fill={baseColor}
        opacity={opacity}
        stroke={isActive ? "#fff" : "transparent"}
        strokeWidth={isActive ? 2 : 0}
      />

      {/* Primary indicator (star/dot) */}
      {participation.isPrimary && (
        <Circle
          cx={iconPos.x}
          cy={iconPos.y - 12}
          r={4}
          fill="#fbbf24"
          stroke="#fff"
          strokeWidth={1}
        />
      )}

      {/* Semantic Role Icon */}
      <SvgText
        x={iconPos.x}
        y={iconPos.y + 4}
        fontSize={14}
        textAnchor="middle"
      >
        {icon}
      </SvgText>

      {/* Category Label */}
      {showLabel && (
        <SvgText
          x={labelPos.x}
          y={labelPos.y}
          fontSize={10}
          fill="#d1d5db"
          textAnchor={midAngle > 180 ? "end" : "start"}
          transform={`rotate(${midAngle > 90 && midAngle < 270 ? midAngle + 180 : midAngle}, ${labelPos.x}, ${labelPos.y})`}
        >
          {participation.category.name.length > 12
            ? participation.category.name.substring(0, 12) + "..."
            : participation.category.name}
        </SvgText>
      )}

      {/* Mastery Ring (inside segment) */}
      {showMastery && (
        <Path
          d={describeArc(
            centerX,
            centerY,
            innerRadius - 4,
            innerRadius - 1,
            startAngle,
            startAngle + (endAngle - startAngle) * participation.contextMastery,
          )}
          fill="#22c55e"
          opacity={0.8}
        />
      )}
    </G>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const ContextWheel: React.FC<ContextWheelProps> = ({
  cardId: _cardId,
  participations,
  activeParticipationId,
  size = 280,
  onParticipationSelect,
  onParticipationLongPress,
  showLabels = true,
  showMastery = true,
  interactive = true,
}) => {
  const centerX = size / 2;
  const centerY = size / 2;
  const outerRadius = size / 2 - (showLabels ? 40 : 20);
  const innerRadius = outerRadius * 0.5;

  // Rotation gesture
  const rotation = useSharedValue(0);
  const savedRotation = useSharedValue(0);

  const rotationGesture = useMemo(
    () =>
      Gesture.Rotation()
        .onUpdate((e) => {
          rotation.value = savedRotation.value + e.rotation * (180 / Math.PI);
        })
        .onEnd(() => {
          savedRotation.value = rotation.value;
        })
        .enabled(interactive),
    [interactive, rotation, savedRotation],
  );

  const wheelAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  // Calculate stats
  const stats = useMemo(() => {
    const primary = participations.find((p) => p.isPrimary);
    const avgMastery =
      participations.reduce((sum, p) => sum + p.contextMastery, 0) /
      (participations.length || 1);
    const roleDistribution = participations.reduce(
      (acc, p) => {
        acc[p.semanticRole] = (acc[p.semanticRole] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return { primary, avgMastery, roleDistribution };
  }, [participations]);

  if (participations.length === 0) {
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🎯</Text>
          <Text style={styles.emptyTitle}>No Categories</Text>
          <Text style={styles.emptySubtitle}>
            Add this card to categories to see its context wheel
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      {/* Wheel Container */}
      <GestureDetector gesture={rotationGesture}>
        <Animated.View
          style={[
            styles.container,
            { width: size, height: size },
            wheelAnimatedStyle,
          ]}
        >
          <Svg width={size} height={size}>
            {/* Background Circle */}
            <Circle
              cx={centerX}
              cy={centerY}
              r={outerRadius + 2}
              fill="transparent"
              stroke="#374151"
              strokeWidth={1}
            />

            {/* Inner Circle */}
            <Circle
              cx={centerX}
              cy={centerY}
              r={innerRadius}
              fill="#111827"
              stroke="#374151"
              strokeWidth={1}
            />

            {/* Segments */}
            {participations.map((participation, index) => (
              <WheelSegment
                key={participation.id}
                participation={participation}
                index={index}
                total={participations.length}
                centerX={centerX}
                centerY={centerY}
                innerRadius={innerRadius}
                outerRadius={outerRadius}
                isActive={participation.id === activeParticipationId}
                showLabel={showLabels}
                showMastery={showMastery}
                onPress={() => onParticipationSelect?.(participation)}
                onLongPress={() => onParticipationLongPress?.(participation)}
              />
            ))}

            {/* Center Info */}
            <SvgText
              x={centerX}
              y={centerY - 8}
              fontSize={24}
              fontWeight="bold"
              fill="#f9fafb"
              textAnchor="middle"
            >
              {participations.length}
            </SvgText>
            <SvgText
              x={centerX}
              y={centerY + 12}
              fontSize={10}
              fill="#9ca3af"
              textAnchor="middle"
            >
              contexts
            </SvgText>
          </Svg>
        </Animated.View>
      </GestureDetector>

      {/* Legend */}
      <View style={styles.legend}>
        <Text style={styles.legendTitle}>Semantic Roles</Text>
        <View style={styles.legendItems}>
          {Object.entries(SEMANTIC_ROLE_COLORS).map(([role, color]) => {
            const count = stats.roleDistribution[role] || 0;
            if (count === 0) return null;
            return (
              <View key={role} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <Text style={styles.legendText}>
                  {SEMANTIC_ROLE_ICONS[role as SemanticRole]}{" "}
                  {role.replace("_", " ")} ({count})
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Stats Footer */}
      <View style={styles.statsFooter}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {Math.round(stats.avgMastery * 100)}%
          </Text>
          <Text style={styles.statLabel}>Avg Mastery</Text>
        </View>
        {stats.primary && (
          <View style={styles.statItem}>
            <Text style={styles.statValue}>⭐</Text>
            <Text style={styles.statLabel}>{stats.primary.category.name}</Text>
          </View>
        )}
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {participations.reduce((sum, p) => sum + p.reviewCountInContext, 0)}
          </Text>
          <Text style={styles.statLabel}>Reviews</Text>
        </View>
      </View>
    </View>
  );
};

// =============================================================================
// MINI CONTEXT INDICATOR
// =============================================================================
// Compact version for use in card lists

interface ContextIndicatorProps {
  participations: ParticipationWithCategory[];
  maxVisible?: number;
  size?: number;
  onPress?: () => void;
}

export const ContextIndicator: React.FC<ContextIndicatorProps> = ({
  participations,
  maxVisible = 3,
  size = 24,
  onPress,
}) => {
  const visible = participations.slice(0, maxVisible);
  const overflow = participations.length - maxVisible;

  if (participations.length === 0) return null;

  return (
    <TouchableOpacity style={styles.indicatorContainer} onPress={onPress}>
      {visible.map((p, i) => (
        <View
          key={p.id}
          style={[
            styles.indicatorDot,
            {
              backgroundColor: SEMANTIC_ROLE_COLORS[p.semanticRole],
              width: size,
              height: size,
              marginLeft: i > 0 ? -size / 3 : 0,
              zIndex: maxVisible - i,
              borderWidth: p.isPrimary ? 2 : 0,
              borderColor: "#fbbf24",
            },
          ]}
        >
          <Text style={{ fontSize: size * 0.5 }}>
            {p.category.iconEmoji || SEMANTIC_ROLE_ICONS[p.semanticRole]}
          </Text>
        </View>
      ))}
      {overflow > 0 && (
        <View
          style={[
            styles.indicatorOverflow,
            { width: size, height: size, marginLeft: -size / 3 },
          ]}
        >
          <Text style={styles.overflowText}>+{overflow}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
  },
  container: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1f2937",
    borderRadius: 999,
    overflow: "hidden",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#9ca3af",
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 11,
    color: "#6b7280",
    textAlign: "center",
  },

  // Legend
  legend: {
    marginTop: 16,
    alignItems: "center",
  },
  legendTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9ca3af",
    marginBottom: 8,
  },
  legendItems: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
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
    fontSize: 10,
    color: "#d1d5db",
    textTransform: "capitalize",
  },

  // Stats
  statsFooter: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#374151",
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#f9fafb",
  },
  statLabel: {
    fontSize: 10,
    color: "#9ca3af",
    marginTop: 2,
  },

  // Indicator
  indicatorContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  indicatorDot: {
    borderRadius: 999,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#374151",
  },
  indicatorOverflow: {
    borderRadius: 999,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  overflowText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#9ca3af",
  },
});

export default ContextWheel;
