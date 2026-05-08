/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#1A2E4A',
          50: '#E2E8F0',
          100: '#C8D5E8',
          200: '#9FBBD5',
          300: '#6B93B8',
          400: '#3A6A99',
          500: '#1A2E4A',
          600: '#152540',
          700: '#101C32',
          800: '#0B1323',
          900: '#060A14',
        },
        orange: {
          DEFAULT: '#FF8C00',
          50: '#FFF4E0',
          100: '#FFE4AD',
          200: '#FFD07A',
          300: '#FFBC47',
          400: '#FFA814',
          500: '#FF8C00',
          600: '#CC7000',
          700: '#995400',
          800: '#663800',
          900: '#331C00',
        },
      },
      fontFamily: {
        sans: ['Montserrat', 'sans-serif'],
        arabic: ['Almarai', 'sans-serif'],
        cairo: ['Cairo', 'sans-serif'],
      },
      boxShadow: {
        navy: '0 4px 20px rgba(26, 35, 58, 0.08)',
        'navy-lg': '0 8px 40px rgba(26, 35, 58, 0.12)',
        'orange-glow': '0 4px 20px rgba(255, 140, 0, 0.25)',
      },
    },
  },
  plugins: [],
};
