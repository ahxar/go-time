import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["dist/**", "dist-test/**", "node_modules/**"],
    globals: true,
  },
});
