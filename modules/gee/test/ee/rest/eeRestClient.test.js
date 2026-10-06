import {firstValueFrom, lastValueFrom, Observable, of, throwError, toArray} from 'rxjs'

import ee from '#sepal/ee/ee'
import {DEFAULT_EE_ENDPOINT, inEEContext} from '#sepal/ee/eeContext'
import {EERestClient, exponentialBackoff} from '#sepal/ee/rest/eeRestClient'
import {ERROR_CODES} from '#sepal/exception'

import {initializeOfflineEE, TEST_PROJECT} from '../../support/eeOffline.js'

beforeAll(() => initializeOfflineEE())

describe('who a call is made as', () => {
    test('a user with a Google account calls as themselves, in their own project', async () => {
        const {client, http} = setup()

        await call(alice(), client.getInfo$(ee.Image('image'), 'probe'))

        expect(http.calls).toEqual([expect.objectContaining({
            method: 'POST',
            url: `${DEFAULT_EE_ENDPOINT}/v1/projects/alice-project/value:compute`,
            headers: {'Authorization': 'Bearer alice-token', 'x-goog-user-project': 'alice-project'}
        })])
    })

    test('a user without a Google account calls as the service account, in the SEPAL project', async () => {
        const {client, http} = setup()

        await call(bobWithoutGoogleAccount(), client.getInfo$(ee.Image('image'), 'probe'))

        expect(http.calls).toEqual([expect.objectContaining({
            url: `${DEFAULT_EE_ENDPOINT}/v1/projects/${TEST_PROJECT}/value:compute`,
            headers: {'Authorization': 'Bearer service-account-token', 'x-goog-user-project': TEST_PROJECT}
        })])
    })

    test('a call made outside any request is refused, and nothing is sent', async () => {
        const {client, http} = setup()

        await expect(firstValueFrom(client.getInfo$(ee.Image('image'), 'probe'))).rejects.toThrow('No Earth Engine context')
        expect(http.calls).toEqual([])
    })

    test('each call passes the limiter as its user, project and origin', async () => {
        const {client, limited} = setup()

        await call(alice(), client.getInfo$(ee.Image('image'), 'probe'))

        expect(limited).toEqual([{username: 'alice', projectId: 'alice-project', origin: 'interactive'}])
    })
})

describe('what a call answers', () => {
    test('a computed value', async () => {
        const {client} = setup({answers: [ok({result: 42})]})

        expect(await call(alice(), client.getInfo$(ee.Image('image'), 'probe'))).toEqual([42])
    })

    test('a map, with the template its tiles are fetched from', async () => {
        const {client} = setup({answers: [ok({name: 'projects/alice-project/maps/m1'})]})
        const visParams = {bands: ['elevation'], min: 0, max: 3000}

        const [map] = await call(alice(), client.getMap$(ee.Image('image'), visParams, 'preview'))

        expect(map).toEqual({
            mapId: 'projects/alice-project/maps/m1',
            token: '',
            urlTemplate: `${DEFAULT_EE_ENDPOINT}/v1/projects/alice-project/maps/m1/tiles/{z}/{x}/{y}`,
            visParams
        })
    })

    test('an asset, in the shape the library gives it', async () => {
        const name = 'projects/alice-project/assets/image'
        const {client} = setup({answers: [ok({name, id: name, type: 'IMAGE', properties: {a: 1}})]})

        const [asset] = await call(alice(), client.getAsset$(name))

        expect(asset).toMatchObject({type: 'Image', id: name, properties: {a: 1}})
    })

    test('every page of operations', async () => {
        const first = {name: 'projects/alice-project/operations/T1', done: true}
        const second = {name: 'projects/alice-project/operations/T2', done: true}
        const {client, http} = setup({answers: [ok({operations: [first], nextPageToken: 'page-2'}), ok({operations: [second]})]})

        const [operations] = await call(alice(), client.listOperations$())

        expect(operations).toEqual([first, second])
        expect(http.calls[1].query).toEqual({pageSize: 500, pageToken: 'page-2'})
    })

    test('the id of an export it starts', async () => {
        const task = ee.batch.Export.table.toDrive(ee.FeatureCollection('projects/alice-project/assets/table'), 'd', 'f', 'p', 'CSV')
        const {client} = setup({answers: [ok({name: 'projects/alice-project/operations/T9', metadata: {}})]})

        expect(await call(alice(), client.startTableExport$(task, 'start export'))).toEqual(['T9'])
    })

    test('nothing, for a folder that exists already', async () => {
        const {client, http} = setup({answers: [failure(400, {message: 'Cannot overwrite asset'})]})

        const values = await call(alice(), client.ensureAssetFolder$('projects/alice-project/assets', 'folder'))

        expect(values).toEqual([])
        expect(http.calls).toEqual([expect.objectContaining({
            url: `${DEFAULT_EE_ENDPOINT}/v1/projects/alice-project/assets`,
            query: {assetId: 'folder'},
            body: {type: 'FOLDER'}
        })])
    })

    test('an error for what only the library transport does', async () => {
        const {client} = setup()

        await expect(call(alice(), client.setAssetProperties$('projects/alice-project/assets/image', {}))).rejects.toThrow('not supported')
    })
})

describe('failures', () => {
    test('a call Earth Engine refuses as over quota is retried', async () => {
        const {client, http, delays} = setup({answers: [failure(429, {message: 'Too many requests'}), ok({result: 42})]})

        expect(await call(alice(), client.getInfo$(ee.Image('image'), 'probe'))).toEqual([42])
        expect(http.calls).toHaveLength(2)
        expect(delays).toEqual([1])
    })

    test('a call refused as over quota is retried on a budget of its own, whatever retries the call allows', async () => {
        const tooManyRequests = failure(429, {message: 'Too many requests'})
        const {client, delays} = setup({answers: [tooManyRequests, tooManyRequests, ok({result: 42})]})

        expect(await call(alice(), client.getInfo$(ee.Image('image'), 'probe', 0))).toEqual([42])
        expect(delays).toEqual([1, 2])
    })

    test('a call still refused as over quota after ten retries fails', async () => {
        const {client, http} = setup({answers: Array(11).fill(failure(429, {message: 'Too many requests'}))})

        await expect(call(alice(), client.getInfo$(ee.Image('image'), 'probe', 0))).rejects.toThrow('Too many requests')
        expect(http.calls).toHaveLength(11)
    })

    test('a call that allows no retries is not retried when Earth Engine is unavailable', async () => {
        const {client, http} = setup({answers: [failure(503, {}), ok({result: 42})]})

        await expect(call(alice(), client.getInfo$(ee.Image('image'), 'probe', 0))).rejects.toThrow('Failed to probe')
        expect(http.calls).toHaveLength(1)
    })

    test('a retry waits twice as long as the one before, up to 30 seconds', () => {
        const withoutJitter = exponentialBackoff(() => 0.5)

        expect([1, 2, 3, 7, 10].map(withoutJitter)).toEqual([500, 1000, 2000, 30000, 30000])
    })

    test('a request Earth Engine rejects is not retried, and fails with what Earth Engine said', async () => {
        const {client, http} = setup({answers: [failure(400, {message: 'Image.load: Image asset \'image\' not found.'})]})

        await expect(call(alice(), client.getInfo$(ee.Image('image'), 'probe')))
            .rejects.toThrow('Failed to probe: Image.load: Image asset \'image\' not found.')
        expect(http.calls).toHaveLength(1)
    })

    test('a call is given up after its retries', async () => {
        const {client, http, delays} = setup({answers: [failure(503, {}), failure(503, {}), failure(503, {})]})

        await expect(call(alice(), client.getInfo$(ee.Image('image'), 'probe', 2))).rejects.toThrow('Failed to probe')
        expect(http.calls).toHaveLength(3)
        expect(delays).toEqual([1, 2])
    })

    test('an expired user token is a missing Google account, reported as a client error rather than a lost SEPAL session, and is not retried', async () => {
        const {client, http} = setup({answers: [failure(401, {message: 'Request had invalid authentication credentials.'})]})

        await expect(call(alice(), client.getInfo$(ee.Image('image'), 'probe'))).rejects.toMatchObject({
            errorCode: ERROR_CODES.MISSING_GOOGLE_TOKENS,
            statusCode: 400,
            userMessage: {
                message: 'Earth Engine: Request had invalid authentication credentials.',
                key: 'gee.error.earthEngineException',
                args: {earthEngineMessage: 'Request had invalid authentication credentials.'}
            }
        })
        expect(http.calls).toHaveLength(1)
    })

    test('a service-account token that cannot be obtained is retried, then fails saying so', async () => {
        const {client, http, delays} = setup({
            serviceAccountToken$: () => throwError(() => new Error('invalid_grant: Invalid JWT Signature.'))
        })

        await expect(call(bobWithoutGoogleAccount(), client.getInfo$(ee.Image('image'), 'probe', 1)))
            .rejects.toThrow('Failed to probe: Could not obtain the service-account access token: invalid_grant: Invalid JWT Signature.')
        expect(delays).toEqual([1])
        expect(http.calls).toEqual([])
    })

    test('abandoning a call aborts its request', () => {
        const {client, http} = setup({answers: [unanswered()]})

        inEEContext(alice(), client.getInfo$(ee.Image('image'), 'probe')).subscribe().unsubscribe()

        expect(http.calls[0].aborted).toBe(true)
    })
})

describe('what is counted', () => {
    test('every request sent, as who it was made as and the class of its answer', async () => {
        const {client, recorded} = setup({answers: [failure(429, {message: 'Too many requests'}), ok({result: 42})]})

        await call(alice(), client.getInfo$(ee.Image('image'), 'probe'))
        await call(bobWithoutGoogleAccount(), client.getInfo$(ee.Image('image'), 'probe'))

        expect(recorded).toEqual([
            {auth: 'user', status: '429'},
            {auth: 'user', status: '2xx'},
            {auth: 'serviceAccount', status: '2xx'}
        ])
    })

    test('a request that cannot be counted still answers', async () => {
        const {client} = setup({
            answers: [ok({result: 42})],
            recordRequest: () => {
                throw new Error('metrics unavailable')
            }
        })

        expect(await call(alice(), client.getInfo$(ee.Image('image'), 'probe'))).toEqual([42])
    })
})

const alice = () => ({
    requestId: 'request-1',
    username: 'alice',
    origin: 'interactive',
    auth: {type: 'user', accessToken: 'alice-token', expiresAt: Date.now() + 60 * 60 * 1000},
    projectId: 'alice-project',
    workloadTag: 'sepal-work-test',
    endpoint: DEFAULT_EE_ENDPOINT
})

const bobWithoutGoogleAccount = () => ({
    ...alice(),
    username: 'bob',
    auth: {type: 'serviceAccount'},
    projectId: TEST_PROJECT
})

const setup = ({answers = [], recordRequest, serviceAccountToken$ = () => of({accessToken: 'service-account-token'})} = {}) => {
    const http = fakeHttp(answers)
    const limited = []
    const delays = []
    const recorded = []
    const client = new EERestClient({
        ee,
        http,
        limiter$: (observable$, _id, request) => {
            limited.push(request)
            return observable$
        },
        serviceAccountToken$,
        recordRequest: recordRequest ?? (outcome => recorded.push(outcome)),
        delay$: retryCount => {
            delays.push(retryCount)
            return of(0)
        }
    })
    return {client, http, limited, delays, recorded}
}

const fakeHttp = answers => {
    const calls = []
    const respond = method => (url, {headers, query, body} = {}) => new Observable(subscriber => {
        const request = {method, url, headers, query, body}
        calls.push(request)
        const answer = answers.shift() ?? ok({})
        // "settled" marks that the answer resolved (error or complete) before teardown, distinguishing
        // that from a subscriber torn down while the request was still in flight.
        const subscription = answer().subscribe({
            next: value => subscriber.next(value),
            error: error => {
                request.settled = true
                subscriber.error(error)
            },
            complete: () => {
                request.settled = true
                subscriber.complete()
            }
        })
        return () => {
            request.aborted = !request.settled
            subscription.unsubscribe()
        }
    })
    return {calls, get$: respond('GET'), postJson$: respond('POST'), delete$: respond('DELETE')}
}

const ok = body => () => of({statusCode: 200, body})

const failure = (statusCode, error) => () =>
    throwError(() => Object.assign(new Error(`HTTP ${statusCode}`), {statusCode, body: JSON.stringify({error})}))

const unanswered = () => () => new Observable(() => {})

const call = (context, call$) => lastValueFrom(inEEContext(context, call$).pipe(toArray()))
