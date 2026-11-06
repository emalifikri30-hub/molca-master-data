import { register } from "node:module";

// The API sources import sibling files as `.js` (the project rule). This
// loader lets `db:seed` run those sources directly, before they are compiled.
register(new URL("./seed-resolve-hook.mjs", import.meta.url));
