/**
 * PressableScale — every interactive element should be wrapped in this.
 *
 * Adds a spring-scale press feedback (0.97) and an optional light haptic.
 * This single component is responsible for ~40% of the perceived polish.
 */
import React, { useCallback } from 'react';
import {
  GestureResponderEvent,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

type Props = Omit<PressableProps, 'style'> & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Scale value at press-in. Defaults to 0.97. */
  pressedScale?: number;
  /** Haptic style on press-in. `none` to disable. Defaults to `selection`. */
  haptic?: 'selection' | 'light' | 'medium' | 'heavy' | 'none';
};

export const PressableScale: React.FC<Props> = ({
  children,
  style,
  pressedScale = 0.97,
  haptic = 'selection',
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const triggerHaptic = useCallback(() => {
    if (haptic === 'none' || disabled) return;
    try {
      if (haptic === 'selection') {
        Haptics.selectionAsync();
      } else {
        const map = {
          light: Haptics.ImpactFeedbackStyle.Light,
          medium: Haptics.ImpactFeedbackStyle.Medium,
          heavy: Haptics.ImpactFeedbackStyle.Heavy,
        } as const;
        Haptics.impactAsync(map[haptic]);
      }
    } catch {
      // Haptics fail silently on simulator/web
    }
  }, [haptic, disabled]);

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      scale.value = withSpring(pressedScale, { damping: 18, stiffness: 320 });
      triggerHaptic();
      onPressIn?.(e);
    },
    [scale, pressedScale, triggerHaptic, onPressIn],
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      scale.value = withSpring(1, { damping: 14, stiffness: 260 });
      onPressOut?.(e);
    },
    [scale, onPressOut],
  );

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        {...rest}
        disabled={disabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
};
