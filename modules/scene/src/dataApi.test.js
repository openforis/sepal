import assert from 'node:assert/strict'
import {beforeEach, describe, mock, test} from 'node:test'

const mockFindBestScenes = mock.fn()
const mockFindScenesInSceneArea = mock.fn()

mock.module('./config.js', {
    exports: {
        googleMapsApiKey: 'test-google-key',
        nicfiPlanetApiKey: 'test-planet-key'
    }
})

const {DataApi} = await import('./dataApi.js')

const api = new DataApi({
    findBestScenes: query => mockFindBestScenes(query),
    findScenesInSceneArea: query => mockFindScenesInSceneArea(query),
})

const USER = {username: 'alice', roles: ['user']}

// targetDayOfYear for 2020-07-15:
// 2020 is a leap year. Jul 15 raw doy = 31+29+31+30+31+30+15 = 197.
// After leap-ignoring: 197 - 1 = 196.
const TARGET_DOY = 196

beforeEach(() => {
    mockFindBestScenes.mock.resetCalls()
    mockFindBestScenes.mock.mockImplementation(() => undefined)
    mockFindScenesInSceneArea.mock.resetCalls()
    mockFindScenesInSceneArea.mock.mockImplementation(() => undefined)
})

describe('mapApiKeys', () => {
    test('sets ctx.body to {google, nicfiPlanet} from config', async () => {
        const ctx = makeCtx()
        await mapApiKeys(ctx)
        assert.deepEqual(ctx.body, {
            google: 'test-google-key',
            nicfiPlanet: 'test-planet-key',
        })
    })
})

describe('bestScenes', () => {
    test('calls repository.findBestScenes with parsed query', async () => {
        mockFindBestScenes.mock.mockImplementation(async () => ({
            'SA_042': []
        }))
        const ctx = makeCtx({
            body: {query: JSON.stringify(CLIENT_BEST_SCENES_QUERY)},
        })
        await bestScenes(ctx)
        assert.equal(mockFindBestScenes.mock.callCount(), 1)
        const q = mockFindBestScenes.mock.calls[0].arguments[0]
        assert.equal(q.source, 'LANDSAT')
        assert.deepEqual(q.dataSets, ['LANDSAT_8', 'LANDSAT_9'])
        assert.equal(q.targetDayOfYear, TARGET_DOY)
        assert.deepEqual(q.sceneAreaIds, ['SA_042'])
    })

    test('responds with object keyed by sceneAreaId containing sceneData arrays', async () => {
        const row = makeSceneRow()
        mockFindBestScenes.mock.mockImplementation(async () => ({
            'SA_042': [row]
        }))
        const ctx = makeCtx({
            body: {query: JSON.stringify(CLIENT_BEST_SCENES_QUERY)},
        })
        await bestScenes(ctx)
        assert.ok('SA_042' in Object(ctx.body))
        const scenes = ctx.body['SA_042']
        assert.equal(scenes.length, 1)
        const s = scenes[0]
        assert.equal(s.id, 'SC001')
        assert.equal(s.dataSet, 'LANDSAT_8')
        assert.equal(s.cloudCover, 15)
        assert.equal(s.date, '2020-07-15')
        assert.equal(s.daysFromTarget, 0)
    })

    test('responds with multiple areas', async () => {
        const row042 = makeSceneRow({id: 'SC001', sceneAreaId: 'SA_042'})
        const row043 = makeSceneRow({id: 'SC002', sceneAreaId: 'SA_043'})
        mockFindBestScenes.mock.mockImplementation(async () => ({
            'SA_042': [row042],
            'SA_043': [row043]
        }))
        const query = {...CLIENT_BEST_SCENES_QUERY, sceneAreaIds: ['SA_042', 'SA_043']}
        const ctx = makeCtx({body: {query: JSON.stringify(query)}})
        await bestScenes(ctx)
        assert.ok(new Set(['SA_042', 'SA_043']).isSubsetOf(new Set(Object.keys(ctx.body))))
        assert.equal(ctx.body['SA_042'][0].id, 'SC001')
        assert.equal(ctx.body['SA_043'][0].id, 'SC002')
    })

    test('sceneData has id, dataSet, date, cloudCover, daysFromTarget — no extra top-level fields', async () => {
        const row = makeSceneRow()
        mockFindBestScenes.mock.mockImplementation(async () => ({
            'SA_042': [row]
        }))
        const ctx = makeCtx({body: {query: JSON.stringify(CLIENT_BEST_SCENES_QUERY)}})
        await bestScenes(ctx)
        const s = ctx.body['SA_042'][0]
        const keys = Object.keys(s).sort()
        assert.deepEqual(keys, ['cloudCover', 'dataSet', 'date', 'daysFromTarget', 'id'])
    })
})

describe('scenesForArea', () => {
    const SCENE_AREA_CLIENT_QUERY = {
        sources: {
            dataSets: {
                LANDSAT: ['LANDSAT_8']
            }
        },
        dates: {
            seasonStart: '2018-06-01',
            seasonEnd: '2021-09-30',
            yearsBefore: 0,
            yearsAfter: 0,
            targetDate: '2020-07-15',
        },
        sceneSelectionOptions: {targetDateWeight: 0.5},
    }

    test('calls repository.findScenesInSceneArea with sceneAreaId from params', async () => {
        mockFindScenesInSceneArea.mock.mockImplementation(async () => [])
        const ctx = makeCtx({
            params: {sceneAreaId: 'SA_042'},
            query: {query: JSON.stringify(SCENE_AREA_CLIENT_QUERY)},
        })
        await scenesForArea(ctx)
        assert.equal(mockFindScenesInSceneArea.mock.callCount(), 1)
        const q = mockFindScenesInSceneArea.mock.calls[0].arguments[0]
        assert.equal(q.sceneAreaId, 'SA_042')
        assert.deepEqual(q.dataSets, ['LANDSAT_8'])
        assert.equal(q.targetDayOfYear, TARGET_DOY)
    })

    test('responds with array of sceneData objects', async () => {
        const row = makeSceneRow()
        mockFindScenesInSceneArea.mock.mockImplementation(async () => [row])
        const ctx = makeCtx({
            params: {sceneAreaId: 'SA_042'},
            query: {query: JSON.stringify(SCENE_AREA_CLIENT_QUERY)},
        })
        await scenesForArea(ctx)
        assert.equal(Array.isArray(ctx.body), true)
        assert.equal(ctx.body.length, 1)
        const s = ctx.body[0]
        assert.equal(s.id, 'SC001')
        assert.equal(s.dataSet, 'LANDSAT_8')
        assert.equal(s.date, '2020-07-15')
        assert.equal(s.cloudCover, 15)
        assert.equal(s.daysFromTarget, 0)
    })

    test('reads query from ctx.query.query (query param, not body)', async () => {
        mockFindScenesInSceneArea.mock.mockImplementation(async () => [])
        const ctx = makeCtx({
            params: {sceneAreaId: 'SA_042'},
            query: {query: JSON.stringify(SCENE_AREA_CLIENT_QUERY)},
            body: {query: '{"wrong": true}'},  // body should NOT be read
        })
        await scenesForArea(ctx)
        const q = mockFindScenesInSceneArea.mock.calls[0].arguments[0]
        assert.deepEqual(q.dataSets, ['LANDSAT_8'])  // from SCENE_AREA_CLIENT_QUERY, not body
    })
})
const mapApiKeys = ctx => api.mapApiKeys(ctx)
const bestScenes = ctx => api.bestScenes(ctx)
const scenesForArea = ctx => api.scenesForArea(ctx)

const makeCtx = ({body = {}, query = {}, params = {}, user = USER} = {}) => ({
    request: {body},
    query,
    params,
    state: {currentUser: user},
    throw: mock.fn((status, msg) => {
        const err = new Error(msg || String(status))
        err.status = status
        throw err
    }),
})

const makeSceneRow = ({
    id = 'SC001',
    source = 'LANDSAT',
    sceneAreaId = 'SA_042',
    dataSet = 'LANDSAT_8',
    acquisitionDate = new Date('2020-07-15T00:00:00Z'),
    cloudCover = 15,
} = {}) => ({
    id,
    source,
    sceneAreaId,
    dataSet,
    acquisitionDate,
    cloudCover,
    cloud_cover: cloudCover,
    sunAzimuth: 120,
    sunElevation: 45,
    updateTime: new Date('2020-07-16T00:00:00Z'),
})

const CLIENT_BEST_SCENES_QUERY = {
    sceneAreaIds: ['SA_042'],
    sources: {
        dataSets: {
            LANDSAT: ['LANDSAT_8', 'LANDSAT_9']
        }
    },
    dates: {
        seasonStart: '2018-06-01',
        seasonEnd: '2021-09-30',
        yearsBefore: 0,
        yearsAfter: 0,
        targetDate: '2020-07-15',
    },
    sceneSelectionOptions: {targetDateWeight: 0.5},
    cloudCoverTarget: 0.1,
    sceneCount: {min: 1, max: 5},
}
