/**
 * StatCard — number + label tile used on the You tab and elsewhere.
 *
 * Variants:
 *   `default` — surfaceRaised card, mono number, label below
 *   `accent`  — primary-tinted bg, used for the "active" stat
 *   `empty`   — dashed border + textTertiary, used when value is 0
 */
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { PressableScale } from './PressableScale';

type Props = {
  value: string | number;
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  variant?: 'default' | 'accent' | 'empty';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export const StatCard: React.FC<Props> = ({
  value,
  label,
  icon,
  variant = 'default',
  onPress,
  style,
}) => {
  const { colors, typography } = useTheme();

  const isEmpty = variant === 'empty';
  const isAccent = variant === 'accent';

  const bg = isAccent
    ? colors.primaryMuted ?? colors.surface
    : isEmpty
    ? 'transparent'
    : colors.surfaceRaised ?? colors.surface;

  const borderColor = isAccent
    ? colors.primary
    : isEmpty
    ? colors.borderStrong ?? colors.border
    : colors.border;

  const valueColor = isEmpty ? colors.textTertiary ?? colors.textSecondary : colors.text;

  const content = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: bg,
          borderColor,
          borderStyle: isEmpty ? 'dashed' : 'solid',
        },
        style,
      ]}
    >
      {icon ? (
        <View style={styles.iconRow}>
          <Ionicons name={icon} size={14} color={isAccent ? colors.primary : colors.textSecondary} />
        </View>
      ) : null}
      <Text style={[typography.priceLg ?? typography.h1, { color: valueColor }]}>{value}</Text>
      <Text style={[typography.label, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );

  if (!onPress) return content;
  return (
    <PressableScale onPress={onPress} haptic="selection" style={{ flex: 1 }}>
      {content}
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
