import {setTimeout} from 'node:timers/promises'

import {getLogger} from '#sepal/log'

const log = getLogger('localProcessing')

const POLL_MS = 10 * 1000
const WAITING = {messageKey: 'tasks.status.waitingForLocalProcessing', defaultMessage: 'Waiting for other exports to finish downloading...'}

const sleepUnlessAborted = (ms, signal) => setTimeout(ms, undefined, {signal}).catch(() => {})

// The container holds at most one of task-manager's local processing slots, from the start of its first step in
// progress to the end of its last. Steps running at once are cancelled together, so they share one acquisition.
export class LocalProcessing {
    #sepal
    #taskId
    #reporter
    #sleep
    #steps = 0
    #held = false
    #acquiring = null
    #releasing = Promise.resolve()

    constructor({sepal, taskId, reporter, sleep = sleepUnlessAborted}) {
        this.#sepal = sepal
        this.#taskId = taskId
        this.#reporter = reporter
        this.#sleep = sleep
    }

    async run(work, signal) {
        this.#steps++
        try {
            if (await this.#acquire(signal)) {
                return await work()
            }
        } finally {
            if (--this.#steps === 0) {
                await this.#release()
            }
        }
    }

    // A request sent before a release in flight reaches task-manager would have its grant cleared by that release.
    async #acquire(signal) {
        await this.#releasing
        if (this.#held) {
            return true
        }
        this.#acquiring ??= this.#requestUntilGranted(signal).finally(() => this.#acquiring = null)
        return this.#acquiring
    }

    async #requestUntilGranted(signal) {
        let before = null
        let waiting = false
        while (!signal.aborted) {
            if (await this.#granted()) {
                this.#held = true
                if (waiting && before) {
                    this.#reporter.report(before)
                }
                return true
            }
            if (!waiting) {
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
    async #granted() {
        try {
            const {granted} = await this.#sepal.requestLocalProcessing(this.#taskId)
            return granted === true
        } catch (error) {
            log.warn(`Local processing slot not requested: ${error.message}`)
            return false
        }
    }

    async #release() {
        if (!this.#held) {
            return
        }
        this.#held = false
        this.#releasing = this.#sepal.releaseLocalProcessing(this.#taskId)
            .catch(error => log.warn(`Local processing slot not released: ${error.message}`))
        await this.#releasing
    }
}
