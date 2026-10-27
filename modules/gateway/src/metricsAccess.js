import {getRequestUser} from './user.js'

const ADMIN_ROLE = 'application_admin'

// Every module serves Prometheus metrics at /metrics and /metrics.json, reachable through its
// /api/<module> proxy, and some carry per-user labels (the worker's name each user's instances).
// Express routes match case-insensitively, so /api/worker/METRICS reaches the worker's /metrics.
const METRICS_PATH = /^\/api\/[^/]+\/+metrics(\.json)?(\/|$)/i

export const isMetricsPath = path =>
    METRICS_PATH.test(path)

export const restrictMetricsToAdmins = (app, authMiddleware) =>
    app.use(METRICS_PATH, authMiddleware, requireAdmin)

const requireAdmin = (req, res, next) =>
    getRequestUser(req)?.roles?.includes(ADMIN_ROLE)
        ? next()
        : res.sendStatus(403)
