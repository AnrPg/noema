import { View, Text, ScrollView, TouchableOpacity, RefreshControl, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { useColors } from '@/theme/ThemeProvider';
import { useDecks, useCreateDeck } from '@/services/api';

interface Deck {
  id: string;
  name: string;
  description?: string;
  cardCount: number;
  dueCount: number;
  newCount: number;
  lastStudied?: string;
  tags: string[];
}

export default function DecksScreen() {
  const colors = useColors();
  const [refreshing, setRefreshing] = useState(false);
  const { data: decksData, refetch } = useDecks();
  const createDeck = useCreateDeck();

  const decks = (decksData as any)?.data || [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const handleCreateDeck = () => {
    // TODO: Open create deck modal
    router.push('/deck/new');
  };

  const renderDeckCard = ({ item }: { item: Deck }) => (
    <TouchableOpacity
      onPress={() => router.push(`/deck/${item.id}`)}
      style={{
        backgroundColor: colors.card,
        borderRadius: 16,
        padding: 16,
        marginHorizontal: 24,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 18,
              fontWeight: '600',
              marginBottom: 4,
            }}
          >
            {item.name}
          </Text>
          {item.description && (
            <Text
              style={{ color: colors.textSecondary, fontSize: 14 }}
              numberOfLines={2}
            >
              {item.description}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </View>

      {/* Stats Row */}
      <View
        style={{
          flexDirection: 'row',
          marginTop: 12,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: colors.borderLight,
          gap: 16,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="layers-outline" size={16} color={colors.textMuted} />
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
            {item.cardCount} cards
          </Text>
        </View>
        {item.dueCount > 0 && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: colors.warningLight,
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 8,
            }}
          >
            <Ionicons name="time-outline" size={14} color={colors.warning} />
            <Text style={{ color: colors.warning, fontSize: 12, fontWeight: '500' }}>
              {item.dueCount} due
            </Text>
          </View>
        )}
        {item.newCount > 0 && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: colors.primaryLight + '30',
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 8,
            }}
          >
            <Ionicons name="sparkles" size={14} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '500' }}>
              {item.newCount} new
            </Text>
          </View>
        )}
      </View>

      {/* Tags */}
      {item.tags && item.tags.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {item.tags.slice(0, 3).map((tag, index) => (
            <View
              key={index}
              style={{
                backgroundColor: colors.surfaceVariant,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 6,
              }}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                {tag}
              </Text>
            </View>
          ))}
          {item.tags.length > 3 && (
            <Text style={{ color: colors.textMuted, fontSize: 12, alignSelf: 'center' }}>
              +{item.tags.length - 3} more
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );

  const EmptyState = () => (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48 }}>
      <View
        style={{
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: colors.surfaceVariant,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}
      >
        <Ionicons name="layers-outline" size={40} color={colors.textMuted} />
      </View>
      <Text
        style={{
          color: colors.text,
          fontSize: 20,
          fontWeight: '600',
          marginBottom: 8,
        }}
      >
        No decks yet
      </Text>
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 16,
          textAlign: 'center',
          marginBottom: 24,
        }}
      >
        Create your first deck to start learning
      </Text>
      <TouchableOpacity
        onPress={handleCreateDeck}
        style={{
          backgroundColor: colors.primary,
          borderRadius: 12,
          paddingVertical: 12,
          paddingHorizontal: 24,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Ionicons name="add" size={20} color={colors.onPrimary} />
        <Text style={{ color: colors.onPrimary, fontWeight: '600' }}>
          Create Deck
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 24,
          paddingVertical: 16,
        }}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: 28,
            fontWeight: 'bold',
          }}
        >
          Decks
        </Text>
        <TouchableOpacity
          onPress={handleCreateDeck}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 12,
            padding: 10,
          }}
        >
          <Ionicons name="add" size={24} color={colors.onPrimary} />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <TouchableOpacity
        style={{
          marginHorizontal: 24,
          marginBottom: 16,
          backgroundColor: colors.surfaceVariant,
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Ionicons name="search" size={20} color={colors.textMuted} />
        <Text style={{ color: colors.textMuted, flex: 1 }}>Search decks...</Text>
      </TouchableOpacity>

      {/* Decks List */}
      {decks.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={decks}
          keyExtractor={(item) => item.id}
          renderItem={renderDeckCard}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </SafeAreaView>
  );
}
