import {jest} from '@jest/globals'

import {configureNoLogging} from '#sepal/log'

// routes -> dataApi -> config.js (commander). Mock config before the chain.
jest.unstable_mockModule('./config.js', () => ({
    googleMapsApiKey: 'test-google-key', nicfiPlanetApiKey: 'test-planet-key', port: 80
}))

const server = await import('#sepal/httpServer')
const {DataApi} = await import('./dataApi.js')
const {createRoutes} = await import('./routes.js')

// Requests through the real server: the routes as the module registers them, the guard that protects
// them, and the api they reach.

describe('the scene metadata routes', () => {
    let running
    let url
    let asked

    beforeAll(async () => {
        configureNoLogging()
        running = await startServer()
        url = path => `http://127.0.0.1:${running.address().port}${path}`
    })

    beforeEach(() => {
        asked = []
    })

    afterAll(() => running && new Promise(resolve => running.close(resolve)))

    test('answer a healthcheck', async () => {
        const response = await request('GET', '/healthcheck')

        expect(response.status).toBe(200)
        expect(response.body).toEqual({status: 'ok'})
    })

    describe('map api keys', () => {
        test('report the keys the map needs', async () => {
            const response = await request('GET', '/map-api-keys', {user: SOMEONE})

            expect(response.status).toBe(200)
            expect(response.body).toEqual({google: 'test-google-key', nicfiPlanet: 'test-planet-key'})
        })

        test('refuse a request carrying no user', async () => {
            const response = await request('GET', '/map-api-keys')

            expect(response.status).toBe(401)
        })
    })

    describe('best scenes', () => {
        test('report the chosen scenes of each area asked for', async () => {
            const response = await request('POST', '/best-scenes', {
                user: SOMEONE, body: {query: JSON.stringify(aClientQuery({sceneAreaIds: [SCENE_AREA_ID]}))}
            })

            expect(response.status).toBe(200)
            expect(response.body).toEqual({
                [SCENE_AREA_ID]: [{
                    id: 'SC001', dataSet: 'LANDSAT_8', date: '2021-07-15', cloudCover: 15, daysFromTarget: 0
                }]
            })
        })

        test('refuse a request carrying no user', async () => {
            const response = await request('POST', '/best-scenes', {body: {query: JSON.stringify(aClientQuery())}})

            expect(response.status).toBe(401)
        })
    })

    describe('the scenes of one area', () => {
        test('report them for the area named in the path', async () => {
            const response = await request(
                'GET', `/sceneareas/${SCENE_AREA_ID}?query=${encodeURIComponent(JSON.stringify(aClientQuery()))}`,
                {user: SOMEONE}
            )

            expect(response.status).toBe(200)
            expect(asked).toEqual([SCENE_AREA_ID])
            expect(response.body).toEqual([{
                id: 'SC001', dataSet: 'LANDSAT_8', date: '2021-07-15', cloudCover: 15, daysFromTarget: 0
            }])
        })

        test('refuse a request carrying no user', async () => {
            const response = await request(
                'GET', `/sceneareas/${SCENE_AREA_ID}?query=${encodeURIComponent(JSON.stringify(aClientQuery()))}`
            )

            expect(response.status).toBe(401)
        })
    })

    const request = async (method, path, {user, body} = {}) => {
        const response = await fetch(url(path), {
            method,
            headers: {
                'content-type': 'application/json',
                ...(user ? {'sepal-user': JSON.stringify(user)} : {})
            },
            body: body === undefined ? undefined : JSON.stringify(body)
        })
        const text = await response.text()
        return {status: response.status, body: text ? JSON.parse(text) : null}
    }

    // The api over a repository that answers from memory and records the area it was asked about, so a
    // response says which handler ran and what reached it from the path.
    const startServer = () => {
        const sceneRepository = {
            findBestScenes: async ({sceneAreaIds}) =>
                Object.fromEntries(sceneAreaIds.map(sceneAreaId => [sceneAreaId, [aScene()]])),
            findScenesInSceneArea: async ({sceneAreaId}) => {
                asked.push(sceneAreaId)
                return [aScene()]
            }
        }
        return server.start({
            port: 0,
            routes: createRoutes(new DataApi(sceneRepository)),
            // The default collects process-wide Prometheus metrics, which this has nothing to say about.
            metricsMiddleware: (_ctx, next) => next()
        })
    }

    const aScene = () => ({
        id: 'SC001', dataSet: 'LANDSAT_8', acquisitionDate: new Date('2021-07-15T00:00:00Z'), cloudCover: 15
    })

    // The client's own shape, as the GUI sends it — the handlers parse it before the repository sees it.
    const aClientQuery = (over = {}) => ({
        sources: {dataSets: {LANDSAT: ['LANDSAT_8', 'LANDSAT_9']}},
        dates: {
            seasonStart: '2021-06-01', seasonEnd: '2021-09-30', yearsBefore: 2, yearsAfter: 1,
            targetDate: '2021-07-15'
        },
        sceneSelectionOptions: {targetDateWeight: 0.5},
        cloudCoverTarget: 0.1,
        sceneCount: {min: 1, max: 3},
        sceneAreaIds: [SCENE_AREA_ID],
        ...over,
    })

    const SCENE_AREA_ID = 'SA_042'
    const SOMEONE = {username: 'bob', roles: []}
})
