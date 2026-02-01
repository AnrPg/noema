import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function CardDetailScreen() {
  const { cardId } = useLocalSearchParams<{ cardId: string }>();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#6366f1" />
        </Pressable>
        <Text style={styles.title}>Card Details</Text>
        <Pressable style={styles.editButton}>
          <Ionicons name="pencil" size={20} color="#6366f1" />
        </Pressable>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.cardPreview}>
          <Text style={styles.cardId}>Card ID: {cardId}</Text>

          <View style={styles.cardSide}>
            <Text style={styles.sideLabel}>Front</Text>
            <View style={styles.cardContent}>
              <Text style={styles.placeholder}>Card front content...</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.cardSide}>
            <Text style={styles.sideLabel}>Back</Text>
            <View style={styles.cardContent}>
              <Text style={styles.placeholder}>Card back content...</Text>
            </View>
          </View>
        </View>

        <View style={styles.statsContainer}>
          <Text style={styles.sectionTitle}>Learning Stats</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>--</Text>
              <Text style={styles.statLabel}>Reviews</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>--</Text>
              <Text style={styles.statLabel}>Stability</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>--</Text>
              <Text style={styles.statLabel}>Difficulty</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>--</Text>
              <Text style={styles.statLabel}>State</Text>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.actionButton}>
            <Ionicons name="refresh" size={20} color="#6366f1" />
            <Text style={styles.actionText}>Reset Progress</Text>
          </Pressable>
          <Pressable style={[styles.actionButton, styles.deleteButton]}>
            <Ionicons name="trash" size={20} color="#ef4444" />
            <Text style={[styles.actionText, styles.deleteText]}>
              Delete Card
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  backButton: {
    padding: 8,
  },
  editButton: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1a1a2e",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  cardPreview: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  cardId: {
    fontSize: 12,
    color: "#999",
    marginBottom: 16,
  },
  cardSide: {
    marginBottom: 16,
  },
  sideLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6366f1",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  cardContent: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 16,
    minHeight: 80,
  },
  placeholder: {
    color: "#999",
    textAlign: "center",
  },
  divider: {
    height: 1,
    backgroundColor: "#e5e5e5",
    marginVertical: 16,
  },
  statsContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a2e",
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  statItem: {
    width: "50%",
    paddingVertical: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#6366f1",
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  actions: {
    gap: 12,
  },
  actionButton: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  deleteButton: {
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
  },
  actionText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6366f1",
    marginLeft: 8,
  },
  deleteText: {
    color: "#ef4444",
  },
});
