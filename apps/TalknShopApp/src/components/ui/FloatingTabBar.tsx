/**
 * FloatingTabBar — pill-shaped tab bar with blur backdrop and an aurora
 * gradient indicator that slides under the active tab.
 *
 * Used by `app/(tabs)/_layout.tsx` via the Tabs `tabBar` prop. We treat any
 * route without a `tabBarIcon` as hidden (Tabs.Screen { href: null } also
 * unsets the icon at descriptor level), so the indicator math always
 * matches what's actually rendered.
 */
import React, { useEffect, useState } from 'react';
import {
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '@/hooks/useTheme';
import { AURORA_COLORS, AURORA_LOCATIONS } from '@/constants/theme';

const BAR_HEIGHT = 64;
const SIDE_MARGIN = 14;
const INNER_PAD = 4;

export const FloatingTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();

  // A route is visible if its descriptor still has a tabBarIcon. Tabs.Screen
  // with `href: null` unsets the icon, so this filter is reliable for both
  // hidden tabs and any future ones that opt out of the bar.
  const visibleRoutes = state.routes.filter(
    (r) => !!descriptors[r.key].options.tabBarIcon,
  );
  const tabCount = Math.max(1, visibleRoutes.length);

  const activeRouteKey = state.routes[state.index].key;
  const activeIndex = Math.max(
    0,
    visibleRoutes.findIndex((r) => r.key === activeRouteKey),
  );

  // Real-pixel translateX based on measured bar width — avoids the
  // unreliable percentage-string-in-transform hack on Fabric/Reanimated.
  const [innerWidth, setInnerWidth] = useState(0);
  const tabWidth = innerWidth > 0 ? innerWidth / tabCount : 0;
  const indicator = useSharedValue(activeIndex * tabWidth);

  useEffect(() => {
    indicator.value = withSpring(activeIndex * tabWidth, {
      damping: 18,
      stiffness: 200,
      mass: 0.9,
    });
  }, [activeIndex, tabWidth, indicator]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicator.value }],
  }));

  const onInnerLayout = (e: LayoutChangeEvent) => {
    setInnerWidth(e.nativeEvent.layout.width);
  };

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          // Sit just above the home indicator on notched phones, and snug
          // against the screen edge on devices without one.
          bottom: insets.bottom > 0 ? insets.bottom - 6 : 10,
          left: SIDE_MARGIN,
          right: SIDE_MARGIN,
        },
      ]}
    >
      <View
        style={[
          styles.bar,
          {
            backgroundColor:
              Platform.OS === 'ios' ? 'rgba(20, 20, 28, 0.62)' : 'rgba(20, 20, 28, 0.94)',
            borderColor: 'rgba(255, 255, 255, 0.14)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.45,
            shadowRadius: 28,
            elevation: 14,
          },
        ]}
      >
        {Platform.OS === 'ios' ? (
          <BlurView tint="dark" intensity={45} style={StyleSheet.absoluteFill} />
        ) : null}

        <View
          style={[StyleSheet.absoluteFill, { padding: INNER_PAD }]}
          pointerEvents="none"
        >
          <View
            style={{ flex: 1, position: 'relative', overflow: 'hidden', borderRadius: 999 }}
            onLayout={onInnerLayout}
          >
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: tabWidth > 0 ? tabWidth : 0,
                  borderRadius: 999,
                  overflow: 'hidden',
                  opacity: tabWidth > 0 ? 1 : 0,
                },
                indicatorStyle,
              ]}
            >
              <LinearGradient
                colors={[...AURORA_COLORS]}
                locations={[...AURORA_LOCATIONS]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  StyleSheet.absoluteFill,
                  {
                    shadowColor: '#7C5CFF',
                    shadowOpacity: 0.55,
                    shadowRadius: 16,
                    shadowOffset: { width: 0, height: 0 },
                  },
                ]}
              />
              {/* Top sheen */}
              <LinearGradient
                colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 0.8 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>
        </View>

        <View style={styles.row}>
          {visibleRoutes.map((route) => {
            const { options } = descriptors[route.key];
            const isFocused = activeRouteKey === route.key;
            const handlePress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name as never);
              }
            };
            const label =
              options.tabBarLabel ??
              options.title ??
              (route.name.charAt(0).toUpperCase() + route.name.slice(1));
            const renderIcon = options.tabBarIcon;

            return (
              <Pressable
                key={route.key}
                onPress={handlePress}
                onPressIn={() => {
                  try { Haptics.selectionAsync(); } catch { /* simulator */ }
                }}
                style={({ pressed }) => [
                  styles.tabItem,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
                hitSlop={4}
              >
                {renderIcon
                  ? renderIcon({
                      focused: isFocused,
                      color: isFocused ? '#fff' : colors.textSecondary,
                      size: 22,
                    })
                  : null}
                <Text
                  numberOfLines={1}
                  style={[
                    typography.caption,
                    {
                      marginTop: 2,
                      color: isFocused ? '#fff' : colors.textSecondary,
                      fontFamily: isFocused ? 'Geist_600SemiBold' : 'Geist_500Medium',
                    },
                  ]}
                >
                  {typeof label === 'string' ? label : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
  },
  bar: {
    height: BAR_HEIGHT,
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    padding: INNER_PAD,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    // Pressable defaults to no size; explicit height ensures the icon+label
    // are vertically centered inside the 64px bar regardless of parent flex.
    height: '100%',
  },
});
