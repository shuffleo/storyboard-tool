/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // Disable dark mode - we force light mode
  theme: {
    extend: {},
  },
  plugins: [],
}

