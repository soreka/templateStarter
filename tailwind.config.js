/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#e8f7f5",
          100: "#c9ebe7",
          200: "#9bd9d1",
          300: "#6ec6bb",
          400: "#3eb1a2",
          500: "#189a8b",
          600: "#0e9384",
          700: "#0c786b",
          800: "#0a5e55",
          900: "#084c45",
        },
      },
      borderRadius: { "2xl": 16, "3xl": 24 },
      boxShadow: { soft: "0 4px 16px rgba(0,0,0,0.08)" },
    },
  },
  plugins: [],
  presets: [require("nativewind/preset")],
};
