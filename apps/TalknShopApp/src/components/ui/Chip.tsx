/**
 * Chip — small pill used in starter rails, filters, suggestion lists.
 * Three styles: `default` (subtle), `active` (primary), `outline` (border only).
 */
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { PressableScale } from './PressableScale';

type Props = {
  label: string;
  onPress?: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  active?: boolean;
  variant?: 'default' | 'outline' | 'accent';
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
};

export const Chip: React.FC<Props> = ({
  label,
  onPress,
  icon,
  active = false,
  variant = 'default',
  size = 'md',
  style,
}) => {
  const { colors, typography } = useTheme();

  const h = size === 'sm' ? 28 : 36;
  const px = size === 'sm' ? 10 : 14;

  let bg = colors.surface;
  let border = colors.border;
  let textColor = colors.text;

  if (active) {
    bg = colors.primaryMuted ?? colors.surface;
    border = colors.primary;
    textColor = colors.primary;
  } else if (variant === 'outline') {
    bg = 'transparent';
    border = colors.borderStrong ?? colors.border;
  } else if (variant === 'accent') {
    bg = colors.accentMuted ?? colors.surface;
    border = colors.accent ?? colors.primary;
    textColor = colors.accent ?? colors.primary;
  }

  const content = (
    <View
      style={[
        styles.chip,
        {
          height: h,
          paddingHorizontal: px,
          backgroundColor: bg,
          borderColor: border,
        },
        style,
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={size === 'sm' ? 12 : 14}
          color={textColor}
          style={{ marginRight: 6 }}
        />
      ) : null}
      <Text
        style={[
          typography.caption,
          {
            color: textColor,
            fontFamily: 'Geist_500Medium',
            fontSize: size === 'sm' ? 12 : 13,
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );

  if (!onPress) return content;
  return (
    <PressableScale onPress={onPress} haptic="selection">
      {content}
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
