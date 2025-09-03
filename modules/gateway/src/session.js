const log = require('#sepal/log').getLogger('session')
const {toPromise} = require('#sepal/util')
const {usernameTag} = require('./tag')
const {getSessionUsername} = require('./user')

const SessionManager = (sessionStore, userStore) => {
    const getAllSessions = async () => {
        const [sessions] = await toPromise(
            callback => sessionStore.all(callback)
        )
        return sessions
    }
    
    const removeSession = async id =>
        await toPromise(
            callback => sessionStore.destroy(id, callback)
        )
    
    const getSessionIdsByUsername = async username => {
        const sessions = await getAllSessions()
        return sessions
            .filter(({username: sessionUsername}) => username === sessionUsername)
            .map(({id}) => id)
    }

    const removeSessionsByUsername = async username => {
        const userSessionIds = await getSessionIdsByUsername(username)
        log.debug(`${usernameTag(username)} Locking user, ${userSessionIds.length} active session(s)`)
    
        return Promise.all(
            userSessionIds.map(
                async sessionId => await removeSession(sessionId)
            )
        ).then(async () => {
            await userStore.removeUser(username)
            return true
        })
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
        req.session.destroy()
        
        if (username) {
            const userSessionIds = await getSessionIdsByUsername(username)
            log.info(`${usernameTag(username)} Logout, ${userSessionIds.length} active session(s) remaining`)
        } else {
            log.warn('Logout without user in session')
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
        res.end()
    }

    const invalidateOtherSessions = async (req, res, _next) => {
        const username = getSessionUsername(req)
        const userSessionIds = await getSessionIdsByUsername(username)
        
        await Promise.all(
            userSessionIds
                .filter(sessionId => sessionId !== req.sessionID)
                .map(async sessionId => await removeSession(sessionId))
        )

        res.status(200).send({status: 'success', message: 'other sessions invalidated'})
        res.end()
    }
    
    return {
        messageHandler, logout, invalidateOtherSessions
    }
}

module.exports = {SessionManager}
