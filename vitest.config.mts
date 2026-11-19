import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd()),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["app/**/*.ts", "lib/**/*.ts"],
      reporter: ["text-summary", "text", "json-summary", "html"],
      reportsDirectory: "coverage",
      // Mínimo que pide la consigna. Si un PR baja la cobertura de esto, el CI falla.
      thresholds: {
        lines: 60,
        statements: 60,
        functions: 60,
        branches: 60,
      },
    },
  },
})
