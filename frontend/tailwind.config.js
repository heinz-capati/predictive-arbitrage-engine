/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Tight"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'Fira Code', 'monospace'],
      },
      colors: {
        obsidian: {
          950: '#050505',
          900: '#0A0A0D',
          850: '#101016',
          800: '#16161E',
          700: '#22222E',
        },
        luxury: {
          bg: '#F9F9FB',
          forest: '#1F5E3B',
          champagne: '#B68D40',
        },
        quant: {
          bg: '#050505',
          cyan: '#00E5FF',
          purple: '#7A4DE8',
        },
      },
      boxShadow: {
        luxury: '0 22px 50px -12px rgba(15, 23, 42, 0.07), 0 4px 16px -4px rgba(15, 23, 42, 0.03)',
        'luxury-hover': '0 28px 60px -12px rgba(15, 23, 42, 0.11), 0 8px 24px -6px rgba(15, 23, 42, 0.05)',
        'tactile-btn': '0 10px 24px -6px rgba(31, 94, 59, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.18)',
        'tactile-gold': '0 10px 24px -6px rgba(182, 141, 64, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
      },
    },
  },
  plugins: [],
};
