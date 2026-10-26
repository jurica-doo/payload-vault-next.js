import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    // jsdom for component tests; pure domain files don't care either way.
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Placeholders so modules that create the Supabase client can be imported
    // in tests; every test mocks the calls it makes, nothing reaches this URL.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-placeholder",
    },
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/domain/**", "src/utils/**", "src/components/**"],
      exclude: ["**/*.test.*", "**/__fixtures__/**"],
    },
  },
});
