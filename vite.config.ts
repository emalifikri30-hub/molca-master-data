import { defineConfig } from "vite-plus";

// TanStack Router regenerates this file on every Vite/Vitest start in its own
// style (single quotes, no trailing commas). Formatting or linting it just
// makes it flip between "clean" and "dirty".
const GENERATED = ["**/routeTree.gen.ts"];

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: { ignorePatterns: GENERATED },
  lint: { ignorePatterns: GENERATED, options: { typeAware: true, typeCheck: true } },
  run: {
    cache: true,
  },
});
