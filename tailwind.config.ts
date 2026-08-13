import type { Config } from "tailwindcss";

/**
 * Colours resolve to CSS custom properties defined in styles/globals.css, so a
 * single class works in both themes and light/dark follows the OS with no JS.
 *
 * `rgb(var(--x) / <alpha-value>)` keeps Tailwind's opacity modifiers working
 * (`bg-surface/60`, `border-critical/25`).
 */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Current vocabulary ──────────────────────────────────────────
        canvas: token("canvas"),
        surface: {
          DEFAULT: token("surface"),
          raised: token("surface-raised"),
        },
        sunken: token("surface-sunken"),
        ink: {
          DEFAULT: token("ink"),
          secondary: token("ink-secondary"),
          muted: token("ink-muted"),
        },
        line: {
          DEFAULT: token("line"),
          strong: token("line-strong"),
        },
        accent: {
          DEFAULT: token("accent"),
          hover: token("accent-hover"),
          contrast: token("accent-contrast"),
          wash: token("accent-wash"),
          // legacy alias — `accent-muted` is used widely for tinted fills
          muted: token("accent-wash"),
        },
        positive: { DEFAULT: token("positive"), wash: token("positive-wash") },
        caution: { DEFAULT: token("caution"), wash: token("caution-wash") },
        critical: { DEFAULT: token("critical"), wash: token("critical-wash") },
        info: { DEFAULT: token("info"), wash: token("info-wash") },

        // ── Legacy vocabulary ───────────────────────────────────────────
        // Kept so existing components theme correctly without edits. Prefer
        // the names above in new code.
        bg: {
          DEFAULT: token("canvas"),
          card: token("surface"),
          elevated: token("surface-raised"),
          subtle: token("surface-sunken"),
        },
        text: {
          primary: token("ink"),
          dim: token("ink-secondary"),
          muted: token("ink-muted"),
        },
        border: {
          DEFAULT: token("line"),
          strong: token("line-strong"),
        },
        cyan: { DEFAULT: token("info"), muted: token("info-wash") },
        success: { DEFAULT: token("positive"), muted: token("positive-wash") },
        warn: { DEFAULT: token("caution"), muted: token("caution-wash") },
        danger: { DEFAULT: token("critical"), muted: token("critical-wash") },
      },
      fontFamily: {
        // Inter is loaded in app/layout.tsx; the cv* features set in
        // globals.css tune its letterforms for UI density.
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "JetBrains Mono",
          "Menlo",
          "monospace",
        ],
      },
      borderRadius: {
        lg: "0.625rem",
        xl: "0.875rem",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow-md)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        focus: "var(--shadow-focus)",
        // legacy alias — was a hard orange glow, now a restrained lift
        glow: "var(--shadow-md)",
        card: "var(--shadow-sm)",
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
        "fade-in": {
          from: { opacity: "0", transform: "translateY(2px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        "progress-shimmer": "progress-shimmer 1.4s ease-in-out infinite",
        "progress-glow": "progress-glow 2s ease-in-out infinite",
        "fade-in": "fade-in 200ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
