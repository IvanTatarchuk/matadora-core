/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: {
          900: "#0d0f14",
          800: "#131720",
          700: "#1a2030",
          600: "#222840",
        },
        accent: {
          DEFAULT: "#6366f1",
          hover:   "#818cf8",
          muted:   "#3730a3",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      animation: {
        "pulse-soft": "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
        "fade-in":    "fadeIn 0.2s ease-out",
      },
      keyframes: {
        fadeIn: { from: { opacity: 0, transform: "translateY(4px)" }, to: { opacity: 1, transform: "translateY(0)" } },
      },
    },
  },
  plugins: [],
};
