/**
 * SectionHeader — replaces the scattered ad-hoc section title styles across
 * every screen. h2 title + optional right-side action link, optionally
 * underlined by a 1px aurora hairline that fades to transparent.
 */
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/useTheme';
import { PressableScale } from './PressableScale';

type Props = {
  title: string;
  /** Tiny eyebrow label above the title — uppercase, tracked. */
  eyebrow?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  /** Hide the gradient hairline below (default: shown). */
  hideAccent?: boolean;
  style?: StyleProp<ViewStyle>;
};

export const SectionHeader: React.FC<Props> = ({
  title,
  eyebrow,
  actionLabel,
  onActionPress,
  hideAccent = false,
  style,
}) => {
  const { colors, typography } = useTheme();

  return (
    <View style={style}>
      <View style={styles.row}>
        <View style={styles.left}>
          {eyebrow ? (
            <Text style={[typography.label, { color: colors.textTertiary ?? colors.textSecondary }]}>
              {eyebrow}
            </Text>
          ) : null}
          <Text style={[typography.h2, { color: colors.text }]}>{title}</Text>
        </View>
        {actionLabel && onActionPress ? (
          <PressableScale onPress={onActionPress} haptic="light">
            <Text style={[typography.bodyMd, { color: colors.primary }]}>{actionLabel}</Text>
          </PressableScale>
        ) : null}
      </View>
      {!hideAccent ? (
        <LinearGradient
          colors={[colors.primary, 'rgba(124, 92, 255, 0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.accent}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
  },
  left: {
    flex: 1,
    gap: 4,
  },
  accent: {
    height: 1,
    marginTop: 10,
    width: 96,
    borderRadius: 1,
  },
});
