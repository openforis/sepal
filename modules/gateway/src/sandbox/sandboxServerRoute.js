// POST /api/sandbox/server?sessionId=…&endpoint=… → 204 once the endpoint's server (rstudio |
// shiny | jupyter) is listening on the session's instance.
//
// The GUI calls this between "session ACTIVE" and loading the app, so the slow server start
// (Jupyter especially) is a phase it can name rather than time hidden inside the first proxied
// request. The proxy still ensures the server before forwarding, so this is a courtesy for
// feedback, not the gate.

import {getLogger} from '#sepal/log'

import {getRequestUser} from '../user.js'
import {DEFAULT_ENDPOINT, PORT_BY_ENDPOINT} from './sandboxSessionManager.js'

const log = getLogger('sandboxServerRoute')

const sandboxServerRoute = sandboxSessionManager => {
    const handler = async (req, res) => {
        const username = getRequestUser(req)?.username
        if (!username) {
            res.status(400).json({error: 'Missing sepal-user'})
            return
        }
        const {sessionId, endpoint = DEFAULT_ENDPOINT} = req.query ?? {}
        if (!sessionId) {
            res.status(400).json({error: 'Missing sessionId'})
            return
        }
        if (!Object.prototype.hasOwnProperty.call(PORT_BY_ENDPOINT, endpoint)) {
            res.status(400).json({error: `Unknown endpoint ${endpoint}`})
            return
        }
        try {
            await sandboxSessionManager.ensureServerStarted({username, sessionId, endpoint})
            res.status(204).end()
        } catch (error) {
            const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 502
            log.error(`Failed to start sandbox ${endpoint} for ${username} (session ${sessionId})`, error)
            res.status(statusCode).json({error: `Failed to start sandbox ${endpoint}`})
        }
    }

    return {handler}
}

export {sandboxServerRoute}
