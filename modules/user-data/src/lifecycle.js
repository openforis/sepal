import {getLogger} from '#sepal/log'

import {DATA_ATTACHMENT_ID} from './attachments.js'

const log = getLogger('lifecycle')

const RETRY_MS = 60 * 60 * 1000

// Erases the Data of purged users. The request is recorded before erasing and cleared after, so a failed erase stays
// pending and is retried hourly; the message queue only retries once.
export class Lifecycle {
    #attachments
    #providers
    #usage
    #repository
    #running = null
    #timer = null

    constructor({attachments, providers, usage, repository}) {
        this.#attachments = attachments
        this.#providers = providers
        this.#usage = usage
        this.#repository = repository
    }

    start() {
        this.retryPending()
        this.#timer = setInterval(() => this.retryPending(), RETRY_MS)
    }

    stop() {
        clearInterval(this.#timer)
    }

    async onUserStorageErased({username}) {
        await this.#repository.requestErase(username)
        await this.#erase(username)
    }

    retryPending() {
        this.#running ??= this.#retryPending().finally(() => {
            this.#running = null
        })
        return this.#running
    }

    async #retryPending() {
        try {
            for (const username of await this.#repository.eraseRequests()) {
                await this.#erase(username)
            }
        } catch (error) {
            log.error('Retrying pending Data erasures failed', error)
        }
    }

    async #erase(username) {
        try {
            const attachment = this.#attachments.get(username, DATA_ATTACHMENT_ID)
            await this.#providers.for(attachment).erase(attachment)
            await this.#usage.recordErased(username)
            await this.#repository.clearEraseRequest(username)
        } catch (error) {
            log.warn(`Cannot erase Data of ${username}; it stays pending`, error)
        }
    }
}
