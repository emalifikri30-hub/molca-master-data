# `shared/` — cross-cutting infrastructure

Code here is feature-agnostic and may be imported by any `module/<feature>/`.
Feature-specific code belongs in its module, not here.

## Layout

| Folder            | Holds                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config/`         | Environment loading and the `AppConfig` type.                                                                                                      |
| `database/`       | Postgres connection (`postgres.ts`), Drizzle `schema/`, `relations/`, and `migration/`.                                                            |
| `helper/`         | **Framework/HTTP-aware** helpers — depend on Hono/Zod/`WebResponse` (`error.ts`, `validator.ts`).                                                  |
| `middleware/`     | Hono middleware (`jwt.ts`) and the claim/context types it sets (`claims.ts`).                                                                      |
| `network/`        | The HTTP response envelope (`response.ts` → `WebResponse`, `buildPageMeta`) and pagination types (`page.ts` → `PageMeta`, `Paged`, `PagedResult`). |
| `util/`           | **Pure, framework-agnostic** utilities — no Hono/HTTP imports (`constant.ts`, `serializer.ts`, `logger.ts`).                                       |
| `infra-module.ts` | Awilix `registerInfra` — the shared analog of each feature's `*-module.ts`.                                                                        |

## `helper/` vs `util/`

The single distinction: **does it know about the web framework?**

- `helper/` may import Hono, Zod, `WebResponse`, `HTTPException`, etc.
- `util/` is pure — given the same inputs it returns the same outputs, with no
  framework dependency. Anything in `util/` could be lifted into another project
  unchanged.

When adding a file, place it by that rule rather than by "it's a small helper".
