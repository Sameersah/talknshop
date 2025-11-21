import { Theme } from '@/types';

// Light theme
export const lightTheme: Theme = {
  colors: {
    primary: '#007AFF',
    secondary: '#5856D6',
    background: '#FFFFFF',
    surface: '#F2F2F7',
    text: '#000000',
    textSecondary: '#8E8E93',
    border: '#C6C6C8',
    error: '#FF3B30',
    warning: '#FF9500',
    success: '#34C759',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  typography: {
    h1: {
      fontSize: 32,
      fontWeight: 'bold',
      lineHeight: 40,
    },
    h2: {
      fontSize: 24,
      fontWeight: 'bold',
      lineHeight: 32,
    },
    h3: {
      fontSize: 20,
      fontWeight: '600',
      lineHeight: 28,
    },
    body: {
      fontSize: 16,
      fontWeight: 'normal',
      lineHeight: 24,
    },
    caption: {
      fontSize: 12,
      fontWeight: 'normal',
      lineHeight: 16,
    },
  },
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
  },
};

// Dark theme - Modern iOS/Material Design inspired
export const darkTheme: Theme = {
  ...lightTheme,
  colors: {
    primary: '#007AFF', // iOS Blue
    secondary: '#5856D6', // iOS Purple
    background: '#000000', // Pure black
    surface: '#1C1C1E', // iOS Dark Gray
    text: '#FFFFFF', // Pure white
    textSecondary: '#98989D', // Lighter gray for better contrast
    border: '#2C2C2E', // Subtle border
    error: '#FF3B30', // iOS Red
    warning: '#FF9500', // iOS Orange
    success: '#34C759', // iOS Green
  },
};

// Default theme - Use dark theme as default
export const defaultTheme = darkTheme;
