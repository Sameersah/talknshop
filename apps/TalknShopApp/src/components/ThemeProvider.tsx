import React, { createContext, useContext, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import { actions } from '@/store';
import { Theme } from '@/types';

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  currentTheme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useThemeContext = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const dispatch = useDispatch();
  const { theme, isDark, currentTheme } = useSelector((state: RootState) => state.theme);
  const systemColorScheme = useColorScheme();

  // Update theme when system theme changes and current theme is 'system'
  useEffect(() => {
    if (currentTheme === 'system') {
      const shouldBeDark = systemColorScheme === 'dark';
      if (shouldBeDark !== isDark) {
        dispatch(actions.theme.setTheme('system'));
      }
    }
  }, [systemColorScheme, currentTheme, isDark, dispatch]);

  const setTheme = (newTheme: 'light' | 'dark' | 'system') => {
    dispatch(actions.theme.setTheme(newTheme));
  };

  const toggleTheme = () => {
    dispatch(actions.theme.toggleTheme());
  };

  const value: ThemeContextType = {
    theme,
    isDark,
    currentTheme,
    setTheme,
    toggleTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
