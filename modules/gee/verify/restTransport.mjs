// The REST transport against live Earth Engine: the client library, initialized once as the service account,
// only builds, and EERestClient sends every request as the context it is made in.
//
// As the service account: a computed value, a map whose first tile is served, an asset read, the SEPAL
// project's root listing, the operations listing, and a refused request's message. With EE_USER_ACCESS_TOKEN
// and EE_USER_PROJECT set, the computed value again as that user. Read-only.
//
//   docker exec -w /usr/local/src/sepal/modules/gee gee node verify/restTransport.mjs

import {lastValueFrom, toArray} from 'rxjs'

import {googleProjectId} from '#gee/config'
import {eeLimiter$} from '#gee/jobs/service/eeLimiter'
import {serviceAccountToken$} from '#gee/jobs/service/serviceAccountToken'
import ee from '#sepal/ee/ee'
import {DEFAULT_EE_ENDPOINT, inEEContext} from '#sepal/ee/eeContext'
import {EERestClient} from '#sepal/ee/rest/eeRestClient'
import {EERestRuntime} from '#sepal/ee/restRuntime'
import {delete$, get$, postJson$} from '#sepal/httpClient'

const SERVICE_ACCOUNT = {
    requestId: 'verify-rest-transport',
    username: 'verify',
    auth: {type: 'serviceAccount'},
    projectId: googleProjectId,
    workloadTag: 'sepal-work-verify',
    endpoint: DEFAULT_EE_ENDPOINT
}

const results = []

const check = async (name, run) => {
    try {
        results.push({name, ok: true, detail: await run()})
    } catch (error) {
        results.push({name, ok: false, detail: error.message})
    }
}

const as = async (context, call$) => {
    const values = await lastValueFrom(inEEContext(context, call$).pipe(toArray()))
    return values[values.length - 1]
}

const main = async () => {
    const client = new EERestClient({ee, http: {get$, postJson$, delete$}, limiter$: eeLimiter$, serviceAccountToken$})
    const runtime = new EERestRuntime({
        ee,
        serviceAccountToken$,
        projectId: googleProjectId,
        createTransport: () => client
    })
    await lastValueFrom(runtime.ready$(), {defaultValue: null})

    await check('computes a value', async () => {
        const value = await as(SERVICE_ACCOUNT, ee.getInfo$(ee.Number(1).add(1), 'one plus one'))
        if (value !== 2) {
            throw new Error(`expected 2, got ${value}`)
        }
        return value
    })

    await check('creates a map whose first tile is served', async () => {
        const {urlTemplate} = await as(SERVICE_ACCOUNT, ee.getMap$(ee.Image('USGS/SRTMGL1_003'), {bands: ['elevation'], min: 0, max: 3000}, 'elevation'))
        const tile = urlTemplate.replace('{z}', '0').replace('{x}', '0').replace('{y}', '0')
        const {statusCode} = await lastValueFrom(get$(tile, {responseType: 'arrayBuffer'}))
        return `${tile} → ${statusCode}`
    })

    await check('reads an asset', async () => {
        const {type} = await as(SERVICE_ACCOUNT, ee.getAsset$('USGS/SRTMGL1_003'))
        if (type !== 'Image') {
            throw new Error(`expected an Image, got ${type}`)
        }
        return type
    })

    await check('lists the SEPAL project root', async () =>
        `${(await as(SERVICE_ACCOUNT, client.listAssetsPage$(`projects/${googleProjectId}/assets`))).assets.length} assets`
    )

    await check('lists operations', async () =>
        `${(await as(SERVICE_ACCOUNT, ee.listOperations$())).length} operations`
    )

    await check('fails with what Earth Engine said', async () => {
        try {
            await as(SERVICE_ACCOUNT, ee.getInfo$(ee.Image('SEPAL/DOES_NOT_EXIST'), 'missing asset'))
        } catch (error) {
            if (!/not found/i.test(error.message)) {
                throw error
            }
            return error.message
        }
        throw new Error('expected Earth Engine to refuse a missing asset')
    })

    const {EE_USER_ACCESS_TOKEN: accessToken, EE_USER_PROJECT: projectId} = process.env
    if (accessToken && projectId) {
        const user = {...SERVICE_ACCOUNT, username: 'verify-user', auth: {type: 'user', accessToken, expiresAt: Date.now() + 60 * 60 * 1000}, projectId}
        await check('computes a value as the user', async () => as(user, ee.getInfo$(ee.Number(1).add(1), 'one plus one')))
    }

    results.forEach(({name, ok, detail}) => console.info(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`))
    if (results.some(({ok}) => !ok)) {
        throw new Error('REST transport verification failed')
    }
}

main().then(() => process.exit(0)).catch(error => {
    console.error(error)
    process.exit(1)
})
