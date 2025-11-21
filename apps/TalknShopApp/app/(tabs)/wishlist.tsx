import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';

export default function WishlistScreen() {
  const { colors, typography } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text, ...typography.h1 }]}>
          My Wishlist
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary, ...typography.body }]}>
          Save products you love
        </Text>
        <View style={[styles.placeholder, { backgroundColor: colors.surface }]}>
          <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
            Wishlist items will appear here
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 32,
    opacity: 0.8,
  },
  placeholder: {
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
