import {getLogger} from '#sepal/log'

import {getRequestUser} from '../user.js'
import {DEFAULT_ENDPOINT} from './sandboxSessionManager.js'

const log = getLogger('sandboxStartRoute')

const sandboxStartRoute = sandboxSessionManager => {
    const resolveUsername = req => {
        const user = getRequestUser(req)
        return user?.username
    }

    const resolveEndpoint = req =>
        req.query?.endpoint || DEFAULT_ENDPOINT

    // POST /api/sandbox/start?endpoint=&appPath=&appLabel=&sessionId=|instanceType=&clientId=&reassert= → {id, status}
    // clientId — the browser ws client opening the app; the worker stores it as the
    // association's owner (clientDown dissociates by it).
    // reassert=true — the GUI replaying an open tab's association after a ws reconnect, not a user
    // opening anything: ownership is refreshed but the session's deadline does not move. Only the
    // literal string counts, so a malformed report reads as a real open and errs toward keeping the
    // session alive — the same direction the interaction report chooses.
    const start = async (req, res) => {
        const username = resolveUsername(req)
        if (!username) {
            res.status(400).json({error: 'Missing sepal-user'})
            return
        }
        const endpoint = resolveEndpoint(req)
        const {appPath, appLabel, sessionId, instanceType, clientId} = req.query ?? {}
        const reassert = req.query?.reassert === 'true'
        try {
            const result = await sandboxSessionManager.startApp(
                {username, endpoint, appPath, appLabel, sessionId, instanceType, clientId, reassert})
            res.json(result)
        } catch (error) {
            const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 500
            log.error(`Failed to start sandbox session for ${username} (${endpoint}, ${appPath ?? 'no app'})`, error)
            res.status(statusCode).json({error: 'Failed to start sandbox session'})
        }
    }

    const status = async (req, res) => {
        const username = resolveUsername(req)
        if (!username) {
            res.status(400).json({error: 'Missing sepal-user'})
            return
        }
        const endpoint = resolveEndpoint(req)
        const {appPath} = req.query ?? {}
        try {
            const result = await sandboxSessionManager.status(username, endpoint, appPath)
            if (!result) {
                res.status(400).json({error: `No session started for endpoint ${endpoint}`})
                return
            }
            res.json(result)
        } catch (error) {
            log.error(`Failed to get sandbox session status for ${username} (${endpoint})`, error)
            res.status(500).json({error: 'Failed to get sandbox session status'})
        }
    }

    // DELETE /api/sandbox/start?appPath=&clientId= → 204: unbind the app from its session
    // (tab close, or a takeover dissociating another client's binding). The session stays
    // open; the app can then be re-opened on a different instance. clientId identifies the
    // REQUESTING client, so the worker's dissociation event can tell the owner apart.
    const release = async (req, res) => {
        const username = resolveUsername(req)
        if (!username) {
            res.status(400).json({error: 'Missing sepal-user'})
            return
        }
        const {appPath, clientId} = req.query ?? {}
        if (!appPath) {
            res.status(400).json({error: 'Missing appPath'})
            return
        }
        try {
            await sandboxSessionManager.releaseApp({username, appPath, clientId})
            res.status(204).end()
        } catch (error) {
            log.error(`Failed to release sandbox app session for ${username} (${appPath})`, error)
            res.status(500).json({error: 'Failed to release sandbox app session'})
        }
    }

    const handler = (req, res) =>
        req.method === 'POST'
            ? start(req, res)
            : req.method === 'DELETE'
                ? release(req, res)
                : status(req, res)

    return {handler, start, status, release}
}

export {sandboxStartRoute}
