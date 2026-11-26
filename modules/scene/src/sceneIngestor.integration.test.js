import assert from 'node:assert/strict'
import {join} from 'node:path'
import {after, before, beforeEach, describe, mock, test} from 'node:test'

import {defer, EMPTY, of, Subject} from 'rxjs'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {failingDb} from '#sepal/testSupport/db/faultyConnection'
import {createTestDb} from '#sepal/testSupport/db/testDb'
import {callsOf} from '#sepal/testSupport/mock'

import {SceneIngestor} from './sceneIngestor.js'
import {SceneRepository} from './sceneRepository.js'

const MIGRATIONS_PATH = join(dirName(import.meta.url), '../migrations')
const TIMESTAMP = new Date('2021-10-01T00:00:00Z')
const DATASET = 'LANDSAT_8'
const SCENE_AREA_ID = 'SA_042'
const INITIAL_CHECKPOINT = '2021-07-01T00:00:00.000Z'

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
const {updateFromStac, updateFromStac$} = await import('./stac.js')

describe('scene ingestion', () => {
    let testDb
    let ingestor
    let repository

    before(async () => {
        configureNoLogging()
        // Two connections, so a test can read the checkpoint while an insert holds the other.
        testDb = await createTestDb({name: 'scene_ingestor', migrations: MIGRATIONS_PATH, connections: 2})
    })

    beforeEach(async () => {
        await testDb.reset()
        getUpdates$.mock.resetCalls()
        getUpdates$.mock.mockImplementation(() => undefined)
        ingestor = new SceneIngestor(testDb.db)
        repository = new SceneRepository(testDb.db, () => TIMESTAMP)
        await ingestor.insert({scenes: [], timestamp: TIMESTAMP, checkpoints: {[DATASET]: INITIAL_CHECKPOINT}})
    })

    after(() => testDb?.remove())

    describe('insert', () => {
        test('makes the scene readable through SceneRepository', async () => {
            const scene = aScene()

            await ingestor.insert({scenes: [scene], timestamp: TIMESTAMP})

            const found = await repository.findScenesInSceneArea(aQuery())
            assert.deepEqual(found, [{
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
            assert.equal(found.length, 1)

            assert.partialDeepStrictEqual(found, [{
                id: scene.id, cloudCover: scene.cloudCover, updateTime: TIMESTAMP
            }])
        })

        test('advances a checkpoint but never moves it back', async () => {
            const later = '2021-07-20T00:00:00.000Z'
            await ingestor.insert({scenes: [aScene()], timestamp: TIMESTAMP, checkpoints: {[DATASET]: later}})

            await ingestor.insert({scenes: [aScene({id: 'earlier'})], timestamp: TIMESTAMP, checkpoints: {[DATASET]: INITIAL_CHECKPOINT}})

            const checkpoint = await ingestor.getCheckpoint(DATASET)
            assert.equal(checkpoint, later)
        })

        test('releases the connection after a failed insert so another operation can succeed', async () => {
            const scene = aScene()
            const error = new Error('Insert failed')
            const failingIngestor = new SceneIngestor(failingDb(testDb.db, {when: () => true, error}))

            await assert.rejects(
                failingIngestor.insert({scenes: [scene], timestamp: TIMESTAMP}),
                thrown => thrown === error
            )
            await ingestor.insert({scenes: [scene], timestamp: TIMESTAMP})

            const found = await repository.findScenesInSceneArea(aQuery())
            assert.deepEqual(found.map(({id}) => id), [scene.id])
        })
    })

    describe('getCheckpoint', () => {
        test('derives a missing checkpoint a second before the dataset\'s latest acquisition', async () => {
            const latest = aScene({id: 'latest', dataset: 'LANDSAT_9', acquiredTimestamp: '2021-07-16T10:00:00.000Z'})
            await ingestor.insert({scenes: [aScene({id: 'earlier', dataset: 'LANDSAT_9'}), latest], timestamp: TIMESTAMP})

            const checkpoint = await ingestor.getCheckpoint('LANDSAT_9')

            assert.equal(checkpoint, '2021-07-16T09:59:59.000Z')
        })

        test('keeps a derived checkpoint rather than deriving it again', async () => {
            await ingestor.insert({scenes: [aScene({id: 'first', dataset: 'LANDSAT_9'})], timestamp: TIMESTAMP})
            const derived = await ingestor.getCheckpoint('LANDSAT_9')
            await ingestor.insert({
                scenes: [aScene({id: 'later', dataset: 'LANDSAT_9', acquiredTimestamp: '2021-07-20T00:00:00.000Z'})],
                timestamp: TIMESTAMP
            })

            const checkpoint = await ingestor.getCheckpoint('LANDSAT_9')

            assert.equal(checkpoint, derived)
        })

        test('has no checkpoint for a dataset without scenes', async () => {
            const checkpoint = await ingestor.getCheckpoint('LANDSAT_9')

            assert.equal(checkpoint, null)
        })
    })

    describe('updateFromStac', () => {
        test('an update without a checkpoint resumes from the catalogue\'s latest acquisition', async () => {
            const existing = aScene({dataset: 'LANDSAT_9'})
            await ingestor.insert({scenes: [existing], timestamp: TIMESTAMP})
            getUpdates$.mock.mockImplementation(() => EMPTY)

            await updateFromStac({...anUpdate({database: ingestor}), dataset: 'LANDSAT_9'})

            const [[{minTimestamp}]] = callsOf(getUpdates$)
            assert.equal(minTimestamp, '2021-07-14T23:59:59.000Z')
        })

        test('a failed checkpoint write rolls back its page, and a retry ingests it', async () => {
            const scene = aScene()
            let fail = true
            const database = new SceneIngestor(failingDb(testDb.db, {
                when: sql => fail && sql.includes('INSERT INTO checkpoint'),
                error: new Error('Checkpoint write failed')
            }))
            getUpdates$.mock.mockImplementation(() => of(aPage([scene])))
            const update = anUpdate({database})

            await updateFromStac(update)

            const afterFailure = await repository.findScenesInSceneArea(aQuery())
            const failedCheckpoint = await ingestor.getCheckpoint(DATASET)
            assert.deepEqual(afterFailure, [])
            assert.equal(failedCheckpoint, INITIAL_CHECKPOINT)

            fail = false
            await updateFromStac(update)

            const afterRetry = await repository.findScenesInSceneArea(aQuery())
            const checkpoint = await ingestor.getCheckpoint(DATASET)
            assert.deepEqual(afterRetry.map(({id}) => id), [scene.id])
            assert.equal(checkpoint, scene.acquiredTimestamp)
        })

        test('fetches ahead of a pending insert, preserves insert order and advances the checkpoint as pages commit', async () => {
            const first = aScene()
            const another = aScene({id: 'another'})
            const last = aScene({id: 'last', acquiredTimestamp: '2021-07-16T00:00:00.000Z', dayOfYear: 197})
            const pending = holdFirstTransaction(testDb.db)
            const database = new SceneIngestor(pending.db)
            const fetchingNextPage = Promise.withResolvers()
            getUpdates$.mock.mockImplementation(({token}) => token
                ? defer(() => {
                    fetchingNextPage.resolve()
                    return of(aPage([{...first, cloudCover: 90}, last]))
                })
                : of(aPage([first, another], 'next')))

            const update = updateFromStac(anUpdate({database}))
            try {
                await Promise.all([pending.started, fetchingNextPage.promise])
                const checkpoint = await ingestor.getCheckpoint(DATASET)
                assert.equal(checkpoint, INITIAL_CHECKPOINT)
            } finally {
                pending.release()
                await pending.finished
                await update
            }

            const stored = await repository.findScenesInSceneArea(aQuery())
            const checkpoint = await ingestor.getCheckpoint(DATASET)
            assert.deepEqual(stored.map(({id}) => id).sort(), [first.id, another.id, last.id].sort())
            assert.equal(stored.find(({id}) => id === first.id).cloudCover, first.cloudCover)
            assert.equal(checkpoint, last.acquiredTimestamp)
        })

        for (const failure of ['fetch', 'insert']) {
            test(
                `a later-page ${failure} failure keeps earlier pages and their checkpoint, and retry completes without duplicates`,
                async () => {
                    const first = aScene()
                    const last = aScene({id: 'last', acquiredTimestamp: '2021-07-16T00:00:00.000Z', dayOfYear: 197})
                    const error = new Error('Later page failed')
                    const firstPageInserted = Promise.withResolvers()
                    let fail = true
                    getUpdates$.mock.mockImplementation(({token}) => {
                        if (!token) return of(aPage([first], 'next'))
                        if (fail && failure === 'fetch') return defer(async () => {
                            await firstPageInserted.promise
                            throw error
                        })
                        return of(aPage([last]))
                    })
                    const faultedIngestor = new SceneIngestor(failingDb(testDb.db, {
                        when: (sql, params) => fail && failure === 'insert'
                            && sql.includes('INSERT INTO scene') && params[0].includes(last.id),
                        error
                    }))
                    const database = {
                        getCheckpoint: dataset => faultedIngestor.getCheckpoint(dataset),
                        insert: async args => {
                            await faultedIngestor.insert(args)
                            firstPageInserted.resolve()
                        }
                    }
                    const update = anUpdate({database})

                    await updateFromStac(update)

                    const afterFailure = await repository.findScenesInSceneArea(aQuery())
                    const checkpointAfterFailure = await ingestor.getCheckpoint(DATASET)
                    assert.deepEqual(afterFailure.map(({id}) => id), [first.id])
                    assert.equal(checkpointAfterFailure, first.acquiredTimestamp)

                    fail = false
                    await updateFromStac(update)

                    const afterRetry = await repository.findScenesInSceneArea(aQuery())
                    const checkpointAfterRetry = await ingestor.getCheckpoint(DATASET)
                    assert.deepEqual(afterRetry.map(({id}) => id).sort(), [first.id, last.id].sort())
                    assert.equal(checkpointAfterRetry, last.acquiredTimestamp)
                }
            )
        }

        test('settles normally when there are no pages to retrieve', async () => {
            getUpdates$.mock.mockImplementation(() => EMPTY)

            await updateFromStac(anUpdate({database: ingestor}))

            const stored = await repository.findScenesInSceneArea(aQuery())
            const checkpoint = await ingestor.getCheckpoint(DATASET)
            assert.deepEqual(stored, [])
            assert.equal(checkpoint, INITIAL_CHECKPOINT)
        })

        test('propagates failure to read the initial checkpoint without fetching pages', async () => {
            const error = new Error('Checkpoint unavailable')
            const database = new SceneIngestor(failingDb(testDb.db, {
                when: sql => sql.includes('FROM checkpoint'),
                error
            }))

            await assert.rejects(
                updateFromStac(anUpdate({database})),
                thrown => thrown === error
            )

            const stored = await repository.findScenesInSceneArea(aQuery())
            assert.deepEqual(stored, [])
            assert.equal(getUpdates$.mock.callCount(), 0)
        })
    })

    describe('updateFromStac$ cancellation', () => {
        test('ignores a cancelled pending page without inserting, fetching again or advancing the checkpoint', async () => {
            const pendingPage$ = new Subject()
            const fetching = Promise.withResolvers()
            getUpdates$.mock.mockImplementation(() => {
                fetching.resolve()
                return pendingPage$
            })

            const subscription = updateFromStac$(anUpdate({database: ingestor})).subscribe()
            try {
                await fetching.promise
                subscription.unsubscribe()
                pendingPage$.next(aPage([aScene()], 'next'))
                pendingPage$.complete()

                const stored = await repository.findScenesInSceneArea(aQuery())
                const checkpoint = await ingestor.getCheckpoint(DATASET)
                assert.deepEqual(stored, [])
                assert.equal(checkpoint, INITIAL_CHECKPOINT)
                assert.equal(getUpdates$.mock.callCount(), 1)
            } finally {
                subscription.unsubscribe()
                pendingPage$.complete()
            }
        })

        test('lets an already-started insert commit and release its connection, dropping queued inserts and further requests', async () => {
            const first = aScene()
            const queued = aScene({id: 'queued', acquiredTimestamp: '2021-07-16T00:00:00.000Z', dayOfYear: 197})
            const late = aScene({id: 'late'})
            const pending = holdFirstTransaction(testDb.db)
            const database = new SceneIngestor(pending.db)
            const pendingPage$ = new Subject()
            const fetchingPendingPage = Promise.withResolvers()
            getUpdates$.mock.mockImplementation(({token}) => {
                if (!token) return of(aPage([first], 'queued'))
                if (token === 'queued') return of(aPage([queued], 'pending'))
                fetchingPendingPage.resolve()
                return pendingPage$
            })

            const subscription = updateFromStac$(anUpdate({database})).subscribe()
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
            const checkpoint = await ingestor.getCheckpoint(DATASET)
            assert.deepEqual(stored.map(({id}) => id), [first.id])
            assert.equal(checkpoint, first.acquiredTimestamp)
            assert.equal(getUpdates$.mock.callCount(), 3)
        })
    })
})

const aScene = (overrides = {}) => ({
    id: 'first', source: 'LANDSAT', dataset: DATASET, sceneAreaId: SCENE_AREA_ID,
    acquiredTimestamp: '2021-07-15T00:00:00.000Z', dayOfYear: 196,
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

const anUpdate = ({database}) => ({
    source: 'landsat-ot', dataset: DATASET, database, timestamp: TIMESTAMP
})

const holdFirstTransaction = db => {
    const started = Promise.withResolvers()
    const release = Promise.withResolvers()
    const finished = Promise.withResolvers()
    let hold = true
    return {
        db: {
            withConnection: run => db.withConnection(run),
            withTransaction: run => {
                if (!hold) return db.withTransaction(run)
                hold = false
                const operation = db.withTransaction(async connection => {
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
