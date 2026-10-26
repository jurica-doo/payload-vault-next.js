import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    // jsdom for component tests; pure domain files don't care either way.
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/domain/**", "src/utils/**", "src/components/**"],
      exclude: ["**/*.test.*", "**/__fixtures__/**"],
    },
  },
});
