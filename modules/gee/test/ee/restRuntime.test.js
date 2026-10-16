import assert from 'node:assert/strict'
import {test} from 'node:test'

import {firstValueFrom, of, throwError} from 'rxjs'

import ee from '#sepal/ee/ee'
import {EERestRuntime} from '#sepal/ee/restRuntime'

import {algorithmsAnswer, answerLibrary, API, TEST_PROJECT} from '../support/eeOffline.js'

// Earth Engine in a thread that serves many users: initialized once, as the service account, after which the
// library only builds and the installed transport sends.

test('initializes Earth Engine once, as the service account, and then sends through the installed transport', async () => {
    const requests = answerLibrary(algorithmsAnswer())
    const token = countingToken()
    const runtime = new EERestRuntime({
        ee,
        serviceAccountToken$: token.token$,
        projectId: TEST_PROJECT,
        createTransport: () => ({getInfo$: () => of('sent by the installed transport')})
    })

    await Promise.all([firstValueFrom(runtime.ready$()), firstValueFrom(runtime.ready$())])

    assert.equal(token.fetches, 1)
    assert.deepEqual(
        requests.map(({headers}) => headers.Authorization),
        ['Bearer service-account-token']
    )
    assert.equal(
        await firstValueFrom(ee.getInfo$(ee.Image('image'), 'probe')),
        'sent by the installed transport'
    )
})

test('after initialization the library itself sends nothing with credentials', async () => {
    const runtime = new EERestRuntime({
        ee,
        serviceAccountToken$: countingToken().token$,
        projectId: TEST_PROJECT,
        createTransport: () => ({})
    })
    answerLibrary(algorithmsAnswer())
    await firstValueFrom(runtime.ready$())

    const requests = answerLibrary({[`${API}/v1/projects/${TEST_PROJECT}/value:compute`]: {result: 1}})
    await new Promise(resolve => ee.data.computeValue(ee.Image('image'), resolve))

    assert.equal(requests[0].headers.Authorization, undefined)
})

test('a failed initialization is attempted again by the next request', async () => {
    let attempts = 0
    const runtime = new EERestRuntime({
        ee,
        serviceAccountToken$: () => ++attempts === 1
            ? throwError(() => new Error('token service unavailable'))
            : of({accessToken: 'service-account-token'}),
        projectId: TEST_PROJECT,
        createTransport: () => ({})
    })
    answerLibrary(algorithmsAnswer())

    await assert.rejects(firstValueFrom(runtime.ready$()), /token service unavailable/)
    await firstValueFrom(runtime.ready$(), {defaultValue: null})

    assert.equal(attempts, 2)
})

test('an initialization that never completes is abandoned after its timeout, and the next request initializes again', async () => {
    const library = libraryWhoseFirstInitializationHangs()
    const runtime = new EERestRuntime({
        ee: library,
        serviceAccountToken$: countingToken().token$,
        projectId: TEST_PROJECT,
        createTransport: () => 'installed transport',
        initializationTimeoutMs: 10
    })

    await assert.rejects(
        firstValueFrom(runtime.ready$()),
        /Earth Engine initialization did not complete within 10 ms/
    )
    await firstValueFrom(runtime.ready$(), {defaultValue: null})

    assert.equal(library.transport, 'installed transport')
})

// Like the client library, an initialization requested while one is in progress waits for that one, until reset.
const libraryWhoseFirstInitializationHangs = () => {
    let initializing = false
    let initializations = 0
    const library = {
        transport: null,
        data: {
            setAuthToken: () => {},
            clearAuthToken: () => {},
            setAuthTokenRefresher: () => {},
            setParamAugmenter: () => {}
        },
        initialize: (_baseUrl, _tileUrl, success) => {
            if (initializing) {
                return
            }
            initializing = true
            if (++initializations > 1) {
                initializing = false
                success()
            }
        },
        reset: () => {
            initializing = false
        },
        setTransport: transport => {
            library.transport = transport
        }
    }
    return library
}

const countingToken = () => {
    const token = {
        fetches: 0,
        token$: () => {
            token.fetches++
            return of({accessToken: 'service-account-token'})
        }
    }
    return token
}
