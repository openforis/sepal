// sandboxServerManager — the sandbox servers (rstudio | shiny | jupyter) are started on first
// use rather than at container boot, and are never stopped: they live until the container does.
//
// Every ensure execs /script/sandbox-server.sh; nothing remembers a started server here. The exec
// exits 0 immediately for a server that is already listening, and the gateway memoizes a success
// until its proxy finds the server unreachable — so a call reaching this far is exactly the one
// that must reach the sandbox, e.g. to revive a server supervisord has given up on.

import {ClientException, NotFoundException} from '#sepal/exception'
import {getLogger} from '#sepal/log'

import {State} from './workerSession.js'

const defaultLog = getLogger('worker/sandboxServerManager')

const ENDPOINTS = ['rstudio', 'shiny', 'jupyter']

const createSandboxServerManager = ({repo, control, log = defaultLog}) => {
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
    // instance. Concurrent callers for the same pair share one start.
    const ensureServerStarted = async ({username, sessionId, endpoint}) => {
        if (!ENDPOINTS.includes(endpoint)) {
            throw new ClientException(`Unknown endpoint: ${endpoint}`, {statusCode: 400})
        }
        const pair = key(sessionId, endpoint)
        const pending = inFlight.get(pair)
        if (pending) {
            return await pending
        }
        const start = (async () => {
            const session = await resolveSession(username, sessionId)
            log.debug(() => `Starting ${endpoint} for session ${sessionId}`)
            await control.startServer(session, endpoint)
            log.info(`Started ${endpoint} for session ${sessionId}`)
        })().finally(() => inFlight.delete(pair))
        inFlight.set(pair, start)
        return await start
    }

    return {ensureServerStarted}
}

export {createSandboxServerManager, ENDPOINTS}
