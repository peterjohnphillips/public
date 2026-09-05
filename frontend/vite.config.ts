import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxies /api to the FastAPI dev server so the frontend can call relative
// paths without hardcoding a port, and so the same relative-path code would
// still work behind a reverse proxy in a non-local deployment later.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
