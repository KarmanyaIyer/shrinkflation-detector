import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// The site is served from a sub-path of the portfolio site in production, with the API on
// another origin. Both come from environment variables so the same build works anywhere:
//   VITE_BASE_PATH   public path of the site, default "/"
//   VITE_API_BASE    API base URL used by the browser, default "/api" (proxied in dev)
//   VITE_USE_FIXTURES  "1" serves fixture data instead of calling the API (dev and tests)
//   DEV_API_PROXY_TARGET  where the dev server forwards /api, default the local backend
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  return {
    base: env.VITE_BASE_PATH || "/",
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: env.DEV_API_PROXY_TARGET || "http://127.0.0.1:8000",
          changeOrigin: true,
        },
      },
    },
    build: {
      sourcemap: mode !== "production",
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      globals: true,
      css: false,
    },
  };
});
