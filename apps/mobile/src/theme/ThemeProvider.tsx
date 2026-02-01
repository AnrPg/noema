// =============================================================================
// THEME PROVIDER
// =============================================================================

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({ id: 'theme-storage' });

type Theme = 'light' | 'dark' | 'system';

interface ThemeColors {
  // Backgrounds
  background: string;
  surface: string;
  surfaceVariant: string;
  card: string;
  modal: string;
  
  // Text
  text: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  
  // Primary
  primary: string;
  primaryLight: string;
  primaryDark: string;
  onPrimary: string;
  
  // Accent
  accent: string;
  accentLight: string;
  
  // States
  success: string;
  successLight: string;
  warning: string;
  warningLight: string;
  error: string;
  errorLight: string;
  
  // Borders
  border: string;
  borderLight: string;
  
  // Special
  shadow: string;
  overlay: string;
  
  // XP Colors
  xpBronze: string;
  xpSilver: string;
  xpGold: string;
  xpPlatinum: string;
  xpDiamond: string;
}

const lightColors: ThemeColors = {
  background: '#ffffff',
  surface: '#f8fafc',
  surfaceVariant: '#f1f5f9',
  card: '#ffffff',
  modal: '#ffffff',
  
  text: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  textInverse: '#ffffff',
  
  primary: '#6366f1',
  primaryLight: '#818cf8',
  primaryDark: '#4f46e5',
  onPrimary: '#ffffff',
  
  accent: '#d946ef',
  accentLight: '#e879f9',
  
  success: '#22c55e',
  successLight: '#86efac',
  warning: '#f59e0b',
  warningLight: '#fcd34d',
  error: '#ef4444',
  errorLight: '#fca5a5',
  
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  
  shadow: 'rgba(0, 0, 0, 0.1)',
  overlay: 'rgba(0, 0, 0, 0.5)',
  
  xpBronze: '#cd7f32',
  xpSilver: '#c0c0c0',
  xpGold: '#ffd700',
  xpPlatinum: '#e5e4e2',
  xpDiamond: '#b9f2ff',
};

const darkColors: ThemeColors = {
  background: '#0f172a',
  surface: '#1e293b',
  surfaceVariant: '#334155',
  card: '#1e293b',
  modal: '#1e293b',
  
  text: '#f8fafc',
  textSecondary: '#cbd5e1',
  textMuted: '#64748b',
  textInverse: '#0f172a',
  
  primary: '#818cf8',
  primaryLight: '#a5b4fc',
  primaryDark: '#6366f1',
  onPrimary: '#1e1b4b',
  
  accent: '#e879f9',
  accentLight: '#f0abfc',
  
  success: '#4ade80',
  successLight: '#86efac',
  warning: '#fbbf24',
  warningLight: '#fde68a',
  error: '#f87171',
  errorLight: '#fecaca',
  
  border: '#334155',
  borderLight: '#475569',
  
  shadow: 'rgba(0, 0, 0, 0.3)',
  overlay: 'rgba(0, 0, 0, 0.7)',
  
  xpBronze: '#cd7f32',
  xpSilver: '#c0c0c0',
  xpGold: '#ffd700',
  xpPlatinum: '#e5e4e2',
  xpDiamond: '#b9f2ff',
};

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  colors: ThemeColors;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const systemColorScheme = useColorScheme();
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = storage.getString('theme');
    return (stored as Theme) || 'system';
  });

  const isDark = theme === 'system' 
    ? systemColorScheme === 'dark' 
    : theme === 'dark';

  const colors = isDark ? darkColors : lightColors;

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    storage.set('theme', newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, isDark, colors, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export function useColors() {
  const { colors } = useTheme();
  return colors;
}
