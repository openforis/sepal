// BudgetClient — createBudgetClient(config) → { check(username, openSessions) }.
//
// check POSTs the user's open sessions, [{sessionId, instanceType, creationTime}], to
// `${budgetUrl}/budget/check/{username}` (default base `http://budget`) and returns the budget
// module's live verdict: {exceeded, reason}. Budget counts those sessions even before their
// WorkerSessionRequested event has reached it. requestSession consults it before granting a
// session, so the decision is computed from current spending rather than read from the
// hourly-refreshed report. The event-fed lockedUsers set alone cannot provide that: it is empty
// after a worker restart until the next budget cycle.
//
// Auth: the worker has no user context here, so it impersonates an admin via the gateway-style
// `sepal-user` header — the budget module's requireAdmin guard expects the application_admin role.
//
// Errors (non-2xx, transport, malformed JSON) are THROWN, never swallowed: the caller decides how
// to degrade. See requestSession's fallback to lockedUsers.

import {getLogger} from '#sepal/log'

import {userTag} from '../tag.js'

const log = getLogger('worker/budgetClient')

const ADMIN_ROLE = 'application_admin'
const DEFAULT_BUDGET_URL = 'http://budget'
const DEFAULT_ADMIN_USERNAME = 'sepaladmin'

const createBudgetClient = config => {
    const baseUrl = (config.budgetUrl || DEFAULT_BUDGET_URL).replace(/\/+$/, '')
    const adminUsername = config.sepalUser || DEFAULT_ADMIN_USERNAME

    // systemUser marks this as an inter-service call, matching the budget module's own workerClient.
    const sepalUser = JSON.stringify({username: adminUsername, roles: [ADMIN_ROLE], systemUser: true})

    const check = async (username, openSessions = []) => {
        const url = `${baseUrl}/budget/check/${encodeURIComponent(username)}`
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'sepal-user': sepalUser,
            },
            body: JSON.stringify({openSessions}),
        })
        if (!response.ok) {
            const text = await response.text().catch(() => '')
            throw new Error(`Failed to check budget for ${username}: ${response.status} ${text}`)
        }
        const verdict = await response.json()
        // Only an explicit `true` refuses the session: a malformed or partial body must not lock a
        // user out of SEPAL.
        const exceeded = verdict?.exceeded === true
        log.debug(() => `Budget verdict for ${userTag(username)}: ${exceeded ? verdict.reason : 'under budget'}`)
        return {exceeded, reason: exceeded ? (verdict.reason ?? null) : null}
    }

    return {check}
}

export {createBudgetClient}
