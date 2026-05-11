import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { SearchScreen } from '@/screens/SearchScreen';
import { useTheme } from '@/hooks/useTheme';

/**
 * Discover tab — Search hero, modality affordances, trending, product grid.
 * No SafeAreaView wrap here; SearchScreen manages its own insets so the
 * WhisperBackground can bleed under the status bar.
 */
export default function DiscoverScreen() {
  const { colors } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <SearchScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
