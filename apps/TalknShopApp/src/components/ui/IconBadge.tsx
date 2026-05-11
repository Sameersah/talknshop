/**
 * IconBadge — small tinted rounded-square icon container used in starter
 * tiles, list rows, empty states. Three sizes, optional gradient fill.
 */
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/useTheme';
import { AURORA_COLORS, AURORA_LOCATIONS } from '@/constants/theme';

type Props = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  size?: 'sm' | 'md' | 'lg';
  variant?: 'tinted' | 'gradient' | 'subtle';
  color?: string;
  style?: StyleProp<ViewStyle>;
};

export const IconBadge: React.FC<Props> = ({
  icon,
  size = 'md',
  variant = 'tinted',
  color,
  style,
}) => {
  const { colors } = useTheme();
  const dimensions = { sm: 28, md: 40, lg: 52 };
  const iconSizes = { sm: 14, md: 20, lg: 26 };
  const radii = { sm: 8, md: 12, lg: 16 };

  const dim = dimensions[size];
  const tint = color ?? colors.primary;

  if (variant === 'gradient') {
    return (
      <LinearGradient
        colors={[...AURORA_COLORS]}
        locations={[...AURORA_LOCATIONS]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.box,
          { width: dim, height: dim, borderRadius: radii[size] },
          style,
        ]}
      >
        <Ionicons name={icon} size={iconSizes[size]} color="#fff" />
      </LinearGradient>
    );
  }

  return (
    <View
      style={[
        styles.box,
        {
          width: dim,
          height: dim,
          borderRadius: radii[size],
          backgroundColor: variant === 'subtle' ? `${tint}10` : `${tint}22`,
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={iconSizes[size]} color={tint} />
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
