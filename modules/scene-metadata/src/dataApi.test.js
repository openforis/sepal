import {jest} from '@jest/globals'

const mockFindBestScenes = jest.fn()
const mockFindScenesInSceneArea = jest.fn()

jest.unstable_mockModule('./sceneRepository.js', () => ({
    findBestScenes: mockFindBestScenes,
    findScenesInSceneArea: mockFindScenesInSceneArea,
}))

jest.unstable_mockModule('./config.js', () => ({
    googleMapsApiKey: 'test-google-key',
    nicfiPlanetApiKey: 'test-planet-key',
}))

const {mapApiKeys, bestScenes, scenesForArea} = await import('./dataApi.js')

const USER = {username: 'alice', roles: ['user']}

const makeCtx = ({body = {}, query = {}, params = {}, user = USER} = {}) => ({
    request: {body},
    query,
    params,
    state: {currentUser: user},
    throw: jest.fn((status, msg) => {
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
    acquisitionDate = new Date('2020-07-15T00:00:00Z'), // doy 197 raw; 196 leap-ignoring (2020 is leap)
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

// targetDayOfYear for 2020-07-15:
// 2020 is a leap year. Jul 15 raw doy = 31+29+31+30+31+30+15 = 197.
// After leap-ignoring: 197 - 1 = 196.
const TARGET_DOY = 196

beforeEach(() => {
    mockFindBestScenes.mockReset()
    mockFindScenesInSceneArea.mockReset()
})

describe('mapApiKeys', () => {
    test('sets ctx.body to {google, nicfiPlanet} from config', async () => {
        const ctx = makeCtx()
        await mapApiKeys(ctx)
        expect(ctx.body).toEqual({
            google: 'test-google-key',
            nicfiPlanet: 'test-planet-key',
        })
    })
})

describe('bestScenes', () => {
    test('calls repository.findBestScenes with parsed query', async () => {
        mockFindBestScenes.mockResolvedValue({'SA_042': []})
        const ctx = makeCtx({
            body: {query: JSON.stringify(CLIENT_BEST_SCENES_QUERY)},
        })
        await bestScenes(ctx)
        expect(mockFindBestScenes).toHaveBeenCalledTimes(1)
        const q = mockFindBestScenes.mock.calls[0][0]
        expect(q.source).toBe('LANDSAT')
        expect(q.dataSets).toEqual(['LANDSAT_8', 'LANDSAT_9'])
        expect(q.targetDayOfYear).toBe(TARGET_DOY)
        expect(q.sceneAreaIds).toEqual(['SA_042'])
    })

    test('responds with object keyed by sceneAreaId containing sceneData arrays', async () => {
        const row = makeSceneRow()
        mockFindBestScenes.mockResolvedValue({'SA_042': [row]})
        const ctx = makeCtx({
            body: {query: JSON.stringify(CLIENT_BEST_SCENES_QUERY)},
        })
        await bestScenes(ctx)
        expect(ctx.body).toHaveProperty('SA_042')
        const scenes = ctx.body['SA_042']
        expect(scenes).toHaveLength(1)
        const s = scenes[0]
        expect(s.id).toBe('SC001')
        expect(s.dataSet).toBe('LANDSAT_8')
        expect(s.cloudCover).toBe(15)
        expect(s.date).toBe('2020-07-15')
        // daysFromTarget: daysFromDayOfYear(2020-07-15, 196)
        // raw doy of 2020-07-15 = 197; |197-196|=1; min(1, 364)=1
        expect(s.daysFromTarget).toBe(1)
    })

    test('responds with multiple areas', async () => {
        const row042 = makeSceneRow({id: 'SC001', sceneAreaId: 'SA_042'})
        const row043 = makeSceneRow({id: 'SC002', sceneAreaId: 'SA_043'})
        mockFindBestScenes.mockResolvedValue({
            'SA_042': [row042],
            'SA_043': [row043],
        })
        const query = {...CLIENT_BEST_SCENES_QUERY, sceneAreaIds: ['SA_042', 'SA_043']}
        const ctx = makeCtx({body: {query: JSON.stringify(query)}})
        await bestScenes(ctx)
        expect(Object.keys(ctx.body)).toEqual(expect.arrayContaining(['SA_042', 'SA_043']))
        expect(ctx.body['SA_042'][0].id).toBe('SC001')
        expect(ctx.body['SA_043'][0].id).toBe('SC002')
    })

    test('sceneData has id, dataSet, date, cloudCover, daysFromTarget — no extra top-level fields', async () => {
        const row = makeSceneRow()
        mockFindBestScenes.mockResolvedValue({'SA_042': [row]})
        const ctx = makeCtx({body: {query: JSON.stringify(CLIENT_BEST_SCENES_QUERY)}})
        await bestScenes(ctx)
        const s = ctx.body['SA_042'][0]
        const keys = Object.keys(s).sort()
        expect(keys).toEqual(['cloudCover', 'dataSet', 'date', 'daysFromTarget', 'id'])
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
        mockFindScenesInSceneArea.mockResolvedValue([])
        const ctx = makeCtx({
            params: {sceneAreaId: 'SA_042'},
            query: {query: JSON.stringify(SCENE_AREA_CLIENT_QUERY)},
        })
        await scenesForArea(ctx)
        expect(mockFindScenesInSceneArea).toHaveBeenCalledTimes(1)
        const q = mockFindScenesInSceneArea.mock.calls[0][0]
        expect(q.sceneAreaId).toBe('SA_042')
        expect(q.dataSets).toEqual(['LANDSAT_8'])
        expect(q.targetDayOfYear).toBe(TARGET_DOY)
    })

    test('responds with array of sceneData objects', async () => {
        const row = makeSceneRow()
        mockFindScenesInSceneArea.mockResolvedValue([row])
        const ctx = makeCtx({
            params: {sceneAreaId: 'SA_042'},
            query: {query: JSON.stringify(SCENE_AREA_CLIENT_QUERY)},
        })
        await scenesForArea(ctx)
        expect(Array.isArray(ctx.body)).toBe(true)
        expect(ctx.body).toHaveLength(1)
        const s = ctx.body[0]
        expect(s.id).toBe('SC001')
        expect(s.dataSet).toBe('LANDSAT_8')
        expect(s.date).toBe('2020-07-15')
        expect(s.cloudCover).toBe(15)
        expect(s.daysFromTarget).toBe(1)
    })

    test('reads query from ctx.query.query (query param, not body)', async () => {
        mockFindScenesInSceneArea.mockResolvedValue([])
        const ctx = makeCtx({
            params: {sceneAreaId: 'SA_042'},
            query: {query: JSON.stringify(SCENE_AREA_CLIENT_QUERY)},
            body: {query: '{"wrong": true}'},  // body should NOT be read
        })
        await scenesForArea(ctx)
        const q = mockFindScenesInSceneArea.mock.calls[0][0]
        expect(q.dataSets).toEqual(['LANDSAT_8'])  // from SCENE_AREA_CLIENT_QUERY, not body
    })
})
