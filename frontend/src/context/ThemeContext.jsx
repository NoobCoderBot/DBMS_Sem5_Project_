import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const KEY = 'stockflow_theme';

/** `chart` holds the few colours Recharts needs as literal values (SVG attributes cannot use CSS variables). */
export const THEMES = {
  stone: {
    label: 'Stone',
    hint: 'Warm paper tones with a rust accent',
    swatch: ['#efeae0', '#fbf9f4', '#9c4221', '#1c1814'],
    chart: { accent: '#9c4221', muted: '#cdc3b3', grid: '#e9e3d8', tick: '#7d7468', tooltipBg: '#fbf9f4', tooltipBorder: '#e3dcd0', tooltipText: '#1c1814', cursor: '#f3efe7' },
  },
  midnight: {
    label: 'Midnight',
    hint: 'Dark workspace for low light',
    swatch: ['#0d0f13', '#16191f', '#7aa2ff', '#0a0c0f'],
    chart: { accent: '#7aa2ff', muted: '#3a414d', grid: '#262c36', tick: '#8b93a1', tooltipBg: '#16191f', tooltipBorder: '#2b313b', tooltipText: '#f2f4f7', cursor: '#1b1f26' },
  },
  classic: {
    label: 'Classic',
    hint: 'Neutral light with a blue accent',
    swatch: ['#f6f7f8', '#ffffff', '#2347a8', '#111418'],
    chart: { accent: '#2347a8', muted: '#c4c4cb', grid: '#f1f1f3', tick: '#71717a', tooltipBg: '#ffffff', tooltipBorder: '#e4e4e7', tooltipText: '#18181b', cursor: '#fafafa' },
  },
};
const ORDER = Object.keys(THEMES);

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => (THEMES[localStorage.getItem(KEY)] ? localStorage.getItem(KEY) : 'stone'));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(KEY, theme);
  }, [theme]);

  const setTheme = useCallback((t) => THEMES[t] && setThemeState(t), []);
  const cycle = useCallback(() => setThemeState((t) => ORDER[(ORDER.indexOf(t) + 1) % ORDER.length]), []);

  const value = useMemo(() => ({ theme, setTheme, cycle, chart: THEMES[theme].chart }), [theme, setTheme, cycle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
