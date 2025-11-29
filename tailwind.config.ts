import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: "#1c1c1e",
          surface: "#2c2c2e",
          border: "#3a3a3c"
        },
        accent: {
          DEFAULT: "#e68a8a",
          hover: "#d57676",
          light: "#f2b5b5"
        },
        text: {
          main: "#ffffff",
          muted: "#a1a1aa"
        }
      },
      fontFamily: {
        serif: ["var(--font-lora)", "serif"],
        sans: ["var(--font-roboto)", "sans-serif"]
      },
      borderRadius: {
        pill: "9999px",
        bubble: "1.5rem",
        card: "2rem"
      },
      backgroundImage: {
        "luxury-glow": "radial-gradient(circle at 50% 0%, #2a1f1f 0%, #1c1c1e 60%)"
      }
    }
  },
  plugins: []
};

export default config;
