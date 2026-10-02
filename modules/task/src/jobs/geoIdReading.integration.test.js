import {jest} from '@jest/globals'
import {createServer} from 'http'
import {defaultIfEmpty, EMPTY, firstValueFrom, forkJoin, of} from 'rxjs'

// What a task resolves a GeoID area of interest with, from its own configuration operation through to the
// request the GeoID reader issues: over real HTTP, against a server standing in for the GeoID service.

const GEOID = '40df4325-744f-8fae-8e46-049080be5554'
const POLYGON = {
    type: 'Polygon',
    coordinates: [[[147.38, -33.50], [147.39, -33.50], [147.39, -33.51], [147.38, -33.50]]]
}

const requests = []

let config, served

jest.unstable_mockModule('#task/jobs/service/context', () => ({
    contextService: {serviceName: 'ContextService', serviceHandler$: () => of({})},
    getCurrentContext$: () => of({config})
}))

const {WORKER} = await import('#sepal/worker/factory')
const {loadGeoIdFeature$} = await import('#sepal/ee/geoIdFeature')
const {toGeometry$} = await import('#sepal/ee/aoi')
const {job} = await import('#task/jobs/job')
const {default: configureJob} = await import('#task/jobs/configure')

// A job like any other in this module: it resolves GeoIDs and knows nothing about operations.
const lookupJob = job({
    jobName: 'test look up GeoIDs',
    worker$: ({geoIds}) => forkJoin(geoIds.map(geoId => loadGeoIdFeature$(geoId)))
})

const aoiJob = job({
    jobName: 'test resolve an area of interest',
    worker$: ({aoi}) => toGeometry$(aoi)
})

describe('a GeoID looked up by a configured task', () => {
    let geoIdService

    beforeAll(async () => {
        geoIdService = await startGeoIdService()
        config = {geoIdEndpoint: `http://127.0.0.1:${geoIdService.address().port}/geoid`}
    })

    afterAll(() => new Promise(resolve => geoIdService.close(resolve)))

    beforeEach(() => {
        requests.length = 0
        served = POLYGON
    })

    test('is requested once from the configured GeoID endpoint, however often the execution needs it', async () => {
        const execution = await startExecution()

        const [first, second] = await execution.lookUp([GEOID, GEOID])

        expect(first).toEqual({id: GEOID, geometry: POLYGON})
        expect(second).toBe(first)
        expect(requests).toEqual([`/geoid/${GEOID}`])
    })

    test('is requested again by the next execution', async () => {
        const first = await startExecution()
        await first.lookUp([GEOID])
        await first.end()

        const second = await startExecution()
        await second.lookUp([GEOID])

        expect(requests).toHaveLength(2)
    })

    // The descriptor an export resolves goes through the shared resolver, which asks this execution's reader.
    test('resolves a GeoID area of interest through the execution\'s reader, checking its buffer', async () => {
        served = {type: 'Point', coordinates: [147.38, -33.5]}
        const execution = await startExecution()

        await expect(execution.resolve({type: 'GEOID', id: GEOID, bufferMeters: 0}))
            .rejects.toMatchObject({errorCode: 'GEOID_INVALID_BUFFER'})
        expect(requests).toEqual([`/geoid/${GEOID}`])
    })

    // The tasks of one execution, run the way the worker runs them: one state, shared by all of them.
    const startExecution = async () => {
        const state = {}
        const [configure] = configureJob(WORKER)
        const [lookUp] = lookupJob(WORKER)
        const [resolve] = aoiJob(WORKER)
        await firstValueFrom(configure.worker$({state}).pipe(defaultIfEmpty(null)))
        return {
            lookUp: geoIds => firstValueFrom(lookUp.worker$({geoIds, state})),
            resolve: aoi => firstValueFrom(resolve.worker$({aoi, state})),
            end: () => firstValueFrom(
                (configure.finalize$ ?? (() => EMPTY))({state}).pipe(defaultIfEmpty(null))
            )
        }
    }
})

const startGeoIdService = () => new Promise(resolve => {
    const server = createServer((request, response) => {
        requests.push(request.url)
        response.writeHead(200, {'Content-Type': 'application/geo+json'})
        response.end(JSON.stringify({type: 'Feature', id: GEOID, geometry: served}))
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
})
