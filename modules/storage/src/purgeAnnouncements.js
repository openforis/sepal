import {getLogger} from '#sepal/log'

import {emitUserStorageErased} from './events.js'

const log = getLogger('purgeAnnouncements')

const REPUBLISH_MS = 24 * 60 * 60 * 1000
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000

// Republishes storage.UserStorageErased for every user purged within the last week, so an announcement lost while
// the broker was unreachable still gets their Data erased. Consumers erase idempotently.
export class PurgeAnnouncements {
    #repository
    #now
    #timer = null

    constructor({repository, now = () => new Date()}) {
        this.#repository = repository
        this.#now = now
    }

    start() {
        this.republish()
        this.#timer = setInterval(() => this.republish(), REPUBLISH_MS)
    }

    stop() {
        clearInterval(this.#timer)
    }

    async republish() {
        try {
            const since = new Date(this.#now().getTime() - WINDOW_MS)
            for (const username of await this.#repository.recentlyPurged(since)) {
                emitUserStorageErased(username)
            }
        } catch (error) {
            log.error('Republishing purge announcements failed', error)
        }
    }
}
