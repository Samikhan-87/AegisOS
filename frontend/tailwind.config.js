/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Outfit"', '"Inter"', 'sans-serif'],
        heading: ['"Outfit"', '"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        axora: {
          bg: '#0C0D12',
          surface: '#141620',
          elevated: '#1A1C28',
          border: '#232636',
          text: '#F3F4F8',
          subtext: '#94A3B8',
          muted: '#64748B',
        }
      }
    },
  },
  plugins: [],
}
