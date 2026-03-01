/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        nordic: {
          bg:           '#F4F4F1',
          surface:      '#FFFFFF',
          border:       '#E2E2DC',
          text:         '#1A1A1A',
          muted:        '#6B6B6B',
          subtle:       '#9A9A9A',
          navy:         '#1E3A5F',
          blue:         '#2C6FAC',
          'blue-light': '#EBF3FB',
          'blue-border':'#C8DDEF',
          green:        '#1A6B3C',
          'green-bg':   '#EBF7F0',
          'green-tag':  '#D1EFE0',
          red:          '#B91C1C',
          'red-bg':     '#FEF2F2',
          'red-tag':    '#FECACA',
          amber:        '#92400E',
          'amber-bg':   '#FFFBEB',
          'amber-tag':  '#FDE68A',
        },
      },
      animation: {
        'spin-slow': 'spin 1s linear infinite',
      },
    },
  },
  plugins: [],
};
