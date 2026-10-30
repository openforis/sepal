import {getLogger} from '#sepal/log'
import {storedUsername} from '#sepal/username'

import {isText} from './validation.js'

const log = getLogger('loginThrottle')

const MAX_LOGIN_FAILURES = 10
// Higher, because users behind one NAT share an address and must not lock each other out.
const MAX_CLIENT_FAILURES = 50
const WINDOW_MS = 15 * 60 * 1000
const SWEEP_INTERVAL_MS = 60 * 1000

// Limits failed password logins per WINDOW_MS: MAX_LOGIN_FAILURES for a username at a client address, and
// MAX_CLIENT_FAILURES for a client address whatever the username. Failures are deliberately not counted per username
// alone: anyone could then lock any user out.
// A throttled login is refused before its password is verified: a correct guess must not be told apart, and
// refusing costs no scrypt hash.
export class LoginThrottle {
    #maxLoginFailures
    #maxClientFailures
    #windowMs
    #now
    #counters = new Map()
    #sweptAt = 0

    constructor({
        maxLoginFailures = MAX_LOGIN_FAILURES,
        maxClientFailures = MAX_CLIENT_FAILURES,
        windowMs = WINDOW_MS,
        now = Date.now
    } = {}) {
        this.#maxLoginFailures = maxLoginFailures
        this.#maxClientFailures = maxClientFailures
        this.#windowMs = windowMs
        this.#now = now
    }

    // Counts the attempt as a failure until it succeeds, so guesses sent in parallel cannot all pass before the
    // first of them fails.
    tryAttempt(login) {
        const now = this.#now()
        this.#sweep(now)
        const counters = this.#limitsOf(login).map(limit => this.#counter(limit, now))
        const exhausted = counters.filter(counter => counter.attempts >= counter.maxFailures)
        if (exhausted.length) {
            exhausted.filter(counter => !counter.reported).forEach(counter => {
                counter.reported = true
                log.warn(`Throttling password logins of ${counter.key} after ${counter.maxFailures} failures`)
            })
            return false
        }
        counters.forEach(counter => counter.attempts++)
        return true
    }

    succeeded(login) {
        this.#limitsOf(login)
            .map(({key}) => this.#counters.get(key))
            .filter(counter => counter?.attempts > 0)
            .forEach(counter => counter.attempts--)
    }

    // Logins whose caller names no client address share one.
    #limitsOf({username, clientIp}) {
        const client = `client ${isText(clientIp) ? clientIp : 'unknown'}`
        return [
            {key: client, maxFailures: this.#maxClientFailures},
            isText(username) && {key: `user ${storedUsername(username)} at ${client}`, maxFailures: this.#maxLoginFailures}
        ].filter(Boolean)
    }

    #counter({key, maxFailures}, now) {
        const counter = this.#counters.get(key)
        if (counter && now - counter.since < this.#windowMs) {
            return counter
        }
        const fresh = {key, maxFailures, since: now, attempts: 0, reported: false}
        this.#counters.set(key, fresh)
        return fresh
    }

    #sweep(now) {
        if (now - this.#sweptAt < SWEEP_INTERVAL_MS) {
            return
        }
        this.#sweptAt = now
        this.#counters.forEach((counter, key) => {
            if (now - counter.since >= this.#windowMs) {
                this.#counters.delete(key)
            }
        })
    }
}
