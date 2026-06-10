# ESM Migration — Design

**Date:** 2026-06-05
**Goal:** Convert the SEPAL Node.js codebase from CommonJS to native ESM: the shared libraries (`lib/js/shared`, `lib/js/ee`) and all Node modules. `email` and `gateway` are already done.

## Scope

**In scope**
- `lib/js/shared` — 52 `.js` files (3 already ESM: `event/definitions.js`, `event/systemEvents.js`, `db/mysql.js`).
- `lib/js/ee` — 89 `.js` files (all CJS; 54 are single-export `module.exports = <fn>` form).
- 13 CJS modules: `app-launcher`, `app-manager`, `ceo-gateway`, `gee`, `r-proxy`, `scene-metadata`, `ssh-gateway`, `sys-monitor`, `task`, `terminal`, `user-assets`, `user-files`, `user-storage`.
- Re-touch `email` + `gateway` when `#sepal/rxjs` flips to ESM (see Special Cases).

**Out of scope**
- `gui` — already ESM (Vite).
- Java/Groovy modules, infra-only modules, `lib/python`.

## Approach: shared lib first (Approach A, approved)

1. Convert `lib/js/shared` to ESM first.
2. Fix `gateway`'s two `#sepal/rxjs` default-import workarounds → clean named imports.
3. Convert `lib/js/ee`.
4. Convert the 13 modules one at a time, each with clean named imports (no interop workarounds needed, since shared/ee are ESM by then).

During the window after step 1, the not-yet-converted CJS modules load the ESM shared lib via Node 24's **`require(esm)`**.

## Verified interop facts

- **No top-level `await`** anywhere in `lib/js/shared` or `lib/js/ee` (all `await`s are inside async functions). → `require(esm)` is safe for interim CJS consumers. **Gated by an empirical test in Phase 0/1.**
- **ESM → CJS** already proven (email/gateway import the current CJS shared lib).
- **`module.exports = {named}`** → lexer-detectable named imports. **`module.exports = <single fn/value>`** → must become `export default`, and every importer must use a **default import**.

## Special cases catalog

| Case | Locations | Handling |
|---|---|---|
| Single-value export | shared: `assert.js`, `worker/job.js`, `worker/worker.js`, `test/*` fixtures; ee: 54 files | `export default`; importers switch to `import X from '…'` |
| Dynamic `require(var)` | shared `util.js:8` (`require(name)`), `worker/worker.js:33` (`require(jobPath)`) | `createRequire(import.meta.url)` |
| `__dirname` | shared `gdal.js`, `worker/factory.js`, `test/http-worker.js`, `test/ws.js` | `fileURLToPath(import.meta.url)` / `new URL('./x', import.meta.url)` |
| Already-ESM files | shared `event/definitions.js`, `event/systemEvents.js`, `db/mysql.js` | leave as-is; verify consumers' import style |
| `#sepal/rxjs` autoRetry | gateway `googleAccessToken.js`, `websocket-uplink.js` | after shared is ESM: `import rxjsExt …; const {autoRetry}=rxjsExt` → `import {autoRetry} from '#sepal/rxjs'` |
| Relative imports | everywhere | add `.js` extension |
| JSON imports | none found in shared/ee src | n/a |
| npm-pkg interop (prometheus `createRequire`, micromatch default) | gateway only | unaffected by shared flip — leave |
| Jest under ESM | shared (`gdal.test.js`, `tree/sTree.test.js`), ee tests, task test | test script gets `NODE_OPTIONS=--experimental-vm-modules` (as gateway) |

## Phases & verification

- **Phase 0 — Gate.** After converting shared, prove a still-CJS module (e.g. `terminal`) can `require('#sepal/log')`, `#sepal/httpServer`, `#sepal/messageQueue` etc. If `require(esm)` fails, fall back to Approach B.
- **Phase 1 — shared lib.** Convert all 52 files together (internally consistent). Fix gateway rxjs imports. **Verify:** `node --check` all; shared Jest suite (ESM); email + gateway containers boot clean + their tests; the Phase 0 `require(esm)` gate from a CJS consumer.
- **Phase 2 — lib/js/ee.** Convert 89 files. **Verify:** `node --check` all; import smoke-test of key `#sepal/ee/*` entrypoints; `gee` container boots.
- **Phase 3 — modules (one at a time).** For each: convert, `node --check`, run its test suite if any, confirm its container restarts cleanly under nodemon. `task` (sandbox-only, no standalone container): `node --check` + run its 1 test + import smoke-test. Commit per module.

## Risks & rollback

- **`require(esm)` failure** (unexpected TLA via a dep): Phase 0 gate catches it; fall back to Approach B (modules first).
- **Missed default-import**: a `module.exports = fn` file imported as named → `undefined`. Caught by `node --check` + boot/smoke tests; the catalog drives a per-file audit.
- **Rollback:** one git commit per phase/module; revert the offending commit.

## Out-of-scope confirmations
- `gui` untouched. Java modules untouched. No dependency version bumps.
