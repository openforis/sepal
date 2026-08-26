// sandboxServerManager — the sandbox servers (rstudio | shiny | jupyter) are started on first
// use rather than at container boot, and are never stopped: they live until the container does.
//
// State is in-memory and unpersisted on purpose. There is no lifecycle to reconcile — a started
// server stays started — and a restart that forgets a pair costs one idempotent exec, since
// /script/sandbox-server.sh exits 0 immediately for a server that is already listening.
//
// The started set is keyed by session id, which is what makes it correct: a new container is
// always a new session, so a remembered pair can never point at a container that lost the server.

import {ClientException, NotFoundException} from '#sepal/exception'
import {getLogger} from '#sepal/log'

import {State} from './workerSession.js'

const defaultLog = getLogger('worker/sandboxServerManager')

const ENDPOINTS = ['rstudio', 'shiny', 'jupyter']

const createSandboxServerManager = ({repo, control, log = defaultLog}) => {
    const started = new Set()
    const inFlight = new Map()

    const key = (sessionId, endpoint) => `${sessionId}:${endpoint}`

    const resolveSession = async (username, sessionId) => {
        let session
        try {
            session = await repo.getSession(sessionId)
        } catch (_error) {
            throw new NotFoundException(`Non-existing session: ${sessionId}`)
        }
        if (username && session.username !== username) {
            throw new ClientException(`Session not owned by user: ${sessionId}`, {
                statusCode: 403,
                userMessage: {message: 'Session not owned by user', key: 'error.forbidden'}
            })
        }
        if (session.state !== State.ACTIVE) {
            throw new ClientException(`Session not active: ${sessionId}`, {statusCode: 409})
        }
        return session
    }

    // ensureServerStarted — resolves once the endpoint's server is listening on the session's
    // instance. Concurrent callers for the same pair share one start; a failure is not cached,
    // so the next caller tries again.
    const ensureServerStarted = async ({username, sessionId, endpoint}) => {
        if (!ENDPOINTS.includes(endpoint)) {
            throw new ClientException(`Unknown endpoint: ${endpoint}`, {statusCode: 400})
        }
        const pair = key(sessionId, endpoint)
        if (started.has(pair)) {
            return
        }
        const pending = inFlight.get(pair)
        if (pending) {
            return await pending
        }
        const start = (async () => {
            const session = await resolveSession(username, sessionId)
            log.debug(() => `Starting ${endpoint} for session ${sessionId}`)
            await control.startServer(session, endpoint)
            started.add(pair)
            log.info(`Started ${endpoint} for session ${sessionId}`)
        })().finally(() => inFlight.delete(pair))
        inFlight.set(pair, start)
        return await start
    }

    const forget = sessionId => {
        for (const endpoint of ENDPOINTS) {
            started.delete(key(sessionId, endpoint))
        }
    }

    return {ensureServerStarted, forget}
}

export {createSandboxServerManager, ENDPOINTS}
