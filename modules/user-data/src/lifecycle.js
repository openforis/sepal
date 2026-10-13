import {getLogger} from '#sepal/log'

import {DATA_ATTACHMENT_ID} from './attachments.js'

const log = getLogger('lifecycle')

const RETRY_MS = 60 * 60 * 1000

// Erases the Data of purged users. The request is recorded before erasing and cleared after, so a failed erase stays
// pending and is retried hourly; the message queue only retries once. Only Data stored before the request is erased,
// so a retry spares what the user wrote since. storage republishes recent purges, so the same user can be announced
// again: a user unknown here with nothing stored is left alone rather than recorded, and republished, for good.
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
        if (await this.#hasNothingToErase(username)) {
            return
        }
        const requestedAt = await this.#repository.requestErase(username)
        await this.#erase(username, requestedAt)
    }

    retryPending() {
        this.#running ??= this.#retryPending().finally(() => {
            this.#running = null
        })
        return this.#running
    }

    async #retryPending() {
        try {
            for (const {username, requestedAt} of await this.#repository.eraseRequests()) {
                await this.#erase(username, requestedAt)
            }
        } catch (error) {
            log.error('Retrying pending Data erasures failed', error)
        }
    }

    async #hasNothingToErase(username) {
        if (await this.#repository.isKnown(username)) {
            return false
        }
        try {
            const attachment = this.#attachments.get(username, DATA_ATTACHMENT_ID)
            return await this.#providers.for(attachment).measureUsage(attachment) === 0
        } catch (error) {
            log.warn(`Cannot measure Data of ${username}; erasing it anyway`, error)
            return false
        }
    }

    // The mark makes the next tick measure again, correcting a measurement that ran during the erase.
    async #erase(username, requestedAt) {
        try {
            const attachment = this.#attachments.get(username, DATA_ATTACHMENT_ID)
            await this.#providers.for(attachment).erase(attachment, {before: requestedAt})
            await this.#usage.recordErased(username)
            await this.#usage.markDirty(username)
            await this.#repository.clearEraseRequest(username)
        } catch (error) {
            log.warn(`Cannot erase Data of ${username}; it stays pending`, error)
        }
    }
}
