/**
 * GradientBorder — wraps any child with a thin aurora-gradient stroke.
 *
 * Implementation: an outer LinearGradient sized 1.5px larger than the inner
 * View. The inner View has the resting bg color and the actual content. This
 * is the most reliable way to get a gradient border in RN (CSS gradient
 * borders aren't natively supported).
 */
import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AURORA_COLORS, AURORA_LOCATIONS } from '@/constants/theme';

type Props = {
  children: React.ReactNode;
  /** Border radius of the inner content. Outer is +1.5px wider so it overflows naturally. */
  radius?: number;
  /** Thickness of the visible gradient ring. Defaults to 1.5. */
  thickness?: number;
  /** Background of the inner content. Defaults to the theme `surface`. */
  innerBackground?: string;
  /** Optional override of the gradient stops (e.g. for `[error, accent]`). */
  colors?: string[];
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
};

export const GradientBorder: React.FC<Props> = ({
  children,
  radius = 20,
  thickness = 1.5,
  innerBackground = '#14141C',
  colors,
  style,
  innerStyle,
}) => {
  const gradientColors = colors ?? [...AURORA_COLORS];
  return (
    <LinearGradient
      colors={gradientColors}
      locations={colors ? undefined : [...AURORA_LOCATIONS]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ borderRadius: radius + thickness, padding: thickness }, style]}
    >
      <View
        style={[
          {
            borderRadius: radius,
            backgroundColor: innerBackground,
            overflow: 'hidden',
          },
          innerStyle,
        ]}
      >
        {children}
      </View>
    </LinearGradient>
  );
};
