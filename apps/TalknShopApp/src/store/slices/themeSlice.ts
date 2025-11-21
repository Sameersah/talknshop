import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Theme } from '@/types';
import { lightTheme, darkTheme } from '@/constants/theme';

interface ThemeState {
  currentTheme: 'light' | 'dark' | 'system';
  theme: Theme;
  isDark: boolean;
}

const initialState: ThemeState = {
  currentTheme: 'dark',
  theme: darkTheme,
  isDark: true,
};

export const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<'light' | 'dark' | 'system'>) => {
      state.currentTheme = action.payload;
      
      if (action.payload === 'system') {
        // System theme detection will be handled by ThemeProvider
        // Default to dark for better UX
        state.isDark = true;
        state.theme = darkTheme;
      } else {
        state.isDark = action.payload === 'dark';
        state.theme = action.payload === 'dark' ? darkTheme : lightTheme;
      }
    },
    toggleTheme: (state) => {
      if (state.currentTheme === 'system') {
        state.currentTheme = 'light';
        state.isDark = false;
        state.theme = lightTheme;
      } else if (state.currentTheme === 'light') {
        state.currentTheme = 'dark';
        state.isDark = true;
        state.theme = darkTheme;
      } else {
        state.currentTheme = 'light';
        state.isDark = false;
        state.theme = lightTheme;
      }
    },
    updateTheme: (state, action: PayloadAction<Partial<Theme>>) => {
      state.theme = {
        ...state.theme,
        ...action.payload,
      };
    },
  },
});

export const { setTheme, toggleTheme, updateTheme } = themeSlice.actions;
