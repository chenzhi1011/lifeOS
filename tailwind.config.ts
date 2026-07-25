import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1d2528",
        moss: "#4d7c59",
        leaf: "#7fb069",
        bark: "#8b5e3c",
        sun: "#d9a441",
        water: "#4f8ca8",
        soil: "#f4efe6"
      }
    }
  },
  plugins: []
};

export default config;
