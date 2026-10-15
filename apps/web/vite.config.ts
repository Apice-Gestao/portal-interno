import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: { outDir: "../../dist", emptyOutDir: true, sourcemap: false },
  server: {
    allowedHosts: ["127.0.0.1", "localhost"],
    proxy: { "/api": { target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3001", changeOrigin: true } },
  },
});
