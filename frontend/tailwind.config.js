/**
 * Tailwind v4 reads its theme from CSS via `@theme` in src/app/globals.css.
 * This file is kept as a reference/editor hint and declares the same design
 * tokens. The authoritative source of truth is `globals.css`.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-navy': '#1A2B4C',
        'brand-slate': '#2C3E50',
        'accent-terracotta': '#E07A5F',
        'accent-terracotta-hover': '#C86A52',
        'bg-pearl': '#F7F9FC',
        'surface-white': '#FFFFFF',
        'text-main': '#222222',
        'text-muted': '#6C757D',
      },
      fontFamily: {
        display: ['var(--font-outfit)', 'Outfit', 'Merriweather', 'ui-serif', 'Georgia', 'serif'],
        body: ['var(--font-inter)', 'Inter', 'Roboto', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
