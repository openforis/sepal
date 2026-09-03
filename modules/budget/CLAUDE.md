# CLAUDE.md - modules/budget

Standalone event-driven budget service (Node.js). Extracted from `modules/worker` (2026-07). Tracks
instance + storage spending and enforces monthly budgets; owns the `budget` MySQL schema (Postgrator).

## Commands
- `npm test` — Jest (ESM, TZ=UTC)
- `sepal build budget` / `sepal start budget` / `sepal logs budget -r`

## Routes
- `GET /budget/report` [admin], `POST /budget` [admin], `POST /budget/requestUpdate` [user]
- `GET /budget/spending/:username` [admin] — internal 8-field Spending DTO (used by the ssh-gateway menu)
- `GET /budget/check/:username` [admin] — internal live over-budget verdict
  `{username, exceeded, reason}`, `reason` ∈ `INSTANCE_BUDGET | STORAGE_BUDGET | STORAGE_QUOTA | null`.
  The worker calls this before granting a session (`workerSession/budgetClient.js`); the reason
  strings are a cross-module contract mapped back to typed errors in `workerSession/budgetErrors.js`.
  Same short-circuit order as `budgetManager.check`: instance budget → storage budget → storage quota.
- `GET /ws` — gateway virtual-websocket endpoint (module `budget`): pushes
  `{spending, budgetUpdateRequest}` to GUI subscribers on subscribe, on `{refresh: true}`, and on
  every `spending$` emission (session/storage/budget changes + hourly rebuild)

## Events
- Subscribes: workerSession.WorkerSessionRequested, workerSession.WorkerSessionActivated,
  workerSession.WorkerSessionClosed, userStorage.size
- Publishes: budget.UserBudgetExceeded, budget.UserBudgetCleared (level-triggered)

## Schema `budget`
- user_budget, default_user_budget, user_monthly_storage, user_spending, budget_update_request
- open_session_use — event-sourced instance-use (replaces the worker `instance_use` view).
  Opened on WorkerSessionRequested (upsert keyed on session_id, re-asserted by
  WorkerSessionActivated) so a session is billed from its creationTime even if it never activates.
