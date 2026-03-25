const log = require('#sepal/log').getLogger('session')

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

class SessionStore {
    constructor({ttlMs = 30 * 60 * 1000} = {}) {
        this.ttlMs = ttlMs
        this.sessions = {}
        this.cleanupTimer = setInterval(() => this._cleanup(), CLEANUP_INTERVAL_MS)
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
            lastActivity: Date.now(),
            messageTimestamps: []
        }
        this.sessions[key] = session
        log.info(`Session created: ${key} (${username})`)
        return session
    }

    get({clientId, subscriptionId}) {
        const key = this._key({clientId, subscriptionId})
        const session = this.sessions[key]
        if (session) {
            session.lastActivity = Date.now()
        }
        return session
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

    clear() {
        this.sessions = {}
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer)
        }
    }

    _cleanup() {
        const now = Date.now()
        let count = 0
        Object.entries(this.sessions).forEach(([key, session]) => {
            if (now - session.lastActivity > this.ttlMs) {
                delete this.sessions[key]
                count++
            }
        })
        if (count > 0) {
            log.info(`TTL cleanup: removed ${count} expired sessions`)
        }
    }
}

module.exports = {SessionStore}
