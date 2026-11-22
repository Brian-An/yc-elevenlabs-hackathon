import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Server unit tests mock Wasp's server imports. The app's Vite config rejects
// those imports in browser bundles before Vitest can apply the mock.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
