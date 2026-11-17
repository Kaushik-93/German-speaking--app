import { defineConfig } from "vite";

// Relative base so the app works on GitHub Pages (/<repo>/) or any static host.
export default defineConfig({
  base: "./",
  build: { target: "es2020" },
});
