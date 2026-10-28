import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * RoofFlow AI — light/dark theme provider.
 *
 * The product has exactly two themes: Obsidian (dark) and Cream (light).
 * The toggle lives in the Layout top bar and its only side effects are:
 *   - `document.documentElement.classList.toggle('dark')`
 *   - `localStorage["roof-flow-theme"]`
 *
 * SSR-safe: this app is also served as a static bundle behind the site
 * server, so every `window` / `localStorage` / `document` access is guarded
 * and the server renders the same markup as the first client render
 * (dark is the brand default; the pre-paint script in index.html applies the
 * stored choice before React hydrates, so there is no flash and no mismatch).
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'roof-flow-theme';

interface ThemeContextValue {
  theme: Theme;
  /** True only after the client has mounted (used to avoid SSR mismatch). */
  mounted: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/** Reads the persisted choice. Returns null on the server / when unset. */
function readStoredTheme(): Theme | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  try {
    const stored = window.localStorage?.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    // Private mode / storage disabled — fall through to the default.
    return null;
  }
}

/** Applies the theme to <html> so every token in index.css flips at once. */
function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Server + first client render both start from the brand default (dark).
  const [theme, setThemeState] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = readStoredTheme();
    const initial: Theme = stored ?? 'dark';
    setThemeState(initial);
    applyTheme(initial);
    setMounted(true);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage?.setItem(STORAGE_KEY, next);
      } catch {
        // Storage unavailable — the in-memory choice still applies.
      }
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({ theme, mounted, setTheme, toggleTheme }),
    [theme, mounted, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside a ThemeProvider');
  return ctx;
}

export { STORAGE_KEY as THEME_STORAGE_KEY };
