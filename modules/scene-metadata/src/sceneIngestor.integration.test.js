import {jest} from '@jest/globals'
import {join} from 'path'
import {defer, EMPTY, of, Subject} from 'rxjs'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {failingDb} from '#sepal/testSupport/db/faultyConnection'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {SceneIngestor} from './sceneIngestor.js'
import {SceneRepository} from './sceneRepository.js'

const MIGRATIONS_PATH = join(dirName(import.meta.url), '../migrations')
const TIMESTAMP = new Date('2021-10-01T00:00:00Z')
const DATASET = 'LANDSAT_8'
const SCENE_AREA_ID = 'SA_042'
const INITIAL_CHECKPOINT = '2021-07-01T00:00:00Z'

const getUpdates$ = jest.fn()
jest.unstable_mockModule('./earthSearch.js', () => ({getUpdates$}))
jest.unstable_mockModule('./config.js', () => ({minHoursPublished: 24}))
const {updateFromStac, updateFromStac$} = await import('./stac.js')

describe('scene ingestion', () => {
    let testDb
    let ingestor
    let repository

    beforeAll(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'scene_ingestor', migrations: MIGRATIONS_PATH})
    })

    beforeEach(async () => {
        await testDb.reset()
        getUpdates$.mockReset()
        ingestor = new SceneIngestor(testDb.db)
        repository = new SceneRepository(testDb.db, () => TIMESTAMP)
    })

    afterAll(() => testDb?.remove())

    describe('insert', () => {
        test('makes the scene readable through SceneRepository', async () => {
            const scene = aScene()

            await ingestor.insert({scenes: [scene], timestamp: TIMESTAMP})

            const found = await repository.findScenesInSceneArea(aQuery())
            expect(found).toEqual([{
                id: scene.id,
                source: scene.source,
                dataSet: scene.dataset,
                sceneAreaId: scene.sceneAreaId,
                acquisitionDate: new Date(scene.acquiredTimestamp),
                cloudCover: scene.cloudCover,
                cloud_cover: scene.cloudCover,
                sunAzimuth: scene.sunAzimuth,
                sunElevation: scene.sunElevation,
                updateTime: TIMESTAMP
            }])
        })

        test('ignores a repeated scene without replacing its metadata', async () => {
            const scene = aScene()
            await ingestor.insert({scenes: [scene], timestamp: TIMESTAMP})

            await ingestor.insert({scenes: [{...scene, cloudCover: 90}], timestamp: new Date('2021-10-02T00:00:00Z')})

            const found = await repository.findScenesInSceneArea(aQuery())
            expect(found).toEqual([expect.objectContaining({
                id: scene.id, cloudCover: scene.cloudCover, updateTime: TIMESTAMP
            })])
        })

        test('releases the connection after a failed insert so another operation can succeed', async () => {
            const scene = aScene()
            const error = new Error('Insert failed')
            const failingIngestor = new SceneIngestor(failingDb(testDb.db, {when: () => true, error}))

            await expect(failingIngestor.insert({scenes: [scene], timestamp: TIMESTAMP})).rejects.toBe(error)
            await ingestor.insert({scenes: [scene], timestamp: TIMESTAMP})

            const found = await repository.findScenesInSceneArea(aQuery())
            expect(found.map(({id}) => id)).toEqual([scene.id])
        })
    })

    describe('updateFromStac', () => {
        test('keeps inserted rows after a checkpoint-write failure and retries without duplicates', async () => {
            const scene = aScene()
            const redis = checkpointStore()
            redis.setLastUpdate.mockRejectedValueOnce(new Error('Checkpoint write failed'))
            getUpdates$.mockReturnValue(of(aPage([scene])))
            const update = anUpdate({redis, database: ingestor})

            await updateFromStac(update)

            const afterFailure = await repository.findScenesInSceneArea(aQuery())
            const failedCheckpoint = await redis.getLastUpdate(DATASET)
            expect(afterFailure.map(({id}) => id)).toEqual([scene.id])
            expect(failedCheckpoint).toBe(INITIAL_CHECKPOINT)

            await updateFromStac(update)

            const afterRetry = await repository.findScenesInSceneArea(aQuery())
            const checkpoint = await redis.getLastUpdate(DATASET)
            expect(afterRetry.map(({id}) => id)).toEqual([scene.id])
            expect(checkpoint).toBe(scene.acquiredTimestamp)
        })

        test('fetches ahead of a pending insert, preserves insert order and waits to advance the checkpoint', async () => {
            const first = aScene()
            const another = aScene({id: 'another'})
            const last = aScene({id: 'last', acquiredTimestamp: '2021-07-16T00:00:00Z', dayOfYear: 197})
            const redis = checkpointStore()
            const pending = holdFirstConnection(testDb.db)
            const database = new SceneIngestor(pending.db)
            const fetchingNextPage = Promise.withResolvers()
            getUpdates$.mockImplementation(({token}) => token
                ? defer(() => {
                    fetchingNextPage.resolve()
                    return of(aPage([{...first, cloudCover: 90}, last]))
                })
                : of(aPage([first, another], 'next')))

            const update = updateFromStac(anUpdate({redis, database}))
            try {
                await Promise.all([pending.started, fetchingNextPage.promise])
                const checkpoint = await redis.getLastUpdate(DATASET)
                expect(checkpoint).toBe(INITIAL_CHECKPOINT)
            } finally {
                pending.release()
                await pending.finished
                await update
            }

            const stored = await repository.findScenesInSceneArea(aQuery())
            const checkpoint = await redis.getLastUpdate(DATASET)
            expect(stored.map(({id}) => id).sort()).toEqual([first.id, another.id, last.id].sort())
            expect(stored.find(({id}) => id === first.id).cloudCover).toBe(first.cloudCover)
            expect(checkpoint).toBe(last.acquiredTimestamp)
        })

        test.each(['fetch', 'insert'])('a later-page %s failure preserves earlier rows and the checkpoint, and retry completes without duplicates', async failure => {
            const first = aScene()
            const last = aScene({id: 'last', acquiredTimestamp: '2021-07-16T00:00:00Z', dayOfYear: 197})
            const redis = checkpointStore()
            const error = new Error('Later page failed')
            const firstPageInserted = Promise.withResolvers()
            let fail = true
            getUpdates$.mockImplementation(({token}) => {
                if (!token) return of(aPage([first], 'next'))
                if (fail && failure === 'fetch') return defer(async () => {
                    await firstPageInserted.promise
                    throw error
                })
                return of(aPage([last]))
            })
            const faultedIngestor = new SceneIngestor(failingDb(testDb.db, {
                when: (_sql, [rows]) => fail && failure === 'insert' && rows.some(([id]) => id === last.id),
                error
            }))
            const database = {
                insert: async args => {
                    await faultedIngestor.insert(args)
                    firstPageInserted.resolve()
                }
            }
            const update = anUpdate({redis, database})

            await updateFromStac(update)

            const afterFailure = await repository.findScenesInSceneArea(aQuery())
            const checkpointAfterFailure = await redis.getLastUpdate(DATASET)
            expect(afterFailure.map(({id}) => id)).toEqual([first.id])
            expect(checkpointAfterFailure).toBe(INITIAL_CHECKPOINT)

            fail = false
            await updateFromStac(update)

            const afterRetry = await repository.findScenesInSceneArea(aQuery())
            const checkpointAfterRetry = await redis.getLastUpdate(DATASET)
            expect(afterRetry.map(({id}) => id).sort()).toEqual([first.id, last.id].sort())
            expect(checkpointAfterRetry).toBe(last.acquiredTimestamp)
        })

        test('settles normally when there are no pages to retrieve', async () => {
            const redis = checkpointStore()
            getUpdates$.mockReturnValue(EMPTY)

            await updateFromStac(anUpdate({redis, database: ingestor}))

            const stored = await repository.findScenesInSceneArea(aQuery())
            const checkpoint = await redis.getLastUpdate(DATASET)
            expect(stored).toEqual([])
            expect(checkpoint).toBe(INITIAL_CHECKPOINT)
        })

        test('propagates failure to read the initial checkpoint without fetching pages', async () => {
            const error = new Error('Checkpoint unavailable')
            const redis = {
                ...checkpointStore(),
                getLastUpdate: async () => { throw error }
            }

            await expect(updateFromStac(anUpdate({redis, database: ingestor}))).rejects.toBe(error)

            const stored = await repository.findScenesInSceneArea(aQuery())
            expect(stored).toEqual([])
            expect(getUpdates$).not.toHaveBeenCalled()
        })
    })

    describe('updateFromStac$ cancellation', () => {
        test('ignores a cancelled pending page without inserting, fetching again or writing a checkpoint', async () => {
            const redis = checkpointStore()
            const pendingPage$ = new Subject()
            const fetching = Promise.withResolvers()
            getUpdates$.mockImplementation(() => {
                fetching.resolve()
                return pendingPage$
            })

            const subscription = updateFromStac$(anUpdate({redis, database: ingestor})).subscribe()
            try {
                await fetching.promise
                subscription.unsubscribe()
                pendingPage$.next(aPage([aScene()], 'next'))
                pendingPage$.complete()

                const stored = await repository.findScenesInSceneArea(aQuery())
                const checkpoint = await redis.getLastUpdate(DATASET)
                expect(stored).toEqual([])
                expect(checkpoint).toBe(INITIAL_CHECKPOINT)
                expect(redis.setLastUpdate).not.toHaveBeenCalled()
                expect(getUpdates$).toHaveBeenCalledTimes(1)
            } finally {
                subscription.unsubscribe()
                pendingPage$.complete()
            }
        })

        test('lets an already-started insert finish and release its connection, dropping queued inserts and further requests', async () => {
            const first = aScene()
            const queued = aScene({id: 'queued'})
            const late = aScene({id: 'late'})
            const redis = checkpointStore()
            const pending = holdFirstConnection(testDb.db)
            const database = new SceneIngestor(pending.db)
            const pendingPage$ = new Subject()
            const fetchingPendingPage = Promise.withResolvers()
            getUpdates$.mockImplementation(({token}) => {
                if (!token) return of(aPage([first], 'queued'))
                if (token === 'queued') return of(aPage([queued], 'pending'))
                fetchingPendingPage.resolve()
                return pendingPage$
            })

            const subscription = updateFromStac$(anUpdate({redis, database})).subscribe()
            try {
                await Promise.all([pending.started, fetchingPendingPage.promise])
                subscription.unsubscribe()
            } finally {
                subscription.unsubscribe()
                pending.release()
                await pending.finished
            }
            pendingPage$.next(aPage([late], 'after-cancellation'))
            pendingPage$.complete()

            const stored = await repository.findScenesInSceneArea(aQuery())
            const checkpoint = await redis.getLastUpdate(DATASET)
            expect(stored.map(({id}) => id)).toEqual([first.id])
            expect(checkpoint).toBe(INITIAL_CHECKPOINT)
            expect(redis.setLastUpdate).not.toHaveBeenCalled()
            expect(getUpdates$).toHaveBeenCalledTimes(3)
        })
    })
})

const aScene = (overrides = {}) => ({
    id: 'first', source: 'LANDSAT', dataset: DATASET, sceneAreaId: SCENE_AREA_ID,
    acquiredTimestamp: '2021-07-15T00:00:00Z', dayOfYear: 196,
    cloudCover: 10, sunAzimuth: 130.5, sunElevation: 55.25,
    ...overrides
})

const aQuery = () => ({
    sceneAreaId: SCENE_AREA_ID, dataSets: [DATASET],
    fromDate: '2021-06-01', toDate: '2021-09-30',
    targetDayOfYear: 196, targetDayOfYearWeight: 0.5
})

const aPage = (scenes, token) => ({
    scenes, token,
    mostRecentTimestamp: scenes.map(({acquiredTimestamp}) => acquiredTimestamp).sort().at(-1)
})

const anUpdate = ({redis, database}) => ({
    source: 'landsat-ot', dataset: DATASET, redis, database, timestamp: TIMESTAMP
})

const checkpointStore = () => {
    const checkpoints = {[DATASET]: INITIAL_CHECKPOINT}
    return {
        getLastUpdate: async dataset => checkpoints[dataset],
        setLastUpdate: jest.fn(async updates => { Object.assign(checkpoints, updates) })
    }
}

const holdFirstConnection = db => {
    const started = Promise.withResolvers()
    const release = Promise.withResolvers()
    const finished = Promise.withResolvers()
    let hold = true
    return {
        db: {
            withConnection: run => {
                if (!hold) return db.withConnection(run)
                hold = false
                const operation = db.withConnection(async connection => {
                    started.resolve()
                    await release.promise
                    return run(connection)
                })
                operation.then(finished.resolve, finished.reject)
                return operation
            }
        },
        started: started.promise,
        release: () => release.resolve(),
        finished: finished.promise
    }
}
