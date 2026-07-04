/// <reference types="vitest" />
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    open: false,
  },
  build: {
    target: "es2020",
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
