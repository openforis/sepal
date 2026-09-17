import {LOGIN_SESSION_INVALIDATED} from '#sepal/event/definitions'
import {getLogger} from '#sepal/log'
import {isStoredUsername, storedUsername} from '#sepal/username'
import {toPromise} from '#sepal/util'

import {usernameTag} from './tag.js'
import {getSessionUsername} from './user.js'

const log = getLogger('session')

const SessionManager = (sessionStore, redis, event$) => {
    const getAllSessions = async () => {
        const [sessions] = await toPromise(
            callback => sessionStore.all(callback)
        )
        return sessions
    }
    
    const removeSession = async (username, id) => {
        await toPromise(
            callback => sessionStore.destroy(id, callback)
        )
        sessionInvalidated(username, id)
    }

    const sessionInvalidated = (username, sessionId) =>
        event$.next({type: LOGIN_SESSION_INVALIDATED, data: {username, sessionId}})
    
    const getSessionIdsByUsername = async username => {
        const sessions = await getAllSessions()
        return sessions
            .filter(({username: sessionUsername}) => storedUsername(username) === storedUsername(sessionUsername))
            .map(({id}) => id)
    }

    const removeSessionsByUsername = async username => {
        const userSessionIds = await getSessionIdsByUsername(username)
        log.debug(`${usernameTag(username)} Locking user, ${userSessionIds.length} active session(s)`)
    
        return Promise.all(
            userSessionIds.map(
                async sessionId => await removeSession(username, sessionId)
            )
        ).then(async () => {
            return true
        })
    }

    // A session names its user in whatever spelling authenticated, and every lookup here compares
    // that name exactly, so a session spelled differently from the stored username survives the lock
    // it was supposed to end. Sessions are rewritten in place rather than through sessionStore.set(),
    // which derives a fresh TTL from a cookie that carries no expiry of its own — correcting a name
    // must not hand a nearly expired session another day of life.
    const normalizeCase = async () => {
        const sessions = await getAllSessions()
        const corrected = sessions.filter(({username}) => username && !isStoredUsername(username))

        for (const {id, ...session} of corrected) {
            await redis.set(
                `${sessionStore.prefix}${id}`,
                JSON.stringify({...session, username: storedUsername(session.username)}),
                {KEEPTTL: true}
            )
        }

        if (corrected.length) {
            log.info(`Normalized sessions: ${corrected.length} username(s) corrected of ${sessions.length}`)
        }
        return {corrected: corrected.length}
    }

    const messageHandler = async (key, msg) => {
        if (key === 'user.UserLocked') {
            const {username} = msg
            if (username) {
                return await removeSessionsByUsername(username)
            } else {
                log.warn('Message is missing user name', msg)
            }
        } else {
            log.debug('Ignoring unrecognized message key:', key)
        }
        return true
    }

    const logout = async (req, res, _next) => {
        const username = getSessionUsername(req)
        const sessionId = req.sessionID
        await new Promise((resolve, reject) =>
            req.session.destroy(err => err ? reject(err) : resolve())
        )
        
        if (username) {
            sessionInvalidated(username, sessionId)
            const userSessionIds = await getSessionIdsByUsername(username)
            log.info(`${usernameTag(username)} Logout, ${userSessionIds.length} active session(s) remaining`)
        } else {
            log.debug('Logout without user in session')
        }

        const cookieHeader = req.get('Cookie')
        if (cookieHeader) {
            cookieHeader
                .split(';')
                .map(cookie => cookie
                    .split('=')[0]
                    .trim()
                )
                .forEach(cookie => res.cookie(cookie, '', {maxAge: 0}))
        }
        res.status(200).send({status: 'success', message: 'logout'})
    }

    // A login on a session that another user holds replaces the session rather than relabelling it,
    // so that user's tabs are kicked instead of silently switching account. They are told only once
    // the response carrying the new cookie has gone out, so their reload already lands as the new user.
    const ensureSessionFor = async (req, res, username) => {
        const previousUsername = getSessionUsername(req)
        const previousSessionId = req.sessionID
        if (previousUsername && storedUsername(previousUsername) !== storedUsername(username)) {
            await toPromise(
                callback => req.session.regenerate(callback)
            )
            log.info(`${usernameTag(username)} Login replaces session of ${usernameTag(previousUsername)}`)
            res.on('finish', () => sessionInvalidated(previousUsername, previousSessionId))
        }
    }

    const invalidateOtherSessions = async (req, res, _next) => {
        const username = getSessionUsername(req)
        const userSessionIds = await getSessionIdsByUsername(username)
        
        await Promise.all(
            userSessionIds
                .filter(sessionId => sessionId !== req.sessionID)
                .map(async sessionId => await removeSession(username, sessionId))
        )

        res.status(200).send({status: 'success', message: 'other sessions invalidated'})
    }
    
    return {
        messageHandler, logout, invalidateOtherSessions, ensureSessionFor, normalizeCase
    }
}

export {SessionManager}
