import http from 'node:http'

import {jest} from '@jest/globals'
import {defaultIfEmpty, EMPTY, firstValueFrom, forkJoin, of} from 'rxjs'

// How a request's operation looks up GeoIDs: the real configure task builds the reader from the configured
// endpoint, the real job wrapper runs later tasks inside the operation, and the real finalize task ends it.
// A local server stands in for the GeoID service.

const GEOID = '40df4325-744f-8fae-8e46-049080be5554'
const OTHER_GEOID = '0b9e6c0a-1d2f-8a3b-9c4d-5e6f7a8b9c0d'
const POINT = {type: 'Point', coordinates: [147.38, -33.5]}
const POLYGON = {
    type: 'Polygon',
    coordinates: [[[147.38, -33.50], [147.39, -33.50], [147.39, -33.51], [147.38, -33.50]]]
}

let geoIdEndpoint, server, requests, respond

jest.unstable_mockModule('#gee/config', () => ({
    googleProjectId: 'test-project',
    instances: 1,
    port: 80,
    recipeEndpoint: 'http://recipe',
    sepalEndpoint: 'http://test',
    serviceAccountCredentials: {}
}))

jest.unstable_mockModule('#gee/jobs/service/context', () => ({
    contextService: {serviceName: 'ContextService', serviceHandler$: () => of({})},
    getContext$: () => of({recipeEndpoint: 'http://recipe', geoIdEndpoint})
}))

const {WORKER} = await import('#sepal/worker/factory')
const {loadGeoIdFeature$} = await import('#sepal/ee/geoIdFeature')
const {toGeometry$} = await import('#sepal/ee/aoi')
const {job} = await import('#gee/jobs/job')
const {default: configureJob} = await import('#gee/jobs/configure')

// Jobs like any other in this module: they resolve GeoIDs and know nothing about operations.
const lookupJob = job({
    jobName: 'test look up GeoIDs',
    before: [],
    worker$: ({requestArgs: {geoIds}}) => forkJoin(geoIds.map(geoId => loadGeoIdFeature$(geoId)))
})

const aoiJob = job({
    jobName: 'test resolve an area of interest',
    before: [],
    worker$: ({requestArgs: {aoi}}) => toGeometry$(aoi)
})

beforeAll(async () => {
    server = http.createServer((request, response) => {
        const entry = {geoId: request.url.split('/').pop(), abandoned: false}
        requests.push(entry)
        response.on('close', () => entry.abandoned = !response.writableFinished)
        respond(entry.geoId, response)
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    geoIdEndpoint = `http://127.0.0.1:${server.address().port}/geoid`
})

afterAll(() => new Promise(resolve => server.close(resolve)))

beforeEach(() => {
    requests = []
    respond = (geoId, response) => feature(response, geoId, POLYGON)
})

describe('within one operation', () => {
    test('a GeoID looked up repeatedly is requested once, from the configured endpoint', async () => {
        const operation = await start()

        const [first, second] = await operation.lookUp([GEOID, GEOID])

        expect(first).toEqual({id: GEOID, geometry: POLYGON})
        expect(second).toBe(first)
        expect(requestedIds()).toEqual([GEOID])
    })

    test('different GeoIDs are requested separately', async () => {
        const operation = await start()

        await operation.lookUp([GEOID, OTHER_GEOID])

        expect(requestedIds().sort()).toEqual([GEOID, OTHER_GEOID].sort())
    })

    test('a failed lookup is not retained, so a later one asks again', async () => {
        respond = (_geoId, response) => notFound(response)
        const operation = await start()
        await expect(operation.lookUp([GEOID])).rejects.toMatchObject({errorCode: 'GEOID_NOT_FOUND'})

        respond = (geoId, response) => feature(response, geoId, POLYGON)
        const [found] = await operation.lookUp([GEOID])

        expect(found.geometry).toEqual(POLYGON)
        expect(requestedIds()).toEqual([GEOID, GEOID])
    })

    test.each([
        ['a GeoID that is not canonical', {type: 'GEOID', id: GEOID.toUpperCase()}, /canonical GeoID/],
        ['a negative buffer', {type: 'GEOID', id: GEOID, bufferMeters: -1}, /whole number of metres/],
        ['a fractional buffer', {type: 'GEOID', id: GEOID, bufferMeters: 250.5}, /whole number of metres/],
        ['a buffer beyond the safe integers', {type: 'GEOID', id: GEOID, bufferMeters: Number.MAX_SAFE_INTEGER + 1}, /whole number of metres/]
    ])('%s is refused without a lookup', async (_case, aoi, message) => {
        const operation = await start()

        await expect(operation.resolve(aoi)).rejects.toThrow(message)
        expect(requests).toEqual([])
    })

    // Only the service knows whether the GeoID is a point, and a point needs a buffer of at least 10 m.
    test('a buffer the GeoID\'s geometry does not accept is refused once the geometry is known', async () => {
        respond = (geoId, response) => feature(response, geoId, POINT)
        const operation = await start()

        await expect(operation.resolve({type: 'GEOID', id: GEOID, bufferMeters: 0})).rejects.toMatchObject({
            errorCode: 'GEOID_INVALID_BUFFER',
            userMessage: {key: 'gee.geoId.error.invalidBuffer', args: {geoId: GEOID, geometryType: 'Point', min: 10}}
        })
        expect(requestedIds()).toEqual([GEOID])
    })
})

describe('across operations', () => {
    test('a later operation requests the GeoID again', async () => {
        const first = await start()
        await first.lookUp([GEOID])
        await first.end()

        const second = await start()
        await second.lookUp([GEOID])

        expect(requestedIds()).toEqual([GEOID, GEOID])
    })
})

describe('ending an operation', () => {
    test('aborts a lookup still in flight', async () => {
        respond = () => null
        const operation = await start()
        operation.lookUp([GEOID]).catch(() => null)
        await until(() => requests.length === 1)

        await operation.end()

        await until(() => requests[0].abandoned)
    })

    test('refuses further lookups', async () => {
        const operation = await start()
        await operation.end()

        await expect(operation.lookUp([GEOID])).rejects.toThrow(/Operation ended/)
        expect(requests).toEqual([])
    })
})

test('a lookup outside any operation is refused', async () => {
    const [{worker$}] = lookupJob(WORKER)

    await expect(firstValueFrom(worker$({requestArgs: {geoIds: [GEOID]}, state: {}})))
        .rejects.toThrow(/No execution operation in progress/)
    expect(requests).toEqual([])
})

const requestedIds = () => requests.map(({geoId}) => geoId)

// The tasks of one request, run the way the worker runs them: one state, shared by all of them.
const start = async () => {
    const state = {}
    const [configure] = configureJob(WORKER)
    const [lookUp] = lookupJob(WORKER)
    const [resolve] = aoiJob(WORKER)
    await firstValueFrom(
        configure.worker$({credentials: {sepalUser: {username: 'alice'}}, state}).pipe(defaultIfEmpty(null))
    )
    return {
        lookUp: geoIds => firstValueFrom(lookUp.worker$({requestArgs: {geoIds}, state})),
        resolve: aoi => firstValueFrom(resolve.worker$({requestArgs: {aoi}, state})),
        end: () => firstValueFrom((configure.finalize$ ?? (() => EMPTY))({state}).pipe(defaultIfEmpty(null)))
    }
}

const feature = (response, geoId, geometry) => {
    response.writeHead(200, {'Content-Type': 'application/geo+json'})
    response.end(JSON.stringify({type: 'Feature', id: geoId, geometry}))
}

const notFound = response => {
    response.writeHead(404, {'Content-Type': 'application/json'})
    response.end(JSON.stringify({code: 404, message: 'place not found'}))
}

const until = async (condition, timeout = 2000) => {
    const deadline = Date.now() + timeout
    while (!condition()) {
        if (Date.now() > deadline) {
            throw new Error('Condition not reached')
        }
        await new Promise(resolve => setTimeout(resolve, 10))
    }
}
