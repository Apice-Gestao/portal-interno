import { defineConfig } from "@playwright/test";
import localConfig from "./playwright.config";

export default defineConfig({
  ...localConfig,
  use: { ...localConfig.use, baseURL: "http://127.0.0.1:5174" },
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5174 --strictPort",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
