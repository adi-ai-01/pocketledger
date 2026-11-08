import React, { createContext, useContext, useState, useEffect } from 'react';

export const THEMES = [
  { id: 'fantasy', name: 'Fantasy', desc: 'Dark medieval, muted gold, Stark sigil', font: 'Cinzel' },
  { id: 'elden', name: 'Elden', desc: 'Grace & runes, parchment, crossed swords', font: 'Cinzel' },
  { id: 'cyber', name: 'Cyber', desc: 'Neon cyan/purple, S-Rank badge, arcane FAB', font: 'Rajdhani' },
  { id: 'pixel', name: 'Pixel', desc: '8-bit stone GUI, XP bar, pixel heart & sword', font: 'Press Start 2P' },
];

const ThemeContext = createContext({
  theme: 'fantasy',
  setTheme: () => {},
  themes: THEMES,
});

const THEME_STORAGE_KEY = 'pocketledger_theme';

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved && THEMES.some((t) => t.id === saved)) {
        return saved;
      }
    } catch {
      // LocalStorage access issue
    }
    return 'fantasy';
  });

  const setTheme = (newTheme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      // Silent catch
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);

    // Dynamic theme-color meta tag for mobile browsers / PWA
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      const themeColors = {
        fantasy: '#111116',
        elden: '#08080a',
        cyber: '#060714',
        pixel: '#1e1e1e',
      };
      metaThemeColor.setAttribute('content', themeColors[theme] || '#0a0a0f');
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
