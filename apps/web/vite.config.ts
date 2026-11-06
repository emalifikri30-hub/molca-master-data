import { defineConfig } from "vite-plus";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { lazyPlugins } from "vite-plus";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { fileURLToPath } from "node:url";

// master-data ports: web 3610, bff 3611, api 3012 (Keycloak 8180)
const BFF_TARGET = process.env.BFF_URL ?? "http://localhost:3611";

// https://vite.dev/config/
export default defineConfig({
  // `@/*` -> `src/*`, mirroring `paths` in tsconfig.app.json. Both are required:
  // TypeScript resolves types through tsconfig, the bundler through this alias.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 3610,
    // Proxy auth + API calls to the BFF so the browser stays same-origin and
    // the httpOnly session cookie is sent automatically. `/api/login`,
    // `/api/callback` and `/api/logout` issue redirects, so don't rewrite them.
    proxy: {
      "/api": { target: BFF_TARGET, changeOrigin: true },
      "/health": { target: BFF_TARGET, changeOrigin: true },
    },
  },
  // src/routeTree.gen.ts is rewritten by @tanstack/router-plugin on every dev/build
  // run and it formats the file itself. Leave it alone so oxfmt and the generator
  // don't overwrite each other forever. The root vite.config.ts repeats this
  // pattern, because the pre-commit hook (`vp staged`) runs the root config.
  fmt: {
    // files installed from the @molca registry stay byte-identical to the Design System
    ignorePatterns: [
      "src/routeTree.gen.ts",
      "src/components/ui/**",
      "src/components/molca/**",
      "src/components/blocks/**",
      "src/components/site/**",
      "src/lib/utils.ts",
      "src/lib/ink.ts",
      "src/lib/oee.ts",
      "src/styles/molca-theme.css",
      "src/hooks/use-mobile.ts",
    ],
  },
  lint: {
    plugins: ["oxc", "typescript", "unicorn", "react"],
    categories: {
      correctness: "warn",
    },
    env: {
      builtin: true,
    },
    ignorePatterns: [
      "dist",
      "**/routeTree.gen.ts",
      "src/components/ui/**",
      "src/components/molca/**",
      "src/components/blocks/**",
      "src/components/site/**",
      "src/lib/utils.ts",
      "src/lib/ink.ts",
      "src/lib/oee.ts",
      "src/styles/molca-theme.css",
      "src/hooks/use-mobile.ts",
    ],
    overrides: [
      {
        files: ["**/*.{ts,tsx}"],
        rules: {
          "constructor-super": "error",
          "for-direction": "error",
          "getter-return": "error",
          "no-async-promise-executor": "error",
          "no-case-declarations": "error",
          "no-class-assign": "error",
          "no-compare-neg-zero": "error",
          "no-cond-assign": "error",
          "no-const-assign": "error",
          "no-constant-binary-expression": "error",
          "no-constant-condition": "error",
          "no-control-regex": "error",
          "no-debugger": "error",
          "no-delete-var": "error",
          "no-dupe-class-members": "error",
          "no-dupe-else-if": "error",
          "no-dupe-keys": "error",
          "no-duplicate-case": "error",
          "no-empty": "error",
          "no-empty-character-class": "error",
          "no-empty-pattern": "error",
          "no-empty-static-block": "error",
          "no-ex-assign": "error",
          "no-extra-boolean-cast": "error",
          "no-fallthrough": "error",
          "no-func-assign": "error",
          "no-global-assign": "error",
          "no-import-assign": "error",
          "no-invalid-regexp": "error",
          "no-irregular-whitespace": "error",
          "no-loss-of-precision": "error",
          "no-misleading-character-class": "error",
          "no-new-native-nonconstructor": "error",
          "no-nonoctal-decimal-escape": "error",
          "no-obj-calls": "error",
          "no-prototype-builtins": "error",
          "no-redeclare": "error",
          "no-regex-spaces": "error",
          "no-self-assign": "error",
          "no-setter-return": "error",
          "no-shadow-restricted-names": "error",
          "no-sparse-arrays": "error",
          "no-this-before-super": "error",
          "no-unassigned-vars": "error",
          "no-undef": "error",
          "no-unexpected-multiline": "error",
          "no-unreachable": "error",
          "no-unsafe-finally": "error",
          "no-unsafe-negation": "error",
          "no-unsafe-optional-chaining": "error",
          "no-unused-labels": "error",
          "no-unused-private-class-members": "error",
          "no-unused-vars": "error",
          "no-useless-assignment": "error",
          "no-useless-backreference": "error",
          "no-useless-catch": "error",
          "no-useless-escape": "error",
          "no-with": "error",
          "preserve-caught-error": "error",
          "require-yield": "error",
          "use-isnan": "error",
          "valid-typeof": "error",
          "no-array-constructor": "error",
          "no-unused-expressions": "error",
          "typescript/ban-ts-comment": "error",
          "typescript/no-duplicate-enum-values": "error",
          "typescript/no-empty-object-type": "error",
          "typescript/no-explicit-any": "error",
          "typescript/no-extra-non-null-assertion": "error",
          "typescript/no-misused-new": "error",
          "typescript/no-namespace": "error",
          "typescript/no-non-null-asserted-optional-chain": "error",
          "typescript/no-require-imports": "error",
          "typescript/no-this-alias": "error",
          "typescript/no-unnecessary-type-constraint": "error",
          "typescript/no-unsafe-declaration-merging": "error",
          "typescript/no-unsafe-function-type": "error",
          "typescript/no-wrapper-object-types": "error",
          "typescript/prefer-as-const": "error",
          "typescript/prefer-namespace-keyword": "error",
          "typescript/triple-slash-reference": "error",
          "react/rules-of-hooks": "error",
          "react/exhaustive-deps": "warn",
          "react/only-export-components": [
            "error",
            {
              allowConstantExport: true,
              // `createFileRoute(path)({ component })` and
              // `createRootRouteWithContext<T>()({ component })` wrap the route
              // component. Declaring them as HOCs lets oxlint treat the `Route`
              // export as a component export, so route files can keep their
              // component local — the shape the router plugin scaffolds.
              customHOCs: ["createFileRoute", "createRootRouteWithContext"],
              // shadcn/ui exports its cva variant helper next to the component;
              // both are HMR-safe.
              allowExportNames: ["buttonVariants", "badgeVariants"],
            },
          ],
        },
        env: {
          browser: true,
        },
      },
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
    },
  },
  plugins: lazyPlugins(() => [
    // Must come first: the plugin rewrites route files before babel/react-compiler
    // touches them, and with autoCodeSplitting on it throws a plugin-order error
    // if it sits after @vitejs/plugin-react.
    // Note: lazyPlugins means this does NOT run during `vp check` — that's why
    // src/routeTree.gen.ts is committed rather than generated on demand.
    tanstackRouter({
      target: "react",
      // Stated explicitly (they match the defaults) because the fmt/lint ignore
      // patterns above and the CI freshness check both hardcode these paths.
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
      quoteStyle: "double",
      semicolons: true,
      // Off for now: unverified against rolldown-vite, and with four routes there
      // is no bundle win to be had. See apps/web/README.md.
      autoCodeSplitting: false,
    }),
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ]),
});
