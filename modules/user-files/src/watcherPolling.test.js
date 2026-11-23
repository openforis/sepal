import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import {before, mock, test} from 'node:test'
import {setImmediate as settled} from 'node:timers/promises'

import _ from 'lodash'
import {Subject} from 'rxjs'

import {configureNoLogging} from '#sepal/log'

const POLL_INTERVAL_MS = 20
let reads
let resolutionError

// Directory reads complete when the test allows them. Resolution and empty listings otherwise succeed.
mock.module('node:fs/promises', {
    exports: {
        ...fs,
        realpath: async path => {
            if (resolutionError) {
                const error = resolutionError
                resolutionError = null
                throw error
            }
            return path
        },
        lstat: async () => ({isSymbolicLink: () => false, isDirectory: () => true}),
        readdir: path => {
            const read = {...Promise.withResolvers(), path}
            reads.push(read)
            return read.promise
        },
        rm: async () => undefined
    }
})
mock.module('./config.js', {
    exports: {homeDir: '/homes', pollIntervalMilliseconds: POLL_INTERVAL_MS}
})

const {createWatcher} = await import('./watcher.js')

before(() => configureNoLogging())

test('a slow scan rests for four scan durations, then a fast scan restores the configured interval', async t => {
    const {watcher, sent} = await scenario(t)
    watcher.monitor(subscription())
    await advance(t, 0)

    await advance(t, 100)
    assert.equal(reads.length, 1, 'scans must not overlap')
    reads[0].resolve([])
    await settled()
    await advance(t, 399)
    assert.equal(reads.length, 1)
    await advance(t, 1)
    assert.equal(reads.length, 2)

    reads[1].resolve([])
    await settled()
    assert.equal(sent.length, 1, 'unchanged listings stay suppressed across polls')
    await advance(t, POLL_INTERVAL_MS - 1)
    assert.equal(reads.length, 2)
    await advance(t, 1)
    assert.equal(reads.length, 3)
})

test('a slow directory does not slow a small directory in the same subscription', async t => {
    const {watcher} = await scenario(t)
    watcher.monitor(subscription())
    watcher.monitor(subscription({path: '/small'}))
    await advance(t, 0)
    const slow = reads.find(read => read.path.endsWith('/large'))
    const smallReads = () => reads.filter(read => read.path.endsWith('/small'))
    smallReads()[0].resolve([])
    await settled()

    for (let poll = 0; poll < 5; poll++) {
        await advance(t, POLL_INTERVAL_MS)
        smallReads().at(-1).resolve([])
        await settled()
    }
    slow.resolve([])
    await settled()
    await advance(t, POLL_INTERVAL_MS)

    assert.equal(reads.filter(read => read.path.endsWith('/large')).length, 1)
    assert.equal(smallReads().length, 7)
})

test('the rest includes time spent comparing an unchanged listing', async t => {
    const {watcher, sent} = await scenario(t)
    const isEqual = _.isEqual
    t.mock.method(_, 'isEqual', (...args) => {
        t.mock.timers.tick(100)
        return isEqual(...args)
    })
    watcher.monitor(subscription())
    await advance(t, 0)
    reads[0].resolve([])
    await settled()
    await advance(t, POLL_INTERVAL_MS)

    reads[1].resolve([])
    await settled()
    assert.equal(sent.length, 1)
    await advance(t, 399)
    assert.equal(reads.length, 2)
    await advance(t, 1)
    assert.equal(reads.length, 3)
})

test('the rest includes synchronous delivery time', async t => {
    const {watcher} = await scenario(t, {onSend: () => t.mock.timers.tick(100)})
    watcher.monitor(subscription())
    await advance(t, 0)

    reads[0].resolve([])
    await settled()
    await advance(t, 399)
    assert.equal(reads.length, 1)
    await advance(t, 1)
    assert.equal(reads.length, 2)
})

test('a deletion refresh bypasses the rest, never overlaps a scan and replaces the old deadline', async t => {
    const {watcher} = await scenario(t)
    watcher.monitor(subscription())
    await advance(t, 0)
    await advance(t, 1000)
    reads[0].resolve([])
    await settled()

    watcher.remove(subscription({path: '/missing'}))
    await advance(t, 1000)
    assert.equal(reads.length, 2, 'refresh before the periodic poll at time 5000')

    watcher.remove(subscription({path: '/missing-again'}))
    await advance(t, 1000)
    assert.equal(reads.length, 2, 'refresh during a scan must not overlap it')
    reads[1].resolve([])
    await settled()
    await advance(t, 2000)
    assert.equal(reads.length, 2, 'the old periodic deadline was cancelled')
    await advance(t, 1999)
    assert.equal(reads.length, 2)
    await advance(t, 1)
    assert.equal(reads.length, 3)
})

for (const action of ['unmonitor', 'unsubscribe', 'offline', 'reset', 'stop']) {
    test(`${action} cancels a pending adaptive poll`, async t => {
        const {watcher, stop$} = await scenario(t)
        watcher.monitor(subscription())
        await advance(t, 0)
        await advance(t, 100)
        reads[0].resolve([])
        await settled()

        if (action === 'stop') {
            stop$.next()
        } else if (action === 'reset') {
            watcher.monitor(subscription({path: [], reset: true}))
        } else {
            watcher[action](subscription())
        }
        await advance(t, 4000)

        assert.equal(reads.length, 1)
    })
}

test('a retryable resolution failure still waits and polls again without a listing', async t => {
    const {watcher} = await scenario(t)
    resolutionError = Object.assign(new Error('Unavailable'), {code: 'EIO'})
    watcher.monitor(subscription())
    await advance(t, 0)
    assert.equal(reads.length, 0)

    await advance(t, POLL_INTERVAL_MS - 1)
    assert.equal(reads.length, 0)
    await advance(t, 1)

    assert.equal(reads.length, 1)
})

const scenario = async (t, {onSend} = {}) => {
    t.mock.timers.enable({apis: ['setTimeout', 'setInterval', 'Date'], now: 0})
    reads = []
    resolutionError = null
    const sent = []
    const stop$ = new Subject()
    const watcher = await createWatcher({
        send: message => {
            sent.push(message)
            onSend?.(message)
        },
        stop$,
        now: () => Date.now()
    })
    t.after(() => stop$.next())
    return {watcher, sent, stop$}
}

const subscription = (overrides = {}) => ({
    username: 'alice', clientId: 'client', subscriptionId: 'subscription', path: '/large', ...overrides
})

const advance = async (t, milliseconds) => {
    t.mock.timers.tick(milliseconds)
    await settled()
}
