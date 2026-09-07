import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// VITE_BASE_PATH lets the same build be served from a sub-path of the portfolio site.
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
  build: {
    sourcemap: mode !== "production",
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
}));
