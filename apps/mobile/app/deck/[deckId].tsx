import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function DeckDetailScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#6366f1" />
        </Pressable>
        <Text style={styles.title}>Deck Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.deckInfo}>
          <Text style={styles.deckId}>Deck ID: {deckId}</Text>
          <Text style={styles.placeholder}>
            Deck details will be loaded here...
          </Text>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>--</Text>
            <Text style={styles.statLabel}>Cards</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>--</Text>
            <Text style={styles.statLabel}>Due</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>--</Text>
            <Text style={styles.statLabel}>New</Text>
          </View>
        </View>

        <Pressable style={styles.studyButton}>
          <Ionicons name="play" size={20} color="#fff" />
          <Text style={styles.studyButtonText}>Start Study Session</Text>
        </Pressable>
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
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1a1a2e",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  deckInfo: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  deckId: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  placeholder: {
    fontSize: 16,
    color: "#999",
    textAlign: "center",
    paddingVertical: 20,
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 4,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "700",
    color: "#6366f1",
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  studyButton: {
    backgroundColor: "#6366f1",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  studyButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
});
