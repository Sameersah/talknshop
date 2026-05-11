/**
 * AuroraOrb — the AI presence. Lives on the Discover and Conversations tabs.
 *
 * States:
 *   idle       → slow breath (1.0 → 1.04 over 2.4s)
 *   listening  → fast pulse (0.8s/cycle) + violet halo glow
 *   thinking   → conic rotation of the gradient, faster breath
 *   responding → one expansive pulse (1.0 → 1.15 → 1.0)
 *
 * The orb is purely decorative; it doesn't read input on its own. Wrap it in
 * a PressableScale if you want it to be tappable.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { AURORA_COLORS, AURORA_LOCATIONS } from '@/constants/theme';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'responding';

type Props = {
  size?: number;
  state?: OrbState;
  /** Show outer glow ring (default true). */
  glow?: boolean;
};

export const AuroraOrb: React.FC<Props> = ({
  size = 96,
  state = 'idle',
  glow = true,
}) => {
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);
  const glowOpacity = useSharedValue(0.55);

  useEffect(() => {
    cancelAnimation(scale);
    cancelAnimation(rotate);
    cancelAnimation(glowOpacity);

    if (state === 'idle') {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
          withTiming(1.0, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      );
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.7, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.45, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      );
      rotate.value = withRepeat(
        withTiming(360, { duration: 16000, easing: Easing.linear }),
        -1,
      );
    } else if (state === 'listening') {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 400, easing: Easing.inOut(Easing.sin) }),
          withTiming(1.0, { duration: 400, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      );
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.95, { duration: 400 }),
          withTiming(0.6, { duration: 400 }),
        ),
        -1,
      );
      rotate.value = withRepeat(
        withTiming(360, { duration: 6000, easing: Easing.linear }),
        -1,
      );
    } else if (state === 'thinking') {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.03, { duration: 800, easing: Easing.inOut(Easing.sin) }),
          withTiming(1.0, { duration: 800, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      );
      glowOpacity.value = withTiming(0.8, { duration: 220 });
      rotate.value = withRepeat(
        withTiming(360, { duration: 3200, easing: Easing.linear }),
        -1,
      );
    } else if (state === 'responding') {
      scale.value = withSequence(
        withTiming(1.15, { duration: 280, easing: Easing.out(Easing.cubic) }),
        withTiming(1.0, { duration: 420, easing: Easing.out(Easing.cubic) }),
      );
      glowOpacity.value = withSequence(
        withTiming(1.0, { duration: 280 }),
        withTiming(0.55, { duration: 420 }),
      );
    }

    return () => {
      cancelAnimation(scale);
      cancelAnimation(rotate);
      cancelAnimation(glowOpacity);
    };
  }, [state, scale, rotate, glowOpacity]);

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: scale.value * 1.18 }],
  }));

  const glowSize = size * 1.6;

  return (
    <View style={{ width: glowSize, height: glowSize, alignItems: 'center', justifyContent: 'center' }}>
      {glow && (
        // Soft falloff halo using a shadow on a small inner ring, rather than
        // a flat opaque disc. Reads as a real glow on near-black canvases.
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { alignItems: 'center', justifyContent: 'center' },
            glowStyle,
          ]}
        >
          <View
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: '#7C5CFF',
              shadowColor: '#7C5CFF',
              shadowOpacity: 0.85,
              shadowRadius: size * 0.55,
              shadowOffset: { width: 0, height: 0 },
            }}
          />
        </Animated.View>
      )}
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            overflow: 'hidden',
            shadowColor: '#7C5CFF',
            shadowOpacity: 0.5,
            shadowRadius: size * 0.4,
            shadowOffset: { width: 0, height: 0 },
          },
          coreStyle,
        ]}
      >
        <LinearGradient
          colors={[...AURORA_COLORS]}
          locations={[...AURORA_LOCATIONS]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1 }}
        />
        {/* Specular highlight to give the orb depth */}
        <LinearGradient
          colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
          start={{ x: 0.2, y: 0.05 }}
          end={{ x: 0.7, y: 0.7 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
};
