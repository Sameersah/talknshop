import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SearchScreen } from '@/screens/SearchScreen';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <SearchScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
});
