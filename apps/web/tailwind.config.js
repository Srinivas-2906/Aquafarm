/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0F5D5E',
          dark: '#0A4546',
          light: '#DDF2F0',
        },
        accent: '#D99021',
        background: '#F5F7F4',
        surface: '#FFFFFF',
        'text-primary': '#17211F',
        'text-secondary': '#5D6966',
        border: '#D9E0DD',
        success: '#27864B',
        warning: '#B66B12',
        danger: '#B83A3A',
        offline: '#6B5CA5',
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Noto Sans',
          'Noto Sans Telugu',
          'sans-serif',
        ],
      },
      minHeight: {
        touch: '48px',
      },
      minWidth: {
        touch: '48px',
      },
    },
  },
  plugins: [],
};
