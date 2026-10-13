# CLAUDE.md - modules/budget

Standalone event-driven budget service (Node.js). Extracted from `modules/worker` (2026-07). Tracks
instance + storage spending and enforces monthly budgets; owns the `budget` MySQL schema (Postgrator).

## Database migrations

`migrations/` holds the portable schema stream. `migrations/legacy-import/` holds the one-off copy from `sdms`. Startup and import cleanup are described in [docs/database-migrations.md](../../docs/database-migrations.md).

## Commands
- `npm test` — Jest (ESM, TZ=UTC)
- `sepal build budget` / `sepal start budget` / `sepal logs budget -r`

## Routes
- `GET /budget/report` [admin], `POST /budget` [admin], `POST /budget/requestUpdate` [user]
- `GET /budget/spending/:username` [admin] — internal Spending DTO (monthly instance/storage budget and spending, storage/Data quota and use, cost per GB-month for each, `budgetUpdateRequest`) (used by the ssh-gateway menu)
- `GET /budget/check/:username` [admin] — internal live over-budget verdict
  `{username, exceeded, reason, dataQuotaExceeded}`, `reason` ∈ `INSTANCE_BUDGET | STORAGE_BUDGET | STORAGE_QUOTA | DATA_QUOTA | null`.
  The worker calls this before granting a session (`workerSession/budgetClient.js`); the reason
  strings are a cross-module contract mapped back to typed errors in `workerSession/budgetErrors.js`.
  Same order as `budgetManager.check`: instance budget → storage budget → storage quota → Data quota; `reason` is
  the first exceeded, while `dataQuotaExceeded` is computed whatever the reason.
- `GET /ws` — gateway virtual-websocket endpoint (module `budget`): pushes
  `{spending, budgetUpdateRequest}` to GUI subscribers on subscribe, on `{refresh: true}`, and on
  every `spending$` emission (session/storage/budget changes + hourly rebuild)

## Events
- Subscribes: workerSession.WorkerSessionRequested, workerSession.WorkerSessionActivated,
  workerSession.WorkerSessionClosed, storage.size, userData.size (queue `budget.userData`; Data use in GB)
- Publishes: budget.UserBudgetExceeded `{username, reason, dataQuotaExceeded}`, budget.UserBudgetCleared `{username}`
  (level-triggered): every minute for users with open sessions (the worker closes an over-budget user's sessions on
  each Exceeded; user-data makes Data read-only on `dataQuotaExceeded`), hourly for every user. A failing verdict
  is logged and the cycle continues with the next user

## Schema `budget`
- user_budget, default_user_budget, user_monthly_storage, user_monthly_data_storage, default_data_quota, user_spending, budget_update_request
- The default Data quota is changed only in SQL (`default_data_quota.data_quota`); no admin screen sets it. Any
  admin save of a user's budget stores the Data quota on that user, so they keep the old default if it later
  changes
- open_session_use — event-sourced instance-use (replaces the worker `instance_use` view).
  Opened on WorkerSessionRequested (upsert keyed on session_id, re-asserted by
  WorkerSessionActivated) so a session is billed from its creationTime even if it never activates.
