import { defineConfig, loadEnv } from "vite-plus";
import devServer from "@hono/vite-dev-server";

const env = loadEnv("development", process.cwd(), "");

export default defineConfig({
  server: {
    port: parseInt(env.PORT) || 3001,
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
  build: {
    ssr: "./src/cmd/api/index.ts",
    outDir: "dist",
    rollupOptions: {
      // Keep modules that OpenTelemetry patches at runtime un-bundled so the
      // require/import hooks installed by instrumentation.mjs can intercept
      // them, and keep pino's transport workers resolvable by name.
      external: [/^@opentelemetry\//, "pino", "pino-pretty", "thread-stream"],
      output: {
        entryFileNames: "index.js",
      },
    },
  },
  plugins: [
    devServer({
      entry: "./src/cmd/api/app.ts",
    }),
  ],
  lint: {
    ignorePatterns: ["dist"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
