import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/NVDA-at-a-Glance/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true
  }
});
