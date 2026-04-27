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
        sand: "#fff6f3",
        ink: "#23171d",
        clay: "#ff7f86",
        olive: "#f2a53d",
        cream: "#fffdfb",
        smoke: "#f5efee",
        berry: "#7c5462"
      },
      boxShadow: {
        card: "0 18px 48px rgba(45, 24, 32, 0.10)"
      }
    }
  },
  plugins: []
};

export default config;
