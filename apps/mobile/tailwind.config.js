/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("nativewind/preset")],
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#F4ECE6",
        foreground: "#242327",
        accent: "#C0987E",
        accentDark: "#9F7965"
      }
    }
  },
  plugins: []
};
