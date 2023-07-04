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
        ).then(() => {
            userStore.removeUser(username)
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
            if (userSessionIds.length === 0) {
                await userStore.removeUser(username)
            }
            log.debug(() => `${usernameTag(username)} Logout, ${userSessionIds.length} active session(s) remaining`)
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
        res.status(200)
        res.end()
    }
    
    return {
        messageHandler, logout
    }
}

module.exports = {SessionManager}
