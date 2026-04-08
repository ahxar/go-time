import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  platform: "node",
  sourcemap: true,
  minify: true,
  target: "es2022",
});
