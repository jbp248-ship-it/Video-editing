import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#FFF8EB",
          100: "#FEECC8",
          200: "#FDD889",
          300: "#FBC44F",
          400: "#F59E0B",
          500: "#D97706",
          600: "#B45309",
          700: "#92400E",
          800: "#78350F",
          900: "#3D3929",
        },
        warm: {
          50: "#FAF9F6",
          100: "#F5F0EB",
          200: "#E8E2DB",
          300: "#C4BBB0",
          400: "#A89F91",
          500: "#8C8680",
          600: "#6B6560",
          700: "#4A4845",
          800: "#3D3929",
          900: "#2D2B28",
        },
        profit: "#16a34a",
        loss: "#dc2626",
        warning: "#D97706",
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "sans-serif"],
      },
      boxShadow: {
        "warm-sm": "0 1px 2px rgba(45, 43, 40, 0.05)",
        "warm": "0 1px 3px rgba(45, 43, 40, 0.06), 0 1px 2px rgba(45, 43, 40, 0.04)",
        "warm-md": "0 4px 12px rgba(45, 43, 40, 0.08), 0 2px 4px rgba(45, 43, 40, 0.04)",
        "warm-lg": "0 10px 24px rgba(45, 43, 40, 0.1), 0 4px 8px rgba(45, 43, 40, 0.06)",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
