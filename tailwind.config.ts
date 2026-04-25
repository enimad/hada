import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        sand: "#efe7da",
        ink: "#1f1a17",
        clay: "#b56a52",
        olive: "#6d7c4f",
        cream: "#faf6ef"
      },
      boxShadow: {
        card: "0 14px 40px rgba(31, 26, 23, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
