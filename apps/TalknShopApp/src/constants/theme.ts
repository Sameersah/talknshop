/**
 * TalknShop design system.
 *
 * The dark theme is the brand theme. Light theme is kept as a thin alias so
 * legacy code paths still resolve, but the redesign assumes dark.
 *
 * Brand essence: "Conversational surface" — one persistent AI presence (the
 * aurora gradient), one typographic voice (Geist), four surface tiers, and
 * one signature warm accent (coral). See:
 *   apps/TalknShopApp/src/components/ui/  for primitives that consume these.
 */
import { Theme } from '@/types';

// ── Signature gradient stops ──────────────────────────────────────────────────

export const AURORA_COLORS = ['#7C5CFF', '#5B8DEF', '#FF7A59'] as const;
export const AURORA_LOCATIONS = [0, 0.55, 1] as const;

export const AURORA_SUBTLE_COLORS = [
  'rgba(124, 92, 255, 0.18)',
  'rgba(91, 141, 239, 0.12)',
  'rgba(255, 122, 89, 0.18)',
] as const;

export const WHISPER_COLORS = [
  'rgba(124, 92, 255, 0.22)',
  'rgba(10, 10, 15, 0)',
] as const;

// ── Dark theme (brand) ────────────────────────────────────────────────────────

export const darkTheme: Theme = {
  colors: {
    // Brand
    primary: '#7C5CFF',
    primaryHover: '#8E72FF',
    primaryMuted: 'rgba(124, 92, 255, 0.14)',
    secondary: '#5B8DEF',
    accent: '#FF7A59',
    accentMuted: 'rgba(255, 122, 89, 0.16)',

    // Surfaces (warm-tilted near-black so the gradient reads)
    background: '#0A0A0F',
    surface: '#14141C',
    surfaceRaised: '#1C1C26',
    surfaceSunk: '#08080C',
    border: 'rgba(255, 255, 255, 0.06)',
    borderStrong: 'rgba(255, 255, 255, 0.10)',

    // Text
    text: '#F5F5F7',
    textSecondary: '#9B9BA8',
    textTertiary: '#5C5C68',

    // Status
    success: '#3DDC97',
    warning: '#FFB454',
    error: '#FF5C7A',
  },

  // 4-point grid, semantic
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  space: { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 },

  typography: {
    display: {
      fontFamily: 'Geist_600SemiBold',
      fontSize: 40,
      lineHeight: 44,
      letterSpacing: -0.8,
    },
    h1: {
      fontFamily: 'Geist_600SemiBold',
      fontSize: 28,
      lineHeight: 34,
      letterSpacing: -0.5,
    },
    h2: {
      fontFamily: 'Geist_600SemiBold',
      fontSize: 22,
      lineHeight: 28,
      letterSpacing: -0.3,
    },
    h3: {
      fontFamily: 'Geist_600SemiBold',
      fontSize: 17,
      lineHeight: 22,
      letterSpacing: -0.1,
    },
    body: {
      fontFamily: 'Geist_400Regular',
      fontSize: 15,
      lineHeight: 22,
    },
    bodyMd: {
      fontFamily: 'Geist_500Medium',
      fontSize: 15,
      lineHeight: 22,
    },
    caption: {
      fontFamily: 'Geist_500Medium',
      fontSize: 12,
      lineHeight: 16,
      letterSpacing: 0.1,
    },
    label: {
      fontFamily: 'Geist_600SemiBold',
      fontSize: 11,
      lineHeight: 14,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    mono: {
      fontFamily: 'GeistMono_500Medium',
      fontSize: 13,
      lineHeight: 18,
    },
    priceLg: {
      fontFamily: 'GeistMono_600SemiBold',
      fontSize: 22,
      lineHeight: 26,
      letterSpacing: -0.4,
    },
  },

  // Tighter, more confident radii. Skipping 16 on purpose.
  borderRadius: { sm: 6, md: 12, lg: 20, xl: 28, pill: 999 },

  // Signature gradients (consumed via expo-linear-gradient)
  gradients: {
    aurora: {
      angle: 135,
      colors: [...AURORA_COLORS],
      locations: [...AURORA_LOCATIONS],
    },
    auroraSubtle: {
      angle: 135,
      colors: [...AURORA_SUBTLE_COLORS],
      locations: [0, 0.5, 1],
    },
    whisper: {
      colors: [...WHISPER_COLORS],
      locations: [0, 1],
    },
  },

  // Shadows tuned for near-black canvas
  elevation: {
    e1: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.30,
      shadowRadius: 8,
      elevation: 2,
    },
    e2: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.45,
      shadowRadius: 20,
      elevation: 6,
    },
    e3: {
      // Violet "alive" glow — only on AI orb (listening) and primary CTA press
      shadowColor: '#7C5CFF',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.35,
      shadowRadius: 28,
      elevation: 10,
    },
  },

  // Default motion durations (ms). Easings live in src/constants/motion.ts.
  motion: {
    fast: 120,
    base: 220,
    slow: 420,
    ambient: 4800,
  },
};

// ── Light theme (legacy fallback) ─────────────────────────────────────────────
// Kept so the redux selector doesn't crash if someone toggles theme; the demo
// is dark-only.
export const lightTheme: Theme = {
  ...darkTheme,
  colors: {
    ...darkTheme.colors,
    background: '#FFFFFF',
    surface: '#F5F5F7',
    surfaceRaised: '#FFFFFF',
    surfaceSunk: '#EAEAEF',
    border: 'rgba(0, 0, 0, 0.08)',
    borderStrong: 'rgba(0, 0, 0, 0.14)',
    text: '#0A0A0F',
    textSecondary: '#5C5C68',
    textTertiary: '#9B9BA8',
  },
};

export const defaultTheme = darkTheme;
