import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#111111",
          card: "#1A1A1A",
          elevated: "#222222",
          subtle: "#161616",
        },
        accent: {
          DEFAULT: "#FF3D00",
          hover: "#FF5722",
          muted: "rgba(255,61,0,0.15)",
        },
        cyan: {
          DEFAULT: "#00C2FF",
          muted: "rgba(0,194,255,0.15)",
        },
        success: {
          DEFAULT: "#00D97E",
          muted: "rgba(0,217,126,0.15)",
        },
        warn: {
          DEFAULT: "#F2C94C",
          muted: "rgba(242,201,76,0.15)",
        },
        danger: {
          DEFAULT: "#FF4D4D",
          muted: "rgba(255,77,77,0.15)",
        },
        text: {
          primary: "#E0E0E0",
          muted: "#6B7280",
          dim: "#9CA3AF",
        },
        border: {
          DEFAULT: "rgba(255,255,255,0.08)",
          strong: "rgba(255,255,255,0.16)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 0 0 1px rgba(255,255,255,0.06)",
        glow: "0 0 24px rgba(255,61,0,0.25)",
      },
      keyframes: {
        "progress-shimmer": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(200%)" },
        },
        "progress-glow": {
          "0%, 100%": { opacity: "0.85" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "progress-shimmer": "progress-shimmer 1.4s ease-in-out infinite",
        "progress-glow": "progress-glow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
