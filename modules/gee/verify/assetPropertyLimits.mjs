// What Earth Engine actually persists as asset metadata, per write path.
//
// SEPAL filters string properties over the measured limit before calling setAssetProperties
// (lib/js/ee/src/extensions/utils.js, isValidPropertyString; 1024 bytes until this script established
// 16,384). It measures the server's own behaviour with that filter bypassed, and separately measures the
// filtered path, so application filtering and server limits can be told apart.
//
// Not a test. Nothing runs it automatically; it needs Earth Engine credentials and writes assets.
// See README.md. Modes are selected with EE_PROPS_MODE; main() lists them.

import crypto from 'crypto'
import {firstValueFrom} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import ee from '#sepal/ee/ee'

import {failure, failureKind} from './eeFailures.mjs'
import {cleanupScratch, createDeletionGuard, isTerminal, runMode} from './probeRun.mjs'

const NAMESPACE = process.env.EE_PROPS_NAMESPACE || 'sepal_property_limits'
const RUN_ID = process.env.EE_PROPS_RUN || 'run1'

// A fixed 2x2 pixel footprint on an explicit grid. Nothing here depends on the imagery, only on the
// metadata, so the export must be as close to free as an export gets.
const CRS = 'EPSG:4326'
const PIXEL = 0.01
const ORIGIN_X = 0
const ORIGIN_Y = 0.02
const CRS_TRANSFORM = [PIXEL, 0, ORIGIN_X, 0, -PIXEL, ORIGIN_Y]
// A client-side geometry: Export rejects a computed one.
const REGION = () => ee.Geometry({
    type: 'Polygon',
    coordinates: [[[0, 0], [0.02, 0], [0.02, 0.02], [0, 0.02], [0, 0]]]
}, CRS, false)

const MAX_TASKS = Number(process.env.EE_PROPS_MAX_TASKS || 12)
const MAX_PAYLOAD_BYTES = Number(process.env.EE_PROPS_MAX_PAYLOAD || 8 * 1024 * 1024)
const TASK_POLL_MS = 3000
const TASK_TIMEOUT_MS = Number(process.env.EE_PROPS_TASK_TIMEOUT_MS || 15 * 60 * 1000)
const CANCEL_CONFIRM_MS = Number(process.env.EE_PROPS_CANCEL_CONFIRM_MS || 2 * 60 * 1000)

const CONTROL_PROPERTIES = {control_string: 'control', control_number: 42}

const assert = (condition, message) => {
    if (!condition) {
        throw new Error(message)
    }
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

const callbackPromise = operation => new Promise((resolve, reject) => {
    operation((result, error) => error ? reject(error) : resolve(result))
})

const bytes = value => Buffer.byteLength(String(value), 'utf8')

const digest = value => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').slice(0, 16)

// Lengths and a hash, never the string itself - a 100 kB property in a transcript helps nobody.
const describeValue = value => typeof value === 'string'
    ? {type: 'string', bytes: bytes(value), characters: value.length, codePoints: [...value].length, sha256: digest(value)}
    : {type: typeof value, value}

const deletionGuard = createDeletionGuard({runId: RUN_ID, data: ee.data})

const main = async () => {
    const mode = process.env.EE_PROPS_MODE || 'plan'
    const modes = {
        plan: {run: plan, offline: true},
        seed: {run: seed, createsFixtures: true},
        'image-direct': {run: imageDirect},
        'collection-direct': {run: collectionDirect, createsFixtures: true},
        'collection-sepal': {run: collectionSepal, createsFixtures: true},
        'image-export': {run: imageExport, createsFixtures: true},
        'table-export': {run: tableExport, createsFixtures: true},
        inspect: {run: inspect},
        cleanup: {run: cleanup}
    }
    const result = await runMode({modes, mode, authenticate, provisionStorage: () => ensureFolder(scratchFolder())})
    console.log(JSON.stringify({mode, runId: RUN_ID, ...result}, null, 2))
}

// Every case is applied, read back through a fresh request, and compared key by key. Acceptance of a
// write proves nothing; only the readback does.

const plan = async () => ({
    status: 'PLAN',
    namespace: NAMESPACE,
    budgets: {maxTasks: MAX_TASKS, maxPayloadBytes: MAX_PAYLOAD_BYTES, taskTimeoutMs: TASK_TIMEOUT_MS},
    cases: {
        valueSize: valueSizes(),
        propertyCount: propertyCounts(),
        aggregate: aggregates(),
        nonAscii: nonAsciiCases().map(({name, characters, unit}) => ({name, characters, unit}))
    }
})

const seed = async () => {
    const assetId = scratchId('image')
    const existing = await visibleAsset(assetId)
    if (existing) {
        return {status: 'EXISTS', assetId, properties: Object.keys(existing.properties || {})}
    }
    const outcome = await runImageExport({assetId, properties: {seeded: 'true'}, description: `${scratchName('image')}`})
    return {status: outcome.taskState, assetId, task: outcome}
}

const imageDirect = async () => {
    const assetId = scratchId('image')
    assert(await visibleAsset(assetId), `Seed the scratch image first: EE_PROPS_MODE=seed (${assetId})`)
    // The scratch image is an export destination. Rewriting its properties while the task that seeded it is
    // still running would measure that race rather than the write path.
    const permission = await deletionGuard()
    assert(permission.allowed, `Refusing to rewrite ${assetId}: ${permission.reason} (${JSON.stringify(permission.tasks)})`)
    return await sweep({
        writePath: 'image:setAssetProperties',
        apply: properties => setAssetPropertiesRaw(assetId, properties),
        read: () => getAssetProperties(assetId),
        reset: () => clearProperties(assetId)
    })
}

const collectionDirect = async () => {
    const assetId = scratchId('collection')
    await ensureImageCollection(assetId)
    return await sweep({
        writePath: 'imageCollection:setAssetProperties',
        apply: properties => setAssetPropertiesRaw(assetId, properties),
        read: () => getAssetProperties(assetId),
        reset: () => clearProperties(assetId)
    })
}

// The same payloads through production's own writer, so the difference between the two sweeps is
// exactly what SEPAL's filter removes.
const collectionSepal = async () => {
    const assetId = scratchId('collection_sepal')
    await ensureImageCollection(assetId)
    return await sweep({
        writePath: 'imageCollection:sepal.replaceAssetProperties$',
        apply: properties => firstValueFrom(ee.replaceAssetProperties$(assetId, properties, 0)),
        read: () => getAssetProperties(assetId),
        reset: () => clearProperties(assetId)
    })
}

// Each case gets its own asset: a batch export cannot reset metadata in place, and a reused asset
// would let an earlier case's leftovers pass as a later case's success.
const imageExport = async () => {
    const cases = selectedCases()
    assert(cases.length <= MAX_TASKS, `${cases.length} cases exceeds the task budget of ${MAX_TASKS}`)
    const results = []
    for (const [index, testCase] of cases.entries()) {
        const properties = testCase.properties()
        const assetId = scratchId(`export_${testCase.name}_${index}`)
        const payloadBytes = bytes(JSON.stringify(properties))
        if (payloadBytes > MAX_PAYLOAD_BYTES) {
            results.push({case: testCase.name, status: 'SKIPPED_OVER_BUDGET', payloadBytes})
            continue
        }
        const destination = await prepareDestination(assetId)
        if (destination.status === 'SKIPPED_DESTINATION_UNSAFE') {
            results.push({case: testCase.name, assetId, ...destination})
            continue
        }
        const result = await measureExport({
            testCase, assetId, properties, payloadBytes,
            run: () => runImageExport({assetId, properties, description: scratchName(`export_${index}_${Date.now()}`)}),
            read: () => getAssetProperties(assetId)
        })
        results.push({...result, destination})
        console.error(`[${index + 1}/${cases.length}] ${testCase.name}: ${result.task?.taskState || result.status}`)
    }
    return {status: 'DONE', writePath: 'image:export(image.set)', results}
}

const tableExport = async () => {
    const cases = selectedCases()
    assert(cases.length <= MAX_TASKS, `${cases.length} cases exceeds the task budget of ${MAX_TASKS}`)
    const results = []
    for (const [index, testCase] of cases.entries()) {
        const properties = testCase.properties()
        const assetId = scratchId(`table_${testCase.name}_${index}`)
        const payloadBytes = bytes(JSON.stringify(properties))
        if (payloadBytes > MAX_PAYLOAD_BYTES) {
            results.push({case: testCase.name, status: 'SKIPPED_OVER_BUDGET', payloadBytes})
            continue
        }
        const destination = await prepareDestination(assetId)
        if (destination.status === 'SKIPPED_DESTINATION_UNSAFE') {
            results.push({case: testCase.name, assetId, ...destination})
            continue
        }
        const result = await measureExport({
            testCase, assetId, properties, payloadBytes,
            run: () => runTableExport({assetId, properties, description: scratchName(`table_${index}_${Date.now()}`)}),
            read: () => getFirstFeatureProperties(assetId)
        })
        results.push({...result, destination})
        console.error(`[${index + 1}/${cases.length}] ${testCase.name}: ${result.task?.taskState || result.status}`)
    }
    return {status: 'DONE', writePath: 'table:export(feature properties)', results}
}

const inspect = async () => {
    const assetId = process.env.EE_PROPS_ASSET
    assert(assetId, 'EE_PROPS_ASSET is required')
    const properties = await getAssetProperties(assetId)
    return {
        assetId,
        propertyCount: Object.keys(properties).length,
        aggregateBytes: aggregateBytes(properties),
        properties: Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, describeValue(value)]))
    }
}

const cleanup = async () => {
    const parent = scratchFolder()
    return {parent, ...await cleanupScratch({parent, guard: deletionGuard, listAssets, deleteAsset, owns: ownedByThisRun})}
}

// Cases. One dimension varies at a time: the probe's size, the number of properties, or the total
// across properties that are each individually small.

const selectedCases = () => {
    const spec = process.env.EE_PROPS_CASES
    const all = allCases()
    if (!spec) {
        return all
    }
    const wanted = spec.split(',').map(name => name.trim()).filter(Boolean)
    return wanted.map(name => {
        const found = all.find(testCase => testCase.name === name)
        assert(found, `Unknown case '${name}'. Known: ${all.map(({name}) => name).join(', ')}`)
        return found
    })
}

const allCases = () => [
    ...valueSizes().map(size => ({
        name: `value_${size}`,
        properties: () => ({...CONTROL_PROPERTIES, probe: 'A'.repeat(size)})
    })),
    ...nonAsciiCases().map(({name, characters, character}) => ({
        name,
        properties: () => ({...CONTROL_PROPERTIES, probe: character.repeat(characters)})
    })),
    ...propertyCounts().map(count => ({
        name: `count_${count}`,
        properties: () => ({...CONTROL_PROPERTIES, ...manyProperties(count, 8)})
    })),
    ...aggregates().map(({count, size}) => ({
        name: `aggregate_${count}x${size}`,
        properties: () => ({...CONTROL_PROPERTIES, ...manyProperties(count, size)})
    }))
]

// 1023/1024/1025 bracket SEPAL's own filter; 1465 is a 31-band Landsat encoding; 4282 is the string
// already persisted on projects/daniel-wiell/assets/band_scale/masked_optical; 100000/100001 bracket
// the character count Google documents for table exports.
const valueSizes = () => parseNumbers(process.env.EE_PROPS_VALUE_SIZES)
    || [512, 1023, 1024, 1025, 1465, 4282, 16384, 65536, 100000, 100001]

const propertyCounts = () => parseNumbers(process.env.EE_PROPS_COUNTS)
    || [10, 100, 999, 1000, 1001, 1024, 1025, 2000]

const aggregates = () => parseAggregates(process.env.EE_PROPS_AGGREGATES)
    || [{count: 100, size: 1000}, {count: 500, size: 1000}, {count: 1000, size: 1000}]

// Two-byte and four-byte characters straddling a byte budget an ASCII sweep has already placed, so a
// limit counted in characters and one counted in UTF-8 bytes cannot produce the same answer.
const BYTE_BUDGET = Number(process.env.EE_PROPS_BYTE_BUDGET || 16384)

const nonAsciiCases = () => [
    {name: 'nonascii_2byte_at', characters: BYTE_BUDGET / 2, character: '\u00e9', unit: '2 bytes/char'},
    {name: 'nonascii_2byte_over', characters: BYTE_BUDGET / 2 + 1, character: '\u00e9', unit: '2 bytes/char'},
    {name: 'nonascii_4byte_at', characters: BYTE_BUDGET / 4, character: '\ud834\udd1e', unit: '4 bytes/char'},
    {name: 'nonascii_4byte_over', characters: BYTE_BUDGET / 4 + 1, character: '\ud834\udd1e', unit: '4 bytes/char'}
].map(testCase => ({...testCase, characters: Math.floor(testCase.characters)}))

const manyProperties = (count, size) => Object.fromEntries(
    Array.from({length: count}, (_, index) => [`p${String(index).padStart(5, '0')}`, 'v'.repeat(size)])
)

// Applying, reading back and classifying one sweep over a write path that can reset in place.

const sweep = async ({writePath, apply, read, reset}) => {
    const results = []
    for (const testCase of selectedCases()) {
        const properties = testCase.properties()
        const payloadBytes = bytes(JSON.stringify(properties))
        if (payloadBytes > MAX_PAYLOAD_BYTES) {
            results.push({case: testCase.name, status: 'SKIPPED_OVER_BUDGET', payloadBytes})
            continue
        }
        await reset()
        let submission = {phase: 'SUBMIT', status: 'OK'}
        try {
            await apply(properties)
        } catch (error) {
            submission = {phase: 'SUBMIT', status: 'REJECTED', error: String(error?.message || error)}
        }
        let persisted = null
        let readback = {phase: 'READBACK', status: 'OK'}
        try {
            persisted = await read()
        } catch (error) {
            readback = {phase: 'READBACK', status: 'FAILED', error: String(error?.message || error)}
        }
        results.push({
            case: testCase.name,
            payloadBytes,
            expected: summarizeExpected(properties),
            submission,
            readback,
            comparison: persisted ? compare(properties, persisted) : null
        })
        console.error(`${testCase.name}: submit=${submission.status} ${persisted ? summarizeComparison(compare(properties, persisted)) : readback.status}`)
    }
    return {status: 'DONE', writePath, results}
}

const summarizeExpected = properties => ({
    propertyCount: Object.keys(properties).length,
    aggregateBytes: aggregateBytes(properties),
    probe: properties.probe === undefined ? undefined : describeValue(properties.probe)
})

const compare = (expected, persisted) => {
    const findings = {exact: [], truncated: [], altered: [], missing: []}
    for (const [key, value] of Object.entries(expected)) {
        const actual = persisted[key]
        if (actual === undefined || actual === null) {
            findings.missing.push(key)
        } else if (String(actual) === String(value)) {
            findings.exact.push(key)
        } else if (typeof value === 'string' && typeof actual === 'string' && value.startsWith(actual)) {
            findings.truncated.push({key, expected: describeValue(value), actual: describeValue(actual)})
        } else {
            findings.altered.push({key, expected: describeValue(value), actual: describeValue(actual)})
        }
    }
    const unexpected = Object.keys(persisted).filter(key =>
        !key.startsWith('system:') && expected[key] === undefined
    )
    return {
        expectedCount: Object.keys(expected).length,
        persistedCount: Object.keys(persisted).length,
        persistedAggregateBytes: aggregateBytes(persisted),
        exact: findings.exact.length,
        exactKeys: findings.exact.length <= 10 ? findings.exact : undefined,
        truncated: findings.truncated,
        altered: findings.altered,
        missing: findings.missing.length <= 10 ? findings.missing : {count: findings.missing.length, sample: findings.missing.slice(0, 5)},
        unexpected
    }
}

const summarizeComparison = ({exact, truncated, altered, missing}) =>
    `exact=${exact} truncated=${truncated.length} altered=${altered.length} missing=${Array.isArray(missing) ? missing.length : missing.count}`

const aggregateBytes = properties => Object.entries(properties)
    .filter(([key]) => !key.startsWith('system:'))
    .reduce((total, [key, value]) => total + bytes(key) + bytes(typeof value === 'string' ? value : JSON.stringify(value)), 0)

// Earth Engine calls.

// Production starts tasks through startProcessing with a callback (modules/task/src/ee/task.js). The
// synchronous task.start() takes a different route in Node - xmlhttprequest spawns a child process and
// passes the body in argv, which dies with E2BIG past ~128 kB. That ceiling is the harness's, not Earth
// Engine's, so the harness must start tasks the way production does.
const startTask = async task => {
    const result = await callbackPromise(callback =>
        ee.data.startProcessing(null, task.config_, (result, error) => callback(result, error))
    )
    return result.taskId
}

// A case that crashes the client - image.set() with thousands of keys overflows its own recursion - must
// still leave the cases already measured in the report.
const measureExport = async ({testCase, assetId, properties, payloadBytes, run, read}) => {
    const base = {case: testCase.name, assetId, payloadBytes, expected: summarizeExpected(properties)}
    let task
    try {
        task = await run()
    } catch (error) {
        return {...base, status: 'CLIENT_CRASHED', error: String(error?.stack || error).split('\n').slice(0, 3).join(' | ')}
    }
    if (task.cancellation === 'UNCONFIRMED') {
        return {...base, task, status: 'CANCELLATION_UNRESOLVED', destinationLeftInPlace: assetId}
    }
    if (task.taskState !== 'COMPLETED') {
        return {...base, task, comparison: {phase: task.phase, reason: task.error}}
    }
    try {
        return {...base, task, comparison: compare(properties, await read())}
    } catch (error) {
        return {...base, task, comparison: {phase: 'READBACK', reason: String(error?.message || error)}}
    }
}

const runImageExport = async ({assetId, properties, description}) => {
    const startedAt = Date.now()
    let task
    let taskId
    let serializedBytes = null
    try {
        const image = ee.Image(1).toByte().rename('b1').set(properties)
        serializedBytes = bytes(image.serialize())
        task = ee.batch.Export.image.toAsset({
            image,
            description,
            assetId,
            region: REGION(),
            crs: CRS,
            crsTransform: CRS_TRANSFORM,
            maxPixels: 1e6
        })
        taskId = await startTask(task)
    } catch (error) {
        return {phase: 'SUBMIT', taskState: 'SUBMIT_FAILED', serializedBytes, error: String(error?.message || error)}
    }
    const {state, error, cancellation} = await waitForTask(taskId)
    return {phase: 'TASK', taskId, taskState: state, serializedBytes, error, cancellation, elapsedSeconds: (Date.now() - startedAt) / 1000}
}

const runTableExport = async ({assetId, properties, description}) => {
    const startedAt = Date.now()
    let task
    let taskId
    let serializedBytes = null
    try {
        const collection = ee.FeatureCollection([ee.Feature(ee.Geometry.Point([0.01, 0.01]), properties)])
        serializedBytes = bytes(collection.serialize())
        task = ee.batch.Export.table.toAsset(collection, description, assetId)
        taskId = await startTask(task)
    } catch (error) {
        return {phase: 'SUBMIT', taskState: 'SUBMIT_FAILED', serializedBytes, error: String(error?.message || error)}
    }
    const {state, error, cancellation} = await waitForTask(taskId)
    return {phase: 'TASK', taskId, taskState: state, serializedBytes, error, cancellation, elapsedSeconds: (Date.now() - startedAt) / 1000}
}

const taskState = async taskId => {
    const [status] = await callbackPromise(callback =>
        ee.data.getTaskStatus(taskId, (result, error) => callback(result, error))
    )
    return status
}

const waitForTask = async taskId => {
    const startedAt = Date.now()
    for (;;) {
        const status = await taskState(taskId)
        if (isTerminal(status.state)) {
            return {state: status.state, error: status.error_message}
        }
        if (Date.now() - startedAt > TASK_TIMEOUT_MS) {
            return await cancelAndConfirm(taskId)
        }
        await sleep(TASK_POLL_MS)
    }
}

// A cancellation request is not a cancellation: until the task reports a terminal state it may still be
// writing to its destination. Reported as unresolved rather than as cancelled, and the destination is left
// alone, because deleting an asset a live task is writing to measures nothing and loses the evidence.
const cancelAndConfirm = async taskId => {
    const requestedAfter = `No terminal state within ${TASK_TIMEOUT_MS} ms`
    try {
        await callbackPromise(callback => ee.data.cancelTask(taskId, (result, error) => callback(result, error)))
    } catch (error) {
        return {
            state: 'CANCELLATION_REQUEST_FAILED',
            cancellation: 'UNCONFIRMED',
            error: `${requestedAfter}; cancellation request failed: ${error?.message || error}`
        }
    }
    const confirmBy = Date.now() + CANCEL_CONFIRM_MS
    for (;;) {
        const status = await taskState(taskId)
        if (isTerminal(status.state)) {
            return {
                state: status.state,
                cancellation: 'CONFIRMED',
                error: status.error_message || `${requestedAfter}; cancelled`
            }
        }
        if (Date.now() >= confirmBy) {
            return {
                state: 'CANCELLATION_UNCONFIRMED',
                cancellation: 'UNCONFIRMED',
                error: `${requestedAfter}; still ${status.state} ${CANCEL_CONFIRM_MS} ms after cancellation was requested`
            }
        }
        await sleep(TASK_POLL_MS)
    }
}

const setAssetPropertiesRaw = (assetId, properties) => callbackPromise(callback =>
    ee.data.setAssetProperties(assetId, properties, (result, error) => callback(result, error))
)

const getAssetProperties = async assetId => {
    const asset = await callbackPromise(callback => ee.data.getAsset(assetId, (result, error) => callback(result, error)))
    return asset.properties || {}
}

const getFirstFeatureProperties = async assetId =>
    await callbackPromise(callback => ee.FeatureCollection(assetId).first().toDictionary().evaluate((r, e) => callback(r, e)))

// Null means Earth Engine did not show it, which is not the same as its not being there. Only a creation
// attempt may follow that, and creating cannot overwrite.
const visibleAsset = async assetId => {
    try {
        return await callbackPromise(callback => ee.data.getAsset(assetId, (result, error) => callback(result, error)))
    } catch (error) {
        const kind = failureKind(error)
        if (kind === 'NOT_VISIBLE') {
            return null
        }
        throw new Error(`Cannot tell whether ${assetId} exists (${kind}): ${error?.message || error}`, {cause: error})
    }
}

// Every page: a namespace with more assets than one page holds would otherwise look tidy while assets remain.
const listAssets = async parent => {
    const assets = []
    let pageToken
    do {
        let page
        try {
            page = await callbackPromise(callback =>
                ee.data.listAssets(parent, pageToken ? {pageToken} : {}, (result, error) => callback(result, error))
            )
        } catch (error) {
            return {...failure(error), parent, listed: assets.length}
        }
        const values = page?.Serializable$values || page || {}
        const listed = values.assets || []
        assets.push(...listed.map(asset => {
            const {id, name, type} = asset?.Serializable$values || asset
            return {id: name || id, type}
        }))
        pageToken = values.nextPageToken
    } while (pageToken)
    return {status: 'OK', assets}
}

// Only a delete Earth Engine accepted is a deletion. A refusal is carried as it was classified, with what Earth
// Engine said: NOT_VISIBLE is not evidence that the asset is gone.
const deleteAsset = async assetId => {
    try {
        await callbackPromise(callback => ee.data.deleteAsset(assetId, (result, error) => callback(result, error)))
        return {status: 'DELETED'}
    } catch (error) {
        return failure(error)
    }
}

const ownedByThisRun = id =>
    String(id).includes(`/${NAMESPACE}/`) && String(id).split('/').pop().startsWith(`${RUN_ID}_`)

const clearProperties = async assetId => {
    const properties = await getAssetProperties(assetId)
    const keys = Object.keys(properties).filter(key => !key.startsWith('system:'))
    if (!keys.length) {
        return
    }
    await setAssetPropertiesRaw(assetId, Object.fromEntries(keys.map(key => [key, null])))
    const remaining = Object.keys(await getAssetProperties(assetId)).filter(key => !key.startsWith('system:'))
    assert(!remaining.length, `Reset left ${remaining.length} properties on ${assetId}; cases would contaminate each other`)
}

const ensureImageCollection = async assetId => {
    if (await visibleAsset(assetId)) {
        return
    }
    await callbackPromise(callback =>
        ee.data.createAsset({type: 'ImageCollection'}, assetId, false, null, (result, error) => callback(result, error))
    )
}

// A case exports into a destination the previous run of this case may have left behind. Removing it is the same
// decision cleanup makes - this run's asset, and only once Earth Engine says no task of this run may still be
// writing to it. DELETED and NOT_VISIBLE both let the export proceed, because an export cannot overwrite an
// existing asset; they are told apart in the report, because only one of them removed anything.
const prepareDestination = async assetId => {
    assert(ownedByThisRun(assetId), `Refusing to delete an asset this run does not own: ${assetId}`)
    const permission = await deletionGuard()
    if (!permission.allowed) {
        return {status: 'SKIPPED_DESTINATION_UNSAFE', reason: permission.reason, tasks: permission.tasks}
    }
    const removal = await deleteAsset(assetId)
    if (!['DELETED', 'NOT_VISIBLE'].includes(removal.status)) {
        return {status: 'SKIPPED_DESTINATION_UNSAFE', reason: `cannot clear ${assetId} (${removal.status}): ${removal.error}`}
    }
    return removal
}

const scratchFolder = () => `projects/${ee.data.getProject()}/assets/${NAMESPACE}`

const scratchName = suffix => `${RUN_ID}_${suffix}`

const scratchId = suffix => `${scratchFolder()}/${scratchName(suffix)}`

const parseNumbers = spec => spec
    ? spec.split(',').map(value => Number(value.trim())).filter(value => Number.isFinite(value))
    : null

const parseAggregates = spec => spec
    ? spec.split(',').map(pair => {
        const [count, size] = pair.trim().split('x').map(Number)
        return {count, size}
    })
    : null

// Credentials arrive on stdin as one line of JSON, never as an argument or an environment variable.
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
    if (process.env.EE_PROPS_SERVICE_ACCOUNT === '1') {
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
    await callbackPromise(callback =>
        ee.initialize(null, null, callback, error => callback(null, error), null, projectId)
    )
    ee.setMaxRetries(0)
}

// A folder is created only because a fixture is about to be written into it.
const ensureFolder = async folderId => {
    if (await visibleAsset(folderId)) {
        return
    }
    await callbackPromise(callback =>
        ee.data.createFolder(folderId, false, (result, error) => callback(result, error))
    )
}

main().catch(error => {
    console.error(error?.stack || String(error))
    process.exit(1)
})
