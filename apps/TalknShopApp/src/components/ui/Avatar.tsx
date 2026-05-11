/**
 * Avatar — gradient-monogram avatar used on the You tab.
 * Initials derived from `name` (falls back to `?`).
 */
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AURORA_COLORS, AURORA_LOCATIONS } from '@/constants/theme';

type Props = {
  name?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

const initialsFor = (name: string | null | undefined): string => {
  const trimmed = (name || '').trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

export const Avatar: React.FC<Props> = ({ name, size = 80, style }) => {
  const initials = initialsFor(name);
  return (
    <LinearGradient
      colors={[...AURORA_COLORS]}
      locations={[...AURORA_LOCATIONS]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.outer,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          shadowOpacity: 0.4,
          shadowRadius: size / 3,
          shadowColor: '#7C5CFF',
          shadowOffset: { width: 0, height: size / 16 },
        },
        style,
      ]}
    >
      <View style={[styles.inner, { width: size - 6, height: size - 6, borderRadius: (size - 6) / 2 }]}>
        <Text
          style={{
            fontFamily: 'Geist_600SemiBold',
            color: '#fff',
            fontSize: size * 0.38,
            letterSpacing: -0.5,
          }}
        >
          {initials}
        </Text>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  outer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    backgroundColor: 'rgba(10, 10, 15, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
