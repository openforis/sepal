import {jest} from '@jest/globals'
import {firstValueFrom, of, throwError} from 'rxjs'

import ee from '#sepal/ee/ee'
import {DEFAULT_EE_ENDPOINT, inEEContext} from '#sepal/ee/eeContext'
import {EERestClient} from '#sepal/ee/rest/eeRestClient'

jest.unstable_mockModule('#gee/jobs/job', () => ({job: config => config}))

const {default: metadata} = await import('#gee/jobs/ee/asset/metadata')
const {default: versions} = await import('#gee/jobs/ee/asset/versions')

beforeEach(() => {
    // The GEE runtime no longer registers the legacy limiter or permits library credentials.
    jest.spyOn(ee, '$').mockImplementation(() => throwError(() => new Error('Legacy transport unavailable')))
})

afterEach(() => jest.restoreAllMocks())

test('metadata and version reads use the requesting users and preserve ranks and version tokens', async () => {
    const asset = 'users/test/segments'
    const record = {
        name: 'projects/earthengine-legacy/assets/users/test/segments',
        type: 'IMAGE',
        updateTime: '2026-10-07T00:00:00.123456Z',
        properties: {},
        bands: [{id: 'VV_coefs', dataType: {precision: 'DOUBLE', dimensionsCount: 2}, grid: {crsCode: 'EPSG:4326'}}]
    }
    const requests = []
    const limited = []
    ee.setTransport(new EERestClient({
        ee,
        http: {get$: (url, {headers}) => {
            requests.push({url, headers})
            return of({statusCode: 200, body: record})
        }},
        limiter$: (source$, _id, user) => {
            limited.push(user)
            return source$
        },
        serviceAccountToken$: () => throwError(() => new Error('Must use request credentials')),
        recordRequest: () => {}
    }))

    const [description, tokens] = await Promise.all([
        firstValueFrom(inEEContext(context('alice'), metadata.worker$({requestArgs: {asset}}))),
        firstValueFrom(inEEContext(context('bob'), versions.worker$({requestArgs: {ids: [asset]}})))
    ])

    expect(description.bandNames).toEqual(['VV_coefs'])
    expect(description.bands[0].data_type.dimensions).toBe(2)
    expect(tokens.assets).toEqual([{id: asset, type: 'IMAGE', version: record.updateTime}])
    expect(requests).toEqual(['alice', 'bob'].map(username => ({
        url: `${DEFAULT_EE_ENDPOINT}/v1/${record.name}`,
        headers: {'Authorization': `Bearer ${username}-token`, 'x-goog-user-project': `${username}-project`}
    })))
    expect(limited).toEqual(['alice', 'bob'].map(username => ({username, projectId: `${username}-project`})))
})

const context = username => ({
    requestId: username,
    username,
    auth: {type: 'user', accessToken: `${username}-token`, expiresAt: Date.now() + 60000},
    projectId: `${username}-project`,
    workloadTag: 'sepal-work-asset-test',
    endpoint: DEFAULT_EE_ENDPOINT
})
