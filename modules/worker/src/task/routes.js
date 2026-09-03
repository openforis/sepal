// routes — the /tasks Koa router.
//
// Mounted on the worker Koa app so that the gateway's `/api/tasks/*` (the gateway strips `/api`)
// maps to `/tasks/*` here.
//
// Route ORDER matters: @koa/router matches in registration order, so the literal `/tasks/active`
// and `/tasks/remove` routes are registered BEFORE the `/tasks/task/:id/...` routes.
//
// Auth:
//   requireAuth                — any authenticated user.
//   requireAdminOrTaskExecutor — application_admin OR task_executor, for the executor callbacks
//     state-updated + active.

import {requireAdminOrTaskExecutor, requireAuth} from '../workerSession/currentUser.js'

const registerTaskRoutes = (router, api) => router
    // ── submit ───────────────────────────────────────────────────────────────────
    .post('/tasks', requireAuth, api.submitTask)

    // ── executor callbacks (admin / task_executor) — literal, before /tasks/task/:id ──
    .post('/tasks/active', requireAdminOrTaskExecutor, api.active)
    .post('/tasks/remove', requireAuth, api.removeUserTasks)

    // ── single-task ownership routes ──────────────────────────────────────────────
    .get('/tasks/task/:id/details', requireAuth, api.getTaskDetails)
    .get('/tasks/task/:id', requireAuth, api.getTask)
    .post('/tasks/task/:id/cancel', requireAuth, api.cancelTask)
    .post('/tasks/task/:id/remove', requireAuth, api.removeTask)
    .post('/tasks/task/:id/execute', requireAuth, api.executeTask)
    .post('/tasks/task/:id/state-updated', requireAdminOrTaskExecutor, api.stateUpdated)

export {registerTaskRoutes}
