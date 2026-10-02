import http from 'node:http'

import {firstValueFrom} from 'rxjs'

import {GEOID_ERROR_CODES, HttpGeoIdAdapter} from '#sepal/geoId/httpGeoIdAdapter'

const GEOID = '40df4325-744f-8fae-8e46-049080be5554'
const POLYGON = {
    type: 'Polygon',
    coordinates: [[[147.38, -33.50], [147.39, -33.50], [147.39, -33.51], [147.38, -33.50]]]
}
const TIMEOUT = 300
const RETRY_DELAY = 100

let server, endpoint, host, requests, handle

beforeAll(async () => {
    server = http.createServer((request, response) => {
        const entry = {url: request.url, abandoned: false}
        requests.push(entry)
        response.on('close', () => entry.abandoned = !response.writableFinished)
        handle(request, response, requests.length)
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    host = `127.0.0.1:${server.address().port}`
    endpoint = `http://${host}/geoid`
})

afterAll(() => new Promise(resolve => server.close(resolve)))

beforeEach(() => {
    requests = []
    handle = (_request, response) => json(response, 200, feature(POLYGON))
})

describe('a GeoID the service resolves', () => {
    it('answers its id and geometry, ignoring the other members of the feature', async () => {
        await expect(resolve()).resolves.toEqual({id: GEOID, geometry: POLYGON})
        expect(requests.map(({url}) => url)).toEqual([`/geoid/${GEOID}`])
    })

    it('is requested under the configured path, with or without a trailing slash', async () => {
        await resolve({endpoint: `${endpoint}/`})

        expect(requests.map(({url}) => url)).toEqual([`/geoid/${GEOID}`])
    })
})

describe('a GeoID the service does not know', () => {
    it('fails as not registered, naming the GeoID and the service, without retrying', async () => {
        handle = (_request, response) => json(response, 404, {code: 404, message: `place not found: ${GEOID}`})

        await expect(resolve()).rejects.toMatchObject({
            errorCode: GEOID_ERROR_CODES.NOT_FOUND,
            statusCode: 404,
            userMessage: {key: 'gee.geoId.error.notFound', args: {geoId: GEOID, host}}
        })
        expect(requests).toHaveLength(1)
    })
})

describe('a request the service refuses', () => {
    it.each([400, 401, 403, 422])('fails as rejected on HTTP %s without retrying', async status => {
        handle = (_request, response) => json(response, status, {detail: 'refused'})

        await expect(resolve()).rejects.toMatchObject({
            errorCode: GEOID_ERROR_CODES.REJECTED,
            userMessage: {key: 'gee.geoId.error.rejected', args: {geoId: GEOID, host, status}}
        })
        expect(requests).toHaveLength(1)
    })

    it('fails as rate-limited on HTTP 429 without retrying', async () => {
        handle = (_request, response) => json(response, 429, {})

        await expect(resolve()).rejects.toMatchObject({errorCode: GEOID_ERROR_CODES.RATE_LIMITED})
        expect(requests).toHaveLength(1)
    })
})

describe('a service error', () => {
    it('is retried once, and the retry may succeed', async () => {
        handle = (_request, response, attempt) => attempt === 1
            ? json(response, 503, {})
            : json(response, 200, feature(POLYGON))

        await expect(resolve()).resolves.toEqual({id: GEOID, geometry: POLYGON})
        expect(requests).toHaveLength(2)
    })

    it('fails with the service\'s status once the retry fails too', async () => {
        handle = (_request, response) => json(response, 503, {})

        await expect(resolve()).rejects.toMatchObject({
            errorCode: GEOID_ERROR_CODES.SERVICE_ERROR,
            statusCode: 502,
            userMessage: {key: 'gee.geoId.error.serviceError', args: {geoId: GEOID, host, status: 503}}
        })
        expect(requests).toHaveLength(2)
    })
})

describe('an unreachable service', () => {
    it('fails as unreachable when nothing listens', async () => {
        const closed = await unusedEndpoint()

        await expect(resolve({endpoint: closed})).rejects.toMatchObject({
            errorCode: GEOID_ERROR_CODES.UNREACHABLE,
            userMessage: {key: 'gee.geoId.error.unreachable'}
        })
    })

    // The deadline covers the body, not only the headers: a response can start and then never finish.
    it('abandons a response whose body stalls, once per attempt, and fails as unreachable', async () => {
        handle = (_request, response) => {
            response.writeHead(200, {'Content-Type': 'application/geo+json'})
            response.write('{"type": "Feature", ')
        }

        const started = Date.now()
        await expect(resolve()).rejects.toMatchObject({errorCode: GEOID_ERROR_CODES.UNREACHABLE})

        expect(Date.now() - started).toBeLessThan(2 * TIMEOUT + RETRY_DELAY + 500)
        await until(() => requests.length === 2 && requests.every(({abandoned}) => abandoned))
    })
})

describe('an unusable response', () => {
    it.each([
        ['malformed JSON', response => text(response, 200, '{"type": "Feature", ')],
        ['an HTML page', response => text(response, 200, '<!doctype html><html></html>', 'text/html')],
        ['JSON that is not a feature', response => json(response, 200, [1, 2, 3])]
    ])('fails as unusable on %s without retrying', async (_case, respond) => {
        handle = (_request, response) => respond(response)

        await expect(resolve()).rejects.toMatchObject({
            errorCode: GEOID_ERROR_CODES.UNUSABLE_RESPONSE,
            userMessage: {key: 'gee.geoId.error.unusableResponse', args: {geoId: GEOID, host}}
        })
        expect(requests).toHaveLength(1)
    })

    it('stops reading a response larger than the limit, without retrying', async () => {
        handle = (_request, response) => {
            response.writeHead(200, {'Content-Type': 'application/geo+json'})
            response.write(' '.repeat(1024))
            response.write(' '.repeat(1024))
        }

        await expect(resolve({maxResponseBytes: 1500})).rejects.toMatchObject({
            errorCode: GEOID_ERROR_CODES.UNUSABLE_RESPONSE
        })
        expect(requests).toHaveLength(1)
        await until(() => requests[0].abandoned)
    })

    it('fails as an unusable geometry when the feature\'s geometry cannot be used', async () => {
        handle = (_request, response) => json(response, 200, feature({type: 'LineString', coordinates: [[0, 0], [1, 1]]}))

        await expect(resolve()).rejects.toMatchObject({
            errorCode: GEOID_ERROR_CODES.INVALID_GEOMETRY,
            userMessage: {key: 'gee.geoId.error.invalidGeometry', args: {geoId: GEOID, host}}
        })
        expect(requests).toHaveLength(1)
    })
})

describe('a subscriber leaving', () => {
    it('aborts the request in flight', async () => {
        handle = () => null
        const subscription = adapter().feature$(GEOID).subscribe({error: () => null})
        await until(() => requests.length === 1)

        subscription.unsubscribe()

        await until(() => requests[0].abandoned)
    })

    it('cancels a pending retry', async () => {
        handle = (_request, response) => json(response, 503, {})
        const subscription = adapter({retryDelay: 200}).feature$(GEOID).subscribe({error: () => null})
        await until(() => requests.length === 1)

        subscription.unsubscribe()
        await sleep(300)

        expect(requests).toHaveLength(1)
    })
})

const adapter = (options = {}) =>
    new HttpGeoIdAdapter({endpoint, timeout: TIMEOUT, retryDelay: RETRY_DELAY, ...options})

const resolve = options => firstValueFrom(adapter(options).feature$(GEOID))

const feature = geometry => ({
    type: 'Feature',
    id: GEOID,
    geometry,
    properties: {geoid: GEOID, uri: `${endpoint}/${GEOID}`},
    links: [{href: `${endpoint}/${GEOID}`, rel: 'self', type: 'application/geo+json'}]
})

const json = (response, status, body) =>
    text(response, status, JSON.stringify(body), status === 200 ? 'application/geo+json' : 'application/json')

const text = (response, status, body, contentType = 'application/json') => {
    response.writeHead(status, {'Content-Type': contentType})
    response.end(body)
}

const unusedEndpoint = async () => {
    const probe = http.createServer()
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
    const {port} = probe.address()
    await new Promise(resolve => probe.close(resolve))
    return `http://127.0.0.1:${port}/geoid`
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const until = async (condition, timeout = 2000) => {
    const deadline = Date.now() + timeout
    while (!condition()) {
        if (Date.now() > deadline) {
            throw new Error('Condition not reached')
        }
        await sleep(10)
    }
}
