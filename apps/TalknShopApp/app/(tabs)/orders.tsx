import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { EmptyState, PressableScale, WhisperBackground } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';

export default function OrdersScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <WhisperBackground />
      <View style={[styles.content, { paddingTop: insets.top + 16 }]}>
        <PressableScale onPress={() => router.back()} haptic="selection" style={{ alignSelf: 'flex-start' }}>
          <View style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </View>
        </PressableScale>

        <View style={styles.center}>
          <EmptyState
            icon="receipt-outline"
            eyebrow="ORDERS"
            title="No orders yet"
            body="When you buy something through TalknShop, the order will show up right here."
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 20, gap: 24 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
