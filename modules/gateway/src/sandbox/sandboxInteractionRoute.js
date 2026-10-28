// POST /api/sandbox/interaction — the GUI's report that a real user interaction happened inside
// an app iframe (docs/session-expiration-model.md §4a), or that it cannot observe that app at all.
//
// Query: ?sessionId=…&observable=false. Query rather than a body because the gateway mounts no
// body parser — /api/sandbox/start takes its parameters the same way. `observable=false` is the
// cross-origin declaration: the gateway then counts proxied requests for that session as
// interactions, i.e. today's behaviour, for as long as the declaration is refreshed.
//
// Transport deliberately reuses the gateway's existing heartbeat loop rather than adding a channel
// to the worker: the loop already batches, already prunes its cache on a 404, already tolerates a
// briefly unreachable worker, and is already tested. This route only sets the marker the next beat
// carries.
//
// Reports are coalesced by the GUI to at most one per session per interaction-report interval, so
// this is cheap; it answers 204 and never makes the browser wait on the worker.

import {getLogger} from '#sepal/log'

import {getRequestUser} from '../user.js'

const log = getLogger('sandboxInteractionRoute')

const sandboxInteractionRoute = sandboxSessionManager => {
    const handler = (req, res) => {
        const username = getRequestUser(req)?.username
        if (!username) {
            res.status(400).json({error: 'Missing sepal-user'})
            return
        }
        const sessionId = req.query?.sessionId
        if (!sessionId) {
            res.status(400).json({error: 'Missing sessionId'})
            return
        }
        // Only an explicit `false` declares the app unobservable. Anything else — including a
        // malformed report — leaves the session observable, so that a broken GUI shows up as
        // sessions expiring under active use rather than as the filter silently doing nothing.
        const observable = req.query?.observable !== 'false'
        log.debug(() => `Interaction report from ${username} for session ${sessionId}`
            + `${observable ? '' : ' — app declared UNOBSERVABLE (cross-origin), falling back to proxied requests'}`)
        sandboxSessionManager.recordInteraction({username, sessionId, observable})
        res.status(204).end()
    }

    return {handler}
}

export {sandboxInteractionRoute}
