import {setTimeout} from 'node:timers/promises'

import {getLogger} from '#sepal/log'

const log = getLogger('localProcessing')

const POLL_MS = 10 * 1000
const WAITING = {messageKey: 'tasks.status.waitingForLocalProcessing', defaultMessage: 'Waiting for other exports to finish downloading...'}

const sleepUnlessAborted = (ms, signal) => setTimeout(ms, undefined, {signal}).catch(() => {})

// The container holds at most one of task-manager's local processing slots, from the start of its first step in
// progress to the end of its last. Steps running at once are cancelled together, so they share one acquisition.
// Each grant is named; a release names the grant it gives back, which progress reports repeat in case it was lost.
export class LocalProcessing {
    #sepal
    #taskId
    #reporter
    #sleep
    #steps = 0
    #slot = null
    #releasedSlot = null
    #acquiring = null

    constructor({sepal, taskId, reporter, sleep = sleepUnlessAborted}) {
        this.#sepal = sepal
        this.#taskId = taskId
        this.#reporter = reporter
        this.#sleep = sleep
    }

    get releasedSlot() {
        return this.#releasedSlot
    }

    async run(work, signal) {
        this.#steps++
        try {
            if (await this.#acquire(signal)) {
                return await work()
            }
        } finally {
            if (--this.#steps === 0) {
                this.#release()
            }
        }
    }

    async #acquire(signal) {
        if (this.#slot) {
            return true
        }
        this.#acquiring ??= this.#requestUntilGranted(signal).finally(() => this.#acquiring = null)
        return this.#acquiring
    }

    async #requestUntilGranted(signal) {
        let before = null
        let waiting = false
        while (!signal.aborted) {
            const slot = await this.#grant()
            if (slot) {
                log.info('Local processing slot granted')
                this.#slot = slot
                if (waiting && before) {
                    this.#reporter.report(before)
                }
                return true
            }
            if (!waiting) {
                log.info('Waiting for a local processing slot')
                waiting = true
                before = this.#reporter.current
                this.#reporter.report(WAITING)
            }
            await this.#sleep(POLL_MS, signal)
        }
        return false
    }

    // A task-manager restart or a network failure must not fail the export; stall detection ends a task that
    // cannot reach task-manager at all.
    async #grant() {
        try {
            const {granted, slot} = await this.#sepal.requestLocalProcessing(this.#taskId)
            return granted === true ? slot : null
        } catch (error) {
            log.warn(`Local processing slot not requested: ${error.message}`)
            return null
        }
    }

    // Steps do not wait for the release; a late one cannot clear a newer grant, so the next request need not either.
    #release() {
        const slot = this.#slot
        if (slot) {
            this.#slot = null
            this.#releasedSlot = slot
            this.#sepal.releaseLocalProcessing(this.#taskId, slot)
                .then(() => log.info('Local processing slot released'))
                .catch(error => log.warn(`Local processing slot not released: ${error.message}`))
        }
    }
}
