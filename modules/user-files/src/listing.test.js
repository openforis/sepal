import assert from 'node:assert/strict'
import {mkdtempSync, realpathSync} from 'node:fs'
import * as fs from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {after, afterEach, before, describe, mock, test} from 'node:test'
import {setImmediate as settled, setTimeout as delay} from 'node:timers/promises'

import {filter, firstValueFrom, ReplaySubject, Subject, timeout} from 'rxjs'

import {configureNoLogging} from '#sepal/log'

// Listings, by REST and by the watcher, of directories whose entries are made up: as many as a test likes, each looked
// at only when the test allows it. A look waits in one queue with the looks of every other listing, served first come,
// first served, as requests wait for the service's file system threads.

const POLL_INTERVAL_MS = 60000
const WAIT_MS = 5000
const LARGE_WAIT_MS = 60000

const homeDir = realpathSync(mkdtempSync(join(tmpdir(), 'user-files-')))

// By directory: the names a listing finds there, whether looks at them are held, and how looking fails for some.
// Every entry is a one-byte file otherwise.
const madeUp = new Map()
// Held looks not yet released, first come first.
const looks = []
// Every entry looked at, in order.
const looked = []

mock.module('node:fs/promises', {
    exports: {
        ...fs,
        readdir: async (path, ...options) =>
            madeUp.has(path) ? [...madeUp.get(path).names] : fs.readdir(path, ...options),
        lstat: async (path, ...options) => {
            const directory = madeUp.get(dirname(path))
            if (!directory) {
                return fs.lstat(path, ...options)
            }
            looked.push(path)
            if (directory.held) {
                await new Promise(release => looks.push({path, release}))
            }
            const failing = directory.failing?.[path.slice(dirname(path).length + 1)]
            if (failing) {
                throw Object.assign(new Error(`Simulated ${failing}`), {code: failing})
            }
            return aFileStats()
        }
    }
})

mock.module('./config.js', {
    exports: {homeDir, pollIntervalMilliseconds: POLL_INTERVAL_MS}
})

const {ENTRY_CONCURRENCY} = await import('./homePath.js')
const {createWatcher} = await import('./watcher.js')
const {listFiles} = await import('./filesystem.js')

before(() => configureNoLogging())

afterEach(() => {
    madeUp.clear()
    looks.length = 0
    looked.length = 0
})

after(() => fs.rm(homeDir, {recursive: true, force: true}))

describe('listing a directory', () => {
    test('reports every entry of a directory with more entries than a call can take arguments', async t => {
        const count = 200000
        await aMadeUpDirectory('ann', 'large', {count})
        const watcher = await aWatcher(t)

        const listing = await watcher.listed('ann', 'large', LARGE_WAIT_MS)

        assert.equal(Object.keys(listing.items ?? {}).length, count, `listing: ${JSON.stringify(listing).slice(0, 200)}`)
        assert.deepEqual(listing.items[`entry-${count - 1}.csv`], {mtime: 0, file: true, size: 1})
    })

    for (const [lister, list] of Object.entries({REST: listedByRest, watcher: listedByWatcher})) {
        test(`looks at no more entries at a time than its allowance, by ${lister}, starting each as another is done`, async t => {
            const directory = await aMadeUpDirectory('ann', 'held', {count: 3 * ENTRY_CONCURRENCY, held: true})
            const listing = list(t, 'ann', 'held')
            await until(() => looks.length > 0)
            await settled()
            assert.equal(looked.length, ENTRY_CONCURRENCY)

            await releaseNextLook()

            assert.equal(looked.length, ENTRY_CONCURRENCY + 1)
            assert.equal(heldIn(directory).length, ENTRY_CONCURRENCY)
            const {result} = await releasingUntil(listing)
            assert.deepEqual(result.sort(), madeUpNames(3 * ENTRY_CONCURRENCY).sort())
        })
    }

    test('lets another user\'s listing finish while a large one waits, behind no more looks than its allowance', async t => {
        const large = await aMadeUpDirectory('ann', 'large', {count: 10 * ENTRY_CONCURRENCY, held: true})
        const small = await aMadeUpDirectory('bob', 'small', {count: 3, held: true})
        const watcher = await aWatcher(t)
        watcher.monitor('ann', 'large')
        await until(() => looks.length > 0)
        await settled()
        const smallListing = listedByRest(t, 'bob', 'small')
        await until(() => heldIn(small).length === 3)

        const {result, released} = await releasingUntil(smallListing)

        assert.deepEqual(result, madeUpNames(3))
        assert.ok(
            released.filter(path => dirname(path) === large).length <= ENTRY_CONCURRENCY,
            `released ${released.length} looks first`
        )
    })

    test('keeps each listing\'s entries to itself, whoever lists at the same time', async t => {
        await aMadeUpDirectory('ann', 'a', {count: 5, name: index => `ann-${index}`})
        await aMadeUpDirectory('bob', 'b', {count: 3, name: index => `bob-${index}`})

        const [annByWatcher, bobByWatcher, annByRest, bobByRest] = await Promise.all([
            listedByWatcher(t, 'ann', 'a'),
            listedByWatcher(t, 'bob', 'b'),
            listedByRest(t, 'ann', 'a'),
            listedByRest(t, 'bob', 'b')
        ])

        assert.deepEqual([annByWatcher, annByRest].map(names => names.sort()), [annNames(5), annNames(5)])
        assert.deepEqual([bobByWatcher, bobByRest].map(names => names.sort()), [bobNames(3), bobNames(3)])
    })

    test('leaves out entries that vanish or cannot be looked at', async t => {
        await aMadeUpDirectory('ann', 'project', {
            names: ['kept.csv', 'vanished.csv', 'unreadable.csv'],
            failing: {'vanished.csv': 'ENOENT', 'unreadable.csv': 'EACCES'}
        })

        const listings = [await listedByRest(t, 'ann', 'project'), await listedByWatcher(t, 'ann', 'project')]

        assert.deepEqual(listings, [['kept.csv'], ['kept.csv']])
    })
})

describe('monitoring a large directory', () => {
    test('stops looking at entries once unmonitored, and sends nothing late', async t => {
        const larger = await aMadeUpDirectory('ann', 'larger', {count: 2 * ENTRY_CONCURRENCY, held: true})
        const smaller = await aMadeUpDirectory('ann', 'smaller', {count: 3, held: true})
        const watcher = await aWatcher(t)
        for (const path of ['larger', 'smaller']) {
            watcher.monitor('ann', path)
        }
        await until(() => heldIn(larger).length > 0 && heldIn(smaller).length === 3)
        await settled()

        for (const path of ['larger', 'smaller']) {
            watcher.unmonitor('ann', path)
        }
        await releasingAll()

        assert.equal(looked.filter(path => dirname(path) === larger).length, ENTRY_CONCURRENCY)
        assert.deepEqual(watcher.sent(), [])
    })
})

const aMadeUpDirectory = async (username, path, {count, name = index => `entry-${index}.csv`, names, held = false, failing}) => {
    const directory = join(homeDir, username, path)
    await fs.mkdir(directory, {recursive: true})
    madeUp.set(directory, {names: names ?? Array.from({length: count}, (_, index) => name(index)), held, failing})
    return directory
}

const madeUpNames = count =>
    Array.from({length: count}, (_, index) => `entry-${index}.csv`)

const annNames = count =>
    Array.from({length: count}, (_, index) => `ann-${index}`).sort()

const bobNames = count =>
    Array.from({length: count}, (_, index) => `bob-${index}`).sort()

const aFileStats = () => ({
    isSymbolicLink: () => false,
    isDirectory: () => false,
    isFile: () => true,
    size: 1,
    mtimeMs: 0,
    mtime: new Date(0)
})

const heldIn = directory =>
    looks.filter(({path}) => dirname(path) === directory)

const releaseNextLook = async () => {
    looks.shift().release()
    await settled()
}

const releasingAll = async () => {
    if (looks.length) {
        await releaseNextLook()
        return releasingAll()
    }
}

// Releases held looks, first come first served, until the listing is done. Answers its result, and the looks
// released before it was done.
const releasingUntil = async listing => {
    const outcome = {}
    listing.then(result => Object.assign(outcome, {result}), error => Object.assign(outcome, {error}))
    const releasing = async released => {
        await settled()
        if (Object.keys(outcome).length) {
            return released
        }
        assert.ok(looks.length, 'the listing waits for nothing it was allowed')
        const {path, release} = looks.shift()
        release()
        return releasing([...released, path])
    }
    const released = await releasing([])
    if (outcome.error) {
        throw outcome.error
    }
    return {result: outcome.result, released}
}

// The names a REST listing reports.
async function listedByRest(_t, username, path) {
    const ctx = {
        request: {headers: {'sepal-user': JSON.stringify({username})}},
        query: {path},
        response: {}
    }
    await listFiles(homeDir, ctx)
    return ctx.body.files.map(({name}) => name)
}

// The names the watcher reports, once it has scanned the path.
async function listedByWatcher(t, username, path) {
    const watcher = await aWatcher(t)
    return Object.keys((await watcher.listed(username, path, WAIT_MS)).items ?? {})
}

const aWatcher = async t => {
    const stop$ = new Subject()
    const sent$ = new ReplaySubject()
    const sent = []
    const watcher = await createWatcher({
        send: message => {
            sent.push(message)
            sent$.next(message)
        },
        stop$
    })
    t.after(() => stop$.next())
    const subscription = (username, path) => ({username, clientId: `${username}-client`, subscriptionId: path, path})
    return {
        monitor: (username, path) => watcher.monitor(subscription(username, path)),
        unmonitor: (username, path) => watcher.unmonitor(subscription(username, path)),
        listed: async (username, path, waitMs) => {
            watcher.monitor(subscription(username, path))
            return (await firstValueFrom(sent$.pipe(filter(({data}) => data.path === path), timeout(waitMs)))).data
        },
        sent: () => [...sent]
    }
}

const until = async (condition, waited = 0) => {
    if (condition()) {
        return
    }
    assert.ok(waited < WAIT_MS, 'the condition never held')
    await delay(5)
    return until(condition, waited + 5)
}
