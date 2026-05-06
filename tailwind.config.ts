import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#f7f2e8",
        paper: "#0d1117",
        moss: "#8fb9ad",
        coral: "#d89b8b",
        marigold: "#d7c783",
      },
      boxShadow: {
        soft: "0 22px 70px rgba(0, 0, 0, 0.32)",
      },
    },
  },
  plugins: [],
} satisfies Config;
