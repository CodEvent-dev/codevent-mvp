/**
 * Configuration Tailwind CSS.
 * Compile localement (aucune police ni CDN distants).
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./views/**/*.ejs",
    "./public/js/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        mairie: {
          50: "#eef5fb",
          100: "#d5e6f4",
          200: "#a9cce7",
          300: "#6eabd4",
          400: "#3d86b8",
          500: "#1d5f91",
          600: "#164c76",
          700: "#123b5c",
          800: "#0e2c45",
          900: "#0a1f32",
        },
        or: {
          400: "#d4b36a",
          500: "#c4a35a",
        },
      },
      fontFamily: {
        sans: [
          "Segoe UI",
          "system-ui",
          "-apple-system",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        lift: "0 10px 40px -12px rgba(18, 59, 92, 0.18)",
        soft: "0 1px 2px rgba(15, 36, 68, 0.04), 0 8px 24px rgba(15, 36, 68, 0.06)",
      },
    },
  },
  plugins: [],
};
