/** @type {import('tailwindcss').Config} */
// Every themable colour reads a CSS variable (see index.css), so a theme switch needs no re-render.
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;
const scale = (prefix, steps) => Object.fromEntries(steps.map((s) => [s, v(`--${prefix}-${s}`)]));

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Segoe UI Variable Text"', '"Segoe UI"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', '"Cascadia Mono"', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        zinc: scale('z', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        brand: scale('b', [50, 100, 500, 600, 700]),
        surface: v('--surface'),
        page: v('--page'),
        ink: { 900: v('--side') },
      },
      boxShadow: {
        pop: '0 12px 32px -8px rgb(0 0 0 / 0.28), 0 2px 6px -2px rgb(0 0 0 / 0.12)',
      },
      borderRadius: { DEFAULT: '4px', md: '6px', lg: '8px' },
    },
  },
  plugins: [],
};
