import React, { createContext, useContext, useState, useEffect } from 'react';

export const THEMES = [
  { id: 'graphite', name: 'Graphite', desc: 'Universal modern graphite & steel blue', font: 'Inter' },
];

const THEME_STORAGE_KEY = 'pocketledger_theme';

const ThemeContext = createContext({
  theme: 'graphite',
  setTheme: () => {},
  themes: THEMES,
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      // Migrate or normalize any legacy saved theme (fantasy, elden, cyber, pixel) to graphite
      if (saved && saved !== 'graphite') {
        localStorage.setItem(THEME_STORAGE_KEY, 'graphite');
      }
    } catch {
      // LocalStorage access issue
    }
    return 'graphite';
  });

  const setTheme = (newTheme) => {
    setThemeState('graphite');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, 'graphite');
    } catch {
      // Silent catch
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'graphite');

    // Dynamic theme-color meta tag for mobile browsers / PWA
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', '#0b0d12');
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: 'graphite', setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
