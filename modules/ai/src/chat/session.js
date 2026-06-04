const log = require('#sepal/log').getLogger('session')

class SessionStore {
    constructor() {
        this.sessions = {}
    }

    _key({clientId, subscriptionId}) {
        return `${clientId}:${subscriptionId}`
    }

    create({username, clientId, subscriptionId}) {
        const key = this._key({clientId, subscriptionId})
        const session = {
            username,
            clientId,
            subscriptionId,
            conversationId: null,
            messages: [],
            workflow: null,
            // Latest GUI selection (open recipes, selected recipe, etc.) sent
            // by the browser via 'context' messages; consumed when building
            // the system prompt for each round so the LLM sees fresh state.
            selection: null,
            messageTimestamps: []
        }
        this.sessions[key] = session
        log.info(`Session created: ${key} (${username})`)
        return session
    }

    get({clientId, subscriptionId}) {
        const key = this._key({clientId, subscriptionId})
        return this.sessions[key]
    }

    remove({clientId, subscriptionId}) {
        const key = this._key({clientId, subscriptionId})
        if (this.sessions[key]) {
            log.info(`Session removed: ${key}`)
            delete this.sessions[key]
        }
    }

    removeByClient({clientId}) {
        const prefix = `${clientId}:`
        let count = 0
        Object.keys(this.sessions).forEach(key => {
            if (key.startsWith(prefix)) {
                delete this.sessions[key]
                count++
            }
        })
        if (count > 0) {
            log.info(`Removed ${count} sessions for client ${clientId}`)
        }
    }

    removeByUser({username}) {
        let count = 0
        Object.entries(this.sessions).forEach(([key, session]) => {
            if (session.username === username) {
                delete this.sessions[key]
                count++
            }
        })
        if (count > 0) {
            log.info(`Removed ${count} sessions for user ${username}`)
        }
    }

    clear() {
        this.sessions = {}
    }
}

module.exports = {SessionStore}
