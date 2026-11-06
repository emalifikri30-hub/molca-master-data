# Master Data · MolcaDx MAM

The master data of MolcaDx MAM: the site hierarchy (ISA-95), assets, their placement on work units, asset
classes and types. Maintenance, Production and Quality read it and keep only ids; changes are made here.

Forked on 6 Nov 2026 from the platform team's MES Master Data (`_ref/dx-master-data`), which stays the
reference and is not changed. Decision: ADR-MNT-021 in Product Foundation.

| App        | Port | What                                                                                                     |
| ---------- | ---- | -------------------------------------------------------------------------------------------------------- |
| `apps/web` | 3610 | New web on the Molca Design System (same shell as MolcaDx Maintenance): Overview, Assets, Site hierarchy |
| `apps/bff` | 3611 | The MolcaDx Maintenance BFF: dev auto-login (no sign-in screen until production), proxy to the API       |
| `apps/api` | 3012 | Copied from the MES Master Data: same `/api/v1` contract, database `md_local`                            |

## Run

```bash
pnpm install
(cd apps/api && vp dev)   # 3012, reads apps/api/.env
(cd apps/bff && vp dev)   # 3611, reads apps/bff/.env (DEV_AUTO_LOGIN_* — never in production)
(cd apps/web && vp dev)   # 3610
```

`md_local` was created as a copy of the MES `master_data` database at fork time, so asset ids MolcaDx
Maintenance already stores keep matching. MolcaDx Maintenance points `MASTER_DATA_API_URL` at 3012 and links
to 3610 (`VITE_MASTER_DATA_WEB_URL` in other environments).

## Rules

- Keep the API contract (`/api/v1/...` paths and shapes) compatible with the MES Master Data, so either can
  serve MolcaDx modules by changing a URL.
- The web follows the MolcaDx MAM UI patterns: count strip on top, list left and detail right, act in place,
  ID/EN, fits 375 px.
- Next screens: hierarchy editing, asset classes & types, placements history, tags (CBM points), units.
