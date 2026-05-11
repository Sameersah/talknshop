/**
 * EmptyState — unified empty-state primitive used on Wishlist, Orders,
 * Profile, and anywhere a section has nothing to show.
 *
 * One layout, three slots: icon + (eyebrow + title + body) + optional CTA.
 * Keeps every empty surface in the app visually consistent so a "TODO" tab
 * never reads as a real placeholder.
 */
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { IconBadge } from './IconBadge';
import { PressableScale } from './PressableScale';

type Props = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  eyebrow?: string;
  title: string;
  body?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
  /** When true, uses the gradient icon variant (more presence on hero empty states). */
  emphasized?: boolean;
  style?: StyleProp<ViewStyle>;
};

export const EmptyState: React.FC<Props> = ({
  icon,
  eyebrow,
  title,
  body,
  ctaLabel,
  onCtaPress,
  emphasized = true,
  style,
}) => {
  const { colors, typography } = useTheme();
  return (
    <View style={[styles.wrap, style]}>
      <IconBadge icon={icon} size="lg" variant={emphasized ? 'gradient' : 'subtle'} />
      {eyebrow ? (
        <Text style={[typography.label, { color: colors.textSecondary, marginTop: 18 }]}>{eyebrow}</Text>
      ) : null}
      <Text style={[typography.h1, { color: colors.text, marginTop: 6, textAlign: 'center' }]}>
        {title}
      </Text>
      {body ? (
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: 8, textAlign: 'center', maxWidth: 320 }]}>
          {body}
        </Text>
      ) : null}
      {ctaLabel && onCtaPress ? (
        <PressableScale onPress={onCtaPress} haptic="selection">
          <View style={[styles.cta, { borderColor: colors.borderStrong ?? colors.border }]}>
            <Text style={[typography.bodyMd, { color: colors.primary }]}>{ctaLabel}</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.primary} />
          </View>
        </PressableScale>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 0,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 20,
  },
});
