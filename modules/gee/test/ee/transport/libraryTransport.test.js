import {firstValueFrom} from 'rxjs'

import ee from '#sepal/ee/ee'
import {LibraryTransport} from '#sepal/ee/transport/libraryTransport'

import {answerLibrary, API, initializeOfflineEE, TEST_PROJECT} from '../../support/eeOffline.js'

// The transport `task` keeps: requests sent by the client library, as whoever the library is authenticated as.

beforeAll(() => initializeOfflineEE())

test('computes a value through the client library, as the library is authenticated', async () => {
    const requests = answerLibrary({[`${API}/v1/projects/${TEST_PROJECT}/value:compute`]: {result: 42}})

    const result = await firstValueFrom(new LibraryTransport(ee).getInfo$(ee.Image('USGS/SRTMGL1_003'), 'probe'))

    expect(result).toBe(42)
    expect(requests[0].headers.Authorization).toBe('Bearer offline-token')
})

test('reads an export task\'s status as one status', async () => {
    answerLibrary({[`${API}/v1/projects/earthengine-legacy/operations/T1`]: {
        name: `projects/${TEST_PROJECT}/operations/T1`,
        done: false,
        metadata: {state: 'RUNNING', type: 'EXPORT_FEATURES', description: 'probe'}
    }})

    const status = await firstValueFrom(new LibraryTransport(ee).getTaskStatus$('T1', 'poll probe export task status'))

    expect(status).toMatchObject({id: 'T1', state: 'RUNNING'})
})
