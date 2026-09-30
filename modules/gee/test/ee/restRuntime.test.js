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

    expect(token.fetches).toBe(1)
    expect(requests.map(({headers}) => headers.Authorization)).toEqual(['Bearer service-account-token'])
    expect(await firstValueFrom(ee.getInfo$(ee.Image('image'), 'probe'))).toBe('sent by the installed transport')
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

    expect(requests[0].headers.Authorization).toBeUndefined()
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

    await expect(firstValueFrom(runtime.ready$())).rejects.toThrow('token service unavailable')
    await firstValueFrom(runtime.ready$(), {defaultValue: null})

    expect(attempts).toBe(2)
})

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
