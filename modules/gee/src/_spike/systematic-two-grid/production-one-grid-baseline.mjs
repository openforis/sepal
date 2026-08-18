import ee from '#sepal/ee/ee'

import {stratifiedSystematicExactCandidates, selectSystematicLevels, systematicSelectionSummary} from '#sepal/ee/samplingDesign/systematicSampling'
import {resolveSamplingGridCrs} from '#sepal/recipe/samplingDesign/samplingGridCrs'

const SOURCE_ASSET = 'projects/fifth-bonbon-272108/assets/sudan-dynamic-world-2024'
const SOURCE_BAND = 'label'
const AOI_ASSET = 'users/wiell/SepalResources/gaul'
const AOI_KEY = 6
const ARRANGEMENT_CRS = resolveSamplingGridCrs('EPSG:6933')
const SCALE = 10
const ASSET_ROOT = 'projects/daniel-wiell/assets'
const MAX_TASK_RUNTIME_MS = 45 * 60 * 1000
const MAX_BATCH_EECU_SECONDS = 30000
const VISIBILITY_DELAYS_MS = [0, 500, 1000, 2000, 4000]
const ALLOCATION = [
    {stratum: 0, area: 5465664655.29412, sampleSize: 2857},
    {stratum: 1, area: 73237008483.52942, sampleSize: 9697},
    {stratum: 2, area: 1963761640.7843134, sampleSize: 1702},
    {stratum: 3, area: 1044592860.7843137, sampleSize: 1237},
    {stratum: 4, area: 263708404850.58826, sampleSize: 19840},
    {stratum: 5, area: 248695078157.25507, sampleSize: 19034},
    {stratum: 6, area: 3832430202.745098, sampleSize: 2394},
    {stratum: 7, area: 1245111270211.3682, sampleSize: 43221},
    {stratum: 8, area: 226218.82352941178, sampleSize: 18}
]

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

const callbackPromise = operation => new Promise((resolve, reject) =>
    operation((result, error) => error ? reject(error) : resolve(result))
)

const evaluate = value => new Promise((resolve, reject) =>
    value.evaluate((result, error) => error ? reject(error) : resolve(result))
)

const authenticate = async () => {
    if (process.stdin.isTTY) {
        throw new Error('Linked-user credential receiver must not be a TTY')
    }
    process.stderr.write('Credential receiver ready (stdinIsTTY=false)\n')
    const credentials = await readCredentialsFromStdin()
    if (!credentials.access_token || !credentials.project_id) {
        throw new Error('Linked-user access token or project id is missing')
    }
    if (Number(credentials.access_token_expiry_date) <= Date.now()) {
        throw new Error('Linked-user access token is expired')
    }
    ee.data.clearAuthToken()
    ee.data.setAuthTokenRefresher(null)
    ee.data.setAuthToken(null, 'Bearer', credentials.access_token, null, null, null, false)
    await new Promise((resolve, reject) =>
        ee.initialize(null, null, resolve, reject, null, credentials.project_id)
    )
    ee.setMaxRetries(0)
}

const isNotFound = error => /not found|does not exist|404/i.test(String(error))
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

const scenario = () => ({
    stratification: ee.Image(SOURCE_ASSET).select(SOURCE_BAND),
    region: ee.FeatureCollection(AOI_ASSET)
        .filter(ee.Filter.eq('id', AOI_KEY))
        .geometry(ee.ErrorMargin(1, 'meters'))
})

const candidates = () => {
    const {stratification, region} = scenario()
    return stratifiedSystematicExactCandidates({
        allocation: ALLOCATION,
        stratification,
        region,
        grid: {crs: ARRANGEMENT_CRS, scale: SCALE},
        sampleArrangement: {minDistance: 20, gridOrigin: 'SEEDED', seed: 2},
        densityOffset: 0
    })
}

const graphCharacteristics = collection => {
    const serialized = JSON.stringify(collection.serialize())
    const count = pattern => (serialized.match(pattern) || []).length
    return {
        serializedBytes: Buffer.byteLength(serialized),
        reduceToVectorsNodes: count(/Image\.reduceToVectors/g),
        reduceRegionsNodes: count(/Image\.reduceRegions/g),
        resampleNodes: count(/Image\.resample/g),
        focalMaxNodes: count(/Image\.focalMax/g),
        reduceResolutionNodes: count(/Image\.reduceResolution/g)
    }
}

const cleanupAsset = async assetId => {
    try {
        await callbackPromise(callback =>
            ee.data.deleteAsset(assetId, (result, error) => callback(result, error))
        )
    } catch (error) {
        if (!isNotFound(error)) {
            throw error
        }
    }
    const startedAt = Date.now()
    for (;;) {
        try {
            await callbackPromise(callback =>
                ee.data.getAsset(assetId, (asset, error) => callback(asset, error))
            )
        } catch (error) {
            if (isNotFound(error)) {
                return {assetId, absent: true, elapsedSeconds: (Date.now() - startedAt) / 1000}
            }
            throw error
        }
        if (Date.now() - startedAt > 120000) {
            throw new Error(`Temporary asset still exists after cleanup timeout: ${assetId}`)
        }
        await sleep(2000)
    }
}

const waitForVisibility = async assetId => {
    const startedAt = Date.now()
    const ledger = []
    for (const delay of VISIBILITY_DELAYS_MS) {
        await sleep(delay)
        try {
            await callbackPromise(callback =>
                ee.data.getAsset(assetId, (asset, error) => callback(asset, error))
            )
            ledger.push({elapsedSeconds: (Date.now() - startedAt) / 1000, state: 'VISIBLE'})
            return {elapsedSeconds: (Date.now() - startedAt) / 1000, ledger}
        } catch (error) {
            if (!isNotFound(error)) {
                throw error
            }
            ledger.push({elapsedSeconds: (Date.now() - startedAt) / 1000, state: 'NOT_FOUND'})
        }
    }
    throw new Error(`Asset did not become visible in the production retry window: ${assetId}`)
}

const validateReadyAsset = async assetId => {
    const collection = ee.FeatureCollection(assetId).map(feature => {
        const stratum = feature.getNumber('stratum').toInt()
        const i = feature.getNumber('i').toInt()
        const j = feature.getNumber('j').toInt()
        return feature.set('key', stratum.format('%d')
            .cat(':').cat(i.format('%d')).cat(':').cat(j.format('%d')))
    })
    const selection = selectSystematicLevels({samples: collection, allocation: ALLOCATION, strategy: 'CLOSEST'})
    const result = await evaluate(ee.Dictionary({
        total: collection.size(),
        distinctKeys: collection.aggregate_count_distinct('key'),
        perStratum: collection.aggregate_histogram('stratum'),
        selection: systematicSelectionSummary(selection)
    }))
    result.duplicates = result.total - result.distinctKeys
    if (result.duplicates !== 0) {
        throw new Error(`Production candidate asset has duplicate structural keys: ${JSON.stringify(result)}`)
    }
    return result
}

const start = async () => {
    await authenticate()
    const collection = candidates()
    const graph = graphCharacteristics(collection)
    const startedAt = Date.now()
    const assetId = `${ASSET_ROOT}/sd_systematic_production_baseline_${startedAt}`
    const task = ee.batch.Export.table.toAsset(
        collection,
        `sd-systematic-production-baseline-${startedAt}`,
        assetId
    )
    task.start()
    console.log(JSON.stringify({
        checkpoint: 'PRODUCTION_BASELINE_STARTED',
        taskId: task.id,
        assetId,
        startedAt,
        graph,
        attempt: 1
    }, null, 2))
}

const status = async () => {
    const taskId = process.env.SD_PRODUCTION_BASELINE_TASK_ID
    const assetId = process.env.SD_PRODUCTION_BASELINE_ASSET_ID
    const submittedAt = Number(process.env.SD_PRODUCTION_BASELINE_STARTED_AT)
    await authenticate()
    const statuses = await callbackPromise(callback =>
        ee.data.getTaskStatus(taskId, (result, error) => callback(result, error))
    )
    const task = statuses[0]
    const eecu = Number(task.batch_eecu_usage_seconds || 0)
    const runningMilliseconds = task.start_timestamp_ms
        ? Date.now() - Number(task.start_timestamp_ms)
        : 0
    let cancellation = null
    if (['READY', 'RUNNING'].includes(task.state)
        && (runningMilliseconds > MAX_TASK_RUNTIME_MS || eecu > MAX_BATCH_EECU_SECONDS)) {
        const reason = runningMilliseconds > MAX_TASK_RUNTIME_MS
            ? 'runtime exceeded 45 minutes'
            : 'batch EECU exceeded 30000 seconds'
        await callbackPromise(callback =>
            ee.data.cancelTask(taskId, (result, error) => callback(result, error))
        )
        cancellation = {requested: true, reason, requestedAt: Date.now()}
    }
    let visibility = null
    let validation = null
    let cleanup = null
    if (task.state === 'COMPLETED') {
        visibility = await waitForVisibility(assetId)
        validation = await validateReadyAsset(assetId)
        cleanup = await cleanupAsset(assetId)
    } else if (['FAILED', 'CANCELLED'].includes(task.state)) {
        cleanup = await cleanupAsset(assetId)
    }
    console.log(JSON.stringify({
        checkpoint: 'PRODUCTION_BASELINE_STATUS',
        taskId,
        assetId,
        submittedElapsedSeconds: (Date.now() - submittedAt) / 1000,
        runningSeconds: runningMilliseconds / 1000,
        eecu,
        task,
        cancellation,
        visibility,
        validation,
        cleanup,
        attempt: task.attempt
    }, null, 2))
}

const verifyAsset = async () => {
    const assetId = process.env.SD_VERIFY_ASSET_ID
    await authenticate()
    try {
        const asset = await callbackPromise(callback =>
            ee.data.getAsset(assetId, (result, error) => callback(result, error))
        )
        console.log(JSON.stringify({assetId, exists: true, type: asset.type}, null, 2))
    } catch (error) {
        if (!isNotFound(error)) {
            throw error
        }
        console.log(JSON.stringify({assetId, exists: false}, null, 2))
    }
}

if (process.env.SD_PRODUCTION_BASELINE_EXPORT === '1') {
    await start()
} else if (process.env.SD_PRODUCTION_BASELINE_TASK_ID) {
    await status()
} else if (process.env.SD_VERIFY_ASSET_ID) {
    await verifyAsset()
} else {
    throw new Error('Set SD_PRODUCTION_BASELINE_EXPORT=1 or task status variables')
}
