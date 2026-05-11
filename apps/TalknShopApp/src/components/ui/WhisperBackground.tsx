/**
 * WhisperBackground — an ambient top-of-screen radial-style glow used as a
 * subtle bg tint on Discover, Conversations, and You.
 *
 * Implementation note: RN's expo-linear-gradient is linear-only. We fake a
 * radial fade with two stacked linear gradients (vertical + horizontal) at
 * very low opacity. Cheap, ships fine on iOS.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type Props = {
  /** Tint hue. Defaults to the brand violet. */
  color?: string;
  /** Vertical reach of the glow in pixels. */
  height?: number;
};

export const WhisperBackground: React.FC<Props> = ({
  color = '#7C5CFF',
  height = 420,
}) => {
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}
    >
      {/* Top-down violet wash */}
      <LinearGradient
        colors={[`${color}33`, `${color}10`, 'rgba(10, 10, 15, 0)']}
        locations={[0, 0.35, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height }}
      />
      {/* Horizontal centering — squeezes the glow toward the middle */}
      <LinearGradient
        colors={['rgba(10, 10, 15, 0.7)', 'rgba(10, 10, 15, 0)', 'rgba(10, 10, 15, 0.7)']}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height }}
      />
    </View>
  );
};
