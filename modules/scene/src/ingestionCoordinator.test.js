import assert from 'node:assert/strict'
import {afterEach, beforeEach, describe, mock, test} from 'node:test'

import {defer, firstValueFrom, of, Subject, throwError} from 'rxjs'

import {configureNoLogging} from '#sepal/log'
import {callsOf} from '#sepal/testSupport/mock'

import {IngestionCoordinator} from './ingestionCoordinator.js'

const TIMESTAMP = new Date('2021-10-01T00:00:00Z')
const INITIAL_CHECKPOINT = '2021-07-01T00:00:00Z'
const UPDATED_CHECKPOINT = '2021-07-15T00:00:00Z'

const getUpdates$ = mock.fn()
mock.module('./earthSearch.js', {
    exports: {
        getUpdates$
    }
})
mock.module('./config.js', {
    exports: {
        minHoursPublished: 24
    }
})
const {updateLandsat$} = await import('./landsatStac.js')
const {updateSentinel2$} = await import('./sentinel2Stac.js')

describe('ingestion coordinator lifetime', () => {
    const subscriptions = []

    beforeEach(() => {
        configureNoLogging()
        mock.timers.enable({apis: ['setTimeout', 'setInterval', 'Date'], now: TIMESTAMP})
        getUpdates$.mock.resetCalls()
        getUpdates$.mock.mockImplementation(() => undefined)
    })

    afterEach(() => {
        subscriptions.splice(0).forEach(subscription => subscription.unsubscribe())
        mock.timers.reset()
    })

    test('a recreated database invalidates an old initialization marker and rebuilds before readiness', async () => {
        const {coordinator, redis, ingestor} = givenIngestion({initialized: INITIAL_CHECKPOINT})

        await firstValueFrom(coordinator.start$(true))

        const initialized = await redis.getInitialized()
        assert.equal(initialized, TIMESTAMP.toISOString())
        assert.equal(ingestor.publish.mock.callCount(), 1)
    })

    test('an existing database preserves its initialization marker and published catalogue', async () => {
        const {coordinator, redis, ingestor} = givenIngestion({initialized: INITIAL_CHECKPOINT})

        await firstValueFrom(coordinator.start$(false))

        const initialized = await redis.getInitialized()
        assert.equal(initialized, INITIAL_CHECKPOINT)
        assert.equal(ingestor.publish.mock.callCount(), 0)
    })

    test('an empty source list still publishes and reaches readiness with no checkpoints', async () => {
        const {coordinator, redis, ingestor} = givenIngestion({initialized: null, sources: []})

        await firstValueFrom(coordinator.start$(false))

        const initialized = await redis.getInitialized()
        assert.equal(initialized, TIMESTAMP.toISOString())
        assert.deepEqual(callsOf(redis.setLastUpdate), [[{}]])
        assert.equal(ingestor.publish.mock.callCount(), 1)
    })

    test('a scheduled cycle follows the injected source order and each source\'s dataset order', async () => {
        const sources = [aSource(updateSentinel2$), aSource(updateLandsat$)]
        const {coordinator, stored, redis} = givenIngestion({sources})
        getUpdates$.mock.mockImplementation(({dataset}) => of(aPage(dataset)))
        const ready = Promise.withResolvers()

        subscriptions.push(coordinator.start$(false).subscribe({next: ready.resolve, error: ready.reject}))
        await ready.promise
        await advanceTimers(10_000)

        assert.deepEqual(stored.map(({id}) => id), ['SENTINEL_2', 'LANDSAT_8', 'LANDSAT_9'])
        for (const dataset of ['LANDSAT_8', 'LANDSAT_9', 'SENTINEL_2']) {
            const checkpoint = await redis.getLastUpdate(dataset)
            assert.equal(checkpoint, UPDATED_CHECKPOINT)
        }
    })

    test('unsubscribing cancels a pending STAC page, later datasets and future scheduled cycles', async () => {
        const {coordinator, stored, redis} = givenIngestion()
        const page$ = new Subject()
        getUpdates$.mock.mockImplementation(() => page$)
        const ready = Promise.withResolvers()
        const subscription = coordinator.start$(false).subscribe({next: ready.resolve, error: ready.reject})
        subscriptions.push(subscription)
        await ready.promise
        await advanceTimers(10_000)
        assert.equal(getUpdates$.mock.callCount(), 1)

        subscription.unsubscribe()
        page$.next(aPage('cancelled', 'next'))
        page$.complete()
        await advanceTimers(60 * 60 * 1000)

        const checkpoint = await redis.getLastUpdate('LANDSAT_8')
        assert.deepEqual(stored, [])
        assert.equal(checkpoint, INITIAL_CHECKPOINT)
        assert.equal(redis.setLastUpdate.mock.callCount(), 0)
        assert.equal(getUpdates$.mock.callCount(), 1)
    })

    test('unsubscribing lets an active insert finish but drops queued pages and later datasets', async () => {
        const {coordinator, ingestor, stored, redis} = givenIngestion()
        const pending = Promise.withResolvers()
        const started = Promise.withResolvers()
        let insertion
        ingestor.insert = ({scenes}) => {
            insertion = pending.promise.then(() => { stored.push(...scenes) })
            started.resolve()
            return insertion
        }
        getUpdates$.mock.mockImplementation(({token}) => of(token ? aPage('queued') : aPage('first', 'next')))
        const ready = Promise.withResolvers()
        const subscription = coordinator.start$(false).subscribe({next: ready.resolve, error: ready.reject})
        subscriptions.push(subscription)
        await ready.promise
        await advanceTimers(10_000)
        await started.promise
        assert.equal(getUpdates$.mock.callCount(), 2)

        subscription.unsubscribe()
        pending.resolve()
        await insertion
        await advanceTimers(60 * 60 * 1000)

        const checkpoint = await redis.getLastUpdate('LANDSAT_8')
        assert.deepEqual(stored.map(({id}) => id), ['first'])
        assert.equal(checkpoint, INITIAL_CHECKPOINT)
        assert.equal(redis.setLastUpdate.mock.callCount(), 0)
        assert.equal(getUpdates$.mock.callCount(), 2)
    })

    test('cancelling initialization allows an active CSV load to settle without starting another load or publication', async () => {
        const {coordinator, sources: [landsat, sentinel2], ingestor, redis} = givenIngestion({initialized: null})
        const loading = Promise.withResolvers()
        const pending = Promise.withResolvers()
        const load = pending.promise.then(() => ({LANDSAT_8: UPDATED_CHECKPOINT}))
        landsat.load$ = () => defer(() => {
            loading.resolve()
            return load
        })
        const subscription = coordinator.start$(false).subscribe()
        subscriptions.push(subscription)
        await loading.promise

        subscription.unsubscribe()
        pending.resolve()
        await load
        await advanceTimers(0)

        assert.equal(sentinel2.load$.mock.callCount(), 0)
        assert.equal(ingestor.publish.mock.callCount(), 0)
        assert.equal(redis.setLastUpdate.mock.callCount(), 0)
        const initialized = await redis.getInitialized()
        assert.equal(initialized, null)
    })

    test('a failed download is reported only after the other download settles, without loading or publishing', async () => {
        const {coordinator, sources: [landsat, sentinel2], ingestor, redis} = givenIngestion({initialized: null})
        const error = new Error('Download failed')
        const pending = Promise.withResolvers()
        const downloading = Promise.withResolvers()
        landsat.download$ = () => throwError(() => error)
        sentinel2.download$ = () => defer(() => {
            downloading.resolve()
            return pending.promise
        })
        let failure

        const initialization = firstValueFrom(coordinator.start$(false)).catch(error => { failure = error })
        await downloading.promise
        await advanceTimers(0)
        assert.equal(failure, undefined)
        pending.resolve()
        await initialization
        await advanceTimers(60 * 60 * 1000)

        assert.equal(failure, error)
        assert.equal(landsat.load$.mock.callCount(), 0)
        assert.equal(sentinel2.load$.mock.callCount(), 0)
        assert.equal(ingestor.publish.mock.callCount(), 0)
        assert.equal(redis.setLastUpdate.mock.callCount(), 0)
        assert.equal(getUpdates$.mock.callCount(), 0)
        const initialized = await redis.getInitialized()
        assert.equal(initialized, null)
    })
})

const givenIngestion = ({initialized = TIMESTAMP.toISOString(), sources = [aSource(updateLandsat$), aSource(updateSentinel2$)]} = {}) => {
    const stored = []
    const checkpoints = {}
    const redis = {
        getInitialized: async () => initialized,
        setInitialized: async timestamp => { initialized = timestamp },
        reset: async () => {
            initialized = null
            for (const dataset of Object.keys(checkpoints)) delete checkpoints[dataset]
        },
        getLastUpdate: async dataset => checkpoints[dataset] || INITIAL_CHECKPOINT,
        setLastUpdate: mock.fn(async updates => { Object.assign(checkpoints, updates) })
    }
    const ingestor = {
        prepare: async () => {},
        cleanup: async () => {},
        publish: mock.fn(async () => {}),
        insert: async ({scenes}) => { stored.push(...scenes) }
    }
    return {
        stored, redis, ingestor, sources,
        coordinator: new IngestionCoordinator({
            redis, sceneIngestor: ingestor, sources,
            clock: () => TIMESTAMP, minHoursPublished: 24, updateIntervalMinutes: 60
        })
    }
}

const aSource = update$ => ({download$: () => of(undefined), load$: mock.fn(() => of({})), update$})

const aPage = (id, token) => ({scenes: [{id}], token, mostRecentTimestamp: UPDATED_CHECKPOINT})

// mock.timers.tick fires every timer due in its window synchronously; advancing a second at a time lets
// the work one timer starts settle before the next one is due.
const advanceTimers = async ms => {
    for (let elapsed = 0; elapsed < ms; elapsed += TIMER_STEP_MS) {
        mock.timers.tick(Math.min(TIMER_STEP_MS, ms - elapsed))
        await settle()
    }
    await settle()
}

const settle = () => new Promise(resolve => setImmediate(resolve))

const TIMER_STEP_MS = 1000
