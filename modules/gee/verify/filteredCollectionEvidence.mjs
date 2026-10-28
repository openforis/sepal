// Whether acquiring an Asset recipe's underlying-asset evidence survives a collection whose images do not all
// hold the first image's bands.
//
// An Asset recipe over a collection asks for two readings: its own configured image, and the asset itself. The
// asset reading goes through ee.mosaic (lib/js/ee/src/extensions/utils.js), which takes the FIRST image's band
// names and then selects them on EVERY image in the collection. Where a later image lacks one of those bands,
// that select is what may fail - even though the recipe filtered that image away and its own output is valid.
//
// Read-only: it builds an in-memory collection, evaluates, and writes nothing. No asset, no recipe, no task.
// Run with EE_FILTER_SERVICE_ACCOUNT=1, or feed linked-user credentials as one line of JSON on stdin.

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import {typedBands} from '#sepal/ee/bandEvidence'
import ee from '#sepal/ee/ee'

const callbackPromise = operation => new Promise((resolve, reject) => {
    operation((result, error) => error ? reject(error) : resolve(result))
})

const evaluate = value => callbackPromise(callback => value.evaluate((result, error) => callback(result, error)))

const attempt = async (name, value) => {
    try {
        return {probe: name, status: 'OK', value: await evaluate(value)}
    } catch (error) {
        return {probe: name, status: 'FAILED', error: String(error?.message || error)}
    }
}

const readCredentialsFromStdin = async () => {
    let input = ''
    for await (const chunk of process.stdin) {
        input += chunk
        if (input.includes('\n')) {
            process.stdin.pause()
            break
        }
    }
    return JSON.parse(input.trim())
}

const authenticate = async () => {
    let projectId = googleProjectId
    if (process.env.EE_FILTER_SERVICE_ACCOUNT === '1') {
        await callbackPromise(callback =>
            ee.data.authenticateViaPrivateKey(serviceAccountCredentials, callback, error => callback(null, error))
        )
    } else {
        if (process.stdin.isTTY) {
            throw new Error('Linked-user credential receiver must not be a TTY')
        }
        process.stderr.write('Credential receiver ready (stdinIsTTY=false)\n')
        const credentials = await readCredentialsFromStdin()
        if (!credentials.access_token || !credentials.project_id) {
            throw new Error('Linked-user authorization is incomplete')
        }
        if (Number(credentials.access_token_expiry_date) <= Date.now()) {
            throw new Error('Linked-user authorization is expired')
        }
        projectId = credentials.project_id
        ee.data.clearAuthToken()
        ee.data.setAuthTokenRefresher(null)
        ee.data.setAuthToken(null, 'Bearer', credentials.access_token, null, null, null, false)
    }
    await callbackPromise(callback => ee.initialize(null, null, callback, error => callback(null, error), null, projectId))
    ee.setMaxRetries(0)
}

const main = async () => {
    await authenticate()

    const region = ee.Geometry.Rectangle([0, 0, 0.01, 0.01])
    const dated = (image, date) => image.clip(region).set('system:time_start', ee.Date(date).millis())
    // The first image holds both bands; the one the recipe keeps holds only red.
    const first = dated(ee.Image.constant([1, 2]).rename(['red', 'nir']), '2020-01-01')
    const later = dated(ee.Image.constant([3]).rename(['red']), '2021-01-01')
    const collection = ee.ImageCollection([first, later])
    const filtered = collection.filterDate('2021-01-01', '2022-01-01')

    console.info(JSON.stringify({
        probes: [
            // What the recipe itself provides: the filtered collection is homogeneous.
            await attempt('filtered collection bands', typedBands(ee.mosaic(filtered))),
            // What the Asset provider additionally asks for: the unfiltered asset reading.
            await attempt('unfiltered collection bands', typedBands(ee.mosaic(collection))),
            // The step inside ee.mosaic that the mismatch would reach.
            await attempt('first image band names', collection.first().bandNames()),
            await attempt('select first image bands on every image', collection.select(['red', 'nir']).mosaic().bandNames()),
            // Whether the asset's own metadata can be read without evaluating any image's bands.
            await attempt('collection properties', collection.toDictionary())
        ]
    }, null, 2))
}

main().catch(error => {
    console.error(error?.stack || String(error))
    process.exit(1)
})
