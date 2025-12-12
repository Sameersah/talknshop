import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, FlatList } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ProductCard } from '@/components/ProductCard';
import * as ImagePicker from 'expo-image-picker';
import { getFeaturedProducts, searchProducts, Product } from '@/data/products';

const CONVERSATION_STARTERS = [
  "What's the best iPhone case?",
  'Show me running shoes',
  'I need a coffee maker',
  'Find me a good laptop bag',
];

export const SearchScreen: React.FC = () => {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = () => {
    const query = searchQuery.trim();
    if (query) {
      setIsSearching(true);
      const results = searchProducts(query);
      setSearchResults(results);
      if (results.length === 0) {
        Alert.alert('No Results', `No products found for "${query}"`);
      }
    } else {
      setIsSearching(false);
      setSearchResults([]);
    }
  };

  // Auto-search as user types
  useEffect(() => {
    const query = searchQuery.trim();
    if (query) {
      setIsSearching(true);
      const results = searchProducts(query);
      setSearchResults(results);
    } else {
      setIsSearching(false);
      setSearchResults([]);
    }
  }, [searchQuery]);

  const displayedProducts = useMemo(() => {
    if (isSearching && searchQuery.trim()) {
      return searchResults;
    }
    return getFeaturedProducts();
  }, [isSearching, searchQuery, searchResults]);

  const handleProductPress = (product: Product) => {
    Alert.alert(
      product.name,
      `${product.description}\n\nPrice: $${product.price.toFixed(2)}\nRating: ${product.rating}/5 (${product.reviewCount} reviews)`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'View Details', onPress: () => console.log('View product:', product.id) },
      ]
    );
  };


  const handleImageSearch = async () => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera roll permissions to search with images.');
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        console.log('Image selected:', result.assets[0].uri);
        // TODO: Process image and perform search
        Alert.alert('Image Search', 'Image selected! Processing...');
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };


  const handleSuggestionPress = (suggestion: string) => {
    setSearchQuery(suggestion);
  };

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.contentContainer,
        { paddingBottom: insets.bottom } // Space for tab bar (60px) + safe area + extra padding
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* AI Assistant Header - Modern Design */}
      <View style={[styles.aiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.aiCardContent}>
          <View style={styles.aiHeaderRow}>
            <View style={[styles.aiAvatarContainer, { backgroundColor: colors.primary + '15' }]}>
              <View style={[styles.aiAvatar, { backgroundColor: colors.primary }]}>
                <Ionicons name="sparkles" size={24} color="#FFFFFF" />
              </View>
              <View style={[styles.aiStatusIndicator, { backgroundColor: colors.success, borderColor: colors.surface }]} />
            </View>
            <View style={styles.aiInfoContainer}>
              <Text style={[styles.aiName, { color: colors.text }]}>AI Shopping Assistant</Text>
              <View style={styles.aiTypingIndicator}>
                <View style={[styles.typingDot, { backgroundColor: colors.textSecondary }]} />
                <View style={[styles.typingDot, { backgroundColor: colors.textSecondary }]} />
                <View style={[styles.typingDot, { backgroundColor: colors.textSecondary }]} />
                <Text style={[styles.aiStatus, { color: colors.textSecondary }]}>Online</Text>
              </View>
            </View>
          </View>
          <View style={[styles.aiMessageBubble, { backgroundColor: colors.background, borderLeftColor: colors.primary }]}>
            <Text style={[styles.aiMessageText, { color: colors.text }]}>
              👋 Hi there! I'm here to help you find exactly what you're looking for. Ask me anything about products, compare prices, or get personalized recommendations!
            </Text>
          </View>
        </View>
      </View>

      {/* Conversational Search Input */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="chatbubble-ellipses" size={20} color={colors.primary} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Ask me anything... 'Show me best headphones'"
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        
        {/* Quick Action Buttons */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[styles.quickActionButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => {
              // Open voice recording
              Alert.alert('Voice Search', 'Voice search coming soon! Use the search bar for now.');
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="mic" size={18} color={colors.primary} />
            <Text style={[styles.quickActionText, { color: colors.text }]}>Voice</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickActionButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={handleImageSearch}
            activeOpacity={0.7}
          >
            <Ionicons name="camera" size={18} color={colors.primary} />
            <Text style={[styles.quickActionText, { color: colors.text }]}>Photo</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Conversation Starters */}
      {!isSearching && !searchQuery.trim() && (
        <View style={styles.conversationSection}>
          <Text style={[styles.sectionTitle, { color: colors.text, ...typography.h3 }]}>
            💬 Try Asking
          </Text>
          <View style={styles.conversationGrid}>
            {CONVERSATION_STARTERS.map((starter, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.conversationCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => handleSuggestionPress(starter)}
                activeOpacity={0.7}
              >
                <Ionicons name="chatbubble-outline" size={20} color={colors.primary} />
                <Text style={[styles.conversationText, { color: colors.text }]}>{starter}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}



      {/* Products Section */}
      <View style={[styles.productsSection, { backgroundColor: colors.background }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text, ...typography.h3 }]}>
            {isSearching && searchQuery.trim() 
              ? `Search Results (${displayedProducts.length})` 
              : 'Featured Products'}
          </Text>
          {isSearching && searchQuery.trim() && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                setIsSearching(false);
                setSearchResults([]);
              }}
              style={styles.clearSearchButton}
            >
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
              <Text style={[styles.clearSearchText, { color: colors.textSecondary }]}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {displayedProducts.length > 0 ? (
          <FlatList
            data={displayedProducts}
            renderItem={({ item }) => (
              <ProductCard product={item} onPress={handleProductPress} />
            )}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            style={{ backgroundColor: colors.background }}
            contentContainerStyle={styles.productsList}
          />
        ) : (
          <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.text }]}>
              {isSearching && searchQuery.trim()
                ? 'No products found'
                : 'Start searching to find products'}
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              Ask me anything or try the suggestions above!
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  aiCard: {
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 24,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  aiCardContent: {
    padding: 20,
  },
  aiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  aiAvatarContainer: {
    position: 'relative',
    marginRight: 12,
    padding: 4,
    borderRadius: 28,
  },
  aiAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  aiStatusIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
  },
  aiInfoContainer: {
    flex: 1,
  },
  aiName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  aiTypingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  aiStatus: {
    fontSize: 12,
    marginLeft: 4,
    fontWeight: '500',
  },
  aiMessageBubble: {
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderLeftWidth: 3,
  },
  aiMessageText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  searchContainer: {
    marginBottom: 24,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  quickActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  suggestionsSection: {
    marginBottom: 24,
  },
  suggestionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  suggestionChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  suggestionText: {
    fontSize: 13,
    fontWeight: '500',
  },
  conversationSection: {
    marginBottom: 24,
  },
  conversationGrid: {
    gap: 12,
    marginTop: 12,
  },
  conversationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  conversationText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  sectionTitle: {
    marginBottom: 12,
    fontWeight: '600',
    fontSize: 18,
  },
  recentSearches: {
    marginBottom: 32,
  },
  searchHistory: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 8,
  },
  productsSection: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  clearSearchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clearSearchText: {
    fontSize: 14,
    fontWeight: '500',
  },
  productsList: {
    paddingBottom: 8,
  },
  emptyState: {
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    opacity: 0.7,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '600',
    marginTop: 16,
  },
});
