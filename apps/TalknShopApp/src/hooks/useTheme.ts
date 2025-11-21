import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { Theme } from '@/types';

export const useTheme = () => {
  const theme = useSelector((state: RootState) => state.theme.theme);
  const isDark = useSelector((state: RootState) => state.theme.isDark);
  const currentTheme = useSelector((state: RootState) => state.theme.currentTheme);

  return {
    theme,
    isDark,
    currentTheme,
    colors: theme.colors,
    spacing: theme.spacing,
    typography: theme.typography,
    borderRadius: theme.borderRadius,
  };
};
