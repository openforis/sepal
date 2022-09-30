const log = require('sepal/log').getLogger('session')
const {toPromise} = require('sepal/util')

const SessionManager = store => {
    const getAllSessions = async () => {
        const [sessions] = await toPromise(
            callback => store.all(callback)
        )
        return sessions
    }
    
    const removeSession = async id =>
        await toPromise(
            callback => store.destroy(id, callback)
        )
    
    const removeSessionsByUsername = async username => {
        const sessions = await getAllSessions()
    
        const userSessionIds = sessions
            .filter(({user}) => user.username === username)
            .map(({id}) => id)

        log.info(`Locking user "${username}" (active sessions: ${userSessionIds.length})`)
    
        return Promise.all(
            userSessionIds.map(
                async sessionId => await removeSession(sessionId)
            )
        )
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
    }

    return {
        messageHandler
    }
}

module.exports = {SessionManager}
