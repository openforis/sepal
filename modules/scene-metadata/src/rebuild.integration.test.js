import assert from 'node:assert/strict'
import {chmod, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {after, afterEach, before, beforeEach, describe, mock, test} from 'node:test'
import {gzipSync} from 'node:zlib'

import {concatMap, defer, EMPTY, firstValueFrom, lastValueFrom, throwError, toArray} from 'rxjs'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {failingDb} from '#sepal/testSupport/db/faultyConnection'

import {processCSV} from './csv.js'
import {IngestionCoordinator} from './ingestionCoordinator.js'
import {loadLandsat$} from './landsatCsv.js'
import {SceneIngestor} from './sceneIngestor.js'
import {loadSentinel2$} from './sentinel2Csv.js'
import {createRebuildDb} from './testSupport/rebuildDb.js'

const TIMESTAMP = new Date('2021-10-01T00:00:00Z')
const INITIAL_CHECKPOINT = '2020-01-01T00:00:00.000Z'

describe('catalogue rebuild recovery', () => {
    let testDb
    let directory
    let ingestor
    let redis
    let landsat
    let sentinel2
    const filesDirectory = process.env.MYSQL_FILES_DIR

    before(async () => {
        configureNoLogging()
        testDb = await createRebuildDb(join(dirName(import.meta.url), '../migrations'))
    })

    beforeEach(async () => {
        await testDb.reset()
        directory = await mkdtemp(join(filesDirectory, 'test-scene-rebuild-'))
        await chmod(directory, 0o755)
        process.env.MYSQL_FILES_DIR = directory
        ingestor = new SceneIngestor(testDb.db)
        await ingestor.insert({scenes: [aScene({id: 'live-before-rebuild'})], timestamp: TIMESTAMP})
        redis = checkpointStore()
        landsat = {
            download$: () => defer(async () => {
                await writeCsv('landsat-tm', landsatCsv('LT05'))
                await writeCsv('landsat-etm', landsatCsv('LE07'))
                await writeCsv('landsat-ot', landsatCsv('LC08'))
            }),
            load$: loadLandsat$,
            update$: () => EMPTY
        }
        sentinel2 = {
            download$: () => defer(() => writeCsv('sentinel-2', sentinelCsv())),
            load$: loadSentinel2$,
            update$: () => EMPTY
        }
    })

    afterEach(async () => {
        process.env.MYSQL_FILES_DIR = filesDirectory
        await rm(directory, {recursive: true, force: true})
    })

    after(() => testDb?.remove())

    test('publishes parsed Landsat and Sentinel files before persisting checkpoints and initialization', async () => {
        const {setLastUpdate} = redis
        let publishedAtCheckpoint
        redis.setLastUpdate = async checkpoints => {
            publishedAtCheckpoint = await storedIds()
            await setLastUpdate(checkpoints)
        }
        const coordinator = aCoordinator()

        await firstValueFrom(coordinator.start$(false))

        const initialized = await redis.getInitialized()
        const landsatCheckpoint = await redis.getLastUpdate('LANDSAT_8')
        const sentinelCheckpoint = await redis.getLastUpdate('SENTINEL_2')
        assert.equal(publishedAtCheckpoint.length, 4)
        assert.ok(!publishedAtCheckpoint.includes('live-before-rebuild'))
        assert.equal(initialized, TIMESTAMP.toISOString())
        assert.equal(landsatCheckpoint, '2021-07-15T00:00:00.000Z')
        assert.equal(sentinelCheckpoint, '2021-07-15T10:00:00.000Z')
    })

    for (const [name, load$] of [
        ['Landsat', loadLandsat$],
        ['Sentinel-2', loadSentinel2$]
    ]) {
        test(
            `${name} defers loading and emits one empty checkpoint map when no scenes qualify`,
            async () => {
                const source$ = load$({database: ingestor, maxTimestamp: INITIAL_CHECKPOINT, timestamp: TIMESTAMP})
                await firstValueFrom(landsat.download$())
                await firstValueFrom(sentinel2.download$())
                await ingestor.prepare()

                const emissions = await lastValueFrom(source$.pipe(toArray()))

                const staged = await storedIds(`${testDb.dbName}_new`)
                const live = await storedIds()
                assert.deepEqual(emissions, [{}])
                assert.deepEqual(staged, [])
                assert.deepEqual(live, ['live-before-rebuild'])
            }
        )
    }

    test('a required download failure preserves the live catalogue and initialization state', async () => {
        const error = new Error('Download failed')
        landsat.download$ = () => throwError(() => error)
        const coordinator = aCoordinator()

        await assert.rejects(firstValueFrom(coordinator.start$(false)), thrown => thrown === error)

        const stored = await storedIds()
        const checkpoint = await redis.getLastUpdate('LANDSAT_8')
        const initialized = await redis.getInitialized()
        assert.deepEqual(stored, ['live-before-rebuild'])
        assert.equal(checkpoint, INITIAL_CHECKPOINT)
        assert.equal(initialized, null)
    })

    test('a parsing failure after partial progress preserves live data, and a restart discards staging', async () => {
        const download$ = landsat.download$
        landsat.download$ = () => download$().pipe(
            concatMap(() => defer(async () => {
                await writeCsv('landsat-tm', landsatCsv('LT04'))
                await writeCsv('landsat-etm', '"unterminated')
            }))
        )
        const coordinator = aCoordinator()

        await assert.rejects(firstValueFrom(coordinator.start$(false)))

        const liveBeforeRetry = await storedIds()
        const staged = await storedIds(`${testDb.dbName}_new`)
        const checkpointBeforeRetry = await redis.getLastUpdate('LANDSAT_8')
        const initializedBeforeRetry = await redis.getInitialized()
        assert.deepEqual(liveBeforeRetry, ['live-before-rebuild'])
        assert.equal(staged.length, 1)
        assert.equal(checkpointBeforeRetry, INITIAL_CHECKPOINT)
        assert.equal(initializedBeforeRetry, null)

        landsat.download$ = download$
        await firstValueFrom(coordinator.start$(false))

        const liveAfterRetry = await storedIds()
        const initialized = await redis.getInitialized()
        assert.equal(liveAfterRetry.length, 4)
        assert.ok(!liveAfterRetry.includes('live-before-rebuild'))
        assert.ok(!liveAfterRetry.includes(staged[0]))
        assert.equal(initialized, TIMESTAMP.toISOString())
    })

    test('a failed bulk load retains its chunk and prevents publication until a fresh successful rebuild', async () => {
        const error = new Error('Bulk load failed')
        let fail = true
        ingestor = new SceneIngestor(failingDb(testDb.db, {
            when: sql => fail && sql.includes('LOAD DATA'), error
        }))
        const coordinator = aCoordinator()

        await assert.rejects(firstValueFrom(coordinator.start$(false)), thrown => thrown === error)

        const live = await storedIds()
        const failedChunk = await readFile(join(directory, 'landsat-tm.1.csv'), 'utf8')
        const initialized = await redis.getInitialized()
        assert.deepEqual(live, ['live-before-rebuild'])
        assert.ok(failedChunk.includes('LT05'))
        assert.equal(failedChunk.endsWith('\n'), true)
        assert.equal(initialized, null)

        fail = false
        await firstValueFrom(coordinator.start$(false))

        const published = await storedIds()
        assert.equal(published.length, 4)
        assert.ok(!published.includes('live-before-rebuild'))
    })

    for (const operation of ['setLastUpdate', 'setInitialized']) {
        test(
            `failure of ${operation} after publication restarts with a full rebuild, not another swap`,
            async () => {
                const error = new Error('Redis write failed')
                redis[operation].mock.mockImplementationOnce(async () => {
                    throw error
                })
                const coordinator = aCoordinator()

                await assert.rejects(firstValueFrom(coordinator.start$(false)), thrown => thrown === error)

                const published = await storedIds()
                const initializedBeforeRetry = await redis.getInitialized()
                assert.equal(published.length, 4)
                assert.ok(!published.includes('live-before-rebuild'))
                assert.equal(initializedBeforeRetry, null)

                await firstValueFrom(coordinator.start$(false))

                const afterRetry = await storedIds()
                const initialized = await redis.getInitialized()
                assert.deepEqual(afterRetry, published)
                assert.equal(initialized, TIMESTAMP.toISOString())
            }
        )
    }

    test('cleanup failure does not undo successful initialization, and startup retries cleanup without rebuilding', async () => {
        mock.method(ingestor, 'cleanup', async () => {
            throw new Error('Cleanup unavailable')
        }, {times: 1})
        const coordinator = aCoordinator()

        await firstValueFrom(coordinator.start$(false))

        const published = await storedIds()
        const initialized = await redis.getInitialized()
        assert.equal(published.length, 4)
        assert.equal(initialized, TIMESTAMP.toISOString())

        landsat.download$ = () => throwError(() => new Error('Must not rebuild'))
        await firstValueFrom(coordinator.start$(false))

        const afterCleanup = await storedIds()
        const [disposable] = await testDb.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME IN (?, ?)', [
            `${testDb.dbName}_new`, `${testDb.dbName}_old`
        ])
        assert.deepEqual(afterCleanup, published)
        assert.deepEqual(disposable, [])

        await ingestor.cleanup()

        const afterRepeatedCleanup = await storedIds()
        assert.deepEqual(afterRepeatedCleanup, published)
    })

    test('complete CSV chunks load all rows, including the final partial chunk, before publication', async () => {
        const scenes = [aScene({id: 'first,"quoted"'}), aScene({id: 'second'}), aScene({id: 'last'})]
        await writeCsv('tiny', 'id\n1\n2\n3\n')
        await ingestor.prepare()

        const checkpoints = await processCSV({
            collection: 'tiny', sceneMapper: ({id}) => scenes[Number(id) - 1],
            database: ingestor, timestamp: TIMESTAMP, chunkSize: 2
        })
        const beforePublication = await storedIds()
        await ingestor.publish()

        const published = await storedIds()
        assert.deepEqual(beforePublication, ['live-before-rebuild'])
        assert.deepEqual(published, scenes.map(({id}) => id).sort())
        assert.deepEqual(checkpoints, {LANDSAT_8: scenes[0].acquiredTimestamp})
    })

    test('MySQL bulk-load errors reject and leave the live catalogue intact', async () => {
        await ingestor.prepare()

        await assert.rejects(ingestor.ingest(join(directory, 'missing.csv'), TIMESTAMP))

        const live = await storedIds()
        assert.deepEqual(live, ['live-before-rebuild'])
    })

    const aCoordinator = () => new IngestionCoordinator({
        redis, sceneIngestor: ingestor, sources: [landsat, sentinel2], clock: () => TIMESTAMP,
        minHoursPublished: 24, updateIntervalMinutes: 60
    })

    const writeCsv = (collection, content) => writeFile(join(directory, `${collection}.csv.gz`), gzipSync(content), {mode: 0o644})

    const storedIds = async (dbName = testDb.dbName) => {
        const [rows] = await testDb.query('SELECT id FROM ??.scene_meta_data ORDER BY id', [dbName])
        return rows.map(({id}) => id)
    }
})

const aScene = (overrides = {}) => ({
    id: 'scene', source: 'LANDSAT', dataset: 'LANDSAT_8', sceneAreaId: '42_34',
    acquiredTimestamp: '2021-07-15T00:00:00.000Z', dayOfYear: 196,
    cloudCover: 10, sunAzimuth: 130.5, sunElevation: 55.25, ...overrides
})

const landsatCsv = prefix => [
    'Landsat Product Identifier L2,WRS Path,WRS Row,Collection Category,Scene Cloud Cover L1,Sun Azimuth L1,Sun Elevation L1,Date Acquired',
    `${prefix}_L2SP_042034_20210715_20210722_02_T1,42,34,T1,10,130.5,55.25,2021/07/15`, ''
].join('\n')

const sentinelCsv = () => [
    'GRANULE_ID,PRODUCT_ID,CLOUD_COVER,SENSING_TIME',
    'L1C_T32TNR_A000001_20210715T120000,S2A_MSIL1C_20210715T100000_N0300_R022_T32TNR_20210715T120000.SAFE,10,2021-07-15T10:00:00.000Z', ''
].join('\n')

const checkpointStore = () => {
    let initialized = null
    const checkpoints = {LANDSAT_8: INITIAL_CHECKPOINT}
    return {
        getInitialized: async () => initialized,
        getLastUpdate: async dataset => checkpoints[dataset],
        setLastUpdate: mock.fn(async updates => { Object.assign(checkpoints, updates) }),
        setInitialized: mock.fn(async value => { initialized = value })
    }
}
