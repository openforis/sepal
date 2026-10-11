# Apps: multiple instances of the same app — same/distinct workers, same/distinct browser tabs

Date: 2026-08-03 · Branch: `sepal-node` · Verified partly live on the dev stack (two concurrent sessions started, association override observed, then cleaned up).

## Scope and definitions

- **"Worker"** = a worker session = one dedicated sandbox container/instance for one user (1:1 session↔instance, `worker.worker_session`).
- **"App instance"** = an independent running copy of the app: its own R session (Shiny), its own kernel (Voila), its own rsession (RStudio), its own frontend+kernel set (JupyterLab), its own virtual kernel (Solara).
- **"App tab"** = a tab in the SEPAL GUI's Apps section (the in-page tab bar, max 10), not a browser tab.
- The four questions:
  - **Q1** — single browser, multiple app tabs, same app, **same worker**
  - **Q2** — single browser, multiple app tabs, same app, **distinct workers**
  - **Q3** — two browsers, same app, **same worker**
  - **Q4** — two browsers, same app, **distinct workers**

Two scoping facts frame everything below:

- **Server-side state is browser-agnostic.** The app→session binding (`worker.session_app`) and request routing live in the worker/gateway, keyed by *username* — so Q2 and Q4 have identical answers, and a second browser always joins the same worker as the first.
- **Client-side state is per browser page.** The GUI's tab list (Redux, in-memory) and the `single: true` dedup are scoped to one loaded GUI page — so they constrain Q1 but are powerless across browsers (Q3). Likewise the cookie jar is per browser: cookie-collision hazards apply within one browser, not across two.

## App groups

The catalog (`apps.json`, served by app-manager) yields five behavioral groups, keyed by `endpoint` and the `single` flag:

| Group | Examples | endpoint | single | Runs where |
|---|---|---|---|---|
| A. Shiny catalog apps | bfast-explorer, bfastspatial, sae-analysis | `shiny` | no | user's sandbox worker, shiny-server :3838 |
| B. Voila catalog apps | sepal_pysmm, sdg_15.3.1, ~20 others | `jupyter` | no | user's sandbox worker, jupyter server :8888 |
| C. Tool apps | RStudio, Jupyter Notebook, JupyterLab | `rstudio`/`jupyter` | **yes** | user's sandbox worker (:8787 / :8888) |
| D. Docker apps | sepal_mgci, se.plan, sepal-gee-bundle | `docker` | no | **shared** app-launcher host, one container per app for ALL users |
| E. Link apps | (plain URL entries) | none | no | external |

Group D and E never touch worker sessions at all (`SANDBOX_ENDPOINTS = ['shiny','jupyter','rstudio']`, `modules/gui/src/app/home/body/apps/app.jsx:22`); "workers" questions are N/A for them.

## Answer matrix

| Group | Q1 one browser, multiple app tabs / same worker | Q2 one browser, multiple app tabs / distinct workers | Q3 two browsers / same worker | Q4 two browsers / distinct workers |
|---|---|---|---|---|
| A. Shiny apps | ✅ yes — independent R sessions | ❌ no — app pinned to one session | ✅ yes | ❌ no |
| B. Voila apps | ✅ yes — one kernel per render | ❌ no | ✅ yes | ❌ no |
| C1. JupyterLab / Notebook | ❌ GUI blocks (`single`) — backend would allow | ❌ no | ⚠️ works (`single` can't reach across browsers), but shared docs/kernels, no co-editing (last-save-wins) | ❌ no |
| C2. RStudio | ❌ GUI blocks (`single`) | ❌ no | ❌ effectively no — `single` can't block it, and the 2nd browser **takes over** the single rsession | ❌ no |
| D. Docker apps | ✅ yes — independent framework sessions | N/A — one shared runtime platform-wide, no workers | ✅ yes | N/A |
| E. Link apps | ✅ (whatever the external site allows) | N/A | ✅ | N/A |

Everything in the "distinct workers" columns for sandbox apps is **no**, and it is a single mechanism that makes it so — see Limitation 1.

## Why — the mechanisms

### One-session-per-app binding (the Q2/Q4 blocker — ours)

Each app a user opens is bound to exactly **one** worker session, platform-wide:

- Worker DB: `worker.session_app` with **`PRIMARY KEY (username, app_path)`** (`modules/worker/migrations/001.do.schema.sql`).
- The binding is permanent while live: `sessionManager.associateApp` returns the pre-existing association unchanged; it never moves an app (`modules/worker/src/workerSession/sessionManager.js:131-155`, "Design Decision 4").
- The gateway enforces it too: a live association **overrides an explicit instance pick** and returns `reused: true` (`modules/gateway/src/sandbox/sandboxSessionManager.js:287-303`).

**Verified live** (dev stack, 2026-08-03): started `bfast-explorer` → session `c24fead7…` on instance A (T3aSmall); re-posted `/api/sandbox/start` for the same appPath with explicit `instanceType=T3aMedium` → response `{"id":"c24fead7…","status":"STARTED","reused":true}` — no second worker. Starting a *different* app (`bfastspatial`) with `instanceType=T3aMedium` did create a second concurrent session on a distinct instance, and both apps' traffic was routed to their own workers. So: **N workers per user is fully supported; N workers per app is not.**

The root cause is *routing*, not the DB schema. The browser URL carries **no session discriminator** — the iframe src is just `/api` + catalog path (e.g. `/api/sandbox/shiny/bfast-explorer`), no session id in path or cookie. The gateway attributes each request to a worker via a heuristic chain (`sandboxSessionManager.js:444-497`): ① Jupyter kernel-id probe → ② longest appPath prefix match → ③ Referer path match → ④ single-candidate fallback → ⑤ legacy "best active session". If the same appPath lived on two workers, requests would be **indistinguishable**. The `(username, app_path)` PK is the guard that keeps the heuristic sound.

### Multiple app tabs / two browsers of the same app → same worker (Q1/Q3)

Nothing prevents duplicate app tabs for non-`single` apps: opening the same app again skips the picker and joins the existing association (`app.jsx:78-96`). Two browsers share nothing client-side (Redux is in-memory, no localStorage for apps) — the only shared state is server-side (`session_app`, plus each browser's own login session) — so a second browser also lands on the same worker. Whether the duplicate tabs/browsers are *independent app instances* then depends entirely on the upstream server:

| Server | Behavior with 2 concurrent connections |
|---|---|
| shiny-server (open source, default scheduler) | ✅ independent sessions, up to `maxRequests` 100 — but **one shared R process per app** (CPU/memory contention) |
| jupyter/Voila | ✅ one fresh kernel per Voila render — truly independent |
| JupyterLab/Notebook | ⚠️ accepted (no token/password, XSRF off), but `jupyter-collaboration` is **not installed** (and explicitly disabled in `modules/sandbox/script/voila.py:84-88`) → two frontends editing the same notebook silently overwrite each other (last-save-wins), and kernels are shared |
| rserver (open source, `--auth-none 1`, single OS user) | ❌ one active rsession per user: **the second browser takes over and the first is disconnected/suspended** |

### The `single: true` flag (ours, trivial)

RStudio, Jupyter Notebook and JupyterLab carry `single: true` in the deployed `apps.json`; the GUI then selects the existing app tab instead of opening a second (`app.jsx:78-83`). This is catalog *data*, not code — and it is enforced against the *current page's* running-tabs list only. It papers over the RStudio takeover and the Jupyter no-RTC problems within one browser, but does nothing across browsers: a second browser (or even a second browser tab of the same GUI) has its own tab state and happily opens RStudio again, triggering the takeover (Q3).

### Duplicate-tab close hazard (ours, real bug-shaped)

Closing **any** app tab fires `DELETE /api/sandbox/start?appPath=` and drops the `(username, app_path)` association server-side (`modules/gui/src/apps.js:61-71` → `sessionManager.dissociateApp`) — even if another tab (same or other browser) still shows the app. The surviving tab's requests then fall through to fallback attribution ④/⑤ and, when the user has multiple sessions, can be routed to the **wrong worker** (app code is on a shared mount, so it may even "work" there, silently losing in-memory state). A per-appPath refcount in the gateway (or GUI) would fix this.

## Live finding: two *different* jupyter apps on two workers only *appear* to work

Observed live (2026-08-03) with JupyterLab bound to worker A (T3aSmall) and Jupyter Notebook bound to worker B (T3aMedium), same browser, two app tabs — the exact configuration the design plan flagged as the only one exercising the kernel probe (`docs/superpowers/plans/2026-07-10-app-instance-requirements.md:2669`). Temporarily instrumented `resolveTarget` and sampled ~225 live requests:

- **100% of browser requests arrived with `referer=null`.** Jupyter apps are loaded via `document.write` into the iframe (`appInstance.jsx:122-125`), so the document has no sandbox URL to send as Referer — attribution step ③ is **dead in practice** for the jupyter endpoint, independent of the `Referrer-Policy: no-referrer` issue.
- Only paths that literally contain the appPath matched step ② (`/api/sandbox/jupyter/lab/api/workspaces`, and each app's initial page load).
- **All shared-prefix Jupyter API traffic** — `/api/contents`, `/api/kernels`, `/api/sessions`, `/api/terminals`, `/api/metrics/v1`, `/api/events/subscribe` — fell through to fallback ⑤ and was routed to **one single worker** (the Lab one). Worker B's Jupyter server showed `last_activity` frozen at its initial page load; netstat showed 24 established connections on worker A's :8888 vs 1 on worker B's.

Consequences:

- The Notebook tab is **actually operating against the Lab worker's server**. Any notebook opened and any kernel started from it runs on worker A; worker B sits idle while the user believes they are using it. The shared home mount makes this invisible — file listings are identical either way.
- Voila catalog apps are largely immune: their render URL carries the full appPath (step ②) and the kernel is created server-side during the render, after which the kernel-id probe (step ①) pins the websocket correctly. The broken case is specifically the **tool apps** (Lab/Notebook), whose REST API paths carry no app identity.
- **Idle auto-shutdown interaction**: `recordActivity` credits whichever session attribution picked. The bypassed worker accrues *zero* user activity, so the idle-shutdown feature will warn and close it while its tab is open and apparently in use — and conversely the fallback worker is kept alive by traffic that "belongs" to the other one.
- Billing/resource mismatch: the user pays for worker B's instance type while their kernels actually consume worker A.

*Practical takeaway: today, opening JupyterLab and Jupyter Notebook on two different instances is worse than opening them on one — same worker sharing, plus a phantom instance that burns budget and will be idle-reaped.* The fallback-disabling mitigation the plan mentions (grey out instances already running a different jupyter app in the picker) or a session discriminator in the URL (Limitation 1 below) would both fix it.

## Limitations and solvability

### Ours

1. **No session discriminator in sandbox URLs** → same app can never span two workers (Q2/Q4).
   *Solvable, medium effort.* Options:
   - Put the session id in the path: `/api/sandbox/{sessionId}/{endpoint}/…`. Gateway `parseSandboxPath` + GUI iframe src change; Location-rewrite must re-insert the id. Complication: Jupyter's `base_url=/api/sandbox/jupyter/` is **baked into the image** (`modules/sandbox/script/start-jupyter.sh:35`) — either template it per-container at start (`init_container.sh` already envsubsts configs) or place the id *after* the fixed prefix for jupyter.
   - Or a per-GUI-tab header/cookie — but iframes' subresource requests can't carry custom headers, and cookies are shared across browser tabs, so path is the workable channel.
   - Then relax the `session_app` PK to `(username, app_path, session_id)` and let the picker always show.
2. **Endpoint-scoped Location rewrite loses app identity** (`sandboxProxy.js:154-179`): a shiny redirect to `/bar` becomes `/api/sandbox/shiny/bar` and is re-attributed from scratch. Harmless today (thanks to the one-session-per-app pin); becomes a correctness bug the moment 1. is implemented. Fixed for free if the session id is in the path.
3. **Referer attribution is dead for jupyter apps in practice** — confirmed live: every request from the real browser had `referer=null` (see the live-finding section). Two causes, both ours: jupyter iframes are `document.write`n so the document has no sandbox URL to send, and `Referrer-Policy: no-referrer` is set on sandbox responses (`sandboxProxy.js:119-123`) for the endpoints that do use `iframe src`. Fixing the header is one line; giving jupyter a real iframe URL is harder (the `document.write` exists to work around Jupyter-in-iframe issues).
4. **No cookie path/domain rewriting** in the sandbox proxy: all apps share the `https://{sepalHost}` origin. RStudio sets `csrf-token`/`user-id` with `Path=/` (visible to everything; last worker wins), Jupyter's cookies are scoped to the *shared* `/api/sandbox/jupyter/` prefix. Two instances of the same endpoint on two workers would fight over cookies even with 1. solved — within one browser, that is; two distinct browsers have separate cookie jars, so this particular hazard is per-browser (the rsession takeover, being server-side, is not).
   *Solvable:* `cookiePathRewrite` per target once URLs are session-scoped, or per-session subdomains (needs wildcard certs — bigger change).
5. **Duplicate-tab close drops the association for all tabs** (above). *Solvable, small:* refcount appPath opens in the gateway session manager; only release on last close.
6. **`single: true` GUI dedup** — pure catalog data; can be lifted any time the underlying server limitation is addressed.
7. **Docker apps: one shared container per app for all users** (`modules/app-launcher/src/proxy.js:55-58`; `docker.js` never takes a username). Isolation between users/tabs is whatever the framework provides (Solara: per-connection virtual kernels). *Solvable if ever needed:* per-user compose projects — deployment-model change, not currently a goal.

### Theirs

1. **RStudio Server (open source): one active session per user, second connection takes over.** Nothing in our config can change this; we ship stock rserver + `--auth-none 1` + single OS user `sepal-user`. Ways out:
   - RStudio **Workbench** (paid) — multiple concurrent sessions per user.
   - **One rserver per worker is already the topology** — so RStudio-on-two-distinct-workers (Q4) would genuinely give two independent RStudios. It's blocked only by *our* limitations 1 and 4. This is the cheapest real "two RStudios" path.
   - Multiple OS users or multiple rserver processes per container — awkward, fights the image design.
2. **Jupyter without real-time collaboration**: concurrent frontends on the same notebook are last-save-wins. *Their feature, our packaging choice:* installing `jupyter-collaboration` (and un-disabling the extension in `voila.py`) would give CRDT co-editing. Note the user home is a **shared mount across workers**, so the same-file hazard exists even across distinct workers.
3. **shiny-server (open source): one R process per app** (no `utilization_scheduler`) — concurrent sessions work but share CPU/memory. Scaling beyond that per-worker means Pro-tier schedulers or a different runner; in practice "run it on a bigger instance" is the SEPAL answer.
4. **Voila: one kernel per render** — no upstream limitation for our purposes; it's the best-behaved group.

## Bottom line

- **Same worker, multiple instances of the same app** (Q1/Q3): works today for Shiny, Voila and docker apps; deliberately blocked in-GUI for RStudio/JupyterLab (`single`) — but only within one browser, and for good reason — RStudio's takeover is an upstream hard limit, Jupyter's is a data-loss footgun without RTC. A second browser bypasses the `single` guard and hits those hazards directly.
- **Distinct workers for the same app** (Q2/Q4): impossible for every sandbox app today, by design — a single mechanism (no session discriminator in the URL + `(username, app_path)` PK + association-always-wins). It is *our* limitation and it is solvable (session-id-in-path + cookie path rewriting + PK relaxation); RStudio would be the biggest beneficiary, since distinct workers are the only open-source way to get two concurrent RStudio sessions.
- **Docker apps** sit outside the worker model entirely: infinitely many tabs, zero workers, one shared process per app for the whole platform.
- **Beware the adjacent case that looks like it works**: two *different* jupyter tool apps on two workers silently collapse onto one worker (see the live-finding section) — the second instance is a phantom that burns budget and gets idle-reaped.
