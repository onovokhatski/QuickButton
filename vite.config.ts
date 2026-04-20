import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: path.resolve(__dirname, "src/renderer"),
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: path.resolve(__dirname, "dist/renderer"),
    emptyOutDir: true
  },
  test: {
    root: path.resolve(__dirname),
    environment: "node",
    include: ["tests/**/*.test.js", "tests/**/*.test.ts"]
  }
});
