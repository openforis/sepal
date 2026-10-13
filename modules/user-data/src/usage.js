import {getLogger} from '#sepal/log'

import {DATA_ATTACHMENT_ID} from './attachments.js'

const log = getLogger('usage')

const TICK_MS = 60 * 60 * 1000
const START_DELAY_MS = 60 * 1000
const SWEEP_MS = 24 * 60 * 60 * 1000

// Measures users' Data and publishes it for budget. A user is measured within an hour after being marked dirty
// (credentials issued for writing), and every user with Data, or measured before, once a day. Every tick also
// republishes the last recorded size of every known user, so events lost while the broker is unreachable heal
// within an hour.
export class Usage {
    #repository
    #attachments
    #providers
    #events
    #now
    #lastSweep = null
    #running = null
    #startDelayMs
    #startTimer = null
    #timer = null

    constructor({repository, attachments, providers, events, now = () => new Date(), startDelayMs = START_DELAY_MS}) {
        this.#repository = repository
        this.#attachments = attachments
        this.#providers = providers
        this.#events = events
        this.#now = now
        this.#startDelayMs = startDelayMs
    }

    start() {
        this.#startTimer = setTimeout(() => this.tick(), this.#startDelayMs)
        this.#timer = setInterval(() => this.tick(), TICK_MS)
    }

    stop() {
        clearTimeout(this.#startTimer)
        clearInterval(this.#timer)
    }

    markDirty(username) {
        return this.#repository.markDirty(username)
    }

    async recordErased(username) {
        await this.#repository.recordMeasurement(username, 0)
        this.#events.emitUserDataSize(username, 0)
    }

    tick() {
        this.#running ??= this.#tick().finally(() => {
            this.#running = null
        })
        return this.#running
    }

    async #tick() {
        try {
            if (this.#sweepDue()) {
                await this.#markEveryoneDirty()
            }
            const published = new Set()
            for (const username of await this.#repository.dirtyUsernames()) {
                if (await this.#measure(username)) {
                    published.add(username)
                }
            }
            await this.#republish(published)
        } catch (error) {
            log.error('Measuring Data usage failed', error)
        }
    }

    #sweepDue() {
        return this.#lastSweep === null || this.#now().getTime() - this.#lastSweep >= SWEEP_MS
    }

    async #markEveryoneDirty() {
        const owners = await this.#providers.for({provider: this.#attachments.dataProvider()}).owners()
        const known = await this.#repository.knownUsernames()
        for (const username of new Set([...owners, ...known])) {
            await this.#repository.markDirty(username)
        }
        this.#lastSweep = this.#now().getTime()
    }

    async #measure(username) {
        try {
            const attachment = this.#attachments.get(username, DATA_ATTACHMENT_ID)
            const size = await this.#providers.for(attachment).measureUsage(attachment)
            await this.#repository.recordMeasurement(username, size)
            this.#events.emitUserDataSize(username, size)
            return true
        } catch (error) {
            log.warn(`Cannot measure Data of ${username}; it stays due`, error)
            return false
        }
    }

    async #republish(alreadyPublished) {
        for (const {username, size} of await this.#repository.measurements()) {
            if (!alreadyPublished.has(username)) {
                try {
                    this.#events.emitUserDataSize(username, size)
                } catch (error) {
                    log.warn(`Cannot republish Data size of ${username}`, error)
                }
            }
        }
    }
}
