import assert from 'node:assert/strict'
import {afterEach, beforeEach, describe, mock, test} from 'node:test'

import {createScheduler} from './scheduler.js'

describe('schedule', () => {
    beforeEach(() => mock.timers.enable({apis: ['setTimeout']}))
    afterEach(() => mock.timers.reset())

    // A sampling run slower than the interval stacked up runs that acted on each other's reads:
    // a second reclaim released an instance a first one was already releasing.
    test('runs again only the full delay after the previous run completed', async () => {
        const scheduler = createScheduler(silentLog())
        const slow = deferred()
        const job = mock.fn(() => slow.promise)

        scheduler.schedule('Slow', job, DELAY_MS)
        mock.timers.tick(DELAY_MS)
        slow.resolve()
        await flush()
        mock.timers.tick(DELAY_MS - 1)
        await flush()
        const beforeDelay = job.mock.callCount()
        mock.timers.tick(1)
        await flush()

        assert.equal(beforeDelay, 1)
        assert.equal(job.mock.callCount(), 2)
        scheduler.stopAll()
    })

    test('keeps running after a failed run', async () => {
        const log = silentLog()
        const scheduler = createScheduler(log)
        const job = mock.fn(async () => {
            throw new Error('boom')
        })

        scheduler.schedule('Failing', job, DELAY_MS)
        await flush()
        mock.timers.tick(DELAY_MS)
        await flush()

        assert.equal(job.mock.callCount(), 2)
        assert.equal(log.error.mock.callCount(), 2)
        scheduler.stopAll()
    })

    test('stopAll stops a job whose run is still in flight', async () => {
        const scheduler = createScheduler(silentLog())
        const slow = deferred()
        const job = mock.fn(() => slow.promise)

        scheduler.schedule('Slow', job, DELAY_MS)
        scheduler.stopAll()
        slow.resolve()
        await flush()
        mock.timers.tick(DELAY_MS)
        await flush()

        assert.equal(job.mock.callCount(), 1)
    })
})

const DELAY_MS = 60_000

const silentLog = () => ({error: mock.fn()})

const flush = () => new Promise(resolve => setImmediate(resolve))

const deferred = () => {
    let resolve
    const promise = new Promise(res => {
        resolve = res
    })
    return {promise, resolve}
}
