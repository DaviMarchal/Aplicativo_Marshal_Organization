/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./client/index.html", "./client/js/**/*.js"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          900: "var(--bg-900)",
          800: "var(--bg-800)",
          700: "var(--bg-700)",
        },
        stroke: "var(--stroke)",
        glass: "var(--glass)",
        text: {
          hi: "var(--text-hi)",
          mid: "var(--text-mid)",
          lo: "var(--text-lo)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          soft: "var(--accent-soft)",
        },
        blue: {
          glow: "var(--blue-glow)",
          soft: "var(--blue-soft)",
        },
        positive: "var(--green)",
        negative: "var(--red)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "20px",
        pill: "999px",
      },
      backdropBlur: {
        card: "20px",
      },
      boxShadow: {
        "glow-blue": "0 20px 60px rgba(35,101,255,.35), inset 0 1px 0 rgba(255,255,255,.08)",
        "glow-accent": "0 20px 60px rgba(255,122,0,.35)",
        card: "0 8px 30px rgba(0,0,0,.35)",
      },
      transitionTimingFunction: {
        snap: "cubic-bezier(.2,.8,.2,1)",
      },
    },
  },
  plugins: [],
};
