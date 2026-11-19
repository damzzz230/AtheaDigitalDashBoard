import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5178, strictPort: true },
  preview: { port: 5179, strictPort: true },
  build: { sourcemap: false, target: "es2022" },
  test: {
    include: ["src/**/*.test.ts", "netlify/**/*.test.ts"],
    environment: "node",
  },
});
