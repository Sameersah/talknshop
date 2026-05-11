/**
 * Motion constants — easing curves + reusable timing config for reanimated.
 *
 * Default rule of thumb:
 *   - Enters  → easeOut at base
 *   - Press   → easeSpring at fast
 *   - Ambient → easeLinear at ambient (orb breath)
 *   - Exits   → easeIn at fast
 */
import { Easing } from 'react-native-reanimated';

export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_SPRING = Easing.bezier(0.34, 1.56, 0.64, 1);
export const EASE_IN = Easing.bezier(0.7, 0, 0.84, 0);
export const EASE_LINEAR = Easing.linear;

export const DURATION = {
  fast: 120,
  base: 220,
  slow: 420,
  ambient: 4800,
} as const;
