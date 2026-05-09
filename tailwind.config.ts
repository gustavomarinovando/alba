import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--color-ink)",
        paper: "var(--color-paper)",
        surface: "var(--color-surface)",
        surfaceVariant: "var(--color-surface-variant)",
        outline: "var(--color-outline)",
        moss: "var(--color-moss)",
        mossLight: "var(--color-moss-light)",
        coral: "var(--color-coral)",
        coralLight: "var(--color-coral-light)",
        marigold: "var(--color-marigold)",
        marigoldLight: "var(--color-marigold-light)",
        primary: "var(--color-primary)",
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        medium: "var(--shadow-medium)",
        glass: "0 8px 32px 0 rgba(31, 38, 135, 0.37)",
      },
      backgroundImage: {
        'glass-gradient': "linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0))",
      }
    },
  },
  plugins: [],
} satisfies Config;
