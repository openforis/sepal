import {jest} from '@jest/globals'
import {defer, firstValueFrom, of, Subject, throwError} from 'rxjs'

import {configureNoLogging} from '#sepal/log'

import {IngestionCoordinator} from './ingestionCoordinator.js'

const TIMESTAMP = new Date('2021-10-01T00:00:00Z')
const INITIAL_CHECKPOINT = '2021-07-01T00:00:00Z'
const UPDATED_CHECKPOINT = '2021-07-15T00:00:00Z'

const getUpdates$ = jest.fn()
jest.unstable_mockModule('./earthSearch.js', () => ({getUpdates$}))
jest.unstable_mockModule('./config.js', () => ({minHoursPublished: 24}))
const {updateLandsat$} = await import('./landsatStac.js')
const {updateSentinel2$} = await import('./sentinel2Stac.js')

describe('ingestion coordinator lifetime', () => {
    const subscriptions = []

    beforeEach(() => {
        configureNoLogging()
        jest.useFakeTimers({now: TIMESTAMP})
        getUpdates$.mockReset()
    })

    afterEach(() => {
        subscriptions.splice(0).forEach(subscription => subscription.unsubscribe())
        jest.useRealTimers()
    })

    test('a recreated database invalidates an old initialization marker and rebuilds before readiness', async () => {
        const {coordinator, redis, ingestor} = givenIngestion({initialized: INITIAL_CHECKPOINT})

        await firstValueFrom(coordinator.start$(true))

        const initialized = await redis.getInitialized()
        expect(initialized).toBe(TIMESTAMP.toISOString())
        expect(ingestor.publish).toHaveBeenCalledTimes(1)
    })

    test('an existing database preserves its initialization marker and published catalogue', async () => {
        const {coordinator, redis, ingestor} = givenIngestion({initialized: INITIAL_CHECKPOINT})

        await firstValueFrom(coordinator.start$(false))

        const initialized = await redis.getInitialized()
        expect(initialized).toBe(INITIAL_CHECKPOINT)
        expect(ingestor.publish).not.toHaveBeenCalled()
    })

    test('an empty source list still publishes and reaches readiness with no checkpoints', async () => {
        const {coordinator, redis, ingestor} = givenIngestion({initialized: null, sources: []})

        await firstValueFrom(coordinator.start$(false))

        const initialized = await redis.getInitialized()
        expect(initialized).toBe(TIMESTAMP.toISOString())
        expect(redis.setLastUpdate).toHaveBeenCalledWith({})
        expect(ingestor.publish).toHaveBeenCalledTimes(1)
    })

    test('a scheduled cycle follows the injected source order and each source\'s dataset order', async () => {
        const sources = [aSource(updateSentinel2$), aSource(updateLandsat$)]
        const {coordinator, stored, redis} = givenIngestion({sources})
        getUpdates$.mockImplementation(({dataset}) => of(aPage(dataset)))
        const ready = Promise.withResolvers()

        subscriptions.push(coordinator.start$(false).subscribe({next: ready.resolve, error: ready.reject}))
        await ready.promise
        await jest.advanceTimersByTimeAsync(10_000)

        expect(stored.map(({id}) => id)).toEqual(['SENTINEL_2', 'LANDSAT_8', 'LANDSAT_9'])
        for (const dataset of ['LANDSAT_8', 'LANDSAT_9', 'SENTINEL_2']) {
            const checkpoint = await redis.getLastUpdate(dataset)
            expect(checkpoint).toBe(UPDATED_CHECKPOINT)
        }
    })

    test('unsubscribing cancels a pending STAC page, later datasets and future scheduled cycles', async () => {
        const {coordinator, stored, redis} = givenIngestion()
        const page$ = new Subject()
        getUpdates$.mockReturnValue(page$)
        const ready = Promise.withResolvers()
        const subscription = coordinator.start$(false).subscribe({next: ready.resolve, error: ready.reject})
        subscriptions.push(subscription)
        await ready.promise
        await jest.advanceTimersByTimeAsync(10_000)
        expect(getUpdates$).toHaveBeenCalledTimes(1)

        subscription.unsubscribe()
        page$.next(aPage('cancelled', 'next'))
        page$.complete()
        await jest.advanceTimersByTimeAsync(60 * 60 * 1000)

        const checkpoint = await redis.getLastUpdate('LANDSAT_8')
        expect(stored).toEqual([])
        expect(checkpoint).toBe(INITIAL_CHECKPOINT)
        expect(redis.setLastUpdate).not.toHaveBeenCalled()
        expect(getUpdates$).toHaveBeenCalledTimes(1)
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
        getUpdates$.mockImplementation(({token}) => of(token ? aPage('queued') : aPage('first', 'next')))
        const ready = Promise.withResolvers()
        const subscription = coordinator.start$(false).subscribe({next: ready.resolve, error: ready.reject})
        subscriptions.push(subscription)
        await ready.promise
        await jest.advanceTimersByTimeAsync(10_000)
        await started.promise
        expect(getUpdates$).toHaveBeenCalledTimes(2)

        subscription.unsubscribe()
        pending.resolve()
        await insertion
        await jest.advanceTimersByTimeAsync(60 * 60 * 1000)

        const checkpoint = await redis.getLastUpdate('LANDSAT_8')
        expect(stored.map(({id}) => id)).toEqual(['first'])
        expect(checkpoint).toBe(INITIAL_CHECKPOINT)
        expect(redis.setLastUpdate).not.toHaveBeenCalled()
        expect(getUpdates$).toHaveBeenCalledTimes(2)
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
        await jest.advanceTimersByTimeAsync(0)

        expect(sentinel2.load$).not.toHaveBeenCalled()
        expect(ingestor.publish).not.toHaveBeenCalled()
        expect(redis.setLastUpdate).not.toHaveBeenCalled()
        const initialized = await redis.getInitialized()
        expect(initialized).toBeNull()
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
        await jest.advanceTimersByTimeAsync(0)
        expect(failure).toBeUndefined()
        pending.resolve()
        await initialization
        await jest.advanceTimersByTimeAsync(60 * 60 * 1000)

        expect(failure).toBe(error)
        expect(landsat.load$).not.toHaveBeenCalled()
        expect(sentinel2.load$).not.toHaveBeenCalled()
        expect(ingestor.publish).not.toHaveBeenCalled()
        expect(redis.setLastUpdate).not.toHaveBeenCalled()
        expect(getUpdates$).not.toHaveBeenCalled()
        const initialized = await redis.getInitialized()
        expect(initialized).toBeNull()
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
        setLastUpdate: jest.fn(async updates => { Object.assign(checkpoints, updates) })
    }
    const ingestor = {
        prepare: async () => {},
        cleanup: async () => {},
        publish: jest.fn(async () => {}),
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

const aSource = update$ => ({download$: () => of(undefined), load$: jest.fn(() => of({})), update$})

const aPage = (id, token) => ({scenes: [{id}], token, mostRecentTimestamp: UPDATED_CHECKPOINT})
