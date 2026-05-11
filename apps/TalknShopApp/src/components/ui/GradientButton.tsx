/**
 * GradientButton — primary CTA used on Sell submit, Conversations send-when-
 * sending, "Open Chat" hand-off. Aurora gradient with a violet glow on press.
 */
import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AURORA_COLORS, AURORA_LOCATIONS } from '@/constants/theme';
import { PressableScale } from './PressableScale';

type Props = {
  label: string;
  onPress?: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  loading?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
};

export const GradientButton: React.FC<Props> = ({
  label,
  onPress,
  icon,
  loading = false,
  disabled = false,
  size = 'md',
  style,
}) => {
  const heights = { sm: 40, md: 52, lg: 60 };
  const fontSizes = { sm: 13, md: 15, lg: 17 };
  const iconSizes = { sm: 16, md: 18, lg: 20 };

  const isDisabled = disabled || loading;

  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      haptic="medium"
      pressedScale={0.96}
      style={style}
    >
      <View
        style={{
          shadowColor: '#7C5CFF',
          shadowOpacity: isDisabled ? 0 : 0.45,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 0 },
        }}
      >
        <LinearGradient
          colors={[...AURORA_COLORS]}
          locations={[...AURORA_LOCATIONS]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.btn,
            { height: heights[size], opacity: isDisabled ? 0.5 : 1 },
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              {icon ? <Ionicons name={icon} size={iconSizes[size]} color="#fff" /> : null}
              <Text style={[styles.label, { fontSize: fontSizes[size] }]}>{label}</Text>
            </>
          )}
        </LinearGradient>
      </View>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    borderRadius: 999,
  },
  label: {
    color: '#fff',
    fontFamily: 'Geist_600SemiBold',
    letterSpacing: -0.2,
  },
});
